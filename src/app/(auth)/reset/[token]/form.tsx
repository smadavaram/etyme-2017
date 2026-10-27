'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { ASK_ETYME_HREF } from '@/lib/nav-table'
import { readJson } from '@/lib/read-response'
import { DoorFrame, DoorLabel, DoorError, doorField, doorButton } from '../../door-frame'

/**
 * The link in the reset email: type a new password, once, within the
 * hour. The same rules as sign-up decide whether it is strong enough.
 * The page has already checked the link is alive (`resetLinkState`), so
 * this form is only drawn for a link that works.
 */
export function ResetWithLinkForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const j = await readJson(await fetch('/api/auth/password/reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }))
      setDone(j.data.says)
      // A colleague setting her password from the invitation lands signed
      // in: the password she just chose is the sign-in, through the same
      // door as the sign-in page. Where that fails, the Sign in link stays.
      if (j.data.invitation) {
        const r = await signIn('credentials', { email: j.data.email, password, redirect: false })
        if (r?.ok && !r.error) { window.location.assign(j.data.landing ?? ASK_ETYME_HREF); return }
        setDone('Your password is set. Sign in with it now.')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">Set your password</h1>
      {done ? (
        <>
          <p className="text-sm text-etyme-ink mt-3">{done}</p>
          <p className="text-sm mt-6"><a href="/login" className="text-etyme-action-press hover:underline">Sign in</a></p>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4 mt-6">
          <div>
            <DoorLabel htmlFor="password">New password</DoorLabel>
            <input id="password" type="password" required autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={doorField} />
            <p className="text-xs text-etyme-muted mt-1">At least 12 characters. Not your email.</p>
          </div>
          <DoorError says={error} />
          <button type="submit" disabled={busy} className={doorButton}>{busy ? 'Saving…' : 'Save the password'}</button>
          <p className="text-xs"><a href="/reset" className="text-etyme-action-press hover:underline">Ask for a new link</a></p>
        </form>
      )}
    </DoorFrame>
  )
}
