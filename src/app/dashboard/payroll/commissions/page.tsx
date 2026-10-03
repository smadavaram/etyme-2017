'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { ListSurface, type Column } from '@/components/list-surface'

/**
 * What a recruiter earned, and the run that posted it.
 *
 * The commission run has existed since commissions were built and
 * nothing in the app reached it — the only way in was the API, and the
 * only way to read the result was the database. So this is both halves:
 * the earnings, per person per month, and the button that runs a period.
 *
 * A posting is the record. This reads postings rather than recomputing,
 * because what somebody was actually paid and what the rules say they
 * should have been are two different questions, and a page that answers
 * the second while claiming to answer the first is worse than no page.
 */

interface Earning {
  personId: string | null
  name: string
  period: string
  amountCents: number
  currency: string
  lines: { says: string; amountCents: number; order: string }[]
}

const cash = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const monthName = (p: string) =>
  new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function CommissionsPage() {
  const [earnings, setEarnings] = useState<Earning[]>([])
  const [summary, setSummary] = useState('')
  const [mayRun, setMayRun] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await readJson(await fetch('/api/payroll/commissions'))
      setEarnings(body.data.earnings)
      setSummary(body.data.summary)
      setMayRun(body.data.mayRun)
      setError(null)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function run() {
    setBusy(true)
    setSaid(null)
    try {
      const body = await readJson(await fetch('/api/payroll/commissions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ periodStart: from, periodEnd: to }),
      }))
      setSaid(body.data.says)
      await load()
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  const columns: Column<Earning>[] = useMemo(() => [
    { key: 'name', label: 'Who', render: (e) => <span className="text-etyme-ink">{e.name}</span>, sortValue: (e) => e.name },
    { key: 'period', label: 'Period', render: (e) => <span className="text-etyme-muted">{monthName(e.period)}</span>, sortValue: (e) => e.period },
    { key: 'lines', label: 'Placements', align: 'right', render: (e) => <span className="tabular-nums text-etyme-muted">{e.lines.length}</span>, sortValue: (e) => e.lines.length, hideOnMobile: true },
    { key: 'amountCents', label: 'Earned', align: 'right', render: (e) => <span className="tabular-nums">{cash(e.amountCents)}</span>, sortValue: (e) => e.amountCents },
  ], [])

  return (
    <div className="mx-auto max-w-[980px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Money</p>
        <h1 className="headline-serif text-[30px] leading-tight">Commissions</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-etyme-muted">
          What each person earned on the placements they are on a commission agreement for.
          Read from what was actually posted, not recalculated — so this says what was paid,
          not what a rule thinks should have been.
        </p>
      </header>

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      {mayRun && (
        <form className="panel flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run() }}>
          <label className="block">
            <span className="lbl">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
          </label>
          <label className="block">
            <span className="lbl">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
          </label>
          <button type="submit" disabled={busy || !from || !to}
            className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
            {busy ? 'Running…' : 'Run the period'}
          </button>
          <p className="text-[12px] text-etyme-muted">
            Posts once per person per period, under the cap. Running the same period twice
            adds nothing.
          </p>
        </form>
      )}

      {said && <div className="panel"><p className="text-[13px] text-etyme-ink">{said}</p></div>}
      {error && <div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div>}
      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {!loading && earnings.length > 0 && (
        <ListSurface<Earning>
          name="commissions"
          defaultView="feed"
          columns={columns}
          data={earnings}
          rowKey={(e) => `${e.personId ?? 'none'}:${e.period}`}
          searchPlaceholder="Search by name…"
          searchFilter={(e, q) => e.name.toLowerCase().includes(q.toLowerCase())}
          exportName="commissions"
          emptyMessage="Nothing earned in this period."
          card={(e) => (
            <article className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{e.name}</p>
                  <p className="text-[12px] text-etyme-faint">{monthName(e.period)}</p>
                </div>
                <p className="font-serif text-[22px] tabular-nums text-etyme-ink">{cash(e.amountCents)}</p>
              </div>
              <button
                onClick={() => setOpen(open === `${e.personId}:${e.period}` ? null : `${e.personId}:${e.period}`)}
                className="mt-2 text-[12px] text-etyme-muted hover:text-etyme-ink"
              >
                {open === `${e.personId}:${e.period}` ? 'Hide' : `What it came from (${e.lines.length})`}
              </button>
              {open === `${e.personId}:${e.period}` && (
                <div className="mt-2 space-y-1 border-t border-etyme-rule pt-2">
                  {e.lines.map((l, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="text-etyme-muted">{l.says || l.order}</span>
                      <span className="tabular-nums text-etyme-ink">{cash(l.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}
        />
      )}

      {!loading && earnings.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing posted yet. {mayRun ? 'Pick a period above and run it.' : 'Whoever runs payroll here can run a period.'}
          </p>
        </div>
      )}
    </div>
  )
}
