/**
 * The letter the timesheet chase agent sends a worker whose week is not
 * filed (record 112, chain 4). Plain words: who is asking, which week, why
 * it arrived, and the one place to file it. No figures: not hours, not pay.
 * Pure.
 */

export const TIMESHEET_CHASE_TEMPLATE = 'timesheet-chase'

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "Nov 9 to Nov 15", or "Nov 9" for a one-day week. */
export function weekWords(from: Date, to: Date): string {
  return day(from) === day(to) ? day(from) : `${day(from)} to ${day(to)}`
}

export interface ChaseLetterInput {
  workerName: string
  firmName: string
  periodStart: Date
  periodEnd: Date
  dueOn: Date
  /** The page where she files it. Empty where this deployment has no lasting address. */
  link: string
  /** 1 for the first letter, 2 for the first reminder. */
  attempt: number
}

export function timesheetChaseLetter(i: ChaseLetterInput): { subject: string; text: string } {
  const week = weekWords(i.periodStart, i.periodEnd)
  const first = i.workerName.trim().split(/\s+/)[0] || 'there'
  const where = i.link ? `File it here: ${i.link}` : 'Open Etyme and go to Your work to file it.'
  const again = i.attempt > 1 ? 'This is a reminder. ' : ''
  return {
    subject: i.attempt > 1 ? `Reminder: your timesheet for ${week}` : `Your timesheet for ${week}`,
    text: [
      `Hi ${first},`,
      '',
      `${again}${i.firmName} has not received your timesheet for ${week}. It was due on ${day(i.dueOn)}.`,
      '',
      where,
      '',
      'If you have already filed it, you can ignore this letter.',
    ].join('\n'),
  }
}
