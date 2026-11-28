'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { Field, FormMessage, Input, Panel, Select, SubmitButton, ErrorState } from '@/components/ui'
import type { FirstLineSide } from '@/lib/money/order-first-line'
import { firmsToPick, LINK_FIRST_HREF } from '@/lib/money/firm-picker'

/**
 * An order's first line, on the same screen as its header.
 *
 * Release walk, 2026-10-27: "Raising a PO: 3 fields, 1 click. It has no
 * lines." A line is one person at a rate at a site, and it is what a bill
 * is raised against and what a supplier is paid from. The second walk
 * added the buyer: a firm raising a purchase order to a supplier knows the
 * person, the rate and the site, so it writes its line here too.
 *
 *   - **A sell line** (the seller, on a sales order it received) bills the
 *     firm that issued the order. POST /api/contracts with `workOrderId`.
 *   - **A buy line** (a buyer that bills a client above it) pays the
 *     supplier the order went to, beside the sell line it bills the client
 *     from. POST /api/contracts with `boughtFromId` and
 *     `buyPurchaseOrderId`.
 *
 * Each is refused in a sentence unless the order is open and between the
 * right two firms (lib/money/order-first-line).
 */
export function FirstLine({
  order,
  line,
  selfCompanyId,
  says,
  onDone,
  onClose,
}: {
  /** The other firm on the order: the buyer on a sell line, the supplier on a buy line. */
  order: { id: string; number: string; currency: string; counterparty: { id: string; name: string } }
  line: FirstLineSide
  selfCompanyId: string
  /** The sentence that asked for this line. */
  says: string
  onDone: (message: string) => void
  onClose: () => void
}) {
  const [people, setPeople] = useState<{ personId: string; name: string }[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [sites, setSites] = useState<{ id: string; label: string }[]>([])
  const [personId, setPersonId] = useState('')
  const [clientId, setClientId] = useState('')
  const [billRate, setBillRate] = useState('')
  const [payRate, setPayRate] = useState('')
  const [siteId, setSiteId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The firm the person works for: the buyer on a sell line; on a buy
  // line, the client this firm bills, which it picks.
  const siteOf = line === 'SELL' ? order.counterparty.id : clientId
  const siteOwner = line === 'SELL' ? order.counterparty.name : clients.find((c) => c.id === clientId)?.name ?? null

  useEffect(() => {
    fetch('/api/consultants?limit=100')
      .then((r) => r.json())
      .then((b) => setPeople((b.data?.consultants ?? []).map((c: any) => ({ personId: c.personId, name: c.person?.name ?? c.name ?? 'Unnamed' }))))
      .catch(() => setPeople([]))
    if (line === 'BUY') {
      fetch('/api/companies')
        .then((r) => r.json())
        .then((b) => setClients(firmsToPick(b.data?.companies ?? [], selfCompanyId).filter((c) => c.id !== order.counterparty.id)))
        .catch(() => setClients([]))
    }
  }, [line, selfCompanyId, order.counterparty.id])

  useEffect(() => {
    setSiteId('')
    if (!siteOf) { setSites([]); return }
    fetch(`/api/companies/${siteOf}/locations`)
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
  }, [siteOf])

  const cents = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const common = {
        personId,
        companyId: selfCompanyId,
        workLocationId: siteId || undefined,
        startDate,
        endDate: endDate || undefined,
      }
      const body =
        line === 'SELL'
          ? {
              ...common,
              clientCompanyId: order.counterparty.id,
              billRate: cents(billRate),
              billCurrency: order.currency,
              workOrderId: order.id,
            }
          : {
              ...common,
              clientCompanyId: clientId,
              billRate: cents(billRate),
              boughtFromId: order.counterparty.id,
              payRate: cents(payRate),
              payCurrency: order.currency,
              buyPurchaseOrderId: order.id,
            }
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const answer = await readJson(res)
      onDone(answer.data?.message ?? `A line is on ${order.number}.`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const ready =
    Boolean(personId) && Number(billRate) > 0 && Boolean(startDate) &&
    (line === 'SELL' || (Boolean(clientId) && Number(payRate) > 0))

  return (
    <Panel title={`The first line on ${order.number}`} className="mb-5">
      <p className="text-[13px] text-etyme-muted mb-3">{says}</p>
      {error && <div className="mb-3"><ErrorState says={error} /></div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Who works on it">
          <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">{people.length === 0 ? 'Nobody on your people list yet' : 'Choose…'}</option>
            {people.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
          </Select>
        </Field>
        {line === 'BUY' && (
          <Field label="The client you bill for them">
            {clients.length === 0 ? (
              <p className="text-[13px] text-etyme-muted py-2">
                No client on your Companies list yet. <Link href={LINK_FIRST_HREF} className="text-etyme-action underline">Add or link one from Companies</Link>.
              </p>
            ) : (
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label={line === 'SELL' ? `Bill rate per hour (${order.currency})` : 'What you bill the client per hour'}>
          <Input value={billRate} onChange={(e) => setBillRate(e.target.value)} type="number" min="0.01" step="0.01" placeholder="125.00" className="tabular-nums" />
        </Field>
        {line === 'BUY' && (
          <Field label={`What you pay ${order.counterparty.name} per hour (${order.currency})`}>
            <Input value={payRate} onChange={(e) => setPayRate(e.target.value)} type="number" min="0.01" step="0.01" placeholder="95.00" className="tabular-nums" />
          </Field>
        )}
        <Field label={siteOwner ? `Site at ${siteOwner}` : 'Site'}>
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
        <SubmitButton type="button" onClick={save} pending={busy} pendingLabel="Adding…" disabled={!ready}>
          Add the line
        </SubmitButton>
        <button type="button" onClick={onClose} className="text-[13px] text-etyme-muted underline">
          Not now
        </button>
      </div>
    </Panel>
  )
}

/** The sentence after a header, where no line is asked for here. */
export function AfterHeaderNote({ says }: { says: string }) {
  return <div className="mb-5"><FormMessage tone="ok">{says}</FormMessage></div>
}
