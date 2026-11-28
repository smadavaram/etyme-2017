'use client'

import { useCallback, useEffect, useState } from 'react'
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from '@/components/ui/form'
import { amount } from '@/lib/money-display'
import { BASES, BASIS_WORD, ACCRUAL_WORD, type CommissionBasis, type CommissionAccrual } from '@/lib/money/commission-rows'
import { commissionBody, fieldsDrawn, type CommissionValues } from './commission-form'

/**
 * The commissions on a line (founder, 2026-11-08: "Commission is object on
 * sell and buy contracts"): the sales commission on the sell line and the
 * recruiting commission on the buy line behind it, each with what it
 * earned this month. The Owner and a Contract Manager set and change them
 * here; anybody else at the firm sees only their own; another firm sees
 * nothing. Every refusal is the route's own sentence.
 */

interface Row {
  id: string
  kind: 'SALES' | 'RECRUITING'
  kindSays: string
  basis: CommissionBasis
  rateBps: number | null
  amountCents: number | null
  capCents: number | null
  fromDate: string
  toDate: string | null
  accrueOn: CommissionAccrual
  earnedBy: { id: string; name: string }
  setBy: { id: string; name: string }
  setAt: string
  reason: string
  termsSay: string
  thisMonth: { amountCents: number | null; currency: string | null; state: string; says: string } | null
}

interface Answer {
  side: 'SELL' | 'BUY'
  currency: string
  startDate: string
  mayEdit: boolean
  onlyYours: boolean
  people: { id: string; name: string }[]
  rows: Row[]
  says: string | null
  buyContractIds: string[]
}

const day = (d: string | null) => (d ? d.slice(0, 10) : '')

const blank = (kind: string, start: string): CommissionValues => ({
  id: null, earnedById: '', kind, basis: 'SHARE_OF_MARGIN', percent: '', amount: '', cap: '',
  fromDate: day(start), toDate: '', accrueOn: 'ACCEPTED', reason: '',
})

export function CommissionPanel({ contractId }: { contractId: string }) {
  const [data, setData] = useState<Answer | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [form, setForm] = useState<CommissionValues | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/commissions`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setRefused(body?.error?.message ?? null); setData(null); return }
      setRefused(null)
      setData(body.data as Answer)
    } catch {
      setRefused(null)
    }
  }, [contractId])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form) return
    setBusy(true)
    setSaid(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/commissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commissionBody(form), buyContractId: data?.buyContractIds[0] ?? null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setSaid({ tone: 'error', text: body?.error?.message ?? 'The commission could not be saved. Try again.' }); return }
      setSaid({ tone: 'ok', text: body.data.says })
      setForm(null)
      await load()
    } catch {
      setSaid({ tone: 'error', text: 'The commission could not be saved. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  // A firm not party to the line reads nothing, not even a heading.
  if (refused || !data) return null
  if (!data.mayEdit && data.rows.length === 0) return null

  const edit = (r: Row) => setForm({
    id: r.id, earnedById: r.earnedBy.id, kind: r.kind, basis: r.basis,
    percent: r.rateBps != null ? String(r.rateBps / 100) : '', amount: r.amountCents != null ? String(r.amountCents / 100) : '',
    cap: r.capCents != null ? String(r.capCents / 100) : '', fromDate: day(r.fromDate), toDate: day(r.toDate), accrueOn: r.accrueOn, reason: '',
  })
  const drawn = form ? fieldsDrawn(form.basis) : []
  const set = (k: keyof CommissionValues) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f))

  return (
    <>
      <hr className="border-etyme-rule" />
      <div className="space-y-3">
        <p className="eyebrow">Commissions</p>
        {data.says && <p className="text-[13px] text-etyme-muted">{data.says}</p>}
        {data.rows.map((r) => (
          <div key={r.id} className="card space-y-1 text-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-etyme-ink">{r.kindSays} · {r.earnedBy.name}</span>
              {data.mayEdit && <button type="button" className="text-[12px] text-etyme-action" onClick={() => edit(r)}>Change</button>}
            </div>
            <p className="text-etyme-muted">{r.termsSay}, from {day(r.fromDate)}{r.toDate ? ` to ${day(r.toDate)}` : ''}.</p>
            {r.thisMonth && (
              <p className="text-etyme-muted">
                This month: <span className="tabular-nums text-etyme-ink">{r.thisMonth.amountCents == null ? 'no figure' : amount(r.thisMonth.amountCents, r.thisMonth.currency ?? data.currency)}</span>. {r.thisMonth.says}
              </p>
            )}
            <p className="text-[12px] text-etyme-faint">Set by {r.setBy.name} on {day(r.setAt)}: {r.reason}</p>
          </div>
        ))}
        {data.mayEdit && !form && (
          <div className="flex flex-wrap gap-2">
            {data.side === 'SELL' && (
              <button type="button" className="btn-secondary" onClick={() => setForm(blank('SALES', data.startDate))}>Add a sales commission</button>
            )}
            {data.buyContractIds.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setForm(blank('RECRUITING', data.startDate))}>Add a recruiting commission</button>
            )}
          </div>
        )}
        {form && (
          <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
            <p className="text-[13px] text-etyme-ink">{form.kind === 'SALES' ? 'Sales commission, on the sell line' : 'Recruiting commission, on the buy line'}</p>
            <Field label="Who earns it">
              <Select value={form.earnedById} onChange={set('earnedById')}>
                <option value="">Choose a person</option>
                {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Worked out from">
              <Select value={form.basis} onChange={set('basis')}>
                {BASES.map((b) => <option key={b} value={b}>{BASIS_WORD[b]}</option>)}
              </Select>
            </Field>
            {drawn.includes('rateBps') && (
              <Field label="Share, as a percentage"><Input inputMode="decimal" value={form.percent} onChange={set('percent')} placeholder="10" /></Field>
            )}
            {drawn.includes('amountCents') && (
              <Field label={`Amount, in ${data.currency}`}><Input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="2.50" /></Field>
            )}
            <Field label={`Cap, in ${data.currency}`} help="The most it ever pays in total. Empty for no cap.">
              <Input inputMode="decimal" value={form.cap} onChange={set('cap')} />
            </Field>
            <Field label="Counts from"><Input type="date" value={form.fromDate} onChange={set('fromDate')} /></Field>
            <Field label="Counts until" help="Empty while the line runs."><Input type="date" value={form.toDate} onChange={set('toDate')} /></Field>
            <Field label="Earned">
              <Select value={form.accrueOn} onChange={set('accrueOn')}>
                {(['ACCEPTED', 'CASH'] as const).map((a) => <option key={a} value={a}>{ACCRUAL_WORD[a]}</option>)}
              </Select>
            </Field>
            <Field label="Why" help="Kept with the commission, beside who set it and when.">
              <Textarea rows={2} value={form.reason} onChange={set('reason')} />
            </Field>
            <div className="flex gap-2">
              <SubmitButton pending={busy} pendingLabel="Saving…">Save</SubmitButton>
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Not now</button>
            </div>
          </form>
        )}
        {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
      </div>
    </>
  )
}
