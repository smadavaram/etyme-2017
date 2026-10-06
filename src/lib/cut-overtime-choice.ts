/**
 * Overtime on a cut week: which rule a pay line follows, who may choose
 * it, what is refused, what is recorded, and the sentence a person reads.
 *
 * ── The founder's rule, 2026-09-30 ────────────────────────────────────
 *
 * "Go with your recommendations, but keep settings user configurable."
 * When the employer accepts fewer hours than were worked and the accepted
 * week is still over the line:
 *
 *   ABOVE_THE_LINE       the default. Overtime only on the accepted hours
 *                        above the line: 41 of 45 accepted pays 40 + 1 at
 *                        the premium, 42 pays 40 + 2. What the law
 *                        requires, and no jump at the line.
 *   KEEP_WEEK_OVERTIME   the paying firm's choice, with a name and a
 *                        reason. The cut comes off ordinary hours first,
 *                        so the week keeps its overtime: 41 pays 36 + 5.
 *
 * At or under the line is straight time whichever is chosen. That rule is
 * money's and is not decided here.
 *
 * ── What this file is, and is not ─────────────────────────────────────
 *
 * The door the choice goes through, on the placement's pay line, and the
 * one reader of the stored value (`cutOvertimeFor`). It does no pay
 * arithmetic. `lib/money/pay-hours` and `sheetPay` price a cut week, and
 * they call `cutOvertimeFor` to learn which rule to price it under.
 *
 * ── Payroll reads it ──────────────────────────────────────────────────
 *
 * For its first day payroll still cut ordinary hours first on every line
 * whatever the line said, and the pay line said so in words rather than
 * describe a payment nobody made. Since 2026-09-30 (etyme-money,
 * 3928b2191) the run, the payroll screen, the payroll file, back pay and
 * the worker's own page all read `cutOvertimeFor`, so the sentence on the
 * line is the rule payroll pays.
 *
 * ── Three refusals, each in a sentence ────────────────────────────────
 *
 * The same three as the overtime method (lib/overtime-method-choice),
 * for the same reasons: a desk that cannot read what people cost has no
 * business deciding how their pay is cut; only the firm that pays the
 * worker chooses; and anything but the default needs a reason long enough
 * to be one, because it is the only evidence of the choice later.
 */

import { CHOOSES_OVERTIME_METHOD, MIN_REASON } from '@/lib/overtime-method-choice'
import { formatDayLong } from '@/lib/format-date'

export type CutOvertime = 'ABOVE_THE_LINE' | 'KEEP_WEEK_OVERTIME'

export const DEFAULT_CUT_OVERTIME: CutOvertime = 'ABOVE_THE_LINE'
export const CUT_OVERTIME_RULES: CutOvertime[] = ['ABOVE_THE_LINE', 'KEEP_WEEK_OVERTIME']

/** The same desk that chooses the overtime method chooses this. */
export const CHOOSES_CUT_OVERTIME = CHOOSES_OVERTIME_METHOD

/**
 * Whether payroll prices a cut week by this setting. True since money
 * wired `cutOvertimeFor` into the run, the screen, the file, back pay and
 * the worker's page; kept as a named fact so a test can hold it.
 */
export const PAYROLL_READS_CUT_OVERTIME = true

/** The two choices, in the words on the screen. */
export const CUT_OVERTIME_LABEL: Record<CutOvertime, string> = {
  ABOVE_THE_LINE: 'Only accepted hours over 40 (default, what the law requires)',
  KEEP_WEEK_OVERTIME: "Keep the week's overtime (ordinary hours cut first)",
}

/** How each rule reads as the end of "When fewer hours are accepted, …". */
const RULE_WORDS: Record<CutOvertime, string> = {
  ABOVE_THE_LINE: 'overtime is paid only on the accepted hours over the line',
  KEEP_WEEK_OVERTIME: "the week keeps its overtime and the cut comes off ordinary hours first",
}

const isRule = (v: unknown): v is CutOvertime =>
  typeof v === 'string' && (CUT_OVERTIME_RULES as string[]).includes(v)

// ── The reader payroll calls ─────────────────────────────────────────

export interface CutOvertimeOnLine {
  cutOvertime?: string | null
  cutOvertimeById?: string | null
  cutOvertimeReason?: string | null
}

/**
 * Which rule a cut week on this pay line is priced under.
 *
 * KEEP_WEEK_OVERTIME is honored only where the line names who chose it
 * and why — a value with no name or no reason behind it is somebody's
 * word for a wage decision, and the default is paid instead. Anything
 * unreadable is the default. Takes any object, so a caller can pass the
 * buy contract row it already holds.
 */
export function cutOvertimeFor(line?: object | null): { rule: CutOvertime; chosen: boolean; says: string } {
  const l = (line ?? {}) as CutOvertimeOnLine
  const stored = l.cutOvertime
  const byWhom = l.cutOvertimeById ?? null
  const why = l.cutOvertimeReason?.trim() || null
  if (stored === 'KEEP_WEEK_OVERTIME') {
    if (byWhom && why) {
      return { rule: 'KEEP_WEEK_OVERTIME', chosen: true, says: `When fewer hours are accepted, ${RULE_WORDS.KEEP_WEEK_OVERTIME}.` }
    }
    return {
      rule: DEFAULT_CUT_OVERTIME,
      chosen: false,
      says:
        `When fewer hours are accepted, ${RULE_WORDS.ABOVE_THE_LINE}. ` +
        "Keeping the week's overtime is on the line without saying who chose it and why, so it is not used.",
    }
  }
  return {
    rule: DEFAULT_CUT_OVERTIME,
    chosen: stored === 'ABOVE_THE_LINE' && byWhom != null,
    says: `When fewer hours are accepted, ${RULE_WORDS.ABOVE_THE_LINE}.`,
  }
}

// ── The door a choice goes through ───────────────────────────────────

export interface CutChangeInput {
  rule: unknown
  reason: unknown
  /** The caller's seat holds `consultants.cost`. */
  mayReadCost: boolean
  /** The caller's company is the one that pays on this line. */
  isPayer: boolean
  personName?: string | null
}

export type CutChangeVerdict =
  | { ok: true; rule: CutOvertime; reason: string | null }
  | { ok: false; status: 403 | 422; code: string; says: string; field?: string }

/** Whether a choice may be recorded, and if not, why, in a sentence. */
export function checkCutOvertimeChange(input: CutChangeInput): CutChangeVerdict {
  const who = input.personName?.trim() || 'this worker'
  if (!input.mayReadCost) {
    return {
      ok: false, status: 403, code: 'FORBIDDEN',
      says:
        `Only a desk that can see what ${who} is paid can change how their overtime is paid when fewer hours are accepted. ` +
        'Ask whoever runs pay at your firm.',
    }
  }
  if (!input.isPayer) {
    return {
      ok: false, status: 403, code: 'NOT_THE_PAYER',
      says: `Only the firm that pays ${who} can choose how their overtime is paid when fewer hours are accepted.`,
    }
  }
  if (!isRule(input.rule)) {
    return {
      ok: false, status: 422, code: 'VALIDATION', field: 'rule',
      says:
        "Choose one of two: overtime only on the accepted hours over 40, or keep the week's overtime " +
        'and cut ordinary hours first.',
    }
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (input.rule !== DEFAULT_CUT_OVERTIME && reason.length < MIN_REASON) {
    return {
      ok: false, status: 422, code: 'REASON_REQUIRED', field: 'reason',
      says:
        `Say why ${who} should keep the week's overtime when fewer hours are accepted. ` +
        'The reason is kept with the choice, because it is the only evidence of it later.',
    }
  }
  return { ok: true, rule: input.rule, reason: reason || null }
}

/** The columns a recorded choice writes: the rule, who, when and why. */
export function cutOvertimeRecord(
  verdict: Extract<CutChangeVerdict, { ok: true }>,
  byPersonId: string,
  at: Date
): { cutOvertime: CutOvertime; cutOvertimeById: string; cutOvertimeAt: Date; cutOvertimeReason: string | null } {
  return { cutOvertime: verdict.rule, cutOvertimeById: byPersonId, cutOvertimeAt: at, cutOvertimeReason: verdict.reason }
}

// ── The sentence on the pay line ─────────────────────────────────────

export interface CutLineChoice extends CutOvertimeOnLine {
  cutOvertimeAt?: Date | null
  cutOvertimeBy?: { name: string } | null
}

const longDate = (d: Date) => formatDayLong(d)

/**
 * What the pay line says. Read through `cutOvertimeFor`, the same call
 * payroll prices a cut week with, so the screen names the rule payroll
 * pays and never one it ignores.
 */
export function cutOvertimeSays(line: CutLineChoice): {
  rule: CutOvertime
  chosen: boolean
  says: string
  chosenBy: string | null
  chosenAt: string | null
  reason: string | null
} {
  const r = cutOvertimeFor(line)
  const by = line.cutOvertimeBy?.name ?? null
  const at = line.cutOvertimeAt ?? null
  let says = r.says
  if (r.chosen && by && at) says += ` Chosen by ${by} on ${longDate(at)}.`
  says += ' At or under 40 accepted hours, every hour is paid at straight time.'
  return {
    rule: r.rule,
    chosen: r.chosen,
    says,
    chosenBy: r.chosen ? by : null,
    chosenAt: r.chosen && at ? at.toISOString() : null,
    reason: r.chosen ? line.cutOvertimeReason ?? null : null,
  }
}
