/**
 * What is due on a learner's path (record 133, Phase 1). Pure: no database,
 * safe in a screen. The mentor sets a date for the whole path and may set one
 * per lesson; the learner home reads the nearest one still open. Dates are
 * plain calendar dates ("2026-12-04"), never a time of day, so no zone can
 * move a due date by a day.
 */
export type Dues = { dueOn: string | null; stepDues: Record<string, string> | null }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** True only for a real calendar date written YYYY-MM-DD ("2026-02-30" is not one). */
export function isCalendarDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** "Dec 4" for a calendar date. */
export function dayWords(s: string): string {
  const [, m, d] = s.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

/** A stored date (a Date or an ISO string) as the calendar date it names. */
export const asCalendarDate = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString().slice(0, 10) : null)

type Said = { ok: true; dueOn: string | null | undefined; stepDues: Record<string, string> | null | undefined } | { ok: false; message: string; field: string }

/**
 * The dates a mentor sends, read against the path's own lessons. `undefined`
 * means "not sent, leave as it is"; `null` means "clear it". A lesson date
 * for a lesson not on the path is refused in a sentence, never dropped.
 */
export function cleanDues(o: { dueOn?: unknown; stepDues?: unknown; steps: string[] }): Said {
  let dueOn: string | null | undefined
  if (o.dueOn === null || o.dueOn === '') dueOn = null
  else if (o.dueOn !== undefined) {
    if (!isCalendarDate(o.dueOn)) return { ok: false, field: 'dueOn', message: 'Write the day the path is due as year-month-day, a real day.' }
    dueOn = o.dueOn
  }
  let stepDues: Record<string, string> | null | undefined
  if (o.stepDues === null) stepDues = null
  else if (o.stepDues !== undefined) {
    if (typeof o.stepDues !== 'object' || Array.isArray(o.stepDues)) return { ok: false, field: 'stepDues', message: 'Send each lesson with its day.' }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o.stepDues as Record<string, unknown>)) {
      if (!o.steps.includes(k)) return { ok: false, field: 'stepDues', message: 'A lesson that is not on this path cannot have a day.' }
      if (!isCalendarDate(v)) return { ok: false, field: 'stepDues', message: 'Write each lesson’s day as year-month-day, a real day.' }
      out[k] = v
    }
    stepDues = Object.keys(out).length ? out : null
  }
  const last = dueOn === undefined ? undefined : dueOn
  if (last && stepDues) for (const v of Object.values(stepDues)) if (v > last) return { ok: false, field: 'stepDues', message: 'A lesson cannot be due after the whole path is.' }
  return { ok: true, dueOn, stepDues }
}

/**
 * The one line the learner home reads. The nearest open date wins: a lesson
 * she has not finished, or the whole path while any lesson is open. A
 * finished path, or one with no dates, owes nothing.
 */
export function dueLine(o: {
  state: string | null | undefined
  dues: Dues | null | undefined
  steps: string[] | null | undefined
  done: string[]
  titles: Record<string, string>
  today: string
}): { text: string; overdue: boolean; on: string | null } {
  const none = { text: 'Nothing is due.', overdue: false, on: null }
  if (!o.dues || o.state === 'COMPLETE') return none
  const open = (o.steps ?? Object.keys(o.dues.stepDues ?? {})).filter((k) => !o.done.includes(k))
  const cands: { on: string; what: string }[] = []
  for (const k of open) {
    const on = o.dues.stepDues?.[k]
    if (on) cands.push({ on, what: o.titles[k] ?? 'a lesson' })
  }
  if (o.dues.dueOn && (open.length > 0 || !o.steps)) cands.push({ on: o.dues.dueOn, what: 'your whole path' })
  if (cands.length === 0) return none
  cands.sort((a, b) => a.on.localeCompare(b.on))
  const c = cands[0]
  const overdue = c.on < o.today
  return { text: overdue ? `Overdue: ${c.what} was due ${dayWords(c.on)}.` : `${c.what[0].toUpperCase()}${c.what.slice(1)} is due ${dayWords(c.on)}.`, overdue, on: c.on }
}
