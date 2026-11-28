'use client'

import { ListSurface, type Column } from '@/components/list-surface'
import {
  sampleRows, sampleStats, sampleWeek, sampleCheck, SAMPLE_CLIENT, SAMPLE_LIMIT_MONTHS, type SampleRow,
} from './sample-desk'

/**
 * The sample program, drawn with the product's own list.
 *
 * The contractors are a `ListSurface` — the same component every list in
 * the product uses, with its table and feed, its search and its paging —
 * fed the rows `./sample-desk` computes from the world seed. The numbers
 * over it are counts of those rows; the week and the invoice receipt are
 * the seed's own (see `./sample-desk`). Every word that says "sample"
 * is on the frame, so a reader cannot see the table without the label.
 */

/** The label on the frame. The home page test holds it word for word. */
export const SAMPLE_LABEL = 'Sample data from the demo'

const COLUMNS: Column<SampleRow>[] = [
  {
    key: 'person',
    label: 'Contractor',
    render: (r) => (
      <span>
        <span className="block font-medium text-etyme-ink">{r.person}</span>
        <span className="block text-[12px] text-etyme-muted">{r.job}</span>
      </span>
    ),
    sortValue: (r) => r.person,
  },
  { key: 'supplier', label: 'Supplier' },
  {
    key: 'rate',
    label: 'Rate',
    align: 'right',
    render: (r) => <span className="tabular-nums">{r.rate}</span>,
    sortValue: (r) => r.rateCents,
  },
  {
    key: 'onSite',
    label: `Time on site · limit ${SAMPLE_LIMIT_MONTHS} months`,
    render: (r) => (
      <span className="tabular-nums">
        {r.onSite}
        {r.suppliers > 1 && (
          <span className="block text-[12px] text-etyme-muted">{`across ${r.suppliers} suppliers`}</span>
        )}
      </span>
    ),
    sortValue: (r) => r.days,
  },
  {
    key: 'status',
    label: 'Status',
    render: (r) => <span className={`chip chip--${r.tone}`}>{r.status}</span>,
  },
]

export function SampleDesk() {
  const rows = sampleRows()
  const stats = sampleStats(rows)
  const week = sampleWeek()
  const check = sampleCheck()

  return (
    <div className="overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-surface shadow-lift">
      {/* The window bar: whose desk this is, and that it is a sample. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-etyme-rule bg-etyme-raised px-4 py-3 md:px-5">
        <p className="text-[13px] font-medium text-etyme-ink">
          {`Program dashboard · ${SAMPLE_CLIENT}`}
        </p>
        <span className="chip chip--action">{SAMPLE_LABEL}</span>
      </div>

      <div className="space-y-4 p-4 md:space-y-5 md:p-5">
        {/* Three short numbers, three across even at 375: each is one
            figure under a two-word label, and a column each would push the
            list below the fold. */}
        <dl className="grid grid-cols-3 gap-2 md:gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-panel border border-etyme-rule bg-etyme-raised px-3 py-2.5 md:px-4 md:py-3">
              <dt className="stat-label">{s.label}</dt>
              <dd className="mt-1 font-serif text-[26px] leading-none tabular-nums text-etyme-ink md:text-[32px]">{s.value}</dd>
            </div>
          ))}
        </dl>

        <ListSurface
          name="home-sample-contractors"
          columns={COLUMNS}
          data={rows}
          rowKey={(r) => r.person}
          searchPlaceholder="Search contractors or suppliers"
          searchFilter={(r, q) => `${r.person} ${r.job} ${r.supplier}`.toLowerCase().includes(q)}
          pageSizes={[10]}
          defaultPageSize={10}
          feedOmit={['status']}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* A week waiting for a signature. */}
          <section aria-label="A week waiting for approval" className="rounded-panel border border-etyme-rule bg-etyme-raised p-4">
            <p className="stat-label">Week waiting for your signature</p>
            <p className="mt-1.5 text-[14px] font-medium text-etyme-ink">
              {`${week.person} · ${week.supplier}`}
            </p>
            {/* A week is seven days, Sunday to Saturday, read across. */}
            <ol className="mt-3 grid grid-cols-7 gap-1 text-center">
              {week.days.map((d) => (
                <li key={d.d} className={`rounded-md border border-etyme-rule py-1.5 ${d.h === 0 ? 'bg-etyme-canvas text-etyme-faint' : 'bg-etyme-surface text-etyme-ink'}`}>
                  <span className="block text-[10.5px] uppercase tracking-[0.06em] text-etyme-muted">{d.d}</span>
                  <span className="block text-[14px] tabular-nums">{d.h}</span>
                </li>
              ))}
            </ol>
            {week.flag && (
              <p className="mt-3 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 px-3 py-2 text-[13px] leading-snug text-etyme-attention">
                {week.flag}
              </p>
            )}
            <a href="/demo" className="mt-3 inline-block text-[13px] font-medium text-etyme-action underline-offset-4 hover:underline focus-visible:underline">
              Sign it in the demo →
            </a>
          </section>

          {/* One invoice receipt, checked three ways. */}
          <section aria-label="One invoice receipt, checked" className="rounded-panel border border-etyme-rule bg-etyme-raised p-4">
            <p className="stat-label">Invoice receipt · the three-way check</p>
            <p className="mt-1.5 text-[14px] font-medium text-etyme-ink">
              {`${check.supplier} · ${check.person}`}
            </p>
            <dl className="mt-3 divide-y divide-etyme-rule border-y border-etyme-rule text-[13px]">
              {check.lines.map((l) => (
                <div key={l.label} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-etyme-muted">{l.label}</dt>
                  <dd className="flex items-center gap-2 tabular-nums text-etyme-ink">
                    {l.value}
                    <span className={`chip ${l.ok ? 'chip--verified' : 'chip--attention'}`}>{l.ok ? 'Agrees' : 'Differs'}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] font-medium text-etyme-verified">{check.says}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
