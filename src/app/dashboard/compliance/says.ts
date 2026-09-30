/**
 * The sentences on the compliance page.
 *
 * Pure, and apart from the page, for the same reason every other
 * screen's words are: the founder cannot read a component, he reads a
 * test name. These are the three places this screen said something
 * untrue, and each is now a sentence somebody can check.
 */

import { sayType } from '@/lib/document-type'
import { compact } from '@/lib/money-display'

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
  clearPercentage: number | null,
  also: {
    /** People about to start whom the paperwork is holding up. */
    heldStarts?: number
    /** Of those, how many cannot start at all (the rest start with a warning on the record). */
    blockedStarts?: number
    /** Checks a desk has to act on: failed, running out, or run out. */
    flagged?: number
    /** True where the reader is the client, who is paid on no line here. */
    client?: boolean
  } = {}
): string {
  const held = also.heldStarts ?? 0
  const blocked = also.blockedStarts ?? 0
  const flagged = also.flagged ?? 0

  // A client is paid on nothing, so "the lines this firm is paid on" is
  // a sentence about somebody else. Its outstanding work is the people
  // about to start on its sites.
  const starts =
    held === 0
      ? ''
      : blocked === held
        ? `${held} ${held === 1 ? 'person' : 'people'} cannot start until their paperwork is on file.`
        : blocked === 0
          ? `${held} ${held === 1 ? 'person is' : 'people are'} about to start with paperwork still owed.`
          : `${held} people are about to start with paperwork still owed, and ${blocked} of them cannot start until it is on file.`

  const owes = also.client
    ? held === 0 && owed === 0
      ? 'Nothing is holding up a start here.'
      : ''
    : owed === 0
      ? 'Nothing is outstanding on the lines this firm is paid on.'
      : `${owed} document${owed === 1 ? ' is' : 's are'} still owed on the lines this firm is paid on` +
        (stopsWork > 0 ? `, and ${stopsWork} of them stop${stopsWork === 1 ? 's' : ''} work.` : '.')

  const toChase =
    flagged === 0 ? '' : ` ${flagged} need${flagged === 1 ? 's' : ''} somebody to act: failed, running out, or run out.`
  const ran =
    checks === 0
      ? 'No check has been recorded on anybody here, so there is no clear rate to read.'
      : `Separately, ${checks} check${checks === 1 ? ' has' : 's have'} been recorded on people and firms` +
        (clearPercentage === null ? '.' : `, ${clearPercentage}% of them clear today.`) +
        toChase

  const apart =
    (owed > 0 || held > 0) && checks > 0
      ? ' The two count different things: what the lines require, and what has actually been checked.'
      : ''

  return [starts, owes, ran].filter(Boolean).join(' ') + apart
}

// ── The rules, in the words a program manager uses ────────────────────

/**
 * What a governance rule is called on a screen.
 *
 * The page title-cased the machine name, so a program manager read
 * "Tenure Cap" and "Break In Service". The founder decided the plain
 * words on 2026-09-28: *time limit*, not tenure cap. A rule type nobody
 * named here falls back to the title-cased key rather than a guess.
 */
const RULE_WORDS: Record<string, string> = {
  TENURE_CAP: 'Time limit',
  BREAK_IN_SERVICE: 'Break before coming back',
  RATE_BAND: 'Rate range',
  HEADCOUNT_PLAN: 'Headcount plan',
  VENDOR_TIER: 'Supplier standing',
  WORK_AUTHORIZATION: 'Right to work',
  INSURANCE_REQUIRED: 'Supplier insurance',
  SEGREGATION_OF_DUTIES: 'Nobody approves their own',
  WORKER_CLASSIFICATION: 'How people are engaged',
}

export function sayRule(ruleType: string): string {
  return RULE_WORDS[ruleType] ?? upperFirst(ruleType.replace(/_/g, ' ').toLowerCase())
}

/** Blocks or warns, as a person says it — never the enum. */
export function sayEnforcement(mode: string): string {
  return mode === 'BLOCK' ? 'Blocks' : mode === 'WARN' ? 'Warns and records a reason' : upperFirst(mode.toLowerCase())
}

/** "$70" from 7000 minor units — the one formatter, never a hand-rolled dollar sign. */
function dollars(minor: number): string {
  return compact(minor)
}

/**
 * A rule's settings, in a sentence.
 *
 * The page printed the stored JSON: "max Rate: 15000 · min Rate: 7000",
 * which is $150 and $70 an hour written as cents with the keys' camel
 * case split. Rates are stored in minor units — `lib/governance` divides
 * by a hundred before it compares — so they are formatted here the same
 * way, and every known setting reads as the sentence a desk would say.
 *
 * A setting nobody named here is still shown, as its key and value, so
 * nothing a client configured is hidden from them. A number that could be
 * money and is not known to be is never formatted as money.
 */
export function sayRuleParameters(ruleType: string, params: unknown): string {
  if (!params || typeof params !== 'object') return ''
  const p = params as Record<string, unknown>
  const said: string[] = []
  const used = new Set<string>()
  const num = (k: string): number | null => {
    const v = p[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  const maxMonths = num('maxMonths')
  if (maxMonths !== null) {
    said.push(`${maxMonths} month${maxMonths === 1 ? '' : 's'} at most, across every supplier`)
    used.add('maxMonths')
  }
  const breakDays = num('breakDays') ?? num('minDays')
  if (breakDays !== null) {
    said.push(`${breakDays} day${breakDays === 1 ? '' : 's'} away before coming back`)
    used.add('breakDays'); used.add('minDays')
  }
  const minRate = num('minRate')
  const maxRate = num('maxRate')
  if (minRate !== null && maxRate !== null) {
    said.push(`${dollars(minRate)} to ${dollars(maxRate)} an hour`)
  } else if (minRate !== null) {
    said.push(`at least ${dollars(minRate)} an hour`)
  } else if (maxRate !== null) {
    said.push(`at most ${dollars(maxRate)} an hour`)
  }
  used.add('minRate'); used.add('maxRate')

  for (const [k, v] of Object.entries(p)) {
    if (used.has(k)) continue
    const label = k.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
    // A machine value — APPROVED, W2_ONLY — reads as words; anything else as written.
    const word = (x: unknown) =>
      typeof x === 'string' && /^[A-Z0-9_]+$/.test(x) ? x.replace(/_/g, ' ').toLowerCase() : String(x)
    const value = Array.isArray(v) ? v.map(word).join(', ') : word(v)
    said.push(`${label}: ${value}`)
  }
  void ruleType
  return upperFirst(said.join(' · '))
}

/**
 * The line under the heading, naming whose program this is.
 *
 * It was one template with the company name spliced in and "…" standing
 * for it until the page had loaded — so a reader the route refused, for
 * whom it never loads, read "verification status at …. Every cleared"
 * for as long as they looked. Without a name the sentence is said
 * without one, rather than with a gap where one should be.
 */
export function complianceSubtitle(companyName: string | null | undefined): string {
  const name = companyName?.trim()
  const at = name ? ` at ${name}` : ''
  return (
    `Governance policies, enforcement evaluations, and verification status${at}. ` +
    'Every cleared job request records the basis on which it cleared.'
  )
}

/**
 * Which of three screens the compliance page is, before it draws any of
 * them.
 *
 * A refusal drew the whole page anyway — six figures reading 0 and every
 * tab empty, with the refusal sentence tucked into the first tab. A zero
 * says "nothing on file"; the truth was "not yours to see", and a
 * compliance officer's colleague reading the first would believe it. So
 * a page that could not read its data shows a heading and the sentence
 * the route gave, and no number at all.
 */
export type ComplianceView =
  | { show: 'loading' }
  | { show: 'refused'; says: string }
  | { show: 'page' }

export function complianceView(s: { loading: boolean; error: string | null; hasData: boolean }): ComplianceView {
  if (s.error) return { show: 'refused', says: s.error }
  if (!s.hasData) return { show: 'loading' }
  return { show: 'page' }
}
