/**
 * Sites: where people work, who hires there, and which suppliers fill
 * jobs there. The rules and the sentences, with no database in them.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The founder, 2026-10-28: "Branch offices with plants where hirings and
 * placements from suppliers can happen", then "Build it, sites sounds
 * good" on the drawing (CLAUDE.md, "Sites — where people work …"). A
 * site already existed (`CompanyLocation`: country, time zone, region).
 * What is new is three answers per site, each saying where it came from:
 *
 *   - which approved suppliers may fill jobs there (`SiteSupplier`). A
 *     firm is approved for the company first, by Procurement under
 *     Suppliers, and only then named at a site. A site that names nobody
 *     reads as every approved supplier, so a client that never opened
 *     Sites still sends its jobs, and the screen says so.
 *   - who hires there. **Derived first, typed second**: a hiring manager
 *     is read from the jobs they raised or own at the site and from the
 *     placements they manage there; `SiteHiringManager` holds only a
 *     manager a person named who has nothing on the record at the site
 *     yet. The record never disagrees with itself that way: a manager who
 *     posts a job is read from the job, whatever was typed.
 *   - where the site came from: the contractor list import, the
 *     company's website, or a person (`CompanyLocation.source`).
 *
 * `lib/sites` is the database half, and the functions demand calls.
 */

import { rank } from '@/lib/supplier-tier'
import { formatDay } from '@/lib/format-date'

// ── Where an answer came from ────────────────────────────────────────

export type SiteSource = 'IMPORT' | 'WEBSITE' | 'PERSON'

/** The line under a site, in the drawing's words. */
export function sourceWords(source: SiteSource | string | null | undefined): string {
  if (source === 'IMPORT') return 'From your contractor list'
  if (source === 'WEBSITE') return 'From your website'
  return 'Typed by a person'
}

/** "Saved by Graham Ellery, Oct 28, 2026." Or nothing where nobody is on record. */
export function savedByWords(name: string | null | undefined, at: Date | string | null | undefined): string | null {
  if (!name || !at) return null
  return `Saved by ${name}, ${formatDay(at)}.`
}

// ── Approved for the company ─────────────────────────────────────────

/**
 * Which of a client's suppliers are approved, from the facts the
 * supplier standing already reads.
 *
 * `trading` is every firm the client buys from and has not blocked
 * (`suppliersOf` in lib/suppliers-of, the purchase-order picker's own
 * answer). Of those, approved is a standing of APPROVED or PREFERRED on
 * the client's register, or no standing and an agreement on file, which
 * is what an agreement is (`rank` in lib/supplier-tier, the VENDOR_TIER
 * rule's own reading). A firm on probation, or one the client merely
 * paid once with nothing signed, is not approved here.
 */
export function approvedFrom(input: {
  trading: ReadonlySet<string>
  tiers: ReadonlyMap<string, string | null>
  agreements: ReadonlySet<string>
}): Set<string> {
  const need = rank('APPROVED', false)
  const out = new Set<string>()
  for (const id of input.trading) {
    if (rank(input.tiers.get(id) ?? null, input.agreements.has(id)) >= need) out.add(id)
  }
  return out
}

/** A site's short name, as a hiring manager says it: "Dayton", not "Dayton, Ohio". */
export function siteShort(site: { name: string; city?: string | null }): string {
  return site.city?.trim() || site.name
}

/** The refusal under the supplier ticks when a firm is not approved for the company. */
export function notApprovedForCompany(firm: string, client: string): string {
  return `${firm} is not approved for ${client}. Procurement approves a firm first, under Suppliers; then any site may name it.`
}

/** The refusal on a job sent to a firm the site does not name. */
export function notApprovedAtSite(firm: string, site: { name: string; city?: string | null }): string {
  return `${firm} is not approved at ${siteShort(site)}. Ask Procurement to add them to this site, or pick another supplier.`
}

export interface SiteSuppliersVerdict {
  /** The firms a job at the site goes to by default. */
  ids: string[]
  /** True where the site names nobody, so every approved supplier is read. */
  everyApproved: boolean
  /** Named here once and no longer approved for the company: shown, never sent to. */
  lapsed: string[]
}

/**
 * The suppliers a job at a site goes to. Named and still approved; or,
 * where the site names nobody, every approved supplier. A firm named and
 * since struck off by Procurement stays off: the company's approval is
 * read first, every time, so a site cannot keep a firm the company let go.
 */
export function siteSuppliersFrom(input: { named: readonly string[]; approved: ReadonlySet<string> }): SiteSuppliersVerdict {
  if (input.named.length === 0) return { ids: [...input.approved], everyApproved: true, lapsed: [] }
  const ids = input.named.filter((id) => input.approved.has(id))
  const lapsed = input.named.filter((id) => !input.approved.has(id))
  return { ids, everyApproved: false, lapsed }
}

/** Whether a job at the site may go to this firm, and the sentence where it may not. */
export function mayFillAtSite(input: {
  supplier: { id: string; name: string }
  site: { name: string; city?: string | null }
  client: string
  approved: ReadonlySet<string>
  atSite: SiteSuppliersVerdict
}): { ok: true } | { ok: false; says: string } {
  if (!input.approved.has(input.supplier.id)) return { ok: false, says: notApprovedForCompany(input.supplier.name, input.client) }
  if (!input.atSite.ids.includes(input.supplier.id)) return { ok: false, says: notApprovedAtSite(input.supplier.name, input.site) }
  return { ok: true }
}

// ── Who hires there ──────────────────────────────────────────────────

export type ManagerFrom = 'JOBS' | 'PLACEMENTS' | 'NAMED'

export interface SiteManager {
  personId: string
  name: string
  from: ManagerFrom
  /** Live placements at the site this person manages. */
  contractors: number
  /** Open jobs at the site this person raised or owns. */
  openJobs: number
}

/** "From the jobs they posted", in the drawing's words. */
export function managerFromWords(from: ManagerFrom): string {
  if (from === 'JOBS') return 'From the jobs they posted'
  if (from === 'PLACEMENTS') return 'From the contractors they manage here'
  return 'Named by a person'
}

/**
 * The site's hiring managers: from its jobs first, then its placements,
 * then whoever a person named. One row per person, the strongest source
 * kept, so a manager typed in last week who has since posted a job reads
 * as "From the jobs they posted".
 */
export function siteManagersFrom(input: {
  jobs: readonly { personId: string; name: string; open: boolean }[]
  placements: readonly { personId: string; name: string }[]
  named: readonly { personId: string; name: string }[]
}): SiteManager[] {
  const out = new Map<string, SiteManager>()
  const put = (personId: string, name: string, from: ManagerFrom) => {
    const had = out.get(personId)
    if (!had) out.set(personId, { personId, name, from, contractors: 0, openJobs: 0 })
    return out.get(personId)!
  }
  for (const j of input.jobs) {
    const m = put(j.personId, j.name, 'JOBS')
    if (j.open) m.openJobs++
  }
  for (const p of input.placements) put(p.personId, p.name, 'PLACEMENTS').contractors++
  for (const n of input.named) put(n.personId, n.name, 'NAMED')
  return [...out.values()].sort((a, b) => b.contractors + b.openJobs - (a.contractors + a.openJobs) || a.name.localeCompare(b.name))
}

/** "14 contractors, 2 open jobs." */
export function managerLoadWords(m: Pick<SiteManager, 'contractors' | 'openJobs'>): string {
  const c = `${m.contractors} ${m.contractors === 1 ? 'contractor' : 'contractors'}`
  if (m.openJobs === 0) return c
  return `${c}, ${m.openJobs} open ${m.openJobs === 1 ? 'job' : 'jobs'}`
}

// ── Who may change a site ────────────────────────────────────────────

/** Refused: a firm reading or changing another company's sites, a supplier or a seated MSP among them. */
export function notYourSites(client: string): string {
  return `Sites are ${client}'s own to set. Its Owner, Admin or Procurement changes them.`
}

/** Refused: a seat that reads one region, changing a site in another. */
export function outsideYourRegion(site: string, siteRegion: string | null, seatRegion: string): string {
  const where = siteRegion ? `in ${siteRegion}` : 'in no region'
  return `${site} is ${where}, and your seat covers ${seatRegion} only. Ask an Owner or Admin to change it.`
}

/** Refused: deleting a site while somebody is placed there. */
export function placementsStillAt(site: { name: string; city?: string | null }, live: number): string {
  const short = siteShort(site)
  return live === 1
    ? `${site.name} has a placement at it. Move the placement at ${short} first.`
    : `${site.name} has ${live} placements at it. Move the ${live} placements at ${short} first.`
}

/** Refused: deleting a site that past placements were at; their time there is counted at it. */
export function pastPlacementsAt(site: { name: string }, past: number): string {
  return `${site.name} is the site of ${past} past ${past === 1 ? 'placement' : 'placements'}, and their time there is counted at it. Rename it instead.`
}

/** The placements that hold a site: anything not ended or called off, a start on hold included. */
export const HOLDS_A_SITE: readonly string[] = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED']
/** The placements counted as contractors on site today. */
export const ON_SITE: readonly string[] = ['IN_PROGRESS', 'PAUSED']

// ── Setup ────────────────────────────────────────────────────────────

/** The one thing skipping Sites stops, said under the buttons. */
export function skipStops(primary: string | null): string {
  return primary
    ? `If you skip: a job with no site is posted at ${primary}, and goes to every approved supplier.`
    : 'If you skip: a job with no site goes to every approved supplier.'
}

/** "Confirm all 31 and continue." */
export function confirmAllWords(n: number): string {
  if (n === 0) return 'Continue'
  return n === 1 ? 'Confirm this site and continue' : `Confirm all ${n} and continue`
}
