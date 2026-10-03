import { mayOpen } from '@/components/shell/sidebar'
import { hasPermission } from '@/lib/permissions'

/**
 * Which of the seller's dashboard panels this seat may read, asked
 * before anything is fetched.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * A tester on 2026-09-30 found `GET /api/automation?limit=5` answering
 * 403 for every client desk and `GET /api/bench` answering 403 for the
 * AP clerk and for an integrator's engineer, on every visit, while the
 * screen said nothing was missing. The dashboard asked for five things
 * whoever was reading it, swallowed the refusals, and drew an empty
 * bench as "No consultants on bench" — a wrong fact rather than a blank.
 *
 * So the dashboard asks the same answer the menu asks — the permission
 * the page behind each panel names in the sidebar, read off its route
 * (`mayOpen`) — and does not call a route that would refuse. A panel it
 * may not read says so in words instead of showing a zero.
 */
export interface DashboardReads {
  /** `/api/bench`, behind the Bench panel and the "On bench" figure. */
  bench: boolean
  /** `/api/automation`, behind the System activity panel. */
  automation: boolean
  /**
   * "Good submissions a day, per job" and its target. A recruiting
   * desk's number, shown to the desks that submit; a finance desk read it
   * as a target set for them (worker tester, 2026-10-03).
   */
  target: boolean
  /** The Pipeline tile: monthly revenue across contracts, which is margin-side money. */
  pipeline: boolean
}

export function dashboardReads(permissions: readonly string[] | null | undefined): DashboardReads {
  // No seat read yet is not "may read everything": the dashboard waits
  // for the session before it asks, so null here means nothing is known.
  if (permissions == null) return { bench: false, automation: false, target: false, pipeline: false }
  return {
    // The panel reads /api/bench, which asks consultants.read. Not the
    // menu's answer: the Bench link also opens for the finance desk, on
    // bench profit, and a panel asked that way would call a route that
    // refuses it.
    bench: hasPermission(permissions, 'consultants.read'),
    automation: mayOpen('/dashboard/automation', permissions),
    target: hasPermission(permissions, 'submissions.create'),
    pipeline: hasPermission(permissions, 'margin.read'),
  }
}

/** What a panel the seat may not read says, in place of its numbers. */
export const NOT_YOURS = {
  bench: 'Not yours to see: the bench opens for the desks that read consultants.',
  automation: 'Not yours to see: what the system did opens for the desks that read governance.',
} as const
