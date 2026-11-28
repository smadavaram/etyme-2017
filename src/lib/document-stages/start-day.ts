/**
 * The sentence a worker reads about her start day on her start-papers link.
 *
 * Release walk three (2026-11-03): the link told Rajesh Iyer "You are due
 * to start at Northbend Athletic on 2026-08-09" in November, the day
 * printed the way the machine stores it and said as still to come. The
 * day goes through the one formatter, and a day already gone is said as
 * gone: "started" where the line is running, "was due to start" where it
 * is not. Pure.
 */
import { formatDay } from '@/lib/format-date'

/** A line the person has started on: running, paused or since ended. */
export const RUNNING_STATES: readonly string[] = ['IN_PROGRESS', 'PAUSED', 'ENDED']

export function startDaySays(i: { startDate: Date; now: Date; running: boolean; clientName?: string | null }): string {
  const at = i.clientName ? ` at ${i.clientName}` : ''
  const day = formatDay(i.startDate)
  const today = Date.UTC(i.now.getUTCFullYear(), i.now.getUTCMonth(), i.now.getUTCDate())
  const past = i.startDate.getTime() < today
  if (!past) return `You are due to start${at} on ${day}.`
  return i.running ? `You started${at} on ${day}.` : `You were due to start${at} on ${day}.`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-08-09" or "Aug 9, 2026", as the day it names; null where it names none. */
function dayIn(s: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  const said = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(s)
  if (said && MONTHS.includes(said[1])) return new Date(Date.UTC(+said[3], MONTHS.indexOf(said[1]), +said[2]))
  return null
}

const STORED_START = /You (?:are|were) due to start( at .+?)? on (\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2} \d{1,2}, \d{4})\./

/**
 * A start sentence stored on a request the day it was raised, said again
 * on the day it is read. The fifth screen walk (2026-11-04): requests
 * raised before f46c605a7 kept "You are due to start at Northbend
 * Athletic on 2026-08-09" in their stored reason, so the link printed a
 * raw past day as still to come. `running` says whether the person's
 * line that starts on that day has begun. Anything else in the reason is
 * left as written. Pure.
 */
export function startSentenceNow(reason: string | null, now: Date, running: (startDate: Date) => boolean): string | null {
  if (!reason) return reason
  const m = STORED_START.exec(reason)
  if (!m) return reason
  const startDate = dayIn(m[2])
  if (!startDate) return reason
  const clientName = m[1] ? m[1].slice(' at '.length) : null
  return reason.replace(m[0], startDaySays({ startDate, now, running: running(startDate), clientName }))
}

/** The start day said about a person, to the firm's HR, rather than to her. */
export function startDaySaysAbout(i: { personName: string; startDate: Date; now: Date; running: boolean; clientName?: string | null }): string {
  const at = i.clientName ? ` at ${i.clientName}` : ''
  const day = formatDay(i.startDate)
  const today = Date.UTC(i.now.getUTCFullYear(), i.now.getUTCMonth(), i.now.getUTCDate())
  const past = i.startDate.getTime() < today
  if (!past) return `${i.personName} is due to start${at} on ${day}.`
  return i.running ? `${i.personName} started${at} on ${day}.` : `${i.personName} was due to start${at} on ${day}.`
}

/**
 * A stored start sentence, said on the day it is read and about the
 * person, for the list HR reads (`GET /api/packets`). Walk 5 and 7 left
 * this open: HR's request list printed "You are due to start at Northbend
 * Athletic on 2026-08-09" in November, a raw past day, addressed to the
 * worker. Anything else in the reason is left as written. Pure.
 */
export function startSentenceAboutNow(reason: string | null, personName: string | null, now: Date, running: (startDate: Date) => boolean): string | null {
  if (!reason) return reason
  const m = STORED_START.exec(reason)
  if (!m) return reason
  const startDate = dayIn(m[2])
  if (!startDate) return reason
  const clientName = m[1] ? m[1].slice(' at '.length) : null
  if (!personName) return reason.replace(m[0], startDaySays({ startDate, now, running: running(startDate), clientName }))
  return reason.replace(m[0], startDaySaysAbout({ personName, startDate, now, running: running(startDate), clientName }))
}

/** Whether a line of the person's that starts on `day` has begun. Pure. */
export function startedOn(lines: { startDate: Date | null; state: string }[], day: Date): boolean {
  const d = day.toISOString().slice(0, 10)
  return lines.some((l) => !!l.startDate && l.startDate.toISOString().slice(0, 10) === d && RUNNING_STATES.includes(l.state))
}
