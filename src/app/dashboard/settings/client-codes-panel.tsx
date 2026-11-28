'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lbl, Panel } from '@/components/ui'
import { SubmitButton } from '@/components/ui/form'
import { COMPANY_CODE_HELP, COST_OBJECT_KIND_WORDS } from '@/lib/counterparty'

export type SendFn = (path: string, method: string, payload?: unknown) => Promise<any>

/** The company code, and the kind of each cost object. Drawn only for the paying client's settings seat. */
export function ClientCodesPanel({ send, busy }: { send: SendFn; busy: boolean }) {
  const [companyCode, setCompanyCode] = useState('')
  const [savedCode, setSavedCode] = useState('')
  const [orders, setOrders] = useState<{ id: string; code: string; name: string; kind: string }[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('INTERNAL_ORDER')
  const kindWord = (k: string) => COST_OBJECT_KIND_WORDS.find((w) => w.value === k)?.label ?? 'Internal order'

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch('/api/settings/coding').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/settings/internal-orders').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    if (a?.data) { setCompanyCode(a.data.companyCode ?? ''); setSavedCode(a.data.companyCode ?? '') }
    if (b?.data) setOrders(b.data.internalOrders)
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <Panel title="Codes for the file you download" subtitle={COMPANY_CODE_HELP}>
      <Lbl>Company code</Lbl>
      <div className="flex gap-2 mt-2 items-center">
        <input value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} placeholder="1000" aria-label="Company code"
          className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
        <SubmitButton
          type="button"
          onClick={async () => { const r = await send('/api/settings/coding', 'PATCH', { companyCode }); if (r) setSavedCode(companyCode.trim()) }}
          pending={busy}
          disabled={companyCode.trim() === savedCode}
          whyDisabled="Change the code first."
        >
          Save
        </SubmitButton>
      </div>

      <div className="border-t border-etyme-rule pt-4 mt-4">
        <Lbl>Other cost objects</Lbl>
        {orders.length > 0 && (
          <div className="divide-y divide-etyme-rule my-2">
            {orders.map((o) => (
              <div key={o.id} className="py-2 flex items-baseline justify-between gap-3">
                <span><span className="text-[13px] font-mono">{o.code}</span><span className="ml-3 text-[13px] text-etyme-muted">{o.name}</span></span>
                <select
                  aria-label={`Kind of ${o.code}`}
                  value={o.kind}
                  onChange={async (e) => { const r = await send('/api/settings/internal-orders', 'PATCH', { id: o.id, kind: e.target.value }); if (r) void load() }}
                  className="px-2 py-1 border border-etyme-rule rounded bg-etyme-raised text-[13px]"
                >
                  {COST_OBJECT_KIND_WORDS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-2 mt-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WBS-4711.02" aria-label="Cost object code"
            className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plant upgrade" aria-label="Cost object name"
            className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm">
            {COST_OBJECT_KIND_WORDS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
        <SubmitButton
          type="button"
          className="mt-3"
          onClick={async () => { const r = await send('/api/settings/internal-orders', 'POST', { code, name, kind }); if (r) { setCode(''); setName(''); setKind('INTERNAL_ORDER'); void load() } }}
          pending={busy}
          disabled={!code.trim() || !name.trim()}
          whyDisabled={!code.trim() && !name.trim() ? 'Type a code and a name first.' : !code.trim() ? 'Type a code first.' : 'Type a name first.'}
        >
          Add {kindWord(kind).toLowerCase()}
        </SubmitButton>
      </div>
    </Panel>
  )
}
