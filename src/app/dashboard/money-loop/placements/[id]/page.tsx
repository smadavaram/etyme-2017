'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { FormMessage } from '@/components/ui/form'
import { LedgerRows, type LedgerRow } from '@/components/ui/ledger-rows'
import { amount } from '@/lib/money-display'
import { formatMonth } from '@/lib/format-date'
import { LOOP_HREF, STATE_STRIP, historySays, periodHref, placementHref, stateLabel } from '@/lib/money-loop'
import { AdvanceForm, ResolveForm } from '../../advance-form'
import { DecisionLink, MonthPicker, StateChip, dayWords, stated, type Amounts } from '../../parts'

/**
 * One placement and its month (record 107, B3): the consultant, the
 * client, the agreed rate and its start, a link to the contract's own page
 * for its documents, the month's state strip with the current state
 * marked, the one form that makes the next move, and the chain's ledger.
 * Rate history is drawn only where a change is on record.
 */

interface Data {
  month: string
  monthWords: string
  placement: { sellContractId: string; consultant: string; client: string; agreedRate: { cents: number; currency: string } | null; start: string | null; end: string | null; currency: string }
  rateWithheld: string | null
  rateHistory: { id: string; cents: number; currency: string; from: string | null; to: string | null; reason: string | null }[]
  contractHref: string
  chain: {
    id: string; state: string; label: string; amounts: Amounts; source: string | null; asOf: string | null
    stateBeforeDispute: string | null
    next: { to: string; button: string; amountLabel: string | null } | null
    dispute: { decisionId: string; open: boolean; ownerName: string } | null
  } | null
  ledger: LedgerRow[]
  months: { month: string; label: string }[]
  mayRun: boolean
  people: { id: string; name: string }[]
  entities: { id: string; name: string }[]
}

export default function PlacementMonthPage() {
  const section = usePageSection(LOOP_HREF)
  const { id } = useParams<{ id: string }>()
  const [month, setMonth] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => { setMonth(new URLSearchParams(window.location.search).get('month')); setReady(true) }, [])

  const load = useCallback(async () => {
    if (!ready) return
    try {
      const body = await readJson(await fetch(`/api/money-loop/placements/${id}${month ? `?month=${month}` : ''}`))
      setData(body.data); setLoadErr(null)
    } catch (e: any) {
      setLoadErr(e.message)
    }
  }, [id, month, ready])
  useEffect(() => { load() }, [load])

  function choose(m: string) {
    window.history.replaceState(null, '', placementHref(id, m))
    setSaid(null); setMonth(m)
  }
  const done = async (message: string) => { setSaid(message); await load() }

  if (loadErr) return <ErrorState says={loadErr} />
  if (!data) return <LoadingState says="Opening the placement…" />
  const p = data.placement
  const c = data.chain
  // While disputed, the strip marks the state the month was in when the amounts disagreed.
  const marked = c ? (c.state === 'DISPUTED' ? c.stateBeforeDispute : c.state) : null

  return (
    <>
      <PageHead
        eyebrow={section}
        title={`${p.consultant} at ${p.client}`}
        subtitle={`Started ${dayWords(p.start)}${p.end ? ` · ends ${dayWords(p.end)}` : ''}`}
        actions={<Link href={`${LOOP_HREF}?month=${data.month}` as any} className="btn-secondary text-[13px]">Back to consultants</Link>}
      />

      <Panel title="The placement">
        <dl className="grid sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[14px]">
          <dt className="text-etyme-muted">Consultant</dt><dd>{p.consultant}</dd>
          <dt className="text-etyme-muted">Client</dt><dd>{p.client}</dd>
          <dt className="text-etyme-muted">Agreed rate</dt>
          <dd className="tabular-nums">{p.agreedRate ? `${amount(p.agreedRate.cents, p.agreedRate.currency)} an hour, from ${dayWords(p.start)}` : data.rateWithheld}</dd>
          <dt className="text-etyme-muted">Documents</dt>
          <dd><Link href={data.contractHref as any} className="text-etyme-action hover:underline">Open the contract for its documents</Link></dd>
        </dl>
        {data.rateHistory.length > 0 && (
          <div className="mt-4">
            <p className="text-[12px] text-etyme-muted mb-1">Rate history</p>
            <ul className="text-[14px] tabular-nums">
              {data.rateHistory.map((h) => (
                <li key={h.id} className="py-1">
                  {amount(h.cents, h.currency)} an hour from {dayWords(h.from)}{h.to ? ` to ${dayWords(h.to)}` : ''}{h.reason ? ` · ${h.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={data.month} onChange={choose} />
        <Link href={periodHref(data.month) as any} className="text-[13px] text-etyme-action hover:underline">Everybody’s {data.monthWords}</Link>
      </div>

      <Panel title={data.monthWords} action={c ? <StateChip state={c.state} label={c.label} /> : undefined}>
        {!c && (
          <p className="text-[14px] text-etyme-muted">
            {data.monthWords} is not opened for {p.consultant}. A seat that runs payroll opens the month on the consultants page, or loads a past month as closed on the month’s page.
          </p>
        )}
        {c && (
          <>
            <ol className="flex flex-wrap gap-1.5 text-[13px]" aria-label="Where this month stands">
              {STATE_STRIP.map((s) => (
                <li key={s} aria-current={s === marked ? 'step' : undefined}
                  className={`px-2.5 py-1 rounded border ${s === marked ? 'border-etyme-ink bg-etyme-ink text-white' : 'border-etyme-rule bg-etyme-surface text-etyme-muted'}`}>
                  {stateLabel(s)}
                </li>
              ))}
            </ol>
            <dl className="mt-4 grid sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[14px] tabular-nums">
              <dt className="text-etyme-muted">Stated on the timesheet</dt><dd>{stated(c.amounts.timesheet)}</dd>
              <dt className="text-etyme-muted">Invoiced</dt><dd>{stated(c.amounts.invoiced)}</dd>
              <dt className="text-etyme-muted">Paid</dt><dd>{stated(c.amounts.paid)}</dd>
            </dl>
            {c.source && c.asOf && <p className="mt-3 text-[14px] text-etyme-muted">{historySays(c.source, dayWords(c.asOf))}</p>}
            {c.dispute && (
              <p className="mt-3 text-[14px] text-etyme-attention">
                Disputed: two stated amounts do not agree. The decision is owed by {c.dispute.ownerName}.{' '}
                <DecisionLink id={c.dispute.decisionId}>{c.dispute.open ? 'Open the decision' : 'Read the recorded decision'}</DecisionLink>
              </p>
            )}
            {said && <div className="mt-3"><FormMessage tone="ok">{said}</FormMessage></div>}
            {c.next && (
              <div className="mt-5">
                <AdvanceForm key={`${c.id}:${c.next.to}`} chainId={c.id} next={c.next} currency={p.currency} people={data.people} entities={data.entities} onDone={done} />
              </div>
            )}
            {data.mayRun && c.dispute && !c.dispute.open && (
              <div className="mt-5"><ResolveForm chainId={c.id} entities={data.entities} onDone={done} /></div>
            )}
            {data.mayRun && c.dispute?.open && (
              <p className="mt-3 text-[13px] text-etyme-muted">This month moves again once that decision is approved or rejected.</p>
            )}
            {!data.mayRun && c.state !== 'CONFIRMED_CLOSED' && (
              <p className="mt-3 text-[13px] text-etyme-muted">A seat that runs payroll makes the next move.</p>
            )}
          </>
        )}
      </Panel>

      {c && (
        <div className="mt-5">
          <Panel title="Ledger" subtitle="Every move on this month, oldest first.">
            <LedgerRows rows={data.ledger} />
          </Panel>
        </div>
      )}

      {data.months.length > 1 && (
        <p className="mt-5 text-[13px] text-etyme-muted">
          Other months:{' '}
          {data.months.filter((m) => m.month !== data.month).map((m, i) => (
            <span key={m.month}>{i > 0 ? ' · ' : ''}<button type="button" className="text-etyme-action hover:underline" onClick={() => choose(m.month)}>{formatMonth(m.month)}, {m.label}</button></span>
          ))}
        </p>
      )}
    </>
  )
}
