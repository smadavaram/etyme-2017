/**
 * Step four: the fix that cannot happen twice.
 *
 * The loop is four steps. An agent does the job, somebody checks it, a
 * person fixes what went wrong — and then the fix is saved, so it does not
 * come back. The fourth is the one everybody skips, and skipping it means
 * fixing the same mistake forever while the cost never falls.
 *
 * We built the first three this morning and stopped. The check tells a
 * recruiter that Ravi has no CV attached. They attach one. Tomorrow it
 * tells them Kavitha has no CV attached, and the day after that Meera, and
 * nothing anywhere notices that the answer is not "attach a CV" — it is
 * "collect CVs when somebody joins the bench".
 *
 * ── What this actually is ────────────────────────────────────────────
 *
 * Not a machine learning anything. Counting. The same check failing the
 * same way across enough different submissions is an upstream problem
 * wearing a per-submission costume, and the only trick is to say so out
 * loud with a number attached.
 *
 * ── Why a rate and not a count ───────────────────────────────────────
 *
 * Eight CV failures is nothing in a firm doing four hundred submissions a
 * week and an emergency in one doing twelve. A raw count invites the wrong
 * response at both ends.
 */

/** Below this share of submissions, it is bad luck rather than a pattern. */
export const PATTERN_AT = 0.3

/** And below this many, there is nothing to see either way. */
export const NEED_AT_LEAST = 4

export interface Failure {
  code: string
  /** Which submission it was on. The same one failing twice is one fault. */
  recordId: string
  at: Date
}

export interface Pattern {
  code: string
  /** How many distinct submissions this hit. */
  hits: number
  /** Out of how many checked. */
  outOf: number
  percent: number
  /** What the real fix is, said upstream of the symptom. */
  reallyFix: string
  /** One sentence for the screen. */
  says: string
}

/**
 * The real fix, for each thing that goes wrong repeatedly.
 *
 * Deliberately upstream of the symptom every time. "Attach a CV" is what
 * the check already said and it is not what this screen is for.
 */
const UPSTREAM: Record<string, string> = {
  CV_ATTACHED:
    'Ask for a CV when somebody joins the bench, not when a role turns up. The recruiter is doing it at submission time because nothing asked earlier.',
  CONSENT:
    'The consent text is not reaching people. Check who has a mobile on file — somebody without one is asked by nobody.',
  DOCS_PRESENT:
    'The paperwork is being chased per submission. Move it to onboarding and it stops being a per-role problem.',
  RATE_IN_RANGE:
    'Rates are being set above what these roles pay. Either the bench rate floors are out of date or the roles being worked are the wrong ones.',
  WORK_AUTH:
    'Work authorisation is not recorded for enough of the bench. It is one field and it decides whether somebody can be submitted at all.',
  AVAILABLE_IN_WINDOW:
    'People are being put forward for roles that start before they are free. The availability dates on the bench are probably stale — the fortnightly text is what fixes that.',
  SKILLS_EVIDENCED:
    'Profiles claim skills the CVs do not evidence. Either the profiles are aspirational or the CVs are out of date, and a client will notice before you do.',
}

/**
 * Which failures are patterns rather than bad luck.
 *
 * Counted per distinct submission, so one stubborn package failing three
 * attempts is one fault and not three.
 */
export function patterns(
  failures: Failure[],
  submissionsChecked: number
): Pattern[] {
  if (submissionsChecked === 0) return []

  const byCode = new Map<string, Set<string>>()
  for (const f of failures) {
    if (!byCode.has(f.code)) byCode.set(f.code, new Set())
    byCode.get(f.code)!.add(f.recordId)
  }

  const out: Pattern[] = []

  for (const [code, records] of byCode) {
    const hits = records.size
    if (hits < NEED_AT_LEAST) continue

    const share = hits / submissionsChecked
    if (share < PATTERN_AT) continue

    const percent = Math.round(share * 100)
    out.push({
      code,
      hits,
      outOf: submissionsChecked,
      percent,
      reallyFix: UPSTREAM[code] ?? 'Worth looking at where this keeps coming from.',
      says: `${label(code)} has failed on ${hits} of the last ${submissionsChecked} submissions — ${percent}%.`,
    })
  }

  return out.sort((a, b) => b.percent - a.percent)
}

function label(code: string): string {
  const said: Record<string, string> = {
    CV_ATTACHED: 'No CV attached',
    CONSENT: 'Nobody asked the consultant',
    DOCS_PRESENT: 'Missing documents',
    RATE_IN_RANGE: 'Rate above the role',
    WORK_AUTH: 'Work authorisation',
    AVAILABLE_IN_WINDOW: 'Not free in time',
    SKILLS_EVIDENCED: 'Skills not in the CV',
  }
  return said[code] ?? code
}

/**
 * What to put at the top of the screen.
 *
 * Nothing at all when there is no pattern, because a panel that always has
 * something in it is a panel nobody reads. Silence here means the loop is
 * working.
 */
export function headline(found: Pattern[]): string | null {
  if (found.length === 0) return null

  const worst = found[0]
  if (found.length === 1) return worst.says

  const rest = found.length - 1
  return `${worst.says} And ${rest} other${rest === 1 ? ' keeps' : 's keep'} coming back.`
}
