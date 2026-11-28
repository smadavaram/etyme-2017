/**
 * What an edit of a job request writes: the fields that changed, and
 * nothing else.
 *
 * Walk 8, 9 November 2026: saving Edit rewrote where the work is and how
 * it is done when nobody touched them. The route compared what was sent
 * with what the job holds, told the suppliers only what had changed, and
 * then wrote everything it was sent, and the columns where the work is
 * done on every save that sent a work mode: a job that never said read
 * as on site in the comparison and was written ONSITE on the row. The
 * comparison is the 2026-11-03 edit rule's own (`diff` in
 * lib/requisition-change); this writes only what it found changed, and
 * the work columns only where the way of working or the sponsorship
 * changed. Pure.
 */
export function writtenOn(
  after: Record<string, unknown>,
  changes: readonly { field: string; from?: unknown; to?: unknown }[],
  /** The columns the raise's own reader turned the work answers into (`readWorkEdit`). */
  columns: Record<string, unknown>
): Record<string, unknown> {
  const changed = new Set(changes.map((c) => c.field))
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(after)) {
    // Sponsorship is compared as one value and written as the three columns below.
    if (k === 'sponsorship' || !changed.has(k)) continue
    data[k] = v
  }
  if (changed.has('workMode') && 'workMode' in columns) data.workMode = columns.workMode
  if (changed.has('sponsorship')) {
    for (const k of ['workAuthRequired', 'workAuthBasis', 'workAuthCite']) {
      if (k in columns) data[k] = columns[k]
    }
  }
  return data
}
