'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { saveForm } from '@/lib/form-save'
import { readJson, statusMeans } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { Chip, Field, Input, SubmitButton, FormMessage, RefusedState, LoadingState, ErrorState, Lbl } from '@/components/ui'
import { DetailHead } from '@/components/ui/detail-head'
import { ENGAGEMENT_WORDS, type EngagementType } from '@/lib/award/hire-terms'

/**
 * The person's own terms with the firm that holds them.
 *
 * One page, two readers. The firm's contract desk says how it engages
 * the person and what it pays them; the person reads exactly that and
 * says yes. Nobody starts until both have — a bench listing is consent
 * to be marketed, never consent to be employed (audit, 2026-10-05).
 *
 * Nobody else reaches it: the client, and every firm above in a chain,
 * are refused by the route. The rate on it is the person's own pay.
 */

interface Terms {
  you: 'PERSON' | 'FIRM'
  person: { id: string; name: string; ownCompany: { id: string; name: string } | null }
  firm: { id: string; name: string }
  soldTo: string
  role: string
  placed: boolean
  startDate: string | null
  employee: boolean
  terms: {
    engagementWords: string
    payRateWords: string | null
    firmConfirmedAt: string | null
    personAgreedAt: string | null
  } | null
  onRecord: boolean
  says: string
  waitingOn: 'FIRM' | 'PERSON' | 'BELOW' | null
  placement: { status: string; word: string } | null
  may: { state: boolean; agree: boolean }
}

const CHOICES: EngagementType[] = ['W2', 'IND_1099', 'OWN_COMPANY', 'OTHER_EMPLOYER']

function day(iso: string | null): string {
  if (!iso) return 'not set'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default function TermsPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Terms | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // The route's own sentence when it refuses this reader — the client,
  // a firm above in the chain, a colleague without the desk. Drawn alone.
  const [refused, setRefused] = useState<string | null>(null)
  const section = usePageSection('/dashboard/submissions')
  const [type, setType] = useState<EngagementType>('W2')
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions/${id}/terms`)
      if (res.status === 403 || res.status === 404) {
        const body = await res.json().catch(() => ({}))
        setRefused(body?.error?.message ?? statusMeans(res.status))
        return
      }
      const j = await readJson<{ data: Terms }>(res)
      setData(j.data)
    } catch (e: any) {
      setLoadError(e.message)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function state() {
    const cents = Math.round(parseFloat(rate) * 100)
    const r = await saveForm<{ data: Terms }>({
      send: () => fetch(`/api/submissions/${id}/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'state', engagementType: type, payRate: Number.isFinite(cents) ? cents : 0 }),
      }),
      setBusy, setError, fallback: 'The terms could not be saved.',
    })
    if (r) setData(r.data)
  }

  async function agree() {
    const r = await saveForm<{ data: Terms }>({
      send: () => fetch(`/api/submissions/${id}/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'agree' }),
      }),
      setBusy, setError, fallback: 'Your answer could not be saved.',
    })
    if (r) setData(r.data)
  }

  if (refused) return <RefusedState says={refused} />
  if (loadError) return <ErrorState says={loadError} action={{ label: 'Try again', onClick: () => { setLoadError(null); void load() } }} />
  if (!data) return <LoadingState says="Opening the terms…" />

  const t = data.terms
  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <DetailHead
        from="/dashboard/submissions"
        back={data.you === 'FIRM' && section ? { href: '/dashboard/submissions', label: 'Submissions' } : undefined}
        title={data.you === 'PERSON' ? `${data.role} through ${data.firm.name}` : `${data.person.name} — ${data.role}`}
        subtitle={<>
          {data.firm.name} sells this work to {data.soldTo}. Start date {day(data.startDate)}.
          {data.placement ? ` Status: ${data.placement.word}.` : ''}
        </>}
        meta={<Chip>{data.you === 'PERSON' ? 'Your terms' : 'Terms of engagement'}</Chip>}
      />

      <section className="rounded-lg border border-etyme-rule bg-etyme-surface p-5">
        <p className="text-[14px] text-etyme-ink">{data.says}</p>
        {t && (
          <dl className="mt-4 grid grid-cols-1 gap-y-2 text-[13px] sm:grid-cols-2">
            <dt className="text-etyme-muted">How they are engaged</dt>
            <dd className="text-etyme-ink">{t.engagementWords}</dd>
            <dt className="text-etyme-muted">Pay</dt>
            <dd className="tabular-nums text-etyme-ink">{t.payRateWords ?? 'Not stated'}</dd>
            <dt className="text-etyme-muted">{data.firm.name} confirmed</dt>
            <dd className="text-etyme-ink">{t.firmConfirmedAt ? day(t.firmConfirmedAt) : data.employee ? 'Set for an employee' : 'Not yet'}</dd>
            <dt className="text-etyme-muted">{data.person.name} agreed</dt>
            <dd className="text-etyme-ink">
              {t.personAgreedAt ? day(t.personAgreedAt) : data.employee ? 'Told, not asked — an employee' : 'Not yet'}
            </dd>
          </dl>
        )}
      </section>

      {data.may.agree && (
        <section className="rounded-lg border border-etyme-rule bg-etyme-raised p-5">
          <p className="text-[13px] text-etyme-ink">
            Saying yes records that you agree to work as {t?.engagementWords.toLowerCase()} at {t?.payRateWords}.
            Nothing starts until you do. If these are not the terms you agreed, do not say yes — reply to {data.firm.name} instead.
          </p>
          {error && <div className="mt-2"><FormMessage tone="error">{error}</FormMessage></div>}
          <SubmitButton type="button" onClick={agree} pending={busy} pendingLabel="Saving…" className="mt-3">
            Yes, I agree these terms
          </SubmitButton>
        </section>
      )}

      {data.may.state && (
        <section className="rounded-lg border border-etyme-rule bg-etyme-raised p-5">
          <Lbl className="mb-2">{t ? 'Change the terms' : 'State the terms'}</Lbl>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-[13px] text-etyme-muted">How does {data.firm.name} engage {data.person.name}?</legend>
            {CHOICES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-[13px] text-etyme-ink">
                <input type="radio" name="engagement" checked={type === c} onChange={() => setType(c)} />
                {ENGAGEMENT_WORDS[c]}
                {c === 'OWN_COMPANY' && data.person.ownCompany ? ` (${data.person.ownCompany.name})` : ''}
              </label>
            ))}
          </fieldset>
          <Field
            className="mt-3"
            label="Pay, dollars per hour"
            help={data.employee
              ? `${data.person.name} is your employee, so they are told rather than asked.`
              : `${data.person.name} reads exactly this and says yes on their own page before anybody starts.`}
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-40 tabular-nums"
            />
          </Field>
          {error && <div className="mt-2"><FormMessage tone="error">{error}</FormMessage></div>}
          <SubmitButton type="button" onClick={state} pending={busy} pendingLabel="Saving…" className="mt-3">
            {data.employee ? 'Set the pay' : 'Send the terms'}
          </SubmitButton>
        </section>
      )}
    </div>
  )
}
