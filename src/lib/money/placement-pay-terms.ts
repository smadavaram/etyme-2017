/**
 * What one placement needs to be costed the way payroll pays it.
 *
 * A placement's cost is what payroll pays: straight time on the hours the
 * employer accepted, cut the way the run cuts a short week, plus the
 * overtime premium on the hours over the line. The placement page priced
 * straight time only, so Rosa Delgado's forty-five-hour week in August
 * cost $3,150 on her placement and $3,325 in payroll.
 *
 * This file reads the facts the run reads — the buy line's own row, the
 * sell line the hours are on, the person's pay currency, the employer's
 * exempt assertion — and hands them to the run's own functions
 * (`payLineOn`, `methodFor`, `wageLineFor`). Nothing here decides a line,
 * a method or a premium; `placementEarned` then prices each week through
 * `sheetPay`, which is the call the run, the worker's page and back pay
 * make. One door, no second copy.
 *
 * `placementMoneySheets` loads every sheet on the placement with the
 * columns that cutting a week needs (leave, which days an acceptance
 * covers, who signed it). Every sheet, never the dozen on the card.
 */

import { prisma } from '@/lib/db'
import { payLineOn } from '@/lib/money/pay-line'
import { methodFor } from '@/lib/money/overtime-method'
import { wageLineFor, EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import type { PayOvertime, SheetToPrice } from '@/lib/money/placement-earned'
import { ladderFor, laddersOver, type BookRung } from '@/lib/work-chain-read'
import { whereHoursLive } from '@/lib/work-chain'
import { rungView } from '@/lib/money/hop-ledger'

/** One person on one buy line, for the sell line the hours are filed on. */
export interface PayTermsKey {
  buyContractId: string
  sellContractId: string
  personId: string
}

export const payTermsKey = (k: PayTermsKey) => `${k.buyContractId}|${k.sellContractId}|${k.personId}`

/**
 * The overtime terms of one person's pay on one buy line, for the sell
 * line the hours are filed on. Null where the line, the sell line or the
 * person on it is not found — and a caller passing null gets a cost that
 * refuses a week over forty hours rather than one priced short.
 */
export async function placementPayTerms(input: PayTermsKey): Promise<PayOvertime | null> {
  return (await placementPayTermsMany([input])).get(payTermsKey(input)) ?? null
}

/**
 * The same, for a book of placements in two reads, keyed by `payTermsKey`.
 * The profitability screen asks this for every pair it prices, so the book
 * and the placement page cost a placement the same way.
 */
export async function placementPayTermsMany(keys: readonly PayTermsKey[]): Promise<Map<string, PayOvertime>> {
  const out = new Map<string, PayOvertime>()
  if (keys.length === 0) return out
  const buyIds = [...new Set(keys.map((k) => k.buyContractId))]
  const sellIds = [...new Set(keys.map((k) => k.sellContractId))]
  const personIds = [...new Set(keys.map((k) => k.personId))]
  const [buys, sells] = await Promise.all([
    prisma.buyContract.findMany({
      where: { id: { in: buyIds } },
      include: {
        company: { select: { name: true } },
        entity: { select: { country: true } },
        exemptAssertions: { where: { personId: { in: personIds } }, select: EXEMPT_SELECT },
        candidates: {
          where: { personId: { in: personIds } },
          select: { personId: true, payCurrency: true, person: { select: { name: true } } },
        },
      },
    }),
    prisma.sellContract.findMany({
      where: { id: { in: sellIds } },
      select: { id: true, overtimeAfterHours: true, workLocation: { select: { country: true } } },
    }),
  ])
  const buyOf = new Map(buys.map((b) => [b.id, b]))
  const sellOf = new Map(sells.map((x) => [x.id, x]))
  for (const k of keys) {
    const bc = buyOf.get(k.buyContractId)
    const sell = sellOf.get(k.sellContractId)
    const cand = bc?.candidates.find((c) => c.personId === k.personId)
    if (!bc || !sell || !cand) continue
    const row = bc.exemptAssertions.find((a) => a.personId === k.personId) ?? null
    out.set(payTermsKey(k), {
      afterHours: payLineOn(bc, sell, { name: cand.person.name, payCurrency: cand.payCurrency }, row).afterHours,
      method: methodFor(bc).method,
      wage: wageLineFor(bc, cand.person.name, row),
      payerCompanyId: bc.companyId,
    })
  }
  return out
}

/**
 * Every sheet a sell line is priced on, with what pricing and cutting a
 * week read — as that line's rung sees it.
 *
 * A week is filed once, on the employer's line at the bottom of a chain
 * (lib/work-chain). So a line higher up has no sheets of its own: Computer
 * Systems' line to Northbend Athletic carries none of Helena Marsh's
 * weeks, which are filed on Techpeple's. This reads the sheets from the
 * bottom of the line's ladder, and keys each one's signatures to what this
 * rung bills and costs on (`rungView` in lib/money/hop-ledger): the payer's
 * acceptance on this rung as the billing signature, this firm's own
 * acceptance of the rung below — or for pay, at hop 0 — as the costing
 * one. Every other firm's signature is left out, so a rung is never priced
 * from a signature that is not its own to read. On a direct placement
 * nothing changes.
 */
export async function placementMoneySheets(sellContractId: string): Promise<SheetToPrice[]> {
  return (await rungMoneySheets([sellContractId])).get(sellContractId) ?? []
}

/** A sheet priced for one rung, carrying its id so a bill line can be matched to it. */
export type RungSheet = SheetToPrice & { id: string }

const SHEET_SELECT = {
  id: true, periodStart: true, periodEnd: true, days: true, leaveDays: true, acceptedHours: true,
  assertions: {
    where: { state: 'LIVE' },
    select: { role: true, hours: true, rateCents: true, companyId: true, coversFrom: true, coversTo: true },
  },
} as const

/** The same, for many lines, keyed by sell line. */
export async function rungMoneySheets(sellContractIds: readonly string[]): Promise<Map<string, RungSheet[]>> {
  const read = await readRungs(sellContractIds)
  return new Map([...read.entries()].map(([id, r]) => [id, r.sheets]))
}

/** One sell line as the books read it: its rung, the ladder it is on, and its sheets keyed to it. */
export interface RungRead {
  /** Null where the ladder over this line's hours does not reach it — a broken link. */
  rung: BookRung | null
  ladder: BookRung[]
  sheets: RungSheet[]
}

/** Every line's rung, ladder and sheets, in a handful of reads. */
export async function readRungs(sellContractIds: readonly string[]): Promise<Map<string, RungRead>> {
  const out = new Map<string, RungRead>()
  const ids = [...new Set(sellContractIds)]
  if (ids.length === 0) return out
  // Where each line's hours are filed: the bottom of its ladder.
  const rungs = await ladderFor(ids)
  const bottomOf = new Map(ids.map((id) => [id, whereHoursLive(id, rungs)]))
  const bottoms = [...new Set(bottomOf.values())]
  const [sheets, ladders] = await Promise.all([
    prisma.timesheet.findMany({
      where: { sellContractId: { in: bottoms } },
      orderBy: { periodStart: 'asc' },
      select: { sellContractId: true, ...SHEET_SELECT },
    }),
    laddersOver(bottoms),
  ])
  const ladderOf = ladders
  for (const id of ids) {
    const bottom = bottomOf.get(id)!
    const ladder = ladderOf.get(bottom) ?? []
    const rung = ladder.find((r) => r.sellContractId === id) ?? null
    // A line the ladder above its hours does not reach is a broken link,
    // and it is priced on nothing rather than on another rung's signatures.
    if (!rung) {
      out.set(id, { rung: null, ladder, sheets: [] })
      continue
    }
    const mine = sheets.filter((t) => t.sellContractId === bottom)
    out.set(id, {
      rung,
      ladder,
      sheets: mine.map(({ sellContractId: _filedOn, ...t }) => ({ ...t, assertions: rungView(rung, ladder, t.assertions) })),
    })
  }
  return out
}
