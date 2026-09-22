/**
 * The sentences on the compliance page.
 *
 * Pure, and apart from the page, for the same reason every other
 * screen's words are: the founder cannot read a component, he reads a
 * test name. These are the three places this screen said something
 * untrue, and each is now a sentence somebody can check.
 */

import { sayType } from '@/lib/document-type'

/**
 * What a check is called, in the words the parties use.
 *
 * `formatRuleType` title-cases whatever it is handed, which is right for
 * a governance rule — TENURE_LIMIT is nobody's document and "Tenure
 * limit" is what a program manager calls it. It is wrong for a document
 * type: I9_EVERIFY came out as "I9 Everify", which is a government form
 * with its capitals knocked off and reads as a typo on a compliance
 * officer's own screen.
 *
 * The dictionary already holds the name — "I-9 and E-Verify", "W-9",
 * "Certificate of good standing" — so it is read rather than computed,
 * and a key nobody has defined falls back to the humanized key with a
 * capital on the front, which is the honest answer rather than an
 * invented label.
 */
export function sayCheckType(type: string): string {
  const said = sayType(type)
  return said.known ? said.label : upperFirst(said.label)
}

export function upperFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function lowerFirst(s: string): string {
  // Only the first character, and only where it is not already part of a
  // name a form is known by — "I-9" must not become "i-9".
  return s && /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

/**
 * One owed document, as one sentence.
 *
 * It was two fragments joined with a full stop between them, and the
 * second began lowercase because it is a clause the order wrote —
 * "Brightmoor Staffing's to produce. required by Nordway Retail's order
 * PO-2026-2JSBR". Every row on the walk read like that.
 */
export function owedSentence(o: {
  /** The person the document is about, where it is about one. */
  aboutName: string | null
  /** The party that owes it, named where the line names one. */
  owedByName: string | null
  /** The customer the line bills. */
  toName: string | null
  /** Where it came from, in the words whoever asked for it wrote. */
  asked: string
}): string {
  const whose = o.aboutName ?? o.owedByName
  const where = o.toName ? `, on the line billing ${o.toName}` : ''
  const asked = o.asked.trim().replace(/[.]$/, '')
  return whose
    ? `${whose}’s to produce — ${lowerFirst(asked)}${where}.`
    : `${upperFirst(asked)}${where}.`
}


/**
 * The two populations on this page, in one sentence, each saying what it
 * counted.
 *
 * A `Verification` is a check somebody ran — a background screening, a
 * certificate that was looked at. A `DocumentRequirement` is a document
 * a line asks for, whether or not anybody has ever run anything. They
 * are different sets and the page drew them as one wall of numbers, so
 * "clear rate 100%" sat above "5 documents are still owed, 2 stop work"
 * with nothing between them to say the first had not counted the
 * second.
 */
export function twoPopulations(
  owed: number,
  stopsWork: number,
  checks: number,
  clearPercentage: number | null
): string {
  const owes =
    owed === 0
      ? 'Nothing is outstanding on the lines this firm is paid on.'
      : `${owed} document${owed === 1 ? ' is' : 's are'} still owed on the lines this firm is paid on` +
        (stopsWork > 0 ? `, and ${stopsWork} of them stop${stopsWork === 1 ? 's' : ''} work.` : '.')

  const ran =
    checks === 0
      ? 'No check has been recorded on anybody here, so there is no clear rate to read.'
      : `Separately, ${checks} check${checks === 1 ? ' has' : 's have'} been recorded on people and firms` +
        (clearPercentage === null ? '.' : `, ${clearPercentage}% of them clear.`)

  const apart =
    owed > 0 && checks > 0
      ? ' The two count different things: what the lines require, and what has actually been checked.'
      : ''

  return `${owes} ${ran}${apart}`
}
