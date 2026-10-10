/**
 * Whether a placement's hop 0 is on record, read from the database.
 *
 * A screen holds the line its reader sees — for a client, the rung it
 * pays — and hop 0 is at the bottom of the chain under it. This walks
 * down: the line, the buy line that funds it, the supplier's own line
 * below that, until it reaches the line that pays the person. The answer
 * is `hopZero` in `lib/award/hire-terms`, so the award, the terms page,
 * the contractor list and the program page cannot disagree about it.
 *
 * Batched per level, so a list of two hundred placements is a handful of
 * queries and not two hundred walks.
 */

import { prisma } from '@/lib/db'
import { hopZero, listingTerms, TERMS_PAPER, type HopZero, type ListingTerms } from './hire-terms'

type Db = Pick<typeof prisma, 'sellContract' | 'context' | 'submission' | 'benchListing'>

export interface TermsAnswer extends HopZero {
  /** The line that pays the person, where the walk reached one. */
  hopZeroSellId: string | null
  hopZeroBuyId: string | null
  /** The firm at hop 0 — the person's own firm in the chain. */
  firmCompanyId: string | null
}

const MAX_RUNGS = 8

const LINE = {
  id: true,
  companyId: true,
  personId: true,
  company: { select: { name: true } },
  person: { select: { name: true, consultant: { select: { ownCompanyId: true, ownCompany: { select: { id: true, name: true } } } } } },
  buyLinks: {
    select: {
      buyContract: {
        select: {
          id: true,
          vendorCompanyId: true,
          supplierSellContractId: true,
          candidates: { select: { personId: true, payRate: true } },
          docs: {
            where: { template: { name: TERMS_PAPER } },
            select: { signedAt: true, countersignedAt: true },
            orderBy: { id: 'desc' as const },
            take: 1,
          },
        },
      },
    },
  },
} as const

export async function termsOnRecordFor(sellIds: string[], db: Db = prisma): Promise<Map<string, TermsAnswer>> {
  const out = new Map<string, TermsAnswer>()
  const wanted = [...new Set(sellIds)]
  if (wanted.length === 0) return out

  /** Where each placement's walk is now: the line being read for it. */
  let at = new Map<string, string[]>() // line id → the placements waiting on it
  for (const id of wanted) at.set(id, [id])

  interface Reached {
    placementIds: string[]
    personId: string
    personName: string
    firmCompanyId: string
    firmName: string
    sellId: string
    buyId: string | null
    payRateCents: number | null
    paper: { firmSignedAt: Date | null; personSignedAt: Date | null } | null
    stoppedAbove: string | null
    ownCompany: { id: string; name: string } | null
    /** The firm below, where the walk stopped at a buy line to it. */
    belowCompanyId?: string | null
  }
  const reached: Reached[] = []

  for (let rung = 0; rung < MAX_RUNGS && at.size > 0; rung++) {
    const lines = await db.sellContract.findMany({ where: { id: { in: [...at.keys()] } }, select: LINE })
    const next = new Map<string, string[]>()
    for (const line of lines) {
      const placements = at.get(line.id) ?? []
      const ownCompanyId = line.person.consultant?.ownCompanyId ?? null
      const buys = line.buyLinks.map((l) => l.buyContract)
      const buy =
        buys.find((b) => b.candidates.some((c) => c.personId === line.personId)) ?? buys[0] ?? null
      const base = {
        placementIds: placements,
        personId: line.personId,
        personName: line.person.name,
        firmCompanyId: line.companyId,
        firmName: line.company.name,
        sellId: line.id,
        ownCompany: line.person.consultant?.ownCompany ?? null,
      }

      if (!buy) {
        reached.push({ ...base, buyId: null, payRateCents: null, paper: null, stoppedAbove: null })
        continue
      }
      const rate = buy.candidates.find((c) => c.personId === line.personId)?.payRate ?? buy.candidates[0]?.payRate ?? null
      const boughtFromAFirm = buy.vendorCompanyId !== null && buy.vendorCompanyId !== ownCompanyId
      if (boughtFromAFirm) {
        if (buy.supplierSellContractId) {
          const waiting = next.get(buy.supplierSellContractId) ?? []
          next.set(buy.supplierSellContractId, [...waiting, ...placements])
          continue
        }
        // The firm below has not been placed by this one yet: the chain
        // stops above the person.
        reached.push({
          ...base, buyId: buy.id, payRateCents: rate, paper: null,
          stoppedAbove: line.company.name, belowCompanyId: buy.vendorCompanyId,
        })
        continue
      }
      const doc = buy.docs[0] ?? null
      reached.push({
        ...base,
        buyId: buy.id,
        payRateCents: rate,
        paper: doc ? { firmSignedAt: doc.countersignedAt, personSignedAt: doc.signedAt } : null,
        stoppedAbove: null,
      })
    }
    at = next
  }

  // A buy line to a firm with no line of its own below it is one of two
  // things. The firm below put the person forward through Etyme and has
  // not been placed yet — the chain is still settling, and the person's
  // own terms are further down. Or the supplier is not on Etyme at all,
  // and the contract desk recorded what it pays them by hand: then the
  // rate on this line is everything the record will ever hold, and it is
  // on record. Told apart by whether the firm below has a submission of
  // this person still waiting on the firm above.
  const stopped = reached.filter((r) => r.stoppedAbove && r.belowCompanyId)
  if (stopped.length > 0) {
    const waiting = await db.submission.findMany({
      where: {
        status: { not: 'PLACED' },
        forwardedOn: { some: {} },
        OR: stopped.map((r) => ({ personId: r.personId, fromCompanyId: r.belowCompanyId! })),
      },
      select: { personId: true, fromCompanyId: true },
    })
    const settling = new Set(waiting.map((w) => `${w.personId}:${w.fromCompanyId}`))
    for (const r of stopped) {
      if (settling.has(`${r.personId}:${r.belowCompanyId}`)) continue
      r.stoppedAbove = null
      r.paper = null
    }
  }

  // Who the firm at hop 0 employs. The employment is the consent, so an
  // employee's terms need the firm's word and nothing more.
  const pairs = reached.filter((r) => r.paper && !r.paper.personSignedAt)
  const employed = new Set<string>()
  if (pairs.length > 0) {
    const ctx = await db.context.findMany({
      where: {
        type: 'EMPLOYEE',
        revokedAt: null,
        OR: pairs.map((p) => ({ personId: p.personId, companyId: p.firmCompanyId })),
      },
      select: { personId: true, companyId: true },
    })
    for (const c of ctx) employed.add(`${c.personId}:${c.companyId}`)
  }

  // Where hop 0 has no line at all, what the firm's bench listing says.
  // Terms stated there and not agreed are the person's move, not the
  // firm's; terms agreed there after the award still need the line
  // written. A listing never stands in for the line: payroll runs from a
  // line, so "on record" still needs one.
  const lineless = reached.filter((r) => !r.stoppedAbove && !r.buyId)
  const listed = new Map<string, ListingTerms>()
  if (lineless.length > 0) {
    const rows = await db.benchListing.findMany({
      where: {
        state: 'GRANTED',
        revokedAt: null,
        OR: lineless.map((r) => ({ companyId: r.firmCompanyId, consultant: { personId: r.personId } })),
      },
      select: {
        companyId: true, consultant: { select: { personId: true } },
        termsEngagementType: true, termsPayRateCents: true,
        termsStatedAt: true, termsStatedById: true, termsAgreedAt: true,
      },
    })
    for (const r of lineless) {
      const row = rows.find((x) => x.companyId === r.firmCompanyId && x.consultant.personId === r.personId)
      if (!row) continue
      listed.set(`${r.personId}:${r.firmCompanyId}`, listingTerms({
        engagementType: row.termsEngagementType,
        payRateCents: row.termsPayRateCents,
        statedAt: row.termsStatedAt,
        statedById: row.termsStatedById,
        agreedAt: row.termsAgreedAt,
        personName: r.personName,
        firmName: r.firmName,
        ownCompany: r.ownCompany,
      }))
    }
  }

  for (const r of reached) {
    const verdict = hopZero({
      listing: listed.get(`${r.personId}:${r.firmCompanyId}`) ?? null,
      personName: r.personName,
      firmName: r.firmName,
      line: r.buyId && !r.stoppedAbove ? { payRateCents: r.payRateCents } : null,
      stoppedAbove: r.stoppedAbove,
      paper: r.paper,
      employedByFirm: employed.has(`${r.personId}:${r.firmCompanyId}`),
    })
    for (const p of r.placementIds) {
      out.set(p, {
        ...verdict,
        hopZeroSellId: r.stoppedAbove ? null : r.sellId,
        hopZeroBuyId: r.stoppedAbove ? null : r.buyId,
        firmCompanyId: r.stoppedAbove ? null : r.firmCompanyId,
      })
    }
  }
  return out
}

/**
 * The gate activation should ask before a placement starts.
 *
 * BLOCK, not WARN: starting somebody on terms they never agreed is
 * starting them on no terms, and the pay line it would run payroll from
 * does not exist. Activation is money's route (`contracts/[id]/activate`)
 * and this is the one call it needs — the sentence is the refusal.
 */
export async function termsGate(sellId: string, db: Db = prisma): Promise<{ blocks: boolean; says: string | null }> {
  const t = (await termsOnRecordFor([sellId], db)).get(sellId)
  if (!t || t.onRecord) return { blocks: false, says: null }
  return {
    blocks: true,
    says: `${t.says} Nobody starts until the person and the firm that pays them have agreed how they are engaged and what they are paid.`,
  }
}
