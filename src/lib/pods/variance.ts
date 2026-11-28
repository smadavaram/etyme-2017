/**
 * Planned versus actual on a sold team (records 120 and 123). Pure: no
 * database here.
 *
 * The trade's terms, figures only: planned value (PV), earned value (EV),
 * actual cost (AC), schedule variance (SV = EV - PV), cost variance
 * (CV = EV - AC), and the two indexes (SPI = EV / PV, CPI = EV / AC).
 *
 *   PV  the baseline price of every deliverable whose baseline date has come
 *   EV  the baseline price of every deliverable the client accepted
 *   AC  the pay, burden and premium posted on the project
 *
 * Everything is read off the baseline taken at the sale, never the price a
 * deliverable carries now. A figure the record cannot support is null with
 * the reason beside it: a deliverable sold before baselines were kept, one
 * with no due date, a cancelled one, a member with no pay record, two
 * currencies, or a cost of nothing. Nothing is estimated and nothing is
 * spread between dates, because only due dates are known.
 *
 * The cost side is built only where the caller may read margin.
 */
import { COST_KINDS, EARNED_STATUSES } from '@/lib/money/pod-margin'

export interface VarianceFacts {
  asOf: Date
  currency: string
  deliverables: { name: string; status: string; baselineDueOn: Date | null; baselineAmountCents: number | null; acceptedAt: Date | null }[]
  /** Null where the reader may not read cost: no cost figure is built. */
  cost: null | {
    members: { personId: string; name: string }[]
    postings: { personId: string | null; kind: string; amountCents: number; currency: string }[]
  }
}

export interface DeliverableVariance {
  name: string
  plannedOn: string | null
  actualOn: string | null
  /** Whole days; positive is late. Null where there is nothing honest to say. */
  daysVariance: number | null
  /** ACCEPTED: accepted date less planned. OVERDUE: today less planned, not accepted yet. */
  basis: 'ACCEPTED' | 'OVERDUE' | null
}

export interface ProjectVariance {
  currency: string
  schedule: { pvCents: number | null; evCents: number | null; svCents: number | null; spi: number | null; unknowns: string[] }
  cost: null | { acCents: number | null; cvCents: number | null; cpi: number | null; unknowns: string[] }
  deliverables: DeliverableVariance[]
}

const DAY = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY)
const ratio = (a: number, b: number): number | null => (b === 0 ? null : Math.round((a / b) * 100) / 100)
const earned = (status: string) => (EARNED_STATUSES as readonly string[]).includes(status)

export function projectVariance(f: VarianceFacts): ProjectVariance {
  const today = dayNumber(f.asOf)

  const deliverables: DeliverableVariance[] = f.deliverables.map((x) => {
    const plannedOn = x.baselineDueOn ? isoDay(x.baselineDueOn) : null
    const base = { name: x.name, plannedOn }
    if (!x.baselineDueOn) return { ...base, actualOn: x.acceptedAt && earned(x.status) ? isoDay(x.acceptedAt) : null, daysVariance: null, basis: null }
    const planned = dayNumber(x.baselineDueOn)
    if (earned(x.status) && x.acceptedAt) {
      return { ...base, actualOn: isoDay(x.acceptedAt), daysVariance: dayNumber(x.acceptedAt) - planned, basis: 'ACCEPTED' }
    }
    if (!earned(x.status) && today > planned) return { ...base, actualOn: null, daysVariance: today - planned, basis: 'OVERDUE' }
    return { ...base, actualOn: null, daysVariance: null, basis: null }
  })

  // Schedule.
  const unknowns: string[] = []
  if (f.deliverables.length === 0) unknowns.push('This project has no deliverables, so there is no plan to compare.')
  if (f.deliverables.some((x) => x.baselineAmountCents == null)) unknowns.push('A deliverable was sold before plans were kept, so no plan was saved for it.')
  if (f.deliverables.some((x) => x.baselineAmountCents != null && !x.baselineDueOn)) unknowns.push('A deliverable was sold with no due date, so planned value is not known.')
  if (f.deliverables.some((x) => x.status === 'CANCELLED')) unknowns.push('A deliverable was cancelled, so the plan no longer matches what was sold.')
  const noPlan = unknowns.some((u) => u.includes('no deliverables') || u.includes('no plan was saved') || u.includes('cancelled'))
  const noDates = unknowns.some((u) => u.includes('no due date'))
  const price = (x: { baselineAmountCents: number | null }) => x.baselineAmountCents ?? 0
  const evCents = noPlan ? null : f.deliverables.filter((x) => earned(x.status)).reduce((n, x) => n + price(x), 0)
  const pvCents = noPlan || noDates ? null : f.deliverables.filter((x) => x.baselineDueOn && dayNumber(x.baselineDueOn) <= today).reduce((n, x) => n + price(x), 0)
  const svCents = evCents !== null && pvCents !== null ? evCents - pvCents : null
  const spi = evCents !== null && pvCents !== null ? ratio(evCents, pvCents) : null
  if (pvCents === 0) unknowns.push('Nothing was due yet, so there is no schedule index.')

  // Cost, only where the reader may read margin.
  let cost: ProjectVariance['cost'] = null
  if (f.cost) {
    const cu: string[] = []
    const rows = f.cost.postings.filter((p) => (COST_KINDS as readonly string[]).includes(p.kind))
    const other = [...new Set(rows.map((p) => p.currency).filter((c) => c !== f.currency))].sort()
    if (other.length) cu.push(`The project is in ${f.currency} but costs are posted in ${other.join(' and ')}, and two currencies are never added.`)
    for (const m of f.cost.members) {
      const paid = f.cost.postings.filter((p) => p.kind === 'PAY' && p.personId === m.personId).reduce((n, p) => n + p.amountCents, 0)
      if (paid === 0) cu.push(`${m.name} has no pay record on this project, so her cost is not known.`)
    }
    const total = -rows.reduce((n, p) => n + p.amountCents, 0)
    if (cu.length === 0 && total <= 0) cu.push('The cost of this project is zero, which is a missing link and not a perfect result.')
    const acCents = cu.length === 0 ? total : null
    cost = {
      acCents,
      cvCents: acCents !== null && evCents !== null ? evCents - acCents : null,
      cpi: acCents !== null && evCents !== null ? ratio(evCents, acCents) : null,
      unknowns: cu,
    }
  }

  return { currency: f.currency, schedule: { pvCents, evCents, svCents, spi, unknowns }, cost, deliverables }
}
