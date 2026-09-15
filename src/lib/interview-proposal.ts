/**
 * A proposed round, from what somebody typed to what the route wants.
 *
 * The client fills in a stage, how, how long, where, up to three times
 * and who is in the room. POST /api/submissions/:id/interviews wants
 * absolute slots with a start and an end. This is the one place that
 * turns one into the other, so the submissions page and the interviews
 * page cannot disagree about what a proposal is — and so the rules can
 * be tested without a browser.
 *
 * Times are typed as a local date and a local time. The browser's clock
 * says what "10:00" means; the slot leaves here as UTC, which is what
 * the model stores ("displayed local, stored absolute — an interview
 * booked across two time zones is the ordinary case").
 */

export type Mode = 'PHONE' | 'VIDEO' | 'ONSITE'

export interface ProposalForm {
  /** The client's own word for it — Screen, Technical, Onsite, Final. */
  stage: string
  mode: Mode
  durationMins: number
  /** A link, or an address. One field: where do I go. */
  location: string
  /** As typed: '2026-09-15' and '10:00'. An incomplete row is ignored. */
  times: { date: string; time: string }[]
  /** Names, not seats. Plenty of interviewers have no account here. */
  interviewers: string[]
}

export interface ProposalBody {
  stage: string
  mode: Mode
  durationMins: number
  location: string | null
  interviewers: string[]
  slots: { start: string; end: string }[]
}

export const MODES: { mode: Mode; label: string }[] = [
  { mode: 'PHONE', label: 'Phone' },
  { mode: 'VIDEO', label: 'Video' },
  { mode: 'ONSITE', label: 'In person' },
]

export const STAGES = ['Screen', 'Technical', 'Onsite', 'Final']
export const DURATIONS = [30, 45, 60, 90]
export const MAX_TIMES = 3

export const EMPTY_FORM: ProposalForm = {
  stage: '',
  mode: 'VIDEO',
  durationMins: 60,
  location: '',
  times: [{ date: '', time: '' }],
  interviewers: [],
}

/** A local date and time as a Date, or null when either half is missing or nonsense. */
export function localMoment(date: string, time: string): Date | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00`)
  return isNaN(d.getTime()) ? null : d
}

/**
 * The body, and every reason it should not be sent yet.
 *
 * Problems are sentences for the person typing, in the order they would
 * fix them. An empty list means the body is ready.
 */
export function buildProposal(
  form: ProposalForm,
  now: Date = new Date()
): { body: ProposalBody; problems: string[] } {
  const problems: string[] = []

  const durationMins = Math.round(Number(form.durationMins))
  if (!Number.isFinite(durationMins) || durationMins < 15 || durationMins > 240) {
    problems.push('Between fifteen minutes and four hours.')
  }

  const moments = form.times
    .map((t) => localMoment(t.date, t.time))
    .filter((d): d is Date => d !== null)
  const seen = new Set<number>()
  const distinct = moments.filter((d) => (seen.has(d.getTime()) ? false : (seen.add(d.getTime()), true)))
  const ahead = distinct.filter((d) => d.getTime() > now.getTime())

  if (distinct.length === 0) {
    problems.push('Offer at least one time. Nobody can confirm an interview with no time on it.')
  } else if (ahead.length === 0) {
    problems.push('Every time you offered has already passed.')
  } else if (ahead.length < distinct.length) {
    problems.push('One of those times has already passed — it will not be offered.')
  }

  const interviewers = Array.from(
    new Set(form.interviewers.map((n) => n.trim()).filter(Boolean))
  )

  const body: ProposalBody = {
    stage: form.stage.trim() || 'Technical',
    mode: form.mode,
    durationMins: Number.isFinite(durationMins) ? durationMins : 60,
    location: form.location.trim() || null,
    interviewers,
    slots: ahead
      .sort((a, b) => a.getTime() - b.getTime())
      .map((start) => ({
        start: start.toISOString(),
        end: new Date(start.getTime() + (Number.isFinite(durationMins) ? durationMins : 60) * 60_000).toISOString(),
      })),
  }

  // A passed time is dropped, not fatal — the others still stand. Only
  // the problems that stop the proposal count against sending it.
  const blocking = problems.filter((p) => !p.startsWith('One of those times'))
  return { body, problems: blocking.length ? problems : problems.filter((p) => p.startsWith('One of those times')) }
}

/** Whether the body may be sent: no blocking problem. */
export function readyToSend(problems: string[]): boolean {
  return problems.every((p) => p.startsWith('One of those times'))
}
