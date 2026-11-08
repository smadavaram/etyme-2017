'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { amount } from '@/lib/money-display'
import { ListSurface, type Column } from '@/components/list-surface'
import { RefusedState } from '@/components/ui'

/**
 * Your commissions (founder, 2026-11-08): the rows the Owner or a
 * Contract Manager set on the lines you sold or recruited, what each
 * earned this month, on which line, under which cap.
 *
 * Yours only. The firm's are under Payroll, Commissions (money's page).
 * A share of the margin is said without the margin unless your seat reads
 * margin on that placement; the route decides, and this page prints its
 * sentence.
 *
 * A page and not a menu entry: the menu is `etyme-architect`'s, and the
 * link into it is their ask.
 */

interface Row {
  id: string
  kind: string
  firm: string
  line: string
  basis: string
  rate: string
  thisPeriodCents: number | null
  currency: string | null
  cap: string
  capped: boolean
  state: string
  stateSays: string
  says: string
  withheldSays: string | null
}

const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function MyCommissionsPage() {
  const [month, setMonth] = useState(thisMonth())
  const [rows, setRows] = useState<Row[]>([])
  const [empty, setEmpty] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await readJson(await fetch(`/api/me/commissions?month=${encodeURIComponent(month)}`))
      setRows(body.data.rows)
      setEmpty(body.data.empty)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  if (error && !loading && rows.length === 0) return <RefusedState says={error} />

  const columns: Column<Row>[] = [
    { key: 'line', label: 'Line', render: (r) => <span>{r.line}<span className="block text-[12px] text-etyme-muted">{r.firm}</span></span> },
    { key: 'kind', label: 'Kind' },
    { key: 'rate', label: 'Rate', render: (r) => <span>{r.rate}<span className="block text-[12px] text-etyme-muted">{r.basis}</span></span> },
    {
      key: 'thisPeriodCents', label: 'This month', align: 'right',
      sortValue: (r) => r.thisPeriodCents,
      exportValue: (r) => r.thisPeriodCents == null ? '' : r.thisPeriodCents / 100,
      render: (r) => <span className="tabular-nums">{r.thisPeriodCents == null ? 'Not known yet' : amount(r.thisPeriodCents, r.currency ?? undefined)}</span>,
    },
    { key: 'cap', label: 'Cap' },
    { key: 'stateSays', label: 'Where it stands' },
    { key: 'says', label: 'Why', render: (r) => <span>{r.says}{r.withheldSays ? <span className="block text-[12px] text-etyme-muted">{r.withheldSays}</span> : null}</span> },
  ]

  return (
    <div className="max-w-5xl">
      <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">You</div>
      <h1 className="font-serif text-[28px] text-etyme-ink tracking-[-0.02em] mb-1">Your commissions</h1>
      <p className="text-sm text-etyme-muted mb-4 max-w-prose">
        What each commission set for you earned this month, on the line it is earned on, under its cap.
        It is earned on the weeks the firm above accepted, or when the bill is paid, as the line says.
      </p>
      <label className="text-[13px] text-etyme-ink mb-4 inline-flex items-center gap-2">
        Month
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value || thisMonth())}
          className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1 text-[13px]"
        />
      </label>
      <ListSurface
        name="my-commissions"
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        loading={loading}
        searchFilter={(r, q) => r.line.toLowerCase().includes(q) || r.kind.toLowerCase().includes(q)}
        searchPlaceholder="Search by person or client…"
        emptyMessage={empty ?? 'Nothing this month.'}
        exportName="etyme-my-commissions"
      />
    </div>
  )
}
