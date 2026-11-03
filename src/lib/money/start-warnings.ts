/**
 * The warnings a start asks a reason for, asked together and answered
 * together.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * Activating a placement can warn twice: a paper that warns (the
 * supplier's own house, `contractClearance`) and a client rule that warns
 * (governance at CONTRACT_START). Both are WARN-and-proceed under Addendum
 * E, and both read their reason from one field, `overrideReason`. The
 * route asked them one at a time: the first press refused on the paper,
 * the person typed why, and the second press carried that reason past the
 * client's rule as well — a rule the person had never been shown. A
 * reason given for one question answered another nobody asked (the second
 * Tapin walk, 2026-10-31, handed over by etyme-demand).
 *
 * So the route works out every warning first and refuses once, naming
 * all of them; one reason then answers what the person read. A screen
 * that sends back which warnings it showed (`answering`) is held to
 * exactly those: a warning that appeared since is asked again, alone.
 *
 * The field stays `overrideReason`, the one `reasonAsked` in
 * lib/award/reason-asked sends both codes back in.
 *
 * Pure: no database.
 */

export type StartWarningCode = 'DOCUMENTS_WARN' | 'GOVERNANCE_WARN' | 'START_IDENTITY_WARN'

export interface StartWarning {
  code: StartWarningCode
  /** The warning's own sentence, said to the person word for word. */
  says: string
  /** What the route sends beside it: the paper's fix and chase, or the rule's evaluations. */
  detail?: Record<string, unknown>
}

/** What the person sent: the reason, and the warnings they were shown, where the screen says. */
export interface StartAnswer {
  reason: string | null | undefined
  /** The codes the person was shown. Absent from a caller that does not say; then every warning was in the one refusal it got first. */
  answering?: readonly string[] | null
}

const HEADING: Record<StartWarningCode, string> = {
  DOCUMENTS_WARN: 'Paperwork',
  GOVERNANCE_WARN: 'The client’s rule',
  START_IDENTITY_WARN: 'Who started',
}

/** The refusal's sentence: one warning as itself, several each under its own heading, and how one reason answers them. */
export function warningsSay(warnings: readonly StartWarning[]): string {
  if (warnings.length === 1) return warnings[0].says
  const each = warnings.map((w) => `${HEADING[w.code]}: ${w.says.replace(/\s+$/, '')}`).join(' ')
  return `${warnings.length} warnings to answer before this start. ${each} One reason answers all of them, and it is recorded beside each.`
}

export type StartVerdict =
  | { ok: true; answered: StartWarning[] }
  | {
      ok: false
      /** The 422 body's `error`: the first warning's code, every warning listed, the field the reason goes in. */
      error: Record<string, unknown> & { code: StartWarningCode; message: string; warnings: { code: StartWarningCode; says: string }[] }
    }

/**
 * Whether a start may go ahead past its warnings with the answer given.
 *
 *   no warning               goes ahead, nothing answered
 *   no reason                refused once, naming every warning
 *   a reason and `answering` goes ahead where every warning was among
 *                            those shown; else refused, naming only the
 *                            ones the person has not seen
 *   a reason, no `answering` goes ahead: the caller's first press was
 *                            refused naming every warning together
 */
export function startWarningVerdict(warnings: readonly StartWarning[], answer: StartAnswer): StartVerdict {
  if (warnings.length === 0) return { ok: true, answered: [] }
  const reason = typeof answer.reason === 'string' ? answer.reason.trim() : ''
  const shown = Array.isArray(answer.answering) ? new Set(answer.answering) : null
  const toAsk = !reason ? [...warnings] : shown ? warnings.filter((w) => !shown.has(w.code)) : []
  if (toAsk.length === 0) return { ok: true, answered: [...warnings] }
  return {
    ok: false,
    error: {
      // The first warning's own code, so a reader that knows one code
      // (`ANSWERED_IN` in lib/award/reason-asked) knows the field.
      code: toAsk[0].code,
      message: warningsSay(toAsk),
      warnings: toAsk.map((w) => ({ code: w.code, says: w.says })),
      // Each warning's own detail beside it: the paper's fix and chase,
      // the rule's evaluations.
      ...Object.assign({}, ...toAsk.map((w) => w.detail ?? {})),
      overridable: true,
      field: 'overrideReason',
    },
  }
}

/**
 * The hiring manager's No to "Is the person who started the person you
 * interviewed?" (`SellContract.startIdentityConfirmed === false`), as a
 * warning the start asks a reason for. Never a verdict and never a block
 * (the founder, 2026-11-03: what the record sees is said to the role that
 * decides, and none of it blocks except where the law blocks), and never
 * silently permitted either: the start asks why, and a later Yes from the
 * same hiring manager clears it. Null where nobody said No.
 */
export function startIdentityWarning(i: {
  confirmed: boolean | null | undefined
  personName: string
  answeredBy: string | null
}): StartWarning | null {
  if (i.confirmed !== false) return null
  const who = i.answeredBy ?? 'The hiring manager'
  return {
    code: 'START_IDENTITY_WARN',
    says: `${who} said the person who started is not the ${i.personName} who was interviewed. Check with the supplier first, or give a reason to start anyway. A Yes from ${i.answeredBy ?? 'the hiring manager'} clears this.`,
  }
}
