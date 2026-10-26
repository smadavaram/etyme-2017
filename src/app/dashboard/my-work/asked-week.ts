import { weekStart } from '@/lib/overtime'

/**
 * The week a link asked this page to open on, `?week=YYYY-MM-DD`.
 *
 * Ask Etyme's "File my week" card sends a worker here with the week it
 * means (`/dashboard/my-work?week=2026-09-13`). A week is Sunday to
 * Saturday (`weekStart`/`weekEnd` in `lib/overtime`), so any day inside it
 * names it. The open week is found by its Sunday rather than by its first
 * day, because a placement that starts midweek opens its first week on
 * that day, not on the Sunday.
 *
 * Nothing here decides what may be filed: the page offers only the weeks
 * `/api/me/work` says are open. A value that is not a real date, or names
 * a week with nothing open, returns null and the page opens where it
 * always did, on the first open week.
 */
export function askedWeek<W extends { periodStart: string }, F extends { contractId: string; weeks: W[] }>(
  filing: F[],
  asked: string | null | undefined,
): { contractId: string; periodStart: string } | null {
  const sunday = sundayOf(asked)
  if (!sunday) return null
  for (const f of filing) {
    const w = f.weeks.find((x) => sundayOf(x.periodStart) === sunday)
    if (w) return { contractId: f.contractId, periodStart: w.periodStart }
  }
  return null
}

function sundayOf(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00.000Z`)
  // Reject a date the calendar does not have (2026-02-30 rolls into March).
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null
  return weekStart(iso)
}
