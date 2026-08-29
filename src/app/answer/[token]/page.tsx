'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'

/**
 * Answering a role without an account.
 *
 * The page a supplier lands on from a client's email. Eleven of twelve
 * listed suppliers will never sign up, and until this existed that meant
 * eleven of twelve could not answer — so the client's screening sat in
 * front of an empty pile.
 *
 * One job: read the role, paste a CV, send. The account is offered
 * afterwards, when they have already got value from it and it is a
 * smaller ask than it was five minutes earlier.
 */

interface Role {
  invitationId: string
  title: string
  skills: string[]
  location: string | null
  startDate: string | null
  months: number | null
  workAuthRequired: string | null
  band: { min: number | null; max: number | null }
  message: string | null
  alreadySent: number
}

interface Data {
  supplier: string
  client: string
  contactName: string | null
  claimed: boolean
  roles: Role[]
  says: string
}

function money(c: number | null) {
  if (c == null) return null
  const d = c / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

export default function AnswerPage() {
  const [d, setD] = useState<Data | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [cv, setCv] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [rate, setRate] = useState('')
  const [workAuth, setWorkAuth] = useState('')
  const [mayRepresent, setMayRepresent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ says: string; takeAccount: boolean } | null>(null)
  const [token, setToken] = useState('')

  const load = useCallback(async () => {
    const t = window.location.pathname.split('/').pop() ?? ''
    setToken(t)
    try {
      const res = await fetch(`/api/answer/${t}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setD(body.data)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(invitationId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/answer/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invitationId, cv,
          name: name || undefined,
          email: email || undefined,
          rateCents: rate ? Math.round(Number(rate) * 100) : undefined,
          workAuth: workAuth || undefined,
          mayRepresent,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setSent({ says: body.data.says, takeAccount: body.data.takeAccount })
      setCv(''); setName(''); setEmail(''); setRate(''); setWorkAuth(''); setMayRepresent(false)
      setOpen(null)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-etyme-canvas">
      <div className="mx-auto max-w-[680px] px-6 py-14">
        <EtymeLogo size="lg" />

        {error && !d && (
          <div className="panel mt-10">
            <p className="text-[13px] text-etyme-attention">{error}</p>
            <p className="mt-3 text-[12px] text-etyme-faint">
              Ask whoever sent it for a fresh link.
            </p>
          </div>
        )}

        {d && (
          <div className="mt-10 space-y-6">
            <header>
              <p className="eyebrow">{d.client} sent this to {d.supplier}</p>
              <h1 className="headline-serif mt-2 text-[32px] leading-[1.08]">{d.says}</h1>
              <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-etyme-muted">
                Answer it here. Nothing to set up, no account, no bench to build
                first — paste a CV and it reaches them.
              </p>
            </header>

            {sent && (
              <div className="panel">
                <p className="text-[14px]" style={{ color: 'var(--color-verified)' }}>
                  {sent.says}
                </p>
                {sent.takeAccount && (
                  <p className="mt-3 text-[13px] text-etyme-muted">
                    Want to see what happens to it, and get their next role
                    directly?{' '}
                    <Link href={`/claim/${token}`} className="underline">
                      Take the {d.supplier} account
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}

            {d.roles.length === 0 && (
              <div className="panel">
                <p className="text-[13px] text-etyme-muted">
                  Nothing open right now. Their next role will reach you at this
                  same address.
                </p>
              </div>
            )}

            {d.roles.map((r) => (
              <article key={r.invitationId} className="panel">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-[16px] font-semibold text-etyme-ink">{r.title}</p>
                    <p className="mt-0.5 text-[12px] text-etyme-faint">
                      {[
                        r.location,
                        r.band.max ? `up to ${money(r.band.max)}/hr` : null,
                        r.months ? `${r.months} months` : null,
                        r.startDate
                          ? `starts ${new Date(r.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                          : null,
                        r.workAuthRequired ? `needs ${r.workAuthRequired}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {r.alreadySent > 0 && (
                    <span className="chip chip--verified">
                      {r.alreadySent} sent
                    </span>
                  )}
                </div>

                {r.skills.length > 0 && (
                  <p className="mt-2 font-mono text-[11px] text-etyme-muted">
                    {r.skills.join(' · ')}
                  </p>
                )}

                {r.message && (
                  <p className="mt-3 border-l-2 border-etyme-rule pl-3 text-[13px] italic text-etyme-muted">
                    {r.message}
                  </p>
                )}

                {open !== r.invitationId ? (
                  <button
                    onClick={() => setOpen(r.invitationId)}
                    className="mt-4 rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white"
                  >
                    Send somebody
                  </button>
                ) : (
                  <div className="mt-4 space-y-2 border-t border-etyme-rule pt-4">
                    <textarea
                      value={cv}
                      onChange={(e) => setCv(e.target.value)}
                      rows={7}
                      placeholder="Paste the CV here"
                      className="w-full rounded border border-etyme-rule bg-etyme-raised p-3
                                 font-mono text-[12px] leading-relaxed text-etyme-ink
                                 placeholder:text-etyme-faint"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:grid-cols-4">
                      <input value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="Name (read from CV)"
                        className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[12px]" />
                      <input value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email (read from CV)"
                        className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[12px]" />
                      <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal"
                        placeholder={r.band.max ? `Rate — up to ${money(r.band.max)}` : 'Rate per hour'}
                        className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[12px] tabular-nums" />
                      <select value={workAuth} onChange={(e) => setWorkAuth(e.target.value)}
                        className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[12px]">
                        <option value="">Work permit…</option>
                        <option value="US_CITIZEN">US Citizen</option>
                        <option value="GC">Green Card</option>
                        <option value="H1B">H1B</option>
                        <option value="EAD">EAD</option>
                        <option value="OPT">OPT</option>
                        <option value="TN">TN</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-etyme-faint">
                      The permit is never read from a CV — say what they hold.
                    </p>

                    <label className="flex cursor-pointer items-start gap-2 pt-1">
                      <input type="checkbox" checked={mayRepresent} className="mt-0.5"
                        onChange={(e) => setMayRepresent(e.target.checked)} />
                      <span className="text-[12px] text-etyme-muted">
                        This person knows I am putting them forward. Recorded against{' '}
                        {d.supplier} — being submitted blind is what makes consultants
                        stop answering.
                      </span>
                    </label>

                    {error && <p className="text-[13px] text-etyme-attention">{error}</p>}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => send(r.invitationId)}
                        disabled={busy || cv.trim().length < 60 || !mayRepresent || !rate}
                        className="rounded-lg bg-etyme-action px-5 py-2.5 text-[13px] font-semibold
                                   text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy ? 'Sending…' : 'Send'}
                      </button>
                      <button onClick={() => setOpen(null)}
                        className="text-[12px] text-etyme-faint underline">
                        Not this one
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}

            <p className="border-t border-etyme-rule pt-5 text-[12px] leading-relaxed text-etyme-faint">
              Your bench, your rates and your client relationships stay yours. They
              are not shared with other suppliers, and you can export everything
              whenever you want.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
