'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { plainDate } from '@/lib/plain-date'
import { amount } from '@/lib/money-display'
import { ListSurface, type Column } from '@/components/list-surface'
import { useSession } from '@/components/session-provider'
import { mayChangeBenchPay } from '@/lib/bench-holiday-switch'
import type { HolidayAnswerRow } from '@/lib/bench-profit'
import { HolidaySwitchCell } from './holiday-switch'

/**
 * Bench profit — what the bench cost, and whether the work paid it back
 * (CLAUDE.md, "Bench profit, next after the integrator flow", 2026-09-30).
 *
 * Read by the owner, the admin and the finance desk; the tab is not drawn
 * for anybody else, and the route refuses them in a sentence if they
 * find it anyway. Three parts, in the founder's order: per person, per
 * course, and — for an integrator — how much of the firm is billing.
 * Every blank figure has its reason beside it; nothing here is computed
 * in the browser.
 */

interface Person {
  personId: string
  name: string
  listed: boolean
  course: string | null
  placedAt: string | null
  currency: string
  spell: 'BEFORE' | 'STRAIGHT_ON' | 'NOW' | 'UNKNOWN'
  benchFrom: string | null
  benchTo: string | null
  days: number | null
  costCents: number | null
  costSays: string
  /** "43 working days of 60 at 50% of $512.00 a day" — what the cost was counted over. */
  costCounted: string | null
  marginCents: number | null
  marginSays: string
  paidBackOn: string | null
  leftCents: number | null
  paybackSays: string
  /** Whether they are paid for a public holiday on the bench, in the rule's own words. */
  holiday: HolidayAnswerRow
}

interface Course {
  courseId: string | null
  title: string
  seats: number
  finished: number
  dropped: number
  pricePerSeatCents: number | null
  costCents: number | null
  costSays: string
  placed: number
  medianDaysToPlace: number | null
  speedSays: string
  marginCents: number | null
  marginSays: string
  currency: string
}

interface Move {
  personId: string
  name: string
  to: string
  from: string | null
  currency: string
  gapDays: number | null
  gapCostCents: number | null
  gapSays: string
  savedAgainstBenchSays: string
  savedAgainstSubVendorSays: string
}

interface Data {
  firm: string
  kind: string
  policySays: string
  people: Person[]
  courses: Course[]
  utilization: {
    billing: number
    onBench: number
    startingSoon: number
    unknown: number
    billingPct: number | null
    benchPct: number | null
    perProject: { project: string; billing: number }[]
    says: string
  } | null
  moves: Move[]
  basis: string[]
}

/** A figure, or the words "Not known yet" — never a zero standing in for a blank. */
const money = (cents: number | null, currency: string) => (cents == null ? 'Not known yet' : amount(cents, currency))

export function BenchProfit() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)
  const session = useSession()
  // The switch is the owner's, the admin's and the finance desk's at a firm
  // with a bench — the desks that read this page, less a firm with no bench.
  const turnsHolidays = mayChangeBenchPay({
    companyName: session.company?.name ?? 'your firm',
    companyKind: session.company?.kind ?? null,
    roleName: session.roleName,
    consultantSeat: session.contextType === 'CONSULTANT',
  }).ok

  const load = useCallback(async () => {
    try {
      const body = await readJson<{ data: Data }>(await fetch('/api/bench/profit'))
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message ?? 'Bench profit could not be read.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // A turned switch changes the cost beside it, so the figures are read again.
  const turned = async (s: { ok: boolean; text: string }) => {
    setSaid(s)
    await load()
  }

  const personCols: Column<Person>[] = [
    {
      key: 'name', label: 'Person',
      render: (r) => (
        <div>
          <div className="text-[13px] font-medium text-etyme-ink">{r.name}</div>
          <div className="text-[11px] text-etyme-muted">
            {r.placedAt ? `Placed at ${r.placedAt}` : r.spell === 'NOW' ? 'On the bench now' : '—'}
            {r.course ? ` · ${r.course}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'days', label: 'Days on the bench', align: 'right',
      sortValue: (r) => r.days,
      render: (r) => (
        <span className="tabular-nums" title={r.benchFrom ? `${plainDate(r.benchFrom)} to ${plainDate(r.benchTo)}` : undefined}>
          {r.days ?? '—'}
        </span>
      ),
    },
    {
      key: 'costCents', label: 'Bench cost', align: 'right',
      sortValue: (r) => r.costCents,
      // What was counted is said beside the figure, so calendar days times
      // the day rate is never left to disagree with it on the screen.
      render: (r) => (
        <div className="text-right">
          <span className="tabular-nums" title={r.costSays}>{money(r.costCents, r.currency)}</span>
          {r.costCounted && <p className="text-[11px] text-etyme-muted">{r.costCounted}</p>}
        </div>
      ),
    },
    ...(turnsHolidays
      ? [{
          key: 'holidays', label: 'Holidays', sortable: false,
          render: (r: Person) => <HolidaySwitchCell personId={r.personId} answer={r.holiday} onTurned={turned} />,
        } as Column<Person>]
      : []),
    {
      key: 'marginCents', label: 'Margin since placed', align: 'right',
      sortValue: (r) => r.marginCents,
      render: (r) => <span className="tabular-nums" title={r.marginSays}>{r.spell === 'NOW' ? '—' : money(r.marginCents, r.currency)}</span>,
    },
    {
      key: 'paybackSays', label: 'Paid back',
      sortValue: (r) => r.paidBackOn ?? (r.leftCents != null ? `~${r.leftCents}` : null),
      render: (r) => (
        <span className={`text-[12px] ${r.paidBackOn ? 'text-etyme-verified' : r.leftCents ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
          {r.paybackSays}
        </span>
      ),
    },
  ]

  const courseCols: Column<Course>[] = [
    { key: 'title', label: 'Course', render: (r) => <span className="text-[13px] font-medium text-etyme-ink">{r.title}</span> },
    {
      key: 'seats', label: 'Seats', align: 'right',
      render: (r) => <span className="tabular-nums" title={`${r.finished} finished, ${r.dropped} dropped`}>{r.seats}</span>,
    },
    {
      key: 'costCents', label: 'What it cost', align: 'right', sortValue: (r) => r.costCents,
      render: (r) => <span className="tabular-nums" title={r.costSays}>{money(r.costCents, r.currency)}</span>,
    },
    { key: 'placed', label: 'Placed', align: 'right', render: (r) => <span className="tabular-nums">{r.placed}</span> },
    {
      key: 'medianDaysToPlace', label: 'Median days to place', align: 'right', sortValue: (r) => r.medianDaysToPlace,
      render: (r) => <span className="tabular-nums" title={r.speedSays}>{r.medianDaysToPlace ?? '—'}</span>,
    },
    {
      key: 'marginCents', label: 'Margin earned', align: 'right', sortValue: (r) => r.marginCents,
      render: (r) => <span className="tabular-nums" title={r.marginSays}>{money(r.marginCents, r.currency)}</span>,
    },
  ]

  const moveCols: Column<Move>[] = [
    { key: 'name', label: 'Person', render: (r) => <span className="text-[13px] font-medium text-etyme-ink">{r.name}</span> },
    { key: 'from', label: 'From', render: (r) => <span className="text-[12px]">{r.from ?? '—'}</span> },
    { key: 'to', label: 'To', render: (r) => <span className="text-[12px]">{r.to}</span> },
    {
      key: 'gapDays', label: 'Days between', align: 'right',
      render: (r) => <span className="tabular-nums" title={r.gapSays}>{r.gapDays ?? '—'}</span>,
    },
    {
      key: 'gapCostCents', label: 'Bench cost of the gap', align: 'right', sortValue: (r) => r.gapCostCents,
      render: (r) => <span className="tabular-nums" title={r.gapSays}>{money(r.gapCostCents, r.currency)}</span>,
    },
    {
      key: 'saved', label: 'What it saved', sortable: false,
      render: (r) => <span className="text-[12px] text-etyme-muted">{r.savedAgainstBenchSays} {r.savedAgainstSubVendorSays}</span>,
    },
  ]

  if (error) {
    return <p className="text-[13px] text-etyme-danger mb-6">{error}</p>
  }

  return (
    <div className="space-y-8 mb-8">
      <section>
        <h2 className="headline-serif text-[20px] text-etyme-ink mb-1">Bench to bill</h2>
        <p className="text-[13px] text-etyme-muted mb-1">
          What each person’s days on the bench cost, against the margin earned since they were placed.
        </p>
        {data && <p className="text-[12px] text-etyme-muted mb-3">Your bench pay policy: {data.policySays}</p>}
        {said && (
          <p role="status" className={`text-[13px] rounded border px-3 py-2 mb-3 ${said.ok ? 'border-etyme-verified/30 bg-etyme-verified/5' : 'border-etyme-attention/40 bg-etyme-attention/5'} text-etyme-ink`}>
            {said.text}
          </p>
        )}
        <ListSurface
          name="bench-profit-people"
          columns={personCols}
          data={data?.people ?? []}
          rowKey={(r) => r.personId}
          loading={loading}
          searchFilter={(r, q) => r.name.toLowerCase().includes(q) || (r.course ?? '').toLowerCase().includes(q)}
          searchPlaceholder="Search by name or course…"
          card={(r) => (
            <div className="space-y-1.5">
              <p className="text-[14px] font-medium text-etyme-ink">{r.name}</p>
              <p className="text-[12px] text-etyme-muted">
                {r.placedAt ? `Placed at ${r.placedAt}` : r.spell === 'NOW' ? 'On the bench now' : '—'}
                {r.course ? ` · ${r.course}` : ''}
              </p>
              <p className="text-[13px] text-etyme-ink">
                {r.days == null ? 'Days on the bench not on record' : `${r.days} ${r.days === 1 ? 'day' : 'days'} on the bench`}
                {' · '}Bench cost {money(r.costCents, r.currency)}
                {r.costCounted ? ` (${r.costCounted})` : ''}
              </p>
              {r.spell !== 'NOW' && <p className="text-[12px] text-etyme-muted">Margin since placed: {money(r.marginCents, r.currency)}</p>}
              <p className="text-[12px] text-etyme-muted">{r.paybackSays}</p>
              {turnsHolidays && <HolidaySwitchCell personId={r.personId} answer={r.holiday} onTurned={turned} />}
            </div>
          )}
          emptyMessage="Nobody on your bench yet."
          emptyDetail="A person appears here once they are on your bench, by their own listing or because you employ them."
          exportName="etyme-bench-profit"
        />
      </section>

      <section>
        <h2 className="headline-serif text-[20px] text-etyme-ink mb-1">By course</h2>
        <p className="text-[13px] text-etyme-muted mb-3">
          What each course cost, how many it placed, how fast, and the margin they earned.
        </p>
        <ListSurface
          name="bench-profit-courses"
          columns={courseCols}
          data={data?.courses ?? []}
          rowKey={(r) => r.courseId ?? r.title}
          loading={loading}
          emptyMessage="No courses yet."
          emptyDetail="Add a course under Training, with its price per seat, and enroll people in it."
          exportName="etyme-bench-profit-courses"
        />
      </section>

      {data?.utilization && (
        <section>
          <h2 className="headline-serif text-[20px] text-etyme-ink mb-1">Utilization</h2>
          <p className="text-[13px] text-etyme-ink mb-3">{data.utilization.says}</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Billing" value={data.utilization.billingPct == null ? '—' : `${data.utilization.billingPct}%`} tone="verified" />
            <Stat label="On the bench" value={data.utilization.benchPct == null ? '—' : `${data.utilization.benchPct}%`} tone="attention" />
            <Stat label="Starting soon" value={String(data.utilization.startingSoon)} />
            <Stat label="Not on the record" value={String(data.utilization.unknown)} />
          </div>
          <ListSurface
            name="bench-profit-projects"
            columns={[
              { key: 'project', label: 'Project', render: (r) => <span className="text-[13px]">{r.project}</span> },
              { key: 'billing', label: 'People billing', align: 'right', render: (r) => <span className="tabular-nums">{r.billing}</span> },
            ]}
            data={data.utilization.perProject}
            rowKey={(r) => r.project}
            emptyMessage="Nobody is billing on a project today."
          />
          <h3 className="text-[14px] font-medium text-etyme-ink mt-6 mb-2">Moves between your projects</h3>
          <ListSurface
            name="bench-profit-moves"
            columns={moveCols}
            data={data.moves}
            rowKey={(r) => `${r.personId}-${r.to}`}
            emptyMessage="No internal moves yet."
            emptyDetail="A move appears here once a manager places somebody from Our bench onto another project."
          />
        </section>
      )}

      {data && (
        <section className="text-[12px] text-etyme-muted space-y-1">
          <p className="stat-label text-[10px]">How these figures are worked out</p>
          {data.basis.map((b) => <p key={b}>{b}</p>)}
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'verified' | 'attention' }) {
  const color = tone === 'verified' ? 'text-etyme-verified' : tone === 'attention' ? 'text-etyme-attention' : 'text-etyme-ink'
  return (
    <div className="panel py-3 px-4">
      <div className="stat-label text-[9px] mb-1">{label}</div>
      <div className={`text-xl font-serif font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
