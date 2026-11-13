/**
 * Two verbs for two different doors, each pointing at the other (the
 * founder's first-day list, fault 22, 2026-11-13). "Import" meant
 * contractors and suppliers under Settings and teams and leads on Team
 * structure, and neither screen said so. No database and no browser here,
 * so every sentence is a test.
 */
import { IMPORT_RECORDS_LABEL } from '@/lib/nav-table'
import { IMPORTABLE } from '@/lib/importable'

export { IMPORT_RECORDS_LABEL }

/** The records import's address (Settings → Import records). Never moves. */
export const IMPORT_RECORDS_HREF = '/dashboard/data'
/** Team structure's address. Never moves. */
export const TEAM_STRUCTURE_HREF = '/dashboard/settings/team-structure'

/** Team structure's button, and the directory dialog's heading. */
export const READ_TEAMS_LABEL = 'Read teams from your directory'

/** Each kind of sheet the records import loads, as a person says it, in the order it is listed. */
const KIND_WORD: Record<string, string> = {
  CONSULTANTS: 'candidates',
  LOCATIONS: 'sites',
  PURCHASE_ORDERS: 'purchase orders',
  COST_CENTERS: 'cost centers',
  HOLIDAYS: 'holidays',
}
const ORDER = Object.keys(KIND_WORD)

/**
 * What Import records really loads, read off the kinds list
 * (lib/importable), never promised beyond it: "candidates, sites,
 * purchase orders, cost centers and holidays". A kind added to the list
 * and not named here is said by its own label.
 */
export function importRecordsLoads(kinds: readonly { key: string; label: string }[] = IMPORTABLE): string {
  const words = [...kinds]
    .sort((a, b) => (ORDER.indexOf(a.key) + 1 || 99) - (ORDER.indexOf(b.key) + 1 || 99))
    .map((k) => KIND_WORD[k.key] ?? k.label.toLowerCase())
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

const capital = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)

/** Import records' subtitle, worded from the kinds it loads. */
export function importRecordsSubtitle(kinds?: readonly { key: string; label: string }[]): string {
  return `${capital(importRecordsLoads(kinds))}, from a sheet. Matched on a key, so loading the same file twice changes nothing the second time.`
}

/** The line on Team structure that points at the other door; the link that ends it reads Import records. */
export const READ_TEAMS_SAYS = `This reads teams, leads and staff. ${capital(importRecordsLoads())} come in under`

/** The line on Import records that points back. */
export const IMPORT_RECORDS_SAYS = 'This does not bring in your teams or who leads them.'
export const IMPORT_RECORDS_POINTS = 'Read those from your directory.'

/** The fold for a directory source nobody at the company can turn on today. */
export const NOT_AVAILABLE_YET = 'Not available yet'
export const WAITING_ON_ETYME = 'Waiting on Etyme to switch this on. Use a file exported from your directory until then.'

type SourceLike = { key: string; connected: boolean; connectable?: boolean }

/**
 * The sources a company can use or turn on now, and the ones waiting on
 * Etyme. A source is waiting where it is neither connected nor connectable
 * from the screen: the switch is Etyme's, not the company's.
 */
export function splitSources<T extends SourceLike>(sources: readonly T[]): { open: T[]; waiting: T[] } {
  const waiting = sources.filter((s) => !s.connected && !s.connectable)
  const open = sources.filter((s) => s.connected || s.connectable)
  // What works today first: the connected sources (the file among them), then what the admin can connect.
  open.sort((a, b) => Number(b.connected) - Number(a.connected))
  return { open, waiting }
}

/** The one line under a source's name that says whose move it is; never a bare status. */
export function tileStatus(s: SourceLike): string | null {
  if (s.connected) return null
  if (s.connectable) return 'Your admin connects it here, once.'
  return WAITING_ON_ETYME
}

/**
 * The line on Integrations that says where the Teams link is pasted: the
 * Company tab of Settings ("Where your people already are"). Settings
 * opens for the Owner and an Admin only, so a seat that reads Integrations
 * and not Settings is told who pastes it.
 */
export const TEAMS_LINK_HREF = '/dashboard/settings?tab=company'
export const TEAMS_LINK_SAYS = 'To post notices to a Microsoft Teams channel, paste the channel’s Workflows link'
export const TEAMS_LINK_WHERE = 'under Settings, on the Company tab.'
export const TEAMS_LINK_ASK = 'under Settings, which your Owner or an Admin opens.'
