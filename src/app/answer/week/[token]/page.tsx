'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

/**
 * The client's approver, approving a week with no account.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). One page: whose hours, which days,
 * how many, and two buttons. Approve records their name, their address and
 * the time as the client's signature. Send back asks why, from a short
 * list, so the worker knows what to fix. Never a rate: the approver is
 * saying the work happened, and what each firm pays for it is on its own
 * contract.
 */

interface View {
  approverName: string
  personName: string
  clientName: string
  /** Who asked for the link, in the same sentence the letter used. */
  askedBy: string
  period: string
  totalHours: number
  days: { day: string; hours: number }[]
  expiresOn: string
  reasons: { code: string; says: string }[]
  approveRefused: string | null
}

export default function ApproveWeekPage() {
  const { token } = useParams<{ token: string }>()
  const [view, setView] = useState<View | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendingBack, setSendingBack] = useState(false)
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/approve-week/${token}`))
      setView(body.data)
    } catch (err: any) {
      setClosed(err.message)
    }
  }, [token])
  useEffect(() => { load() }, [load])

  async function answer(what: 'APPROVE' | 'SEND_BACK') {
    setBusy(true)
    setError(null)
    try {
      const body = await readJson(
        await fetch(`/api/approve-week/${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(what === 'APPROVE' ? { answer: what } : { answer: what, code, note }),
        })
      )
      setDone(body.data.says)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-etyme-canvas px-4 py-10 text-etyme-ink">
      <div className="mx-auto max-w-[640px]">
        <EtymeLogo />

        {!view && !closed && <p className="mt-8 text-[13px] text-etyme-muted">Loading the week…</p>}

        {closed && (
          <section className="panel mt-8 space-y-2">
            <p className="stat-label">This link is closed</p>
            <p className="text-[14px] leading-relaxed">{closed}</p>
          </section>
        )}

        {view && (
          <div className="mt-8 space-y-6">
            <header>
              <p className="eyebrow">{view.clientName} · hours to approve</p>
              <h1 className="headline-serif mt-2 text-[30px] leading-[1.1] text-balance">
                {view.personName}, {view.period}
              </h1>
              <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
                {view.askedBy} You do not need an account.
                Your answer is recorded with your name, this address and the time.
              </p>
            </header>

            <section className="panel space-y-2">
              <p className="stat-label">The hours</p>
              <ul className="divide-y divide-etyme-rule">
                {view.days.map((d) => (
                  <li key={d.day} className="flex items-center justify-between py-2 text-[13px]">
                    <span>{d.day}</span>
                    <span className="tabular-nums">{d.hours} h</span>
                  </li>
                ))}
                <li className="flex items-center justify-between py-2 text-[13px] font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{view.totalHours} h</span>
                </li>
              </ul>
            </section>

            {done ? (
              <section className="panel">
                <p className="text-[14px] leading-relaxed text-etyme-verified">{done}</p>
              </section>
            ) : (
              <section className="panel space-y-3">
                {view.approveRefused && <p className="text-[13px] text-etyme-attention">{view.approveRefused}</p>}
                {!sendingBack ? (
                  <div className="flex flex-wrap gap-3">
                    {!view.approveRefused && (
                      <button className="btn-primary" disabled={busy} onClick={() => answer('APPROVE')}>
                        Approve
                      </button>
                    )}
                    <button className="btn-secondary" disabled={busy} onClick={() => setSendingBack(true)}>
                      Send back
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="stat-label">Why are you sending it back?</p>
                    <div className="space-y-1">
                      {view.reasons.map((r) => (
                        <label key={r.code} className="flex items-center gap-2 text-[13px]">
                          <input type="radio" name="reason" value={r.code} checked={code === r.code} onChange={() => setCode(r.code)} />
                          {r.says}
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder={code === 'OTHER' ? 'Say in a line what is wrong' : 'Anything to add (optional)'}
                      className="w-full rounded border border-etyme-rule px-3 py-2 text-[13px]"
                    />
                    <div className="flex flex-wrap gap-3">
                      <button className="btn-primary" disabled={busy} onClick={() => answer('SEND_BACK')}>
                        Send it back
                      </button>
                      <button className="btn-secondary" disabled={busy} onClick={() => setSendingBack(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {error && <p className="text-[13px] text-etyme-attention">{error}</p>}
                <p className="text-[11px] text-etyme-faint">This link works once and runs out on {view.expiresOn}.</p>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
