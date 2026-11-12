'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { PageHead, Panel, LoadingState, RefusedState, ErrorState } from '@/components/ui'
import { Field, Input, SubmitButton, FormMessage } from '@/components/ui/form'

/**
 * The Superadmin screen (founder, 2026-11-11: "I should be able to
 * configure that in the Superadmin screen"). Etyme's own staff, the
 * addresses on ETYME_STAFF_EMAILS, and nobody else: the route refuses
 * everybody else, an Owner or Admin of any company included, and logs the
 * refusal before it is sent. What anybody else sees here is that one
 * sentence; the numbers are never sent to them.
 *
 * Platform tools only. Today one: Ask Etyme's two limits, in tokens, with
 * an estimate in short questions said as an estimate, and each person's
 * free trial in days. No company name, no
 * usage by company and no spending figure is on this screen; a company's
 * own usage stays on its Settings, under Ask Etyme.
 */

interface LimitView {
  key: string
  field: 'personDailyTokens' | 'companyMonthlyTokens' | 'trialDays'
  name: string
  unit: 'tokens' | 'days'
  floor: number
  ceiling: number
  value: number | null
  /** The number set on this screen, else empty. */
  typed: string
  says: string
  setBy: string | null
  setAt: string | null
}

interface MailRow {
  id: string
  /** Already said for a reader: "Thu, Nov 12, 3:40 PM UTC". */
  at: string
  kind: string
  company: string | null
  provider: string | null
  status: number | null
  /** REFUSED, BUSY, DOWN, NOT_SET_UP or DEMO (lib/notify/mail-failure). */
  failureKind: string
  words: string | null
  /** Masked: "s…@gmail.com". */
  recipient: string | null
}

interface Screen {
  limits: LimitView[]
  note: string
  history: { says: string; at: string }[]
  says?: string
  /** On the GET only: the email that did not go. */
  mail?: { rows: MailRow[] | null; says: string }
}

const n = (x: number) => x.toLocaleString('en-US')

export default function SuperadminPage() {
  const [data, setData] = useState<Screen | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [fieldErr, setFieldErr] = useState<{ field?: string; says: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mail, setMail] = useState<Screen['mail'] | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    const res = await fetch('/api/superadmin/ask-etyme')
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}))
      setRefused(body.error?.message ?? "This screen is for Etyme's Superadmin only.")
      return
    }
    try {
      const body = await readJson(res)
      setData(body.data)
      setMail(body.data.mail ?? null)
      setTyped(Object.fromEntries((body.data.limits as LimitView[]).map((l) => [l.field, l.typed])))
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setSaving(true)
    setFieldErr(null)
    setNote(null)
    const res = await fetch('/api/superadmin/ask-etyme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(data.limits.map((l) => [l.field, typed[l.field]?.trim() ? typed[l.field] : null]))),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setFieldErr({ field: body.error?.field, says: body.error?.message ?? 'The limits were not saved. Try again.' })
      return
    }
    setData(body.data)
    setNote(body.data?.says ?? 'Saved.')
  }

  if (refused) return <RefusedState says={refused} />
  if (err) return <ErrorState says={err} action={{ label: 'Try again', onClick: load }} />
  if (!data) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Superadmin"
        title="Ask Etyme limits"
        subtitle="How much free-text answers may use, and how long each person's free trial lasts. Set for every company on this deployment. A company cannot change them."
      />

      <Panel title="The limits now" subtitle={data.note}>
        <ul className="space-y-3">
          {data.limits.map((l) => (
            <li key={l.key} className="text-[14px] text-etyme-ink">
              <span className="font-medium">{l.name}:</span> {l.says}
              {l.setBy && l.setAt && (
                <span className="block text-[12px] text-etyme-muted">Last changed by {l.setBy}, {l.setAt}.</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Change the limits" subtitle="Whole numbers. Leave a box empty to use the deployment's own setting, or for the trial its default.">
        <form onSubmit={save} className="space-y-4 max-w-md">
          {data.limits.map((l) => (
            <Field
              key={l.field}
              label={`${l.name}, in ${l.unit}`}
              help={`From ${n(l.floor)} to ${n(l.ceiling)}.`}
              error={fieldErr?.field === l.field ? fieldErr.says : undefined}
            >
              <Input
                inputMode="numeric"
                value={typed[l.field] ?? ''}
                onChange={(e) => setTyped({ ...typed, [l.field]: e.target.value })}
                className="tabular-nums"
              />
            </Field>
          ))}
          {fieldErr && !fieldErr.field && <FormMessage tone="error">{fieldErr.says}</FormMessage>}
          {note && <FormMessage tone="ok">{note}</FormMessage>}
          <SubmitButton pending={saving} pendingLabel="Saving…">Save</SubmitButton>
        </form>
      </Panel>

      <Panel title="The last ten changes">
        {data.history.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">Nobody has changed the limits on this screen yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.history.map((h, i) => (
              <li key={i} className="text-[13px] text-etyme-ink">
                {h.says} <span className="text-etyme-muted">{h.at}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {mail && <MailFailuresPanel mail={mail} />}

      <IdentityCheckPanel />
    </div>
  )
}

/**
 * Record an identity check (founder, 2026-11-11: Owner is earned by proof).
 * No provider is chosen yet, so a Superadmin records the provider's result
 * here, word for word, for one named person at one named company. Etyme
 * renders no verdict and keeps no copy of an identity paper. Every field
 * POST /api/superadmin/owner-proof asks for is a field here.
 */
function IdentityCheckPanel() {
  const [f, setF] = useState({ company: '', email: '', provider: '', reference: '', checkedOn: '', result: '', confirmed: '' })
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string; field?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setSaid(null)
    const res = await fetch('/api/superadmin/owner-proof', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, confirmed: f.confirmed === 'yes' ? true : f.confirmed === 'no' ? false : null }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setSaid({ tone: 'error', text: body.error?.message ?? 'Not recorded. Try again.', field: body.error?.field }); return }
    setSaid({ tone: 'ok', text: body.data.message })
    setF({ company: '', email: '', provider: '', reference: '', checkedOn: '', result: '', confirmed: '' })
  }
  return (
    <Panel title="Record an identity check" subtitle="The provider’s result, word for word, for one person at one company. Etyme renders no verdict and keeps no copy of an identity paper.">
      <form onSubmit={send} className="max-w-[520px] space-y-3">
        <Field label="Company’s Etyme address (before .etyme.com)"><Input value={f.company} onChange={set('company')} /></Field>
        <Field label="The person’s sign-in email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Provider"><Input value={f.provider} onChange={set('provider')} /></Field>
        <Field label="Provider’s reference"><Input value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Date on the result"><Input type="date" value={f.checkedOn} onChange={set('checkedOn')} /></Field>
        <Field label="The provider’s result, word for word"><Input value={f.result} onChange={set('result')} /></Field>
        <Field label="Did the provider confirm the person is who they say?">
          <select value={f.confirmed} onChange={set('confirmed')} className="w-full rounded-[8px] border border-etyme-rule bg-etyme-raised px-3 py-2 text-[14px] text-etyme-ink">
            <option value="">Choose</option>
            <option value="yes">Yes, the provider confirmed it</option>
            <option value="no">No, the provider did not</option>
          </select>
        </Field>
        {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
        <SubmitButton pending={busy} pendingLabel="Recording…">Record the check</SubmitButton>
      </form>
    </Panel>
  )
}

/**
 * "Email that did not go" (2026-11-12): the newest sends the provider
 * refused or never took, so Etyme's staff can tell a bad key from a sending
 * domain nobody verified. The provider's own words are shown here and
 * nowhere a company's person reads. The recipient is masked; no title, body
 * or person's name is ever sent to this screen. A row per send on a desktop,
 * a stacked block on a phone, so nothing scrolls sideways.
 */
/** What the provider did, in a sentence for Etyme's staff. */
function providerLine(r: MailRow): string {
  if (r.provider) return `${r.provider} ${r.status !== null ? `answered ${r.status}` : 'did not answer'}`
  if (r.failureKind === 'NOT_SET_UP') return 'No email sender is set up on this deployment'
  if (r.failureKind === 'DEMO') return 'A demo address, so nothing was sent'
  return 'The provider’s answer was not kept'
}

function MailFailuresPanel({ mail }: { mail: NonNullable<Screen['mail']> }) {
  return (
    <Panel title="Email that did not go" subtitle={mail.says}>
      {mail.rows && mail.rows.length > 0 && (
        <ul className="divide-y divide-etyme-rule">
          {mail.rows.map((r) => (
            <li key={r.id} className="py-2.5 text-[13px] text-etyme-ink space-y-0.5 min-w-0">
              <div className="flex flex-wrap gap-x-2">
                <span className="font-medium">{r.kind}</span>
                <span className="text-etyme-muted">{r.at}</span>
              </div>
              <div className="text-etyme-muted break-words">
                {[r.company ?? 'No company', r.recipient ? `to ${r.recipient}` : null].filter(Boolean).join(' · ')}
              </div>
              <div className="break-words">
                {providerLine(r)}
                {r.words ? `: ${r.words}` : '.'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

