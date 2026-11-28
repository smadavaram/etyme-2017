'use client'

import { useCallback, useEffect, useState } from 'react'
import { Field, FormMessage, Input, Select, SubmitButton } from '@/components/ui/form'

/**
 * The client's cost coding on a line: cost center, order, GL account and
 * share. Drawn only where `GET /api/contracts/:id/allocations` says this
 * seat may change it, which is what `PATCH` asks too. Everybody else gets
 * nothing, so a supplier never reads the client's codes here.
 */

interface Row {
  id: string; costCenterId: string; internalOrderId: string | null
  costCenter: string; costCenterName: string; internalOrder: string | null
  glAccount: string | null; glDefault: string | null; sharePct: number
}
interface Answer {
  may: boolean
  allocations?: Row[]
  costCenters?: { id: string; code: string; name: string }[]
  internalOrders?: { id: string; code: string; kind: string }[]
}

export function AllocationsPanel({ contractId }: { contractId: string }) {
  const [data, setData] = useState<Answer | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ costCenterId: '', internalOrderId: '', glAccount: '', sharePct: '' })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/allocations`)
      const body = await res.json().catch(() => ({}))
      if (res.ok) setData(body.data)
    } catch { /* nothing drawn */ }
  }, [contractId])
  useEffect(() => { void load() }, [load])

  if (!data?.may || !data.allocations?.length) return null

  const start = (r: Row) => {
    setEditing(r.id); setSaid(null)
    setForm({ costCenterId: r.costCenterId, internalOrderId: r.internalOrderId ?? '', glAccount: r.glAccount ?? '', sharePct: String(r.sharePct) })
  }
  const save = async (r: Row) => {
    setBusy(true); setSaid(null)
    const body: Record<string, unknown> = { allocationId: r.id }
    if (form.costCenterId !== r.costCenterId) body.costCenterId = form.costCenterId
    if (form.internalOrderId !== (r.internalOrderId ?? '')) body.internalOrderId = form.internalOrderId || null
    if (form.glAccount !== (r.glAccount ?? '')) body.glAccount = form.glAccount
    if (Number(form.sharePct) !== r.sharePct) body.sharePct = Number(form.sharePct)
    try {
      const res = await fetch(`/api/contracts/${contractId}/allocations`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setSaid({ ok: true, text: j.data.says }); setEditing(null); await load() }
      else setSaid({ ok: false, text: j.error?.message ?? 'The coding was not saved.' })
    } finally { setBusy(false) }
  }

  return (
    <div className="card mt-3">
      <p className="eyebrow mb-3">Cost coding</p>
      <ul className="space-y-3">
        {data.allocations.map((r) => (
          <li key={r.id} className="text-[13px]">
            {editing === r.id ? (
              <div className="space-y-2">
                <Field label="Cost center">
                  <Select value={form.costCenterId} onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}>
                    {data.costCenters?.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Order or project code">
                  <Select value={form.internalOrderId} onChange={(e) => setForm({ ...form, internalOrderId: e.target.value })}>
                    <option value="">None</option>
                    {data.internalOrders?.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
                  </Select>
                </Field>
                <Field label="GL account"><Input value={form.glAccount} onChange={(e) => setForm({ ...form, glAccount: e.target.value })} /></Field>
                <Field label="Share (%)"><Input inputMode="decimal" value={form.sharePct} onChange={(e) => setForm({ ...form, sharePct: e.target.value })} /></Field>
                <div className="flex gap-3">
                  <SubmitButton type="button" pending={busy} onClick={() => save(r)}>Save coding</SubmitButton>
                  <button type="button" className="underline" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span>{r.costCenter} {r.costCenterName}</span>
                {r.internalOrder && <span>Order {r.internalOrder}</span>}
                <span>GL {r.glAccount ?? r.glDefault ?? 'not set'}</span>
                <span>{r.sharePct}%</span>
                <button type="button" className="underline" style={{ color: 'var(--color-action)' }} onClick={() => start(r)}>Edit</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {said && <FormMessage tone={said.ok ? 'ok' : 'error'}>{said.text}</FormMessage>}
    </div>
  )
}
