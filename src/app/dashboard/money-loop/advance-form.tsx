'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, Input, Select, SubmitButton, FormMessage } from '@/components/ui/form'
import { advanceBody, advanceFields, resolveBody, type AdvanceTyped } from '@/lib/money-loop'
import { EntityField } from './parts'

/**
 * The one form that makes a month's next move (record 107, B3 and B5). It
 * draws what `advanceFields` names for the move and posts `advanceBody`:
 * the amount a person states and its currency where the move asks one, the
 * legal entity where the firm has any, and who decides a disagreement.
 */
export function AdvanceForm({ chainId, next, currency, people, entities, onDone }: {
  chainId: string
  next: { to: string; button: string; amountLabel: string | null }
  currency: string
  people: { id: string; name: string }[]
  entities: { id: string; name: string }[]
  onDone: (message: string) => void
}) {
  const hasEntities = entities.length > 0
  const draws = advanceFields(next.to, hasEntities)
  const [f, setF] = useState<Partial<AdvanceTyped>>({ currency })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ says: string; field?: string } | null>(null)
  const set = (k: keyof AdvanceTyped) => (v: string) => setF((was) => ({ ...was, [k]: v }))
  const at = (k: keyof AdvanceTyped) => (err?.field === k ? err.says : undefined)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const body = await readJson(await fetch(`/api/money-loop/chains/${chainId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(advanceBody(next.to, f)),
      }))
      setF({ currency })
      onDone(body.data.message)
    } catch (e: any) {
      setErr({ says: e.message, field: e.field })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 max-w-[620px]">
      {draws.includes('amount') && (
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label={next.amountLabel} help="As it is written, such as 16000.00. Etyme works out no amount." id="ml-amount" error={at('amount')}>
            <Input id="ml-amount" inputMode="decimal" value={f.amount ?? ''} onChange={(e) => set('amount')(e.target.value)} />
          </Field>
          <Field label="Currency" id="ml-currency" error={at('currency')}>
            <Input id="ml-currency" maxLength={3} value={f.currency ?? ''} onChange={(e) => set('currency')(e.target.value.toUpperCase())} />
          </Field>
        </div>
      )}
      {draws.includes('actingEntityId') && <EntityField id="ml-entity" entities={entities} value={f.actingEntityId ?? ''} onChange={set('actingEntityId')} />}
      {draws.includes('disputeOwnerPersonId') && (
        <Field label="Who decides if this amount disagrees with one already stated" help="A disagreement opens a decision on the queue, owed by this person." id="ml-owner" error={at('disputeOwnerPersonId')}>
          <Select id="ml-owner" value={f.disputeOwnerPersonId ?? ''} onChange={(e) => set('disputeOwnerPersonId')(e.target.value)}>
            <option value="">Choose a person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      {err && !draws.includes(err.field as keyof AdvanceTyped) && <FormMessage tone="error">{err.says}</FormMessage>}
      <div><SubmitButton pending={busy}>{next.button}</SubmitButton></div>
    </form>
  )
}

/** Returning a disputed month once its decision is recorded: one button, and the entity where the firm has any. */
export function ResolveForm({ chainId, entities, onDone }: { chainId: string; entities: { id: string; name: string }[]; onDone: (message: string) => void }) {
  const [entity, setEntity] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const body = await readJson(await fetch(`/api/money-loop/chains/${chainId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resolveBody(entity)),
      }))
      onDone(body.data.message)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 max-w-[620px]">
      {entities.length > 0 && <EntityField id="ml-resolve-entity" entities={entities} value={entity} onChange={setEntity} />}
      {err && <FormMessage tone="error">{err}</FormMessage>}
      <div><SubmitButton pending={busy}>Return this month from its dispute</SubmitButton></div>
    </form>
  )
}
