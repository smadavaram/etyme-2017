'use client'

import { useEffect, useState } from 'react'

/**
 * The page a consultant lands on from an email.
 *
 * No sign-in, no account, no navigation into the rest of the system. They
 * are answering one question they were asked, they have about fifteen
 * seconds of goodwill, and every step between those two facts loses some
 * of it.
 *
 * The button is here rather than in the link because email security
 * scanners open every link in a message before the person does, and one
 * of these answers switches somebody's messages off permanently.
 */

interface Ask {
  name: string
  vendor: string | null
  question: string
  answer: string
  stopped: boolean
}

export default function ReplyPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [ask, setAsk] = useState<Ask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/reply/${token}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error?.message ?? 'This link is not valid.')
        setAsk(body.data)
      })
      .catch((e: any) => setError(e.message))
  }, [token])

  async function confirm() {
    setBusy(true)
    try {
      const res = await fetch(`/api/reply/${token}`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'That did not go through.')
      setDone(body.data.said)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[34rem] flex-col justify-center px-6 py-16">
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
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.08em] text-etyme-faint">
                {ask.vendor ?? 'Your agency'}
              </p>
              <h1 className="headline-serif mt-1 text-[27px]">{ask.question}</h1>

              <p className="mt-3 max-w-[46ch] text-[14px] text-etyme-muted">
                {ask.name}, you chose <span className="text-etyme-ink">“{ask.answer}”</span>.
                Nothing is recorded until you confirm below.
              </p>

              {ask.stopped && (
                <p className="mt-3 text-[13px] text-etyme-attention">
                  You have already asked us to stop, and we have. Confirming
                  again changes nothing.
                </p>
              )}

              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="mt-5 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : ask.answer}
              </button>

              <p className="mt-4 text-[12px] text-etyme-faint">
                Sent by {ask.vendor ?? 'your agency'}. No password and no
                account — this link only answers this one question.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  )
}
