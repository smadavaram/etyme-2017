import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { format, fromMinor } from '@/lib/money'
import { BY_REGION_HREF } from '@/lib/nav-table'
import { regionsView, type RegionsData } from '@/app/api/program/regions/read'
import { readerScope } from '@/app/api/program/reader-scope'
import type { SpendLine, ManagerRow, RegionRow, ContractorRow } from '@/app/api/program/regions/rollup'
import { readAsk, type Answer, type Link, type ListTable } from './ask'

/**
 * Ask Etyme over the program by region (founder, 2026-10-27, "go ahead
 * and build this", on the region map): the regional manager, the hiring
 * manager on a plant, the head of operations and the CFO at a client with
 * plants in several regions.
 *
 * ── One read, three doors ────────────────────────────────────────────
 *
 * Every figure here is demand's By region read (`regionsView`), asked for
 * this caller, never counted a second way. So the greeting, the mark and
 * the By region page say one sentence and carry one number: the greeting
 * is `data.greeting`, word for word, and the mark is its `total`.
 *
 * ── Who reads the map ────────────────────────────────────────────────
 *
 *   REGION   a seat on a REGION unit. It reads its region and nothing
 *            else, so every question it asks is answered from the region
 *            read or refused; nothing reaches the decisions queue, another
 *            route or the model (lib/region-scope: a route that narrows
 *            reads only narrowed things).
 *   PROGRAM  a seat over the whole of a client whose sites fall in two or
 *            more regions, which reads the program (`utilization.read`)
 *            and pays nothing (no `payments.record`): the head of
 *            operations and the CFO. Its greeting is the rollup's first
 *            line, the exceptions only; its other questions go where they
 *            always went.
 *   SITE     a hiring manager's seat on a plant. Its greeting stays its own
 *            queue, because the three weeks it signs are cards it acts on;
 *            questions about its plant are answered narrowed to it.
 *
 * A seat that pays invoice receipts (the owner, the AP clerk) keeps its own
 * queue: the pay cards are its work, and the rollup has none.
 *
 * Pure apart from `mapSeatOf` and `mapView`, which are the reads.
 */

export type MapReach = 'PROGRAM' | 'REGION' | 'SITE'

/** A site as Ask Etyme needs it: what a person may name in a question. */
export interface Place { name: string; city: string | null; region: string | null }

export interface MapSeat {
  reach: MapReach
  /** The region's label, the plant's name, or the client's name. */
  label: string
  /** The client's name, for a sentence. */
  client: string
  /** The client's sites, to tell a place the seat reads from one it does not. */
  places: Place[]
}

/** How far ahead "near the time limit" looks: the twin's first warning. */
export const NEAR_DAYS = 90

export const REGION_CHIPS: readonly string[] = [
  'Which plants have weeks waiting?',
  'Who is near the time limit in my region?',
  'Which invoice receipts are held?',
  'How does each country here run?',
]

export const PROGRAM_CHIPS: readonly string[] = [
  'What did we spend this month, by region?',
  'What is held and why?',
  'Who is past the time limit?',
]

export const PLANT_LIMIT_CHIP = 'Who is near the time limit at my plant?'

/**
 * Which map, if any, this seat reads. Pure: the facts are read by `mapSeatOf`.
 */
export function mapReach(seat: {
  companyKind: string | null | undefined
  /** The seat's region, where it sits on a REGION unit. */
  region: string | null
  /** The plant's name, where it sits on a SITE unit. */
  plant: string | null
  /** Whether the seat sits on any unit at all. */
  onUnit: boolean
  permissions: readonly string[]
  /** How many regions the client's sites fall in. */
  regions: number
}): MapReach | null {
  if (seat.companyKind !== 'CLIENT') return null
  if (seat.region) return 'REGION'
  if (seat.plant) return 'SITE'
  if (seat.onUnit) return null
  if (seat.regions < 2) return null
  if (!hasPermission(seat.permissions, 'utilization.read')) return null
  if (hasPermission(seat.permissions, 'payments.record')) return null
  return 'PROGRAM'
}

/** The chips over the box for a map seat; a plant seat's are its own with the plant's time limit added. */
export function mapChips(reach: MapReach, own: readonly string[] = []): readonly string[] {
  if (reach === 'REGION') return REGION_CHIPS
  if (reach === 'PROGRAM') return PROGRAM_CHIPS
  return [...own.filter((q) => q !== 'Who is near the time limit?').slice(0, 3), PLANT_LIMIT_CHIP]
}

// ── What was asked ───────────────────────────────────────────────────

export type MapAsk = 'NEEDS' | 'PLANT_WEEKS' | 'LIMIT' | 'PAST' | 'HELD' | 'HELD_RECEIPTS' | 'SPEND' | 'COUNTRIES' | 'HELP'

/** One of the map's questions, or null. Case and punctuation do not matter. */
export function readMapAsk(raw: string): MapAsk | null {
  const lower = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!lower) return 'HELP'
  if (/\bcountr(y|ies)\b/.test(lower)) return 'COUNTRIES'
  if (/\btime[- ]limits?\b|\btenure\b|\b18[- ]months?\b/.test(lower)) {
    return /\b(past|over|beyond|reached|passed)\b/.test(lower) ? 'PAST' : 'LIMIT'
  }
  if (/\b(held|on hold|stuck|blocked)\b/.test(lower)) {
    return /\b(invoice receipts?|receipts?|invoices?)\b/.test(lower) && !/\b(starts?|why)\b/.test(lower) ? 'HELD_RECEIPTS' : 'HELD'
  }
  if (/\b(spend|spent|spending|cost|costs)\b/.test(lower)) return 'SPEND'
  if (/\b(weeks?|timesheets?)\b/.test(lower) && /\b(waiting|wait|waits|to sign|unsigned|not signed)\b/.test(lower)) return 'PLANT_WEEKS'
  const base = readAsk(raw).kind
  if (base === 'NEEDS') return 'NEEDS'
  if (base === 'HELP') return 'HELP'
  return null
}

/**
 * Whether this seat's question is answered from the map. A region seat's
 * always is. A program seat's is where it asks about regions, plants,
 * what is held or the time limit; "what did we spend by supplier" still
 * goes to the supplier answer. A plant seat's is where it names its plant
 * or asks how its country runs.
 */
export function answeredByMap(reach: MapReach, ask: MapAsk | null, text: string): boolean {
  if (reach === 'REGION') return true
  const lower = text.toLowerCase()
  const plants = /\b(plants?|sites?|regions?)\b/.test(lower)
  if (reach === 'PROGRAM') {
    if (!ask || ask === 'HELP') return false
    if (ask === 'SPEND') return /\bregions?\b/.test(lower)
    if (ask === 'PLANT_WEEKS') return plants
    return true
  }
  if (ask === 'COUNTRIES') return true
  return (ask === 'LIMIT' || ask === 'PAST' || ask === 'PLANT_WEEKS') && plants
}

// ── Out of reach ─────────────────────────────────────────────────────

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function names(text: string, word: string): boolean {
  const w = plain(word).trim()
  if (w.length < 3) return false
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(plain(text))
}

/**
 * The refusal for a question that names a region or a plant the seat does
 * not read, in one sentence naming the seat's own: the same sentence the
 * By region page says. Null where the question names nothing out of reach.
 */
export function outOfReach(text: string, seat: Pick<MapSeat, 'reach' | 'label' | 'places'>): string | null {
  if (seat.reach === 'PROGRAM') return null
  const ownRegion = seat.reach === 'REGION'
    ? seat.label
    : seat.places.find((p) => p.name === seat.label)?.region ?? null
  const regions = [...new Set(seat.places.map((p) => p.region).filter((r): r is string => !!r))]
  const otherRegion = regions.find((r) => r !== ownRegion && names(text, r))
  if (otherRegion) return refusal(seat.label, otherRegion)
  const mine = (p: Place) => (seat.reach === 'REGION' ? p.region === seat.label : p.name === seat.label)
  // A plant shares a town's name with one of the seat's own: not out of reach.
  const ownWords = seat.places.filter(mine).flatMap((p) => [p.name, p.city ?? '', p.name.split(',')[0]])
  const other = seat.places.find((p) =>
    !mine(p) && [p.name, p.city ?? '', p.name.split(',')[0]].some((w) => w && !ownWords.some((o) => plain(o) === plain(w)) && names(text, w)))
  return other ? refusal(seat.label, other.name) : null
}

function refusal(own: string, asked: string): string {
  return `Your seat reads ${own} only, so ${asked} is not on your page.`
}

// ── Words ────────────────────────────────────────────────────────────

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
function upper(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase())
}
function word(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

/** The By region page for this seat, opened on a region or a manager. */
export function byRegionHref(q: { region?: string | null; manager?: string | null } = {}): string {
  const p = new URLSearchParams()
  if (q.region) p.set('region', q.region)
  if (q.manager) p.set('manager', q.manager)
  const extra = p.toString()
  return extra ? `${BY_REGION_HREF}&${extra}` : BY_REGION_HREF
}

/** Spend per currency, never added across currencies: "$62,720 · MX$268,800". */
export function spendWords(spend: readonly SpendLine[]): string {
  if (spend.length === 0) return 'no rate on record'
  return spend.map((s) => format(fromMinor(s.minor, s.currency), { compact: true })).join(' · ')
}

function daysWords(days: number): string {
  if (days === 0) return 'today'
  if (days < 0) return `${count(-days, 'day')} past it`
  return `in ${count(days, 'day')}`
}

/** What this seat reads, as a sentence says it. */
function scopeOf(data: RegionsData): string {
  return data.reader.label ?? data.client.name
}

function openLink(data: RegionsData): Link {
  return { label: 'Open By region', href: byRegionHref({ region: data.reader.reach === 'REGION' ? data.reader.label : null }) }
}

// ── The answers, from By region's own read ───────────────────────────

/**
 * The greeting, or "what needs me": By region's own first line, its own
 * number. `greeting` marks the first message of the chat.
 */
export function mapNeeds(data: RegionsData, reach: MapReach, greeting: boolean, boundary?: string): Answer {
  const where = scopeOf(data)
  const close = reach === 'PROGRAM'
    ? `Ask me what ${data.client.name} spends by region, what is held and why, and who is past the time limit. I answer from the record, and I never move money without a person.`
    : `Ask me about ${where}: its plants, its weeks, the time limit, its invoice receipts and how each country runs. I read ${where} only, and I answer from the record.`
  return {
    kind: 'NEEDS', greeting, says: data.greeting.says, items: [],
    more: [{ says: close }, ...(boundary ? [{ says: boundary }] : [])],
    links: [openLink(data)],
  }
}

/** The mark's number for a map seat: the greeting's own. */
export function mapOwed(data: RegionsData): number {
  return data.greeting.total
}

/** Which plants have weeks waiting: a region's plants, a plant's own row, or the program's regions. */
export function mapWeeks(data: RegionsData): Answer {
  const where = scopeOf(data)
  if (data.region) {
    const rows = data.region.managers.filter((m) => m.weeksToSign > 0).sort((a, b) => b.weeksToSign - a.weeksToSign || a.plant.localeCompare(b.plant))
    const f = data.total
    const head = data.reader.reach === 'SITE'
      ? `${where}: ${count(f.contractors, 'contractor')} on site.`
      : `${where}: ${count(f.plants, 'plant')}, ${count(f.contractors, 'contractor')} on site.`
    const weeks = rows.reduce((n, r) => n + r.weeksToSign, 0)
    const plants = new Set(rows.map((r) => r.plant)).size
    const says = weeks === 0
      ? `${head} No week waits to be signed.`
      : `${head} ${count(weeks, 'week')} ${weeks === 1 ? 'waits' : 'wait'} to be signed${data.reader.reach === 'SITE' ? '' : ` at ${count(plants, 'plant')}`}.`
    const table: ListTable = {
      caption: `Weeks waiting to be signed, ${where}`,
      head: ['Plant', 'Hiring manager', 'Contractors', 'Weeks waiting'],
      rows: rows.map((r: ManagerRow) => ({
        cells: [r.plant, r.manager, String(r.contractors), String(r.weeksToSign)],
        href: byRegionHref({ region: r.region, manager: r.managerId ?? 'none' }),
      })),
    }
    return { kind: 'LIST', says, table: rows.length ? table : undefined, links: [openLink(data)] }
  }
  const rows = data.regions.filter((r) => r.weeksToSign > 0)
  const total = data.total.weeksToSign
  const says = total === 0
    ? `No week waits to be signed at ${where}.`
    : `${count(total, 'week')} ${total === 1 ? 'waits' : 'wait'} to be signed across ${count(rows.length, 'region')}. Open a region on By region for its plants.`
  return {
    kind: 'LIST', says,
    table: rows.length ? {
      caption: `Weeks waiting to be signed, by region`,
      head: ['Region', 'Plants', 'Contractors', 'Weeks waiting'],
      rows: rows.map((r: RegionRow) => ({ cells: [r.label, String(r.plants), String(r.contractors), String(r.weeksToSign)], href: byRegionHref({ region: r.label }) })),
    } : undefined,
    links: [openLink(data)],
  }
}

/**
 * Who is near (or past) the time limit. A plant seat reads its own
 * contractors, every one; a region its plants and a program its regions,
 * the nearest person at each, and the sentence says so.
 */
export function mapLimit(data: RegionsData, mode: 'NEAR' | 'PAST', people: readonly ContractorRow[] | null = null): Answer {
  if (data.limitSays) return { kind: 'TEXT', says: data.limitSays, links: [openLink(data)] }
  const where = scopeOf(data)
  const inScope = (days: number) => (mode === 'PAST' ? days < 0 : days <= NEAR_DAYS)
  const what = mode === 'PAST' ? 'past the time limit' : `within ${NEAR_DAYS} days of the time limit`

  if (people) {
    const counted = people.filter((p) => p.daysLeft !== null)
    const rows = counted.filter((p) => inScope(p.daysLeft!)).sort((a, b) => a.daysLeft! - b.daysLeft!)
    const nearest = [...counted].sort((a, b) => a.daysLeft! - b.daysLeft!)[0]
    const says = rows.length === 0
      ? `None of your ${count(people.length, 'contractor')} at ${where} is ${what}.${nearest ? ` The nearest is ${nearest.name}, ${daysWords(nearest.daysLeft!)}.` : ''} Counted across every supplier.`
      : `${upper(word(rows.length))} of your ${count(people.length, 'contractor')} at ${where} ${rows.length === 1 ? 'is' : 'are'} ${what}. ${rows[0].name} is nearest, ${daysWords(rows[0].daysLeft!)}. Counted across every supplier.`
    return {
      kind: 'LIST', says,
      table: rows.length ? {
        caption: `Your contractors ${what}`,
        head: ['Contractor', 'Supplier', 'Months here', 'Time limit'],
        rows: rows.map((p) => ({ cells: [p.name, p.supplier, String(p.monthsHere), daysWords(p.daysLeft!)], href: `/dashboard/people/${p.personId}` })),
      } : undefined,
      links: [openLink(data)],
    }
  }

  // Each plant's nearest (a region) or each region's nearest (a program).
  const each = data.region
    ? data.region.managers.map((m) => ({ place: m.plant, region: m.region, near: m.nearestLimit }))
    : data.regions.map((r) => ({ place: r.label, region: r.label, near: r.nearestLimit }))
  const byPlace = new Map<string, NonNullable<(typeof each)[number]['near']>>()
  for (const e of each) {
    if (!e.near) continue
    const had = byPlace.get(e.place)
    if (!had || e.near.days < had.days) byPlace.set(e.place, e.near)
  }
  const rows = [...byPlace.entries()].filter(([, n]) => inScope(n.days)).sort((a, b) => a[1].days - b[1].days)
  const unit = data.region ? 'plant' : 'region'
  const nearest = data.total.nearestLimit
  let says: string
  if (rows.length === 0) {
    says = `Nobody at ${where} is ${what}.${nearest ? ` The nearest is ${nearest.personName} at ${nearest.plant}, ${daysWords(nearest.days)}.` : ''} Counted across every supplier.`
  } else {
    const first = rows[0][1]
    says = `${upper(count(rows.length, unit))} ${rows.length === 1 ? 'has' : 'have'} somebody ${what}. ` +
      `${first.personName} at ${first.plant} is nearest, ${daysWords(first.days)}. ` +
      `This is the nearest person at each ${unit}, counted across every supplier; open the ${unit} on By region for everyone.`
  }
  return {
    kind: 'LIST', says,
    table: rows.length ? {
      caption: `The nearest person at each ${unit}, ${what}`,
      head: [upper(unit), 'Nearest', 'Plant', 'Time limit'],
      rows: rows.map(([place, n]) => ({ cells: [place, n.personName, n.plant, daysWords(n.days)], href: byRegionHref({ region: data.region ? data.region.label : place }) })),
    } : undefined,
    links: [openLink(data)],
  }
}

/** By region's own sentences for what is held: a receipt, a start. */
function heldItems(data: RegionsData): { receipts: string[]; starts: string[] } {
  const items = data.greeting.items
  const receipts = items.filter((i) => /\binvoice receipts?\b/.test(i))
  const starts = items.filter((i) => !/\binvoice receipts?\b/.test(i) && /\bstarts?\b/.test(i))
  return { receipts, starts }
}

/** Which invoice receipts are held, and how many are ready to pay. */
export function mapHeldReceipts(data: RegionsData): Answer {
  const where = scopeOf(data)
  const r = data.total.receipts
  if (!r) return { kind: 'TEXT', says: data.receiptsSays ?? 'Invoice receipts are not counted on your page.', links: [openLink(data)] }
  const ready = r.ready === 0 ? '' : r.ready === 1 ? ' One other is ready to pay.' : ` ${upper(word(r.ready))} others are ready to pay.`
  if (r.held === 0) {
    const readyNone = r.ready === 0 ? '' : ` ${upper(word(r.ready))} ${r.ready === 1 ? 'is' : 'are'} ready to pay.`
    return { kind: 'TEXT', says: `No invoice receipt is held in ${where}.${readyNone}`, links: [openLink(data)] }
  }
  const { receipts } = heldItems(data)
  const says = receipts.length
    ? `${receipts.map((s) => upper(s)).join('. ')}.${ready}`
    : `${upper(count(r.held, 'invoice receipt'))} ${r.held === 1 ? 'is' : 'are'} held in ${where}.${ready}`
  return { kind: 'TEXT', says, links: [openLink(data)] }
}

/** What is held and why: By region's own sentences for each held receipt and start. */
export function mapHeld(data: RegionsData): Answer {
  const where = scopeOf(data)
  const { receipts, starts } = heldItems(data)
  const lines = [...receipts, ...starts]
  const unread = data.total.receipts === null && data.receiptsSays ? ` ${data.receiptsSays}` : ''
  if (lines.length === 0) {
    return { kind: 'TEXT', says: `Nothing is held at ${where}: no invoice receipt and no start.${unread}`, links: [openLink(data)] }
  }
  return { kind: 'TEXT', says: `${lines.map((s) => upper(s)).join('. ')}.${unread}`, links: [openLink(data)] }
}

/**
 * Spend this month, by region: per currency, never added across
 * currencies, said as By region says it — an estimate from current rates,
 * not signed time — with money's one-currency figure where it has every
 * rate, and its sentence beside it either way.
 */
export function mapSpend(data: RegionsData): Answer {
  const where = scopeOf(data)
  const one = data.total.spendOneCurrency
  const oneOf = (s: SpendLine | null) => (s ? format(fromMinor(s.minor, s.currency), { compact: true }) : '—')
  const rows = data.regions.map((r) => ({
    cells: [r.label, String(r.contractors), spendWords(r.spend), ...(one ? [oneOf(r.spendOneCurrency)] : [])],
    href: byRegionHref({ region: r.label }),
  }))
  rows.push({ cells: ['All regions', String(data.total.contractors), spendWords(data.total.spend), ...(one ? [oneOf(one)] : [])], href: byRegionHref() })
  const inCurrencies = data.currenciesSays ? ` ${data.currenciesSays}` : ''
  const total = one ? ` In ${one.currency}, about ${oneOf(one)}. ${data.oneCurrency.says}` : ` ${data.oneCurrency.says}`
  return {
    kind: 'LIST',
    says: `Spend this month at ${where}, ${count(data.total.contractors, 'contractor')} on site${inCurrencies}. It is an ${data.spendSays}.${total}`,
    table: {
      caption: 'Spend this month, by region',
      head: ['Region', 'Contractors', 'Spend this month', ...(one ? [`In ${one.currency}`] : [])],
      rows,
    },
    links: [openLink(data)],
  }
}

/** How each country in the region runs: regulatory's confirmed lines, and nothing else. */
export function mapCountries(data: RegionsData): Answer {
  if (!data.region) {
    return { kind: 'TEXT', says: 'Name a region and I will say how its countries run, for example “How does Belgium run, by country?”', links: [openLink(data)] }
  }
  const where = data.region.label
  const rows = data.region.countries
  if (rows.length === 0) {
    return { kind: 'TEXT', says: `Nothing about how ${where} runs is confirmed against its source yet, so nothing is shown.`, links: [openLink(data)] }
  }
  return {
    kind: 'LIST',
    says: `How each country in ${where} runs. Only lines checked against their source are shown; a country with none is left out.`,
    table: {
      caption: `How each country in ${where} runs`,
      head: ['Country', 'Papers', 'Pay', 'Rule'],
      rows: rows.map((c) => ({
        cells: [
          c.name,
          c.papers.length ? c.papers.map((p) => p.label).join(', ') : 'None confirmed',
          c.pay ? `${c.pay.says}. ${c.pay.lawSays}` : 'Not confirmed',
          c.rule ? c.rule.says : 'Not confirmed',
        ],
      })),
    },
    links: [openLink(data)],
  }
}

/** The boundary line for a region seat: nothing it asks is sent to a model, whatever the company's switch says. */
export const REGION_BOUNDARY = 'Your data stays in your company. Every read is logged. Nothing you ask here is sent to a model.'

/** A region seat's question the map does not answer: what it may ask. Never the model. */
export function mapHelp(seat: Pick<MapSeat, 'label'>): Answer {
  return {
    kind: 'TEXT',
    says: `I read ${seat.label} only. Ask which plants have weeks waiting, who is near the time limit, which invoice receipts are held, or how each country here runs.`,
    links: [{ label: 'Open By region', href: byRegionHref({ region: seat.label }) }],
  }
}

// ── The reads ────────────────────────────────────────────────────────

/**
 * Which map this caller reads, with the client's sites, or null. Reads
 * the client's site names and regions (no person) and, for a seat on a
 * unit, which kind of unit it is.
 */
export async function mapSeatOf(caller: CallerContext): Promise<MapSeat | null> {
  const company = caller.company
  if (!company || company.kind !== 'CLIENT' || caller.isService) return null
  const places = await prisma.companyLocation.findMany({
    where: { companyId: company.id },
    select: { name: true, city: true, region: true },
  })
  const regions = new Set(places.map((p) => p.region).filter(Boolean)).size
  let plant: string | null = null
  if (!caller.region && caller.orgUnitId) {
    const scope = await readerScope(caller, company.id)
    if (scope?.kind === 'SITE') plant = scope.label
  }
  const reach = mapReach({
    companyKind: company.kind, region: caller.region?.label ?? null, plant,
    onUnit: Boolean(caller.orgUnitId), permissions: caller.permissions, regions,
  })
  if (!reach) return null
  const label = reach === 'REGION' ? caller.region!.label : reach === 'SITE' ? plant! : company.name
  return { reach, label, client: company.name, places }
}

/** By region's read for this caller; null where it refused or failed. */
export async function mapView(
  caller: CallerContext,
  ask: { region?: string | null; manager?: string | null; trail: string }
): Promise<RegionsData | null> {
  const view = await regionsView(caller, { requestedClientId: null, region: ask.region ?? null, manager: ask.manager ?? null, trail: ask.trail })
  return view.error ? null : view.data
}

/** A region a program seat names in its question, so "how does Belgium run" opens Belgium. */
export function regionNamed(text: string, places: readonly Place[]): string | null {
  const regions = [...new Set(places.map((p) => p.region).filter((r): r is string => !!r))]
  return regions.find((r) => names(text, r)) ?? null
}

/**
 * One question from a map seat, answered from By region's read. Null where
 * the seat's question is not the map's, and goes where it always went.
 */
export async function mapAnswer(caller: CallerContext, seat: MapSeat, text: string): Promise<Answer | null> {
  // A region or a plant seat naming a place it does not read is refused,
  // whatever it asks: its seat reads that one place.
  const refused = outOfReach(text, seat)
  if (refused) return { kind: 'TEXT', says: refused, links: [{ label: 'Open By region', href: byRegionHref() }] }
  const ask = readMapAsk(text)
  if (!answeredByMap(seat.reach, ask, text)) return null
  if (!ask || ask === 'HELP') return mapHelp(seat)

  const trail = 'Ask Etyme'
  const region = seat.reach === 'PROGRAM' && ask === 'COUNTRIES' ? regionNamed(text, seat.places) : null
  const data = await mapView(caller, { region, trail })
  if (!data) return { kind: 'TEXT', says: 'By region could not be read just now, so there is no answer. Try again in a minute.' }

  switch (ask) {
    case 'NEEDS': return mapNeeds(data, seat.reach, false)
    case 'PLANT_WEEKS': return mapWeeks(data)
    case 'LIMIT':
    case 'PAST': {
      if (seat.reach === 'SITE') {
        // Their own contractors, every one; where they manage none on the
        // record, the plant's nearest, as a region reads it.
        const mine = await mapView(caller, { manager: caller.person.id, trail })
        return mapLimit(data, ask === 'PAST' ? 'PAST' : 'NEAR', mine?.manager ? mine.manager.contractors : null)
      }
      return mapLimit(data, ask === 'PAST' ? 'PAST' : 'NEAR')
    }
    case 'HELD': return mapHeld(data)
    case 'HELD_RECEIPTS': return mapHeldReceipts(data)
    case 'SPEND': return mapSpend(data)
    case 'COUNTRIES': return mapCountries(data)
  }
}
