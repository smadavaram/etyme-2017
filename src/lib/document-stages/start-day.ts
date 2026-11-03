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
