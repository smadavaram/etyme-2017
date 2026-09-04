'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Who has me, and what have they done with me.
 *
 * A contract consultant is on five or ten benches. They have never been
 * able to see that list in one place, let alone what each agency did with
 * it — how many times they were submitted, to whom, and which agency is
 * currently sitting on them at a client. They find out when a recruiter
 * says "we already have your CV from somebody else", by which point the
 * role is gone and nobody will say why.
 *
 * Every agency on this page can see only their own row of it. None of them
 * can see this page.
 */

interface Hold {
  id: string
  client: string
  role: string | null
  daysLeft: number
}
interface Bench {
  listingId: string
  companyId: string
  company: string
  tier: string
  since: string
  askFirst: boolean
  showBeforeFree: boolean
  submissions: number
  holds: Hold[]
}
interface Data {
  benches: Bench[]
  asking: { id: string; company: string; client: string; role: string | null; askedAt: string }[]
  notThese: { id: string; company: string; companyId: string; note: string | null }[]
  history: {
    company: string; client: string; role: string; when: string
    status: string; sentOnTo: string | null
  }[]
  note: string
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Panel({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
      <h2 className="font-serif text-[19px] text-etyme-ink tracking-[-0.02em]">{title}</h2>
      {subtitle && <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Chip({ children, tone = 'passive' }: {
  children: React.ReactNode
  tone?: 'attention' | 'verified' | 'action' | 'passive'
}) {
  const tones = {
    attention: 'bg-etyme-attention/10 text-etyme-attention',
    verified: 'bg-etyme-verified/10 text-etyme-verified',
    action: 'bg-etyme-action/10 text-etyme-action',
    passive: 'bg-etyme-rule/50 text-etyme-muted',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

const btn = 'px-3 py-1.5 rounded text-[13px] font-medium transition-colors disabled:opacity-40'
const primary = `${btn} bg-etyme-action text-white hover:opacity-90`
const quiet = `${btn} border border-etyme-rule text-etyme-ink hover:bg-etyme-canvas`

export default function MyBenchesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/me/benches')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(payload: unknown) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch('/api/me/benches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setFlash(body.data?.message ?? 'Saved.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="p-8 text-[14px] text-etyme-muted">Loading…</div>
  if (error && !data) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-etyme-attention">{error}</p>
        <button className={`${quiet} mt-4`} onClick={load}>Try again</button>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="p-8 max-w-3xl">
      <div className="eyebrow">You</div>
      <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Who has you</h1>
      <p className="text-[15px] text-etyme-muted mt-2 max-w-prose leading-relaxed">
        {data.note}
      </p>

      {flash && <p className="text-[13px] text-etyme-verified mt-4">{flash}</p>}
      {error && <p className="text-[13px] text-etyme-attention mt-4">{error}</p>}

      <div className="mt-6">
        {/* ── Waiting on you ───────────────────────────────────────── */}
        {data.asking.length > 0 && (
          <Panel
            title="Waiting on you"
            subtitle="You asked these agencies to check with you before putting you in front of anybody."
          >
            <div className="space-y-3">
              {data.asking.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] text-etyme-ink">
                      {a.company} → {a.client}
                    </p>
                    <p className="text-[13px] text-etyme-muted mt-0.5">
                      {[a.role, `asked ${a.askedAt}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className={primary}
                      disabled={busy}
                      onClick={() => send({ answer: a.id, yes: true })}
                    >
                      Yes
                    </button>
                    <button
                      className={quiet}
                      disabled={busy}
                      onClick={() => send({ answer: a.id, yes: false })}
                    >
                      No
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ── The benches ──────────────────────────────────────────── */}
        <Panel
          title="Agencies marketing you"
          subtitle="Each of them sees their own listing and nothing else. None of them knows the others exist."
        >
          {data.benches.length === 0 ? (
            <p className="text-[13px] text-etyme-faint">
              Nobody is marketing you. A bench listing is your permission — yours to give and to take
              back.
            </p>
          ) : (
            <div className="space-y-5">
              {data.benches.map((b) => (
                <div key={b.listingId} className="pb-5 border-b border-etyme-rule last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[15px] text-etyme-ink">
                        {b.company}{' '}
                        <span className="ml-1.5">
                          <Chip tone={b.tier === 'RETAINED' ? 'verified' : 'passive'}>
                            {b.tier === 'RETAINED' ? 'retained' : 'marketing'}
                          </Chip>
                        </span>
                      </p>
                      <p className="text-[13px] text-etyme-muted mt-0.5 tabular-nums">
                        since {b.since} · {b.submissions}{' '}
                        {b.submissions === 1 ? 'submission' : 'submissions'} in your name
                      </p>
                    </div>
                    <button
                      className={quiet}
                      disabled={busy}
                      onClick={() => send({ revokeListing: b.listingId })}
                    >
                      Take it back
                    </button>
                  </div>

                  {/* Where this agency currently holds them. The one thing
                      that stops a second agency submitting them there. */}
                  {b.holds.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <Lbl>Representing you at</Lbl>
                      {b.holds.map((h) => (
                        <div key={h.id} className="flex items-baseline justify-between gap-4">
                          <span className="text-[14px] text-etyme-ink">
                            {h.client}
                            {h.role && <span className="text-etyme-muted"> · {h.role}</span>}
                          </span>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="text-[12px] text-etyme-muted tabular-nums">
                              {h.daysLeft}d left
                            </span>
                            <button
                              className="text-[12px] text-etyme-action hover:underline disabled:opacity-40"
                              disabled={busy}
                              onClick={() => send({ releaseHold: h.id })}
                            >
                              take back
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex items-center gap-2 mt-3 text-[13px] text-etyme-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={b.askFirst}
                      disabled={busy}
                      onChange={() => send({ listingId: b.listingId, askFirst: !b.askFirst })}
                    />
                    Ask me before sending me to a client I have not been sent to before
                  </label>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Clients they will not go to ──────────────────────────── */}
        <Panel
          title="Clients you will not be sent to"
          subtitle="No agency can submit you here. None of them is told why, or by whom."
        >
          {data.notThese.length === 0 ? (
            <p className="text-[13px] text-etyme-faint">
              Nobody. Usually this is your current client, and it is worth adding before somebody
              submits you there by accident.
            </p>
          ) : (
            <div className="space-y-2">
              {data.notThese.map((n) => (
                <div key={n.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-[14px] text-etyme-ink">
                    {n.company}
                    {n.note && <span className="text-etyme-faint"> · {n.note}</span>}
                  </span>
                  <button
                    className="text-[12px] text-etyme-action hover:underline shrink-0 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => send({ allowAgain: n.id })}
                  >
                    allow again
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Everything done in their name ────────────────────────── */}
        <Panel
          title="Every time you were put forward"
          subtitle="Whoever did it. This list has never existed anywhere in this industry."
        >
          {data.history.length === 0 ? (
            <p className="text-[13px] text-etyme-faint">Nobody has submitted you yet.</p>
          ) : (
            <div className="space-y-2">
              {data.history.map((h, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4">
                  <span className="text-[14px] text-etyme-ink min-w-0">
                    {h.client}
                    <span className="text-etyme-muted"> · {h.role}</span>
                    <span className="text-etyme-faint"> · by {h.company}</span>
                    {/* Whether it actually went on, which is the question
                        behind "have they submitted me yet". */}
                    <span className="block text-[12px] text-etyme-muted mt-0.5">
                      {h.sentOnTo
                        ? `sent on to ${h.sentOnTo}`
                        : 'still with them — not sent on yet'}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <Chip
                      tone={
                        h.status === 'PLACED' ? 'verified'
                          : h.status === 'REJECTED' || h.status === 'NOT_SELECTED' ? 'attention'
                            : 'passive'
                      }
                    >
                      {h.status.toLowerCase().replace('_', ' ')}
                    </Chip>
                    <span className="text-[12px] text-etyme-muted tabular-nums">{h.when}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
