/**
 * The supplier's twin's bill: drafted on the agreement's billing date,
 * sent only on a person's yes.
 *
 * ── The founder, 2026-10-18 ──────────────────────────────────────────
 *
 * "AR and AP is always based on the agreed MSA between client and
 * supplier and supplier and subvendor/candidate." A twin that drafts a
 * bill drafts it on that agreement's date for that agreement's period,
 * and never earlier than the week was signed above.
 *
 * ── What "the agreement's billing date" is, here ─────────────────────
 *
 * The period a week bills in is the one the cascade gives the sell line
 * — the agreement first, then the order and the line where each gives a
 * reason (`lib/money/order-terms`) — and the week belongs to the period
 * its last worked day falls in (its first, where the terms say START),
 * because one week bills once (`billingStraddle` in `lib/periods`). The
 * billing date is **the day after that period ends**: the first day the
 * whole period's hours can be on one bill. That is the day the monthly
 * packs already bill on ("the 28th means month end, plus one" — the 1st
 * for last month) and the same reading for a weekly or a semimonthly
 * rhythm. It is computed from the rhythm rather than read off the line's
 * INVOICE_GENERATE cycle rows, because those rows still follow the
 * template pack and not the agreement (`lib/contract-cycles` says so);
 * reading them would draft a weekly agreement's bill monthly.
 *
 * ── What the twin drafts, and what it never does ─────────────────────
 *
 * It drafts through `generateBill` (`lib/money/bill-generate`), the same
 * function the Bills page calls, so a draft and a bill pressed by hand
 * price a week identically and can never both hold it. It drafts only
 * where at least one week the firm above signed is on the bill — for the
 * top of a chain the client's signature, below it the acceptance of the
 * rung above (`lib/money/rung-billing`) — and where nothing is signed it
 * drafts nothing and says nothing. It keeps one draft per placement
 * waiting at a time, oldest period first, so a firm with months of
 * unbilled weeks is asked about one bill per placement rather than seven.
 *
 * Sending is `bill.send`, which needs a yes from whoever issues bills
 * (`invoices.issue`: Accounts Receivable, Finance, Admin). The twin acts
 * on the Owner's authority, else the Admin's (`supplierAuthorityAt` in
 * lib/twin/run), and that person never says yes to its question, because
 * nobody signs their own. The yes runs the three-way check and sends
 * exactly as the Submit button does (`lib/money/bill-send`). The twin
 * never gives that yes. Where nobody but its authority may send bills,
 * nobody is asked and the ledger says to send it from the Bills page.
 *
 * The performers here are wired into `PERFORMERS` in
 * `lib/twin/performers` by the architect; the nightly pass is
 * `runSupplierBills` in `./supplier-bills-run`.
 */

import { prisma } from '@/lib/db'
import { formatDay } from '@/lib/format-date'
import { billingStraddle, periodFor, workedSpan, iso, type Period } from '@/lib/periods'
import { whereHoursLive } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { generateBill, type BillCaller, type PlannedBill } from '@/lib/money/bill-generate'
import { announceRaised, mayBeSent, markSent } from '@/lib/money/bill-send'
import { sendBillToCustomer } from '@/lib/notify/bill-delivery'
import { reportError } from '@/lib/alerts'
import { fromUnits } from '@/lib/money-display'
import { minorPerUnit } from '@/lib/money'
import type { Performer, PerformContext } from '@/lib/twin/performers'

const A_DAY = 86_400_000

/** "Sep 30, 2026", read in UTC, through the one formatter. */
const plain = (d: Date): string => formatDay(d)

/**
 * The twin, as a bill's maker, in the words the firm reads: Ask Etyme is
 * the supplier's own assistant, so its drafts say so.
 */
export const SUPPLIER_TWIN_NAME = 'Ask Etyme'

/** One bill the agreement says is due to be drafted. */
export interface BillDue {
  sellContractId: string
  engagementId: string
  customerId: string
  customerName: string
  period: Period
  /** The day after the period ends. */
  billingDate: Date
  /** What the period follows, in words: "monthly, from your agreement with Northbend Athletic". */
  rhythmSays: string
  /** What the bill would be, priced by the generator itself. */
  planned: PlannedBill
  /** The ledger's key: one draft per placement per period, until a person withdraws it. */
  dedupKey: string
}

/** The day, at UTC midnight. */
function dayOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** The period a week bills in under these terms: its last worked day's, or its first under START. */
export function periodOfWeek(
  week: { periodStart: Date; periodEnd: Date; days: unknown },
  terms: ReturnType<typeof periodTermsFor>
): Period {
  const { straddle } = billingStraddle(terms.straddle)
  const span = workedSpan((week.days ?? {}) as Record<string, number>)
  const on = straddle === 'START' ? (span?.first ?? week.periodStart) : (span?.last ?? week.periodEnd)
  return periodFor(on, terms)
}

/** The first day a period's whole bill can be drafted: the day after it ends. */
export function billingDateOf(period: Period): Date {
  return new Date(dayOf(period.end).getTime() + A_DAY)
}

/** Whose name a bill is drafted under: the firm, and the twin on its authority. */
export function twinCaller(company: { id: string; name: string; kind?: string | null }, authorityPersonId: string | null): BillCaller {
  return { company, person: { id: authorityPersonId, name: SUPPLIER_TWIN_NAME } }
}

/**
 * The bills a supplier firm's agreements say are due to be drafted today,
 * one per placement at most, oldest period first. Reads only; drafts
 * nothing. A placement with a draft still waiting is skipped, and so is
 * a period with nothing signed on it.
 */
export async function billsDueAt(companyId: string, now: Date = new Date()): Promise<BillDue[]> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, kind: true } })
  if (!company) return []
  const today = dayOf(now)

  const lines = await prisma.sellContract.findMany({
    where: { companyId, engagementId: { not: null }, state: { in: ['IN_PROGRESS', 'ENDED'] } },
    select: {
      id: true, engagementId: true, startDate: true, clientCompanyId: true,
      billFrequency: true, billAnchor: true, billStraddle: true,
      clientCompany: { select: { id: true, name: true } },
      workOrder: { select: ORDER_HEADER_SELECT },
      ...SELL_LINE_TERMS_SELECT,
    },
    orderBy: { id: 'asc' },
  })
  if (lines.length === 0) return []

  // Where each line's hours are filed: its own contract on a direct
  // placement, the bottom rung's where the firm sells somebody it buys.
  const rungs = await ladderFor(lines.map((l) => l.id))
  const out: BillDue[] = []
  const engagementsDone = new Set<string>()

  // Read once for every line, not once per line (regulatory's profile of
  // the nightly run, 2026-10-20: two reads a line, 271 of timesheets and
  // 252 of invoices over nineteen firms). The same two questions, asked
  // of the firm's whole book and answered per line below.
  const lineIds = lines.map((l) => l.id)
  const hoursOnOf = new Map(lines.map((l) => [l.id, whereHoursLive(l.id, rungs)]))
  const [drafts, signed] = await Promise.all([
    // One draft waiting per placement: it is answered before the next.
    prisma.invoiceLine.findMany({
      where: { sellContractId: { in: lineIds }, invoice: { status: 'DRAFT' } },
      select: { sellContractId: true },
      distinct: ['sellContractId'],
    }),
    prisma.timesheet.findMany({
      where: {
        sellContractId: { in: [...new Set(hoursOnOf.values())] },
        // Signed at the top. Whether the firm above this one accepted it
        // is the generator's own question, asked below on the dry run.
        assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
      },
      select: {
        sellContractId: true, periodStart: true, periodEnd: true, days: true,
        // Which of this firm's own lines already bill the week.
        invoiceLines: { where: { sellContractId: { in: lineIds } }, select: { sellContractId: true } },
      },
      orderBy: { periodStart: 'asc' },
    }),
  ])
  const draftWaiting = new Set(drafts.map((d) => d.sellContractId))
  /** The generator's dry run per engagement and period, read once. */
  const dryRuns = new Map<string, ReturnType<typeof generateBill>>()

  for (const line of lines) {
    if (draftWaiting.has(line.id)) continue

    const hoursOn = hoursOnOf.get(line.id)!
    const weeks = signed.filter(
      (w) => w.sellContractId === hoursOn && !w.invoiceLines.some((x) => x.sellContractId === line.id)
    )
    if (weeks.length === 0) continue

    const terms = periodTermsFor('SELL', line)
    const said = termsFor('SELL', line)
    // Each period that holds an unbilled signed week and has ended, oldest first.
    const periods = new Map<string, Period>()
    for (const w of weeks) {
      const p = periodOfWeek(w, terms)
      if (billingDateOf(p).getTime() > today.getTime()) continue
      periods.set(iso(p.start), p)
    }

    for (const period of [...periods.values()].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const key = `${line.engagementId}:${iso(period.start)}`
      if (engagementsDone.has(key)) break
      // A bill is per engagement and period, so two placements on one
      // engagement ask the generator the same question: asked once.
      let ask = dryRuns.get(key)
      if (!ask) {
        ask = generateBill(
          twinCaller(company, null),
          { engagementId: line.engagementId, periodStart: iso(period.start), periodEnd: iso(period.end) },
          { dryRun: true }
        )
        dryRuns.set(key, ask)
      }
      const dry = await ask
      // Nothing signed and accepted above in this period, or nothing the
      // generator would put on a bill: no draft, and nothing said.
      if (!dry.ok || dry.planned.timesheetIds.length === 0) continue
      engagementsDone.add(key)
      // A draft a person withdrew frees its period: the ledger keeps the
      // first draft's key for good, so each later draft for the same
      // placement and period carries the count of withdrawals behind it.
      const base = `${line.id}:${iso(period.start)}:${iso(period.end)}`
      const withdrawn = await prisma.twinAction.count({
        where: {
          companyId, action: 'bill.draft', actorType: 'PERSON', outcome: 'REJECTED',
          payload: { path: ['draftKey'], string_starts_with: base },
        },
      })
      out.push({
        sellContractId: line.id,
        engagementId: line.engagementId!,
        customerId: line.clientCompanyId,
        customerName: line.clientCompany?.name ?? dry.planned.customerName,
        period,
        billingDate: billingDateOf(period),
        rhythmSays: `${terms.frequency.toLowerCase()}, ${said.label.frequency}`,
        planned: dry.planned,
        dedupKey: withdrawn === 0 ? base : `${base}:again-${withdrawn}`,
      })
      break
    }
  }
  return out
}

/** The rule a draft cites, with its numbers. */
export function draftRule(d: Pick<BillDue, 'rhythmSays' | 'period' | 'billingDate'>): string {
  return (
    `Billed ${d.rhythmSays}. ${d.period.label} ended on ${plain(d.period.end)}, ` +
    `so its bill is due from ${plain(d.billingDate)}.`
  )
}

/** Why, in plain English, for whoever reads the ledger and the question. */
export function draftRationale(d: Pick<BillDue, 'customerName' | 'planned'>): string {
  const p = d.planned
  const weeks = p.timesheetIds.length
  const who = p.people.map((x) => `${x.personName} ${x.hours} hours`).join(', ')
  const money = fromUnits(p.totalMinor / minorPerUnit(p.currency), p.currency)
  const extras = [
    p.expenseCount ? `${p.expenseCount} expense${p.expenseCount === 1 ? '' : 's'}` : null,
    p.milestoneCount ? `${p.milestoneCount} milestone${p.milestoneCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return (
    `Built from ${weeks} week${weeks === 1 ? '' : 's'} ${d.customerName} signed: ${who}` +
    (extras.length ? `, and ${extras.join(' and ')}` : '') +
    `. ${money} to ${d.customerName}. Nothing unsigned is on it.` +
    (p.heldBack ? ` ${p.heldBack}` : '') +
    (p.pending ? ` ${p.pending}` : '')
  )
}

/** What a card about this bill shows. Read by the conversation's cards. */
export interface BillCardPayload {
  customerName: string
  period: { start: string; end: string; label: string }
  hours: number
  totalMinor: number
  currency: string
  people: { personName: string; hours: number; amountMinor: number }[]
  builtFrom: { timesheetIds: string[]; weeks: number; expenses: number; milestones: number }
  dueSays: string
  heldBack: string | null
  setAside: string[]
  invoiceId?: string
  invoiceNumber?: string
}

export function cardPayload(d: BillDue, invoice?: { id: string; number: string }): BillCardPayload {
  const p = d.planned
  return {
    customerName: d.customerName,
    period: { start: iso(d.period.start), end: iso(d.period.end), label: d.period.label },
    hours: p.hours,
    totalMinor: p.totalMinor,
    currency: p.currency,
    people: p.people,
    builtFrom: { timesheetIds: p.timesheetIds, weeks: p.timesheetIds.length, expenses: p.expenseCount, milestones: p.milestoneCount },
    dueSays: p.dueSays,
    heldBack: p.heldBack,
    setAside: p.setAside,
    ...(invoice ? { invoiceId: invoice.id, invoiceNumber: invoice.number } : {}),
  }
}

// ── The performers ────────────────────────────────────────────────────

function windowOf(c: PerformContext): { engagementId: string; periodStart: string; periodEnd: string } | null {
  const p = c.payload as Record<string, any>
  const e = p.engagementId, s = p.period?.start, t = p.period?.end
  return typeof e === 'string' && typeof s === 'string' && typeof t === 'string' ? { engagementId: e, periodStart: s, periodEnd: t } : null
}

async function companyOf(id: string) {
  return prisma.company.findUnique({ where: { id }, select: { id: true, name: true, kind: true } })
}

/**
 * `bill.draft` — acts alone. Writes a DRAFT bill for one period through
 * the Bills page's own generator, inside the ledger's transaction, so the
 * entry and the draft stand or fall together.
 */
export const billDraft: Performer = {
  async check(c) {
    const w = windowOf(c)
    if (!w) return 'Ask Etyme was not told which period to bill, so it drafted nothing.'
    const company = await companyOf(c.companyId)
    if (!company) return 'That company is not on the record.'
    const dry = await generateBill(twinCaller(company, c.authorityPersonId), w, { dryRun: true })
    if (!dry.ok) return String((dry.body.error as { message?: unknown }).message ?? 'There is nothing to bill for that period.')
    if (dry.planned.timesheetIds.length === 0) return 'Nothing the firm above signed is left to bill for that period.'
    return null
  },
  async inTx(tx, c) {
    const w = windowOf(c)!
    const company = (await companyOf(c.companyId))!
    const made = await generateBill(twinCaller(company, c.authorityPersonId), w, {
      status: 'DRAFT', tx,
      by: `Drafted by ${SUPPLIER_TWIN_NAME} on the agreement’s billing date. ${c.ruleCited}`.slice(0, 500),
    })
    if (!made.ok || made.status !== 201) {
      throw new Error(`The draft could not be written: ${JSON.stringify(made.body).slice(0, 300)}`)
    }
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: made.invoiceId }, select: { id: true, number: true } })
    return { invoiceId: inv.id, invoiceNumber: inv.number, totalMinor: made.planned.totalMinor, currency: made.planned.currency }
  },
}

/**
 * `bill.send` — needs a yes from `invoices.issue` (Accounts Receivable,
 * Finance, Admin), never from the Owner or Admin the twin acts for. The record is asked
 * before a person is (a draft that fails the three-way check is not put
 * up for a yes), and again on the yes, and then the draft is raised and
 * submitted exactly as the Submit button does.
 */
export const billSend: Performer = {
  async check(c) {
    if (c.entity.type !== 'Invoice') return 'Only a drafted bill can be sent.'
    const ok = await mayBeSent(c.entity.id, c.companyId, ['DRAFT'])
    return ok.ok ? null : ok.says
  },
  async inTx(tx, c) {
    const sent = await markSent(tx, {
      invoiceId: c.entity.id,
      companyId: c.companyId,
      by: { personId: null, name: 'a yes in Ask Etyme' },
    })
    return {
      invoiceId: sent.invoiceId, number: sent.number, total: sent.total, currency: sent.currency,
      dueAt: sent.dueAt.toISOString(), submittedAt: sent.submittedAt.toISOString(),
      ...(sent.payerNotice.why ? { payerNotice: sent.payerNotice.why } : {}),
    }
  },
  async after(c) {
    try {
      // The event a bill raised on the Bills page sends, now that this one is raised.
      await announceRaised(c.entity.id, c.companyId, { personId: null, twin: true })
    } finally {
      // And to the firm that pays it, the same way a person's Send reaches
      // it (lib/notify/bill-delivery), after the ledger's transaction has
      // committed. The sender is the person who said yes, read off the
      // answered question, because the twin sends nothing on its own.
      const byPersonId = await whoSaidYes(c).catch(() => null)
      await sendBillToCustomer({ invoiceId: c.entity.id, byPersonId }).catch((err) => {
        void reportError('bill-delivery', err, { companyId: c.companyId }).catch(() => {})
        return null
      })
    }
  },
}

/**
 * Who said yes to sending this bill: the approver on the answered
 * `bill.send` question about it. `PerformContext` carries the question,
 * not the person who answered it, so the answer is read back from the
 * record it was written to in the same transaction.
 */
async function whoSaidYes(c: PerformContext): Promise<string | null> {
  const yes = await prisma.twinApproval.findFirst({
    where: {
      companyId: c.companyId,
      decision: 'APPROVED',
      twinAction: { action: 'bill.send', entityType: 'Invoice', entityId: c.entity.id },
    },
    orderBy: { decidedAt: 'desc' },
    select: { approverPersonId: true },
  })
  return yes?.approverPersonId ?? null
}

/** What `PERFORMERS` in lib/twin/performers takes for the two bill acts. */
export const SUPPLIER_BILL_PERFORMERS: Readonly<Record<'bill.draft' | 'bill.send', Performer>> = {
  'bill.draft': billDraft,
  'bill.send': billSend,
}
