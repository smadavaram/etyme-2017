/**
 * When a role may lawfully turn somebody away over their permission to
 * work, and when it may not.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * The product could already do the unlawful thing, automatically and
 * with confidence. `requirements/parse` read an advert, found the words
 * "US Citizen", and set a hard requirement at 0.92 confidence with
 * `flagged: false`. `bench-filter` then removed every consultant whose
 * recorded status was not an exact string match, and told nobody.
 *
 * In the United States that is citizenship-status discrimination under
 * INA §274B (8 U.S.C. §1324b), which the Department of Justice's
 * Immigrant and Employee Rights Section enforces, and "US citizens or
 * green card holders only" is the single most commonly cited form of
 * it in staffing. A machine doing it is worse than a person doing it:
 * it scales, and it leaves a timestamped record of having done it on
 * purpose.
 *
 * ── The distinction everything turns on ──────────────────────────────
 *
 * Recording somebody's work authorisation is necessary and lawful. You
 * cannot complete an I-9 or plan a sponsorship without it. What is
 * unlawful is using it to *prefer* one status over another where no law
 * requires the preference.
 *
 * The second distinction, and the one most often got wrong: declining
 * to sponsor is not the same as excluding non-citizens. An employer may
 * lawfully decide it will not petition for anybody. It may not, on that
 * basis, turn away a lawful permanent resident, an asylee, a refugee or
 * anyone else already authorised to work without a petition — those
 * people need no sponsorship, so a no-sponsorship policy has nothing to
 * say about them.
 *
 * ── How this is enforced here ────────────────────────────────────────
 *
 * Addendum E's rule, applied to its own named example:
 *
 *   BLOCK where legally grounded — and work authorisation is on that
 *   list, so a restriction with a recorded lawful basis is a hard stop.
 *
 *   WARN, capture a reason, proceed everywhere else. A restriction with
 *   no recorded basis is not grounded, so it warns and the person still
 *   appears. Never silently permit — and, the failure that was actually
 *   here, never silently exclude either.
 *
 * This file is deliberately about the United States. It is the only
 * jurisdiction the current rules cover and pretending otherwise would
 * be worse than saying so.
 */

/** What somebody's permission to work actually is. */
export type WorkAuth =
  | 'US_CITIZEN'
  | 'GC'
  | 'ASYLEE'
  | 'REFUGEE'
  | 'EAD'
  | 'H1B'
  | 'L1'
  | 'TN'
  | 'E3'
  | 'OPT'
  | 'CPT'

/**
 * Statuses that carry the right to work for anybody, with no employer
 * petition.
 *
 * §1324b calls these people "protected individuals" and they are the
 * ones a blanket "citizens only" rule unlawfully sweeps up.
 */
export const NEEDS_NO_SPONSOR: readonly WorkAuth[] = [
  'US_CITIZEN', 'GC', 'ASYLEE', 'REFUGEE', 'EAD',
]

/**
 * "US person" for export control, which is wider than "citizen".
 *
 * 22 CFR §120.62 (ITAR) and 15 CFR §772.1 (EAR) both include lawful
 * permanent residents and protected individuals. So a role that cites
 * export control has no basis for excluding a green card holder, and
 * the commonest real-world version of this restriction is therefore
 * over-broad on its own stated grounds.
 */
export const US_PERSON: readonly WorkAuth[] = ['US_CITIZEN', 'GC', 'ASYLEE', 'REFUGEE']

/**
 * The only reasons a role may narrow who can hold it.
 *
 * A closed list on purpose. An open text box would collect "client
 * preference" within a week, and client preference is not a lawful
 * basis — it is the unlawful thing with a name in front of it.
 */
export type LawfulBasis =
  /** ITAR or EAR controlled technical data. Limits to US persons. */
  | 'EXPORT_CONTROL'
  /** A clause in a federal contract requiring citizenship. */
  | 'FEDERAL_CONTRACT_CLAUSE'
  /** The role needs a clearance, and the clearance needs citizenship. */
  | 'SECURITY_CLEARANCE'
  /** A statute or regulation requires it. Cite it. */
  | 'STATUTE_OR_REGULATION'
  /** No petition will be filed. Narrow — see below. */
  | 'SPONSORSHIP_UNAVAILABLE'

export interface Restriction {
  /** What the role says it needs. */
  requires: WorkAuth[]
  /** Why it may. Null where nobody recorded one. */
  basis: LawfulBasis | null
  /** The clause, regulation or contract relied on. */
  cite?: string | null
}

export type Verdict = 'BLOCK' | 'WARN' | 'PASS'

export interface Decision {
  verdict: Verdict
  /** Said to a recruiter, in plain words, never a code. */
  reason: string
  /** True where the restriction itself looks unlawful, not just unfounded. */
  restrictionSuspect: boolean
}

/**
 * Which statuses a basis can actually justify excluding.
 *
 * Returned as the set the basis *permits*, so an over-broad
 * restriction is visible: a role citing export control and demanding
 * citizenship is asking for less than the law allows it to accept, and
 * that gap is the finding.
 */
export function permittedBy(basis: LawfulBasis): readonly WorkAuth[] | 'ALL' {
  switch (basis) {
    case 'EXPORT_CONTROL':
      return US_PERSON
    case 'FEDERAL_CONTRACT_CLAUSE':
    case 'SECURITY_CLEARANCE':
      // Both commonly require citizenship, and both are contract- or
      // agency-specific. The cite is what makes it checkable.
      return ['US_CITIZEN']
    case 'STATUTE_OR_REGULATION':
      return 'ALL'
    case 'SPONSORSHIP_UNAVAILABLE':
      // Not a citizenship rule at all. It excludes only people who
      // would need a petition, and nobody else.
      return NEEDS_NO_SPONSOR
  }
}

/**
 * Whether this role may lawfully turn this person away.
 *
 * Unknown authorisation is never a refusal — it is a question. Somebody
 * whose status nobody recorded is somebody to ask, and dropping them is
 * how a recruiter never finds out they were a citizen all along.
 */
export function authDecision(r: Restriction | null, has: WorkAuth | null): Decision {
  if (!r || r.requires.length === 0) {
    return { verdict: 'PASS', reason: 'The role does not restrict work authorisation.', restrictionSuspect: false }
  }

  if (!has) {
    return {
      verdict: 'WARN',
      reason: 'Nothing is recorded about their permission to work. Ask them before sending.',
      restrictionSuspect: false,
    }
  }

  if (r.requires.includes(has)) {
    return { verdict: 'PASS', reason: 'Their permission to work meets what the role states.', restrictionSuspect: false }
  }

  // No recorded basis. The restriction is not grounded, so it cannot
  // block — and it must not quietly drop them either, which is what
  // this product did before.
  if (!r.basis) {
    return {
      verdict: 'WARN',
      reason:
        'This role restricts who can hold it by their permission to work, and no lawful reason is recorded. ' +
        'They stay on the list. Record a reason before turning anybody away for this.',
      restrictionSuspect: true,
    }
  }

  const permitted = permittedBy(r.basis)

  if (r.basis === 'SPONSORSHIP_UNAVAILABLE' && NEEDS_NO_SPONSOR.includes(has)) {
    // The commonest unlawful refusal in this industry, and it is
    // usually an honest mistake: "we don't sponsor" applied to somebody
    // who needs no sponsoring.
    return {
      verdict: 'WARN',
      reason:
        `They are ${label(has)} and need no sponsorship, so a no-sponsorship policy does not exclude them. ` +
        'Turning them away on this basis would be unlawful.',
      restrictionSuspect: true,
    }
  }

  if (permitted !== 'ALL' && permitted.includes(has)) {
    // The role asked for less than its own stated basis allows.
    return {
      verdict: 'WARN',
      reason:
        `The role names ${r.requires.map(label).join(' or ')}, but ${basisLabel(r.basis)} permits ${label(has)} too. ` +
        'The restriction is narrower than the reason given for it.',
      restrictionSuspect: true,
    }
  }

  return {
    verdict: 'BLOCK',
    reason:
      `${basisLabel(r.basis)}${r.cite ? ` (${r.cite})` : ''} limits this role to ` +
      `${r.requires.map(label).join(' or ')}. They are ${label(has)}.`,
    restrictionSuspect: false,
  }
}

/**
 * Whether a phrase lifted out of an advert may be applied on its own.
 *
 * It may not, ever. An advert saying "USC/GC only" is evidence of what
 * somebody wrote, not evidence that they were allowed to write it — and
 * turning that sentence into a filter is the machine adopting a
 * restriction nobody has justified.
 */
export function mayApplyFromAdvert(): false {
  return false
}

function label(a: WorkAuth): string {
  const words: Record<WorkAuth, string> = {
    US_CITIZEN: 'a US citizen',
    GC: 'a lawful permanent resident',
    ASYLEE: 'an asylee',
    REFUGEE: 'a refugee',
    EAD: 'authorised to work on an EAD',
    H1B: 'on an H-1B',
    L1: 'on an L-1',
    TN: 'on TN status',
    E3: 'on an E-3',
    OPT: 'on OPT',
    CPT: 'on CPT',
  }
  return words[a] ?? a
}

function basisLabel(b: LawfulBasis): string {
  const words: Record<LawfulBasis, string> = {
    EXPORT_CONTROL: 'Export control',
    FEDERAL_CONTRACT_CLAUSE: 'A federal contract clause',
    SECURITY_CLEARANCE: 'A clearance requirement',
    STATUTE_OR_REGULATION: 'A statute',
    SPONSORSHIP_UNAVAILABLE: 'No sponsorship being available',
  }
  return words[b] ?? b
}

// ── National origin ───────────────────────────────────────────────────

/**
 * Words that mean a list has been sorted by where people are from.
 *
 * Sorting candidates or counterparties by national origin has no lawful
 * business exception — not a narrow one, not a documented one. It is
 * Title VII and §1981 exposure and, where it reaches hiring, §1324b as
 * well.
 *
 * This exists because real uploaded files were named this way. A sheet
 * headed "DESI CLIENTS" alongside one headed "American Prime Vendors"
 * is a document that explains itself to a plaintiff, and importing it
 * without comment makes it ours.
 */
const ORIGIN_WORDS = [
  'desi', 'indian', 'indians', 'american only', 'americans only',
  'whites', 'asians', 'hispanic', 'chinese only', 'nationality', 'ethnicity',
  'race', 'caste',
]

/**
 * Whether a sheet name or column header sorts people by where they are
 * from.
 *
 * Deliberately about the *grouping*, not the contents. "American Prime
 * Vendors" as one list beside "Prime Vendors (Indians)" is the problem;
 * a company that happens to be Indian is not.
 */
export function sortsByOrigin(label: string): boolean {
  const t = ` ${label.toLowerCase().replace(/[^a-z ]+/g, ' ')} `
  return ORIGIN_WORDS.some((w) => t.includes(` ${w} `))
}

/**
 * What to say when refusing one, and what to do with the rows.
 *
 * The rows are usually fine — they are email addresses of real firms.
 * It is the grouping that is unlawful, so the grouping is what gets
 * dropped, and the refusal is recorded rather than performed silently.
 * A record of having removed it is a defence; removing it quietly is
 * not.
 */
export function originRefusal(label: string): string {
  return (
    `"${label}" sorts people by where they are from. The contacts can be imported; ` +
    `the grouping cannot, and has not been. Nothing in Etyme records national origin, ` +
    `because no lawful use of it exists.`
  )
}
