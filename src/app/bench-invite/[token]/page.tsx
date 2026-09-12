'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * The page a consultant lands on from a bench invitation.
 *
 * No sign-in, no account, one question. They have never used this
 * product and may never use it again; what they need is to understand
 * what is being asked and say yes or no in under a minute.
 *
 * Two buttons rather than one, because a decline has to be as easy as an
 * accept. An invitation where saying no is harder than saying yes is not
 * really asking.
 */

interface Ask {
  name: string
  vendor: string
  awaiting: boolean
  state: string
  says: string
}

export default function BenchInvitePage({ params }: { params: { token: string } }) {
  const { token } = params
  const [ask, setAsk] = useState<Ask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch(`/api/bench-invite/${token}`)
      .then(readJson)
      .then((b) => setAsk(b.data))
      .catch((e: any) => setError(e.message))
  }, [token])

  async function say(said: 'ACCEPT' | 'DECLINE') {
    setBusy(true)
    try {
      const b = await readJson(
        await fetch(`/api/bench-invite/${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ said, note: said === 'DECLINE' ? note : undefined }),
        })
      )
      setDone(b.data.says)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[36rem] flex-col justify-center px-6 py-16">
      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            Nothing has been changed. Replying to the email works just as well.
          </p>
        </div>
      )}

      {!error && !ask && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {ask && !error && (
        <div className="panel">
          {done ? (
            <>
              <h1 className="headline-serif text-[27px]">Thank you</h1>
              <p className="mt-2 text-[14px] text-etyme-ink">{done}</p>
            </>
          ) : !ask.awaiting ? (
            <>
              <h1 className="headline-serif text-[27px]">Already answered</h1>
              <p className="mt-2 text-[14px] text-etyme-ink">{ask.says}</p>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.08em] text-etyme-faint">{ask.vendor}</p>
              <h1 className="headline-serif mt-1 text-[27px]">
                May {ask.vendor} put you forward for contract work?
              </h1>

              <p className="mt-3 max-w-[46ch] text-[14px] text-etyme-muted">
                {ask.name}, being on a bench means they can put your name to roles.
                Nothing happens without you — they will ask before every single
                submission, and you can take this back whenever you like.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => say('ACCEPT')}
                  disabled={busy}
                  className="rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Yes, they can'}
                </button>
                {/* As easy as saying yes. An invitation where declining is
                    harder is not really asking. */}
                <button
                  type="button"
                  onClick={() => say('DECLINE')}
                  disabled={busy}
                  className="rounded-md border border-etyme-rule px-4 py-2 text-[13px] text-etyme-ink disabled:opacity-50"
                >
                  No thank you
                </button>
              </div>

              <label className="mt-4 block text-[12px] text-etyme-faint">
                If you are saying no, you can say why. Only {ask.vendor} sees it.
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-md border border-etyme-rule bg-etyme-surface px-3 py-2 text-[13px] text-etyme-ink"
                  placeholder="Optional"
                />
              </label>

              <p className="mt-4 text-[12px] text-etyme-faint">
                Sent by {ask.vendor}. No password and no account — this link only
                answers this one question.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  )
}
