/**
 * A paper a person puts on her own file before anybody asks for it.
 *
 * ── What the walk found, 2026-10-27 ──────────────────────────────────
 *
 * A one-person firm opened Paperwork and was offered "Ask somebody for a
 * document… Theresa Quaye · on your payroll" — herself. The library was
 * empty, and nowhere could she put her own W-9, her certificate of
 * insurance or her nursing license on file. A candidate who signed up on
 * her own read "no document is asked of you" and had no way to keep the
 * license she holds or her degree ahead of the first firm asking.
 *
 * Every paper door in the product was an answer to an ask. That is right
 * for the papers the two-stage rule protects, and wrong for the papers a
 * person simply holds about her own work.
 *
 * ── What she may file, and what she may never file ───────────────────
 *
 * The same two stages as `lib/document-stages`, read the same way:
 *
 *   **Hers to keep, at any time.** What is about her work rather than
 *   about who she is: a license to practice (published on the board's
 *   own register), a degree, a credential evaluation. Each sits at the
 *   application stage in the rule table.
 *
 *   **Never ahead of an offer, even offered freely.** An I-9 and the
 *   identity papers it is completed from (passport, green card, visa,
 *   work permit, I-94, driver's license) are asked after an offer, by
 *   the firm that employs her. A paper volunteered early is still a paper
 *   held early, and a file that holds a passport before any offer is the
 *   file the two-stage rule exists to stop. When a firm offers her work
 *   it asks, and she sends it then.
 *
 *   **Never hers to send at all.** A background check or a drug screen
 *   is a screening company's report to the firm that ordered it
 *   (`orderedNotCollected` in `lib/attestation`).
 *
 * A one-person firm is the firm as well, so she also files the firm's
 * own papers: its W-9, its certificates of insurance, its certificate of
 * good standing, its registration. Those are what a client asks of a
 * corp-to-corp supplier (`defaultItemsFor('CORP_TO_CORP')`).
 *
 * ── On file, and not examined ────────────────────────────────────────
 *
 * Attest, never declare. A paper she filed herself is a fact about what
 * she sent and what is printed on it. Nobody has examined it, so it
 * clears no start and no supplier gate: the firm that asks examines it
 * and records what it saw. The row this returns says so in its status.
 *
 * Pure: no database, the clock handed in. The route writes the row.
 */

import { builtInType, typeByKey, type DefinedType, type DocumentTypeSpec } from '@/lib/document-type'
import { orderedNotCollected } from '@/lib/attestation'
import { stageFor, STANDS_ON_RULE, type Jurisdiction } from '@/lib/document-stages'
import { plainDate } from '@/lib/plain-date'

/** Whose paper it is: hers, or her one-person firm's. */
export type OwnPaperAbout = 'ME' | 'MY_FIRM'

/** The firm's own papers a one-person firm keeps, in the order a client asks for them. */
export const FIRM_PAPERS = ['W9', 'INSURANCE_GL', 'INSURANCE_WC', 'GOOD_STANDING', 'BUSINESS_PARTNER', 'INSURANCE_EO'] as const

/** What a person keeps about her own work, ahead of any ask. */
export const PERSON_PAPERS = ['PROFESSIONAL_LICENSE', 'CERTIFICATION', 'DEGREE', 'EDUCATION_EVALUATION'] as const

/** Kept on a profile rather than as a paper on file. */
const NOT_A_PAPER = ['RESUME', 'REFERENCE_CHECK']

export interface OwnPaperNeeds {
  key: string
  label: string
  hint: string | null
  about: OwnPaperAbout
  /** The fields a screen draws, each required where true. */
  file: boolean
  number: boolean
  issuer: boolean
  validFrom: boolean
  validUntil: boolean
  edition: boolean
  /** The year it was awarded: a degree says when, and never runs out. */
  year: boolean
}

/**
 * What each paper is for, said to her as the firm.
 *
 * The dictionary's hints are written in a client's voice ("This is how we
 * set you up to be paid", "Naming us as certificate holder"), because a
 * client asks for them. On her own page she is the firm, and the second
 * onboarding walk (2026-10-27) read those lines as a client talking to
 * her. So her page says what the paper does for her.
 */
export const OWN_PAPER_SAYS: Record<string, string> = {
  W9: 'Your W-9, so a client can pay you. Signed, on the current edition.',
  INSURANCE_GL: 'Your general liability certificate, naming the client as certificate holder. Your broker issues it.',
  INSURANCE_WC: 'Your workers’ compensation certificate, for work on a client’s site. Your broker issues it.',
  GOOD_STANDING: 'Your certificate of good standing, from the state your firm is registered in, dated inside the last year.',
  BUSINESS_PARTNER: 'Your firm’s registration: the incorporation certificate, or its DUNS number.',
  INSURANCE_EO: 'Your errors and omissions certificate, where you advise a client rather than deliver work.',
  PROFESSIONAL_LICENSE: 'Your license to do this work, with its number and the day it runs out.',
  CERTIFICATION: 'A certification you hold, who issued it, and the day it runs out.',
  DEGREE: 'Your degree certificate and transcripts, with the school and the year.',
  EDUCATION_EVALUATION: 'Your credential evaluation (WES or ECE), for a degree earned outside the US.',
}

function needsOf(t: DocumentTypeSpec, about: OwnPaperAbout): OwnPaperNeeds {
  const license = t.key === 'PROFESSIONAL_LICENSE' || (t.purpose === 'COMPLIANCE' && t.blocks && t.suppliedBy === 'CANDIDATE')
  return {
    key: t.key,
    label: t.label,
    hint: OWN_PAPER_SAYS[t.key] ?? t.hint ?? null,
    about,
    file: true,
    number: license,
    // A certification is named by who issued it, the way a license is, and
    // a degree by the school that awarded it.
    issuer: license || t.key === 'CERTIFICATION' || t.key === 'DEGREE',
    validFrom: t.validityShape === 'START_AND_END',
    validUntil: t.validityShape === 'END_ONLY' || t.validityShape === 'START_AND_END',
    edition: t.reissued === true,
    year: t.key === 'DEGREE',
  }
}

/** Why a person may not file this type herself, or null where she may. */
export function whyNotOwn(key: string, about: OwnPaperAbout, jurisdiction: Jurisdiction = 'DEFAULT', defined: DefinedType[] = []): string | null {
  const t = typeByKey(key, defined)
  if (!t) return 'That is not a paper anybody here asks for. Pick one from the list.'
  const label = t.label.charAt(0).toUpperCase() + t.label.slice(1)

  if (orderedNotCollected(key)) {
    return (
      `${label} is not a paper you hold. The firm that places you orders it from a screening company, ` +
      `and the report goes to that firm. You give your consent when they ask.`
    )
  }

  if (about === 'MY_FIRM') {
    if ((FIRM_PAPERS as readonly string[]).includes(key)) return null
    return `${label} is not one of your firm’s own papers. Your firm keeps its W-9, its insurance, its good standing and its registration here.`
  }

  const ruleKey = STANDS_ON_RULE[key] ?? key
  if (stageFor(ruleKey, jurisdiction).stage === 'ENGAGEMENT' || t.suppliedBy === 'EMPLOYEE' || t.suppliedBy === 'GOVERNMENT') {
    return (
      `${label} is asked for after an offer, by the firm that offers you the work. ` +
      `Nobody keeps it on your file before then. When a firm offers you work, it asks, and you send it then.`
    )
  }
  if (NOT_A_PAPER.includes(key)) {
    return key === 'RESUME'
      ? 'Your resume lives on your page, not with your papers.'
      : 'References are given to the firm that asks for them, not kept as a paper.'
  }
  if (t.purpose === 'AGREEMENT') {
    return `${label} is signed with a firm you work with, so it comes to you from that firm.`
  }
  if (t.suppliedBy !== 'CANDIDATE') {
    return `${label} is not yours to put on file. It comes from ${t.suppliedBy === 'SUPPLIER' ? 'a firm' : 'somebody else'}.`
  }
  return null
}

/**
 * What a person may put on file herself, with what each needs.
 *
 * `firm` is true where she is a one-person firm, so the firm's own papers
 * come first, in the order a client asks for them.
 */
export function ownPaperMenu(input: { firm: boolean; defined?: DefinedType[] }): OwnPaperNeeds[] {
  const out: OwnPaperNeeds[] = []
  if (input.firm) {
    for (const k of FIRM_PAPERS) {
      const t = builtInType(k)
      if (t) out.push(needsOf(t, 'MY_FIRM'))
    }
  }
  for (const k of PERSON_PAPERS) {
    const t = builtInType(k)
    if (t) out.push(needsOf(t, 'ME'))
  }
  // A company's own type a person holds about her work: a site's own
  // certification, a trade card. Offered where the rule table lets it.
  for (const d of input.defined ?? []) {
    const t = typeByKey(d.key, input.defined)
    if (!t || builtInType(d.key)) continue
    if (whyNotOwn(d.key, 'ME', 'DEFAULT', input.defined) === null) out.push(needsOf(t, 'ME'))
  }
  return out
}

export interface OwnPaperInput {
  key: string
  about: OwnPaperAbout
  /** True where she is a one-person firm: she is the firm, so she files its papers. */
  isOnePersonFirm: boolean
  /**
   * True where the seat files its firm's own papers at a firm with a team
   * (the Owner, an Admin, HR or the Compliance Officer; `mayFileFirmPapers`
   * in `./firm-papers`). The Tapin walk, 2026-10-29.
   */
  filesForFirm?: boolean
  /** True where the record has somewhere to keep the copy for this caller. */
  canKeepCopy: boolean
  fileName?: string | null
  number?: string | null
  issuer?: string | null
  validFrom?: string | null
  validUntil?: string | null
  edition?: string | null
  /** The year a degree was awarded, as four digits. */
  year?: string | null
  jurisdiction?: Jurisdiction
  defined?: DefinedType[]
}

/** The row to write: a paper on file, not examined. */
export interface OwnPaperRow {
  key: string
  about: OwnPaperAbout
  /** Always PENDING: on file as she sent it, examined by nobody. */
  status: 'PENDING'
  validFrom: Date | null
  expiresAt: Date | null
  edition: string | null
  /** The license number, where it has one. Kept where `credentialDetail` reads it. */
  number: string | null
  /** The board or body that issued it. */
  issuer: string | null
  /** The day it was awarded, where only the year is known: 1 January of it. */
  issuedAt: Date | null
  /** The sentence the screen shows once it is filed. */
  says: string
}

export type OwnPaperVerdict =
  | { ok: true; row: OwnPaperRow }
  | { ok: false; code: string; field?: string; message: string }

function filled(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function dayOf(v: string | null | undefined): Date | null {
  if (!filled(v)) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCDate() === Number(m[3]) ? d : null
}

function startOfDay(on: Date): number {
  return Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate())
}

/**
 * Whether this paper may go on her file as given, and the row if so.
 *
 * Every refusal says what to give, because the person typing has the
 * paper in front of her.
 */
export function mayFileOwnPaper(input: OwnPaperInput, on: Date): OwnPaperVerdict {
  const key = input.key.trim()
  if (input.about === 'MY_FIRM' && !input.isOnePersonFirm && !input.filesForFirm) {
    return {
      ok: false, code: 'NOT_YOUR_FIRM',
      message: 'Your firm’s W-9, insurance and good standing are filed by its Owner, an Admin, HR or the Compliance Officer, under Company paperwork.',
    }
  }
  const why = whyNotOwn(key, input.about, input.jurisdiction ?? 'DEFAULT', input.defined ?? [])
  if (why) return { ok: false, code: 'NOT_OWN_PAPER', message: why }

  const t = typeByKey(key, input.defined ?? [])!
  const needs = needsOf(t, input.about)
  const lower = /^[A-Z][a-z]/.test(t.label) ? t.label.charAt(0).toLowerCase() + t.label.slice(1) : t.label

  // The copy. Nothing is on file with no copy behind it. Where the record
  // has nowhere to keep one for this caller (a degree, for a person with
  // no firm of her own), it says so rather than filing the facts alone.
  if (!input.canKeepCopy) {
    return {
      ok: false, code: 'NO_COPY_HOME', field: 'file',
      message: `A copy of your ${lower} cannot be kept on your own page yet. The firm that asks for it keeps the copy.`,
    }
  }
  if (!filled(input.fileName)) {
    return { ok: false, code: 'NEEDS_FILE', field: 'file', message: `Attach the ${lower} as it was issued.` }
  }

  if (needs.number && !filled(input.number)) {
    return { ok: false, code: 'NEEDS_NUMBER', field: 'number', message: `Enter the number printed on your ${lower}.` }
  }
  if (needs.issuer && !filled(input.issuer)) {
    return { ok: false, code: 'NEEDS_ISSUER', field: 'issuer', message: `Enter who issued your ${lower}, such as the state board.` }
  }
  let awarded: Date | null = null
  if (needs.year) {
    const y = (input.year ?? '').trim()
    const n = /^\d{4}$/.test(y) ? Number(y) : NaN
    if (!y) return { ok: false, code: 'NEEDS_YEAR', field: 'year', message: `Enter the year your ${lower} was awarded.` }
    if (!(n >= 1940 && n <= on.getUTCFullYear())) {
      return { ok: false, code: 'BAD_YEAR', field: 'year', message: `Enter the year as four digits, no later than ${on.getUTCFullYear()}.` }
    }
    awarded = new Date(Date.UTC(n, 0, 1))
  }
  if (needs.edition && !filled(input.edition)) {
    return {
      ok: false, code: 'NEEDS_EDITION', field: 'edition',
      message: key === 'W9'
        ? 'Enter the revision date printed at the top left of the W-9, such as “Rev. March 2024”.'
        : `Enter the edition printed on the ${lower}.`,
    }
  }

  const from = dayOf(input.validFrom)
  const until = dayOf(input.validUntil)
  if (filled(input.validFrom) && !from) return { ok: false, code: 'BAD_DATE', field: 'validFrom', message: 'Enter the start date as a day on the calendar, such as 2026-09-01.' }
  if (filled(input.validUntil) && !until) return { ok: false, code: 'BAD_DATE', field: 'validUntil', message: 'Enter the end date as a day on the calendar, such as 2027-08-31.' }

  // The fourth state — on file, no expiry, on a kind that expires — is
  // the one that kept a certificate green from March to July in 2017.
  if (needs.validUntil && !until) {
    return {
      ok: false, code: 'NEEDS_END', field: 'validUntil',
      message: `Enter the day your ${lower} runs out, as printed on it. A paper that runs out is not on file without that date.`,
    }
  }
  if (needs.validFrom && !from) {
    return {
      ok: false, code: 'NEEDS_START', field: 'validFrom',
      message: `Enter the day your ${lower} starts, as printed on it. Cover that starts next month covers nobody this week.`,
    }
  }
  if (from && until && from.getTime() > until.getTime()) {
    return { ok: false, code: 'BACKWARDS', field: 'validUntil', message: 'The end date is before the start date. Check both against the paper.' }
  }
  if (until && until.getTime() < startOfDay(on)) {
    return {
      ok: false, code: 'ALREADY_LAPSED', field: 'validUntil',
      message: `Your ${lower} ran out on ${plainDate(until.toISOString())}. Put the renewed one on file instead.`,
    }
  }

  const tail = until ? `, runs out ${plainDate(until.toISOString())}` : ''
  return {
    ok: true,
    row: {
      key,
      about: input.about,
      status: 'PENDING',
      validFrom: from,
      expiresAt: until,
      edition: needs.edition ? input.edition!.trim() : null,
      number: needs.number ? input.number!.trim() : null,
      issuer: needs.issuer ? input.issuer!.trim() : null,
      issuedAt: awarded,
      says:
        `${input.about === 'MY_FIRM' ? 'Your firm’s' : 'Your'} ${lower} ${/s$/.test(lower) ? 'are' : 'is'} on file${tail}. Nobody has examined it yet: ` +
        `the firm that asks for it looks at it and records what it saw.`,
    },
  }
}
