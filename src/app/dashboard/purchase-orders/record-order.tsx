'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import type { OrderTerms } from '@/lib/money/order-terms'
import { Field, Input, Panel, Select, SubmitButton, ErrorState } from '@/components/ui'

/**
 * Record the order a firm above was handed to you.
 *
 * Release walk, 2026-10-27: a sub-vendor could raise a purchase order
 * (buy) and could not record the order its prime gave it. The order is
 * one document with three names, so the prime's purchase order is the
 * sub's sales order, and the one door writes it (POST
 * /api/purchase-orders with `issuedById`, the firm that issued it).
 *
 * Where that firm is on Etyme, the order is theirs to raise and the door
 * says so in their name: it then appears here, as a sales order, by
 * itself. Where it is not, this firm records the paper it was handed,
 * and the row says who typed it in (`mayWriteOrder` in lib/off-system).
 */
export interface RecordedOrder {
  id: string
  number: string
  currency: string
  buyer: { id: string; name: string }
  contractsAttached: number
  noun: string
  message: string
}

export function RecordOrder({
  sellerCompanyId,
  onRecorded,
  onClose,
}: {
  sellerCompanyId: string
  onRecorded: (order: RecordedOrder) => void
  onClose: () => void
}) {
  const [clients, setClients] = useState<{ id: string; name: string; onEtyme: boolean }[]>([])
  const [buyerId, setBuyerId] = useState('')
  const [number, setNumber] = useState('')
  const [sellerNumber, setSellerNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [billFrequency, setBillFrequency] = useState<OrderTerms['frequency'] | ''>('')
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((b) => setClients((b.data?.clients ?? []).map((c: any) => ({ id: c.id, name: c.name, onEtyme: Boolean(c.onEtyme) }))))
      .catch(() => setClients([]))
  }, [])

  const buyer = clients.find((c) => c.id === buyerId) ?? null

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/purchase-orders?books=own', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issuedById: buyerId,
          issuedToId: sellerCompanyId,
          number,
          sellerNumber: sellerNumber || null,
          amount: Number(amount),
          currency: currency || undefined,
          startDate: startDate || undefined,
          endDate: endDate || null,
          paymentTerms: paymentTerms === '' ? undefined : Number(paymentTerms),
          billFrequency: billFrequency || undefined,
          termsDifferReason: reason || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any)
        // A term that differs from the agreement asks for its reason,
        // and the form grows the box rather than ending the walk.
        if (body?.error?.code === 'TERMS_DIFFER') setAskReason(true)
        throw new Error(body?.error?.message ?? 'That order could not be recorded.')
      }
      const body = await readJson(res)
      onRecorded({
        id: body.data.order.id,
        number: body.data.order.number,
        currency: body.data.order.currency,
        buyer: { id: buyerId, name: buyer?.name ?? 'the client' },
        contractsAttached: body.data.contractsAttached ?? 0,
        noun: body.data.noun ?? 'sales order',
        message: body.data.message,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={buyer ? `Record the order from ${buyer.name}` : 'Record an order you were given'} className="mb-5">
      <p className="text-[13px] text-etyme-muted mb-3">
        The purchase order a client or a prime handed you is your sales order: one document, read from both ends.
      </p>
      {buyer?.onEtyme && (
        <p className="text-[12px] text-etyme-muted mb-3">
          {buyer.name} is on Etyme, so they raise this order themselves, and it appears here as your sales order.
        </p>
      )}
      {error && <div className="mb-3"><ErrorState says={error} /></div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="From">
          <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">Choose…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Their order number">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="PO-2026-0412" className="font-mono" />
        </Field>
        <Field label="Your own reference (optional)">
          <Input value={sellerNumber} onChange={(e) => setSellerNumber(e.target.value)} placeholder="SO-0913" className="font-mono" />
        </Field>
        <Field label="Ceiling">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="120000" className="tabular-nums" />
        </Field>
        <Field label="Currency (blank: the agreement's)">
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Starts">
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" />
          </Field>
          <Field label="Ends (optional)">
            <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" />
          </Field>
        </div>
        <Field label="Net days (blank: the agreement's)">
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} type="number" placeholder="45" />
        </Field>
        <Field label="Billed (blank: the agreement's)">
          <Select value={billFrequency} onChange={(e) => setBillFrequency(e.target.value as OrderTerms['frequency'] | '')}>
            <option value="">As the agreement says</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Every other week</option>
            <option value="SEMIMONTHLY">Twice a month</option>
            <option value="MONTHLY">Monthly</option>
          </Select>
        </Field>
        {askReason && (
          <Field label="Why this order differs from the agreement">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Their PO sets net 45 for this project" />
          </Field>
        )}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <SubmitButton
          type="button"
          onClick={save}
          pending={busy}
          pendingLabel="Recording…"
          disabled={!buyerId || !number.trim() || !Number(amount) || (askReason && !reason.trim())}
        >
          Record it
        </SubmitButton>
        <button type="button" onClick={onClose} className="text-[13px] text-etyme-muted underline">
          Cancel
        </button>
      </div>
    </Panel>
  )
}
