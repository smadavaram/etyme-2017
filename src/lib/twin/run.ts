/**
 * One pass of the program manager's twin over one client program.
 *
 * The rules are regulatory's and money's; this only takes what they found
 * and puts each finding through `act`, so every finding is one ledger
 * entry and every act passes the role contract:
 *
 *   a person near or past the time limit   recorded, then the program
 *                                          owner told — each once per
 *                                          tier and limit day
 *   an invoice receipt                     its verdict recorded; a
 *                                          mismatch or a held receipt
 *                                          told to the paying desk; a
 *                                          clean receipt the three-way
 *                                          check would pay put to a
 *                                          person to approve
 *
 * Why a mismatched receipt is not put up for approval: approving one is
 * refused by money's own three-way check (lib/invoice-match), which the
 * tolerance does not loosen. Asking a person a question whose only
 * possible yes is refused would be a card nobody can act on, so a
 * mismatch is told to the desk that resolves it instead. Whether two per
 * cent should also clear payment is with the founder.
 *
 * The numbers are the company's `RuleSet` (lib/twin/rule-set); the time
 * limit and break stay its own governance rules.
 */

import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { tenureWarnings } from '@/lib/twin/rules/tenure'
import { pendingReceiptsFor } from '@/lib/twin/rules/invoice'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { act, type ActResult, type Authority, type Surface } from '@/lib/twin/ledger'
import { invoiceSupplierId } from '@/lib/twin/performers'

/** The role the twin acts in, by its name on a client's roles. */
export const PROGRAM_MANAGER_ROLE = 'Program Manager'

/**
 * The person whose seat the twin acts under. A desk nobody has named
 * falls back rather than refusing (CLAUDE.md, Addendum E): with no
 * Program Manager seated, the twin still records what it finds, on the
 * authority of the role and no person, and the notices that need a
 * person are refused in the ledger with the reason.
 */
export async function programManagerAt(companyId: string): Promise<Authority> {
  const seat = await prisma.context.findFirst({
    // Never the shared sample's seat, which holds the role to read as
    // the program manager does and acts on nobody's authority.
    where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, role: { name: PROGRAM_MANAGER_ROLE }, ...NOT_THE_SAMPLE_SEAT },
    orderBy: { id: 'asc' },
    select: { personId: true, person: { select: { name: true } } },
  })
  return seat
    ? { personId: seat.personId, role: PROGRAM_MANAGER_ROLE, personName: seat.person.name }
    : { personId: null, role: `${PROGRAM_MANAGER_ROLE} (nobody seated)`, personName: null }
}

/**
 * The roles the supplier's twin acts in, first seated wins: the firm's
 * Owner, else its Admin. Decided by the coordinator on 2026-10-18,
 * reversible by the founder in one line. Not Accounts Receivable's:
 * nobody signs their own, so the person the twin acts for may never say
 * yes to its questions, and the people who send bills — Accounts
 * Receivable, Finance, Admin — are exactly the ones who must be able to
 * say yes to `bill.send`. Acting on the owner's authority keeps every one
 * of them free to answer. A firm where only that person may send bills
 * (a one-person firm) is not asked at all: the ledger refuses the
 * question in a sentence that names the Bills page (NO_OTHER_APPROVER).
 * Falls back to the role and no person, the same way the program
 * manager's does, never to a refusal.
 */
export const SUPPLIER_TWIN_ROLES = ['Owner', 'Admin'] as const

/** The person whose seat the supplier's twin acts under. */
export async function supplierAuthorityAt(companyId: string): Promise<Authority> {
  for (const role of SUPPLIER_TWIN_ROLES) {
    const seat = await prisma.context.findFirst({
      where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, role: { name: role }, ...NOT_THE_SAMPLE_SEAT },
      orderBy: { id: 'asc' },
      select: { personId: true, person: { select: { name: true } } },
    })
    if (seat) return { personId: seat.personId, role, personName: seat.person.name }
  }
  return { personId: null, role: `${SUPPLIER_TWIN_ROLES[0]} (nobody seated)`, personName: null }
}

export interface RunSummary {
  companyId: string
  warnings: number
  receipts: number
  outcomes: Record<ActResult['outcome'], number>
  /**
   * The morning digest, counted by how each person was reached: by the
   * Teams bot, by the in-app and email fallback, or not at all. ABSENT
   * where the digest module could not be loaded; FAILED where it threw.
   */
  teamsDigest: { bot: number; fallback: number; nothing: number } | 'ABSENT' | 'FAILED'
}

/**
 * Conversation's proactive digest (`tellProgramOwnerOnTeams` in
 * lib/teams/digest), loaded when it is asked for and never at build
 * time, so a run is never stopped by it: a module that will not load is
 * ABSENT, and a digest that throws is reported to staff and is FAILED.
 * The run's own entries are written before this is asked and stand
 * either way. The count says how each person was actually reached, so a
 * fallback to email is never reported as a Teams message.
 */
async function tellOnTeams(companyId: string): Promise<RunSummary['teamsDigest']> {
  let tell: ((companyId: string) => Promise<{ via: 'BOT' | 'FALLBACK' | 'NOTHING' }[]>) | null = null
  try {
    tell = (await import('@/lib/teams/digest')).tellProgramOwnerOnTeams
  } catch {
    return 'ABSENT'
  }
  if (typeof tell !== 'function') return 'ABSENT'
  try {
    const sent = (await tell(companyId)) ?? []
    return {
      bot: sent.filter((r) => r.via === 'BOT').length,
      fallback: sent.filter((r) => r.via === 'FALLBACK').length,
      nothing: sent.filter((r) => r.via === 'NOTHING').length,
    }
  } catch (err) {
    await reportError('twin/teams-digest', err, { companyId }).catch(() => undefined)
    return 'FAILED'
  }
}

export async function runTwin(companyId: string, opts: { surface?: Surface; now?: Date } = {}): Promise<RunSummary> {
  const surface = opts.surface ?? 'CRON'
  const authority = await programManagerAt(companyId)
  const rules = await ruleSetFor(companyId)
  const outcomes: RunSummary['outcomes'] = { PERFORMED: 0, AWAITING_APPROVAL: 0, REFUSED: 0, ALREADY: 0, FAILED: 0 }
  const tally = (r: ActResult) => { outcomes[r.outcome]++; return r }

  // ── The time limit ──
  const warnings = await tenureWarnings(companyId, { warnAtDays: rules.tenureWarnAtDays }, {
    now: opts.now,
    actor: { personId: authority.personId ?? undefined, companyId },
  })
  for (const w of warnings) {
    const entity = { type: 'Person', id: w.personId, partyCompanyIds: [companyId] }
    const payload = { tier: w.tier, daysOnSite: w.daysOnSite, daysToLimit: w.daysToLimit, limitOn: w.limitOn.toISOString(), capMonths: w.capMonths, suppliers: w.suppliers, ruleSetVersion: rules.version }
    const recorded = tally(await act({
      companyId, action: 'tenure.warning.record', entity, rule: w.ruleCited, rationale: w.rationale,
      surface, authority, payload, dedupKey: w.key,
    }))
    if (recorded.outcome !== 'PERFORMED') continue
    tally(await act({
      companyId, action: 'tenure.warning.notify_program_owner', entity, rule: w.ruleCited, rationale: w.rationale,
      surface, authority, dedupKey: w.key,
      payload: { ...payload, title: w.tier === 'BREACH' ? `${w.personName} is at the time limit` : `${w.personName} is ${w.daysToLimit} days from the time limit` },
    }))
  }

  // ── Invoice receipts ──
  const verdicts = await pendingReceiptsFor(companyId, { hoursTolerancePct: rules.hoursTolerancePct, source: rules.source })
  for (const v of verdicts) {
    const supplier = await invoiceSupplierId(v.invoiceId)
    const entity = { type: 'Invoice', id: v.invoiceId, partyCompanyIds: supplier ? [companyId, supplier] : [companyId] }
    const payload = { number: v.number, supplierName: v.supplierName, verdict: v.verdict, payable: v.payable, failing: v.failing, ruleSetVersion: rules.version }
    const key = `${v.invoiceId}:${v.verdict}`
    const recorded = tally(await act({
      companyId, action: 'invoice_receipt.record', entity, rule: v.ruleCited, rationale: v.rationale,
      surface, authority, payload, dedupKey: key,
    }))
    if (recorded.outcome !== 'PERFORMED') continue
    if (v.verdict !== 'CLEAN') {
      tally(await act({
        companyId, action: 'invoice_receipt.flag_mismatch', entity, rule: v.ruleCited, rationale: v.rationale,
        surface, authority, payload, dedupKey: key,
      }))
    } else if (v.payable) {
      tally(await act({
        companyId, action: 'invoice_receipt.approve', entity, rule: v.ruleCited, rationale: v.rationale,
        surface, authority, payload, dedupKey: v.invoiceId,
      }))
    }
  }

  const teamsDigest = await tellOnTeams(companyId)
  return { companyId, warnings: warnings.length, receipts: verdicts.length, outcomes, teamsDigest }
}

/** The client programs the nightly run reads: real or demo, never a census sandbox. */
export async function programsToRun(take = 200): Promise<string[]> {
  const rows = await prisma.company.findMany({
    where: { kind: 'CLIENT', isCensusSandbox: false },
    select: { id: true },
    orderBy: { id: 'asc' },
    take,
  })
  return rows.map((r) => r.id)
}

/**
 * The supplier firms the supplier's twin reads (2026-10-18): staffing
 * vendors, integrators and one-person corporations, real or the seeded
 * world, never a census sandbox (a client's real rows held for a census)
 * and never a visitor's own demo sandbox (`isDemo`), which nobody watches
 * and which is removed after thirty days unused.
 *
 * Nothing calls this yet: the supplier's twin has no performer that does
 * anything until money lands drafting the bill, and a nightly pass that
 * only records refusals is noise in the ledger.
 */
export async function suppliersToRun(take = 500): Promise<string[]> {
  const rows = await prisma.company.findMany({
    where: { kind: { in: ['VENDOR', 'GSI', 'CONSULTANT_CORP'] }, isCensusSandbox: false, isDemo: false },
    select: { id: true },
    orderBy: { id: 'asc' },
    take,
  })
  return rows.map((r) => r.id)
}
