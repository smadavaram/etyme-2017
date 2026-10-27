'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, FormMessage, Input, Panel, Select, SubmitButton, ErrorState } from '@/components/ui'

/**
 * An order's first line, on the same screen as its header.
 *
 * Release walk, 2026-10-27: "Raising a PO: 3 fields, 1 click. It has no
 * lines." A line is one person at a rate at a site, and it is what a bill
 * is raised against. The seller writes its own line here, onto this
 * order by name (`workOrderId` on POST /api/contracts, refused in a
 * sentence unless the order is open, from this client, to this firm).
 */
export function FirstLine({
  order,
  sellerCompanyId,
  says,
  onDone,
  onClose,
}: {
  order: { id: string; number: string; currency: string; buyer: { id: string; name: string } }
  sellerCompanyId: string
  /** The sentence that asked for this line. */
  says: string
  onDone: (message: string) => void
  onClose: () => void
}) {
  const [people, setPeople] = useState<{ personId: string; name: string }[]>([])
  const [sites, setSites] = useState<{ id: string; label: string }[]>([])
  const [personId, setPersonId] = useState('')
  const [billRate, setBillRate] = useState('')
  const [siteId, setSiteId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/consultants?limit=100')
      .then((r) => r.json())
      .then((b) => setPeople((b.data?.consultants ?? []).map((c: any) => ({ personId: c.personId, name: c.person?.name ?? c.name ?? 'Unnamed' }))))
      .catch(() => setPeople([]))
    fetch(`/api/companies/${order.buyer.id}/locations`)
      .then((r) => r.json())
      .then((b) =>
        setSites(
          (b.data?.locations ?? []).map((l: any) => ({
            id: l.id,
            label: l.isRemote ? 'Remote' : [l.name, l.city, l.state].filter(Boolean).join(', '),
          }))
        )
      )
      .catch(() => setSites([]))
  }, [order.buyer.id])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const rate = Number(billRate)
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId,
          companyId: sellerCompanyId,
          clientCompanyId: order.buyer.id,
          // Cents per hour, as every rate is stored.
          billRate: Number.isFinite(rate) ? Math.round(rate * 100) : 0,
          billCurrency: order.currency,
          workLocationId: siteId || undefined,
          startDate,
          endDate: endDate || undefined,
          workOrderId: order.id,
        }),
      })
      const body = await readJson(res)
      onDone(body.data?.message ?? `A line is on ${order.number}.`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={`The first line on ${order.number}`} className="mb-5">
      <p className="text-[13px] text-etyme-muted mb-3">{says}</p>
      {error && <div className="mb-3"><ErrorState says={error} /></div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Who works on it">
          <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Choose…</option>
            {people.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label={`Bill rate per hour (${order.currency})`}>
          <Input value={billRate} onChange={(e) => setBillRate(e.target.value)} type="number" min="0.01" step="0.01" placeholder="95.00" className="tabular-nums" />
        </Field>
        <Field label={`Site at ${order.buyer.name}`}>
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">{sites.length === 0 ? 'No sites on file for them' : 'Choose…'}</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Starts">
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" />
          </Field>
          <Field label="Ends (optional)">
            <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <SubmitButton
          type="button"
          onClick={save}
          pending={busy}
          pendingLabel="Adding…"
          disabled={!personId || !Number(billRate) || !startDate}
        >
          Add the line
        </SubmitButton>
        <button type="button" onClick={onClose} className="text-[13px] text-etyme-muted underline">
          Not now
        </button>
      </div>
    </Panel>
  )
}

/** The sentence after a header, where no line is asked for. */
export function AfterHeaderNote({ says }: { says: string }) {
  return <div className="mb-5"><FormMessage tone="ok">{says}</FormMessage></div>
}
