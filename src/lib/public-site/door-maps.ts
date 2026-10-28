/**
 * Each door's map: its own party's book, read from its own roles.
 *
 * ── Decided ──────────────────────────────────────────────────────────
 *
 * The founder, 2026-10-27, on the home page's map: "Do it for all parties
 * like those." Drawn the same day, one drawing per door, and "Build it"
 * on 2026-10-28 (CLAUDE.md, "The setup checklist and the four doors' maps
 * are built"). Three doors now; the MSPs' waits for Aptiva's three
 * missing seats to be seeded.
 *
 *   Integrators  Teleworld Solutions, as its two delivery managers (Ingrid
 *                Solberg in Tualatin, Rahul Deshpande in San Jose), HR
 *                (Farah Haddad) and AP & Payroll (Ravi Kalathil)
 *   Suppliers    Prime vendor: Brightmoor Staffing as its owner (Jenna
 *                Okafor), account manager (Marisa Delacroix), accounts
 *                receivable (Imelda Santoro) and AP & Payroll (Desmond
 *                Achebe). Sub-vendor and Bench vendor: Techpeple, as its
 *                owner (Bhavesh Nair) and its recruiter (Linnea Qadri),
 *                the two seats it has, each tab opening on the one its
 *                panel plays
 *   Workers      Helena Marsh on the Worker tab, Colleen Byrne on the
 *                Solopreneur tab: one seat each, her own page, no tab row
 *
 * Same view as the home page's (`./corvane-map-view`), same place on the
 * page (under the hero, before the panel), same phone shape.
 *
 * ── Where each figure comes from ─────────────────────────────────────
 *
 * Three places, and nothing is typed here:
 *   - the seed's own exports (`PROGRAMMES`, `OFFERED`, `MOVE_DESKS`,
 *     `RATE_CHANGE_*`, `WORLD_CLIENTS`, `karthikWindow`, `nurseWeek`);
 *   - `./door-map-seed`, the seed's values it does not export yet, each
 *     read back out of its seed file by the test;
 *   - the live read (`./door-map-facts`) for what the seed computes from
 *     the database: what a firm signed and has not billed, what it bills
 *     this month, and one invoice from below. Where that read is null the
 *     figure says it is on the demo, never a guess.
 *
 * Money a month is each bill rate at 160 hours, the estimate every
 * program screen and the home page's map use, said under each map.
 *
 * ── Where the drawing and the seed disagreed, the seed won ────────────
 *
 *   drawing                                seed, and so the map
 *   Teleworld "4 people on client sites"   3 on client sites and 1 between
 *                                          projects (Karthik Menon)
 *   "Nimbus Staffing"                      Nimbus Talent
 *   Teleworld's "Marcus Whitfield, $5,680" the signed weeks Teleworld has not
 *   and Nimbus "$4,640, due day 25"        billed, and Nimbus Talent's invoice,
 *                                          read live: names and sums are the
 *                                          record's, not the drawing's
 *   Rosa "30 weeks, $134,400" and          read live from Brightmoor's own
 *   Brightmoor "31 weeks, $139,560"        "signed and not yet billed"
 *   Rosa "back pay waits for your yes"     the rise was approved before it took
 *                                          effect, so no back pay is owed; the
 *                                          map says the rise
 *   Ravi Subramanian at Nordway; Consultis generated names, not seed rows a map
 *                                          can read; counted in the live figures
 *   Farah's "Papers" column, Helena's      left off: no paper verdict the map
 *   "background check, 250 days"           can read from the seed
 *   Helena's "$3,600 paid" on earlier      left off "paid": the earlier weeks are
 *   weeks                                  signed; what is paid is on her page
 *   Techpeple's bench, Grace Lindqvist     generated names; the map names the two
 *   and Peter Halloran                     people the seed writes by hand
 *   "Checked just now."                    left off; the live figures say "read
 *                                          when this page opened" in their own line
 *
 * Server only: it reads the seed modules, which reach the database client.
 */

import { WORLD_CLIENTS } from '@/lib/seed-world'
import { PROGRAMMES, week as seededWeek } from '@/lib/seed-programmes'
import { OFFERED, NORTHBEND_JOB } from '@/lib/seed-bench-matching'
import { MOVE_DESKS } from '@/lib/seed-internal-moves'
import { RATE_CHANGE_PERSON, RATE_CHANGE_RATES, rateChangeDates } from '@/lib/seed-rate-change'
import { karthikWindow, nurseWeek } from '@/lib/seed-doors'
import { seedToday } from '@/lib/seed-days'
import { programMonthlySpend, HOURS_PER_MONTH } from '@/lib/program-spend'
import { daysFor, monthsOf } from '@/lib/tenure-days'
import { format, fromMinor } from '@/lib/money'
import { possessive } from '@/lib/requisition-approval'
import type { MapCell, MapStat, MapView, RoleMap } from './corvane-map'
import type { PersonTarget, SeatTarget } from './flow'
import type { DoorFacts, FirmLive } from './door-map-facts'
import {
  FIRM_NAMES, FIRST_SEAT, BRIGHTMOOR_TEAM, TECHPEPLE_RECRUITER, TELEWORLD_PAYROLL, TELEWORLD_STAFF,
  TELEWORLD_LINES, KARTHIK_LINE, CORVELDT_JOB, MEERA, IFEOMA, ROSA_JOB, MARISOL, BYRNE, BILLS_FROM_BELOW,
  type TeleworldLine,
} from './door-map-seed'

// ── Which map, on which door and tab ─────────────────────────────────

export type DoorMapKey = 'teleworld' | 'brightmoor' | 'techpeple' | 'helena' | 'byrne'

/** Each map's seats, in tab order. The first is the default unless the door's tab names another. */
/** The city a delivery manager's project is in: the last part of its unit's name in the seed. */
const cityOf = (unit: string) => unit.split(', ').pop()!
const PORTLAND_CITY = cityOf(MOVE_DESKS.portland.unit)
const SAN_JOSE_CITY = cityOf(MOVE_DESKS.sanJose.unit)

export const DOOR_SEATS: Record<DoorMapKey, readonly { key: string; tab: string }[]> = {
  teleworld: [
    { key: 'tualatin', tab: `Delivery manager, ${PORTLAND_CITY}` },
    { key: 'sanjose', tab: `Delivery manager, ${SAN_JOSE_CITY}` },
    { key: 'hr', tab: 'HR' },
    { key: 'payroll', tab: 'AP & Payroll' },
  ],
  brightmoor: [
    { key: 'owner', tab: 'Owner' },
    { key: 'account', tab: 'Account manager' },
    { key: 'ar', tab: 'Accounts receivable' },
    { key: 'payroll', tab: 'AP & Payroll' },
  ],
  techpeple: [
    { key: 'owner', tab: 'Owner' },
    { key: 'recruiter', tab: 'Recruiter' },
  ],
  helena: [{ key: 'worker', tab: 'Worker' }],
  byrne: [{ key: 'solo', tab: 'Solopreneur' }],
}

/**
 * The map each door and tab draws, and the seat it opens on: the one its
 * panel already plays, so the map and the panel under it are the same
 * person where they can be.
 */
export const DOOR_MAPS: Record<string, { map: DoorMapKey; seat: string }> = {
  '/for/integrators': { map: 'teleworld', seat: 'tualatin' },
  '/for/suppliers': { map: 'brightmoor', seat: 'owner' },
  '/for/suppliers?tab=sub': { map: 'techpeple', seat: 'owner' },
  '/for/suppliers?tab=bench': { map: 'techpeple', seat: 'recruiter' },
  '/for/contractors': { map: 'helena', seat: 'worker' },
  '/for/contractors?tab=solo': { map: 'byrne', seat: 'solo' },
}

/** The seat an address asks for on a map, or the map's default for this tab. */
export function doorSeatOf(map: DoorMapKey, fallback: string, asked: string | string[] | undefined): string {
  const s = Array.isArray(asked) ? asked[0] : asked
  return DOOR_SEATS[map].some((x) => x.key === s) ? (s as string) : fallback
}

/**
 * A seat's own address on a door tab: the tab's address, with the seat
 * where it is not the default. No `#map` on it, unlike the home page's: a
 * door's links never land in the middle of a page (founder, 2026-09-30),
 * and the map sits straight under the hero, so the top is where it is.
 */
export function doorSeatHref(tabHref: string, seat: string, fallback: string): string {
  if (seat === fallback) return tabHref
  return `${tabHref}${tabHref.includes('?') ? '&' : '?'}seat=${seat}`
}

// ── Small arithmetic, shared ─────────────────────────────────────────

const DAY = 86_400_000
const money = (minor: number) => format(fromMinor(minor, 'USD'), { compact: true })
const perHour = (cents: number) => money(cents)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const clientName = (slug: string) => WORLD_CLIENTS.find((c) => c.slug === slug)!.name
const firstName = (name: string) => name.split(' ')[0]
/** A month of a set of bill rates, at 160 hours, in cents. */
export const monthOf = (rates: readonly number[]) =>
  programMonthlySpend(rates.map((r) => ({ rateMinorPerHour: r }))).totalMinor
/** Whole months on site for somebody who started `startedDaysAgo` days ago, today counted. */
const monthsAt = (startedDaysAgo: number) => monthsOf(startedDaysAgo + 1)
/** Whole days between two days, UTC. */
const daysBetween = (a: Date, b: Date) => Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / DAY)

/** Said where a live figure could not be read when the page opened. */
export const ON_THE_DEMO = 'on the demo'
/** The line under a live figure that was read. */
export const READ_LIVE = 'read when this page opened'

const NORTHBEND = PROGRAMMES.find((p) => p.client === 'nike')!
const HIRING = NORTHBEND.people.hiring
const running = NORTHBEND.placements.filter((x) => x.state === 'IN_PROGRESS')
/** Helena Marsh: Northbend's running line through a chain of three, the one Techpeple employs her on. */
const HELENA = running.find((x) => x.via.length === 3 && x.via.includes('techpeple'))!
/** Omar Haddad: Northbend's running line whose week went over the line. */
const OMAR = running.find((x) => x.overtimeWeekHours != null)!
/** The hours of a seeded week at Northbend, as the seed files it. */
const WEEK_HOURS = Object.values(seededWeek(1).days).reduce((a, b) => a + b, 0)

// ── Teleworld Solutions: the integrators' door ───────────────────────

const TELEWORLD = FIRM_NAMES.teleworld
const onProject = (city: string) => TELEWORLD_LINES.filter((l) => l.city === city)
const comesOff = (l: TeleworldLine) => `in ${plural(l.end, 'day')}`
/** The day a flagged person reads as free: the line's end, or the day their manager keeps them until. */
const freeIn = (l: TeleworldLine) => l.release?.keepUntil ?? l.end

function signedTotal(f: FirmLive | null): { value: string; sub: string; att?: boolean } {
  if (!f) return { value: '—', sub: ON_THE_DEMO }
  const sum = f.signed.totalMinor === null ? 'some unpriced' : money(f.signed.totalMinor)
  return { value: plural(f.signed.count, 'week'), sub: `${sum}, ${READ_LIVE}`, att: f.signed.count > 0 }
}

/** Signed weeks, one row per person: their client, the weeks, the sum. */
function weeksByPerson(f: FirmLive): { person: string; client: string; weeks: number; hours: number; amountMinor: number | null }[] {
  const by = new Map<string, { person: string; client: string; weeks: number; hours: number; amountMinor: number | null }>()
  for (const w of f.signed.weeks) {
    const k = `${w.person}\u0000${w.client}`
    const r = by.get(k) ?? { person: w.person, client: w.client, weeks: 0, hours: 0, amountMinor: 0 }
    r.weeks++
    r.hours += w.hours
    r.amountMinor = r.amountMinor === null || w.amountMinor === null ? null : r.amountMinor + w.amountMinor
    by.set(k, r)
  }
  return [...by.values()].sort((a, b) => b.weeks - a.weeks)
}

export function teleworldMap(facts: DoorFacts): RoleMap<string, SeatTarget> {
  const today = seedToday()
  const as = 'world-teleworld'
  const tualatin = onProject(PORTLAND_CITY)
  const sanJose = onProject(SAN_JOSE_CITY)
  // Felix Brenner is free when his line ends; Amara Nwosu is kept; Deepa Varma is the San Jose project's.
  const felix = TELEWORLD_LINES.find((l) => l.release && l.release.keepUntil === null)!
  const amara = TELEWORLD_LINES.find((l) => l.release && l.release.keepUntil !== null)!
  const deepa = sanJose[0]
  const flagged = TELEWORLD_LINES.filter((l) => l.release)
  const freeWhenOff = flagged.filter((l) => l.release!.keepUntil === null)
  const kept = flagged.filter((l) => l.release!.keepUntil !== null)
  const karthik = karthikWindow(today)
  const karthikOffDays = daysBetween(karthik.end, today)
  const between = [KARTHIK_LINE.person]
  const ingrid = MOVE_DESKS.portland.name
  const rahul = MOVE_DESKS.sanJose.name
  const farah = MOVE_DESKS.hr.name
  const northbend = clientName(felix.client)
  const corveldt = clientName(CORVELDT_JOB.client)
  const nimbus = FIRM_NAMES[MEERA.bench]

  const tualatinView: MapView<string, SeatTarget> = {
    key: 'tualatin', tab: DOOR_SEATS.teleworld[0].tab,
    signed: `Signed in as ${ingrid}, delivery manager, ${PORTLAND_CITY}. Reads her project at ${northbend} and the firm’s bench.`,
    headline:
      `${felix.person} comes off ${northbend} ${comesOff(felix)} and is free from then. ` +
      `${amara.person} comes off ${comesOff(amara)}, and you keep her until ${plural(freeIn(amara), 'day')} from today.`,
    stats: [
      { label: 'Your people on site', value: String(tualatin.length), sub: `${northbend}, ${PORTLAND_CITY}` },
      { label: 'Coming off in 30 days', value: String(tualatin.filter((l) => l.end <= 30).length), sub: tualatin.map((l) => firstName(l.person)).join(', '), att: true },
      { label: 'Free when they come off', value: String(freeWhenOff.length), sub: freeWhenOff.map((l) => l.person).join(', ') },
      { label: 'Kept by you', value: String(kept.length), sub: kept.map((l) => `${l.person}, ${plural(freeIn(l), 'day')}`).join(', ') },
      { label: 'Billing this month', value: money(monthOf(tualatin.map((l) => l.bill))), sub: `${tualatin.map((l) => perHour(l.bill)).join(' and ')} an hour` },
    ],
    columns: [
      { t: 'Person' }, { t: 'Job' }, { t: 'Client' }, { t: 'Bill', right: true }, { t: 'Pay', right: true }, { t: 'Comes off' }, { t: 'Bench' },
    ],
    rows: tualatin.map((l): MapCell[] => [
      { t: l.person, strong: true },
      { t: l.job },
      { t: clientName(l.client) },
      { t: perHour(l.bill) },
      { t: perHour(l.pay) },
      { t: comesOff(l) },
      l.release?.keepUntil == null
        ? { t: 'flagged, free from then', chip: 'ok' }
        : { t: `kept by you, free in ${plural(freeIn(l), 'day')}`, chip: 'att' },
    ]),
    caption: 'A manager flags who comes off, and when. The firm’s other managers and HR see it. No client does.',
    demo: { target: { as, desk: 'delivery', who: ingrid, seat: ingrid }, label: `Open the demo as ${ingrid}` },
  }

  const freeSoon = flagged.filter((l) => freeIn(l) <= 30)
  const sanJoseView: MapView<string, SeatTarget> = {
    key: 'sanjose', tab: DOOR_SEATS.teleworld[1].tab,
    signed: `Signed in as ${rahul}, delivery manager, ${SAN_JOSE_CITY}. Reads his project at ${clientName(deepa.client)} and the firm’s bench.`,
    headline:
      `${KARTHIK_LINE.person} is free now, and ${felix.person} is free in ${plural(freeIn(felix), 'day')}. ` +
      `${possessive(corveldt, '’')} ${CORVELDT_JOB.title} job is open to ${TELEWORLD} at ${perHour(CORVELDT_JOB.payMin)}–${perHour(CORVELDT_JOB.payMax)}.`,
    stats: [
      { label: 'Your people on site', value: String(sanJose.length), sub: sanJose.map((l) => `${l.person}, ${clientName(l.client)}`).join('; ') },
      { label: 'Free now', value: String(between.length), sub: between.join(', ') },
      { label: 'Free in 30 days', value: String(freeSoon.length), sub: freeSoon.map((l) => `${l.person}, ${plural(freeIn(l), 'day')}`).join('; ') },
      { label: 'Open job', value: '1', sub: `${corveldt}, ${CORVELDT_JOB.city}` },
      { label: 'Interview booked', value: '1', sub: `${MEERA.name}, round ${MEERA.round} in ${plural(MEERA.inDays, 'day')}` },
    ],
    columns: [{ t: 'Person' }, { t: 'Skills' }, { t: 'Where they were' }, { t: 'Bill', right: true }, { t: 'Free' }],
    rows: [
      [
        { t: KARTHIK_LINE.person, strong: true },
        { t: KARTHIK_LINE.skills.join(', ') },
        { t: `${clientName(KARTHIK_LINE.client)}, ended ${plural(karthikOffDays, 'day')} ago` },
        { t: perHour(KARTHIK_LINE.bill) },
        { t: 'now', chip: 'ok' },
      ],
      ...flagged.map((l): MapCell[] => [
        { t: l.person, strong: true },
        { t: l.job },
        { t: `${clientName(l.client)}, ${l.city}` },
        { t: perHour(l.bill) },
        l.release!.keepUntil === null
          ? { t: `in ${plural(freeIn(l), 'day')}`, chip: 'ok' }
          : { t: `in ${plural(freeIn(l), 'day')}, kept by ${firstName(ingrid)}`, chip: 'att' },
      ]),
    ],
    caption: 'One hold at a time. The releasing manager confirms the date; you place the person, as the firm’s own employee.',
    demo: { target: { as, desk: 'delivery', who: rahul, seat: rahul }, label: `Open the demo as ${rahul}` },
  }

  const hrView: MapView<string, SeatTarget> = {
    key: 'hr', tab: 'HR',
    signed: `Signed in as ${farah}, HR. Told of every flag, hold, release and move. Approves none of them.`,
    headline:
      `${ingrid} flagged ${flagged.map((l) => l.person).join(' and ')} to come off ${northbend}. ` +
      `${KARTHIK_LINE.person} has been between projects for ${plural(karthikOffDays, 'day')}.`,
    stats: [
      { label: 'Our people', value: String(TELEWORLD_STAFF.length) },
      { label: 'On client sites', value: String(TELEWORLD_LINES.length) },
      { label: 'Between projects', value: String(between.length), sub: between.join(', ') },
      { label: 'Flagged to come off', value: String(flagged.length), sub: `by ${ingrid}`, att: flagged.length > 0 },
      // The seed holds, confirms and moves nobody: those are the acts the demo is for.
      { label: 'Holds and moves', value: '0', sub: 'none yet' },
    ],
    columns: [{ t: 'Person' }, { t: 'Where' }, { t: 'Status' }],
    rows: [
      ...TELEWORLD_LINES.map((l): MapCell[] => [
        { t: l.person, strong: true },
        { t: `${clientName(l.client)}, ${l.city}` },
        !l.release
          ? { t: `on site, line ends in ${plural(l.end, 'day')}`, chip: 'ok' }
          : l.release.keepUntil === null
            ? { t: `comes off in ${plural(l.end, 'day')}, flagged`, chip: 'att' }
            : { t: `comes off in ${plural(l.end, 'day')}, kept until ${plural(freeIn(l), 'day')}`, chip: 'att' },
      ]),
      [
        { t: KARTHIK_LINE.person, strong: true },
        { t: 'between projects' },
        { t: `since ${clientName(KARTHIK_LINE.client)} ended, ${plural(karthikOffDays, 'day')} ago`, chip: 'ok' },
      ],
    ],
    caption: 'The employment is the consent: each person is told of a move, not asked. HR is told of every step.',
    demo: { target: { as, desk: 'hr', seat: farah }, label: `Open the demo as ${farah}` },
  }

  const f = facts.firm
  const r = facts.receipt
  const signed = signedTotal(f)
  const receiptStat: MapStat = r
    ? { label: 'Invoice receipt', value: money(r.totalMinor), sub: `${r.from}, ${r.number}, due in ${plural(r.dueInDays, 'day')}` }
    : { label: 'Invoice receipt', value: '—', sub: `${nimbus}, ${BILLS_FROM_BELOW.nimbus.number}, ${ON_THE_DEMO}` }
  const karthikMonths = new Date(karthik.end).getUTCMonth() - new Date(karthik.start).getUTCMonth() + 12 * (karthik.end.getUTCFullYear() - karthik.start.getUTCFullYear()) + 1
  const payrollRows: MapCell[][] = f
    ? weeksByPerson(f).slice(0, 4).map((p) => [
        { t: p.person, strong: true },
        { t: p.client },
        { t: plural(p.weeks, 'week') },
        { t: p.amountMinor === null ? 'not priced' : money(p.amountMinor) },
        { t: 'signed, bill it', chip: 'att' },
      ])
    : [[{ t: 'Signed weeks not billed', strong: true }, { t: '—' }, { t: '—' }, { t: '—' }, { t: ON_THE_DEMO }]]
  if (r) {
    payrollRows.push([
      { t: r.from, strong: true, sub: r.number },
      { t: 'invoice receipt' },
      { t: '—' },
      { t: money(r.totalMinor) },
      { t: `due in ${plural(r.dueInDays, 'day')}`, chip: 'att' },
    ])
  }
  const payrollView: MapView<string, SeatTarget> = {
    key: 'payroll', tab: 'AP & Payroll',
    signed: `Signed in as ${TELEWORLD_PAYROLL}, AP & Payroll. Pays the firm below on weeks it accepted, and runs payroll for the firm’s own people.`,
    headline: [
      f ? `${plural(f.signed.count, 'signed week')} ${f.signed.count === 1 ? 'is' : 'are'} not billed yet.` : null,
      r ? `${possessive(r.from, '’')} invoice ${r.number}, ${money(r.totalMinor)}, is received and due in ${plural(r.dueInDays, 'day')}.` : null,
      `${possessive(KARTHIK_LINE.person, '’')} ${plural(karthikMonths, 'month')} at ${clientName(KARTHIK_LINE.client)} are paid.`,
    ].filter(Boolean).join(' '),
    stats: [
      { label: 'Signed, not billed', ...signed },
      receiptStat,
      { label: 'Payroll paid', value: plural(karthikMonths, 'month'), sub: KARTHIK_LINE.person },
      { label: 'Billing this month', value: f ? (f.billing.totalMinor === null ? 'some unpriced' : money(f.billing.totalMinor)) : '—', sub: f ? `${plural(f.billing.people, 'person', 'people')}, ${READ_LIVE}` : ON_THE_DEMO },
    ],
    columns: [{ t: 'Who' }, { t: 'Client or firm' }, { t: 'Weeks' }, { t: 'Amount', right: true }, { t: 'Step' }],
    rows: payrollRows,
    caption: 'A firm bills the hours the firm above it accepted, and pays below only on a week it has accepted.',
    demo: { target: { as, desk: 'payroll', seat: TELEWORLD_PAYROLL }, label: `Open the demo as ${TELEWORLD_PAYROLL}` },
  }

  return {
    bar: `${TELEWORLD} · a sample integrator · ${plural(TELEWORLD_STAFF.length, 'person', 'people')} of its own · ${TELEWORLD_LINES.length} on client sites · ${between.length} between projects`,
    views: [tualatinView, sanJoseView, hrView, payrollView],
    under: underLine(TELEWORLD, 'integrator'),
  }
}

/** The line under a firm's map: whose book, that it is a demo, and what the figures rest on. */
function underLine(name: string, kind: string): string {
  return (
    `One record, read from each role. ${name} is a demo ${kind}, not a customer. ` +
    `A month worked out here is each bill rate at ${HOURS_PER_MONTH} hours; a figure marked “${READ_LIVE}” is the demo’s own Today page.`
  )
}

// ── Brightmoor Staffing: the suppliers' door, Prime vendor ───────────

export function brightmoorMap(facts: DoorFacts): RoleMap<string, SeatTarget> {
  const as = 'world-brightmoor'
  const today = seedToday()
  const name = FIRM_NAMES.brightmoor
  const omar = OMAR
  const northbend = clientName(NORTHBEND.client)
  const [omarBill, omarPay] = omar.rates
  const omarWeek = omar.overtimeWeekHours!
  const rosa = rateChangeDates()
  const rosaDays = daysBetween(rosa.start, today)
  const rosaPay = rosa.rise <= today ? RATE_CHANGE_RATES.raise : RATE_CHANGE_RATES.pay
  const bench = OFFERED.filter((o) => o.firm === 'brightmoor')
  const jonas = bench[0]
  const coverDays = NORTHBEND.cover!.brightmoor.gl
  const rajesh = NORTHBEND.open.candidates.find((c) => c.from === 'brightmoor')!
  const round = rajesh.round!
  const interviewers = round.interviewers.map((i) => i.split(',')[0])
  const [bandMin, bandMax] = NORTHBEND.open.band
  const f = facts.firm
  const signed = signedTotal(f)
  const owner = FIRST_SEAT.brightmoor
  const t = BRIGHTMOOR_TEAM
  const top = f ? weeksByPerson(f)[0] : undefined

  const lines: MapCell[][] = [
    [
      { t: omar.person, strong: true },
      { t: northbend },
      { t: omar.role },
      { t: perHour(omarBill) },
      { t: perHour(omarPay) },
      { t: String(monthsAt(omar.startedDaysAgo)) },
      { t: `${omarWeek} h, waiting for ${firstName(HIRING)}`, chip: 'att' },
    ],
    [
      { t: RATE_CHANGE_PERSON.name, strong: true },
      { t: northbend },
      { t: ROSA_JOB },
      { t: perHour(RATE_CHANGE_RATES.bill) },
      { t: perHour(rosaPay) },
      { t: String(monthsAt(rosaDays)) },
      { t: 'every week signed, none billed', chip: 'att' },
    ],
  ]

  // Whoever else bills this month, by the live read: a person on a chain
  // the seed generates has no row a map can read, so the record names them.
  const named = new Set(lines.map((r) => r[0].t))
  const others: MapCell[][] = (f?.billing.lines ?? []).filter((l) => !named.has(l.person)).map((l) => [
    { t: l.person, strong: true },
    { t: l.client },
    { t: '—' },
    { t: l.rateMinor === null ? '—' : perHour(l.rateMinor) },
    { t: '—' },
    { t: '—' },
    { t: READ_LIVE },
  ])

  const ownerView: MapView<string, SeatTarget> = {
    key: 'owner', tab: 'Owner',
    signed: `Signed in as ${owner}, owner. Reads the whole book. ${t.ar} or ${t.finance} sends the bills.`,
    headline: [
      f && top ? `${plural(f.signed.count, 'signed week')} ${f.signed.count === 1 ? 'is' : 'are'} not billed yet, most of them ${possessive(top.person, '’')}.` : null,
      `${possessive(omar.person, '’')} ${omarWeek}-hour week waits for ${HIRING}.`,
      `Your liability cover ends in ${plural(coverDays, 'day')}.`,
    ].filter(Boolean).join(' '),
    stats: [
      { label: 'Billing this month', value: f ? (f.billing.totalMinor === null ? 'some unpriced' : money(f.billing.totalMinor)) : '—', sub: f ? `${plural(f.billing.people, 'person', 'people')}, ${READ_LIVE}` : ON_THE_DEMO },
      { label: 'Signed, not billed', ...signed },
      { label: 'Week at the client', value: `${omarWeek} h`, sub: `${omar.person}, waiting for ${firstName(HIRING)}`, att: true },
      { label: 'Papers ending', value: plural(coverDays, 'day'), sub: 'liability cover', att: true },
      { label: 'On the bench', value: String(bench.length), sub: bench.map((b) => b.name).join(', ') },
    ],
    columns: [
      { t: 'Contractor' }, { t: 'Client' }, { t: 'Job' }, { t: 'Bill', right: true }, { t: 'Pay', right: true }, { t: 'Months here', right: true }, { t: 'This week' },
    ],
    rows: [...lines, ...others],
    caption: 'Your rates and your sub-vendors stay yours. Your client sees the line it pays.',
    demo: { target: { as, desk: '', seat: owner }, label: `Open the demo as ${owner}` },
  }

  const accountView: MapView<string, SeatTarget> = {
    key: 'account', tab: 'Account manager',
    signed: `Signed in as ${t.account}, account manager. Reads jobs, rates, candidates and what was billed. Never payroll.`,
    headline:
      `${rajesh.person} interviews for ${possessive(northbend, '’')} ${NORTHBEND_JOB} job in ${plural(round.inDays, 'day')}, with ${interviewers.join(' and ')}. ` +
      `${jonas.name} on your bench matches it too.`,
    stats: [
      { label: 'Open job', value: '1', sub: `${NORTHBEND_JOB}, ${perHour(bandMin)}–${perHour(bandMax)}` },
      { label: 'Who applied', value: '1', sub: `${rajesh.person}, ${perHour(rajesh.rate)}` },
      { label: 'Interview', value: `in ${plural(round.inDays, 'day')}`, sub: interviewers.join(', ') },
      { label: 'On your bench', value: String(bench.length), sub: `${jonas.name}, ${perHour(jonas.rate[0])}–${perHour(jonas.rate[1])}` },
      { label: 'Week at the client', value: `${omarWeek} h`, sub: omar.person, att: true },
    ],
    columns: [{ t: 'Candidate' }, { t: 'From' }, { t: 'Rate', right: true }, { t: 'Step' }],
    rows: [
      [{ t: rajesh.person, strong: true }, { t: 'applied' }, { t: perHour(rajesh.rate) }, { t: `interview in ${plural(round.inDays, 'day')}`, chip: 'ok' }],
      [{ t: jonas.name, strong: true }, { t: 'your bench' }, { t: `${perHour(jonas.rate[0])}–${perHour(jonas.rate[1])}` }, { t: 'papers not on file', chip: 'att' }],
      [{ t: MARISOL.name, strong: true }, { t: 'asked onto your bench' }, { t: '—' }, { t: 'no answer yet', chip: 'att' }],
    ],
    caption: `For ${possessive(northbend, '’')} ${NORTHBEND_JOB} job: who applied, who is interviewing, and who is on your bench.`,
    demo: { target: { as, desk: 'account', seat: t.account }, label: `Open the demo as ${t.account}` },
  }

  const arRows: MapCell[][] = f
    ? weeksByPerson(f).slice(0, 4).map((p) => [
        { t: p.person, strong: true },
        { t: p.client },
        { t: plural(p.weeks, 'week') },
        { t: p.amountMinor === null ? 'not priced' : money(p.amountMinor) },
        { t: 'signed, bill it', chip: 'att' },
      ])
    : [[{ t: 'Signed weeks not billed', strong: true }, { t: '—' }, { t: '—' }, { t: '—' }, { t: ON_THE_DEMO }]]
  arRows.push([
    { t: omar.person, strong: true },
    { t: northbend },
    { t: '—' },
    { t: '—' },
    { t: 'billed and paid', chip: 'ok' },
  ])
  const arView: MapView<string, SeatTarget> = {
    key: 'ar', tab: 'Accounts receivable',
    signed: `Signed in as ${t.ar}, accounts receivable. Bills the client on signed weeks and records what came in. Never runs payroll.`,
    headline: [
      f ? `${plural(f.signed.count, 'signed week')} ${f.signed.count === 1 ? 'is' : 'are'} not billed yet${f.signed.totalMinor === null ? '' : `, ${money(f.signed.totalMinor)}`}.` : null,
      f && f.signed.onDrafts > 0 ? `${plural(f.signed.onDrafts, 'week')} ${f.signed.onDrafts === 1 ? 'is' : 'are'} on a drafted bill waiting for your yes.` : null,
      `${possessive(omar.person, '’')} bill to ${northbend} is paid.`,
    ].filter(Boolean).join(' '),
    stats: [
      { label: 'Signed, not billed', ...signed },
      { label: 'On a drafted bill', value: f ? plural(f.signed.onDrafts, 'week') : '—', sub: f ? READ_LIVE : ON_THE_DEMO },
      { label: 'Bills paid', value: '1', sub: `${omar.person}, ${northbend}` },
      { label: 'Billing this month', value: f ? (f.billing.totalMinor === null ? 'some unpriced' : money(f.billing.totalMinor)) : '—', sub: f ? READ_LIVE : ON_THE_DEMO },
    ],
    columns: [{ t: 'Contractor' }, { t: 'Client' }, { t: 'Weeks' }, { t: 'To bill', right: true }, { t: 'Step' }],
    rows: arRows,
    caption: 'A bill is drafted from weeks signed above, and waits for the person who sends bills.',
    demo: { target: { as, desk: 'ar', seat: t.ar }, label: `Open the demo as ${t.ar}` },
  }

  const payrollView: MapView<string, SeatTarget> = {
    key: 'payroll', tab: 'AP & Payroll',
    signed: `Signed in as ${t.payroll}, AP & Payroll. Accepts hours, runs payroll and pays the firms below. Never sends a client a bill.`,
    headline:
      `${possessive(RATE_CHANGE_PERSON.name, '’')} pay rose from ${perHour(RATE_CHANGE_RATES.pay)} to ${perHour(RATE_CHANGE_RATES.raise)} an hour, approved before it took effect. ` +
      `${possessive(omar.person, '’')} ${omarWeek}-hour week waits for ${northbend}, so nothing is owed on it yet.`,
    stats: [
      { label: 'Pay rise', value: perHour(RATE_CHANGE_RATES.raise), sub: `${RATE_CHANGE_PERSON.name}, from ${perHour(RATE_CHANGE_RATES.pay)}` },
      { label: 'Week waiting above', value: `${omarWeek} h`, sub: `${omar.person}, at ${northbend}`, att: true },
      { label: 'Hours over the line', value: `${omarWeek - omar.overtimeAfterHours!} h`, sub: 'priced once the client decides' },
      { label: 'Your people on site', value: String(lines.length), sub: `${omar.person}, ${RATE_CHANGE_PERSON.name}` },
    ],
    columns: [{ t: 'Person' }, { t: 'Client' }, { t: 'Pay', right: true }, { t: 'Step' }],
    rows: [
      [{ t: RATE_CHANGE_PERSON.name, strong: true }, { t: northbend }, { t: perHour(rosaPay) }, { t: 'weeks signed and accepted', chip: 'ok' }],
      [{ t: omar.person, strong: true }, { t: northbend }, { t: perHour(omarPay) }, { t: `${omarWeek} h, waits on ${northbend}`, chip: 'att' }],
    ],
    caption: 'Every hour is paid at the rate in force on the day it was worked. Back pay is a one-off payment somebody approves.',
    demo: { target: { as, desk: 'payroll', seat: t.payroll }, label: `Open the demo as ${t.payroll}` },
  }

  return {
    bar: `${name} · a sample supplier · ${plural(lines.length, 'contractor')} at ${northbend} · ${plural(NORTHBEND.open.candidates.filter((c) => c.from === 'brightmoor').length, 'candidate')} in interview · ${bench.length} on the bench`,
    views: [ownerView, accountView, arView, payrollView],
    under: underLine(name, 'supplier'),
  }
}

// ── Techpeple: the suppliers' door, Sub-vendor and Bench vendor ──────

export function techpepleMap(facts: DoorFacts): RoleMap<string, SeatTarget> {
  const as = 'world-techpeple'
  const name = FIRM_NAMES.techpeple
  const helena = HELENA
  const [, primeRate, ownRate] = helena.rates
  const prime = FIRM_NAMES[helena.via[1] as 'computer-systems']
  const northbend = clientName(NORTHBEND.client)
  const weeks = helena.weeks!
  const r = facts.receipt
  const owner = FIRST_SEAT.techpeple
  const ifeomaFirm = FIRM_NAMES[IFEOMA.prime]

  const ownerView: MapView<string, SeatTarget> = {
    key: 'owner', tab: 'Owner',
    signed: `Signed in as ${owner}, owner. Reads ${possessive(name, '’')} own book: its people, its weeks and its invoices.`,
    headline: [
      `${possessive(helena.person, '’')} newest week at ${northbend} waits for ${HIRING}. Once ${prime} accepts it, you bill ${prime} for the same hours.`,
      r ? `Your invoice ${r.number} to ${prime}, ${money(r.totalMinor)}, is due in ${plural(r.dueInDays, 'day')}.` : null,
    ].filter(Boolean).join(' '),
    stats: [
      { label: 'On site', value: '1', sub: `${helena.person}, ${northbend}` },
      { label: 'You bill', value: perHour(primeRate), sub: `an hour, to ${prime}` },
      { label: 'You pay', value: perHour(ownRate), sub: `an hour, to ${helena.person}` },
      { label: 'Weeks signed', value: String(weeks.approved), sub: `${weeks.awaiting} waiting at the client`, att: weeks.awaiting > 0 },
      r
        ? { label: 'Your invoice', value: money(r.totalMinor), sub: `${r.number}, due in ${plural(r.dueInDays, 'day')}` }
        : { label: 'Your invoice', value: '—', sub: `${BILLS_FROM_BELOW.techpeple.number}, ${ON_THE_DEMO}` },
    ],
    columns: [{ t: 'Person' }, { t: 'Job' }, { t: 'Through' }, { t: 'Bill', right: true }, { t: 'Pay', right: true }, { t: 'Step' }],
    rows: [
      [
        { t: helena.person, strong: true }, { t: helena.role }, { t: prime },
        { t: perHour(primeRate) }, { t: perHour(ownRate) },
        { t: `newest week waiting for ${firstName(HIRING)}`, chip: 'att' },
      ],
      [
        { t: IFEOMA.name, strong: true }, { t: IFEOMA.job }, { t: ifeomaFirm },
        { t: '—' }, { t: '—' },
        { t: `phone screen in ${plural(IFEOMA.screenInDays, 'day')}`, chip: 'ok' },
      ],
    ],
    caption: 'Each firm accepts the same signed week, so nobody types it twice. Your rates stay yours.',
    demo: { target: { as, desk: '', seat: owner }, label: `Open the demo as ${owner}` },
  }

  const recruiterView: MapView<string, SeatTarget> = {
    key: 'recruiter', tab: 'Recruiter',
    signed: `Signed in as ${TECHPEPLE_RECRUITER}, recruiter. Finds people and puts them forward. Never sees what anybody costs.`,
    headline:
      `${IFEOMA.name} is put forward to ${ifeomaFirm} for an ${IFEOMA.job} job. ` +
      `Her phone screen is in ${plural(IFEOMA.screenInDays, 'day')}, and her I-9 was asked for ${plural(IFEOMA.i9AskedDaysAgo, 'day')} ago.`,
    stats: [
      { label: 'Put forward', value: '1', sub: IFEOMA.name },
      { label: 'Phone screens', value: '1', sub: `in ${plural(IFEOMA.screenInDays, 'day')}` },
      { label: 'Papers asked', value: '1', sub: 'an I-9, not signed yet', att: true },
      { label: 'On site', value: '1', sub: `${helena.person}, ${northbend}` },
    ],
    columns: [{ t: 'Person' }, { t: 'Job' }, { t: 'Firm' }, { t: 'Step' }],
    rows: [
      [{ t: IFEOMA.name, strong: true }, { t: IFEOMA.job }, { t: ifeomaFirm }, { t: `phone screen in ${plural(IFEOMA.screenInDays, 'day')}`, chip: 'ok' }],
      [{ t: IFEOMA.name, strong: true }, { t: 'I-9' }, { t: name }, { t: `asked ${plural(IFEOMA.i9AskedDaysAgo, 'day')} ago, not signed`, chip: 'att' }],
      [{ t: helena.person, strong: true }, { t: helena.role }, { t: prime }, { t: 'on site', chip: 'ok' }],
    ],
    caption: 'Each person on your bench is shown to a firm only by their own yes.',
    demo: { target: { as, desk: 'recruiter', seat: TECHPEPLE_RECRUITER }, label: `Open the demo as ${TECHPEPLE_RECRUITER}` },
  }

  return {
    bar: `${name} · a sample supplier · sells to ${prime} · 1 person on site · 1 put forward`,
    views: [ownerView, recruiterView],
    under: underLine(name, 'supplier'),
  }
}

// ── The workers' door: one person each, her own page ─────────────────

const WEEK_WORDS = ['Newest', 'The week before', '2 weeks before', '3 weeks before'] as const

export function helenaMap(): RoleMap<string, PersonTarget> {
  const helena = HELENA
  const [, , pay] = helena.rates
  const chain = helena.via.map((slug) => (slug === NORTHBEND.client ? clientName(slug) : FIRM_NAMES[slug as 'computer-systems' | 'techpeple']))
  const employer = chain[chain.length - 1]
  const northbend = chain[0]
  const weekHours = WEEK_HOURS
  const weekPay = pay * weekHours
  const served = helena.startedDaysAgo + 1
  const toLimit = daysFor(NORTHBEND.governance.tenureCapMonths) - served
  const weeks = helena.weeks!
  const rows: MapCell[][] = []
  for (let i = 0; i < weeks.awaiting + weeks.approved && i < WEEK_WORDS.length; i++) {
    const waiting = i < weeks.awaiting
    rows.push([
      { t: WEEK_WORDS[i], strong: true },
      { t: String(weekHours) },
      waiting ? { t: `waiting for ${firstName(HIRING)}`, chip: 'att' } : { t: 'signed', chip: 'ok' },
      { t: money(weekPay) },
    ])
  }
  const view: MapView<string, PersonTarget> = {
    key: 'worker', tab: 'Worker',
    signed: `Signed in as ${helena.person}. Reads her own weeks, pay and papers, and every firm between her and the client.`,
    headline: `Your newest week, ${weekHours} hours, waits for ${HIRING} at ${northbend}. Once ${employer} accepts it, ${money(weekPay)} is owed to you.`,
    stats: [
      { label: 'This week', value: `${weekHours} h`, sub: `waiting for ${HIRING}`, att: true },
      { label: 'Your rate', value: perHour(pay), sub: `an hour, at ${employer}` },
      { label: 'Weeks signed', value: String(weeks.approved) },
      { label: 'Months here', value: String(monthsAt(helena.startedDaysAgo)), sub: `${plural(toLimit, 'day')} to the time limit` },
      { label: 'Your line ends', value: `in ${plural(helena.endsInDays, 'day')}`, sub: `at ${northbend}` },
    ],
    columns: [{ t: 'Week' }, { t: 'Hours', right: true }, { t: northbend }, { t: 'Your pay', right: true }],
    rows,
    caption: `Your chain, by name: ${chain.join(', then ')}, who employs you. You file once; every firm reads the same week.`,
    demo: { target: { person: 'helena-marsh', seat: helena.person }, label: `Open the demo as ${helena.person}` },
  }
  return {
    bar: `${helena.person} · a sample worker · ${helena.role} at ${northbend}`,
    views: [view],
    under: `Her own page, read as she reads it. ${northbend} is a demo company, not a customer.`,
  }
}

export function byrneMap(): RoleMap<string, PersonTarget> {
  const above = FIRM_NAMES[BYRNE.above]
  const client = clientName(BYRNE.client)
  const signer = WORLD_CLIENTS.find((c) => c.slug === BYRNE.client)!.owner
  const week = nurseWeek(1)
  const shifts = Object.values(week.days)
  const weekBill = BYRNE.bill * week.hours
  const rows: MapCell[][] = [...BYRNE.weeksBack].reverse().map((back, i): MapCell[] => {
    const newest = back === Math.min(...BYRNE.weeksBack)
    return [
      { t: WEEK_WORDS[i], strong: true },
      { t: String(nurseWeek(back).hours) },
      { t: newest ? `signed by ${signer}` : 'signed', chip: 'ok' },
      newest ? { t: 'waiting', chip: 'att' } : { t: 'accepted', chip: 'ok' },
      { t: money(BYRNE.bill * nurseWeek(back).hours) },
    ]
  })
  const view: MapView<string, PersonTarget> = {
    key: 'solo', tab: 'Solopreneur',
    signed: `Signed in as ${BYRNE.person}, owner of ${BYRNE.corp}. The firm and the worker, on one short menu.`,
    headline:
      `Your newest week, ${week.hours} hours, is signed by ${client} and waits for ${above}. ` +
      `Your ${BYRNE.license.state} ${BYRNE.license.number.split(' ')[0]} license ends in ${plural(BYRNE.license.endsIn, 'day')}, inside the assignment.`,
    stats: [
      { label: 'This week', value: `${week.hours} h`, sub: `${shifts.length} shifts of ${shifts[0]} hours` },
      { label: `Waiting on ${above}`, value: '1 week', sub: money(weekBill), att: true },
      { label: 'Your rate', value: perHour(BYRNE.bill), sub: `an hour, billed to ${above}` },
      { label: 'License', value: plural(BYRNE.license.endsIn, 'day'), sub: `${BYRNE.license.number}, ${BYRNE.license.state}`, att: BYRNE.license.endsIn < BYRNE.end },
      { label: 'Assignment', value: `${plural(BYRNE.end, 'day')} left`, sub: `${client}, ${BYRNE.city}` },
    ],
    columns: [{ t: 'Week' }, { t: 'Hours', right: true }, { t: client }, { t: above }, { t: `Bill at ${perHour(BYRNE.bill)}`, right: true }],
    rows,
    caption: 'You never accept your own week: once your client signs, it waits on the firm above you. You bill the hours it accepted.',
    demo: { target: { person: 'colleen-byrne', seat: BYRNE.person }, label: `Open the demo as ${BYRNE.person}` },
  }
  return {
    bar: `${BYRNE.person} · a sample one-person company · ${BYRNE.corp} · ${BYRNE.job.split(' — ')[0]} at ${client}`,
    views: [view],
    under: `Her own page, read as she reads it. ${BYRNE.corp} and ${client} are demo companies, not customers.`,
  }
}

// ── One door, one map ────────────────────────────────────────────────

/** The map a door's tab draws, with its seats' addresses and the seat to open. Null for a door with no map yet. */
export function doorMap(
  tabHref: string,
  facts: DoorFacts,
  askedSeat?: string | string[],
): { key: DoorMapKey; map: RoleMap; seat: string; hrefs: Record<string, string> } | null {
  const at = DOOR_MAPS[tabHref]
  if (!at) return null
  const map: RoleMap =
    at.map === 'teleworld' ? teleworldMap(facts)
      : at.map === 'brightmoor' ? brightmoorMap(facts)
        : at.map === 'techpeple' ? techpepleMap(facts)
          : at.map === 'helena' ? helenaMap()
            : byrneMap()
  const hrefs = Object.fromEntries(DOOR_SEATS[at.map].map((s) => [s.key, doorSeatHref(tabHref, s.key, at.seat)]))
  return { key: at.map, map, seat: doorSeatOf(at.map, at.seat, askedSeat), hrefs }
}

/** Every word a map can show, for the guards that read a page's copy. */
export function copyOfDoorMap(map: RoleMap): string[] {
  return [
    map.bar, map.under,
    ...map.views.flatMap((v) => [
      v.tab, v.signed, v.headline, v.caption, v.demo.label,
      ...v.stats.flatMap((s) => [s.label, s.value, s.sub ?? '']),
      ...v.columns.map((c) => c.t),
      ...v.rows.flatMap((r) => r.flatMap((c) => [c.t, c.sub ?? ''])),
    ]),
  ].filter(Boolean)
}

/** The words a reader reads with no map tab pressed: the bar, the tabs (where there is more than one), the open seat and the line under. */
export function defaultCopyOfDoorMap(map: RoleMap, seat: string): string[] {
  const v = map.views.find((x) => x.key === seat) ?? map.views[0]
  return [
    map.bar, ...(map.views.length > 1 ? map.views.map((x) => x.tab) : []), map.under,
    v.signed, v.headline, v.caption, v.demo.label,
    ...v.stats.flatMap((s) => [s.label, s.value, s.sub ?? '']),
    ...v.columns.map((c) => c.t),
    ...v.rows.flatMap((r) => r.flatMap((c) => [c.t, c.sub ?? ''])),
  ].filter(Boolean)
}
