'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { amount } from '@/lib/money-display'

/** This endpoint returns whole currency units, not minor ones. */
const amountFromUnits = (n: number) => amount(Math.round(n * 100))

/**
 * One invoice, as accounts payable sees it.
 *
 * The three-way match has existed for a while and could only be read
 * through curl. A control nobody can see is a control that gets worked
 * around: the clerk pays it outside the system, and the ledger stops being
 * true.
 *
 * So what fails comes first, with the remedy attached. A refusal that only
 * says no teaches people to route around you, and every check here says
 * either how to fix it or why nobody may wave it through.
 */

interface Check {
  code: string
  outcome: 'PASS' | 'FAIL' | 'OVERRIDDEN'
  reason: string
  overridable: boolean
  overriddenBy?: { name: string; reason: string; at: string }
}
interface Line {
  id: string
  person: { id: string; name: string }
  hours: number
  rate: number
  amount: number
  description: string | null
  receipt: { id: string; status: string; approvedHours: number; period: string } | null
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Chip({ children, tone = 'passive' }: {
  children: React.ReactNode
  tone?: 'attention' | 'verified' | 'action' | 'passive'
}) {
  const tones = {
    attention: 'bg-etyme-attention/10 text-etyme-attention',
    verified: 'bg-etyme-verified/10 text-etyme-verified',
    action: 'bg-etyme-action/10 text-etyme-action',
    passive: 'bg-etyme-rule/50 text-etyme-muted',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}


/** Plain-language names. An AP clerk reads these, not the codes. */
const LABEL: Record<string, string> = {
  RECEIPT: 'Approved timesheet behind every line',
  DUPLICATE: 'Nothing billed twice',
  QUANTITY: 'Hours billed match hours approved',
  PRICE: 'Rates match the contract',
  EXTENSION: 'Lines multiply out',
  HEADER_TOTAL: 'Total matches the lines',
  PO_REQUIRED: 'Purchase order present',
  PO_STATUS: 'Purchase order open and in date',
  PO_BALANCE: 'Purchase order has room',
}

function CheckRow({ c, onWaive, onWithdraw }: {
  c: Check
  onWaive: (code: string) => void
  onWithdraw: (code: string) => void
}) {
  const failed = c.outcome === 'FAIL'
  const waived = c.outcome === 'OVERRIDDEN'
  return (
    <div className={`px-4 py-3 border-l-2 ${
      failed ? 'border-etyme-attention' : waived ? 'border-etyme-action' : 'border-transparent'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${failed ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
              {LABEL[c.code] ?? c.code}
            </span>
            {waived && <Chip tone="action">exception</Chip>}
          </div>
          <p className="text-sm text-etyme-muted mt-0.5">{c.reason}</p>
          {waived && c.overriddenBy && (
            <p className="text-xs text-etyme-muted mt-1">
              Waived by {c.overriddenBy.name}: {c.overriddenBy.reason}
            </p>
          )}
          {failed && !c.overridable && (
            <p className="text-xs text-etyme-faint mt-1">
              This one cannot be waived — it has to be corrected.
            </p>
          )}
        </div>
        <div className="shrink-0">
          {failed && c.overridable && (
            <button onClick={() => onWaive(c.code)}
              className="px-3 py-1 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">
              Record an exception
            </button>
          )}
          {waived && (
            <button onClick={() => onWithdraw(c.code)}
              className="px-3 py-1 text-xs text-etyme-muted hover:text-etyme-attention">
              Withdraw
            </button>
          )}
          {c.outcome === 'PASS' && <span className="text-etyme-verified text-sm">✓</span>}
        </div>
      </div>
    </div>
  )
}

export default function InvoiceDetail() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/invoices/${id}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not load')
      setData(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  async function waive(code: string) {
    const reason = window.prompt(
      'Why is this being waived? This travels with the invoice, and the next person to read it will be an auditor.'
    )
    if (!reason) return
    const res = await fetch(`/api/invoices/${id}/match/override`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, reason }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error?.message ?? 'Could not record that'); return }
    await load()
  }

  async function withdraw(code: string) {
    if (!window.confirm('Withdraw this exception? The invoice may stop matching.')) return
    const res = await fetch(`/api/invoices/${id}/match/override?code=${code}`, { method: 'DELETE' })
    if (!res.ok) { alert('Could not withdraw it'); return }
    await load()
  }

  async function submit() {
    const res = await fetch(`/api/invoices/${id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    const j = await res.json()
    if (!res.ok) {
      const cs = (j.error?.checks ?? []).map((c: any) => `· ${c.reason}`).join('\n')
      alert(`${j.error?.message ?? 'Could not submit'}${cs ? '\n\n' + cs : ''}`)
      return
    }
    await load()
  }

  if (loading) return <div className="text-etyme-muted py-12 text-center">Loading…</div>
  if (error) return (
    <div className="max-w-3xl border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
      <div className="text-etyme-attention font-medium">{error}</div>
      <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
    </div>
  )
  if (!data) return null

  const inv = data.invoice
  const m = data.match
  // What is wrong comes first. A clerk opening a held invoice is looking
  // for the thing to fix, not for reassurance about the eight that passed.
  const checks: Check[] = m
    ? [...m.checks].sort((a, b) => {
        const rank = (c: Check) => (c.outcome === 'FAIL' ? 0 : c.outcome === 'OVERRIDDEN' ? 1 : 2)
        return rank(a) - rank(b)
      })
    : []

  return (
    <div className="max-w-3xl">
      <a href="/dashboard/invoices" className="text-sm text-etyme-action hover:underline">← Invoices</a>

      <div className="mt-4 mb-8 flex items-start justify-between gap-6">
        <div>
          <Lbl>{inv.vendor?.name ?? 'Vendor'} → {inv.client?.name ?? 'Client'}</Lbl>
          <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">{inv.number}</h1>
          <div className="text-etyme-muted mt-2">
            {inv.periodStart} → {inv.periodEnd} · due {inv.dueAt} · {inv.status.toLowerCase()}
          </div>
        </div>
        <div className="text-right shrink-0">
          <Lbl>Total</Lbl>
          <div className="font-serif text-3xl text-etyme-ink tabular-nums">{amountFromUnits(inv.total)}</div>
          {inv.paid > 0 && <div className="text-xs text-etyme-muted">{amountFromUnits(inv.paid)} paid</div>}
        </div>
      </div>

      {/* The verdict, before anything else */}
      {m && (
        <div className={`border rounded-lg mb-8 ${
          m.matched
            ? m.cleanMatch
              ? 'border-etyme-verified/30 bg-etyme-verified/5'
              : 'border-etyme-action/30 bg-etyme-action/5'
            : 'border-etyme-attention/30 bg-etyme-attention/5'
        }`}>
          <div className="p-4 flex items-start justify-between gap-4">
            <div>
              <Lbl>{m.matched ? (m.cleanMatch ? 'Matched' : 'Matched with exceptions') : 'Does not match'}</Lbl>
              <p className="font-serif text-lg text-etyme-ink mt-1 text-balance">{m.summary}</p>
              {m.purchaseOrder && (
                <p className="text-sm text-etyme-muted mt-1 tabular-nums">
                  {amountFromUnits(m.purchaseOrder.remaining)} left on the purchase order
                  {' · '}{m.purchaseOrder.utilisationPercent}% used
                </p>
              )}
            </div>
            {m.matched && inv.status === 'ISSUED' && (
              <button onClick={submit}
                className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 shrink-0">
                Submit for payment
              </button>
            )}
          </div>
          <div className="border-t border-etyme-rule divide-y divide-etyme-rule">
            {checks.map(c => (
              <CheckRow key={c.code} c={c} onWaive={waive} onWithdraw={withdraw} />
            ))}
          </div>
        </div>
      )}

      {/* Lines, each with the receipt that justifies it */}
      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="font-serif text-lg text-etyme-ink">Lines</h2>
          <span className="text-xs text-etyme-faint tabular-nums">{data.lines.length}</span>
        </div>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.lines.length === 0 && (
            <div className="p-6 text-center text-sm text-etyme-muted">
              This invoice has no lines, so there is nothing to match against.
            </div>
          )}
          {data.lines.map((l: Line) => (
            <div key={l.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-etyme-ink">{l.person.name}</div>
                <div className="text-xs text-etyme-muted">
                  {l.receipt
                    ? <>timesheet {l.receipt.period} · {l.receipt.approvedHours}h approved</>
                    : <span className="text-etyme-attention">no timesheet behind this line</span>}
                </div>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <div className="text-sm text-etyme-ink">{amountFromUnits(l.amount)}</div>
                <div className="text-xs text-etyme-muted">{l.hours}h × {amountFromUnits(l.rate)}</div>
              </div>
              <div className="w-24 text-right shrink-0">
                {l.receipt
                  ? <Chip tone={l.receipt.status === 'APPROVED' ? 'verified' : 'attention'}>
                      {l.receipt.status.toLowerCase()}
                    </Chip>
                  : <Chip tone="attention">no receipt</Chip>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {data.purchaseOrder && (
        <p className="text-xs text-etyme-faint mt-8 pt-6 border-t border-etyme-rule">
          Raised against purchase order {data.purchaseOrder.number} — {amountFromUnits(data.purchaseOrder.amount)} authorised,
          {data.purchaseOrder.endDate ? ` running to ${data.purchaseOrder.endDate}` : ' open ended'}.
          An approved timesheet is the receipt: no receipt, no payment.
        </p>
      )}
    </div>
  )
}
