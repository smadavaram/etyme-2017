/**
 * Complete transactions: the run's one headline number (founder,
 * 2026-11-02: "100000 in complete transactions and not per page").
 *
 * The coordinator's definition, reversible by the founder in a sentence:
 * a complete transaction is a placement the run worked on whose every
 * rung's invoice receipt is paid by its payer (the client's at the top
 * rung and each firm's below it) and whose employer has worked out a pay
 * period covering at least one of its weeks. One case the definition
 * leaves open is read the platform's way and said here: a person paid
 * through her own corporation has no payroll, so where the bottom rung's
 * seller is a one-person firm, her paid invoice is her pay.
 *
 * Beside it, where the chain stops: how many placements started, had a
 * week signed, were billed at the top, had the bill received, were paid
 * at the top rung, and were paid at every rung. And one cost: notices and
 * access-log rows written during the run, per complete transaction,
 * because at 100,000 they decide the disk.
 *
 * Read at the end of the run through the read-only connection, never
 * written; the arithmetic is pure so a unit test holds it.
 */
import type { PrismaClient } from '@prisma/client'
import { isSent } from '@/lib/money/bill-state'

/** The founder's target. */
export const COMPLETE_TARGET = 100_000

/** One rung's receipt at its payer. */
export interface RungFacts {
  sellContractId: string
  /** The kind of the firm that bills on this rung. */
  sellerKind: string
  /** A bill on this rung was sent, or the payer keyed one in. */
  billed: boolean
  /** The payer has it: said it landed, keyed it in, or paid it. */
  received: boolean
  paid: boolean
}

export interface PlacementFacts {
  /** The top sell line. */
  id: string
  started: boolean
  /** Weeks on any rung the client signed. */
  weeksSigned: number
  /** Top first, the employer's rung last. */
  rungs: RungFacts[]
  /** The employer worked out a pay period overlapping one of the placement's weeks. */
  payWorkedOut: boolean
}

/** The steps a placement reaches, in the order of the trade. */
export const STEPS = ['STARTED', 'WEEKS_SIGNED', 'BILLED', 'RECEIVED', 'PAID_AT_TOP', 'PAID_EVERY_RUNG', 'COMPLETE'] as const
export type Step = (typeof STEPS)[number]

/** The words for each step, as the report says them. */
export const STEP_SAYS: Record<Step, string> = {
  STARTED: 'started',
  WEEKS_SIGNED: 'a week signed by the client',
  BILLED: 'billed at the top rung',
  RECEIVED: 'the bill received by the client',
  PAID_AT_TOP: 'paid by the client',
  PAID_EVERY_RUNG: 'paid at every rung',
  COMPLETE: 'complete: every rung paid and the pay worked out',
}

/** Whether a placement reached a step. Pure. */
export function reached(p: PlacementFacts, step: Step): boolean {
  const top = p.rungs[0]
  const bottom = p.rungs[p.rungs.length - 1]
  switch (step) {
    case 'STARTED': return p.started
    case 'WEEKS_SIGNED': return p.weeksSigned > 0
    case 'BILLED': return !!top?.billed
    case 'RECEIVED': return !!top?.received
    case 'PAID_AT_TOP': return !!top?.paid
    case 'PAID_EVERY_RUNG': return p.rungs.length > 0 && p.rungs.every((r) => r.paid)
    case 'COMPLETE':
      return reached(p, 'PAID_EVERY_RUNG') && (p.payWorkedOut || bottom?.sellerKind === 'CONSULTANT_CORP')
  }
}

export interface CompleteCount {
  placements: number
  complete: number
  target: number
  /** How many placements reached each step. */
  reached: Record<Step, number>
  written: { notices: number; accessLog: number }
  /** Rows written per complete transaction; null where none completed. */
  perComplete: { notices: number; accessLog: number } | null
}

/** The count and the cost, from the facts and the rows written. Pure. */
export function countComplete(facts: readonly PlacementFacts[], written: { notices: number; accessLog: number }): CompleteCount {
  const counts = Object.fromEntries(STEPS.map((s) => [s, facts.filter((p) => reached(p, s)).length])) as Record<Step, number>
  const complete = counts.COMPLETE
  return {
    placements: facts.length,
    complete,
    target: COMPLETE_TARGET,
    reached: counts,
    written,
    perComplete: complete > 0
      ? { notices: Math.round(written.notices / complete), accessLog: Math.round(written.accessLog / complete) }
      : null,
  }
}

const n = (x: number) => x.toLocaleString('en-US')

/** The report's section, in plain English. Pure. */
export function completeLines(c: CompleteCount): string[] {
  const L: string[] = ['## Complete transactions', '']
  L.push(
    `${n(c.complete)} complete transaction${c.complete === 1 ? '' : 's'} of ${n(c.placements)} placement${c.placements === 1 ? '' : 's'} this run worked on (awarded in it, or with a week filed in it), ` +
      `against the target of ${n(c.target)}. A transaction is complete when every rung's invoice receipt is paid by its payer and the employer has worked out a pay period covering one of its weeks.`
  )
  L.push('')
  L.push('| How far a placement got | Placements |', '|---|---|')
  for (const s of STEPS) L.push(`| ${STEP_SAYS[s]} | ${n(c.reached[s])} |`)
  L.push('')
  L.push(
    c.perComplete
      ? `Written during the run: ${n(c.written.notices)} notices and ${n(c.written.accessLog)} access-log rows, ` +
          `${n(c.perComplete.notices)} notices and ${n(c.perComplete.accessLog)} access-log rows per complete transaction.`
      : `Written during the run: ${n(c.written.notices)} notices and ${n(c.written.accessLog)} access-log rows. No transaction completed, so there is no cost per one.`
  )
  L.push('')
  return L
}

// ── Read from the run's database, read-only ───────────────────────────

type Row = Record<string, unknown>
const ids = (xs: Iterable<string>) => [...new Set(xs)]

/** Every placement the run worked on since `since`, with what the record says about how far it got. */
export async function readPlacementFacts(db: PrismaClient, since: Date): Promise<PlacementFacts[]> {
  // A placement the run worked on, by its top rung (a sell line no firm
  // buys from above): one awarded during the run, or one with a week
  // submitted during it on any of its rungs, walked up to the top. The
  // run has no clock of its own, so a placement awarded today has no past
  // weeks to file; the weeks the run files, signs, bills and pays are on
  // the world's placements that were already running.
  const tops = await db.$queryRawUnsafe<{ id: string; state: string }[]>(
    `with recursive up(sc, depth) as (
       select id, 0 from "SellContract" where "createdAt" >= $1
       union
       select distinct "sellContractId", 0 from "Timesheet" where "submittedAt" >= $1
       union
       select l."sellContractId", u.depth + 1
       from up u
       join "BuyContract" b on b."supplierSellContractId" = u.sc
       join "ContractLink" l on l."buyContractId" = b.id
       where u.depth < 8
     )
     select distinct s.id, s.state::text as state
     from up u join "SellContract" s on s.id = u.sc
     where not exists (select 1 from "BuyContract" b where b."supplierSellContractId" = s.id)`,
    since,
  )
  if (tops.length === 0) return []

  // Each top's rungs, downward through the buy lines that name a supplier's line.
  const chain = await db.$queryRawUnsafe<{ top: string; sc: string; depth: number; sellerKind: string; payer: string }[]>(
    `with recursive chain(top, sc, depth) as (
       select id, id, 0 from "SellContract" where id = any($1::text[])
       union
       select c.top, b."supplierSellContractId", c.depth + 1
       from chain c
       join "ContractLink" l on l."sellContractId" = c.sc
       join "BuyContract" b on b.id = l."buyContractId"
       where b."supplierSellContractId" is not null and c.depth < 8
     )
     select c.top, c.sc, c.depth, co.kind::text as "sellerKind", s."clientCompanyId" as payer
     from chain c
     join "SellContract" s on s.id = c.sc
     join "Company" co on co.id = s."companyId"`,
    tops.map((t) => t.id),
  )
  const rungsOf = new Map<string, { sc: string; depth: number; sellerKind: string; payer: string }[]>()
  for (const r of chain) {
    const list = rungsOf.get(r.top) ?? []
    if (!list.some((x) => x.sc === r.sc)) list.push({ sc: r.sc, depth: Number(r.depth), sellerKind: r.sellerKind, payer: r.payer })
    rungsOf.set(r.top, list)
  }
  for (const list of rungsOf.values()) list.sort((a, b) => a.depth - b.depth)
  const allLines = ids(chain.map((r) => r.sc))

  const [weeks, bills, payLines] = await Promise.all([
    db.$queryRawUnsafe<{ id: string; sc: string; start: Date; end: Date; signed: Date | null }[]>(
      `select id, "sellContractId" as sc, "periodStart" as start, "periodEnd" as "end", "clientApprovedAt" as signed
       from "Timesheet" where "sellContractId" = any($1::text[])`,
      allLines,
    ),
    db.$queryRawUnsafe<{ sc: string; status: string; receivedAt: Date | null; total: string; paid: string }[]>(
      `select distinct l."sellContractId" as sc, i.id, i.status, i."receivedAt", i.total::text as total, i.paid::text as paid
       from "InvoiceLine" l join "Invoice" i on i.id = l."invoiceId"
       where l."sellContractId" = any($1::text[])`,
      allLines,
    ),
    // The employer's own buy line under each bottom rung: the one that pays the person.
    db.$queryRawUnsafe<{ sc: string; buyContractId: string; employer: string }[]>(
      `select l."sellContractId" as sc, b.id as "buyContractId", b."companyId" as employer
       from "ContractLink" l join "BuyContract" b on b.id = l."buyContractId"
       where l."sellContractId" = any($1::text[]) and b."supplierSellContractId" is null`,
      allLines,
    ),
  ])

  const weekIds = weeks.map((w) => w.id)
  const keyed = weekIds.length
    ? await db.$queryRawUnsafe<{ timesheetId: string; payer: string; status: string; paidAt: Date | null }[]>(
        `select distinct vbl."timesheetId", vb."companyId" as payer, vb.status, vb."paidAt", vb.id
         from "VendorBillLine" vbl join "VendorBill" vb on vb.id = vbl."vendorBillId"
         where vbl."timesheetId" = any($1::text[])`,
        weekIds,
      )
    : []
  const employers = ids(payLines.map((p) => p.employer))
  const runs = employers.length
    ? await db.$queryRawUnsafe<{ payload: Row }[]>(
        `select payload from "AutomationLog"
         where action = 'PAYROLL_RUN' and payload->>'action' = 'calculate' and "companyId" = any($1::text[])`,
        employers,
      )
    : []
  // Every pay line and period a calculate run worked out, without a refusal.
  const workedOut: { buyContractId: string; start: string; end: string }[] = []
  for (const r of runs) {
    for (const row of ((r.payload?.contracts as Row[] | undefined) ?? [])) {
      const period = row.payPeriod as { start?: string; end?: string } | undefined
      if (row.refused || typeof row.buyContractId !== 'string' || !period?.start || !period?.end) continue
      workedOut.push({ buyContractId: row.buyContractId, start: period.start.slice(0, 10), end: period.end.slice(0, 10) })
    }
  }

  const day = (d: Date) => new Date(d).toISOString().slice(0, 10)
  return tops.map((t) => {
    const rungs = rungsOf.get(t.id) ?? []
    const lines = new Set(rungs.map((r) => r.sc))
    const myWeeks = weeks.filter((w) => lines.has(w.sc))
    const myWeekIds = new Set(myWeeks.map((w) => w.id))
    const facts: RungFacts[] = rungs.map((r) => {
      const sent = bills.filter((b) => b.sc === r.sc && isSent(b.status))
      const typed = keyed.filter((k) => myWeekIds.has(k.timesheetId) && k.payer === r.payer)
      const paidBill = sent.some((b) => b.status === 'PAID' || (Number(b.total) > 0 && Number(b.paid) >= Number(b.total)))
      const paidTyped = typed.some((k) => k.status === 'PAID' || k.paidAt !== null)
      return {
        sellContractId: r.sc,
        sellerKind: r.sellerKind,
        billed: sent.length > 0 || typed.length > 0,
        received: sent.some((b) => b.receivedAt !== null) || typed.length > 0 || paidBill,
        paid: paidBill || paidTyped,
      }
    })
    const bottom = rungs[rungs.length - 1]
    const payBuyLines = new Set(payLines.filter((p) => p.sc === bottom?.sc).map((p) => p.buyContractId))
    const payWorkedOut = workedOut.some((w) =>
      payBuyLines.has(w.buyContractId) && myWeeks.some((wk) => day(wk.start) <= w.end && day(wk.end) >= w.start))
    return {
      id: t.id,
      started: ['IN_PROGRESS', 'PAUSED', 'ENDED'].includes(t.state),
      weeksSigned: myWeeks.filter((w) => w.signed !== null).length,
      rungs: facts,
      payWorkedOut,
    }
  })
}

/** Notices and access-log rows written since the run began. */
export async function rowsWrittenSince(db: PrismaClient, since: Date): Promise<{ notices: number; accessLog: number }> {
  const [[a], [b]] = await Promise.all([
    db.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "Notification" where "createdAt" >= $1`, since),
    db.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "AccessLog" where at >= $1`, since),
  ])
  return { notices: Number(a?.n ?? 0), accessLog: Number(b?.n ?? 0) }
}

/** Both reads, and the count. Never throws: a count that cannot be read is said to be unread, not zero. */
export async function completeTransactions(db: PrismaClient, since: Date): Promise<CompleteCount | { unread: string }> {
  try {
    const [facts, written] = await Promise.all([readPlacementFacts(db, since), rowsWrittenSince(db, since)])
    return countComplete(facts, written)
  } catch (e: any) {
    return { unread: String(e?.message ?? e).split('\n')[0] }
  }
}
