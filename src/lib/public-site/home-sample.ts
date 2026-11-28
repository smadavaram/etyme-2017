/**
 * The sample company the home page's Ask Etyme and CFO view draw: Corvane
 * Packaging, the seed's, labeled "Demo — not a customer". Every name and
 * figure is read from the seed (`lib/seed-corvane`) and the product's own
 * spend arithmetic (`./corvane-map`); nothing is typed here. The approved
 * design of 2026-11-18 showed a firm of its own invention, and the
 * standing rule is that no figure on a public page is invented.
 *
 * Four questions, as the design has four: spend by supplier, who is
 * nearest the time limit, which supplier invoices are held, and whose
 * start is on hold. Server only: it reads the seed.
 */
import { CORVANE_PLANTS, CORVANE_RECEIPTS, CORVANE_COUNTRIES, corvaneContractors, receiptOverMinor } from '@/lib/seed-corvane'
import { corvaneDemoFacts } from '@/lib/seed-corvane/plan'
import { format, fromMinor } from '@/lib/money'
import { daysToLimit, spendInDollars } from './corvane-map'
import { homeCfo, type HomeCfo } from './home-cfo'

export interface SampleQuestion {
  key: 'pay' | 'limit' | 'held' | 'start'
  question: string
  lead: string
  rest: string
  note: string
  head: [string, string, string]
  rows: [string, string, string][]
  total?: [string, string, string]
}
export interface HomeSample { context: string; company: string; questions: SampleQuestion[]; cfo: HomeCfo }

/** The suppliers named in the pay table; the rest are one line. */
const TOP = 5
const usd = (minor: number) => format(fromMinor(minor, 'USD'), { compact: true })
const own = (minor: number, cur: string) => format(fromMinor(minor, cur), { compact: true })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function homeSample(): HomeSample {
  const f = corvaneDemoFacts()
  const { onSite, onHold } = corvaneContractors()
  const suppliers = [...new Set(onSite.map((c) => c.supplier))]
  const total = spendInDollars(onSite)
  const bySupplier = suppliers
    .map((s) => {
      const people = onSite.filter((c) => c.supplier === s)
      return { s, n: people.length, spend: spendInDollars(people) }
    })
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))

  const rest = bySupplier.slice(TOP)
  const restSpend = rest.length === 0 ? 0 : spendInDollars(onSite.filter((c) => rest.some((r) => r.s === c.supplier)))
  const near = [...onSite].sort((a, b) => daysToLimit(a) - daysToLimit(b)).slice(0, 3)
  const held = CORVANE_RECEIPTS.filter((r) => r.held).map((r) => {
    const plant = CORVANE_PLANTS.find((p) => p.key === r.plant)!
    return { city: plant.city, hours: `${r.billed} of ${r.accepted}`, over: own(receiptOverMinor(r), CORVANE_COUNTRIES[plant.cc].currency) }
  })

  const questions: SampleQuestion[] = [
    {
      key: 'pay', question: 'What am I paying across every supplier this month?',
      lead: total === null ? 'No sample rate' : `${usd(total)}`,
      rest: total === null ? 'for one currency, so no total is shown' : `this month, across ${plural(suppliers.length, 'supplier')}`,
      note: 'Every contractor on site at their bill rate for 160 hours, in dollars at sample exchange rates. Check any row in the record.',
      head: ['Supplier', 'Contractors', 'This month'],
      rows: [
        ...bySupplier.slice(0, TOP).map((r) => [r.s, String(r.n), r.spend === null ? '—' : usd(r.spend)] as [string, string, string]),
        ...(rest.length === 0 ? [] : [[`${plural(rest.length, 'other supplier')}`, String(rest.reduce((n, r) => n + r.n, 0)), restSpend === null ? '—' : usd(restSpend)] as [string, string, string]]),
      ],
      total: total === null ? undefined : ['All suppliers', String(onSite.length), usd(total)],
    },
    {
      key: 'limit', question: 'Who is closest to the time limit?',
      lead: near[0].name, rest: `reaches the ${f.limitMonths}-month limit in ${plural(daysToLimit(near[0]), 'day')}`,
      note: 'Months here are counted across every supplier, never rounded up. The record shows each period.',
      head: ['Contractor', 'Site · supplier', 'Time left'],
      rows: near.map((c) => [c.name, `${c.plant.city} · ${c.supplier}`, plural(daysToLimit(c), 'day')]),
    },
    {
      key: 'held', question: 'Which supplier invoices are held, and why?',
      lead: plural(held.length, 'supplier invoice'), rest: 'held — each bills more hours than were signed',
      note: 'A supplier invoice that disagrees with the signed week is held and flagged, never silently paid.',
      head: ['Site', 'Hours billed of signed', 'Billed over signed hours'],
      rows: held.map((h) => [h.city, h.hours, h.over]),
    },
    {
      key: 'start', question: 'Whose start is on hold?',
      lead: '1 start', rest: 'waiting on an I-9',
      note: 'Nobody starts without the paper that lets them. The record says what is missing.',
      head: ['Contractor', 'Site', 'Waiting on'],
      rows: [[onHold.name, onHold.plant.city, 'I-9']],
    },
  ]
  return {
    company: f.company,
    context: `${f.company}: ${plural(onSite.length, 'contractor')} through ${plural(suppliers.length, 'supplier')}` + (total === null ? '' : ` · ${usd(total)} this month at sample rates`),
    questions,
    cfo: homeCfo(),
  }
}

/** Every line the sample shows, for the guards. */
export function homeSampleLines(s: HomeSample = homeSample()): string[] {
  return [
    s.context,
    ...s.questions.flatMap((q) => [q.question, `${q.lead} ${q.rest}`, q.note, ...q.head, ...q.rows.flat(), ...(q.total ?? [])]),
    ...s.cfo.tiles.map((t) => `${t.b} ${t.s}`),
    ...s.cfo.lines.map((l) => (l.lead ? `${l.lead} ${l.t}` : l.t)),
  ]
}
