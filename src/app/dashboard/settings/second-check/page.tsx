'use client'

import { useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { PageHead, Panel, Field, Input, Select, SubmitButton, FormMessage, LoadingState } from '@/components/ui'
import { readJson } from '@/lib/read-response'
import { formatDay } from '@/lib/format-date'
import { SECOND_CHECK_HREF } from '@/lib/identity/second-check-words'
import { useSecondCheck } from '@/components/step-up/second-check-dialog'

/**
 * Second check, from the account menu (Layer 7, slices S1 and S6; record
 * 86). The person's own passkeys and authenticator app: add one, remove
 * one, and, for an Owner, reset a colleague's after a lost device.
 *
 * A first one needs a sign-in within the last 15 minutes; each later one,
 * each removal and each reset asks for a check with one she already
 * holds (the shared dialog). It is a check before an act, never a step of
 * signing in, and the page says so in those words.
 */

type Factor = { id: string; label: string | null; createdAt: string; lastUsedAt: string | null }
type Own = {
  keySet: boolean
  personId: string
  passkeys: Factor[]
  app: Factor | null
  adding: 'OPEN' | 'CHECK_FIRST' | 'SIGN_IN_AGAIN' | 'NOT_READY'
  says: string | null
}
type Resets = { company: string | null; mayReset: boolean; people: { personId: string; name: string; role: string | null }[]; own: string; notOwner?: string | null }

async function send(method: string, url: string, body: unknown): Promise<{ ok: boolean; body: any }> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, body: await res.json().catch(() => null) }
}

const API = SECOND_CHECK_HREF.api

export default function SecondCheckPage() {
  const check = useSecondCheck()
  const [own, setOwn] = useState<Own | null>(null)
  const [resets, setResets] = useState<Resets | null>(null)
  const [readSays, setReadSays] = useState<string | null>(null)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [app, setApp] = useState<{ key: string; link: string; ticket: string } | null>(null)
  const [code, setCode] = useState('')
  const [who, setWho] = useState('')

  async function read() {
    try {
      const [a, b] = await Promise.all([
        readJson(await fetch(API, { cache: 'no-store' })),
        readJson(await fetch(`${API}/reset`, { cache: 'no-store' })),
      ])
      setOwn(a.data)
      setResets(b.data)
    } catch (e: any) {
      setReadSays(e.message)
    }
  }
  useEffect(() => { void read() }, [])

  /** The proof a later one needs, or undefined for a first; null where she chose Not now. */
  async function proofToAdd(): Promise<string | undefined | null> {
    if (own?.adding !== 'CHECK_FIRST') return undefined
    return check.ask('second_check.add', own.personId)
  }

  async function addPasskey() {
    setSaid(null)
    const proof = await proofToAdd()
    if (proof === null) return
    setPending('passkey')
    try {
      const started = await send('POST', API, { step: 'start', kind: 'PASSKEY', proof })
      if (!started.ok) { setSaid({ tone: 'error', text: started.body?.error?.message ?? 'That did not start. Try again.' }); return }
      let response: unknown
      try {
        response = await startRegistration({ optionsJSON: started.body.data.options })
      } catch {
        setSaid({ tone: 'error', text: 'Your device did not make a passkey. Try again.' })
        return
      }
      const done = await send('POST', API, { step: 'finish', ticket: started.body.data.ticket, response })
      setSaid(done.ok ? { tone: 'ok', text: done.body.data.says } : { tone: 'error', text: done.body?.error?.message ?? 'That did not save. Try again.' })
      await read()
    } finally {
      setPending(null)
    }
  }

  async function startApp() {
    setSaid(null)
    const proof = await proofToAdd()
    if (proof === null) return
    setPending('app')
    try {
      const started = await send('POST', API, { step: 'start', kind: 'AUTHENTICATOR_APP', proof })
      if (!started.ok) { setSaid({ tone: 'error', text: started.body?.error?.message ?? 'That did not start. Try again.' }); return }
      setApp({ key: started.body.data.key, link: started.body.data.link, ticket: started.body.data.ticket })
      setCode('')
    } finally {
      setPending(null)
    }
  }

  async function confirmApp(e: React.FormEvent) {
    e.preventDefault()
    if (!app) return
    setPending('confirm')
    try {
      const done = await send('POST', API, { step: 'finish', ticket: app.ticket, code })
      if (!done.ok) { setSaid({ tone: 'error', text: done.body?.error?.message ?? 'That did not save. Try again.' }); return }
      setApp(null)
      setSaid({ tone: 'ok', text: done.body.data.says })
      await read()
    } finally {
      setPending(null)
    }
  }

  async function removeOne(id: string) {
    setSaid(null)
    const proof = await check.ask('second_check.remove', id)
    if (!proof) return
    const done = await send('DELETE', API, { id, proof })
    setSaid(done.ok ? { tone: 'ok', text: done.body.data.says } : { tone: 'error', text: done.body?.error?.message ?? 'That did not save. Try again.' })
    await read()
  }

  async function resetOne(e: React.FormEvent) {
    e.preventDefault()
    if (!who) return
    setSaid(null)
    const proof = await check.ask('second_check.reset', who)
    if (!proof) return
    setPending('reset')
    try {
      const done = await send('POST', `${API}/reset`, { personId: who, proof })
      setSaid(done.ok ? { tone: 'ok', text: done.body.data.says } : { tone: 'error', text: done.body?.error?.message ?? 'That did not save. Try again.' })
      if (done.ok) setWho('')
      await read()
    } finally {
      setPending(null)
    }
  }

  const mayAdd = own?.adding === 'OPEN' || own?.adding === 'CHECK_FIRST'

  return (
    <div className="mx-auto max-w-xl flex flex-col gap-5">
      <PageHead
        title="Second check"
        subtitle="A passkey, or a code from an authenticator app, lets Etyme check it is you before an act that needs it. It does not change how you sign in."
      />
      {check.dialog}
      {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}

      {readSays ? (
        <Panel><FormMessage tone="error">{readSays}</FormMessage></Panel>
      ) : own === null ? (
        <Panel><LoadingState /></Panel>
      ) : (
        <>
          <Panel title="Passkeys" subtitle="Your phone or computer keeps the passkey. Etyme keeps only what checks it.">
            {own.passkeys.length === 0 ? (
              <p className="text-[14px] text-etyme-muted">No passkey yet.</p>
            ) : (
              <ul className="divide-y divide-etyme-rule">
                {own.passkeys.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[14px] text-etyme-ink truncate">{p.label ?? 'Passkey'}</p>
                      <p className="text-[12px] text-etyme-muted">
                        Added {formatDay(p.createdAt)}{p.lastUsedAt ? ` · last used ${formatDay(p.lastUsedAt)}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => void removeOne(p.id)} className="shrink-0 text-[13px] text-etyme-danger underline underline-offset-2">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {mayAdd ? (
              <div className="mt-4">
                <SubmitButton type="button" pending={pending === 'passkey'} onClick={() => void addPasskey()} className="w-full sm:w-auto">
                  Add a passkey
                </SubmitButton>
              </div>
            ) : (
              <p className="mt-4 text-[13px] leading-relaxed text-etyme-ink">{own.says}</p>
            )}
          </Panel>

          <Panel title="Authenticator app" subtitle="Use it where a passkey does not work. One app at a time.">
            {own.app ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] text-etyme-ink truncate">{own.app.label ?? 'Authenticator app'}</p>
                  <p className="text-[12px] text-etyme-muted">
                    Added {formatDay(own.app.createdAt)}{own.app.lastUsedAt ? ` · last used ${formatDay(own.app.lastUsedAt)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void removeOne(own.app!.id)} className="shrink-0 text-[13px] text-etyme-danger underline underline-offset-2">
                  Remove
                </button>
              </div>
            ) : app ? (
              <form className="flex flex-col gap-4" onSubmit={confirmApp}>
                <p className="text-[14px] leading-relaxed text-etyme-ink">
                  In your authenticator app, add an account with this key. On a phone, <a href={app.link} className="text-etyme-action-press underline underline-offset-2">open it in the app</a>.
                  Etyme shows the key only now.
                </p>
                <p className="break-all rounded-panel bg-etyme-sunk px-3 py-2 font-mono text-[14px] tracking-wider text-etyme-ink">{app.key}</p>
                <Field label="Code from the app" help="The six digits it shows now.">
                  <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-full" />
                </Field>
                <SubmitButton tone="secondary" pending={pending === 'confirm'} disabled={code.length !== 6} whyDisabled="Type all six digits first." className="w-full sm:w-auto">
                  Add the app
                </SubmitButton>
              </form>
            ) : mayAdd ? (
              <SubmitButton type="button" tone="secondary" pending={pending === 'app'} onClick={() => void startApp()} className="w-full sm:w-auto">
                Add an authenticator app
              </SubmitButton>
            ) : (
              <p className="text-[13px] leading-relaxed text-etyme-ink">{own.says}</p>
            )}
          </Panel>

          <Panel title="Lost your device?">
            <p className="text-[14px] leading-relaxed text-etyme-ink">
              {own.passkeys.length + (own.app ? 1 : 0) > 1 ? 'Use your other passkey or app, then remove the lost one. ' : ''}
              {resets?.own}
            </p>
            {resets?.mayReset && resets.people.length > 0 && (
              <form className="mt-4 flex flex-col gap-3" onSubmit={resetOne}>
                <Field label="Reset a colleague’s second check" help="Their passkeys and authenticator app stop working. Every Owner and they are told.">
                  <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-full">
                    <option value="">Choose a person</option>
                    {resets.people.map((p) => (
                      <option key={p.personId} value={p.personId}>{p.name}{p.role ? ` · ${p.role}` : ''}</option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton tone="secondary" pending={pending === 'reset'} disabled={!who} whyDisabled="Choose a person first." className="w-full sm:w-auto">
                  Reset their second check
                </SubmitButton>
              </form>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
