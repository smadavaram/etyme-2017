'use client'

import { useRef, useState } from 'react'
import { auditProblems, AUDIT_COPY, CONTRACTOR_RANGES, type Problem } from './leads'
import { count } from './count'
import { GET_THE_AUDIT } from './funnel'

/**
 * The contractor spend audit, asked for inline on the home page.
 *
 * Posts to `POST /api/market/leads` with `kind: 'AUDIT'`, which checks
 * the same fields with the same function (`auditProblems` in `./leads`)
 * and records one `MarketingLead` row a person at Etyme is emailed about
 * and reads on the lead list. See `./leads` for why this is a lead and
 * not a census request.
 *
 * Four fields since 2026-10-10 (the founder's feedback): business email,
 * name, company and an optional contractor range, nothing else until a
 * person has qualified the ask. It says "sent" only on a 2xx, then what
 * happens next; on anything else it shows the server's own sentence and
 * keeps every value typed. Never a success it did not get. Starting and
 * sending it are counted first-party (`./count`).
 *
 * The guard against scripts is the same as the ask form's: a field a
 * person never sees, and a clock that says whether the form was on
 * screen at all. Not a rate limit on an address an office shares.
 */

type State = 'idle' | 'sending' | 'sent'
type Field = 'email' | 'name' | 'companyName' | 'contractorRange'

const INPUT =
  'mt-1.5 block w-full rounded-lg border border-etyme-rule bg-etyme-raised px-3.5 py-2.5 text-[16px] text-etyme-ink ' +
  'placeholder:text-etyme-faint transition-colors focus:border-etyme-action focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-etyme-action/30 aria-[invalid=true]:border-etyme-danger'
const LABEL = 'block text-[13px] font-medium text-etyme-ink'

export function AuditForm() {
  const shownAt = useRef<number>(Date.now())
  const started = useRef(false)
  const [v, setV] = useState<Record<Field, string>>({ email: '', name: '', companyName: '', contractorRange: '' })
  const [honeypot, setHoneypot] = useState('')
  const [state, setState] = useState<State>('idle')
  const [says, setSays] = useState<string | null>(null)
  const [bad, setBad] = useState<Partial<Record<Field, string>>>({})

  /** The first keystroke anywhere in the form counts as starting it, once per visit to the page. */
  function begin() {
    if (started.current) return
    started.current = true
    count('audit_form_started')
  }

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    begin()
    setV((x) => ({ ...x, [k]: e.target.value }))
  }

  function show(found: { field: string; says: string }[]) {
    const byField: Partial<Record<Field, string>> = {}
    for (const p of found) if (!(p.field in byField)) byField[p.field as Field] = p.says
    setBad(byField)
    setSays(found[0]?.says ?? null)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    begin()
    setSays(null)
    const found: Problem[] = auditProblems(v)
    if (found.length > 0) {
      show(found)
      return
    }
    setBad({})
    setState('sending')
    try {
      const res = await fetch('/api/market/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'AUDIT',
          source: 'HOME_PAGE',
          ...v,
          company_website: honeypot,
          filledInMs: Date.now() - shownAt.current,
        }),
      })
      const json = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        // Everything typed stays in the boxes; only the sentence changes.
        setState('idle')
        if (Array.isArray(json?.error?.fields)) show(json.error.fields)
        setSays(json?.error?.message ?? AUDIT_COPY.failed)
        return
      }
      count('audit_form_submitted')
      setState('sent')
      setSays(json?.data?.says ?? AUDIT_COPY.thanks)
    } catch {
      setState('idle')
      setSays(AUDIT_COPY.dropped)
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" className="rounded-r-lg border border-etyme-rule bg-etyme-raised p-5 md:p-6">
        <p className="text-[17px] font-medium leading-relaxed text-etyme-ink">{says}</p>
        <p className="stat-label mt-4">What happens next</p>
        <ol className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-etyme-muted">
          {AUDIT_COPY.next.map((line, i) => (
            <li key={line} className="flex gap-3">
              <span className="font-mono text-[12px] leading-[1.9] tabular-nums text-etyme-faint">{`0${i + 1}`}</span>
              {line}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[15px] text-etyme-muted">
          <a href={GET_THE_AUDIT.href} className="font-medium text-etyme-action underline-offset-4 hover:underline">
            Read the audit page
          </a>
        </p>
      </div>
    )
  }

  const err = (k: Field) =>
    bad[k] ? { 'aria-invalid': true as const, 'aria-describedby': `audit-${k}-says` } : { 'aria-invalid': false as const }
  const below = (k: Field) =>
    bad[k] ? <p id={`audit-${k}-says`} className="mt-1.5 text-[13px] text-etyme-danger">{bad[k]}</p> : null

  return (
    <form onSubmit={send} noValidate className="rounded-r-lg border border-etyme-rule bg-etyme-raised p-5 md:p-6">
      {/* Seen by a script, never by a person or a screen reader. */}
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="audit-website">Company website</label>
        <input id="audit-website" type="text" tabIndex={-1} autoComplete="off"
          value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="audit-email" className={LABEL}>{AUDIT_COPY.emailLabel}</label>
          <input id="audit-email" type="email" inputMode="email" autoComplete="email" value={v.email}
            onChange={set('email')} className={INPUT} {...err('email')} />
          {below('email')}
        </div>
        <div>
          <label htmlFor="audit-name" className={LABEL}>{AUDIT_COPY.nameLabel}</label>
          <input id="audit-name" type="text" autoComplete="name" value={v.name}
            onChange={set('name')} className={INPUT} {...err('name')} />
          {below('name')}
        </div>
        <div>
          <label htmlFor="audit-companyName" className={LABEL}>{AUDIT_COPY.companyLabel}</label>
          <input id="audit-companyName" type="text" autoComplete="organization" value={v.companyName}
            onChange={set('companyName')} className={INPUT} {...err('companyName')} />
          {below('companyName')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="audit-contractorRange" className={LABEL}>
            {AUDIT_COPY.rangeLabel} <span className="font-normal text-etyme-muted">{AUDIT_COPY.rangeOptional}</span>
          </label>
          <select id="audit-contractorRange" value={v.contractorRange} onChange={set('contractorRange')}
            className={`${INPUT} tabular-nums`} {...err('contractorRange')}>
            <option value="">{AUDIT_COPY.rangeNone}</option>
            {CONTRACTOR_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {below('contractorRange')}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={state === 'sending'}
          className="rounded-lg bg-etyme-action px-5 py-3 text-sm font-semibold text-white shadow-sm transition-opacity
                     hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40
                     focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {state === 'sending' ? AUDIT_COPY.sending : AUDIT_COPY.button}
        </button>
        {/* The server's sentence, or the browser's, where it can be heard. */}
        <p aria-live="polite" className="text-[13px] leading-snug text-etyme-danger">
          {says}
        </p>
      </div>
    </form>
  )
}
