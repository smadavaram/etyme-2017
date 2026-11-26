/**
 * Why an accepted deliverable cannot be billed yet (record 120, pods:
 * "a deliverable is billed only once at least one team member's start is
 * confirmed").
 *
 * The sale writes each member's line in draft. The bill run bills only
 * running or ended lines, so until one member starts, an accepted
 * deliverable sits unbilled and the picker used to say nothing about it.
 * One reader says it, in the same words on the picker, the refusal and
 * the decide answer.
 *
 * Pure: no database. The caller reads the lines and the count.
 */

export const START_STEP_HREF = '/dashboard/contracts'
export const START_STEP_LABEL = 'Open Contracts'

/** The line states a bill can be raised on (mirrors `BILLABLE_LINE_STATES`). */
const STARTED = new Set(['IN_PROGRESS', 'ENDED'])

export interface TeamLine { state: string; personName: string | null }

/** True while the project has a team and not one member has started. */
export function waitsForAStart(lines: readonly TeamLine[]): boolean {
  return lines.length > 0 && !lines.some((l) => STARTED.has(l.state))
}

/**
 * The sentence. A supplier reads the names of the people still to start;
 * anybody else reads only how many, never a name.
 */
export function waitingForStartSays(lines: readonly TeamLine[], reader: 'SUPPLIER' | 'OTHER'): string {
  const n = lines.length
  const who = reader === 'SUPPLIER'
    ? lines.map((l) => l.personName).filter((x): x is string => !!x).join(', ')
    : ''
  const team = reader === 'SUPPLIER' && who
    ? `${who} ${n === 1 ? 'has' : 'have'} not started`
    : `${n} team member${n === 1 ? '' : 's'} not started`
  return `Waiting for a team member's start to be confirmed (${team}). An accepted deliverable is billed once one of them starts.`
}

/** What the client's yes on a deliverable answers. Never promises a bill the run will refuse. */
export function acceptedAnswer(name: string, lines: readonly TeamLine[], reader: 'SUPPLIER' | 'OTHER'): string {
  if (reader === 'SUPPLIER' && waitsForAStart(lines)) return `${name} accepted. ${waitingForStartSays(lines, 'SUPPLIER')}`
  return `${name} accepted.`
}
