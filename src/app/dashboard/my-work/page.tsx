'use client'

import { readJson } from '@/lib/read-response'

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
 * The interviews they have been offered, and the buttons to answer them.
 *
 * `/api/me/pipeline` has shown proposed slots since it shipped, and this
 * page had no interview section at all — so a candidate was told three
 * times they were wanted and given nothing to tap. LEGACY_RULES.md §15.4
 * names it: the 2017 build had `accept_interview` and this one lost it.
 *
 * The times are formatted here, in the browser, because they are stored
 * absolute and must be read local. A candidate in Pune reading a slot
 * rendered in the server's time zone turns up on the wrong hour, and
 * every test still passes.
 */
interface Slot { start: string; end: string | null }
interface Interview {
  id: string
  round: number
  stage: string
  mode: string
  state: string
  with: string
  role: string
  submittedBy: string
  location: string | null
  durationMins: number
  slots: Slot[]
  answeredByYou: boolean
  confirmedStart: string | null
  confirmedBasis: string | null
}

/** "Tue 15 Sep, 10:00" — in the reader's own time zone, never the server's. */
function localTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/** "Technical · round 2". Their word for the round, not ours. */
function roundLine(iv: Interview): string {
  const stage = iv.stage
    ? iv.stage.charAt(0).toUpperCase() + iv.stage.slice(1).toLowerCase().replace(/_/g, ' ')
    : 'Interview'
  return `${stage} · round ${iv.round}`
}

/** How, and how long. Phone, video, in person — never the enum. */
function howLine(iv: Interview): string {
  const how =
    iv.mode === 'PHONE' ? 'Phone call'
    : iv.mode === 'VIDEO' ? 'Video call'
    : iv.mode === 'ONSITE' ? 'In person'
    : iv.mode.toLowerCase().replace(/_/g, ' ')
  const mins = iv.durationMins
  const long =
    mins >= 60 && mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : `${mins} minutes`
  return `${how} · ${long}`
}

function Where({ location }: { location: string | null }) {
  if (!location) return null
  const isLink = /^https?:\/\//i.test(location)
  return (
    <div className="text-[12px] text-etyme-muted mt-0.5 break-words">
      {isLink ? (
        <a href={location} target="_blank" rel="noreferrer" className="text-etyme-action hover:underline break-all">
          {location}
        </a>
      ) : (
        location
      )}
    </div>
  )
}

function InterviewCard({ iv, onAnswered }: { iv: Interview; onAnswered: () => void }) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  async function respond(payload: { action: 'ACCEPT' | 'DECLINE'; slot?: string; reason?: string }) {
    setBusy(true); setRefusal(null); setSaid(null)
    try {
      const res = await fetch(`/api/me/interviews/${iv.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      // A refusal is a sentence on the page. `readJson` turns a 403, a
      // 409 or an empty 500 into something a person can read, and the
      // try/catch keeps it here rather than throwing it at the overlay.
      const body = await readJson(res)
      setSaid(body.data.says)
      setDeclining(false)
      onAnswered()
    } catch (e: any) {
      setRefusal(e.message)
    } finally {
      setBusy(false)
    }
  }

  const waiting = iv.state === 'PROPOSED' && !iv.answeredByYou

  return (
    <div className="p-4 md:p-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-etyme-ink font-medium">{iv.with}</span>
        <span className="text-[13px] text-etyme-muted">{iv.role}</span>
      </div>
      <div className="text-[12px] text-etyme-muted mt-1">
        {roundLine(iv)} · arranged by {iv.submittedBy}
      </div>
      <div className="text-[12px] text-etyme-muted mt-0.5">{howLine(iv)}</div>
      <Where location={iv.location} />

      {/* Booked. The time and the place, plainly — and where nothing on
          file supports a time, a sentence instead of a guessed hour. */}
      {iv.state === 'CONFIRMED' && (
        <div className="mt-3">
          {iv.confirmedStart ? (
            <div className="text-[14px] text-etyme-ink">
              Booked for {localTime(iv.confirmedStart)}
              {iv.location ? ` · ${iv.location}` : ''}
            </div>
          ) : (
            <div className="text-[13px] text-etyme-muted">
              You accepted this one. {iv.submittedBy} has not sent the exact time back yet.
            </div>
          )}
        </div>
      )}

      {/* Answered, not yet booked. An interview has three diaries in it
          and the candidate's yes is only one of them — saying "booked"
          here would put a meeting in a calendar nobody else has agreed
          to. */}
      {!waiting && iv.state !== 'CONFIRMED' && (
        <div className="mt-3 text-[13px] text-etyme-muted">
          {iv.state === 'CANCELLED'
            ? 'This one is off.'
            : iv.state === 'DONE'
            ? 'Done. Waiting on what they thought.'
            : `You said yes${iv.confirmedStart ? `, for ${localTime(iv.confirmedStart)}` : ''}. ${iv.submittedBy} still has to confirm it.`}
        </div>
      )}

      {waiting && iv.slots.length === 0 && (
        <div className="mt-3 text-[13px] text-etyme-muted">
          No times offered yet. {iv.submittedBy} is arranging them.
        </div>
      )}

      {waiting && iv.slots.length > 0 && (
        <div className="mt-4">
          <div className="text-[12px] text-etyme-muted mb-2">
            {iv.slots.every((s) => new Date(s.start).getTime() < Date.now())
              ? `Every time offered has passed. Tell ${iv.submittedBy} and they will send new ones.`
              : 'Pick a time that works for you.'}
          </div>
          <div className="flex flex-col gap-2">
            {iv.slots.map((s) => {
              // A time that has already been and gone is not an offer.
              // Slots sit unanswered for days; a button still saying "I
              // can do this" against last Monday books a meeting nobody
              // can attend, and the route would accept it.
              const gone = new Date(s.start).getTime() < Date.now()
              return gone ? (
                <div
                  key={s.start}
                  className="w-full md:w-auto md:self-start px-3 py-2 text-[14px] text-etyme-faint line-through"
                >
                  {localTime(s.start)}
                </div>
              ) : (
                <button
                  key={s.start}
                  disabled={busy}
                  onClick={() => respond({ action: 'ACCEPT', slot: s.start })}
                  className="w-full md:w-auto md:self-start text-left px-3 py-2 rounded border border-etyme-action/40 bg-etyme-action/5 text-etyme-action text-[14px] font-medium hover:bg-etyme-action/10 disabled:opacity-40"
                >
                  {localTime(s.start)} — I can do this
                </button>
              )
            })}
          </div>

          {/* Quiet, because it is the answer nobody wants to give and
              everybody sometimes has to. Typed here, not in a browser
              prompt — a prompt cannot be read on a phone and cannot be
              corrected. */}
          {!declining ? (
            <button
              disabled={busy}
              onClick={() => setDeclining(true)}
              className="mt-3 text-[13px] text-etyme-muted hover:text-etyme-attention underline disabled:opacity-40"
            >
              I can&apos;t make any of these
            </button>
          ) : (
            <div className="mt-3">
              <label htmlFor={`why-${iv.id}`} className="text-[12px] text-etyme-muted block">
                Say why, in a sentence. {iv.submittedBy} will see it.
              </label>
              <textarea
                id={`why-${iv.id}`}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="I'm on site those mornings — any afternoon next week works."
                className="mt-1 w-full rounded border border-etyme-rule bg-white px-3 py-2 text-[14px] text-etyme-ink"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  disabled={busy || reason.trim() === ''}
                  onClick={() => respond({ action: 'DECLINE', reason: reason.trim() })}
                  className="px-3 py-1.5 rounded bg-etyme-attention text-white text-[13px] font-medium disabled:opacity-40"
                >
                  Send this
                </button>
                <button
                  disabled={busy}
                  onClick={() => { setDeclining(false); setReason('') }}
                  className="px-3 py-1.5 text-[13px] text-etyme-muted hover:underline disabled:opacity-40"
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {said && <p className="text-[13px] text-etyme-verified mt-3">{said}</p>}
      {refusal && <p className="text-[13px] text-etyme-attention mt-3">{refusal}</p>}
    </div>
  )
}

function YourInterviews() {
  const [ahead, setAhead] = useState<Interview[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/me/pipeline'))
      setAhead(body.data.interviewsAhead)
      setErr(null)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (err) {
    return (
      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Your interviews</h2>
        <p className="text-[13px] text-etyme-attention">{err}</p>
      </section>
    )
  }

  // Nothing ahead is not a state worth a heading. The page is long
  // enough without an empty box on it.
  if (!ahead || ahead.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="font-serif text-lg text-etyme-ink mb-3">Your interviews</h2>
      <div className="bg-etyme-surface border border-etyme-action/30 rounded-lg divide-y divide-etyme-rule">
        {ahead.map((iv) => (
          <InterviewCard key={iv.id} iv={iv} onAnswered={load} />
        ))}
      </div>
    </section>
  )
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
    // `if (res.ok)` and nothing else meant a failure showed the reader
    // nothing at all — no CVs, no explanation, no way to tell an empty
    // list from an ended session. There is an error state right there;
    // it just was not being set.
    try {
      const body = await readJson(await fetch('/api/me/resumes'))
      setData(body.data)
      setErr(null)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/me/resumes', { method: 'POST', body: form })
      const body = await readJson(res)
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
      const body = await readJson(res)
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
      const body = await readJson(res)
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
      const j = await readJson(res)
      setData(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function submitTimesheet(id: string) {
    const res = await fetch(`/api/timesheets/${id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    let j: any
    try {
      j = await readJson(res)
    } catch (e: any) {
      alert(e.message)
      return
    }
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
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

      {/* Somebody is waiting on them to answer. Nothing else on this
          page expires. */}
      <YourInterviews />

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
