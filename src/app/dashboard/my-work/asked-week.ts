import { weekStart, weekEnd } from '@/lib/overtime'
import { formatDay } from '@/lib/format-date'

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

/**
 * The week the picker opens on, with no week asked for: the most recent
 * whole week she has not filed, one whose Saturday has passed. Only where
 * every whole week is filed does it open on this week, filed as it goes.
 * Until 2026-11-15 it opened on this week even on a Sunday, so "this
 * week" was filed as a one-day timesheet (walk l2a).
 */
export function openingWeek<W extends { periodStart: string }>(weeks: W[], today: string | null | undefined): W | undefined {
  if (!today) return weeks[0]
  return weeks.find((w) => weekEnd(w.periodStart) < today) ?? weeks[0]
}

/**
 * Said where every day she has worked is filed: when she can file next.
 * A day opens once it has happened, so tomorrow opens a new week only
 * when today is a Saturday; and a placement that has ended opens nothing.
 */
export function allFiledSays(site: string, today: string | null | undefined, endDate?: string | null): string {
  const done = `You have filed every day you worked at ${site}.`
  if (!today) return done
  if (endDate && endDate.slice(0, 10) <= today) return done
  if (weekEnd(today) === today) return `${done} The next week opens tomorrow.`
  return `${done} File the rest of this week as you work it. It ends ${formatDay(weekEnd(today), { weekday: true, year: false })}.`
}
