'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact, rate as fmtRate } from '@/lib/money-display'

/**
 * A consultant's own page.
 *
 * Thirty screens existed and every one of them belonged to a company. This
 * is the first that belongs to a person — and it matters more than its size
 * suggests, because the three-way match rests on an approved timesheet and
 * until now nobody could enter an hour.
 *
 * Written for somebody who opens it once a week on a phone, between jobs,
 * to answer three questions: what am I owed, what have I not submitted, and
 * when does this end.
 */

interface Placement {
  id: string
  payer: string
  site: string
  location: string | null
  payRate: number | null
  rateNote: string | null
  state: string
  startDate: string
  endDate: string | null
  daysLeft: number | null
}
interface Timesheet {
  id: string
  period: string
  hours: number
  status: string
  billed: boolean
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
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

/**
 * Their CV.
 *
 * A submission with no document is not a submission a client can act on —
 * they read the CV, not the row. Every version is kept as it was sent, so
 * a client keeps the copy they were given.
 */
function YourCV() {
  const [data, setData] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/me/resumes')
    const body = await res.json()
    if (res.ok) setData(body.data)
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/me/resumes', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setMsg(body.data.message)
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(`/api/me/resumes?id=${id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setMsg(body.data.message)
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function act(payload: unknown, method = 'PATCH') {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch('/api/me/resumes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setMsg(body.data.message)
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null

  return (
    <section className="mt-10 pt-8 border-t border-etyme-rule">
      <h2 className="font-serif text-xl text-etyme-ink tracking-[-0.02em]">Your CV</h2>
      <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">{data.note}</p>

      <label className="inline-block mt-4">
        <span
          className={`px-3 py-1.5 rounded text-[13px] font-medium bg-etyme-action text-white cursor-pointer ${busy ? 'opacity-40' : ''}`}
        >
          {busy ? 'Uploading…' : data.versions.length > 0 ? 'Upload a newer one' : 'Upload your CV'}
        </span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
      </label>
      <span className="text-[12px] text-etyme-faint ml-3">PDF or Word, up to 5MB</span>

      {msg && <p className="text-[13px] text-etyme-verified mt-3">{msg}</p>}
      {err && <p className="text-[13px] text-etyme-attention mt-3">{err}</p>}

      {data.versions.length > 0 && (
        <div className="mt-5 space-y-2">
          {data.versions.map((v: any) => (
            <div
              key={v.id}
              className="flex items-baseline justify-between gap-4 bg-etyme-surface border border-etyme-rule rounded-lg px-4 py-3"
            >
              <div className="min-w-0">
                <a
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-[14px] ${v.deleted ? 'text-etyme-faint line-through' : 'text-etyme-action hover:underline'}`}
                >
                  {v.label}
                </a>
                <div className="text-[12px] text-etyme-muted mt-0.5">
                  {v.createdAt} · {Math.max(1, Math.round(v.sizeBytes / 1024))}KB
                  {v.uploadedBy !== 'you' && ` · added by ${v.uploadedBy}`}
                  {/* Where it actually went. The reason a version exists. */}
                  {v.sentToNames.length > 0 && ` · sent to ${v.sentToNames.join(', ')}`}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {v.isCurrent ? (
                  <Chip tone="verified">goes out</Chip>
                ) : !v.deleted ? (
                  <button
                    className="text-[12px] text-etyme-action hover:underline disabled:opacity-40"
                    disabled={busy}
                    onClick={() => act({ id: v.id, makeCurrent: true })}
                  >
                    use this one
                  </button>
                ) : (
                  <Chip>deleted</Chip>
                )}
                {!v.deleted && (
                  <button
                    className="text-[12px] text-etyme-muted hover:text-etyme-attention disabled:opacity-40"
                    disabled={busy}
                    onClick={() => remove(v.id)}
                  >
                    remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function MyWorkPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/me/work')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not load your work')
      setData(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function submitTimesheet(id: string) {
    const res = await fetch(`/api/timesheets/${id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error?.message ?? 'Could not send it'); return }
    await load()
  }

  if (loading) return <div className="text-etyme-muted py-12 text-center">Loading…</div>
  if (error) return (
    <div className="max-w-2xl border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
      <div className="text-etyme-attention font-medium">{error}</div>
      <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
    </div>
  )
  if (!data) return null

  const s = data.summary
  const open = data.timesheets.filter((t: Timesheet) => t.status === 'OPEN')

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <Lbl>You</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Your work</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
        <div>
          <Lbl>Hours this month</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.hoursThisMonth}</div>
        </div>
        <div>
          <Lbl>Waiting on approval</Lbl>
          <div className={`font-serif text-3xl mt-1 tabular-nums ${s.awaitingApproval > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {s.awaitingApproval}
          </div>
        </div>
        <div>
          <Lbl>Approved, not billed</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.approvedNotBilled}</div>
          <div className="text-xs text-etyme-muted">your vendor invoices these</div>
        </div>
        <div>
          <Lbl>Ending within 60 days</Lbl>
          <div className={`font-serif text-3xl mt-1 tabular-nums ${s.endingSoon > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {s.endingSoon}
          </div>
        </div>
      </div>

      {/* Anything not yet sent, first. It is the only thing on this page
          that is actually theirs to do. */}
      {open.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-etyme-ink mb-3">Hours to send</h2>
          <div className="bg-etyme-surface border border-etyme-attention/30 rounded-lg divide-y divide-etyme-rule">
            {open.map((t: Timesheet) => (
              <div key={t.id} className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-etyme-ink">{t.period}</div>
                  <div className="text-xs text-etyme-muted tabular-nums">{t.hours} hours</div>
                </div>
                <button onClick={() => submitTimesheet(t.id)}
                  className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
                  Send for approval
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Where you work</h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.placements.length === 0 && (
            <div className="p-6 text-center text-sm text-etyme-muted">No placements yet.</div>
          )}
          {data.placements.map((p: Placement) => (
            <div key={p.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-etyme-ink">{p.site}</div>
                <div className="text-xs text-etyme-muted">
                  {p.location && `${p.location} · `}
                  {/* Who pays is shown separately, because it is usually
                      not the company whose building they walk into. */}
                  paid by {p.payer} · from {p.startDate}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {p.payRate != null ? (
                  <div className="font-serif text-lg text-etyme-ink tabular-nums">
                    {fmtRate(p.payRate)}
                  </div>
                ) : (
                  // A blank with a reason beats the wrong number. This used
                  // to show what the client is billed, which is not their
                  // rate and is not theirs to see.
                  <div className="text-[12px] text-etyme-faint max-w-[10rem] leading-snug">
                    {p.rateNote}
                  </div>
                )}
              </div>
              <div className="w-28 text-right shrink-0">
                {p.daysLeft != null && p.daysLeft <= 60 && p.daysLeft >= 0
                  ? <Chip tone="attention">{p.daysLeft} days left</Chip>
                  : <Chip tone={p.state === 'IN_PROGRESS' ? 'verified' : 'passive'}>
                      {p.state.toLowerCase().replace(/_/g, ' ')}
                    </Chip>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Your hours</h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.timesheets.slice(0, 8).map((t: Timesheet) => (
            <div key={t.id} className="p-3 px-4 flex items-center gap-4">
              <div className="flex-1 text-sm text-etyme-ink">{t.period}</div>
              <div className="text-sm text-etyme-muted tabular-nums w-16 text-right">{t.hours}h</div>
              <div className="w-32 text-right">
                <Chip tone={
                  t.status === 'APPROVED' ? 'verified'
                  : t.status === 'REJECTED' ? 'attention'
                  : t.status === 'SUBMITTED' ? 'action' : 'passive'
                }>
                  {t.billed ? 'billed' : t.status.toLowerCase()}
                </Chip>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What has been sent about them. A consultant should not have to ask
          whether their passport went to a stranger. */}
      {data.sharedAboutMe.length > 0 && (
        <section>
          <h2 className="font-serif text-lg text-etyme-ink mb-3">Documents shared about you</h2>
          <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
            {data.sharedAboutMe.map((s: any, i: number) => (
              <div key={i} className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-etyme-ink">{s.purpose}</span>
                  {s.withdrawn
                    ? <Chip>withdrawn</Chip>
                    : <Chip tone={s.openedCount > 0 ? 'action' : 'passive'}>
                        {s.openedCount === 0 ? 'not opened' : `opened ${s.openedCount}×`}
                      </Chip>}
                </div>
                <p className="text-xs text-etyme-muted mt-1">
                  {s.by} sent these to {s.to} · until {s.expiresAt}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <YourCV />
    </div>
  )
}
