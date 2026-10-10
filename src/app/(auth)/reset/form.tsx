'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { DoorFrame, DoorLabel, DoorError, doorField, doorButton } from '../door-frame'

/**
 * Forgot your password: ask for a one-time link. It lives an hour and
 * works once (lib/password-door). The answer is the same whether or not
 * the email has an account.
 */
export function ResetForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const j = await readJson(await fetch('/api/auth/password/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      }))
      setSent(j.data.says)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">Set a new password</h1>
      {sent ? (
        <>
          <p className="text-sm text-etyme-ink mt-3">{sent}</p>
          <p className="text-sm mt-6"><a href="/login" className="text-etyme-action-press hover:underline">Back to sign in</a></p>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4 mt-6">
          <p className="text-sm text-etyme-muted">Type your email. We send a link that works for one hour.</p>
          <div>
            <DoorLabel htmlFor="email">Email</DoorLabel>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={doorField} />
          </div>
          <DoorError says={error} />
          <button type="submit" disabled={busy} className={doorButton}>{busy ? 'Sending…' : 'Send the link'}</button>
          <p className="text-xs"><a href="/login" className="text-etyme-action-press hover:underline">Back to sign in</a></p>
        </form>
      )}
    </DoorFrame>
  )
}
