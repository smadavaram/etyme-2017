'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readJson } from '@/lib/read-response'
// Both from list-surface, which re-exports the type for exactly this
// reason: a page that reaches into data-table directly is one that
// draws a table with no feed, and the invariant reads the import.
import { ListSurface, type Column } from '@/components/list-surface'
import type { View } from '@/components/network-view'

/**
 * What is left of the budget, and what every contract is doing to it.
 *
 * The client's money screen. A supplier reads revenue and margin; a
 * client has neither. They have an amount their cost center was given,
 * contracts committed against it, work they have accepted, and the
 * difference — which is the only number anybody opens this page for.
 *
 * Four words across the top, in the order the money moves:
 *
 *   Budget      what this cost center may spend
 *   Committed   signed and not yet worked
 *   Spent       work accepted — a cost whether or not it is paid
 *   Left        budget − committed − spent
 *
 * Paid and to-pay sit *under* Spent rather than beside it, because the
 * same week must never be counted in two columns.
 */

interface Line {
  contractId: string
  personName: string
  supplierName: string
  committedCents: number
  actualCents: number
  toPayCents: number
  paidCents: number
  totalCents: number
  says: string
}

interface Center {
  costCenterId: string
  code: string
  name: string
  unit: string | null
  owner: string | null
  ownerId: string | null
  period: string
  approvedHeads: number | null
  budgetCents: number | null
  committedCents: number
  actualCents: number
  toPayCents: number
  paidCents: number
  availableCents: number | null
  usedShare: number | null
  lines: Line[]
  says: string
  unknowns: string[]
}

function cash(cents: number | null): string {
  if (cents == null) return '—'
  const d = cents / 100
  const sign = d < 0 ? '−' : ''
  const n = Math.abs(d)
  if (n >= 1000) return `${sign}$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${sign}$${Math.round(n)}`
}

export default function BudgetPage() {
  const [centers, setCenters] = useState<Center[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [period, setPeriod] = useState('')
  const [me, setMe] = useState('')
  const [anywhere, setAnywhere] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('feed')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await readJson(await fetch('/api/program/budget'))
      setCenters(body.data.centers)
      setSummary(body.data.summary)
      setPeriod(body.data.period)
      setMe(body.data.me)
      setAnywhere(body.data.mayBudgetAnywhere)
      setError(null)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const mayBudget = (c: Center) => anywhere || c.ownerId === me

  async function save(c: Center) {
    setBusy(true)
    try {
      const body = await readJson(await fetch('/api/program/budget', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ costCenterId: c.costCenterId, period, annualBudget: Number(amount) }),
      }))
      setSaid(body.data.says)
      setEditing(null)
      setAmount('')
      await load()
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  const columns: Column<Center>[] = useMemo(() => [
    {
      key: 'code', label: 'Cost center', sortValue: (c) => c.code,
      render: (c) => (
        <div>
          <p className="text-etyme-ink">{c.code}</p>
          <p className="text-[11px] text-etyme-faint">{c.name}{c.owner ? ` · ${c.owner}` : ''}</p>
        </div>
      ),
    },
    { key: 'budgetCents', label: 'Budget', align: 'right', sortValue: (c) => c.budgetCents ?? -1, render: (c) => <span className="tabular-nums">{cash(c.budgetCents)}</span> },
    { key: 'committedCents', label: 'Committed', align: 'right', sortValue: (c) => c.committedCents, render: (c) => <span className="tabular-nums">{cash(c.committedCents)}</span> },
    { key: 'actualCents', label: 'Spent', align: 'right', sortValue: (c) => c.actualCents, render: (c) => <span className="tabular-nums">{cash(c.actualCents)}</span> },
    {
      key: 'availableCents', label: 'Left', align: 'right', sortValue: (c) => c.availableCents ?? 0,
      render: (c) => (
        <span className={`tabular-nums ${c.availableCents != null && c.availableCents < 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
          {cash(c.availableCents)}
        </span>
      ),
    },
    { key: 'lines', label: 'Contracts', align: 'right', sortValue: (c) => c.lines.length, render: (c) => <span className="tabular-nums text-etyme-muted">{c.lines.length}</span>, hideOnMobile: true },
    {
      // Both views have to be able to do the thing the page is for.
      // Without this the table listed budgets and offered no way to set
      // one, which is a dead end for anybody whose remembered choice
      // was the table.
      key: 'set', label: '', align: 'right',
      render: (c) => mayBudget(c)
        ? <button onClick={(e) => { e.stopPropagation(); setEditing(c.costCenterId); setAmount(c.budgetCents != null ? String(Math.round(c.budgetCents / 100)) : ''); setView('feed') }}
            className="text-[11px] text-etyme-action hover:underline">
            {c.budgetCents == null ? 'Set budget' : 'Change'}
          </button>
        : null,
    },
  ], [anywhere, me])

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Governance</p>
        <h1 className="headline-serif text-[30px] leading-tight">Budget</h1>
        <p className="mt-2 max-w-[62ch] text-[13px] text-etyme-muted">
          What each cost center may spend this period, what is committed against it, and what
          is left. You buy contract labor — there is no bill here, only your own plan and what
          it is being drawn down by.
        </p>
      </header>

      {summary && (
        <section className="grid grid-cols-2 gap-4 border-y border-etyme-rule py-4 sm:grid-cols-4">
          {[
            ['Budget', cash(summary.budgetCents), `${period}`],
            ['Committed', cash(summary.committedCents), 'signed, not yet worked'],
            ['Spent', cash(summary.actualCents), 'work you accepted'],
            ['Left', cash(summary.budgetCents == null ? null : summary.budgetCents - summary.committedCents - summary.actualCents), 'budget less both'],
          ].map(([label, value, note]) => (
            <div key={label}>
              <p className="stat-label">{label}</p>
              <p className="font-serif text-[26px] leading-none tabular-nums text-etyme-ink">{value}</p>
              <p className="mt-1 text-[11px] text-etyme-faint">{note}</p>
            </div>
          ))}
        </section>
      )}

      {summary && (summary.toPayCents > 0 || summary.paidCents > 0) && (
        <p className="text-[12.5px] text-etyme-muted">
          Of the {cash(summary.actualCents)} you have accepted, {cash(summary.paidCents)} is paid
          and {cash(summary.toPayCents)} is invoiced and still to pay. The rest is work signed for
          that nobody has billed you for yet — a cost you have already incurred.
        </p>
      )}

      {summary?.withoutBudget > 0 && (
        <p className="text-[12.5px] text-etyme-attention">
          {summary.withoutBudget} cost {summary.withoutBudget === 1 ? 'center has' : 'centers have'} no
          budget set for {period}, so there is nothing to measure their spend against.
        </p>
      )}

      {said && <div className="panel"><p className="text-[13px] text-etyme-ink">{said}</p></div>}
      {error && <div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div>}
      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {!loading && centers.length > 0 && (
        <ListSurface<Center>
          name="program-budget"
          // A handful of cost centers read as a decision, not a
          // register, so the feed is the door — and it is where the
          // reasoning and the per-contract detail live.
          defaultView="feed"
          view={view}
          onView={setView}
          columns={columns}
          data={centers}
          rowKey={(c) => c.costCenterId}
          searchPlaceholder="Search by code, name or owner…"
          searchFilter={(c, q) => `${c.code} ${c.name} ${c.owner ?? ''}`.toLowerCase().includes(q.toLowerCase())}
          exportName="budget"
          emptyMessage="No cost centers yet."
          card={(c) => (
            <article className="panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{c.code} <span className="font-normal text-etyme-muted">{c.name}</span></p>
                  <p className="text-[12px] text-etyme-faint">
                    {c.unit ? `${c.unit} · ` : ''}{c.owner ? `${c.owner} owns it` : 'Nobody named as owner'}
                  </p>
                </div>
                {c.availableCents != null && (
                  <span className={`chip ${c.availableCents < 0 ? 'chip--attention' : c.usedShare != null && c.usedShare >= 0.9 ? 'chip--attention' : 'chip--verified'}`}>
                    {cash(c.availableCents)} left
                  </span>
                )}
              </div>

              <p className={`mt-2 text-[13px] ${c.availableCents != null && c.availableCents < 0 ? 'text-etyme-attention' : 'text-etyme-muted'}`}>{c.says}</p>

              {c.usedShare != null && (
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-etyme-canvas" role="img"
                  aria-label={`${Math.round(Math.min(c.usedShare, 1) * 100)} per cent of the budget committed or spent`}>
                  <div className="h-full" style={{ width: `${Math.min(c.usedShare, 1) * 100}%`, background: c.usedShare > 1 ? 'var(--etyme-attention, #C0622E)' : 'var(--etyme-action, #2B47E5)' }} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px]">
                {mayBudget(c) && (editing === c.costCenterId ? (
                  <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(c) }}>
                    <label className="flex items-center gap-1">
                      <span className="lbl">Budget for {period}</span>
                      <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                        placeholder="250000" className="w-28 rounded border border-etyme-rule px-2 py-1 text-[12px]" />
                    </label>
                    <button type="submit" disabled={busy || !amount.trim()} className="rounded bg-etyme-action px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Set</button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[11px] text-etyme-muted">Not now</button>
                  </form>
                ) : (
                  <button onClick={() => { setEditing(c.costCenterId); setAmount(c.budgetCents != null ? String(Math.round(c.budgetCents / 100)) : '') }}
                    className="text-etyme-action hover:underline">
                    {c.budgetCents == null ? `Set a budget for ${period}` : 'Change the budget'}
                  </button>
                ))}
                {c.lines.length > 0 && (
                  <button onClick={() => setOpen(open === c.costCenterId ? null : c.costCenterId)} className="text-etyme-muted hover:text-etyme-ink">
                    {open === c.costCenterId ? 'Hide' : `Every contract (${c.lines.length})`}
                  </button>
                )}
              </div>

              {open === c.costCenterId && (
                <div className="mt-3 space-y-1 border-t border-etyme-rule pt-3">
                  {c.lines.map((l) => (
                    <div key={l.contractId} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="text-etyme-ink">{l.personName} <span className="text-etyme-faint">· {l.supplierName}</span></span>
                      <span className="tabular-nums text-etyme-muted">
                        {cash(l.actualCents)} spent{l.committedCents > 0 && ` · ${cash(l.committedCents)} to run`}
                        {l.toPayCents > 0 && ` · ${cash(l.toPayCents)} to pay`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {c.unknowns.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-[11.5px] text-etyme-faint">
                  {c.unknowns.map((u) => <li key={u}>{u}</li>)}
                </ul>
              )}
            </article>
          )}
        />
      )}

      {!loading && centers.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            No cost centers yet. Add them under Program team, then set a budget against each.
          </p>
        </div>
      )}
    </div>
  )
}
