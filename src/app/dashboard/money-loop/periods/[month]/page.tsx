'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { Field, Input, Select, SubmitButton, FormMessage } from '@/components/ui/form'
import { amount } from '@/lib/money-display'
import { LOOP_HREF, TOTAL_LABEL, disputedShareSays, loadBody, loadFields, periodHref, placementHref, type LoadTyped } from '@/lib/money-loop'
import { DecisionLink, EntityField, MonthPicker, StateChip, stated, type Amounts } from '../../parts'

/**
 * One month for every consultant (record 107, B4, B5 and B6). On top, the
 * payroll summary: the count per state, the total stated on timesheets per
 * currency (never two currencies added, and never an amount Etyme worked
 * out, with how much of it is on disputed months), and the open disputes
 * with their owners. Under it every consultant's month: a live one offers
 * its next move, a past one says it was loaded as history, a disagreement
 * reads "Disputed" and links to its decision, and one returned from a
 * dispute keeps the link to the decision recorded. A past month is loaded
 * as closed with the form at the foot, one consultant at a time: the form
 * is drawn only for a month that has fully ended (`load.offered`), and
 * says why otherwise. At phone width each consultant stacks as lines and
 * nothing scrolls sideways.
 */

interface ChainRow {
  chainId: string
  sellContractId: string
  consultant: string
  client: string
  state: string
  label: string
  amounts: Amounts
  history: string | null
  next: string | null
  dispute: { decisionId: string; open: boolean; ownerName: string; question: string } | null
  decided: { decisionId: string; says: string } | null
}

interface Data {
  month: string
  monthWords: string
  chains: ChainRow[]
  summary: {
    counts: { state: string; label: string; count: number }[]
    statedTotals: { currency: string; cents: number }[]
    disputedTotals: { currency: string; cents: number; months: number }[]
    notStated: number
  }
  load: { offered: boolean; says: string | null; earliest: string; latest: string }
  loadable: { sellContractId: string; name: string; currency: string }[]
  today: string
  mayRun: boolean
  entities: { id: string; name: string }[]
}

export default function PeriodPage() {
  const section = usePageSection(LOOP_HREF)
  const { month } = useParams<{ month: string }>()
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/money-loop/periods/${month}`))
      setData(body.data); setLoadErr(null)
    } catch (e: any) {
      setLoadErr(e.message)
    }
  }, [month])
  useEffect(() => { load() }, [load])

  if (loadErr) return <ErrorState says={loadErr} />
  if (!data) return <LoadingState says="Opening the month…" />
  const open = data.chains.filter((c) => c.dispute?.open)
  const nextOf = (c: ChainRow) => (
    c.dispute
      ? <DecisionLink id={c.dispute.decisionId}>{c.dispute.open ? 'Open the decision' : 'Decision recorded'}</DecisionLink>
      : c.next
        ? <Link href={placementHref(c.sellContractId, data.month) as any} className="text-etyme-action hover:underline">{c.next}</Link>
        : null
  )
  // A month returned from a dispute keeps the link to its recorded decision.
  const decidedOf = (c: ChainRow) => (c.decided && !c.dispute ? <DecisionLink id={c.decided.decisionId}>{c.decided.says}</DecisionLink> : null)

  return (
    <>
      <PageHead
        eyebrow={section}
        title={data.monthWords}
        subtitle="Every consultant’s month, with the amounts people stated."
        actions={<Link href={`${LOOP_HREF}?month=${data.month}` as any} className="btn-secondary text-[13px]">Back to consultants</Link>}
      />
      <div className="mb-5"><MonthPicker month={data.month} onChange={(m) => router.push(periodHref(m) as any)} /></div>

      <Panel title="Payroll summary">
        {data.chains.length === 0 ? (
          <p className="text-[14px] text-etyme-muted">
            Nobody’s {data.monthWords} is started yet. A seat that runs payroll starts a live month on the consultants page, or loads a past one as closed below.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] tabular-nums" aria-label="Consultants in each state">
              {data.summary.counts.map((c) => (
                <li key={c.state} className={c.count === 0 ? 'text-etyme-faint' : c.state === 'DISPUTED' ? 'text-etyme-attention' : 'text-etyme-ink'}>{c.label}: {c.count}</li>
              ))}
            </ul>
            <dl className="mt-4 text-[14px]">
              <dt className="text-etyme-muted">{TOTAL_LABEL}</dt>
              {data.summary.statedTotals.length === 0 && <dd>No timesheet states an amount yet.</dd>}
              {data.summary.statedTotals.map((t) => {
                const disputed = data.summary.disputedTotals.find((d) => d.currency === t.currency)
                return (
                  <dd key={t.currency}>
                    <span className="tabular-nums text-[18px] text-etyme-ink">{amount(t.cents, t.currency)}</span> <span className="text-[12px] text-etyme-muted">{t.currency}</span>
                    {disputed && <span className="block text-[13px] text-etyme-attention tabular-nums">{disputedShareSays(amount(disputed.cents, disputed.currency), disputed.months)}</span>}
                  </dd>
                )
              })}
              {data.summary.notStated > 0 && (
                <dd className="text-[13px] text-etyme-muted">
                  {data.summary.notStated === 1 ? '1 consultant’s timesheet states' : `${data.summary.notStated} consultants’ timesheets state`} no amount yet, and is left out. People typed these amounts; Etyme worked none of them out.
                </dd>
              )}
            </dl>
            <div className="mt-4">
              <p className="text-[12px] text-etyme-muted mb-1">Open disputes</p>
              {open.length === 0 ? <p className="text-[14px] text-etyme-muted">None.</p> : (
                <ul className="text-[14px]">
                  {open.map((c) => (
                    <li key={c.chainId} className="py-1">
                      <DecisionLink id={c.dispute!.decisionId}>{c.dispute!.question}</DecisionLink>
                      <span className="text-etyme-muted"> · owed by {c.dispute!.ownerName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </Panel>

      {data.chains.length > 0 && (
        <div className="mt-5">
          <Panel title="Consultants">
            <table className="hidden sm:table w-full text-[14px] tabular-nums">
                <thead>
                  <tr className="text-left text-[12px] text-etyme-muted border-b border-etyme-rule">
                    <th className="py-2 pr-3 font-normal">Consultant</th>
                    <th className="py-2 pr-3 font-normal">State</th>
                    <th className="py-2 pr-3 font-normal text-right">Timesheet</th>
                    <th className="py-2 pr-3 font-normal text-right">Invoiced</th>
                    <th className="py-2 pr-3 font-normal text-right">Paid</th>
                    <th className="py-2 font-normal">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {data.chains.map((c) => (
                    <tr key={c.chainId} className="border-b border-etyme-rule last:border-0 align-top">
                      <td className="py-2 pr-3">
                        <Link href={placementHref(c.sellContractId, data.month) as any} className="text-etyme-action hover:underline">{c.consultant}</Link>
                        <span className="block text-[12px] text-etyme-muted">{c.client}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <StateChip state={c.state} label={c.label} />
                        {c.history && <span className="block mt-1 text-[12px] text-etyme-muted">{c.history}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{stated(c.amounts.timesheet)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{stated(c.amounts.invoiced)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{stated(c.amounts.paid)}</td>
                      <td className="py-2">
                        {nextOf(c) ?? <span className="text-etyme-muted">—</span>}
                        {decidedOf(c) && <span className="block mt-1 text-[12px]">{decidedOf(c)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
            <ul className="sm:hidden text-[14px] tabular-nums" aria-label="Consultants">
              {data.chains.map((c) => (
                <li key={c.chainId} className="py-3 border-b border-etyme-rule last:border-0">
                  <p><Link href={placementHref(c.sellContractId, data.month) as any} className="text-etyme-action hover:underline">{c.consultant}</Link></p>
                  <p className="text-[12px] text-etyme-muted">{c.client}</p>
                  <p className="mt-1"><StateChip state={c.state} label={c.label} /></p>
                  {c.history && <p className="mt-1 text-[12px] text-etyme-muted">{c.history}</p>}
                  <p className="mt-1 text-etyme-muted">Timesheet: <span className="text-etyme-ink">{stated(c.amounts.timesheet)}</span></p>
                  <p className="text-etyme-muted">Invoiced: <span className="text-etyme-ink">{stated(c.amounts.invoiced)}</span></p>
                  <p className="text-etyme-muted">Paid: <span className="text-etyme-ink">{stated(c.amounts.paid)}</span></p>
                  {nextOf(c) && <p className="mt-1">{nextOf(c)}</p>}
                  {decidedOf(c) && <p className="mt-1 text-[12px]">{decidedOf(c)}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {data.mayRun && (
        <div className="mt-5">
          <Panel title="Load a past month as closed" subtitle={`One consultant at a time, for ${data.monthWords}. The three amounts must agree, and the ledger says it was loaded as history.`}>
            {!data.load.offered
              ? <p className="text-[14px] text-etyme-muted">{data.load.says}</p>
              : data.loadable.length === 0
                ? <p className="text-[14px] text-etyme-muted">Every consultant whose contract ran in {data.monthWords} already has this month on record.</p>
                : <LoadForm data={data} onDone={load} />}
          </Panel>
        </div>
      )}
    </>
  )
}

function LoadForm({ data, onDone }: { data: Data; onDone: () => Promise<void> }) {
  const hasEntities = data.entities.length > 0
  const draws = loadFields(hasEntities)
  const [f, setF] = useState<Partial<LoadTyped>>({ currency: 'USD' })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; says: string; field?: string } | null>(null)
  const set = (k: keyof LoadTyped) => (v: string) => setF((was) => ({ ...was, [k]: v }))
  const at = (k: keyof LoadTyped) => (said?.tone === 'error' && said.field === k ? said.says : undefined)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setSaid(null)
    try {
      const body = await readJson(await fetch(`/api/money-loop/periods/${data.month}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loadBody(f)),
      }))
      setF({ currency: f.currency })
      setSaid({ tone: 'ok', says: body.data.message })
      await onDone()
    } catch (e: any) {
      setSaid({ tone: 'error', says: e.message, field: e.field })
    } finally {
      setBusy(false)
    }
  }

  const money = (k: 'timesheetAmount' | 'invoicedAmount' | 'paidAmount', label: string) => (
    <Field label={label} id={`ml-load-${k}`} error={at(k)}>
      <Input id={`ml-load-${k}`} inputMode="decimal" value={f[k] ?? ''} onChange={(e) => set(k)(e.target.value)} />
    </Field>
  )

  return (
    <form onSubmit={save} className="grid gap-4 max-w-[620px]">
      <Field label="Consultant" id="ml-load-who" error={at('sellContractId')}>
        <Select id="ml-load-who" value={f.sellContractId ?? ''}
          onChange={(e) => { const l = data.loadable.find((x) => x.sellContractId === e.target.value); setF((was) => ({ ...was, sellContractId: e.target.value, currency: l?.currency ?? was.currency })) }}>
          <option value="">Choose a consultant</option>
          {data.loadable.map((l) => <option key={l.sellContractId} value={l.sellContractId}>{l.name}</option>)}
        </Select>
      </Field>
      <Field label="Where this history came from" help="Such as the payroll sheet or the bank statement it was read from." id="ml-load-source" error={at('source')}>
        <Input id="ml-load-source" value={f.source ?? ''} onChange={(e) => set('source')(e.target.value)} />
      </Field>
      <Field label="The day this was true" help="From the month’s last day to today." id="ml-load-asof" error={at('asOf')}>
        <Input id="ml-load-asof" type="date" min={data.load.earliest} max={data.load.latest} value={f.asOf ?? ''} onChange={(e) => set('asOf')(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        {money('timesheetAmount', 'Amount the timesheet states')}
        {money('invoicedAmount', 'Amount invoiced')}
        {money('paidAmount', 'Amount paid')}
      </div>
      <Field label="Currency" id="ml-load-currency" className="max-w-[7rem]" error={at('currency')}>
        <Input id="ml-load-currency" maxLength={3} value={f.currency ?? ''} onChange={(e) => set('currency')(e.target.value.toUpperCase())} />
      </Field>
      {draws.includes('actingEntityId') && <EntityField id="ml-load-entity" entities={data.entities} value={f.actingEntityId ?? ''} onChange={set('actingEntityId')} error={at('actingEntityId')} />}
      {said && !(said.tone === 'error' && draws.includes(said.field as keyof LoadTyped)) && <FormMessage tone={said.tone}>{said.says}</FormMessage>}
      <div><SubmitButton pending={busy}>Load this month as closed</SubmitButton></div>
    </form>
  )
}
