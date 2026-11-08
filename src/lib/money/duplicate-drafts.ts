/**
 * Two drafts that hold the same week, and the repair: keep the first,
 * withdraw the later draft with a reason. Never a bill that was sent.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * The founder's tester on production, 2026-11-04 and 2026-11-08: Rajesh
 * Iyer's week had two draft bills at Brightmoor. The press that made the
 * second is closed on the branch (`weekOnPlan` in lib/money/week-bill:
 * "Bill this week" is drawn only where the bill would carry the week's own
 * hours, and a press on a week already on a bill refuses and drafts
 * nothing), and the database refuses one week twice on one line
 * (`InvoiceLine @@unique([timesheetId, sellContractId])`). The drafts
 * already written before the fix stay until somebody removes them, so the
 * Bills page offers to.
 *
 * ── What counts as the same week ─────────────────────────────────────
 *
 *   - two bills of the firm whose lines name the same week (one week on
 *     two of the firm's lines for one person), or
 *   - two drafts of the firm for the same person over the same days (the
 *     expense-only draft a press made beside the bill the week was on).
 *
 * The bill kept is a sent one where there is one, then the one holding
 * the week's hours, then the first drafted. Only a DRAFT is withdrawn,
 * through the Bills page's own withdraw (`withdrawDraft` in
 * lib/money/bill-withdraw), which takes a reason and keeps the trail.
 */

import { prisma } from '@/lib/db'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { daySpan } from '@/lib/plain-date'
import type { Prisma } from '@prisma/client'

export interface BillOnRecord {
  id: string
  number: string
  status: string
  /**
   * When it was drafted. `Invoice` carries no created stamp of its own
   * (it has issuedAt, submittedAt, receivedAt, dueAt; a draft has none of
   * the first three), and a draft is written with its lines in one go, so
   * the earliest line's `createdAt` is the day it was drafted. Null on a
   * bill with no lines and no issue or send day: it sorts last.
   */
  createdAt: Date | null
  periodStart: Date | null
  periodEnd: Date | null
  lines: { timesheetId: string | null; personId: string | null; personName: string | null }[]
}

export interface DuplicateDrafts {
  keep: { id: string; number: string; status: string }
  withdraw: { id: string; number: string }[]
  personName: string
  /** "Two drafts hold Rajesh Iyer's week of Oct 4 – Oct 10, 2026; keep the first, IN-001." */
  says: string
  /** The reason written on each withdrawal. */
  reason: string
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const CLOSED = new Set(['CANCELLED', 'VOID', 'REJECTED'])

/** Pure: the groups of bills that hold one week, and what the repair keeps. */
export function duplicateDrafts(bills: readonly BillOnRecord[]): DuplicateDrafts[] {
  const live = bills.filter((b) => !CLOSED.has(b.status))
  // Union-find over bills sharing a week.
  const parent = new Map(live.map((b) => [b.id, b.id]))
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!))
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra) }
  const byWeek = new Map<string, string>()
  const byDays = new Map<string, string>()
  for (const b of live) {
    for (const l of b.lines) {
      if (l.timesheetId) {
        const seen = byWeek.get(l.timesheetId)
        if (seen && seen !== b.id) join(seen, b.id)
        else byWeek.set(l.timesheetId, b.id)
      }
      if (b.status === 'DRAFT' && l.personId && b.periodStart && b.periodEnd) {
        const k = `${l.personId}|${day(b.periodStart)}|${day(b.periodEnd)}`
        const seen = byDays.get(k)
        if (seen && seen !== b.id) join(seen, b.id)
        else byDays.set(k, b.id)
      }
    }
  }
  const groups = new Map<string, BillOnRecord[]>()
  for (const b of live) {
    const r = find(b.id)
    groups.set(r, [...(groups.get(r) ?? []), b])
  }
  const out: DuplicateDrafts[] = []
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const rank = (b: BillOnRecord) => [b.status === 'DRAFT' ? 1 : 0, b.lines.some((l) => l.timesheetId) ? 0 : 1, b.createdAt ? b.createdAt.getTime() : Number.MAX_SAFE_INTEGER]
    const sorted = [...g].sort((a, b) => {
      const ra = rank(a), rb = rank(b)
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
      return a.number.localeCompare(b.number)
    })
    const keep = sorted[0]
    const withdraw = sorted.slice(1).filter((b) => b.status === 'DRAFT')
    if (withdraw.length === 0) continue
    const personName = g.flatMap((b) => b.lines).find((l) => l.personName)?.personName ?? 'one person'
    const span = keep.periodStart && keep.periodEnd ? daySpan(day(keep.periodStart)!, day(keep.periodEnd)!) : null
    const week = span ? `${personName}’s week of ${span}` : `${personName}’s week`
    const count = withdraw.length + 1 === 2 ? 'Two' : String(withdraw.length + 1)
    const kept = keep.status === 'DRAFT' ? `keep the first, ${keep.number}` : `keep ${keep.number}, which was sent`
    out.push({
      keep: { id: keep.id, number: keep.number, status: keep.status },
      withdraw: withdraw.map((b) => ({ id: b.id, number: b.number })),
      personName,
      says: `${count} ${keep.status === 'DRAFT' ? 'drafts' : 'bills'} hold ${week}; ${kept}.`,
      reason: `A second draft of ${week}; ${keep.number} is kept.`,
    })
  }
  return out
}

/** The firm's drafts that hold a week another of its bills holds. */
export async function duplicateDraftsAt(companyId: string): Promise<DuplicateDrafts[]> {
  // Only the bills that could pair with a draft: every draft, and any
  // other live bill naming a week a draft names.
  const drafts = await prisma.invoice.findMany({
    where: { AND: [invoicesRaisedBy(companyId), { status: 'DRAFT' }] },
    select: SELECT,
    take: 500,
  })
  if (drafts.length === 0) return []
  const weeks = [...new Set(drafts.flatMap((d) => d.invoiceLines.map((l) => l.timesheetId)).filter((x): x is string => !!x))]
  const others = weeks.length
    ? await prisma.invoice.findMany({
        where: { AND: [invoicesRaisedBy(companyId), { status: { not: 'DRAFT' } }, { invoiceLines: { some: { timesheetId: { in: weeks } } } }] },
        select: SELECT,
        take: 500,
      })
    : []
  return duplicateDrafts([...drafts, ...others].map(toBill))
}

// Walk 7, 2026-11-08: this selected `createdAt`, which `Invoice` does not
// have, and every Bills open answered 500. The drafted day is read off the
// lines (see `BillOnRecord.createdAt`); the integration test
// `duplicate-drafts-read` runs this select against the real client.
const SELECT = {
  id: true, number: true, status: true, issuedAt: true, submittedAt: true, periodStart: true, periodEnd: true,
  invoiceLines: {
    select: { timesheetId: true, personId: true, createdAt: true, sellContract: { select: { person: { select: { name: true } } } } },
  },
} satisfies Prisma.InvoiceSelect

/** The day a bill was drafted: its first line, else the day it was issued or sent. */
export function draftedAt(b: { issuedAt: Date | null; submittedAt: Date | null; invoiceLines: { createdAt: Date }[] }): Date | null {
  const first = b.invoiceLines.reduce<Date | null>((min, l) => (min == null || l.createdAt < min ? l.createdAt : min), null)
  return first ?? b.issuedAt ?? b.submittedAt ?? null
}

function toBill(b: {
  id: string; number: string; status: string; issuedAt: Date | null; submittedAt: Date | null; periodStart: Date | null; periodEnd: Date | null
  invoiceLines: { timesheetId: string | null; personId: string | null; createdAt: Date; sellContract: { person: { name: string } | null } | null }[]
}): BillOnRecord {
  return {
    id: b.id, number: b.number, status: b.status, createdAt: draftedAt(b), periodStart: b.periodStart, periodEnd: b.periodEnd,
    lines: b.invoiceLines.map((l) => ({ timesheetId: l.timesheetId, personId: l.personId, personName: l.sellContract?.person?.name ?? null })),
  }
}
