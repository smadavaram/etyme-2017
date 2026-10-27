import { programMonthlySpend } from '@/lib/program-spend'
import { countWord, possessive } from '@/app/dashboard/program/needs-you'

/**
 * The program by region, as arithmetic: no database, no React.
 *
 * The founder, 2026-10-27, "go ahead and build this", on the region map:
 * three seats read one record at three altitudes. The head of operations
 * and the CFO read one row per region; a regional manager reads the hiring
 * managers of one region; a hiring manager reads their own plant. Every
 * figure here is counted from rows the read hands in (`./read`), and the
 * read takes them from the record, never from a drawing.
 *
 * ── The cell ─────────────────────────────────────────────────────────
 *
 * Everything is counted into one cell per region, plant and hiring
 * manager, and every coarser figure is a sum of cells. So a region's row
 * is the sum of its managers' rows, and the program's total is the sum of
 * its regions' rows: the CFO's total and the regions under it cannot
 * disagree, because one is made of the other.
 *
 * ── Money ────────────────────────────────────────────────────────────
 *
 * Spend is kept per currency, in each currency's own minor units, and
 * never converted here. A rupee and a dollar added together is the
 * plausible wrong number a CFO would act on. One currency for the rollup
 * is money's to compute (`spendOneCurrency`, null until it exists), and
 * until then the figure says how many currencies it is in.
 */

/** The label a site with no region is counted under, so a total never drops it. */
export const NO_REGION = 'No region set'
/** A job request or a line charged to no site the client has. */
export const NO_SITE = 'No site named'
/** A line or a job nobody is named as the hiring manager of. */
export const NO_MANAGER = 'Nobody named'

export interface Site {
  id: string
  name: string
  city: string | null
  state: string | null
  country: string
  region: string | null
}

/** Who manages a line or a job. A null id is nobody named. */
export interface Manager {
  id: string | null
  name: string
}

/** Somebody on site, at the rung the client pays. */
export interface OnSite {
  contractId: string
  personId: string
  personName: string
  manager: Manager
  siteId: string | null
  /** Minor units of `currency` an hour; null where the rung carries no rate. */
  rateMinor: number | null
  currency: string
  supplier: string
  job: string | null
  /** Whole months on site at this client, across every supplier. */
  monthsHere: number
  /** Days left before the time limit; negative past it; null where the client set none. */
  daysLeft: number | null
}

/** A start the paperwork will refuse on the day. */
export interface HeldStart {
  contractId: string
  personId: string
  personName: string
  manager: Manager
  siteId: string | null
  /** What it waits on, inside a sentence: "an I-9 (proof of right to work)", or "papers". */
  waitingOn: string
}

export interface OpenJob {
  id: string
  title: string
  manager: Manager
  siteId: string | null
  /** The region of a job charged to a region and to no plant under it. */
  region: string | null
}

/** A week filed and not yet signed by the client. */
export interface WeekToSign {
  id: string
  personId: string
  personName: string
  manager: Manager
  siteId: string | null
}

/** A paper the client asked for, not in yet. */
export interface Asked {
  personId: string
  manager: Manager
  siteId: string | null
}

export type ReceiptState = 'PAID' | 'READY' | 'HELD'

/** An invoice receipt from a supplier, and where the three-way check left it. */
export interface Receipt {
  id: string
  number: string
  supplier: string
  personName: string
  manager: Manager
  siteId: string | null
  state: ReceiptState
  /** Why it is held, in a line: "41.5 hours billed, 40 signed". */
  heldSays: string | null
}

export interface Facts {
  sites: Site[]
  /** Region label → the regional managers seated on it. */
  leads: Map<string, string[]>
  onSite: OnSite[]
  held: HeldStart[]
  open: OpenJob[]
  weeks: WeekToSign[]
  asked: Asked[]
  /** Null where the reader holds no desk that reads invoice receipts. */
  receipts: Receipt[] | null
}

export interface SpendLine {
  currency: string
  minor: number
}

export interface Figures {
  plants: number
  hiringManagers: number
  contractors: number
  openJobs: number
  weeksToSign: number
  papers: { asked: number; onHold: number }
  /** Null where the reader may not read invoice receipts. */
  receipts: { paid: number; ready: number; held: number } | null
  /** The nearest anybody here is to the time limit; null where nobody is counted. */
  nearestLimit: { days: number; personName: string; plant: string } | null
  /** A month at current rates, per currency, largest first. */
  spend: SpendLine[]
  /** Money's one-currency total. Null until it exists: never a sum of currencies. */
  spendOneCurrency: SpendLine | null
  /** People on site whose rung carries no rate, and so are not in `spend`. */
  unpriced: number
}

export interface RegionRow extends Figures {
  label: string
  /** The regional managers seated on this region. */
  leads: string[]
}

export interface ManagerRow extends Figures {
  managerId: string | null
  manager: string
  siteId: string | null
  plant: string
  region: string
  currency: string | null
}

export interface ContractorRow {
  contractId: string
  personId: string
  name: string
  job: string | null
  supplier: string
  rateMinor: number | null
  currency: string
  monthsHere: number
  daysLeft: number | null
  /** Weeks this person filed that the client has not signed. */
  weeksToSign: number
  /** Papers the client asked this person for, not in yet. */
  papersAsked: number
}

// ── Where a row belongs ──────────────────────────────────────────────

export function regionOfSite(site: Site | undefined): string {
  return site?.region ?? NO_REGION
}

/** The plant as a person says it in a sentence: the town, not the state. */
export function plantShort(site: Site | undefined): string {
  if (!site) return NO_SITE
  return site.city ?? site.name.split(',')[0]
}

interface Placed { manager: Manager; siteId: string | null }

function cellKey(region: string, siteId: string | null, managerId: string | null): string {
  return `${region}\u0000${siteId ?? ''}\u0000${managerId ?? ''}`
}

// ── Figures ──────────────────────────────────────────────────────────

const EMPTY = (receipts: boolean): Figures => ({
  plants: 0, hiringManagers: 0, contractors: 0, openJobs: 0, weeksToSign: 0,
  papers: { asked: 0, onHold: 0 },
  receipts: receipts ? { paid: 0, ready: 0, held: 0 } : null,
  nearestLimit: null, spend: [], spendOneCurrency: null, unpriced: 0,
})

/** A month of spend per currency, from the people on site. */
export function spendOf(people: readonly Pick<OnSite, 'rateMinor' | 'currency'>[]): { spend: SpendLine[]; unpriced: number } {
  const byCurrency = new Map<string, { rateMinorPerHour: number | null }[]>()
  for (const p of people) byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), { rateMinorPerHour: p.rateMinor }])
  let unpriced = 0
  const spend: SpendLine[] = []
  for (const [currency, seats] of byCurrency) {
    const s = programMonthlySpend(seats)
    unpriced += s.unpriced
    if (s.priced > 0) spend.push({ currency, minor: s.totalMinor })
  }
  return { spend: sortSpend(spend), unpriced }
}

function sortSpend(spend: SpendLine[]): SpendLine[] {
  return [...spend].sort((a, b) => a.currency.localeCompare(b.currency))
}

/** Two sets of figures as one. Every coarser figure is made this way. */
export function addFigures(a: Figures, b: Figures): Figures {
  const spend = new Map<string, number>()
  for (const s of [...a.spend, ...b.spend]) spend.set(s.currency, (spend.get(s.currency) ?? 0) + s.minor)
  const nearest = [a.nearestLimit, b.nearestLimit].filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((x, y) => x.days - y.days)[0] ?? null
  return {
    plants: a.plants + b.plants,
    hiringManagers: a.hiringManagers + b.hiringManagers,
    contractors: a.contractors + b.contractors,
    openJobs: a.openJobs + b.openJobs,
    weeksToSign: a.weeksToSign + b.weeksToSign,
    papers: { asked: a.papers.asked + b.papers.asked, onHold: a.papers.onHold + b.papers.onHold },
    receipts: a.receipts && b.receipts
      ? { paid: a.receipts.paid + b.receipts.paid, ready: a.receipts.ready + b.receipts.ready, held: a.receipts.held + b.receipts.held }
      : null,
    nearestLimit: nearest,
    spend: sortSpend([...spend].map(([currency, minor]) => ({ currency, minor }))),
    spendOneCurrency: null,
    unpriced: a.unpriced + b.unpriced,
  }
}

export function sumFigures(rows: readonly Figures[], receipts: boolean): Figures {
  return rows.reduce<Figures>((acc, r) => addFigures(acc, r), EMPTY(receipts))
}

/**
 * Every cell: one per region, plant and hiring manager, each with its own
 * figures. A plant with nothing on it still has a cell, so it is counted
 * among the region's plants.
 */
export function cells(f: Facts): ManagerRow[] {
  const siteById = new Map(f.sites.map((s) => [s.id, s]))
  const withReceipts = f.receipts !== null
  const out = new Map<string, ManagerRow & { _people: OnSite[] }>()

  const cell = (p: Placed, regionHint: string | null = null) => {
    const site = p.siteId ? siteById.get(p.siteId) : undefined
    // A line at a site the reader cannot see is counted under no site,
    // never under somebody else's plant.
    const siteId = site ? site.id : null
    const region = site ? regionOfSite(site) : regionHint ?? NO_REGION
    const key = cellKey(region, siteId, p.manager.id)
    let c = out.get(key)
    if (!c) {
      c = {
        ...EMPTY(withReceipts),
        managerId: p.manager.id, manager: p.manager.id ? p.manager.name : NO_MANAGER,
        siteId, plant: site?.name ?? NO_SITE, region, currency: null, _people: [],
      }
      out.set(key, c)
    }
    return c
  }

  for (const p of f.onSite) {
    const c = cell(p)
    c.contractors++
    c._people.push(p)
    c.currency = c.currency ?? p.currency
    if (p.daysLeft !== null && (c.nearestLimit === null || p.daysLeft < c.nearestLimit.days)) {
      c.nearestLimit = { days: p.daysLeft, personName: p.personName, plant: c.plant }
    }
  }
  for (const h of f.held) cell(h).papers.onHold++
  for (const j of f.open) cell(j, j.region).openJobs++
  for (const w of f.weeks) cell(w).weeksToSign++
  for (const a of f.asked) cell(a).papers.asked++
  for (const r of f.receipts ?? []) {
    const c = cell(r)
    if (!c.receipts) continue
    if (r.state === 'PAID') c.receipts.paid++
    else if (r.state === 'HELD') c.receipts.held++
    else c.receipts.ready++
  }

  // A plant with nobody and nothing on it is still one of the region's plants.
  for (const s of f.sites) {
    const region = regionOfSite(s)
    const has = [...out.values()].some((c) => c.siteId === s.id)
    if (!has) {
      out.set(cellKey(region, s.id, null), {
        ...EMPTY(withReceipts), managerId: null, manager: NO_MANAGER, siteId: s.id, plant: s.name, region, currency: null, _people: [],
      })
    }
  }

  // A plant is counted once, on its first cell; a manager once per cell.
  const plantCounted = new Set<string>()
  const rows: ManagerRow[] = []
  for (const c of out.values()) {
    const { _people, ...row } = c
    const money = spendOf(_people)
    row.spend = money.spend
    row.unpriced = money.unpriced
    if (row.siteId && !plantCounted.has(row.siteId)) {
      plantCounted.add(row.siteId)
      row.plants = 1
    }
    row.hiringManagers = row.managerId ? 1 : 0
    rows.push(row)
  }
  return rows
}

/** Whether a cell carries anything a person would read on a manager's row. */
function busy(r: Figures): boolean {
  return r.contractors + r.openJobs + r.weeksToSign + r.papers.asked + r.papers.onHold
    + (r.receipts ? r.receipts.paid + r.receipts.ready + r.receipts.held : 0) > 0
}

/**
 * One row per region, most contractors first, "No region set" last. Each
 * is the sum of its cells.
 *
 * A hiring manager is counted once per region they manage in: two plants
 * of one manager in one region are one manager.
 */
export function regionRows(f: Facts, all: ManagerRow[] = cells(f)): RegionRow[] {
  const labels = [...new Set(all.map((c) => c.region))]
  const rows = labels.map((label) => {
    const mine = all.filter((c) => c.region === label)
    const sum = sumFigures(mine, f.receipts !== null)
    const managers = new Set(mine.map((c) => c.managerId).filter((id): id is string => id !== null))
    return { ...sum, hiringManagers: managers.size, label, leads: f.leads.get(label) ?? [] }
  })
  return rows.sort((a, b) =>
    (a.label === NO_REGION ? 1 : 0) - (b.label === NO_REGION ? 1 : 0) || b.contractors - a.contractors || a.label.localeCompare(b.label))
}

/**
 * A region's hiring managers: one row per manager and plant, with
 * anything on it. A plant with nobody named and nothing on it is not a
 * row; it is still one of the region's plants.
 */
export function managerRows(f: Facts, region: string, all: ManagerRow[] = cells(f)): ManagerRow[] {
  return all
    .filter((c) => c.region === region && (c.managerId !== null || busy(c)))
    .sort((a, b) => a.plant.localeCompare(b.plant) || a.manager.localeCompare(b.manager))
}

/** One manager's contractors, nearest the time limit first. */
export function contractorRows(f: Facts, managerId: string | null): ContractorRow[] {
  const weeks = new Map<string, number>()
  for (const w of f.weeks) if (w.manager.id === managerId) weeks.set(w.personId, (weeks.get(w.personId) ?? 0) + 1)
  const asked = new Map<string, number>()
  for (const a of f.asked) if (a.manager.id === managerId) asked.set(a.personId, (asked.get(a.personId) ?? 0) + 1)
  return f.onSite
    .filter((p) => p.manager.id === managerId)
    .map((p) => ({
      contractId: p.contractId, personId: p.personId, name: p.personName, job: p.job, supplier: p.supplier,
      rateMinor: p.rateMinor, currency: p.currency, monthsHere: p.monthsHere, daysLeft: p.daysLeft,
      weeksToSign: weeks.get(p.personId) ?? 0, papersAsked: asked.get(p.personId) ?? 0,
    }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.name.localeCompare(b.name))
}

/** The facts of one region, or of one manager, for a greeting over just them. */
export function factsWhere(f: Facts, keep: (p: Placed & { region?: string | null }) => boolean): Facts {
  return {
    ...f,
    onSite: f.onSite.filter(keep),
    held: f.held.filter(keep),
    open: f.open.filter(keep),
    weeks: f.weeks.filter(keep),
    asked: f.asked.filter(keep),
    receipts: f.receipts ? f.receipts.filter(keep) : null,
  }
}

/** Whether a placed row is in `region`, by its site, or by its own region where it has no site. */
export function inRegion(f: Pick<Facts, 'sites'>, region: string) {
  const siteById = new Map(f.sites.map((s) => [s.id, s]))
  return (p: Placed & { region?: string | null }) => {
    const site = p.siteId ? siteById.get(p.siteId) : undefined
    return (site ? regionOfSite(site) : p.region ?? NO_REGION) === region
  }
}

// ── What a spend figure says ─────────────────────────────────────────

/**
 * The words beside a spend figure where it is in more than one currency:
 * "in 8 currencies". Empty where it is in one or none, because then the
 * figure itself says its currency.
 */
export function currenciesSays(spend: readonly SpendLine[]): string {
  return spend.length > 1 ? `in ${spend.length} currencies` : ''
}

// ── The greeting ─────────────────────────────────────────────────────

function joinPlants(names: string[]): string {
  const u = [...new Set(names)]
  if (u.length <= 1) return u.join('')
  if (u.length === 2) return `${u[0]} and ${u[1]}`
  if (u.length === 3) return `${u[0]}, ${u[1]} and ${u[2]}`
  return `${u[0]}, ${u[1]} and ${u.length - 2} more plants`
}

export interface Greeting {
  /** The things named, which is the number in the sentence. */
  total: number
  says: string
  items: string[]
}

/**
 * The first line, by the greeting rule (founder, 2026-10-19): names, not
 * counts. A held invoice receipt by supplier, person and plant; a start
 * on hold by person and plant; and the weeks waiting to be signed, by
 * count and plant. "Three things need you: …"
 *
 * Several held receipts or starts are said once each, with their plants,
 * so the sentence stays one sentence.
 */
export function greeting(f: Facts): Greeting {
  const siteById = new Map(f.sites.map((s) => [s.id, s]))
  const at = (siteId: string | null) => plantShort(siteId ? siteById.get(siteId) : undefined)
  const items: string[] = []

  const heldReceipts = (f.receipts ?? []).filter((r) => r.state === 'HELD')
  if (heldReceipts.length === 1) {
    const r = heldReceipts[0]
    items.push(`${possessive(r.supplier)} invoice receipt for ${r.personName} at ${at(r.siteId)} is held${r.heldSays ? `, ${r.heldSays}` : ''}`)
  } else if (heldReceipts.length > 1) {
    items.push(`${countWord(heldReceipts.length)} invoice receipts are held, at ${joinPlants(heldReceipts.map((r) => at(r.siteId)))}`)
  }

  if (f.held.length === 1) {
    const h = f.held[0]
    items.push(`${possessive(h.personName)} start at ${at(h.siteId)} waits on ${h.waitingOn}`)
  } else if (f.held.length > 1) {
    items.push(`${countWord(f.held.length)} starts are on hold for papers, at ${joinPlants(f.held.map((h) => at(h.siteId)))}`)
  }

  if (f.weeks.length > 0) {
    const plants = [...new Set(f.weeks.map((w) => at(w.siteId)))]
    const where = plants.length === 1 ? `at ${plants[0]}` : `at ${plants.length} plants`
    items.push(`${f.weeks.length} ${f.weeks.length === 1 ? 'week waits' : 'weeks wait'} to be signed ${where}`)
  }

  if (items.length === 0) return { total: 0, says: 'Nothing needs you today.', items }
  const lead = `${countWord(items.length).replace(/^./, (c) => c.toUpperCase())} ${items.length === 1 ? 'thing needs' : 'things need'} you`
  return { total: items.length, says: `${lead}: ${items.join('; ')}.`, items }
}

/**
 * What a held start waits on, from the start's own sentence
 * (`heldStartSays`): "Cannot start without an I-9 (proof of right to
 * work). Get it on file, then activate." waits on "an I-9 (proof of right
 * to work)". A sentence of any other shape (a license, lapsed cover)
 * waits on "papers", and its own sentence is on the start's row.
 */
export function waitingOn(short: string | null | undefined): string {
  const m = /^Cannot start without (.+?)\. Get /.exec(short ?? '')
  return m ? m[1] : 'papers'
}

// ── Countries ────────────────────────────────────────────────────────

/**
 * The code regulatory's country table reads for a site
 * (`lib/document-stages/countries`). A site in Northern Ireland is stored
 * as the UK (`GB`) with its province in `state`; the table keys it
 * `GB-NIR`, because its agency rules are its own.
 */
export function countryCodeFor(site: Pick<Site, 'country' | 'state'>): string {
  const c = (site.country ?? '').trim().toUpperCase()
  if ((c === 'GB' || c === 'UK') && /northern ireland/i.test(site.state ?? '')) return 'GB-NIR'
  return c
}
