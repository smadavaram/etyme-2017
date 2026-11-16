import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planRepair, weeksPaidAfter, repairCycles, repairLogSays, repairedSays } from '@/lib/money/window-repair'
import { windowRepairBody, REPAIR_BUTTON, REPAIRING_THE_WINDOW } from '@/lib/money/window-repair-body'
import { windowBehind, windowHeldSays, REPAIR_THE_WINDOW } from '@/lib/money/outside-pay-window'
import { seatedSays } from '@/lib/money/who-raises-bills'
import { daysFor } from '@/lib/contract-links'
import { formatDay } from '@/lib/format-date'

/**
 * A week held on Payroll because it is after a pay window an extension
 * made before 2026-11-16 left at the first end. The held sentence pointed
 * at a repair nothing in the product could make: a dead end. Now a seat
 * that runs payroll presses Repair the pay window on the held row.
 *
 * Every date is written out; nothing reads the clock or the seeded world.
 */

const u = (s: string) => new Date(`${s}T00:00:00.000Z`)
const FIRST_END = '2026-11-07' // a Saturday
const SELL_END = '2027-02-06'
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const links = [{ id: 'link-1', buyContractId: 'pay-1', effectiveFrom: u('2026-08-02'), effectiveTo: u(FIRST_END) }]
const week = (sunday: string) => {
  const out: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) out[new Date(u(sunday).getTime() + i * 86_400_000).toISOString().slice(0, 10)] = 8
  return out
}
const inside = { id: 'ts-in', days: week('2026-11-01') }
const after = { id: 'ts-after', days: week('2026-11-08') }
const base = {
  personName: 'Lena Okafor',
  buyContractId: 'pay-1',
  links,
  sellEnd: u(SELL_END),
  rows: [{ id: 'row-lena', endDate: u(FIRST_END) }],
  paid: Object.entries(inside.days).map(([day, hours]) => ({ timesheetId: inside.id, day, hours })),
  sheets: [inside, after],
}

describe('repairing a pay window an extension left behind', () => {
  it("repairing a held window moves it and her row to the placement's end, and the held week is paid once on the next calculation", () => {
    const plan = planRepair(base)
    expect(plan).toEqual({
      ok: true,
      endedOn: FIRST_END,
      sellEnds: SELL_END,
      links: [{ id: 'link-1', from: FIRST_END, to: SELL_END }],
      rows: [{ id: 'row-lena', from: FIRST_END, to: SELL_END }],
    })
    // Before: payroll pays none of the week after the first end.
    const asLinks = (l: typeof links) => l.map((x) => ({ ...x, sellContractId: 's' }))
    expect(daysFor('pay-1', asLinks(links), after.days)).toEqual({})
    // After: the window covers it, so the next calculation pays it, and nothing is held any more.
    const moved = links.map((l) => ({ ...l, effectiveTo: u(SELL_END) }))
    expect(daysFor('pay-1', asLinks(moved), after.days)).toEqual(after.days)
    expect(windowBehind(moved, u(SELL_END))).toBeNull()
    // The week inside the window was paid already: the repair moves nothing that would pay it again.
    expect(weeksPaidAfter(FIRST_END, base.paid, base.sheets)).toEqual([])
  })

  it('a window whose later days a pay run already recorded as paid is not moved, and the refusal names the week', () => {
    const paidAfter = [...base.paid, { timesheetId: after.id, day: '2026-11-10', hours: 8 }]
    const plan = planRepair({ ...base, paid: paidAfter })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.code).toBe('PAID_AFTER_THE_WINDOW')
    expect(plan.says).toBe(
      "A pay run recorded Lena Okafor's week of Nov 8, 2026 as paid, so the pay window was not moved. " +
        'Check it against what your payroll provider paid out, so no day is paid twice.',
    )
  })

  it('a pay line an old run paid as a total, without its days, is not repaired, because the run will not pay it', () => {
    const plan = planRepair({ ...base, unrecordedOn: '2026-09-15' })
    expect(plan).toEqual({
      ok: false,
      status: 409,
      code: 'PAID_UNRECORDED',
      says:
        `A pay run on ${formatDay('2026-09-15')} paid Lena Okafor without recording which days it covered, ` +
        'so the pay window was not moved. Settle this pay line by hand first, so no day is paid twice.',
    })
    // Every sentence short.
    if (!plan.ok) for (const sentence of plan.says.split(/(?<=\.)\s+(?=[A-Z])/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
  })

  it("a week the old run paid as one lump on its first day is read as paid, even where that day is on or before the window's end", () => {
    // The window ended on a Monday; she filed Tuesday to Friday; the run
    // before 2026-11-16 paid the whole week on its Sunday.
    const endedMonday = '2026-11-09'
    const filed = { id: 'ts-lump', days: { '2026-11-10': 8, '2026-11-11': 8, '2026-11-12': 8, '2026-11-13': 8 } }
    expect(weeksPaidAfter(endedMonday, [{ timesheetId: filed.id, day: '2026-11-08', hours: 32 }], [filed])).toEqual(['2026-11-08'])
    // And two weeks are both named.
    const plan = planRepair({
      ...base,
      paid: [...base.paid, { timesheetId: after.id, day: '2026-11-08', hours: 40 }, { timesheetId: 'ts-later', day: '2026-11-16', hours: 40 }],
    })
    expect(plan.ok ? null : plan.says).toContain("Lena Okafor's weeks of Nov 8, 2026 and Nov 15, 2026 as paid")
  })

  it("only her own row and only a window that ends on the window's end are moved", () => {
    const plan = planRepair({
      ...base,
      links: [...links, { id: 'link-old', buyContractId: 'pay-0', effectiveFrom: u('2026-05-03'), effectiveTo: u('2026-08-01') }],
      rows: [{ id: 'row-lena', endDate: u(FIRST_END) }, { id: 'row-lena-earlier', endDate: u('2026-09-30') }],
    })
    expect(plan.ok && plan.links.map((l) => l.id)).toEqual(['link-1'])
    expect(plan.ok && plan.rows.map((r) => r.id)).toEqual(['row-lena'])
  })

  it('a window that already reaches the end of the placement is not moved, and the press is told there is nothing to repair', () => {
    const plan = planRepair({ ...base, sellEnd: u(FIRST_END) })
    expect(plan).toMatchObject({ ok: false, code: 'NOTHING_TO_REPAIR' })
    expect(plan.ok ? null : plan.says).toBe("Lena Okafor's pay window already reaches the end of the placement, so there is nothing to repair.")
    // A pay line that is not the one holding the last window is not the one to repair.
    expect(planRepair({ ...base, buyContractId: 'pay-2' })).toMatchObject({ ok: false, code: 'NOTHING_TO_REPAIR' })
  })

  it('a completed cycle is never widened by a repair', () => {
    const stored = [
      // The pay period that held the first end, settled by a run.
      { id: 'c-done', sellContractId: null, buyContractId: 'pay-1', kind: 'SALARY_PAY', periodStart: u('2026-11-01'), periodEnd: u(FIRST_END), completedAt: u('2026-11-20') },
      // The open one beside it, also cut at the first end.
      { id: 'c-open', sellContractId: null, buyContractId: 'pay-1', kind: 'SALARY_CALCULATE', periodStart: u('2026-11-01'), periodEnd: u(FIRST_END), completedAt: null },
      // A bill on the placement: a repair moves pay, never bills.
      { id: 'c-bill', sellContractId: 's', buyContractId: null, kind: 'INVOICE', periodStart: u('2026-11-01'), periodEnd: u(FIRST_END), completedAt: null },
    ]
    const p = (kind: string, start: string, end: string, line: 'buy' | 'sell' = 'buy') =>
      line === 'buy'
        ? { buyContractId: 'pay-1', kind, dueOn: u(end), periodStart: u(start), periodEnd: u(end) }
        : { sellContractId: 's', kind, dueOn: u(end), periodStart: u(start), periodEnd: u(end) }
    const full = [
      p('SALARY_PAY', '2026-11-01', '2026-11-14'), p('SALARY_CALCULATE', '2026-11-01', '2026-11-14'),
      p('SALARY_PAY', '2026-11-15', '2026-11-28'), p('INVOICE', '2026-11-01', '2026-11-30', 'sell'),
    ]
    const added = [p('SALARY_PAY', '2026-11-15', '2026-11-28'), p('INVOICE', '2026-12-01', '2026-12-31', 'sell')]
    const plan = repairCycles('pay-1', stored, full, added)
    expect(plan.widen).toEqual([{ id: 'c-open', periodEnd: u('2026-11-14') }])
    expect(plan.widen.some((w) => w.id === 'c-done')).toBe(false)
    expect(plan.kept).toBe(1)
    expect(plan.write).toEqual([p('SALARY_PAY', '2026-11-15', '2026-11-28')])
    // And the route widens only where the row is still open, whatever the plan says.
    expect(src('src/app/api/payroll/window-repair/route.ts')).toContain('where: { id: w.id, completedAt: null }')
  })
})

describe('what the held row says, and to whom', () => {
  const held = [{ weekOf: '2026-11-08', endedOn: FIRST_END, hours: 40, whole: true }]

  it('a seat that runs payroll reads "Repair the pay window to pay it." beside the button', () => {
    expect(REPAIR_THE_WINDOW).toBe('Repair the pay window to pay it.')
    expect(windowHeldSays('Lena Okafor', held)).toBe(
      "Lena Okafor's week of Nov 8, 2026, 40 hours, is held off this pay. " +
        'It is after the pay window ended on Nov 7, 2026; the placement was extended. Repair the pay window to pay it.',
    )
    expect(REPAIR_BUTTON).toBe('Repair the pay window')
  })

  it('a seat that may not run payroll is told who may', () => {
    const who = seatedSays(REPAIRING_THE_WINDOW, ['AP & Payroll'])!
    expect(who).toBe('Repairing the pay window is for the AP & Payroll here. Ask them.')
    expect(windowHeldSays('Lena Okafor', held, who)).toMatch(/extended\. Repairing the pay window is for the AP & Payroll here\. Ask them\.$/)
    // The payroll page and the repair route both ask the seats the firm has filled, for the run's own permission.
    const route = src('src/app/api/payroll/route.ts')
    expect(route).toContain("whoHereMaySays(caller, { doing: REPAIRING_THE_WINDOW, needs: 'payroll.run' })")
    expect(route).toContain('windowHeldSays(cand.person.name, windowInPeriod, windowNext)')
    const repair = src('src/app/api/payroll/window-repair/route.ts')
    expect(repair).toContain("hasPermission(caller.permissions, 'payroll.run')")
    expect(repair).toContain("whoHereMaySays(caller, { doing: REPAIRING_THE_WINDOW, needs: 'payroll.run' })")
    // The button is drawn only for a seat that runs payroll.
    const page = src('src/app/dashboard/payroll/page.tsx')
    expect(page).toContain("const mayRepairWindow = hasPermission(permissions, 'payroll.run')")
    expect(page).toContain('{mayRepairWindow && (row.windowRepairs ?? []).map')
  })

  it('every field the repair route reads is one the button sends', () => {
    const route = src('src/app/api/payroll/window-repair/route.ts')
    const read = new Set([...route.matchAll(/body\.([a-zA-Z]+)/g)].map((m) => m[1]))
    const sent = new Set(Object.keys(windowRepairBody({ sellContractId: 's', buyContractId: 'b', personId: 'p' })))
    expect([...read].sort()).toEqual([...sent].sort())
    expect(src('src/app/dashboard/payroll/window-repair.tsx')).toContain('JSON.stringify(windowRepairBody(target))')
  })

  it('the activity log row says who moved the window, from and to, and that nothing undoes it', () => {
    const said = repairLogSays({ personName: 'Lena Okafor', byName: 'Dana Whitfield', from: FIRST_END, to: SELL_END })
    expect(said.summary).toBe("Lena Okafor's pay window moved from Nov 7, 2026 to Feb 6, 2027")
    expect(said.reason).toBe(
      'Dana Whitfield repaired the pay window on Payroll, so the weeks after Nov 7, 2026 are paid on the next calculation. ' +
        'Nothing in Etyme undoes this repair.',
    )
    expect(src('src/app/api/payroll/window-repair/route.ts')).toContain('reversible: false')
    expect(repairedSays('Lena Okafor', SELL_END)).toBe("Lena Okafor's pay window now runs to Feb 6, 2027. Calculate this pay to include the held week.")
  })

  it('every sentence is short: none past twenty-five words', () => {
    const refused = planRepair({ ...base, paid: [...base.paid, { timesheetId: after.id, day: '2026-11-10', hours: 8 }] })
    const all = [
      refused.ok ? '' : refused.says,
      ...Object.values(repairLogSays({ personName: 'Lena Okafor', byName: 'Dana Whitfield', from: FIRST_END, to: SELL_END })),
      repairedSays('Lena Okafor', SELL_END),
    ]
    for (const text of all) {
      for (const sentence of text.split(/(?<=\.)\s+(?=[A-Z])/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(25)
    }
  })
})
