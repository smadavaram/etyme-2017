import { builtInType } from '@/lib/document-type'

/**
 * Which rows "what this firm owes" draws, and what each is keyed on.
 *
 * Found by the fifth screen walk (2026-11-04): six running Brightmoor →
 * Northbend placements each lacked a background check, and Compliance
 * said "One document is still owed" with one row naming nobody. The key
 * kept the person only where the worker owed the paper, and a background
 * check is owed by the firm (it orders it from a provider), so six
 * people's checks collapsed into one.
 *
 * The rule: a paper about the firm is one row per customer (one master
 * agreement covers six consultants at one client); a paper about a
 * person is one row per person, whoever owes it, and names them.
 */

/** Papers that describe the firm itself, not anybody it placed. */
function isAboutTheFirm(key: string): boolean {
  if (key === 'MSA') return true
  const t = builtInType(key)
  // Insurance, good standing, the W-9, the business partner form: the
  // supplier's own standing to trade. A type the firm defined itself, or
  // one nobody says who supplies, is read as about the person where the
  // line has one: an extra row is visible, a row folded into another is
  // a person nobody is told about.
  return t?.suppliedBy === 'SUPPLIER'
}

/** Whether this item, on a line for this person, is about that person. */
export function aboutThePerson(item: { key: string; owedBy: string }, personId: string | null): boolean {
  if (!personId) return false
  if (item.owedBy === 'WORKER') return true
  return !isAboutTheFirm(item.key)
}

/** The row an outstanding item belongs to; two items with one key are one row. */
export function owedRowKey(
  item: { key: string; owedBy: string },
  line: { clientCompanyId: string | null; personId: string | null }
): string {
  const person = aboutThePerson(item, line.personId) ? line.personId : ''
  return `${item.key}:${line.clientCompanyId ?? ''}:${person}`
}
