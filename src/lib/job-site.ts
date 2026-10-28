/**
 * A job's site, as the job form and the lists say it. Pure: no database.
 *
 * The founder, 2026-10-28, "Build it, sites sounds good" (CLAUDE.md,
 * "Sites — where people work …"). A job request names its site by id;
 * the site decides who the job goes to by default, and the placement
 * awarded from it is at the same site. `lib/sites` is the database half
 * and owns the refusals; this file owns the words on demand's screens.
 *
 * Three things live here:
 *
 *   - `SITE_FIELD_SAYS`, the line under the Site picker on the form;
 *   - `sendToSays`, the sentence under the "Send the job to" ticks,
 *     which names the firms approved for the company and not at the site
 *     so the hiring manager knows who to ask about, never a code;
 *   - `placeOf`, the one answer to "where is this job", read off the
 *     site first and the old free text second, so a job posted before
 *     sites still says where it is.
 */

/** The line under "Site" on the job form, in the drawing's words. */
export const SITE_FIELD_SAYS = 'Your site. Days off, the time limit and the pay currency follow it.'

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']

/** "Three", the way a person starts a sentence with a small count; a figure past twelve. */
export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

/** "A", "A and B", "A, B and C". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** A site's short name, as a hiring manager says it: "Dayton", not "Dayton, Ohio". */
export function siteShortName(site: { name: string; city?: string | null }): string {
  return site.city?.trim() || site.name
}

/**
 * The sentence under the "Send the job to" ticks.
 *
 * - No site at all: every approved supplier, said so.
 * - A site that names nobody: every approved supplier, said so.
 * - A site that names firms: how many, and where a firm is approved for
 *   the company and not here, who to ask to add it.
 */
export function sendToSays(input: {
  site: { name: string; city?: string | null } | null
  /** The firms approved at the site, by name. Ignored where `everyApproved`. */
  atSite: readonly string[]
  /** Approved for the company and not named at the site, by name. */
  others: readonly string[]
  everyApproved: boolean
}): string {
  if (!input.site) return 'No site is set, so the job goes to every approved supplier.'
  const at = siteShortName(input.site)
  if (input.everyApproved) return `${at} names no suppliers yet, so the job goes to every approved supplier.`
  const n = input.atSite.length
  const head = n === 0
    ? `No supplier is approved at ${at} any more.`
    : `${countWord(n)} ${n === 1 ? 'supplier is' : 'suppliers are'} approved at ${at}.`
  if (input.others.length === 0) return head
  return `${head} To send it to ${namesList(input.others)}${n === 0 ? '' : ' as well'}, ask Procurement to add them to this site.`
}

/** The chip beside each tick: "approved at Dayton". */
export function approvedAtWords(site: { name: string; city?: string | null }): string {
  return `approved at ${siteShortName(site)}`
}

/**
 * Where a job is, for any screen or notice. The site's name where the
 * job names one; the free text a job posted before sites carried; null
 * where neither says.
 */
export function placeOf(job: { location?: string | null; site?: { name: string } | null }): string | null {
  return job.site?.name ?? (job.location?.trim() || null)
}

/**
 * The first firm the hiring manager ticked that the site does not name,
 * or null where every tick is one of the site's. Where the site names
 * nobody, `allowed` is every approved supplier.
 */
export function firstOffSite(picked: readonly string[], allowed: readonly string[]): string | null {
  const ok = new Set(allowed)
  return picked.find((id) => !ok.has(id)) ?? null
}

export interface SiteChoice { id: string; name: string; city: string | null; state?: string | null; country?: string | null; isPrimary: boolean }

/**
 * The site a job form opens on: the one asked for where it is offered,
 * else the primary site, else the first offered (a seat that reads one
 * region, whose sites do not include the head office). Null where the
 * company has no site at all.
 */
export function pickSite<T extends SiteChoice>(offered: readonly T[], asked: string | null | undefined): T | null {
  return offered.find((s) => s.id === asked) ?? offered.find((s) => s.isPrimary) ?? offered[0] ?? null
}

/**
 * Where a raised job went, in one sentence, or null where nothing was
 * ticked. The firms it was sent to by name; or, where it waits on an
 * approval, that it goes to the ones ticked once approved (the ticks are
 * kept on the job). Never "sent" where nothing was.
 */
export function sentSays(input: {
  open: boolean
  sentTo: readonly string[]
  /** How many suppliers were ticked on the form. */
  ticked: number
  site: { name: string; city?: string | null } | null
}): string | null {
  if (input.ticked === 0) return null
  if (input.open && input.sentTo.length > 0) return `Sent to ${namesList(input.sentTo)}.`
  if (input.open) return 'It was not sent to any supplier yet; send it from its page.'
  const n = input.ticked
  const at = input.site ? ` at ${siteShortName(input.site)}` : ''
  return n === 1
    ? `Once it is approved, it goes to the one supplier you ticked${at}.`
    : `Once it is approved, it goes to the ${countWord(n).toLowerCase()} suppliers you ticked${at}.`
}

/** What the raise says back: the decision's own summary, then where the job went. */
export function raisedSays(input: {
  open: boolean
  summary: string
  sentTo: readonly string[]
  ticked: number
  site: { name: string; city?: string | null } | null
}): string {
  const head = `${input.open ? 'Job request open' : 'Job request raised'} — ${input.summary}`
  const went = sentSays(input)
  if (!went) return head
  return `${/[.!?]$/.test(head) ? head : `${head}.`} ${went}`
}
