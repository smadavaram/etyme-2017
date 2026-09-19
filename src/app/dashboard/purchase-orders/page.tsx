'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback } from 'react'
import { ListSurface, type Column } from '@/components/list-surface'
import { lineName, lineDoes, type LineSide, type OrderSide } from '@/lib/order-naming'

/**
 * What has been authorized, and how much of it is left.
 *
 * Purchase orders were read in five places and created in none. The three
 * way match asks whether an invoice quotes a valid, open, unexhausted
 * purchase order — so on a real company with no way to raise one, that
 * check could only ever fail, and the money chain stopped at the first
 * customer who was not seeded.
 *
 * A purchase order running out is invisible until a supplier chases a
 * payment that will not match, so the ones near their ceiling lead.
 */

/** One line on the document: a person, at a site, at a rate. */
interface POLine {
  id: string
  side: LineSide
  personName: string
  siteName: string | null
  /** Cents per hour. */
  rate: number
  currency: string
  state: string
  startDate: string
  endDate: string | null
  /** Whole currency, billed against the ceiling. Null on a buy line. */
  billed: number | null
  /** The firm we pay on a buy line. Null where we employ them. */
  paidToName: string | null
}

interface PO {
  id: string
  number: string
  /** What this reader calls it: "purchase order" or "sales order". */
  noun: string
  /** PO · SO. One row, read from whichever end you stand at. */
  short: string
  /** Their number, or ours where we kept one. */
  reference: string
  /** Said out loud where the other end has not joined. */
  offSystem: string | null
  direction: 'issued' | 'received'
  counterparty: { id: string; name: string }
  currency: string
  amount: number
  invoiced: number
  remaining: number
  consumedPercent: number
  overdrawn: boolean
  expired: boolean
  canInvoice: boolean
  reason: string
  status: string
  startDate: string
  endDate: string | null
  contractsAgainst: number
  /** BUYER · SELLER · BYSTANDER — which end of it the reader is at. */
  side: OrderSide
  lines: POLine[]
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function money(n: number, ccy: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n)
}

/** The bar. Clay once it is nearly gone, because that is when it matters. */
function Consumed({ po }: { po: PO }) {
  const pct = Math.min(100, po.consumedPercent)
  const tone = po.overdrawn || po.expired
    ? 'bg-etyme-attention'
    : pct >= 90
      ? 'bg-etyme-attention'
      : 'bg-etyme-action'
  return (
    <div className="w-full h-1.5 bg-etyme-rule rounded-full overflow-hidden">
      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PO[] | null>(null)
  const [canRaise, setCanRaise] = useState(false)
  const [needsAttention, setNeedsAttention] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])

  const [number, setNumber] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [amount, setAmount] = useState('')
  const [endDate, setEndDate] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/purchase-orders')
      const body = await readJson(res)
      setPos(body.data.orders)
      setCanRaise(body.data.canRaise)
      setNeedsAttention(body.data.needsAttention)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!adding) return
    fetch('/api/companies')
      .then((r) => r.json())
      .then((b) => setSuppliers((b.data?.companies ?? []).filter((c: any) => c.kind !== 'CLIENT')))
      .catch(() => setSuppliers([]))
  }, [adding])

  async function raise() {
    setBusy(true); setError(null); setFlash(null)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          issuedToId: supplierId,
          amount: Number(amount),
          endDate: endDate || null,
        }),
      })
      const body = await readJson(res)
      setFlash(body.data.message)
      setNumber(''); setSupplierId(''); setAmount(''); setEndDate(''); setAdding(false)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!pos) {
    return <p className="text-etyme-muted text-sm">{error ?? 'Loading…'}</p>
  }

  const attention = pos.filter((p) => p.overdrawn || p.expired || p.consumedPercent >= 90)
  const rest = pos.filter((p) => !attention.includes(p))

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>What you have authorized</h1>
          <p>
            One document, a header and its lines. The header is the ceiling — what a supplier may
            bill you in total, and an invoice that quotes an exhausted one will not match. Each
            line is one person, at one rate, at one site.
          </p>
        </div>
        {canRaise && (
          <button
            onClick={() => setAdding(!adding)}
            className="btn-secondary text-[13px] mt-3 shrink-0"
          >
            {adding ? 'Cancel' : 'Raise one'}
          </button>
        )}
      </div>

      {flash && (
        <div className="mb-5 rounded-md border border-etyme-verified/30 bg-etyme-verified/5 p-3">
          <p className="text-[13px] text-etyme-verified">{flash}</p>
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 p-3">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {adding && (
        <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
          <h2 className="font-serif text-[19px] text-etyme-ink mb-4 tracking-[-0.02em]">Raise a purchase order</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <Lbl>Number your finance team will recognize</Lbl>
              <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="PO-2026-0412"
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
            </label>
            <label className="block">
              <Lbl>Supplier</Lbl>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm">
                <option value="">Choose…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <Lbl>Authorized amount</Lbl>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="250000"
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm tabular-nums" />
            </label>
            <label className="block">
              <Lbl>Runs until (optional)</Lbl>
              <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date"
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            </label>
          </div>
          <p className="text-[12px] text-etyme-muted mt-3">
            Any contract already running with this supplier and no purchase order will be attached
            to this one, so their invoices start matching.
          </p>
          <button
            onClick={raise}
            disabled={busy || !number.trim() || !supplierId || !Number(amount)}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
          >
            Raise it
          </button>
        </section>
      )}

      {pos.length === 0 && !adding && (
        <div className="rounded-md border border-etyme-rule bg-etyme-surface p-4">
          <p className="text-[13px] text-etyme-ink">
            No purchase orders. If your accounts-payable policy requires one, every supplier
            invoice will fail its check until there is something to quote.
          </p>
        </div>
      )}

      {pos.length > 0 && (
        <ListSurface<PO>
          name="purchase-orders"
          defaultView="feed"
          columns={PO_COLUMNS}
          data={[...attention, ...rest]}
          rowKey={(po) => po.id}
          exportName="purchase-orders"
          defaultPageSize={50}
          searchPlaceholder="Search by number or firm…"
          searchFilter={(po, q) => `${po.number} ${po.counterparty.name}`.toLowerCase().includes(q)}
          card={(po) => <Row po={po} />}
        />
      )}
    </>
  )
}


const PO_COLUMNS: Column<PO>[] = [
  // A client reads its own purchase orders; a supplier reads the same
  // rows as its sales orders. One list, and each row says which it is —
  // a GSI has both in the same week.
  { key: 'number', label: 'Reference', render: (po) => (
    <span className="font-mono text-etyme-ink">
      <span className="text-etyme-faint mr-1.5">{po.short}</span>{po.reference}
    </span>
  ), sortValue: (po) => po.reference },
  { key: 'counterparty', label: 'With', render: (po) => <span className="text-etyme-muted">{po.direction === 'issued' ? 'to' : 'from'} {po.counterparty.name}</span>, sortValue: (po) => po.counterparty.name },
  { key: 'amount', label: 'Ceiling', align: 'right', render: (po) => <span className="tabular-nums">{money(po.amount, po.currency)}</span> },
  { key: 'invoiced', label: 'Invoiced', align: 'right', render: (po) => <span className="tabular-nums">{money(po.invoiced, po.currency)}</span>, hideOnMobile: true },
  { key: 'remaining', label: 'Left', align: 'right', render: (po) => <span className={`tabular-nums ${po.overdrawn ? 'text-etyme-attention' : ''}`}>{money(po.remaining, po.currency)}</span> },
  { key: 'consumedPercent', label: 'Used', align: 'right', render: (po) => <span className="tabular-nums">{po.consumedPercent}%</span> },
  { key: 'lines', label: 'Lines', align: 'right', render: (po) => (
    <span className="tabular-nums text-etyme-muted">{po.lines.length}</span>
  ), sortValue: (po) => po.lines.length, hideOnMobile: true },
  { key: 'canInvoice', label: 'Standing', render: (po) => <span className={`chip ${po.overdrawn || po.expired ? 'chip--attention' : 'chip--verified'}`}>{po.overdrawn ? 'Overdrawn' : po.expired ? 'Expired' : 'Open'}</span>, sortValue: (po) => (po.canInvoice ? 1 : 0) },
]

/** Cents per hour, as a person reads a rate. */
function rate(cents: number, ccy: string): string {
  return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(cents / 100)}/hr`
}

/**
 * The lines under the document they are on.
 *
 * A header with a ceiling and no names is half the paper. Five people on
 * one order is one ceiling and five lines, and which of them is eating
 * it is the question this page is open for — so each line carries what
 * it has billed rather than the header's total divided by the headcount,
 * which would be a figure nobody could stand behind.
 */
function Lines({ po }: { po: PO }) {
  if (po.lines.length === 0) {
    return (
      <p className="text-[12px] text-etyme-faint mt-2">
        No lines on it yet. Nothing has been billed against this ceiling.
      </p>
    )
  }
  return (
    <div className="mt-3 border-t border-etyme-rule pt-2">
      <Lbl>{po.lines.length === 1 ? 'Its line' : `Its ${po.lines.length} lines`}</Lbl>
      <ul className="mt-1.5 space-y-1.5">
        {po.lines.map((l, i) => (
          <li key={l.id} className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-etyme-ink">
              <span className="text-etyme-faint text-[11px] mr-1.5 tabular-nums">{i + 1}</span>
              {lineName({ side: l.side, personName: l.personName, siteName: l.siteName })}
              <span className="text-[11px] text-etyme-muted ml-2">
                {lineDoes(
                  { side: l.side, personName: l.personName, paidToName: l.paidToName },
                  po.side
                )}
              </span>
            </span>
            <span className="text-[12px] tabular-nums text-etyme-muted shrink-0">
              {rate(l.rate, l.currency)}
              {l.billed != null && (
                <span className="text-etyme-ink ml-2">
                  {money(l.billed, l.currency)} billed
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ po }: { po: PO }) {
  return (
    <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-4">
      {po.offSystem && (
        <p className="text-[12px] text-etyme-muted mb-2">{po.offSystem}</p>
      )}
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div>
          <span className="text-[14px] font-mono text-etyme-ink">
            <span className="text-etyme-faint mr-1.5 text-[12px]">{po.short}</span>{po.reference}
          </span>
          <span className="ml-3 text-[13px] text-etyme-muted">
            {po.direction === 'issued' ? 'to' : 'from'} {po.counterparty.name}
          </span>
          {po.contractsAgainst > 0 && (
            <span className="ml-2 text-[12px] text-etyme-faint tabular-nums">
              · {po.contractsAgainst} contract{po.contractsAgainst === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className="text-[13px] tabular-nums text-etyme-ink shrink-0">
          {money(po.remaining, po.currency)} <span className="text-etyme-faint">left of {money(po.amount, po.currency)}</span>
        </span>
      </div>

      <Consumed po={po} />

      <p className={`text-[12px] mt-2 ${po.canInvoice ? 'text-etyme-muted' : 'text-etyme-attention'}`}>
        {po.reason}
        {po.endDate && <span className="text-etyme-faint"> · runs to {po.endDate}</span>}
      </p>

      <Lines po={po} />
    </div>
  )
}
