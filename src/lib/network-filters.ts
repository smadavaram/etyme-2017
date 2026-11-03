/**
 * The Network pages — contractors and suppliers — read one way: who is
 * here now, who was here lately, who we would take again, who we will
 * not, and where they are. The same five questions on both lists, so
 * the filter bar is learned once.
 */
export const NETWORK_FILTERS = ['ALL', 'ON_SITE', 'RECENT', 'FAVORITES', 'PENDING', 'BLOCKED'] as const
export type NetworkFilter = (typeof NETWORK_FILTERS)[number]

export const FILTER_WORD: Record<NetworkFilter, string> = {
  ALL: 'Everyone',
  ON_SITE: 'On site now',
  RECENT: 'Recent engagement',
  FAVORITES: 'Favorites',
  PENDING: 'Pending',
  BLOCKED: 'Blocked',
}

/** "Lately" is ninety days: a quarter, the unit a program is reviewed in. */
export const RECENT_DAYS = 90

export interface NetworkRow {
  onSite: boolean
  /** The most recent day anything happened between us: a start, an end, a submission. */
  lastEngagement: string | null
  favorite: boolean
  blocked: boolean
  location: string | null
  /** Still in the pipeline — recommended, not yet a supplier. Only firms have this. */
  pending?: unknown
}

export function isRecent(lastEngagement: string | null, now: Date, days = RECENT_DAYS): boolean {
  if (!lastEngagement) return false
  const t = new Date(lastEngagement).getTime()
  return !Number.isNaN(t) && now.getTime() - t <= days * 86_400_000
}

/**
 * Blocked people stay on the register — a block is a fact about them,
 * not a reason to forget them — but they are out of every list except
 * their own. Somebody looking for a person to take again should not
 * scroll past the one they barred.
 */
export function applyFilter<T extends NetworkRow>(
  rows: T[],
  filter: NetworkFilter,
  location: string | null,
  now: Date
): T[] {
  return rows.filter((r) => {
    if (location && r.location !== location) return false
    switch (filter) {
      case 'ALL': return !r.blocked
      case 'ON_SITE': return r.onSite && !r.blocked
      case 'RECENT': return isRecent(r.lastEngagement, now) && !r.blocked
      case 'FAVORITES': return r.favorite && !r.blocked
      case 'PENDING': return !!r.pending
      case 'BLOCKED': return r.blocked
    }
  })
}

/** The places on the list, each once, for a select. */
export function locationsOf(rows: { location: string | null }[]): string[] {
  return [...new Set(rows.map((r) => r.location).filter((x): x is string => !!x))].sort()
}

/**
 * The order a client reads its Candidates in, and the filter the page
 * opens on (founder, 2026-11-03: a client's Candidates is its memory of
 * people). A client comes back to this page to find somebody it would
 * take again, so the stars lead, then who it worked with lately, then
 * everybody; who is on site now is the Contracts page's question and
 * comes after. A firm reading the same page keeps the order it had.
 */
export const CLIENT_CANDIDATE_ORDER: readonly NetworkFilter[] = ['FAVORITES', 'RECENT', 'ALL', 'ON_SITE', 'PENDING', 'BLOCKED']

/** Who is reading the list: a client (or a seat in a client's program), or a firm. */
export type ListReader = 'CLIENT' | 'FIRM'

export function filterOrderFor(reader: ListReader): readonly NetworkFilter[] {
  return reader === 'CLIENT' ? CLIENT_CANDIDATE_ORDER : NETWORK_FILTERS
}

/**
 * The first filter in the reader's order that has rows behind it, so the
 * page never opens on an empty list where anybody is on it. Blocked is
 * never opened on by itself: a page that greets a hiring manager with the
 * people she barred is answering a question she did not ask. Where
 * nothing has rows, Everyone, whose empty state says what to do first.
 */
export function openingFilter(
  order: readonly NetworkFilter[],
  counts: Partial<Record<NetworkFilter, number>>,
): NetworkFilter {
  for (const f of order) {
    if (f === 'BLOCKED') continue
    if ((counts[f] ?? 0) > 0) return f
  }
  return 'ALL'
}
