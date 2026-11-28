/**
 * How the nightly run takes its firms: a few at a time, against a
 * deadline, in one queue. Pure apart from the clock, which is handed in.
 *
 * One queue, not two (simulation, 2026-11-01). The run read the client
 * programs a few at a time and only then the supplier firms, so while the
 * slowest program finished — a client with twenty-five people near the
 * time limit — every other worker stood idle with suppliers still to
 * read. Now the programs go first, heaviest work first, and a worker that
 * finishes one takes the next firm of either kind at once.
 */

/** Firms read at once. Each act inside holds one transaction, and the ledger caps those (onePerformerSlot). */
export const AT_ONCE = 4
/** Stop starting firms after this, well inside the host's 60-second limit. */
export const BUDGET_MS = 45_000

/**
 * Read every item, at most `atOnce` at a time; once the deadline has
 * passed, start no more and list the ids not started in `left`, for the
 * next run. Every item is either read once or left, never both.
 */
export async function inTurns<T extends { id: string }>(
  items: readonly T[],
  deadline: number,
  left: string[],
  each: (item: T) => Promise<void>,
  opts: { atOnce?: number; now?: () => number } = {},
): Promise<void> {
  const now = opts.now ?? Date.now
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      if (now() >= deadline) {
        left.push(...items.slice(next).map((i) => i.id))
        next = items.length
        return
      }
      await each(items[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.atOnce ?? AT_ONCE, items.length) }, worker))
}

/** The same list, started at a different place each day, so the same firms are not always the ones a deadline leaves. */
export function turnedDaily<T>(items: readonly T[], nowMs = Date.now()): T[] {
  if (items.length === 0) return []
  const day = Math.floor(nowMs / 86_400_000)
  const at = (day * 37) % items.length
  return [...items.slice(at), ...items.slice(0, at)]
}
