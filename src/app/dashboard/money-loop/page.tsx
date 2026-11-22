'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { SubmitButton, FormMessage } from '@/components/ui/form'
import { amount } from '@/lib/money-display'
import { LOOP_HREF, openMonthBody, periodHref, placementHref } from '@/lib/money-loop'
import { EntityField, MonthPicker, StateChip, dayWords } from './parts'

/**
 * The firm's billing consultants, each as her placement (record 107, B2):
 * the consultant, the client, the agreed rate, the start, and where the
 * chosen month stands, in the trade's words. A month nobody has opened
 * says what it waits on, and a seat that runs payroll opens it here.
 */

interface Row {
  sellContractId: string
  consultant: string
  client: string
  agreedRate: { cents: number; currency: string } | null
  start: string | null
  chain: { id: string; state: string; label: string } | null
}

interface Data {
  month: string
  monthWords: string
  placements: Row[]
  notOpened: number
  mayRun: boolean
  entities: { id: string; name: string }[]
  rateWithheld: string | null
  emptySays: string | null
}

export default function MoneyLoopPage() {
  const section = usePageSection(LOOP_HREF)
  const [month, setMonth] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [entity, setEntity] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)

  // The month lives in the address, so a refresh keeps it.
  useEffect(() => { setMonth(new URLSearchParams(window.location.search).get('month')); setReady(true) }, [])

  const load = useCallback(async () => {
    if (!ready) return
    try {
      const body = await readJson(await fetch(`/api/money-loop${month ? `?month=${month}` : ''}`))
      setData(body.data); setLoadErr(null)
    } catch (e: any) {
      setLoadErr(e.message)
    }
  }, [month, ready])
  useEffect(() => { load() }, [load])

  function choose(m: string) {
    window.history.replaceState(null, '', `${LOOP_HREF}?month=${m}`)
    setSaid(null); setMonth(m)
  }

  async function open(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setBusy(true); setSaid(null)
    try {
      const body = await readJson(await fetch('/api/money-loop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(openMonthBody({ month: data.month, actingEntityId: entity })),
      }))
      setSaid({ tone: 'ok', says: body.data.message })
      await load()
    } catch (e: any) {
      setSaid({ tone: 'error', says: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (loadErr) return <ErrorState says={loadErr} />
  if (!data) return <LoadingState says="Opening the month…" />
  const hasEntities = data.entities.length > 0

  return (
    <>
      <PageHead
        eyebrow={section}
        title="Timesheet to payment"
        subtitle={`Each billing consultant’s month, from timesheet owed to closed. ${data.monthWords}.`}
        actions={<Link href={periodHref(data.month) as any} className="btn-secondary text-[13px]">Open {data.monthWords}</Link>}
      />
      <div className="mb-5"><MonthPicker month={data.month} onChange={choose} /></div>

      {data.emptySays && <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-etyme-muted">{data.emptySays}</p>}
      {said && <div className="mb-4"><FormMessage tone={said.tone}>{said.says}</FormMessage></div>}

      {data.mayRun && data.notOpened > 0 && (
        <form onSubmit={open} className="mb-6 grid gap-4 max-w-[620px]">
          {!data.emptySays && (
            <p className="text-[14px] text-etyme-muted">
              {data.notOpened === 1 ? '1 consultant on a running contract has' : `${data.notOpened} consultants on a running contract have`} no month opened yet.
            </p>
          )}
          {hasEntities && <EntityField id="ml-open-entity" entities={data.entities} value={entity} onChange={setEntity} />}
          <div><SubmitButton pending={busy}>Open this month’s chains</SubmitButton></div>
        </form>
      )}

      {data.placements.length > 0 && (
        <Panel title="Consultants" subtitle={data.rateWithheld ?? undefined}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] tabular-nums">
              <thead>
                <tr className="text-left text-[12px] text-etyme-muted border-b border-etyme-rule">
                  <th className="py-2 pr-3 font-normal">Consultant</th>
                  <th className="py-2 pr-3 font-normal">Client</th>
                  {!data.rateWithheld && <th className="py-2 pr-3 font-normal">Agreed rate</th>}
                  <th className="py-2 pr-3 font-normal">Start</th>
                  <th className="py-2 font-normal">{data.monthWords}</th>
                </tr>
              </thead>
              <tbody>
                {data.placements.map((r) => (
                  <tr key={r.sellContractId} className="border-b border-etyme-rule last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <Link href={placementHref(r.sellContractId, data.month) as any} className="text-etyme-action hover:underline">{r.consultant}</Link>
                    </td>
                    <td className="py-2 pr-3">{r.client}</td>
                    {!data.rateWithheld && <td className="py-2 pr-3 whitespace-nowrap">{r.agreedRate ? `${amount(r.agreedRate.cents, r.agreedRate.currency)} an hour` : '—'}</td>}
                    <td className="py-2 pr-3 whitespace-nowrap">{dayWords(r.start)}</td>
                    <td className="py-2">{r.chain ? <StateChip state={r.chain.state} label={r.chain.label} /> : <span className="text-etyme-muted">Not opened</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}
