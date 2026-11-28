/**
 * The party's one ledger, as data (record 134). Pure: no database, so a
 * screen may import it and a test may read it.
 *
 * The ledger is a reader over the record, never a table. Every line names
 * the record it came from and a link to it. A line that belongs to a plugin
 * links out to the plugin's site, from the registry; the core never draws a
 * plugin's workflow.
 */
import type { PluginKey } from '@/lib/plugin-registry'
import { pluginHref } from '@/lib/plugin-registry'

export type LedgerSection = 'activity' | 'money' | 'documents'

export interface LedgerLine {
  section: LedgerSection
  /** A word a person says: job, application, timesheet, bill, invoice receipt, rate, contract, paper, certificate. */
  kind: string
  says: string
  when: Date | null
  /** The record this line is read from. */
  source: { type: string; id: string }
  /** Where the record opens: the record view, its list page, or a plugin's door. */
  href: string
  /** Set on a line a plugin wrote; its href is the plugin's own site. */
  plugin: PluginKey | null
}

/**
 * Basic outreach on the ledger (record 135): who the firm may write to from
 * this party's page, and a candidate's standing yes with the firm's last letters.
 */
export interface LetterPanel {
  /** Contacts the firm may write to at this company; null where this is not a company the firm may write to. */
  writeTo: { id: string; name: string; canWrite: boolean; says: string | null }[] | null
  /** Why there is nobody to write to, in a sentence, where writeTo is null or empty. */
  writeToSays: string | null
  /** A candidate's standing yes with the firm's last letters; null where the party is not a candidate this firm keeps. */
  candidate: { standing: 'YES' | 'NOT_YET' | 'TOOK_BACK'; says: string; last: { subject: string; says: string; when: string }[] } | null
}

export interface PartyLedger {
  subject: { kind: 'person' | 'company'; id: string; name: string }
  activity: LedgerLine[]
  money: LedgerLine[]
  documents: LedgerLine[]
  /** Plain sentences about what this reader does not see, and why. */
  notes: string[]
  /** The letters panel; null where the reader has none (a client, a seat that does not write letters, her own page). */
  letters: LetterPanel | null
}

export type LedgerAnswer =
  | { ok: true; ledger: PartyLedger }
  | { ok: false; status: 403 | 404; says: string }

/** Record types the record view opens, so a line links to the view and not to a list. */
const RECORD_VIEW_TYPES = ['Company', 'SellContract', 'Person', 'VendorBill', 'Invoice', 'Requirement'] as const

/** The link for a record: its view where it has one, else the list page that owns it. Pure. */
export function recordHref(type: string, id: string, listPage: string): string {
  return (RECORD_VIEW_TYPES as readonly string[]).includes(type) ? `/dashboard/records/${type}/${id}` : listPage
}

/** A plugin line: it points at the plugin's own site, from the registry, and carries no workflow. */
export function pluginLine(key: PluginKey, line: Omit<LedgerLine, 'plugin' | 'href'>, tail = ''): LedgerLine {
  return { ...line, plugin: key, href: pluginHref(key, tail) }
}

/**
 * Whether a reader may be shown margin or commission on a line. Margin is
 * the seller's own, read by a seat that holds the margin permission. A
 * client never reads a supplier's margin, whatever it holds. Pure.
 */
export function mayShowMargin(o: { readerCompanyId: string; lineSellerId: string; readsMargin: boolean }): boolean {
  return o.readsMargin && o.readerCompanyId === o.lineSellerId
}

export const BEFORE_HER_YES_SAYS = 'She has not said yes to your firm yet, so you read only what your firm typed about her.'
export const NOT_ON_YOUR_BOOK_SAYS = 'That is not on your book, so its ledger is not yours to read.'

/** Newest first, with an undated line last. Pure. */
export function newestFirst(a: LedgerLine, b: LedgerLine): number {
  return (b.when?.getTime() ?? -Infinity) - (a.when?.getTime() ?? -Infinity)
}
