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
  /** How long they may choose to stay, in days (2026-09-30). */
  stayChoices?: number[]
  stayDays?: number | null
  /** One sentence about the stay they chose, once they said yes. */
  stay?: string | null
  /** A stay with an end: one tap renews it, from the reminder letter. */
  mayRenew?: boolean
}

export default function BenchInvitePage({ params }: { params: { token: string } }) {
  const { token } = params
  const [ask, setAsk] = useState<Ask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // Chosen with the yes, "until I cancel" already chosen.
  const [stayDays, setStayDays] = useState<number | null>(null)
  const [showInMatches, setShowInMatches] = useState(false)

  useEffect(() => {
    fetch(`/api/bench-invite/${token}`)
      .then(readJson)
      .then((b) => setAsk(b.data))
      .catch((e: any) => setError(e.message))
  }, [token])

  async function say(said: 'ACCEPT' | 'DECLINE' | 'RENEW') {
    setBusy(true)
    try {
      const b = await readJson(
        await fetch(`/api/bench-invite/${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            said === 'ACCEPT'
              ? { said, stayDays, showInMatches }
              : { said, note: said === 'DECLINE' ? note : undefined }
          ),
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
              <h1 className="headline-serif text-[27px]">{ask.mayRenew ? 'Your stay on this bench' : 'Already answered'}</h1>
              <p className="mt-2 text-[14px] text-etyme-ink">{ask.says}</p>
              {ask.stay && <p className="mt-2 text-[14px] text-etyme-muted">{ask.stay}</p>}
              {ask.mayRenew && (
                <button
                  type="button"
                  onClick={() => say('RENEW')}
                  disabled={busy}
                  className="mt-4 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50"
                >
                  {busy ? 'Saving…' : `Renew for ${ask.stayDays} days`}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.08em] text-etyme-faint">{ask.vendor}</p>
              <h1 className="headline-serif mt-1 text-[27px]">
                May {ask.vendor} put you forward for contract work?
              </h1>

              <p className="mt-3 max-w-[46ch] text-[14px] text-etyme-muted">
                {ask.name}, being on a bench means they can put your name to jobs.
                Nothing happens without you — they will ask before every single
                submission, and you can take this back whenever you like.
              </p>

              {/* How long, in the same step as the yes — never a second
                  question. "Until I cancel" is already chosen. */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[13px] text-etyme-muted">
                  Stay on their bench
                  <select
                    value={stayDays == null ? '' : String(stayDays)}
                    onChange={(e) => setStayDays(e.target.value === '' ? null : Number(e.target.value))}
                    className="rounded-md border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[13px] text-etyme-ink"
                  >
                    <option value="">Until I cancel</option>
                    {(ask.stayChoices ?? [5, 7, 15, 25, 50, 60, 500]).map((d) => (
                      <option key={d} value={d}>{d} days</option>
                    ))}
                  </select>
                </label>
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

              <label className="mt-3 flex items-start gap-2 text-[13px] text-etyme-muted cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={showInMatches}
                  onChange={() => setShowInMatches((v) => !v)}
                />
                <span>
                  Also let {ask.vendor} show me in matches to companies it does not work with yet — my
                  skills and when I am free, never my name, contact or rate.
                </span>
              </label>

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
