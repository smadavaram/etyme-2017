'use client'

import { usePageSection } from '@/components/page-section'
import { useEffect, useState } from 'react'

/**
 * Their books, fed from ours. Export once, stamped as sent; reconcile
 * with every break named.
 */

export default function IntegrationsPage() {
  const section = usePageSection('/dashboard/integrations')
  const [data, setData] = useState<any>(null)
  const [runs, setRuns] = useState<any[]>([])
  const [system, setSystem] = useState('QUICKBOOKS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [statement, setStatement] = useState('')
  const [recon, setRecon] = useState<any>(null)
  // A refusal is the page: its sentence alone, never beside the
  // reconcile form (sign-up walk, round five, problem 10).
  const [refused, setRefused] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [e, r] = await Promise.all([
        fetch('/api/integrations/export'),
        fetch('/api/integrations/reconcile'),
      ])
      const eb = await e.json()
      const rb = await r.json()
      if (e.status === 403 || r.status === 403) {
        setRefused((e.status === 403 ? eb : rb).error?.message ?? 'Integrations are not part of your seat. Ask your company’s owner if you need them.')
        return
      }
      if (!e.ok) throw new Error(eb.error?.message ?? `HTTP ${e.status}`)
      setData(eb.data)
      setRuns(rb.data?.runs ?? [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function doExport() {
    setNote(null)
    const res = await fetch('/api/integrations/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system }),
    })
    const body = await res.json()
    if (!res.ok) {
      setNote(body.error?.message ?? 'Export refused.')
      return
    }
    setNote(body.data.says)
    if (body.data.csv) {
      const blob = new Blob([body.data.csv], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `etyme-journal-${system.toLowerCase()}.csv`
      a.click()
    }
    load()
  }

  async function doReconcile() {
    setNote(null)
    // One line per row: amount,date,ref — the shape a bank or AP
    // statement pastes as.
    const theirs = statement
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [amount, on, ref] = l.split(',').map((x) => x.trim())
        return { amount: Number(amount), on, ref: ref || null }
      })
      .filter((t) => Number.isFinite(t.amount))

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const res = await fetch('/api/integrations/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodStart: start.toISOString(),
        periodEnd: now.toISOString(),
        theirs,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      setNote(body.error?.message ?? 'Could not reconcile.')
      return
    }
    setRecon(body.data)
    load()
  }

  if (refused) {
    return <p className="mx-auto max-w-[900px] px-4 py-8 text-[14px] text-etyme-muted">{refused}</p>
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <header>
        {section && <p className="eyebrow">{section}</p>}
        <h1 className="headline-serif text-[30px] leading-tight">Integrations</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-etyme-muted">
          The journal exports once and is stamped as sent — a re-export is a
          double posting somebody&rsquo;s auditor finds. Reconciliation names
          every break, because a bare difference gets redone next month from
          zero.
        </p>
      </header>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}
      {error && (
        <div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div>
      )}
      {note && <p className="text-[13px] text-etyme-ink">{note}</p>}

      {data && (
        <article className="panel">
          <h2 className="text-[15px] font-semibold text-etyme-ink">Send to your accounting system</h2>
          <p className="mt-1 text-[13px] text-etyme-muted">
            {data.pending} entr{data.pending === 1 ? 'y' : 'ies'} waiting · {data.sent} already sent
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              className="rounded-lg border border-etyme-rule bg-white px-3 py-2 text-sm"
            >
              {data.systems.map((s: any) => (
                <option key={s.system} value={s.system}>
                  {s.system} {s.mappedAccounts > 0 ? `(${s.mappedAccounts} accounts mapped)` : '(nothing mapped yet)'}
                </option>
              ))}
            </select>
            <button onClick={doExport} className="btn-primary text-[13px]" disabled={data.pending === 0}>
              Export {data.pending > 0 ? `${data.pending} entries` : '— nothing waiting'}
            </button>
          </div>
        </article>
      )}

      {data && (
      <article className="panel">
        <h2 className="text-[15px] font-semibold text-etyme-ink">Reconcile against a statement</h2>
        <p className="mt-1 text-[13px] text-etyme-muted">
          Paste their lines, one per row: amount, date, reference. Example:{' '}
          <code className="text-[12px]">3800.00, 2026-08-31, IN_ABC123_001</code>
        </p>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={5}
          className="mt-3 w-full rounded-lg border border-etyme-rule px-3 py-2 font-mono text-[12px]"
          placeholder="3800.00, 2026-08-31, IN_ABC123_001"
        />
        <button onClick={doReconcile} className="btn-primary mt-3 text-[13px]" disabled={!statement.trim()}>
          Reconcile
        </button>

        {recon && (
          <div className="mt-4 border-t border-etyme-rule pt-3">
            <p className="text-[13px] text-etyme-ink">{recon.says}</p>
            <ul className="mt-2 space-y-1">
              {recon.breaks.map((b: any, i: number) => (
                <li key={i} className="text-[12px] text-etyme-muted">
                  {b.says}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
      )}

      {runs.length > 0 && (
        <article className="panel">
          <h2 className="text-[15px] font-semibold text-etyme-ink">Past reconciliations</h2>
          <ul className="mt-2 space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-3 text-[13px]">
                <span className="text-etyme-ink">{r.against}</span>
                <span className="text-etyme-faint">{r.period}</span>
                <span
                  className="tabular-nums"
                  style={{ color: r.differenceCents === 0 ? 'var(--color-verified)' : 'var(--color-attention)' }}
                >
                  {r.differenceCents === 0
                    ? 'to the cent'
                    : `$${Math.abs(r.differenceCents / 100).toLocaleString()} apart · ${(r.breaks as any[]).length} breaks named`}
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  )
}
