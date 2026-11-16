'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { Field, Input, SubmitButton, FormMessage, LoadingState } from '@/components/ui'
import { CHECK_ACTS, SECOND_CHECK_HREF, type CheckAct } from '@/lib/identity/second-check-words'

/**
 * The one dialog any screen opens to ask for a second check before an act
 * (Layer 7, slice S1; record 86, answer 2). It asks for the person's
 * passkey first, or a code from her authenticator app, and hands back a
 * proof for that one act and subject. The route that does the act spends
 * it; a proof is good for two minutes and spent once.
 *
 * A screen uses it two ways:
 *   const check = useSecondCheck()
 *   const proof = await check.ask('second_check.remove', id)   // null: she closed it
 *   ... {check.dialog}
 * or, after a route refused with code SECOND_CHECK, `askedFor(body)` says
 * which act and subject to ask for, and the screen sends again with the
 * proof.
 *
 * It is a check before an act, never a step of signing in, and it says so
 * in no other words.
 */

const VERIFY = `${SECOND_CHECK_HREF.api}/verify`

type Begun = { methods: ('PASSKEY' | 'AUTHENTICATOR_APP')[]; passkey: { options: unknown; ticket: string } | null }

/** The act and subject a route asked a check for, where its refusal was one. */
export function askedFor(body: unknown): { act: CheckAct; subjectId: string } | null {
  const e = (body as { error?: { code?: unknown; act?: unknown; subjectId?: unknown } } | null)?.error
  if (e?.code !== 'SECOND_CHECK' || typeof e.act !== 'string' || typeof e.subjectId !== 'string') return null
  return Object.prototype.hasOwnProperty.call(CHECK_ACTS, e.act) ? { act: e.act as CheckAct, subjectId: e.subjectId } : null
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(VERIFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

export function SecondCheckDialog({ act, subjectId, onProof, onCancel }: {
  act: CheckAct
  subjectId: string
  onProof: (proof: string) => void
  onCancel: () => void
}) {
  const [begun, setBegun] = useState<Begun | null>(null)
  const [none, setNone] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<'PASSKEY' | 'AUTHENTICATOR_APP' | null>(null)

  const begin = useCallback(async () => {
    const r = await post({ step: 'begin', act, subjectId })
    if (r.ok) { setBegun(r.body.data); return }
    const message = r.body?.error?.message ?? 'The check could not start. Try again.'
    if (r.body?.error?.code === 'NO_SECOND_CHECK' || r.body?.error?.code === 'NOT_READY') setNone(message)
    else setSaid(message)
  }, [act, subjectId])
  useEffect(() => { void begin() }, [begin])

  async function check(body: Record<string, unknown>, method: 'PASSKEY' | 'AUTHENTICATOR_APP') {
    setPending(method)
    setSaid(null)
    try {
      const r = await post({ step: 'check', act, subjectId, ...body })
      if (r.ok) { onProof(r.body.data.proof); return }
      setSaid(r.body?.error?.message ?? 'The check did not pass. Try again.')
      // A passkey's challenge is good once; ask for a new one for the next try.
      if (method === 'PASSKEY') await begin()
    } finally {
      setPending(null)
    }
  }

  async function usePasskey() {
    if (!begun?.passkey) return
    let response: unknown
    try {
      response = await startAuthentication({ optionsJSON: begun.passkey.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] })
    } catch {
      setSaid('Your device did not answer. Try again, or use your authenticator app.')
      return
    }
    await check({ ticket: begun.passkey.ticket, response }, 'PASSKEY')
  }

  const hasPasskey = Boolean(begun?.methods.includes('PASSKEY'))
  const hasApp = Boolean(begun?.methods.includes('AUTHENTICATOR_APP'))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Check it is you"
    >
      <div className="w-full max-w-md rounded-r-lg border border-etyme-rule bg-etyme-raised p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="headline-serif text-[22px] leading-tight text-etyme-ink">Check it is you</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
          Etyme asks for this before you {CHECK_ACTS[act]}. Each check counts for this one act.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {none ? (
            <>
              <p className="text-[14px] leading-relaxed text-etyme-ink">{none}</p>
              <Link href={SECOND_CHECK_HREF.page as Route} className="text-[14px] text-etyme-action-press underline underline-offset-2">
                Open Second check
              </Link>
            </>
          ) : !begun && !said ? (
            <LoadingState />
          ) : (
            <>
              {hasPasskey && (
                <SubmitButton type="button" pending={pending === 'PASSKEY'} pendingLabel="Waiting for your device…" onClick={() => void usePasskey()} className="w-full">
                  Use your passkey
                </SubmitButton>
              )}
              {hasApp && (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => { e.preventDefault(); void check({ code }, 'AUTHENTICATOR_APP') }}
                >
                  <Field label="Code from your authenticator app" help="The six digits it shows now.">
                    <Input
                      inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
                      value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-full"
                    />
                  </Field>
                  <SubmitButton
                    tone={hasPasskey ? 'secondary' : 'primary'} pending={pending === 'AUTHENTICATOR_APP'}
                    disabled={code.length !== 6} whyDisabled="Type all six digits first." className="w-full"
                  >
                    Check the code
                  </SubmitButton>
                </form>
              )}
            </>
          )}
          {said && <FormMessage tone="error">{said}</FormMessage>}
          <button type="button" onClick={onCancel} className="self-start text-[14px] text-etyme-muted underline underline-offset-2">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Ask for a check from any screen: `ask(act, subjectId)` opens the dialog
 * and resolves with the proof, or null where she chose Not now. Render
 * `dialog` once on the screen.
 */
export function useSecondCheck(): { dialog: ReactNode; ask: (act: CheckAct, subjectId: string) => Promise<string | null> } {
  const [open, setOpen] = useState<{ act: CheckAct; subjectId: string } | null>(null)
  const settle = useRef<((proof: string | null) => void) | null>(null)
  const ask = useCallback((act: CheckAct, subjectId: string) => {
    settle.current?.(null)
    setOpen({ act, subjectId })
    return new Promise<string | null>((resolve) => { settle.current = resolve })
  }, [])
  const done = (proof: string | null) => {
    settle.current?.(proof)
    settle.current = null
    setOpen(null)
  }
  const dialog = open ? (
    <SecondCheckDialog act={open.act} subjectId={open.subjectId} onProof={(p) => done(p)} onCancel={() => done(null)} />
  ) : null
  return { dialog, ask }
}
