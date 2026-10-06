'use client'

import { useEffect, useState } from 'react'
import { compact as fmtMinor, amount as fmtMinorExact, fromUnits } from '@/lib/money-display'
import { minorPerUnit } from '@/lib/money'
import { plainDate } from '@/lib/plain-date'
import { PAYMENT_METHODS, payMethodFor } from '@/lib/money/pay-method'
import type { PayDeskVerdict } from '@/lib/money/pay-desk'

/**
 * The money half of one invoice: who it is paid to, how it is coded,
 * what has been paid, and the form that pays it.
 *
 * ── Why this is its own file ─────────────────────────────────────────
 *
 * An invoice receipt had two doors. The number opened a page with the
 * three-way check and no way to pay; clicking anywhere else on the row
 * opened a side panel with Pay and no check. A clerk paying from the
 * panel never saw whether the invoice matched, and one reading the check
 * had to go back to the list to pay it. There is one detail now — the
 * page — and this is the part of it the panel used to be.
 */

export interface PaymentRow {
  id: string
  /** Minor units — cents, pence. */
  amountMinor: number
  currency: string
  receivedAt: string
  method?: string | null
  reference?: string | null
  paidBy?: string | null
  paidTo?: string | null
  recordedBy?: string | null
}

export interface MoneyInvoice {
  id: string
  number: string
  currency: string
  /** Ours to collect, ours to pay, or neither, from the reader's side. */
  direction: 'RECEIVABLE' | 'PAYABLE' | 'NEITHER'
  status: string
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
  /** YYYY-MM-DD */
  dueAt: string
  payments: PaymentRow[]
}

interface CodingRow {
  personName: string
  costCenterCode: string | null
  costCenterName: string | null
  glAccount: string | null
  share: string
  amount: number
  codingOwner: string
  codingIsPayers: boolean
}

interface InvoiceCoding {
  workOrder: string | null
  purchaseOrderBalance: {
    number: string
    remainingCents: number
    consumedPercent: number
    overdrawn: boolean
  } | null
  remitTo: {
    legalName: string
    taxId: string | null
    paymentMethod: string
    bankName: string | null
    accountLast4: string | null
  } | null
  billTo: { id: string; name: string }
  rows: CodingRow[]
  reconciliation: {
    invoiceTotal: number
    codedTotal: number
    balanced: boolean
    codedForEndClient: boolean
  }
}

/** One payment, said the way a clerk checks it: how much, who paid whom, how, and the reference. */
function paymentSays(p: PaymentRow): string {
  const who = p.paidBy && p.paidTo ? `${p.paidBy} paid ${p.paidTo}` : null
  const how = p.method ? `by ${p.method}` : null
  const ref = p.reference ? `reference ${p.reference}` : null
  return [who, how, ref].filter(Boolean).join(' · ')
}

export function InvoiceMoney({
  invoice,
  desk,
  onPaid,
  onToast,
}: {
  invoice: MoneyInvoice
  /**
   * Whether the reader's desk pays (`lib/money/pay-desk`). The form was
   * drawn from the invoice's side alone, so a Program Manager filled it
   * in and the route refused. Where the desk does not pay, its sentence
   * stands where the form would be.
   */
  desk: PayDeskVerdict
  /** Called after a payment is recorded, so the page can read itself again. */
  onPaid?: () => void
  onToast: (message: string, type?: 'success' | 'error') => void
}) {
  const [coding, setCoding] = useState<InvoiceCoding | null>(null)
  const [codingLoading, setCodingLoading] = useState(true)
  const [payAmount, setPayAmount] = useState('')
  // Chosen by the clerk, or null until she does — then the supplier's
  // own remit-to method, never an assumed Wire.
  const [methodChosen, setMethodChosen] = useState<string | null>(null)
  const [payReference, setPayReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payments, setPayments] = useState<PaymentRow[]>(invoice.payments ?? [])
  const [paid, setPaid] = useState(invoice.paidMinor)
  const [outstanding, setOutstanding] = useState(invoice.outstandingMinor)
  const [status, setStatus] = useState(invoice.status)
  const per = minorPerUnit(invoice.currency)

  // The PO, remit-to and cost-center split. Hidden rather than errored
  // where the caller is not a party to the invoice.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCodingLoading(true)
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/coding`)
        if (!res.ok) throw new Error('not available')
        const body = await res.json()
        if (!cancelled) setCoding(body.data)
      } catch {
        if (!cancelled) setCoding(null)
      } finally {
        if (!cancelled) setCodingLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [invoice.id])

  const remitMethod = payMethodFor(coding?.remitTo?.paymentMethod)
  const payMethod = methodChosen ?? remitMethod ?? ''

  async function pay(e: React.FormEvent) {
    e.preventDefault()
    // An empty amount pays what the button says: the whole balance.
    const units = payAmount.trim() === '' ? outstanding / per : parseFloat(payAmount)
    if (isNaN(units) || units <= 0) {
      onToast('Enter the amount paid.', 'error')
      return
    }
    const minor = Math.round(units * per)
    if (minor > outstanding) {
      onToast(`That is more than the ${fmtMinorExact(outstanding, invoice.currency)} still open.`, 'error')
      return
    }
    if (!payMethod) {
      onToast('Choose how it was paid.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: minor / per, method: payMethod, reference: payReference || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        onToast(body.error?.message ?? 'The payment was not recorded.', 'error')
        return
      }
      const p = body.data?.payment
      if (p) {
        setPayments((prev) => [
          ...prev,
          {
            id: p.id,
            // The route sends minor units now; a whole-currency amount is
            // converted here, where the two meet, and nowhere else.
            amountMinor: typeof p.amountMinor === 'number' ? p.amountMinor : Math.round(Number(p.amount) * per),
            currency: p.currency ?? invoice.currency,
            receivedAt: p.receivedAt,
            method: p.method,
            reference: p.reference,
            paidBy: p.paidBy,
            paidTo: p.paidTo,
            recordedBy: p.recordedBy,
          },
        ])
      }
      const inv = body.data?.invoice
      const newPaid = inv?.paid != null ? Math.round(inv.paid * per) : paid + minor
      setPaid(newPaid)
      setOutstanding(invoice.totalMinor - newPaid)
      setStatus(inv?.status ?? (invoice.totalMinor - newPaid <= 0 ? 'PAID' : 'PARTIALLY_PAID'))
      setPayAmount('')
      setPayReference('')
      onToast(`${fmtMinorExact(minor, invoice.currency)} recorded.`)
      onPaid?.()
    } catch {
      onToast('The network dropped that. Try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const payer = invoice.direction === 'PAYABLE'
  const notSubmitted = payer && status === 'ISSUED'

  return (
    <section className="space-y-6">
      {/* Who it is paid to, and against which order. */}
      {!codingLoading && coding && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="eyebrow mb-1">Purchase order</p>
            {coding.workOrder ? (
              <>
                <p className="text-sm font-mono">{coding.workOrder}</p>
                {coding.purchaseOrderBalance && (
                  <p className={`text-[11px] tabular-nums mt-0.5 ${
                    coding.purchaseOrderBalance.overdrawn ? 'text-etyme-attention' : 'text-etyme-muted'
                  }`}>
                    {fmtMinor(coding.purchaseOrderBalance.remainingCents)} left
                    {' · '}{coding.purchaseOrderBalance.consumedPercent}% drawn
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-etyme-attention">No purchase order on it</p>
            )}
          </div>
          <div>
            <p className="eyebrow mb-1">{payer ? 'Pay to' : 'Paid to'}</p>
            {coding.remitTo ? (
              <>
                <p className="text-sm">{coding.remitTo.legalName}</p>
                <p className="text-[11px] text-etyme-muted mt-0.5">
                  {coding.remitTo.paymentMethod}
                  {coding.remitTo.bankName && ` · ${coding.remitTo.bankName}`}
                  {coding.remitTo.accountLast4 && ` ····${coding.remitTo.accountLast4}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-etyme-attention">No bank details on file</p>
            )}
          </div>
        </div>
      )}

      {/* Cost coding */}
      {coding && coding.rows.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="eyebrow">Cost coding</p>
            <a href={`/api/invoices/${invoice.id}/coding?format=csv`} className="text-[11px] text-etyme-action hover:underline">
              Export CSV
            </a>
          </div>
          <div className="space-y-1.5">
            {coding.rows.map((r, i) => (
              <div key={i} className="bg-etyme-canvas rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-etyme-ink truncate">{r.personName}</span>
                  <span className="text-[13px] tabular-nums font-medium shrink-0">
                    {fromUnits(r.amount, invoice.currency)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-etyme-muted">
                  {r.costCenterCode ? (
                    <>
                      <span className="font-mono">{r.costCenterCode}</span>
                      <span className="truncate">{r.costCenterName}</span>
                      {r.glAccount && <span className="text-etyme-faint">GL {r.glAccount}</span>}
                      {r.share !== '100%' && <span className="chip chip--passive text-[10px]">{r.share}</span>}
                    </>
                  ) : (
                    <span className="text-etyme-attention">Not coded — code it by hand</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className={`mt-2 text-[11px] ${coding.reconciliation.balanced ? 'text-etyme-verified' : 'text-etyme-attention'}`}>
            {coding.reconciliation.balanced
              ? '✓ The coded total matches the invoice'
              : `The coded total is ${fromUnits(coding.reconciliation.codedTotal, invoice.currency)} against ${fromUnits(coding.reconciliation.invoiceTotal, invoice.currency)}`}
          </p>
          {coding.reconciliation.codedForEndClient && (
            <p className="text-[11px] text-etyme-muted mt-1.5">
              These are the end client&rsquo;s cost centers. {coding.billTo.name} codes its own onward bill separately.
            </p>
          )}
        </div>
      )}

      {/* Amounts */}
      <div className="rounded-lg bg-etyme-canvas p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-etyme-muted">Total</p>
          <p className="text-sm font-medium tabular-nums">{fmtMinorExact(invoice.totalMinor, invoice.currency)}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-etyme-muted">Paid</p>
          <p className="text-sm font-medium tabular-nums text-etyme-verified">{fmtMinorExact(paid, invoice.currency)}</p>
        </div>
        <div className="border-t border-etyme-rule pt-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-etyme-muted">Still to pay</p>
          <p className="text-sm font-semibold tabular-nums">
            {outstanding > 0 ? fmtMinorExact(outstanding, invoice.currency) : 'Paid in full'}
          </p>
        </div>
        <p className="text-[11px] text-etyme-muted">Due {plainDate(invoice.dueAt)}</p>
      </div>

      {/* What was paid, read back in full */}
      <div>
        <p className="eyebrow mb-2">Payments ({payments.length})</p>
        {payments.length > 0 ? (
          <div className="divide-y divide-etyme-rule">
            {payments.map((p) => (
              <div key={p.id} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm tabular-nums font-medium text-etyme-verified">
                    {fmtMinorExact(p.amountMinor, p.currency)}
                  </p>
                  <p className="text-[11px] text-etyme-faint">{plainDate(p.receivedAt)}</p>
                </div>
                {paymentSays(p) && <p className="text-[12px] text-etyme-muted">{paymentSays(p)}</p>}
                {p.recordedBy && <p className="text-[11px] text-etyme-faint">Recorded by {p.recordedBy}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-etyme-faint">Nothing paid yet.</p>
        )}
      </div>

      {/* An invoice reaches the payer through the check, never around it. */}
      {outstanding > 0 && notSubmitted && (
        <div className="border-t border-etyme-rule pt-6">
          <p className="eyebrow mb-2">Pay this invoice</p>
          <p className="text-sm text-etyme-muted">
            Not yet. Your supplier has raised it but not submitted it, so it has not been checked
            against the hours you approved or the purchase order. It can be paid once it has.
          </p>
        </div>
      )}

      {outstanding > 0 && !notSubmitted && invoice.direction !== 'NEITHER' && !desk.mayPay && desk.says && (
        <div id="pay" className="border-t border-etyme-rule pt-6">
          <p className="eyebrow mb-2">{payer ? 'Who pays this' : 'Who records the payment'}</p>
          <p className="text-sm text-etyme-ink">
            {fmtMinorExact(outstanding, invoice.currency)} {payer ? 'is still to pay' : 'is still to come in'}, due {plainDate(invoice.dueAt)}.
          </p>
          <p className="mt-1 text-sm text-etyme-muted">{desk.says}</p>
        </div>
      )}

      {outstanding > 0 && !notSubmitted && invoice.direction !== 'NEITHER' && desk.mayPay && (
        <div id="pay" className="border-t border-etyme-rule pt-6">
          <p className="eyebrow mb-3">{payer ? 'Pay this invoice' : 'Record a payment received'}</p>
          <form onSubmit={pay} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={outstanding / per}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`${(outstanding / per).toFixed(2)} — the whole balance`}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">How it was paid</label>
              <select
                value={payMethod}
                onChange={(e) => setMethodChosen(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                {!payMethod && <option value="">Choose…</option>}
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}{m === remitMethod ? ' — how this supplier is set up to be paid' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Reference</label>
              <input
                type="text"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="Check number, transfer reference"
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting
                ? 'Recording…'
                : `${payer ? 'Pay' : 'Record'} ${fmtMinorExact(
                    payAmount.trim() === '' ? outstanding : Math.round((parseFloat(payAmount) || 0) * per),
                    invoice.currency
                  )}`}
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
