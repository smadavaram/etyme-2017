'use client'

/**
 * Reports — Grow section (vendor)
 *
 * BRD §18: Performance metrics, revenue analytics, and operational
 * dashboards. Phase 2 feature — page exists so the sidebar link
 * doesn't 404.
 *
 * This page will show:
 * - Revenue by client, by month
 * - Margin analysis (arbitrage vs expertise)
 * - Bench utilization and time-to-fill
 * - Consultant retention and tenure distribution
 * - Vendor scorecard (for GSI/MSP views)
 */

export default function ReportsPage() {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Grow</p>
        <h1>Reports</h1>
        <p>
          Revenue, margin, bench utilization, and retention analytics.
          The numbers that show whether the business is growing.
        </p>
      </div>

      <div className="panel text-center py-16">
        <p className="text-lg font-serif text-etyme-ink mb-2">Coming soon</p>
        <p className="text-sm text-etyme-muted max-w-md mx-auto">
          Revenue by client, margin analysis, bench utilization, time-to-fill,
          and consultant retention metrics will appear here.
        </p>
        <p className="text-xs text-etyme-faint mt-4">
          Phase 2 — ships after the core operating pages are live.
        </p>
      </div>
    </>
  )
}
