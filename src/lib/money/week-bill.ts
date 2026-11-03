/**
 * "Bill this week": an approved week's page drafts the bill for that one
 * week, through the Bills page's own generator, and says the bill's state
 * afterwards.
 *
 * The tester's retest of 2026-11-03: Helena Marsh's approved Oct 4–10
 * week, $5,800, had no draft bill and its page had no bill section,
 * because the supplier's twin drafts a bill only on the agreement's
 * billing date. A signed week is a receipt; the firm that bills may bill
 * it the day it is signed, and nothing in the product said so.
 *
 * Who presses it: a seat holding `invoices.issue` at the firm whose sell
 * line the week is on. The Owner (who holds every permission) is the
 * seat only where nobody else at the firm holds `invoices.issue`, the
 * same reading as the twin's bill (`sendVerdict` in lib/money/bill-send).
 */

import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { generateBill, BILLABLE_LINE_STATES, type BillOutcome } from './bill-generate'

/** A bill a week is already on, at this firm. */
export interface WeekOnBill { invoiceId: string; number: string; status: string }

/** The bill's state, in the words a person says. */
export function billStateSays(b: WeekOnBill): string {
  switch (b.status) {
    case 'DRAFT': return `On bill ${b.number}, drafted and not sent yet.`
    case 'ISSUED': return `On bill ${b.number}, raised and not sent yet.`
    case 'SUBMITTED': return `On bill ${b.number}, sent and not yet paid.`
    case 'HELD': return `On bill ${b.number}, sent and held by the customer.`
    case 'PARTIALLY_PAID': return `On bill ${b.number}, sent and part paid.`
    case 'PAID': return `On bill ${b.number}, paid.`
    default: return `On bill ${b.number}.`
  }
}

/**
 * Whether this seat bills for the firm, as pure facts:
 *   permitted        holds `invoices.issue` (the Owner's "*" included)
 *   holdsEverything  holds "*" — the Owner or an Admin seat
 *   otherBillers     other seats at the firm holding `invoices.issue` by name
 */
export function mayBillWeek(i: {
  permitted: boolean
  holdsEverything: boolean
  otherBillers: readonly string[]
}): { ok: true } | { ok: false; says: string } {
  if (!i.permitted) return { ok: false, says: 'Billing a week is for a seat that sends bills: Accounts Receivable, Finance or Admin.' }
  if (i.holdsEverything && i.otherBillers.length > 0) {
    const names = [...new Set(i.otherBillers)].sort((a, b) => a.localeCompare(b))
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
    return { ok: false, says: `${who} bills this week.` }
  }
  return { ok: true }
}

/** What the week's page draws in its bill section. */
export interface WeekBillView {
  /** The week is signed by the client, so it may be billed. */
  approved: boolean
  /** The bill it is on at this firm, where it is on one. */
  bill: (WeekOnBill & { says: string }) | null
  /** Draw "Bill this week" for this seat. */
  mayBill: boolean
  /** The sentence where it is not drawn and not yet billed. */
  says: string | null
}

export interface WeekCaller {
  company: { id: string; name: string; kind?: string | null } | null
  person: { id: string; name: string }
  permissions: readonly string[]
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/** The facts: the week, this firm's line it bills from, the bill it is on, and whether this seat bills. */
async function read(caller: WeekCaller, timesheetId: string) {
  if (!caller.company) return null
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true, personId: true, periodStart: true, periodEnd: true, sellContractId: true,
      assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { id: true }, take: 1 },
    },
  })
  if (!ts) return null
  // This firm's own line for the person over the week: its own rung, where
  // it bills the hours signed above (one week, every rung, CLAUDE.md 2026-09-28).
  const lines = await prisma.sellContract.findMany({
    where: {
      companyId: caller.company.id, personId: ts.personId,
      startDate: { lte: ts.periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: ts.periodStart } }],
    },
    select: { id: true, engagementId: true, state: true },
  })
  const line = lines.find((l) => l.id === ts.sellContractId) ?? lines[0] ?? null
  const onBill = line
    ? await prisma.invoiceLine.findFirst({
        where: { timesheetId: ts.id, sellContractId: line.id, invoice: { status: { notIn: ['CANCELLED', 'VOID'] } } },
        select: { invoice: { select: { id: true, number: true, status: true } } },
        orderBy: { id: 'desc' },
      })
    : null
  const holdsEverything = caller.permissions.includes('*')
  const others = holdsEverything
    ? await prisma.context.findMany({
        where: {
          companyId: caller.company.id, revokedAt: null, type: { not: 'CONSULTANT' },
          personId: { not: caller.person.id },
          role: { permissions: { has: 'invoices.issue' } },
        },
        select: { person: { select: { name: true } } },
      })
    : []
  return { ts, line, onBill: onBill?.invoice ?? null, holdsEverything, otherBillers: others.map((o) => o.person.name) }
}

/**
 * The week, asked of the generator. One bill covers one billing period,
 * and a week crossing a period's edge bills in the period its straddle
 * rule puts it in (`billingWindow` in lib/money/invoice-window): asked as
 * its own seven days, it is clipped to the first period and may find
 * nothing there. So where the first asking finds nothing, it is asked
 * again from the period edge inside it (the 1st or the 16th) to its last
 * day. Under a split straddle a week billed in its first period leaves
 * its later days to the next period's bill.
 */
async function priceWeek(
  caller: WeekCaller,
  engagementId: string,
  ts: { periodStart: Date; periodEnd: Date },
  opts: { dryRun?: boolean; status?: 'DRAFT'; by?: string },
): Promise<BillOutcome> {
  const who = { company: { id: caller.company!.id, name: caller.company!.name, kind: caller.company!.kind }, person: { id: caller.person.id, name: caller.person.name } }
  // The week as asked, then from each month or half-month edge inside it
  // to its last day: the part that bills in the next period.
  const windows = [{ periodStart: day(ts.periodStart), periodEnd: day(ts.periodEnd) }]
  for (let t = ts.periodStart.getTime() + 86_400_000; t <= ts.periodEnd.getTime(); t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCDate() === 1 || d.getUTCDate() === 16) windows.push({ periodStart: day(d), periodEnd: day(ts.periodEnd) })
  }
  let out: BillOutcome | null = null
  for (const w of windows) {
    // Dry first, so a window that finds nothing writes nothing.
    const dry = await generateBill(who, { engagementId, ...w }, { dryRun: true })
    if (dry.ok) return opts.dryRun ? dry : generateBill(who, { engagementId, ...w }, { status: opts.status, by: opts.by })
    out = out ?? dry
    const code = (dry.body.error as { code?: unknown }).code
    // Only "nothing here" is worth asking the next period; any other refusal is the answer.
    if (code !== 'ZERO_VALUE') return dry
  }
  return out!
}

/** The week's bill section, for this seat. Null where the week does not exist or the reader's firm bills nothing on it. */
export async function weekBillFor(caller: WeekCaller, timesheetId: string): Promise<WeekBillView | null> {
  const f = await read(caller, timesheetId)
  if (!f || !f.line) return null
  const approved = f.ts.assertions.length > 0
  if (f.onBill) {
    const b = { invoiceId: f.onBill.id, number: f.onBill.number, status: f.onBill.status }
    return { approved, bill: { ...b, says: billStateSays(b) }, mayBill: false, says: null }
  }
  if (!approved) return { approved, bill: null, mayBill: false, says: 'The client has not signed this week yet, so it cannot be billed.' }
  const may = mayBillWeek({ permitted: hasPermission(caller.permissions, 'invoices.issue'), holdsEverything: f.holdsEverything, otherBillers: f.otherBillers })
  if (!may.ok) return { approved, bill: null, mayBill: false, says: may.says }
  if (!f.line.engagementId || !(BILLABLE_LINE_STATES as readonly string[]).includes(f.line.state)) {
    return { approved, bill: null, mayBill: false, says: 'This placement has not started, so its weeks are not billed yet. Start it from the placement page first.' }
  }
  // Asked of the generator itself, writing nothing, so the button is never
  // drawn where the press would be refused (a week the payer already
  // recorded from this firm, a week the firm above has not accepted).
  const dry = await priceWeek(caller, f.line.engagementId, f.ts, { dryRun: true })
  if (!dry.ok) {
    const message = (dry.body.error as { message?: unknown }).message
    return { approved, bill: null, mayBill: false, says: typeof message === 'string' ? message : 'This week cannot be billed from here.' }
  }
  return { approved, bill: null, mayBill: true, says: null }
}

/**
 * Draft the bill for this one week, through the generator the Bills page
 * uses, bounded to the week's own days. Refused, in a sentence, wherever
 * `weekBillFor` would not draw the button.
 */
export async function billThisWeek(caller: WeekCaller, timesheetId: string): Promise<BillOutcome> {
  const view = await weekBillFor(caller, timesheetId)
  if (!view) return { ok: false, status: 404, body: { error: { code: 'NOT_FOUND', message: 'That week is not one your firm bills.' } } }
  if (view.bill) return { ok: false, status: 409, body: { error: { code: 'ALREADY_BILLED', message: view.bill.says } } }
  if (!view.mayBill) return { ok: false, status: 403, body: { error: { code: 'FORBIDDEN', message: view.says ?? 'This week cannot be billed from here.' } } }
  const f = (await read(caller, timesheetId))!
  return priceWeek(caller, f.line!.engagementId!, f.ts, { status: 'DRAFT', by: `Billed from the week's page by ${caller.person.name}` })
}
