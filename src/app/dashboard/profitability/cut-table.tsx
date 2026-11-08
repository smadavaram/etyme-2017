'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { compact } from '@/lib/money-display'
import { ListSurface } from '@/components/list-surface'
import type { Column } from '@/components/data-table'
import { ErrorState, FilterChips, LoadingState, RefusedState } from '@/components/ui'
import { CUTS, CUT_HEADING, type Cut, type CutLine, type CutOption, type Period } from '@/lib/money/profit-cut'

/**
 * The founder's Profitability table ("One app, two tabs", 2026-11-08):
 * cut by Consultant, Office or Client, for this month or the quarter,
 * Billed · Paid · Margin · Margin %, under "Margin before admin cost and
 * commission". Every figure is the route's (`by=cut`), which adds up the
 * margin service's own figures; this screen computes nothing.
 *
 * Recruiter is in the drawing and not offered as a chip, because a chip
 * with nothing behind it is not offered: the record does not say who
 * recruited a placement. The route's sentence says so under the chips.
 */

const CUT_WORD: Record<Cut, string> = {
  consultant: 'Consultant', recruiter: 'Recruiter', office: 'Office', client: 'Client',
}

export function CutTable() {
  const [cut, setCut] = useState<Cut>('consultant')
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [question, setQuestion] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/profitability?by=cut&cut=${cut}&period=${period}`)
      if (res.status === 403) {
        const body = await res.json().catch(() => null)
        setRefused(body?.error?.message ?? 'You may not read what placements earn.')
        setData(null)
        return
      }
      const body = await readJson(res)
      setRefused(null)
      setData(body.data)
      setQuestion(body.data?.ask ?? '')
      setError(null)
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [cut, period])

  useEffect(() => { load() }, [load])

  if (refused) return <RefusedState says={refused} />

  const cuts: readonly CutOption[] = CUTS
  const offered = cuts.filter((c) => !c.cannotBecause)
  const notOffered = cuts.filter((c) => c.cannotBecause)
  const cur = (l: CutLine) => l.currency ?? undefined
  const money = (cents: number | null, l: CutLine) => (cents == null ? '—' : compact(cents, cur(l)))

  const columns: Column<CutLine>[] = [
    { key: 'label', label: CUT_WORD[cut], render: (l) => (
      <span>
        {l.label}
        {l.blankedBecause && <span className="block text-[11.5px] text-etyme-muted">{l.blankedBecause}</span>}
      </span>
    ), exportValue: (l) => l.label },
    { key: 'billedCents', label: 'Billed', align: 'right', render: (l) => money(l.billedCents, l), exportValue: (l) => l.billedCents == null ? null : l.billedCents / 100 },
    { key: 'paidCents', label: 'Paid', align: 'right', render: (l) => money(l.paidCents, l), exportValue: (l) => l.paidCents == null ? null : l.paidCents / 100 },
    { key: 'marginCents', label: 'Margin', align: 'right', render: (l) => (
      <span className={l.marginCents != null && l.marginCents < 0 ? 'text-etyme-attention' : ''}>{money(l.marginCents, l)}</span>
    ), exportValue: (l) => l.marginCents == null ? null : l.marginCents / 100 },
    { key: 'marginPct', label: 'Margin %', align: 'right', render: (l) => (l.marginPct == null ? '—' : `${l.marginPct}%`) },
  ]

  const total: CutLine | null = data?.total ?? null

  return (
    <section className="space-y-3">
      <FilterChips<Cut>
        label="Cut by"
        options={offered.map((c) => ({ key: c.key, label: c.label }))}
        value={cut}
        onChange={setCut}
        end={
          <FilterChips<Period>
            label="When"
            options={[{ key: 'month', label: 'This month' }, { key: 'quarter', label: 'Quarter' }]}
            value={period}
            onChange={setPeriod}
          />
        }
      />
      {notOffered.map((c) => (
        <p key={c.key} className="text-[12.5px] text-etyme-muted">By {c.label.toLowerCase()}: {c.cannotBecause}</p>
      ))}

      <div className="panel space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-medium text-etyme-ink">{CUT_HEADING}</h2>
          {data?.periodSays && <span className="text-[12.5px] text-etyme-muted">{data.periodSays}</span>}
        </div>

        {loading && <LoadingState says="Adding up what each one made…" />}
        {error && <ErrorState says={error} />}

        {data && !loading && (
          <>
            <ListSurface<CutLine>
              name="profitability-cut"
              columns={columns}
              data={data.lines ?? []}
              rowKey={(l) => l.key}
              searchable={false}
              exportName={`profitability-${cut}-${period}`}
              emptyMessage={data.says}
            />
            {total && (
              <p className="text-[13px] tabular-nums text-etyme-ink">
                Your firm: {money(total.billedCents, total)} billed, {money(total.paidCents, total)} paid,{' '}
                {money(total.marginCents, total)} margin{total.marginPct == null ? '' : ` (${total.marginPct}%)`}.
              </p>
            )}
            <p className="text-[12.5px] text-etyme-muted">{data.says}</p>
            <p className="text-[12.5px] text-etyme-muted">
              Billed is the weeks both sides signed, at your rate. Paid is what those weeks cost you: pay,
              overtime and, for your own employees, the employer’s taxes. {data.adminCostSays}
            </p>
          </>
        )}
      </div>

      {/* Ask Etyme cuts the same table any way you ask. */}
      <div className="panel flex flex-wrap items-center gap-2">
        <label htmlFor="ask-about-table" className="text-[13px] text-etyme-muted">Ask about this table:</label>
        <input
          id="ask-about-table"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="input min-w-[220px] flex-1 text-[13px]"
        />
        <Link
          href={`/dashboard/conversations?ask=${encodeURIComponent(question)}` as Route}
          className="rounded-lg bg-etyme-action px-3 py-1.5 text-[13px] font-medium text-white"
        >
          Ask Etyme
        </Link>
      </div>
    </section>
  )
}
