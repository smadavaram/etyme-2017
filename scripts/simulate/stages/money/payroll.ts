/**
 * Stage: payroll. Owned by money.
 *
 * The employer pays its own W2 workers by payroll, never by invoice, one
 * pay period at a time: the periods of each pay line (every other week
 * where the line says so, Sunday to Saturday, counted from the Sunday the
 * placement started on or before), read the same way the run route reads
 * them (`periodTermsFor` and `periodFor`). The payroll clerk works each
 * period out, approves it, and pays it (`POST /api/payroll/run`,
 * `calculate` → `approve` → `process`). Overtime is counted per week
 * inside a period, never averaged across two, and on a week accepted
 * short the worker keeps their overtime (the cut comes off ordinary
 * hours) — the route decides both; the run reports what it paid.
 *
 * And the rule held on purpose: pay is never processed before it is
 * worked out.
 */
import { defineStage, type PayrollRunFact } from '../../stage'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { periodFor, type Period } from '@/lib/periods'
import { placementsOf, seatWith, weekExtra, iso, dollars, says } from './book'

interface Group { employerId: string; employerSlug: string; period: Period; buyIds: Set<string>; personIds: Set<string> }

export default defineStage({
  name: 'payroll',
  domain: 'MONEY',
  async run(ctx) {
    const { placements } = await placementsOf(ctx)
    const w2 = placements.filter((p) => p.w2BuyId)
    if (w2.length === 0) return { closed: 0, says: 'No placement in this run is paid by payroll.' }

    const lines = await ctx.read.buyContract.findMany({
      where: { id: { in: w2.map((p) => p.w2BuyId!) } },
      select: {
        id: true, startDate: true, endDate: true, payFrequency: true, payAnchor: true, payStraddle: true,
        paymentTermsFrom: true, payCurrency: true, termsDifferReason: true,
        workOrder: { select: ORDER_HEADER_SELECT },
        candidates: { select: { personId: true, startDate: true } },
      },
    })

    // Each pay period holding a day the employer accepted in this run.
    const groups = new Map<string, Group>()
    const frequencies = new Map<string, number>()
    for (const p of w2) {
      const line = lines.find((l) => l.id === p.w2BuyId)
      if (!line) continue
      const cand = line.candidates.find((c) => c.personId === p.personId)
      const terms = { ...periodTermsFor('BUY', line), startedOn: cand?.startDate ?? line.startDate }
      frequencies.set(terms.frequency, (frequencies.get(terms.frequency) ?? 0) + 1)
      for (const w of ctx.world.weeks.filter((x) => x.contractId === p.id)) {
        const x = weekExtra(w)
        if (x.accepted?.[p.bottom.sellerId] == null) continue
        for (const day of Object.keys(x.days)) {
          const period = periodFor(new Date(`${day}T00:00:00Z`), terms)
          const key = `${p.bottom.sellerId}/${iso(period.start)}/${iso(period.end)}`
          const g = groups.get(key) ?? { employerId: p.bottom.sellerId, employerSlug: p.bottom.sellerSlug, period, buyIds: new Set(), personIds: new Set() }
          g.buyIds.add(line.id)
          g.personIds.add(p.personId)
          groups.set(key, g)
        }
      }
    }
    const list = [...groups.values()].sort((a, b) => a.period.start.getTime() - b.period.start.getTime())
    if (list.length === 0) return { closed: 0, says: 'No week in this run was accepted by an employer that pays by payroll.' }

    // ── The rule, held on purpose: nothing is paid before it is worked out ──
    const first = list[0]
    let firstPaidEarly = false
    const clerk0 = await seatWith(ctx, first.employerId, 'payroll.run', [...first.personIds])
    if (clerk0) {
      const res = await ctx.expectRefusal(
        clerk0,
        (a) => a.post('/api/payroll/run', {
          buyContractIds: [...first.buyIds], action: 'process',
          period: { start: iso(first.period.start), end: iso(first.period.end) },
        }),
        /worked out|calculat/i
      )
      firstPaidEarly = res.ok
    }

    let runs = 0
    let paidPeople = 0
    let grossCents = 0
    let overtimeHours = 0
    let premiumCents = 0
    const refusedSays: string[] = []
    /** What the route said about overtime, the weekly line and accepted hours, once each. */
    const sentences: string[] = []
    await ctx.parallel(list, async (g) => {
      if (g === first && firstPaidEarly) return
      const clerk = await seatWith(ctx, g.employerId, 'payroll.run', [...g.personIds])
      if (!clerk) return
      const body = { buyContractIds: [...g.buyIds], period: { start: iso(g.period.start), end: iso(g.period.end) } }
      for (const action of ['calculate', 'approve', 'process'] as const) {
        const res = await clerk.post('/api/payroll/run', { ...body, action })
        if (!res.ok) return
        if (action !== 'process') continue
        const rows: any[] = res.json?.data?.details ?? []
        runs++
        for (const r of rows) {
          if (r.refused) {
            if (!refusedSays.includes(r.refused)) refusedSays.push(r.refused)
            continue
          }
          for (const said of [r.overtime, r.payLine, r.accepted, r.straightTime]) {
            if (typeof said === 'string' && said && !sentences.includes(said)) sentences.push(said)
          }
          if (Number(r.grossPay) > 0) paidPeople++
          grossCents += Number(r.grossPay) || 0
          overtimeHours += Number(r.overtimeHours) || 0
          premiumCents += Number(r.premiumCents) || 0
        }
        const fact: PayrollRunFact = {
          id: `${g.employerSlug}/${iso(g.period.start)}`, by: clerk.key, companySlug: g.employerSlug,
          periodStart: iso(g.period.start), periodEnd: iso(g.period.end), people: g.personIds.size,
          extra: { label: g.period.label, gross: rows.map((r) => ({ person: r.personName, grossPay: r.grossPay, hours: r.totalHours, overtime: r.overtime, accepted: r.accepted })) },
        }
        ctx.world.payrollRuns.push(fact)
      }
    })

    const freq = [...frequencies.entries()].map(([f, n]) => `${n} ${f.toLowerCase()}`).join(', ')
    return {
      closed: runs,
      of: list.length,
      says: says([
        `${runs} of ${list.length} pay periods worked out, approved and paid by the employer's payroll clerk (pay lines: ${freq}).`,
        `${paidPeople} pay lines carried pay, ${dollars(grossCents)} gross (USD), ${Math.round(overtimeHours * 100) / 100} overtime hours with ${dollars(premiumCents)} of premium.`,
        firstPaidEarly ? 'A period was paid with no calculation before it: the run route does not refuse it, which is a money gap.' : null,
        refusedSays.length ? `Not paid, in the route's words: ${refusedSays.slice(0, 2).join(' ')}` : null,
        sentences.length ? `What the pay lines said: ${sentences.slice(0, 4).join(' ')}` : null,
      ]),
    }
  },
})
