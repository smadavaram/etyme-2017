'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { EmptyState, ErrorState, Field, FormMessage, Input, LoadingState, PageHead, Panel, Select, SubmitButton, Textarea } from '@/components/ui'

/**
 * Companies, Outreach (record 117). Pick who the letter goes to, pick what
 * it offers, read the letter Etyme drafted and change it, see who gets it
 * and who is held and why, then ask for one yes. Nothing is sent from this
 * page: the batch is sent only after a person says yes on its card.
 */

interface Preview {
  audience: { key: string; label: string; count: number }
  to: { contactId: string; name: string; email: string; companyName: string }[]
  held: { companyName: string; reason: string; says: string }[]
  draft: { subject: string; body: string } | null
  offerSays: string | null
  letter: string | null
  blocked: { block: string; says: string } | null
}
interface Setup {
  audiences: { key: string; label: string }[]
  offers: { key: string; label: string }[]
  hotList: { skills: string; availability: string }[]
  postal: boolean
  link: boolean
}
interface BatchRow { id: string; state: string; question: string; contacts: number; subject: string | null }

const BATCH_STATE: Record<string, string> = {
  PROPOSED: 'Waiting for a yes', APPROVED: 'Approved', RUNNING: 'Sending', DONE: 'Finished', STOPPED: 'Stopped', REFUSED: 'Not approved',
}

export default function OutreachPage() {
  const eyebrow = usePageSection('/dashboard/companies/outreach')
  const router = useRouter()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [audience, setAudience] = useState('DORMANT_CUSTOMERS')
  const [contactKind, setContactKind] = useState('')
  const [offerKind, setOfferKind] = useState('HOT_LIST')
  const [lines, setLines] = useState<{ skills: string; availability: string }[]>([{ skills: '', availability: '' }])
  const [pod, setPod] = useState({ scope: '', duration: '', skills: '' })
  const [job, setJob] = useState({ title: '', skills: '', location: '' })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<{ field?: string; says: string } | null>(null)
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [s, b] = await Promise.all([
          readJson(await fetch('/api/outreach/preview')), readJson(await fetch('/api/outreach/batches')),
        ])
        if (!live) return
        setSetup(s.data); setBatches(b.data.batches)
        if (s.data.hotList.length) setLines(s.data.hotList)
      } catch (err: any) { if (live) setLoadError(err.message) }
    })()
    return () => { live = false }
  }, [])

  const offer = useCallback((): Record<string, unknown> =>
    offerKind === 'HOT_LIST' ? { lines } : offerKind === 'PROJECT_POD' ? pod : job, [offerKind, lines, pod, job])

  const ask = useCallback((withLetter: boolean) => ({
    audience, contactKind: contactKind || null, offerKind, offer: offer(), ...(withLetter ? { subject, body } : {}),
  }), [audience, contactKind, offerKind, offer, subject, body])

  async function draft(keepWords: boolean) {
    setBusy('preview'); setError(null)
    try {
      const out = await readJson(await fetch('/api/outreach/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ask(keepWords)) }))
      setPreview(out.data)
      if (!keepWords && out.data.draft) { setSubject(out.data.draft.subject); setBody(out.data.draft.body) }
    } catch (err: any) { setError({ says: err.message }) } finally { setBusy(null) }
  }

  async function raise() {
    setBusy('send'); setError(null)
    try {
      const res = await fetch('/api/outreach/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ask(true)) })
      const out = await res.json().catch(() => null)
      if (!res.ok) { setError({ field: out?.error?.field, says: out?.error?.message ?? 'The batch could not be raised.' }); return }
      router.push(`/dashboard/companies/outreach/${out.data.id}` as Route)
    } catch (err: any) { setError({ says: err.message }) } finally { setBusy(null) }
  }

  if (loadError) return <ErrorState says={loadError} />
  if (!setup) return <LoadingState />
  const mine = (f: string) => (error?.field === f ? error.says : undefined)
  const setLine = (i: number, k: 'skills' | 'availability', v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  return (
    <div>
      <PageHead
        eyebrow={eyebrow}
        title="Outreach to companies"
        subtitle="Write once to the customers or suppliers you already have on your list. You say yes once, and nothing goes before that."
      />
      {(!setup.postal || !setup.link) && (
        <FormMessage tone="error">
          {!setup.postal
            ? <>Every letter must carry the firm’s postal address, and none is recorded. <Link className="text-etyme-action" href={'/dashboard/settings/setup/addresses' as Route}>Add it in Settings</Link>.</>
            : 'Etyme has no public web address on this deployment, so a letter could not carry its unsubscribe link.'}
        </FormMessage>
      )}

      <Panel className="mt-4">
        <h2 className="headline-serif text-[20px]">1. Who gets it</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Audience" help="Read from your own list of customers and suppliers. A company not classified is never in it." error={mine('audience')}>
            <Select value={audience} onChange={(e) => { setAudience(e.target.value); setPreview(null) }}>
              {setup.audiences.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="Only this kind of contact" help="Leave empty to write to whoever reads it best.">
            <Select value={contactKind} onChange={(e) => { setContactKind(e.target.value); setPreview(null) }}>
              <option value="">Whoever reads it best</option>
              <option value="HIRING_MANAGER">Hiring manager</option>
              <option value="PROCUREMENT">Procurement</option>
              <option value="RECRUITING">Recruiting</option>
              <option value="DELIVERY">Delivery</option>
              <option value="EXECUTIVE">Executive</option>
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel className="mt-4">
        <h2 className="headline-serif text-[20px]">2. What it offers</h2>
        <div className="mt-3">
          <Field label="Offer" error={mine('offerKind')}>
            <Select value={offerKind} onChange={(e) => { setOfferKind(e.target.value); setPreview(null) }}>
              {setup.offers.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Select>
          </Field>
        </div>
        {offerKind === 'HOT_LIST' && (
          <div className="mt-3 space-y-3">
            <p className="text-[13px] text-etyme-muted">
              Skills and when they are available. Never a name, a rate or an address.
              {setup.hotList.length > 0 ? ' The lines below are drafted from the people you show on your page; change them as you like.' : ''}
            </p>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Field label={`Line ${i + 1} skills`}><Input value={l.skills} onChange={(e) => setLine(i, 'skills', e.target.value)} placeholder="Spark, Airflow, SQL" /></Field>
                <Field label={`Line ${i + 1} available`} error={i === 0 ? mine('offer') : undefined}><Input value={l.availability} onChange={(e) => setLine(i, 'availability', e.target.value)} placeholder="from December 8" /></Field>
              </div>
            ))}
            <SubmitButton type="button" tone="secondary" onClick={() => setLines((ls) => [...ls, { skills: '', availability: '' }])}>Add a line</SubmitButton>
          </div>
        )}
        {offerKind === 'PROJECT_POD' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="What the team would do" error={mine('offer')}><Input value={pod.scope} onChange={(e) => setPod({ ...pod, scope: e.target.value })} placeholder="Move the nightly loads to Airflow" /></Field>
            <Field label="How long"><Input value={pod.duration} onChange={(e) => setPod({ ...pod, duration: e.target.value })} placeholder="12 weeks" /></Field>
            <Field label="Skills"><Input value={pod.skills} onChange={(e) => setPod({ ...pod, skills: e.target.value })} placeholder="Airflow, dbt" /></Field>
          </div>
        )}
        {offerKind === 'OPEN_JOB' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Job title" error={mine('offer')}><Input value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} placeholder="Data engineer" /></Field>
            <Field label="Skills"><Input value={job.skills} onChange={(e) => setJob({ ...job, skills: e.target.value })} placeholder="SQL, Python" /></Field>
            <Field label="Where"><Input value={job.location} onChange={(e) => setJob({ ...job, location: e.target.value })} placeholder="Columbus, OH" /></Field>
          </div>
        )}
        <div className="mt-4">
          <SubmitButton type="button" tone="secondary" pending={busy === 'preview'} onClick={() => draft(false)}>Draft the letter</SubmitButton>
        </div>
      </Panel>

      {preview && (
        <>
          <Panel className="mt-4">
            <h2 className="headline-serif text-[20px]">3. The letter</h2>
            {preview.offerSays && <div className="mt-3"><FormMessage tone="error">{preview.offerSays}</FormMessage></div>}
            {preview.draft && (
              <div className="mt-3 space-y-3">
                <Field label="Subject" help="Say what the letter offers." error={mine('subject')}>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field label="What it says" help="Etyme adds who it is from, your postal address, a link to your page and an unsubscribe link. Do not paste web addresses." error={mine('body')}>
                  <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>
                <SubmitButton type="button" tone="secondary" pending={busy === 'preview'} onClick={() => draft(true)}>Show the whole letter</SubmitButton>
                {preview.letter && <pre className="whitespace-pre-wrap rounded-md bg-etyme-sunk p-4 text-[13px] leading-relaxed text-etyme-ink">{`Subject: ${subject}\n\n${preview.letter}`}</pre>}
              </div>
            )}
          </Panel>

          <Panel className="mt-4">
            <h2 className="headline-serif text-[20px]">Who gets it: {preview.audience.count}</h2>
            {preview.to.length === 0 && (
              <EmptyState compact says="Nobody in this list can be written to yet." detail="Every company here is held, or the list is empty. Add a contact with an email, or classify the company." action={{ label: 'Open Contacts', href: '/dashboard/contacts' }} />
            )}
            <ul className="mt-2 divide-y divide-etyme-rule text-[13px]">
              {preview.to.map((t) => <li key={t.contactId} className="py-2"><span className="text-etyme-ink">{t.name}</span> <span className="text-etyme-muted">at {t.companyName} · {t.email}</span></li>)}
            </ul>
            {preview.held.length > 0 && (
              <>
                <h3 className="mt-5 text-[13px] font-medium text-etyme-ink">Held, not written to: {preview.held.length}</h3>
                <ul className="mt-1 space-y-1 text-[13px] text-etyme-muted">
                  {preview.held.map((h) => <li key={h.companyName + h.reason}>{h.says}</li>)}
                </ul>
              </>
            )}
            {preview.blocked && <div className="mt-4"><FormMessage tone="error">{preview.blocked.says}</FormMessage></div>}
            {error && !error.field && <div className="mt-4"><FormMessage tone="error">{error.says}</FormMessage></div>}
            <div className="mt-5">
              <SubmitButton
                type="button" pending={busy === 'send'} onClick={raise}
                disabled={!preview.draft || !subject.trim() || !body.trim() || preview.to.length === 0 || !!preview.blocked}
                whyDisabled={preview.blocked ? preview.blocked.says : preview.to.length === 0 ? 'Nobody can be written to yet.' : 'Draft the letter first.'}
              >Ask for a yes</SubmitButton>
              <p className="mt-2 text-[12px] text-etyme-muted">This raises one card for the Account Manager, or the Owner. Nothing is sent until they say yes, and only if the Outreach batch agent is On.</p>
            </div>
          </Panel>
        </>
      )}

      <Panel className="mt-6">
        <h2 className="headline-serif text-[20px]">Earlier batches</h2>
        {batches.length === 0
          ? <p className="mt-2 text-[13px] text-etyme-muted">No batch has been raised yet. The first one you raise shows here, with who it went to and who answered.</p>
          : (
            <ul className="mt-2 divide-y divide-etyme-rule text-[13px]">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <Link className="text-etyme-action" href={`/dashboard/companies/outreach/${b.id}` as Route}>{b.subject ?? b.question}</Link>
                  <span className="text-etyme-muted">{b.contacts} {b.contacts === 1 ? 'contact' : 'contacts'} · {BATCH_STATE[b.state] ?? b.state}</span>
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  )
}
