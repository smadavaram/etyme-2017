import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { RECORDED_AS_A_CHECK, standsOnACheck, heldOnRecord, linesOfPerson } from '@/lib/document-stages/paper-record'
import { heldFrom, checksThatAnswer } from '@/lib/contract-clearance'
import { resolveItems, progressOf, type HeldDocument, type PacketSpec } from '@/lib/packets'
import { RECORDABLE_ABOUT_A_FIRM } from '@/lib/attestation'
import { examinationOf, recordSupplierPaper } from './examination'

/**
 * The record behind every paper already accepted through a request.
 *
 * The founder's tester, 2026-11-03: papers accepted on Paperwork before
 * the one-truth fix read "on file" there and "needed" on the placement,
 * because the acceptance wrote nothing the start reads. This re-reads
 * every accepted item whose standing is a recorded check and has none
 * behind it, and writes the record through the same writer the Accept
 * now uses (`examinationOf`, `recordSupplierPaper`), in the name of the
 * person who accepted it, with the dates they recorded on the paper.
 *
 * What cannot be written is not invented: a background check accepted
 * with no screening company named stays without a verdict, and the
 * report says so by kind, with the sentence the Accept would give today.
 * An NDA or any paper that stands on the paper itself needs nothing: the
 * start reads the accepted item (lib/document-stages/paper-record).
 *
 * Safe to run twice: an item that got its record points at it, and the
 * second run passes it by.
 */
export interface BackfillReport {
  write: boolean
  /** Accepted items with no record behind them, by kind. */
  found: Record<string, number>
  /** Records written, by kind. */
  written: Record<string, number>
  /** Not written, by kind, with how many and the first reason. */
  heldBack: Record<string, { count: number; says: string }>
  /** Accepted papers that stand on the paper itself, which the start already reads. */
  readAsAccepted: number
  /**
   * Items still asked for on an open request whose paper is already on the
   * record, by kind: read as held (`closed` once written).
   */
  alreadyOnRecord: Record<string, number>
  closed: Record<string, number>
  says: string
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }

export async function backfillAcceptedPapers(opts: { write: boolean; now?: Date; limit?: number }): Promise<BackfillReport> {
  const now = opts.now ?? new Date()
  const items = await prisma.packetItem.findMany({
    where: {
      state: 'ACCEPTED',
      verificationId: null,
      key: { in: [...RECORDED_AS_A_CHECK] },
      packet: { cancelledAt: null },
    },
    select: {
      id: true, key: true, label: true, validUntil: true, reviewedById: true,
      packet: { select: { id: true, companyId: true, subjectPersonId: true, subjectCompanyId: true, company: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
    take: opts.limit ?? 5000,
  })
  const readAsAccepted = await prisma.packetItem.count({
    where: { state: 'ACCEPTED', key: { notIn: [...RECORDED_AS_A_CHECK] }, packet: { cancelledAt: null, subjectPersonId: { not: null } } },
  })

  const found: Record<string, number> = {}
  const written: Record<string, number> = {}
  const heldBack: Record<string, { count: number; says: string }> = {}
  const hold = (k: string, says: string) => {
    heldBack[k] = heldBack[k] ? { ...heldBack[k], count: heldBack[k].count + 1 } : { count: 1, says }
  }

  for (const item of items) {
    if (!standsOnACheck(item.key)) continue
    bump(found, item.key)
    if (!opts.write) continue

    const reviewerId = item.reviewedById
    const [reviewer, seat, paper] = await Promise.all([
      reviewerId ? prisma.person.findUnique({ where: { id: reviewerId }, select: { id: true, name: true } }) : null,
      reviewerId
        ? prisma.context.findFirst({
            where: { personId: reviewerId, companyId: item.packet.companyId, revokedAt: null },
            select: { role: { select: { permissions: true } } },
          })
        : null,
      prisma.docInstance.findFirst({
        where: { subjectType: 'PACKET_ITEM', subjectId: item.id },
        select: { validFrom: true, expiresAt: true, edition: true },
      }),
    ])
    if (!reviewer) {
      hold(item.key, 'Nobody is named as having accepted it, so nothing is written in anybody’s name.')
      continue
    }
    const permissions = (seat?.role?.permissions as string[] | undefined) ?? []
    const buyer = {
      companyId: item.packet.companyId,
      companyName: item.packet.company.name,
      personId: reviewer.id,
      personName: reviewer.name,
      holds: (p: string) => hasPermission(permissions, p as never),
      actor: { actorPersonId: reviewer.id, actorCompanyId: item.packet.companyId },
    }
    // What the person recorded on the paper when they accepted it, and nothing more.
    const body: Record<string, unknown> = {
      ...(paper?.validFrom ? { validFrom: paper.validFrom.toISOString().slice(0, 10) } : {}),
      ...(paper?.expiresAt ? { expiresAt: paper.expiresAt.toISOString().slice(0, 10) } : {}),
      ...(paper?.edition ? { edition: paper.edition, formEdition: paper.edition } : {}),
    }

    let result: Awaited<ReturnType<typeof examinationOf>> = null
    if (item.packet.subjectCompanyId) {
      if (!(RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(item.key)) continue
      const supplier = await prisma.company.findUnique({ where: { id: item.packet.subjectCompanyId }, select: { id: true, name: true } })
      if (!supplier) continue
      result = await recordSupplierPaper({
        buyer, supplier, key: item.key, issuer: null, reference: null,
        validFrom: paper?.validFrom ?? null, expiresAt: paper?.expiresAt ?? item.validUntil, now,
      })
    } else if (item.packet.subjectPersonId) {
      result = await examinationOf({
        packet: { id: item.packet.id, subjectPersonId: item.packet.subjectPersonId, subjectCompanyId: null },
        item: { id: item.id, key: item.key, label: item.label },
        body, validUntil: item.validUntil, now, caller: buyer,
      })
    }

    if (result?.verificationId) {
      await prisma.packetItem.update({ where: { id: item.id }, data: { verificationId: result.verificationId } })
      bump(written, item.key)
    } else {
      hold(item.key, result?.refused?.message ?? result?.says ?? 'Nothing on the paper is enough to record it.')
    }
  }

  const total = Object.values(found).reduce((a, b) => a + b, 0)
  const wrote = Object.values(written).reduce((a, b) => a + b, 0)
  const { alreadyOnRecord, closed } = await closeItemsAlreadyOnRecord({ write: opts.write, now, limit: opts.limit })
  const onRecord = Object.values(alreadyOnRecord).reduce((a, b) => a + b, 0)
  const shut = Object.values(closed).reduce((a, b) => a + b, 0)
  const first = total === 0
    ? 'Every paper accepted through a request already has its record behind it.'
    : opts.write
      ? `${wrote} of ${total} accepted paper${total === 1 ? '' : 's'} now have the record the start reads; the rest are listed with the reason.`
      : `${total} accepted paper${total === 1 ? '' : 's'} have no record behind them.`
  const second = onRecord === 0
    ? 'No open request asks for a paper already on the record.'
    : opts.write
      ? `${shut} item${shut === 1 ? '' : 's'} still asked for on open requests ${shut === 1 ? 'is' : 'are'} now read as on file, because the paper is on the record.`
      : `${onRecord} item${onRecord === 1 ? '' : 's'} still asked for on open requests ${onRecord === 1 ? 'is' : 'are'} already on the record.`
  const says = total === 0 && onRecord === 0
    ? `${first} ${second} Nothing to do.`
    : `${first} ${second}${opts.write ? '' : ' Send {"write": true} to write what can be written.'}`
  return { write: opts.write, found, written, heldBack, readAsAccepted, alreadyOnRecord, closed, says }
}

// ── Requests still asking for a paper the record already holds ─────────
//
// The release walk on f2f342723: Rajesh Iyer's and Camille's requests from
// Nov 1, and 18 more, read "0 of 4" for papers the placement holds, and
// this said "Nothing to do", because it looked only at accepted items with
// no record behind them. An item still asked for, whose paper is on the
// record the placement reads (`papersOnRecord`, `heldAbout`, and the
// recorded checks), is read as on file: ACCEPTED, with a note saying the
// paper was already on the record, pointing at the check where it is one.
// Nobody is named as having accepted it, because nobody did on the request.

/** An item still asked for, as the rule needs it. */
export interface OpenItem { id: string; key: string; label: string }

/**
 * Which open items the record already holds, read the way a fresh request
 * reads them (`resolveItems`): held, current and accepted. A paper whose
 * standing is a recorded check is held only where the check is there to
 * point at. Pure.
 */
export function itemsAlreadyOnRecord(
  items: OpenItem[],
  held: HeldDocument[],
  checks: { id: string; type: string }[],
  now: Date
): { item: OpenItem; verificationId: string | null; note: string }[] {
  if (items.length === 0) return []
  const spec = {
    key: 'BACKFILL', label: 'backfill', purpose: 'ONBOARDING', subject: 'PERSON', preamble: '',
    items: items.map((i) => ({ key: i.key, label: i.label, hint: '', required: true, validMonths: null })),
  } as unknown as PacketSpec
  const resolved = resolveItems(spec, held, now)
  const out: { item: OpenItem; verificationId: string | null; note: string }[] = []
  resolved.forEach((r, n) => {
    if (r.state !== 'ALREADY_HELD' && r.state !== 'EXPIRING') return
    const item = items[n]
    // The check behind it, or the check that stands in for it: proof of
    // right to work is answered by an I-9 on file (`checksThatAnswer`), the way
    // the placement and a fresh request read it (R1b: Rajesh Iyer's right
    // to work stayed asked for beside his I-9).
    const answers = checksThatAnswer(item.key)
    const check = checks.filter((c) => answers.includes(c.type)).at(-1) ?? null
    if (standsOnACheck(item.key) && !check) return
    out.push({ item, verificationId: check?.id ?? null, note: `Already on the record when this was asked: ${r.note.charAt(0).toLowerCase()}${r.note.slice(1)}.` })
  })
  return out
}

async function closeItemsAlreadyOnRecord(opts: { write: boolean; now: Date; limit?: number }) {
  const alreadyOnRecord: Record<string, number> = {}
  const closed: Record<string, number> = {}
  const packets = await prisma.documentPacket.findMany({
    where: { cancelledAt: null, completedAt: null, items: { some: { state: 'PENDING' } } },
    select: {
      id: true, companyId: true, subjectPersonId: true, subjectCompanyId: true, completedAt: true,
      items: { select: { id: true, key: true, label: true, state: true, required: true }, orderBy: { position: 'asc' } },
    },
    orderBy: { id: 'asc' },
    take: opts.limit ?? 2000,
  })
  for (const p of packets) {
    const personId = p.subjectPersonId
    const firms = [p.companyId, ...(p.subjectCompanyId ? [p.subjectCompanyId] : [])]
    // Read the way a fresh request reads it, through the one reader:
    // every line the asking firm and the person share, each typed by both
    // firms' names (the fourth screen walk, R1b: an undertaking Northbend's
    // order names, accepted by Brightmoor, was never read here).
    const [checks, lines] = await Promise.all([
      prisma.verification.findMany({
        where: personId ? { personId } : { companyId: p.subjectCompanyId ?? '__none__' },
        select: { id: true, type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      linesOfPerson(personId, { firm: p.companyId }),
    ])
    const held: HeldDocument[] = [
      ...heldFrom(checks),
      ...(await heldOnRecord({ personId, firms, lines })),
    ]
    const accepted = checks.filter((c) => c.status === 'CLEAR' || c.status === 'CONDITIONAL')
    const found = itemsAlreadyOnRecord(p.items.filter((i) => i.state === 'PENDING'), held, accepted, opts.now)
    for (const f of found) bump(alreadyOnRecord, f.item.key)
    if (!opts.write || found.length === 0) continue
    for (const f of found) {
      await prisma.packetItem.update({
        where: { id: f.item.id },
        data: { state: 'ACCEPTED', reviewedAt: opts.now, reviewNote: f.note, ...(f.verificationId ? { verificationId: f.verificationId } : {}) },
      })
      bump(closed, f.item.key)
    }
    const done = new Set(found.map((f) => f.item.id))
    const progress = progressOf(p.items.map((i) => ({
      label: i.label, required: i.required,
      received: done.has(i.id) || i.state === 'RECEIVED' || i.state === 'ACCEPTED',
    })))
    if (progress.complete) await prisma.documentPacket.update({ where: { id: p.id }, data: { completedAt: opts.now } })
  }
  return { alreadyOnRecord, closed }
}
