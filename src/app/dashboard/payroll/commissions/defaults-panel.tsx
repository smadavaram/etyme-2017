'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Check, Field, Input, Select, SubmitButton } from '@/components/ui'
import { BASIS_WORD, ACCRUAL_WORD, BASES, ACCRUALS, IS_SHARE, KINDS, KIND_WORD, type CommissionKind } from '@/lib/money/commission-rows'
import { defaultsBody, typedFrom, type StoredDefaults, type TypedDefault } from '@/lib/money/commission-defaults'

/**
 * The firm's default commission rates, on Payroll → Commissions.
 *
 * The award writes a sales commission on the sell line for whoever sold
 * the deal, and a recruiting commission on the buy line for whoever put
 * the person forward, from these. None is the shipped default. The Owner
 * or a Contract Manager sets them; payroll reads them.
 */

export interface DefaultsRead {
  currency: string
  mayEdit: boolean
  set: StoredDefaults
  lines: string[]
}

const SAYS_FOR: Record<CommissionKind, string> = {
  SALES: 'Earned by whoever sold the deal, on the sell line.',
  RECRUITING: 'Earned by whoever put the person forward, on the buy line.',
}

export function DefaultsPanel({ read, onSaved }: { read: DefaultsRead; onSaved: (next: DefaultsRead) => void }) {
  const [typed, setTyped] = useState<Record<CommissionKind, TypedDefault>>(() => ({
    SALES: typedFrom(read.set.SALES, read.currency),
    RECRUITING: typedFrom(read.set.RECRUITING, read.currency),
  }))
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ field: string | null; says: string } | null>(null)

  const set = (kind: CommissionKind, patch: Partial<TypedDefault>) =>
    setTyped((t) => ({ ...t, [kind]: { ...t[kind], ...patch } }))
  const errorOn = (field: string) => (refusal?.field === field ? refusal.says : undefined)

  async function save() {
    setBusy(true)
    setSaid(null)
    setRefusal(null)
    try {
      const res = await fetch('/api/payroll/commissions', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaults: defaultsBody(typed, read.currency) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setRefusal({ field: body?.error?.field ?? null, says: body?.error?.message ?? 'That was not saved.' })
        return
      }
      const body = await readJson(res)
      setSaid(body.data.says)
      onSaved(body.data.defaults)
    } catch (err: any) {
      setRefusal({ field: null, says: err.message })
    } finally { setBusy(false) }
  }

  if (!read.mayEdit) {
    return (
      <section className="panel space-y-1">
        <p className="lbl">Default commission rates</p>
        {read.lines.map((l) => <p key={l} className="text-[13px] text-etyme-ink">{l}</p>)}
        <p className="text-[12px] text-etyme-muted">The Owner or a Contract Manager sets these.</p>
      </section>
    )
  }

  return (
    <form className="panel space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div>
        <p className="lbl">Default commission rates</p>
        <p className="text-[12px] text-etyme-muted">
          What a new placement carries when it is awarded. Change one on the line itself where a deal differs.
        </p>
      </div>
      {KINDS.map((kind) => {
        const t = typed[kind]
        const share = IS_SHARE[t.basis as keyof typeof IS_SHARE] ?? false
        return (
          <fieldset key={kind} className="space-y-2 border-t border-etyme-rule pt-3 first-of-type:border-t-0 first-of-type:pt-0">
            <Check
              label={`${KIND_WORD[kind]} by default`}
              checked={t.on}
              onChange={(e) => set(kind, { on: e.target.checked })}
            />
            <p className="text-[12px] text-etyme-muted">{SAYS_FOR[kind]}</p>
            {t.on && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Worked out from" error={errorOn(`${kind}.basis`)}>
                  <Select value={t.basis} onChange={(e) => set(kind, { basis: e.target.value })}>
                    {BASES.map((b) => <option key={b} value={b}>{BASIS_WORD[b]}</option>)}
                  </Select>
                </Field>
                {share ? (
                  <Field label="Share, as a percentage" error={errorOn(`${kind}.rateBps`)}>
                    <Input inputMode="decimal" value={t.percent} onChange={(e) => set(kind, { percent: e.target.value })} placeholder="5" />
                  </Field>
                ) : (
                  <Field label={`Amount, in ${read.currency}`} error={errorOn(`${kind}.amountCents`)}>
                    <Input inputMode="decimal" value={t.fixed} onChange={(e) => set(kind, { fixed: e.target.value })} placeholder="2.50" />
                  </Field>
                )}
                <Field label={`Cap per placement, in ${read.currency}`} help="Leave empty for no cap." error={errorOn(`${kind}.capCents`)}>
                  <Input inputMode="decimal" value={t.cap} onChange={(e) => set(kind, { cap: e.target.value })} />
                </Field>
                <Field label="Earned" error={errorOn(`${kind}.accrueOn`)}>
                  <Select value={t.accrueOn} onChange={(e) => set(kind, { accrueOn: e.target.value })}>
                    {ACCRUALS.map((a) => <option key={a} value={a}>{ACCRUAL_WORD[a]}</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </fieldset>
        )
      })}
      {refusal && <p className="text-[13px] text-etyme-danger" role="alert">{refusal.says}</p>}
      {said && <p className="text-[13px] text-etyme-ink" role="status">{said}</p>}
      <div className="space-y-1">
        {read.lines.map((l) => <p key={l} className="text-[12px] text-etyme-muted">{l}</p>)}
      </div>
      <SubmitButton pending={busy} pendingLabel="Saving…">Save the defaults</SubmitButton>
    </form>
  )
}
