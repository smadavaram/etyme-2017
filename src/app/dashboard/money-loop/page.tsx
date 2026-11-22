'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { SubmitButton, FormMessage } from '@/components/ui/form'
import { amount } from '@/lib/money-display'
import { LOOP_HREF, START_MONTH, openMonthBody, periodHref, placementHref, seeMonth } from '@/lib/money-loop'
import { EntityField, MonthPicker, StateChip, dayWords } from './parts'

/**
 * The firm's billing consultants, each as her placement (record 107, B2):
 * the consultant, the client, the agreed rate, the start, and where the
 * chosen month stands, in the trade's words. A month nobody has started
 * says what it waits on, and a seat that runs payroll starts it here: the
 * form is drawn only where the route would take it (`mayStart`), so never
 * for a month that has not begun. Two buttons, two words: "Start this
 * month" creates the records, "See <month>" goes to the month's page. At
 * phone width each consultant stacks as lines and nothing scrolls sideways.
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
  mayStart: boolean
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
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; says: string; field?: string } | null>(null)

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
      setSaid({ tone: 'error', says: e.message, field: e.field })
    } finally {
      setBusy(false)
    }
  }

  if (loadErr) return <ErrorState says={loadErr} />
  if (!data) return <LoadingState says="Opening the month…" />
  const hasEntities = data.entities.length > 0
  // The route's sentence about the entity is shown on its box; any other, and good news, above the form.
  const onEntity = said?.tone === 'error' && said.field === 'actingEntityId' && hasEntities && data.mayStart
  const monthState = (r: Row) => (r.chain ? <StateChip state={r.chain.state} label={r.chain.label} /> : <span className="text-etyme-muted">Not started</span>)

  return (
    <>
      <PageHead
        eyebrow={section}
        title="Timesheet to payment"
        subtitle={`Each billing consultant’s month, from timesheet owed to closed. ${data.monthWords}.`}
        actions={<Link href={periodHref(data.month) as any} className="btn-secondary text-[13px]">{seeMonth(data.monthWords)}</Link>}
      />
      <div className="mb-5"><MonthPicker month={data.month} onChange={choose} /></div>

      {data.emptySays && <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-etyme-muted">{data.emptySays}</p>}
      {said && !onEntity && <div className="mb-4"><FormMessage tone={said.tone}>{said.says}</FormMessage></div>}

      {data.mayStart && (
        <form onSubmit={open} className="mb-6 grid gap-4 max-w-[620px]">
          {!data.emptySays && (
            <p className="text-[14px] text-etyme-muted">
              {data.notOpened === 1 ? '1 consultant on a running contract has' : `${data.notOpened} consultants on a running contract have`} no month started yet.
            </p>
          )}
          {hasEntities && <EntityField id="ml-open-entity" entities={data.entities} value={entity} onChange={setEntity} error={onEntity ? said!.says : undefined} />}
          <div><SubmitButton pending={busy}>{START_MONTH}</SubmitButton></div>
        </form>
      )}

      {data.placements.length > 0 && (
        <Panel title="Consultants" subtitle={data.rateWithheld ?? undefined}>
          <table className="hidden sm:table w-full text-[14px] tabular-nums">
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
                    <td className="py-2">{monthState(r)}</td>
                  </tr>
                ))}
              </tbody>
          </table>
          <ul className="sm:hidden text-[14px] tabular-nums" aria-label="Consultants">
            {data.placements.map((r) => (
              <li key={r.sellContractId} className="py-3 border-b border-etyme-rule last:border-0">
                <p><Link href={placementHref(r.sellContractId, data.month) as any} className="text-etyme-action hover:underline">{r.consultant}</Link></p>
                <p className="text-etyme-muted">{r.client}</p>
                {!data.rateWithheld && r.agreedRate && <p className="text-etyme-muted">{amount(r.agreedRate.cents, r.agreedRate.currency)} an hour</p>}
                <p className="text-etyme-muted">Started {dayWords(r.start)}</p>
                <p className="mt-1">{data.monthWords}: {monthState(r)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
