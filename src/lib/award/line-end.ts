/**
 * The last day an award writes on a line. Pure.
 *
 * A typed end date first; then the job's own months from the start; then,
 * below the top of a chain, the end of the line the awarding firm already
 * sells this person on, so the prime's and the sub-vendor's lines read the
 * client's window and the time limit reads one window at every rung (the
 * thousand-job run, 2026-11-08). Null only where none of the three says.
 */
export function lineEnd(input: { typed: Date | null; start: Date; months: number | null; above: Date | null }): Date | null {
  if (input.typed) return input.typed
  if (input.months) return new Date(new Date(input.start).setMonth(input.start.getMonth() + input.months))
  return input.above ?? null
}
