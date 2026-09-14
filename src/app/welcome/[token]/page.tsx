'use client'

import { useCallback, useEffect, useState } from 'react'
import { EtymeLogo } from '@/components/logo'

/**
 * The page a contractor opens from the email, with no account.
 *
 * They have never heard of Etyme and are not being sold anything, so it
 * says who wants them and why before it asks for anything, and the one
 * question it does ask is the one that decides what happens next. It
 * never shows the client's roles, its rates, or anybody else.
 *
 * `params` is a plain object on Next 14, read directly and typed that
 * way. Unwrapping it with React's promise hook throws on render, and
 * annotating it as a promise type-checks while lying — both shipped
 * broken once, and `__tests__/invariants/public-token-pages` fails on
 * either. (Named rather than quoted here: that guard is a text scan,
 * and a comment showing the mistake reads as the mistake.)
 */

interface Ask {
  name: string
  client: string
  invitedBy: string
  reason: string
  skills: string[]
  suppliers: { id: string; name: string }[]
  says: string
}

type Represents = 'ON_BENCH' | 'OTHER_FIRM' | 'NOBODY'

export default function WelcomePage({ params }: { params: { token: string } }) {
  const token = params.token
  const [ask, setAsk] = useState<Ask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [represents, setRepresents] = useState<Represents | null>(null)
  const [firmCompanyId, setFirmCompanyId] = useState('')
  const [firmName, setFirmName] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/contractor-welcome/${token}`)
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error?.message ?? 'This link did not open.'); return }
    setAsk(body.data)
  }, [token])

  useEffect(() => { void load() }, [load])

  async function answer(interested: boolean) {
    setBusy(true)
    const res = await fetch(`/api/contractor-welcome/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interested, represents, firmCompanyId, firmName, note }),
    })
    const body = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setError(body?.error?.message ?? 'That did not send.'); return }
    setDone(body.data.says)
  }

  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto max-w-[720px] px-6 py-6">
        <EtymeLogo size="md" />
      </header>

      <main className="mx-auto max-w-[720px] space-y-5 px-6 pb-24">
        {error && !ask && (
          <div className="panel"><p className="text-[14px] text-etyme-attention">{error}</p></div>
        )}

        {done && (
          <div className="panel">
            <h1 className="headline-serif text-[26px] leading-tight">Thank you</h1>
            <p className="mt-2 text-[14px] text-etyme-muted">{done}</p>
          </div>
        )}

        {ask && !done && (
          <>
            <div>
              <p className="eyebrow">{ask.client}</p>
              <h1 className="headline-serif text-[30px] leading-tight">
                {ask.invitedBy} would like to work with you again
              </h1>
              <p className="mt-3 text-[14px] text-etyme-muted">{ask.reason}</p>
              {ask.skills.length > 0 && (
                <p className="mt-1 text-[13px] text-etyme-faint">For {ask.skills.join(', ')}.</p>
              )}
            </div>

            <div className="panel space-y-4">
              <p className="text-[13px] text-etyme-ink">{ask.says}</p>

              <fieldset className="space-y-2">
                <legend className="lbl">Who represents you today?</legend>

                {ask.suppliers.length > 0 && (
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="radio" name="represents" checked={represents === 'ON_BENCH'}
                      onChange={() => setRepresents('ON_BENCH')} className="mt-1" />
                    <span>
                      One of {ask.client}&rsquo;s suppliers
                      {represents === 'ON_BENCH' && (
                        <select
                          aria-label="Which firm"
                          value={firmCompanyId}
                          onChange={(e) => setFirmCompanyId(e.target.value)}
                          className="ml-2 rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[12px]"
                        >
                          <option value="">Pick one…</option>
                          {ask.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </span>
                  </label>
                )}

                <label className="flex items-start gap-2 text-[13px]">
                  <input type="radio" name="represents" checked={represents === 'OTHER_FIRM'}
                    onChange={() => setRepresents('OTHER_FIRM')} className="mt-1" />
                  <span>
                    Another firm
                    {represents === 'OTHER_FIRM' && (
                      <input value={firmName} onChange={(e) => setFirmName(e.target.value)}
                        placeholder="Their name" aria-label="The firm that represents you"
                        className="ml-2 rounded border border-etyme-rule px-2 py-1 text-[12px]" />
                    )}
                  </span>
                </label>

                <label className="flex items-start gap-2 text-[13px]">
                  <input type="radio" name="represents" checked={represents === 'NOBODY'}
                    onChange={() => setRepresents('NOBODY')} className="mt-1" />
                  <span>Nobody at the moment</span>
                </label>
              </fieldset>

              <label className="block">
                <span className="lbl">Anything you want them to know</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  className="mt-1 w-full rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
              </label>

              {error && <p className="text-[13px] text-etyme-attention">{error}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  disabled={busy || !represents}
                  onClick={() => answer(true)}
                  className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Yes, I am interested
                </button>
                <button
                  disabled={busy}
                  onClick={() => answer(false)}
                  className="text-[13px] text-etyme-muted hover:text-etyme-ink disabled:opacity-40"
                >
                  Not looking right now
                </button>
              </div>
            </div>

            <p className="text-[12px] text-etyme-faint">
              {ask.client} will not employ you directly — they contract through staffing suppliers,
              and whichever firm represents you is who you will deal with. Nothing here signs you up
              to anything.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
