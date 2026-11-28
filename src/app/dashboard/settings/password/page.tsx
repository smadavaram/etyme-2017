'use client'

import { useEffect, useState } from 'react'
import { getCsrfToken } from 'next-auth/react'
import { PageHead, Panel, Field, Input, SubmitButton, FormMessage, LoadingState } from '@/components/ui'
import { readJson } from '@/lib/read-response'
import { MIN_PASSWORD } from '@/lib/password-words'
import { passwordLineLabel, PASSWORD_HREF } from '@/components/shell/password-line'

/**
 * Set a password, or change it, from the account menu (fault 5,
 * 2026-11-12). One column, the person's own account only: a person who
 * came in with Google, or was seated by Etyme's staff, sets a password
 * here with no email; a person who has one gives it to change it.
 *
 * The rules are lib/password-door `setOwnPassword`, behind
 * PUT /api/auth/password/reset. A change hands back a sealed ticket that
 * goes straight to NextAuth's update, so this session stays signed in
 * while every other one ends. Nothing is asked in a browser prompt.
 */
/**
 * NextAuth's session update, the request its `update()` makes: the jwt
 * callback's update trigger reads the ticket and reads the version again
 * on the server (lib/auth).
 */
async function carryThisSessionOver(refresh: string): Promise<void> {
  const csrfToken = await getCsrfToken()
  await fetch('/api/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csrfToken, data: { refresh } }),
  })
}

export default function PasswordPage() {
  const [state, setState] = useState<{ hasPassword: boolean; allowed: boolean; says: string | null } | null>(null)
  const [readSays, setReadSays] = useState<string | null>(null)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [pending, setPending] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string; field?: string } | null>(null)

  async function read() {
    try {
      const j = await readJson(await fetch(PASSWORD_HREF.api, { cache: 'no-store' }))
      setState(j.data)
    } catch (e: any) {
      setReadSays(e.message)
    }
  }
  useEffect(() => { void read() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaid(null)
    if (password !== again) {
      setSaid({ tone: 'error', text: 'The two new passwords are not the same. Type it again.', field: 'again' })
      return
    }
    setPending(true)
    try {
      const res = await fetch(PASSWORD_HREF.api, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, current: state?.hasPassword ? current : undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaid({ tone: 'error', text: j?.error?.message ?? 'That did not save. Try again.', field: j?.error?.field })
        return
      }
      // A change raised the session version: carry this session over at once.
      if (j.data?.refresh) await carryThisSessionOver(j.data.refresh)
      setSaid({ tone: 'ok', text: j.data.says })
      setCurrent(''); setPassword(''); setAgain('')
      await read()
    } finally {
      setPending(false)
    }
  }

  const title = state ? passwordLineLabel(state.hasPassword) : 'Your password'
  return (
    <div className="mx-auto max-w-xl">
      <PageHead
        title={title}
        subtitle="A password of your own lets you sign in with your email even when Google or Microsoft cannot."
      />
      <Panel>
        {readSays ? (
          <FormMessage tone="error">{readSays}</FormMessage>
        ) : state === null ? (
          <LoadingState />
        ) : !state.allowed ? (
          <p className="text-[14px] leading-relaxed text-etyme-ink">{state.says}</p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={save}>
            {state.hasPassword && (
              <Field label="Current password" error={said?.field === 'current' ? said.text : undefined}>
                <Input type="password" autoComplete="current-password" required value={current}
                  onChange={(e) => setCurrent(e.target.value)} className="w-full" />
              </Field>
            )}
            <Field label="New password" help={`At least ${MIN_PASSWORD} characters. Not your email address.`}
              error={said?.field === 'password' ? said.text : undefined}>
              <Input type="password" autoComplete="new-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="w-full" />
            </Field>
            <Field label="New password again" error={said?.field === 'again' ? said.text : undefined}>
              <Input type="password" autoComplete="new-password" required value={again}
                onChange={(e) => setAgain(e.target.value)} className="w-full" />
            </Field>
            {said && !said.field && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
            {!state.hasPassword && (
              <p className="text-[12px] leading-relaxed text-etyme-muted">
                You need to have signed in within the last 15 minutes. If it says to sign in again, sign out, sign in with Google or Microsoft, and come back here.
              </p>
            )}
            <SubmitButton pending={pending} className="w-full sm:w-auto">
              {state.hasPassword ? 'Change password' : 'Set password'}
            </SubmitButton>
          </form>
        )}
      </Panel>
    </div>
  )
}
