/**
 * The Network pages — contractors and suppliers — read one way: who is
 * here now, who was here lately, who we would take again, who we will
 * not, and where they are. The same five questions on both lists, so
 * the filter bar is learned once.
 */
export const NETWORK_FILTERS = ['ALL', 'ON_SITE', 'RECENT', 'FAVORITES', 'BLOCKED'] as const
export type NetworkFilter = (typeof NETWORK_FILTERS)[number]

export const FILTER_WORD: Record<NetworkFilter, string> = {
  ALL: 'Everyone',
  ON_SITE: 'On site now',
  RECENT: 'Recent engagement',
  FAVORITES: 'Favorites',
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
      case 'BLOCKED': return r.blocked
    }
  })
}

/** The places on the list, each once, for a select. */
export function locationsOf(rows: { location: string | null }[]): string[] {
  return [...new Set(rows.map((r) => r.location).filter((x): x is string => !!x))].sort()
}
