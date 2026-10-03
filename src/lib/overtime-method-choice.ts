/**
 * Choosing a pay line's overtime method: who may, what is refused, what
 * is recorded, and the sentence a person reads.
 *
 * ── The founder's rule, 2026-09-29 ────────────────────────────────────
 *
 * "Follow US law as recommendation, but allow for user input if they
 * want to change" — and then, "yes to all": the paying firm's choice is
 * stored on the pay line with who chose it and why. The arithmetic of
 * each method is money's (`lib/money/overtime-method`), and so is the
 * reading of the stored value (`methodFor`). This file is only the door
 * the choice goes through, so the route and the screen say the same
 * thing and the refusals can be tested without a database.
 *
 * ── Three refusals, each in a sentence ────────────────────────────────
 *
 *   A desk that cannot read what people cost. The method prices a
 *   worker's overtime, which is their pay; a desk that may not read the
 *   pay rate has no business deciding how it is multiplied.
 *
 *   A firm that is not the one paying. The line belongs to whoever pays
 *   the worker on it. A client or a firm above in the chain is billed on
 *   its own terms and never chooses somebody else's wage arithmetic.
 *
 *   A method other than the law's default with no reason, or a reason too
 *   short to be one. The note is the whole of the evidence on the day
 *   somebody asks why a week was priced the way it was.
 *
 * ── What it never does ────────────────────────────────────────────────
 *
 * It never lowers what the law requires. Whatever is chosen, payroll pays
 * a nonexempt US worker at least the regular-rate premium
 * (`weekOvertime`'s floor), and the sentence on the screen says so.
 */

import {
  DEFAULT_OVERTIME_METHOD,
  OVERTIME_METHODS,
  methodFor,
  type OvertimeMethod,
} from '@/lib/money/overtime-method'

/** Shortest reason that reads as one, in characters, once trimmed. */
export const MIN_REASON = 10

/** The permission that reads what people cost — and so may choose how their overtime is priced. */
export const CHOOSES_OVERTIME_METHOD = 'consultants.cost'

/** How each method reads on a screen, as the end of "Overtime is paid at …". */
export const METHOD_WORDS: Record<OvertimeMethod, string> = {
  US_REGULAR_RATE: "the US regular rate (the law's default)",
  RATE_ON_THE_DAY: 'the rate in force on the day each overtime hour was worked',
  HIGHER_RATE: 'the higher of the rates worked that week',
}

export interface ChangeInput {
  method: unknown
  reason: unknown
  /** The caller's seat holds `consultants.cost`. */
  mayReadCost: boolean
  /** The caller's company is the one that pays on this line. */
  isPayer: boolean
  /** The worker's name, for the sentences. */
  personName?: string | null
}

export type ChangeVerdict =
  | { ok: true; method: OvertimeMethod; reason: string | null }
  | { ok: false; status: 403 | 422; code: string; says: string; field?: string }

/** Whether a change may be recorded, and if not, why, in a sentence. */
export function checkOvertimeMethodChange(input: ChangeInput): ChangeVerdict {
  const who = input.personName?.trim() || 'this worker'
  if (!input.mayReadCost) {
    return {
      ok: false, status: 403, code: 'FORBIDDEN',
      says:
        `Only a desk that can see what ${who} is paid can change how their overtime is priced. ` +
        `Ask whoever runs pay at your firm.`,
    }
  }
  if (!input.isPayer) {
    return {
      ok: false, status: 403, code: 'NOT_THE_PAYER',
      says: `Only the firm that pays ${who} can choose how their overtime is priced.`,
    }
  }
  if (typeof input.method !== 'string' || !(OVERTIME_METHODS as string[]).includes(input.method)) {
    return {
      ok: false, status: 422, code: 'VALIDATION', field: 'method',
      says:
        'Choose one of three: the US regular rate, the rate in force on each overtime day, ' +
        'or the higher of the rates worked that week.',
    }
  }
  const method = input.method as OvertimeMethod
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (method !== DEFAULT_OVERTIME_METHOD && reason.length < MIN_REASON) {
    return {
      ok: false, status: 422, code: 'REASON_REQUIRED', field: 'reason',
      says:
        `Say why overtime for ${who} should not be paid at the US regular rate, the law's default. ` +
        `The reason is kept with the choice, because it is the only evidence of it later.`,
    }
  }
  return { ok: true, method, reason: reason || null }
}

/** The columns a recorded choice writes: the method, who, when and why. */
export function overtimeMethodRecord(
  verdict: Extract<ChangeVerdict, { ok: true }>,
  byPersonId: string,
  at: Date
): {
  overtimeMethod: OvertimeMethod
  overtimeMethodById: string
  overtimeMethodAt: Date
  overtimeMethodReason: string | null
} {
  return {
    overtimeMethod: verdict.method,
    overtimeMethodById: byPersonId,
    overtimeMethodAt: at,
    overtimeMethodReason: verdict.reason,
  }
}

export interface LineChoice {
  overtimeMethod: string | null
  overtimeMethodById: string | null
  overtimeMethodAt: Date | null
  overtimeMethodReason: string | null
  overtimeMethodBy?: { name: string } | null
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/**
 * The sentence on the pay line. Read through `methodFor`, so the screen
 * says the method payroll will actually pay and never one it ignores.
 */
export function overtimeMethodSays(line: LineChoice): {
  method: OvertimeMethod
  chosen: boolean
  says: string
  chosenBy: string | null
  chosenAt: string | null
  reason: string | null
} {
  const m = methodFor(line)
  const by = line.overtimeMethodBy?.name ?? null
  const at = line.overtimeMethodAt ?? null
  let says = `Overtime is paid at ${METHOD_WORDS[m.method]}.`
  if (m.chosen && by && at) says += ` Chosen by ${by} on ${longDate(at)}.`
  if (m.method !== DEFAULT_OVERTIME_METHOD) {
    says += ' A worker the law entitles to overtime is never paid less than the regular-rate premium.'
  } else if (line.overtimeMethod && line.overtimeMethod !== DEFAULT_OVERTIME_METHOD) {
    // Stored, but nobody is named or no reason was given: `methodFor`
    // pays the default, and the screen says why rather than showing a
    // choice payroll is not honoring.
    says += ' Another method is on the line without a name or a reason, so it is not used.'
  }
  says += ' It only changes a week paid at two rates.'
  return {
    method: m.method,
    chosen: m.chosen,
    says,
    chosenBy: m.chosen ? by : null,
    chosenAt: m.chosen && at ? at.toISOString() : null,
    reason: m.chosen ? line.overtimeMethodReason ?? null : null,
  }
}
