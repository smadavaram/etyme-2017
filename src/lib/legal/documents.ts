/**
 * The Privacy Notice, the Terms of Service and the Data Processing
 * Addendum, as the page draws them.
 *
 * The founder read the three drafts and said "Publish" (2026-10-15). The
 * words are in `privacy-text`, `terms-text` and `dpa-text`, exactly as
 * approved; this module reads them into sections and blocks once, and
 * says the few things about them the page and the tests need: which
 * page each lives on, the addresses older links used, and which row of
 * the notice is which category on the retention schedule.
 *
 * `src/lib/legal.ts` beside this folder still holds the machine data
 * other modules read — the categories of data (`HELD`), the two kinds
 * of people (`POPULATIONS`) and the census agreement. It holds no
 * public page's words any more.
 *
 * Owned by etyme-regulatory (`lib/legal` in `lib/domains.ts`).
 */

import { parseLegal, plain, type Block, type Line, type ParsedLegalDocument } from './parse'
import { PRIVACY_SOURCE } from './privacy-text'
import { TERMS_SOURCE } from './terms-text'
import { DPA_SOURCE } from './dpa-text'

export type LegalKey = 'privacy' | 'terms' | 'dpa'

export interface LegalPage extends ParsedLegalDocument {
  key: LegalKey
  /** Where it is published. */
  href: string
  /** Its name in the row of links between the three. */
  short: string
  /** The approved text it was read from. */
  source: string
}

function page(key: LegalKey, href: string, short: string, source: string): LegalPage {
  return { key, href, short, source, ...parseLegal(source) }
}

export const PRIVACY_NOTICE = page('privacy', '/privacy', 'Privacy', PRIVACY_SOURCE)
export const TERMS_OF_SERVICE = page('terms', '/terms', 'Terms', TERMS_SOURCE)
export const DATA_PROCESSING_ADDENDUM = page('dpa', '/dpa', 'DPA', DPA_SOURCE)

/** The three, in the order the row of links between them reads. */
export const LEGAL_PAGES: LegalPage[] = [PRIVACY_NOTICE, TERMS_OF_SERVICE, DATA_PROCESSING_ADDENDUM]

export function legalPage(key: LegalKey): LegalPage {
  return LEGAL_PAGES.find((p) => p.key === key)!
}

// ── Addresses older links used ────────────────────────────────────────

/**
 * Every section address the pages carried before 2026-10-15, and the
 * section of the published text that now says the same thing.
 *
 * The page draws each one as a second anchor at the top of its section,
 * so a link already sent — in an email, a security questionnaire, a
 * bookmark — still lands on the right paragraph rather than the top of
 * the page. Nothing in this repository links to them any more.
 */
export const OLD_ANCHORS: Record<LegalKey, Record<string, string>> = {
  privacy: {
    'two-populations-two-relationships': '2-two-kinds-of-people-and-our-role-for-each',
    'what-we-hold-about-you': '3-information-we-collect',
    'bank-details': '3-information-we-collect',
    'time-on-site-added-up-across-suppliers': '4-how-we-use-information',
    'a-consultant-s-permission-is-per-supplier-and-theirs-to-move': '4-how-we-use-information',
    'where-a-model-sees-personal-data': '6-who-receives-information',
    'who-else-touches-the-data': '6-who-receives-information',
    'what-we-do-not-use-despite-appearances': '7-what-we-do-not-do',
    'cookies-and-tracking': '8-cookies-and-browser-storage',
    'who-can-see-it': '9-who-can-see-information-and-how-access-is-logged',
    'reads-are-logged-refusals-included': '9-who-can-see-information-and-how-access-is-logged',
    'how-long-we-keep-it': '10-how-long-we-keep-information',
    'your-rights-and-how-they-are-honored-today': '11-your-rights-and-how-to-use-them',
    'security': '12-security',
    'where-the-data-sits': '13-where-information-is-stored',
  },
  terms: {
    'accounts-and-seats': '3-accounts-and-company-access',
    'what-etyme-is': '4-what-etyme-is-and-is-not',
    'what-a-customer-may-and-may-not-do-with-the-platform': '5-customer-responsibilities',
    'what-the-software-does-on-its-own': '8-automated-features',
    'where-a-model-is-used': '8-automated-features',
    'fees': '9-fees',
    'availability-support-and-change': '12-availability-and-support',
    'liability-indemnity-governing-law-and-termination': '15-limitation-of-liability',
  },
  dpa: {
    'the-unsettled-question-stated-before-anything-else': '1-parties-and-roles',
    'subject-matter-duration-nature-and-purpose': '2-subject-matter-duration-nature-and-purpose',
    'categories-of-data-subject': '3-categories-of-data-subjects-and-personal-data',
    'categories-of-personal-data': '3-categories-of-data-subjects-and-personal-data',
    'data-that-may-be-special-category': '3-categories-of-data-subjects-and-personal-data',
    'assisting-the-customer-with-data-subject-requests': '4-5-help-with-data-subject-requests',
    'breach-notification': '4-6-personal-data-breaches',
    'return-and-deletion-at-the-end': '4-7-deletion-or-return-at-the-end',
    'audit': '4-8-audits',
    'international-transfers': '5-international-transfers',
    'sub-processors': 'annex-a-sub-processors',
    'technical-and-organizational-measures-that-exist': 'annex-b-security-measures',
  },
}

/** The old addresses that land on one section or part, for the page to draw. */
export function oldAnchorsFor(key: LegalKey, id: string): string[] {
  return Object.entries(OLD_ANCHORS[key])
    .filter(([, to]) => to === id)
    .map(([from]) => from)
}

/** Every address on a page: its sections, and the parts inside them. */
export function anchorsOn(key: LegalKey): string[] {
  return legalPage(key).sections.flatMap((s) => [
    s.id,
    ...s.blocks.flatMap((b) => (b.kind === 'subheading' ? [b.id] : [])),
  ])
}

// ── Reading the documents back, for the page and the tests ────────────

/** Every block in a document, intro first. */
export function blocksIn(doc: LegalPage): Block[] {
  return [...doc.intro, ...doc.sections.flatMap((s) => s.blocks)]
}

/** Every line of text in a document, in order. */
export function linesIn(doc: LegalPage): Line[] {
  const of = (b: Block): Line[] => {
    switch (b.kind) {
      case 'paragraph':
        return b.lines
      case 'list':
        return b.items
      case 'table':
        return [...b.head, ...b.rows.flat()]
      case 'subheading':
        return [[{ text: b.text }]]
      case 'rule':
        return []
    }
  }
  return [
    doc.notice,
    [{ text: doc.title }],
    ...doc.dates.map((d) => [{ text: `${d.label}: ` }, ...d.value]),
    ...doc.intro.flatMap(of),
    ...doc.sections.flatMap((s) => [[{ text: s.heading }], ...s.blocks.flatMap(of)]),
  ]
}

/** A document's words, marks removed — for a test to search. */
export function wordsOf(doc: LegalPage): string {
  return linesIn(doc).map(plain).join('\n')
}

/** Every point counsel has not decided, as written: "[To be confirmed …]". */
export function counselPointsIn(doc: LegalPage): string[] {
  return linesIn(doc).flatMap((l) => l.filter((r) => r.counsel).map((r) => r.text))
}

/** A section by its number or its opening words: `sectionOf(PRIVACY_NOTICE, '10.')`. */
export function sectionOf(doc: LegalPage, startsWith: string) {
  const s = doc.sections.find((x) => x.heading.startsWith(startsWith))
  if (!s) throw new Error(`${doc.title} has no section starting "${startsWith}"`)
  return s
}

/** The first table in a section, as rows of plain cells keyed by its headings. */
export function tableIn(doc: LegalPage, startsWith: string): Record<string, string>[] {
  const t = sectionOf(doc, startsWith).blocks.find((b) => b.kind === 'table')
  if (!t || t.kind !== 'table') throw new Error(`${doc.title} §${startsWith} has no table`)
  const head = t.head.map(plain)
  return t.rows.map((r) => Object.fromEntries(r.map((c, i) => [head[i], plain(c)])))
}

// ── Which row is which category on the retention schedule ─────────────

/**
 * The privacy notice names each category in a reader's words; the
 * retention schedule (`lib/retention`) and the data page name them the
 * way `HELD` in `lib/legal` does. This is the one place the two are
 * joined, so the test can hold that the notice states the period and
 * the fate the nightly sweep actually uses for every category.
 *
 * "Public website visits" is in the notice's list of what is collected
 * and has no line here on purpose: the count holds no name, no address
 * and no cookie, so there is nothing about a person to keep or erase.
 */
export const NOTICE_CATEGORY: Record<string, string> = {
  'Identity and sign-in': 'Identity and sign-in',
  'Worker profile': 'A consultant’s own profile',
  Resumes: 'Resumes',
  'Work authorization and immigration': 'Work authorization and immigration',
  'Checks run by others': 'Checks somebody else ran',
  'Onboarding documents': 'Onboarding paperwork',
  'Employment status positions': 'Positions taken about how somebody is engaged',
  'Pay and billing': 'Money about a person',
  'Time on site': 'Time on site',
  'Business User activity': 'A seat at a company, and what was decided from it',
  'Bars and favorites': 'Bars and preferences',
  'Contractor spend review': 'A contractor census',
  'Company and supplier information': 'Company and supplier records',
  'Payment details': 'Payment details',
  Messages: 'Messages',
  Logs: 'Logs',
}

/** Collected and described, and about nobody in particular. */
export const NOT_ABOUT_A_PERSON = ['Public website visits'] as const
