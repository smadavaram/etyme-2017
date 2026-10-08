'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback } from 'react'
import { amount, compact, rate as fmtRate } from '@/lib/money-display'
import { YourPapers } from './papers'
import { AskedToMarket } from './asked-to-market'

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
  /** "Northbend Athletic · through Computer Systems · employed by Techpeple" */
  chain: string
  through: string[]
  payer: string
  site: string
  location: string | null
  payRate: number | null
  rateNote: string | null
  state: string
  startDate: string
  endDate: string | null
  /** "Jun 1 – Aug 31, 2026 · ended" — `placementSpan`, never an ISO day. */
  span: string
  daysLeft: number | null
}
/**
 * One of their weeks as `/api/me/work` reads it, in one of four places.
 *
 * Waiting for the client, or waiting for their employer: hours and a
 * sentence, and never a figure, because nobody owes them anything for a
 * week their employer has not accepted (the founder, 2026-09-29). Owed:
 * accepted, priced with payroll's own functions, and the pay day it falls
 * due on. Paid: what was paid, and the day. No rate of any rung is on it.
 */
type WeekStage = 'WAITING_FOR_CLIENT' | 'WAITING_FOR_EMPLOYER' | 'OWED' | 'PAID'
interface OwedWeek {
  weekOf: string
  stage: WeekStage
  /** "Week of Sep 14", or "Sep 18 to Sep 24" for a sheet that is not one week. */
  label: string
  payer: string
  says: string
  hours: number | null
  // Only on a week their employer accepted.
  currency?: string
  priced?: boolean
  ordinaryHours?: number | null
  overtimeHours?: number | null
  premiumCents?: number | null
  owedCents?: number | null
  paidCents?: number
  stillOwedCents?: number | null
  dueOn?: string | null
  overdue?: boolean
  paidOn?: string | null
  /** Where its days are paid on more than one pay day, each part on its own. */
  parts?: OwedPart[] | null
  // Only on a week still waiting.
  sheetId?: string
  waitingOn?: string
}
interface OwedPart {
  from: string
  to: string
  /** "Jun 29 – Jun 30". */
  label: string
  hours: number
  owedCents: number
  paidCents: number
  stillOwedCents: number
  stage: 'OWED' | 'PAID'
  dueOn: string | null
  overdue: boolean
  paidOn: string | null
}
interface Owed {
  cents: number
  currency: string | null
  says: string
  waiting?: { weeks: number; hours: number; says: string | null }
  weeks?: OwedWeek[]
  /** Her own company bills for her hours; said instead of what is owed. */
  ownCompanyBills?: string | null
}
interface Timesheet {
  id: string
  period: string
  hours: number
  status: string
  billed: boolean
  /** "Approved by email: Marcus Oyelaran, Sep 2 — evidence attached", where the client approved that way. */
  approvedBy?: string | null
  /** The week's own page, where she asks for approval by email or attaches it. Null on a week not sent. */
  door?: { href: string; says: string } | null
  /** Its one state, the same one the tiles count (`weekState`). */
  state?: { word: string; tone: 'verified' | 'attention' | 'action' | 'passive' }
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
                  {v.addedOn} · {Math.max(1, Math.round(v.sizeBytes / 1024))}KB
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

/**
 * Your paperwork, on the work page.
 *
 * The section moved into `./papers` on 2026-09-21 so that it could also
 * be a page of its own at `/dashboard/my-work/paperwork` — the page
 * every chase letter names and nobody could open. One component, two
 * doors, so the letter and the screen cannot describe different things.
 */

/**
 * What this page says to somebody who has a page because they made one.
 *
 * The independent candidate — party 8B in the lane drawings, and the
 * state every consumer-email sign-in is in on their first day: a
 * profile, and not one other fact. No bench listing, no employer, no
 * submission, nobody paying them.
 *
 * Four zeros and "No placements yet" is technically true and reads as a
 * broken screen. Worse, the standing sentence above them used to say
 * "your work is on the record here", which is the one thing that is not
 * true about this person.
 *
 * So it is two short cards — what this page will show, and what they
 * can do now — and no button Etyme cannot honor. It was five paragraphs
 * of prose until the sign-up walk of 2026-10-08, and it offered "set up
 * a company of your own", a door that did not exist; the one-person firm
 * is a sign-up type now, and the page says so in one line.
 * **There is no "submit yourself" and no "find a role", because Etyme
 * places nobody** — the invitation comes from a firm that read their
 * page, which is why the page is the only thing worth doing today. The
 * two links go to what is actually theirs: their page and their paperwork.
 */
function NothingYet({ says, listedBy = null, ownFirm = null }: {
  says: string
  /** "Listed by Brightmoor Staffing. …" for somebody on a bench; else null. */
  listedBy?: string | null
  /** The one-person firm they own; the cards then speak of their company, never a vendor. */
  ownFirm?: string | null
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Lbl>You</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Your work</h1>
      </div>

      {/* A firm asked to market them and they have not answered: first. */}
      <AskedToMarket />

      {/* Short cards, not prose (sign-up walk, 2026-10-08). Their standing
          in one line from the one place that decides it, then what this
          page will hold, then what they can do today. */}
      <h2 className="font-serif text-xl text-etyme-ink tracking-[-0.02em]">
        There is no work here yet.
      </h2>
      <p className="text-[14px] text-etyme-muted mt-2 max-w-prose">{says}</p>
      {/* On a bench: the firm that lists them, in one line. */}
      {listedBy && <p className="text-[14px] text-etyme-ink mt-1 max-w-prose">{listedBy}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5">
          <Lbl>{ownFirm ? 'Once your company is on a contract' : 'Once a firm puts you forward'}</Lbl>
          <ul className="mt-3 space-y-1.5 text-[14px] text-etyme-ink">
            <li>Where you work and who pays you</li>
            <li>The weeks you file</li>
            <li>What is approved</li>
            <li>What you are owed</li>
          </ul>
          <p className="text-[13px] text-etyme-muted mt-3">Until then this page is empty, not zeros.</p>
        </section>

        <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5">
          <Lbl>What you can do now</Lbl>
          <ul className="mt-3 space-y-1.5 text-[14px] text-etyme-ink">
            <li>Turn your page on. Nothing is public until you do.</li>
            <li>Keep it current: your skills and when you are free.</li>
            <li>Answer any paperwork a firm asks you for.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/dashboard/my-page"
              className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
              Your page
            </a>
            <a href="/dashboard/my-work/paperwork"
              className="px-4 py-2 border border-etyme-rule rounded text-sm font-medium text-etyme-ink hover:bg-etyme-rule/30">
              Your paperwork
            </a>
          </div>
        </section>
      </div>

      {/* Etyme places nobody, so this card offers no button to be placed.
          How a firm finds them depends on their standing, and the page
          says that part (OWN_MAKING: through their page; a bench: the firm
          that lists them, in the line above). */}
      <p className="text-[13px] text-etyme-muted mt-4">
        Etyme places nobody.
      </p>

      {/* The one-person firm is a sign-up type, and the line is its door:
          the sign-up form opens on that type (`/signup?type=solo`). Not
          shown to somebody who already owns one. */}
      {!ownFirm && (
        <p className="text-[13px] text-etyme-muted mt-1">
          If you work through your own company,{' '}
          <a href="/signup?type=solo" className="text-etyme-action hover:underline">
            sign up as &ldquo;I work through my own company&rdquo;
          </a>.
        </p>
      )}

      {/* Still theirs, and still worth having ready: anything somebody
          has asked them to sign, and the CV a firm would be sent. With
          nothing on file the paperwork section says so in one sentence. */}
      <div className="mt-8">
        <YourPapers />
        <YourCV />
      </div>
    </div>
  )
}

interface OpenWeek {
  periodStart: string
  periodEnd: string
  days: string[]
  label: string
}
interface ReturnedWeek extends OpenWeek {
  timesheetId: string
  /** The hours that were on it, to start the correction from. */
  hours: Record<string, number>
  /** Why it came back, in the signer's words. */
  reason: string | null
}
interface Filing {
  contractId: string
  site: string
  payer: string
  /** Who signs her hours after she sends them, in order (`signingOrder`). */
  signs?: string
  weeks: OpenWeek[]
  returned?: ReturnedWeek[]
}

/**
 * A week that came back, corrected and sent again.
 *
 * A reject returns a week to OPEN with a reason, and this page counted its
 * days as filed — so it was offered nowhere and could not be corrected.
 * It is offered here with the hours that were on it and the reason it
 * came back, and "Send again" writes over the same week through the same
 * door (`POST /api/me/work`, then the timesheets door), so the rejection
 * on the record still points at it.
 */
function SentBack({ contractId, week, onSent }: { contractId: string; week: ReturnedWeek; onSent: () => Promise<void> }) {
  const [hours, setHours] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(week.hours).map(([d, h]) => [d, String(h)]))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const total = Object.values(hours).reduce((n, h) => n + (Number(h) || 0), 0)

  async function send() {
    setBusy(true); setError(null); setFlash(null)
    try {
      const res = await fetch('/api/me/work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, periodStart: week.periodStart, hours }),
      })
      const j = await readJson(res)
      setFlash(j.data?.message ?? 'Sent.')
      await onSent()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div>
        <div className="text-etyme-ink">{week.label}</div>
        <p className="text-xs text-etyme-attention mt-0.5">{week.reason ?? 'Sent back for correction.'}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {week.days.map((d) => (
          <label key={d} className="text-xs text-etyme-muted">
            <span className="block mb-1">{dayLabel(d)}</span>
            <input
              type="number" min="0" max="24" step="0.25" inputMode="decimal"
              value={hours[d] ?? ''}
              onChange={(e) => setHours({ ...hours, [d]: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-etyme-rule rounded tabular-nums text-etyme-ink"
              placeholder="0"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-etyme-muted tabular-nums">{total} hours</span>
        <button
          onClick={send}
          disabled={busy || total <= 0}
          className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          Send again
        </button>
      </div>
      {error && <p className="text-sm text-etyme-attention">{error}</p>}
      {flash && <p className="text-sm text-etyme-verified">{flash}</p>}
    </div>
  )
}

function dayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

/**
 * Their own week, written by them.
 *
 * CLAUDE.md, Phase 1 station 6: "the worker files their own week; nobody
 * else may". Until 2026-09-28 this page listed weeks and offered to send
 * an open one, and nothing on it let anybody write one — the consultant's
 * view was read-only, and the founder's lifecycle walk stopped here.
 *
 * The server decides which contract and which days are open
 * (`/api/me/work`, from `lib/consultant-portfolio`), and checks what is
 * typed again when it arrives; this form only offers what it was told is
 * open, so a day that has not happened, or is already on a filed week,
 * has no box at all.
 */
function FileYourWeek({ filing, onSent }: { filing: Filing[]; onSent: () => Promise<void> }) {
  const [contractId, setContractId] = useState(filing[0]?.contractId ?? '')
  const current = filing.find((f) => f.contractId === contractId) ?? filing[0]
  const [periodStart, setPeriodStart] = useState(current?.weeks[0]?.periodStart ?? '')
  const week = current?.weeks.find((w) => w.periodStart === periodStart) ?? current?.weeks[0]
  const [hours, setHours] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  if (!current) return null

  if (current.weeks.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">File your hours</h2>
        <p className="text-sm text-etyme-muted">
          Every day you have worked at {current.site} is on a week you filed. The next one opens tomorrow.
        </p>
      </section>
    )
  }

  const total = Object.values(hours).reduce((n, h) => n + (Number(h) || 0), 0)

  async function send() {
    if (!week) return
    setBusy(true); setError(null); setFlash(null)
    try {
      const res = await fetch('/api/me/work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: current!.contractId, periodStart: week.periodStart, hours }),
      })
      const j = await readJson(res)
      setFlash(j.data?.message ?? 'Sent.')
      setHours({})
      await onSent()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-8">
      <h2 className="font-serif text-lg text-etyme-ink mb-1">File your hours</h2>
      <p className="text-xs text-etyme-muted mb-3">
        Your hours, in your words. {current.signs ?? `After you send, they go for approval before ${current.payer} pays them.`}
      </p>
      <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          {filing.length > 1 && (
            <label className="text-xs text-etyme-muted">
              <span className="block mb-1">Placement</span>
              <select
                value={current.contractId}
                onChange={(e) => {
                  const next = filing.find((f) => f.contractId === e.target.value)
                  setContractId(e.target.value)
                  setPeriodStart(next?.weeks[0]?.periodStart ?? '')
                  setHours({})
                }}
                className="px-2 py-1.5 text-sm border border-etyme-rule rounded bg-white text-etyme-ink"
              >
                {filing.map((f) => (
                  <option key={f.contractId} value={f.contractId}>{f.site} · through {f.payer}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-etyme-muted">
            <span className="block mb-1">Week</span>
            <select
              value={week?.periodStart ?? ''}
              onChange={(e) => { setPeriodStart(e.target.value); setHours({}) }}
              className="px-2 py-1.5 text-sm border border-etyme-rule rounded bg-white text-etyme-ink"
            >
              {current.weeks.map((w) => (
                <option key={w.periodStart} value={w.periodStart}>{w.label}</option>
              ))}
            </select>
          </label>
        </div>

        {week && (
          <div className="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {week.days.map((d) => (
              <label key={d} className="text-xs text-etyme-muted">
                <span className="block mb-1">{dayLabel(d)}</span>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  inputMode="decimal"
                  value={hours[d] ?? ''}
                  onChange={(e) => setHours({ ...hours, [d]: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-etyme-rule rounded tabular-nums text-etyme-ink"
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-etyme-muted tabular-nums">{total} hours</span>
          <button
            onClick={send}
            disabled={busy || total <= 0}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            Send for approval
          </button>
        </div>
        {error && <p className="text-sm text-etyme-attention">{error}</p>}
        {flash && <p className="text-sm text-etyme-verified">{flash}</p>}
      </div>
    </section>
  )
}

/**
 * What they are owed, week by week, and what is not owed yet.
 *
 * The first of the three questions this page exists to answer. Each week
 * is in one of four places, in plain words: sent and waiting for the
 * client to sign it; signed and waiting for their employer to accept it;
 * owed to them, with what payroll pays for it and the pay day it falls
 * due on; or paid, with the day. Only the last two carry money. A week
 * the client has signed and the employer has not accepted is not owed
 * yet, and never shows a figure as owed — the founder, 2026-09-29.
 *
 * Weeks still waiting or owed come first. Weeks paid in full are one
 * line, opened on a tap, because a year of paid weeks is not what
 * somebody opens this for.
 */
const STAGE: Record<WeekStage, (w: OwedWeek) => { word: string; tone: 'attention' | 'verified' | 'action' | 'passive' }> = {
  WAITING_FOR_CLIENT: (w) => ({ word: `Waiting for ${w.waitingOn ?? 'the client'}`, tone: 'passive' }),
  WAITING_FOR_EMPLOYER: (w) => ({ word: `Waiting for ${w.waitingOn ?? w.payer}`, tone: 'action' }),
  OWED: (w) => (w.overdue ? { word: 'Past its pay day', tone: 'attention' } : { word: 'Owed to you', tone: 'attention' }),
  PAID: () => ({ word: 'Paid', tone: 'verified' }),
}

function Line({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-etyme-muted">{label}</span>
      <span className={tone ?? 'text-etyme-ink'}>{children}</span>
    </div>
  )
}

function YourPay({ owed }: { owed: Owed }) {
  const [showPaid, setShowPaid] = useState(false)
  const weeks = owed.weeks ?? []
  const open = weeks.filter((w) => w.stage !== 'PAID')
  const paid = weeks.filter((w) => w.stage === 'PAID')
  const shown = showPaid ? [...open, ...paid].sort((a, b) => b.weekOf.localeCompare(a.weekOf)) : open

  return (
    owed.ownCompanyBills ? (
      // Paid through her own company: her company bills, and nothing is
      // owed to her as wages, so the owed section is not drawn at all.
      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-1">What your company bills</h2>
        <p className="text-sm text-etyme-ink mb-1">{owed.ownCompanyBills}</p>
        {owed.waiting?.says && <p className="text-xs text-etyme-muted mb-3">{owed.waiting.says}</p>}
      </section>
    ) : (
    <section className="mb-8">
      <h2 className="font-serif text-lg text-etyme-ink mb-1">What you are owed</h2>
      {/* The sentence carries the figure: what is owed, for which hours,
          and whether any of it is past its pay day. */}
      <p className={`text-sm mb-1 ${owed.cents > 0 ? 'text-etyme-ink' : 'text-etyme-muted'}`}>{owed.says}</p>
      {/* Not owed yet, said on a line of its own and with no money on it. */}
      {owed.waiting?.says && (
        <p className="text-xs text-etyme-muted mb-3">{owed.waiting.says}</p>
      )}
      {shown.length > 0 && (
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule mt-3">
          {shown.map((w, i) => {
            const chip = STAGE[w.stage](w)
            const waiting = w.stage === 'WAITING_FOR_CLIENT' || w.stage === 'WAITING_FOR_EMPLOYER'
            return (
              <div key={`${w.payer}-${w.stage}-${w.sheetId ?? w.weekOf}-${i}`} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-etyme-ink">{w.label}</span>
                    <Chip tone={chip.tone}>{chip.word}</Chip>
                  </div>
                  <div className="text-xs text-etyme-muted">paid by {w.payer}</div>
                  <p className="text-[13px] text-etyme-ink mt-1 leading-relaxed">{w.says}</p>
                  {waiting && w.sheetId && (
                    // The week's own page: ask the client's approver by
                    // email, or attach the approval the client already sent.
                    <a href={`/dashboard/weeks/${w.sheetId}`} className="text-[13px] text-etyme-action hover:underline mt-1 inline-block">
                      {w.stage === 'WAITING_FOR_CLIENT' ? 'Ask the client to approve by email' : 'Open this week'}
                    </a>
                  )}
                </div>
                <div className="shrink-0 sm:w-48 space-y-0.5 text-[13px] tabular-nums">
                  {waiting ? (
                    // Hours only. Nothing is owed on a week nobody has accepted.
                    <Line label="Hours sent">{w.hours ?? 0}</Line>
                  ) : w.parts && w.parts.length > 1 ? (
                    // A week paid on more than one pay day, as the payroll
                    // run paid it: each part with its days, hours, amount
                    // and its own date.
                    <>
                      {w.parts.map((pt) => (
                        <div key={pt.from} className="pb-1">
                          <Line label={pt.label}>{amount(pt.owedCents, w.currency)}</Line>
                          <Line
                            label={`${pt.hours} hours`}
                            tone={pt.stage === 'PAID' ? 'text-etyme-verified' : pt.overdue ? 'text-etyme-attention' : undefined}
                          >
                            {pt.stage === 'PAID'
                              ? `paid ${pt.paidOn ? dayLabel(pt.paidOn) : ''}`.trim()
                              : pt.dueOn ? `due ${dayLabel(pt.dueOn)}` : 'no pay date set'}
                          </Line>
                        </div>
                      ))}
                    </>
                  ) : w.stage === 'PAID' ? (
                    <>
                      <Line label="Paid">{amount(w.paidCents ?? 0, w.currency)}</Line>
                      <Line label="On">{w.paidOn ? dayLabel(w.paidOn) : 'not recorded'}</Line>
                    </>
                  ) : (
                    <>
                      {w.priced && <Line label="For the week">{amount(w.owedCents ?? 0, w.currency)}</Line>}
                      {(w.paidCents ?? 0) > 0 && <Line label="Paid">{amount(w.paidCents ?? 0, w.currency)}</Line>}
                      {w.priced && (
                        <Line label="Owed to you" tone="text-etyme-attention font-medium">
                          {amount(w.stillOwedCents ?? 0, w.currency)}
                        </Line>
                      )}
                      {w.priced && (
                        <Line label="Due" tone={w.overdue ? 'text-etyme-attention' : undefined}>
                          {w.dueOn ? dayLabel(w.dueOn) : 'no pay date set'}
                        </Line>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {paid.length > 0 && (
        <button onClick={() => setShowPaid(!showPaid)} className="mt-2 text-xs text-etyme-action hover:underline">
          {showPaid
            ? 'Hide the weeks paid in full'
            : `${paid.length} earlier week${paid.length === 1 ? ' is' : 's are'} paid in full. Show ${paid.length === 1 ? 'it' : 'them'}.`}
        </button>
      )}
    </section>
    )
  )
}

export default function MyWorkPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Quiet on a refresh after sending, so the form's own sentence about
  // what was sent stays on the screen instead of a loading line.
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
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
      <button onClick={() => load()} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
    </div>
  )
  if (!data) return null

  // No contract and no week yet — somebody who made their page, somebody
  // on a bench nobody has put forward, the owner of a one-person firm with
  // nothing booked. A page of zeros would be the wrong answer to a state
  // that is not a failure (sign-up walk, round two, items 35 and 38).
  if (data.empty) {
    // Somebody who made the page themselves (OWN_MAKING, party 8B) has no
    // firm listing them and no employer, so a firm can only find them by
    // reading their page. Said to them alone: to somebody on a bench it
    // is the firm that lists them, to an employee their employer, and to
    // the owner of a one-person firm her own company.
    const foundByPage = data.standing?.because === 'OWN_MAKING' && !data.empty.ownFirm
    return (
      <div className="max-w-2xl">
        <NothingYet says={data.empty.says} listedBy={data.empty.listedBy} ownFirm={data.empty.ownFirm} />
        {foundByPage && (
          <p className="text-[13px] text-etyme-muted mt-1">
            No firm lists you, so a firm finds you by reading your page.
          </p>
        )}
      </div>
    )
  }

  const s = data.summary
  const returned: { contractId: string; week: ReturnedWeek }[] = (data.filing ?? []).flatMap((f: Filing) =>
    (f.returned ?? []).map((week) => ({ contractId: f.contractId, week }))
  )
  const returnedIds = new Set(returned.map((r) => r.week.timesheetId))
  // A week sent back is corrected above, never re-sent unchanged from here.
  const open = data.timesheets.filter((t: Timesheet) => t.status === 'OPEN' && !returnedIds.has(t.id))

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <Lbl>You</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Your work</h1>
      </div>

      {/* A firm asked to market them and they have not answered: first. */}
      <AskedToMarket />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
        <div>
          <Lbl>Hours this month</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.hoursThisMonth}</div>
        </div>
        {/* Every week some firm on the chain has still to sign, and
            which firm each is with — the same state Your hours shows
            (`waitingCard`), so one week never reads two ways. */}
        <div>
          <Lbl>Waiting on approval</Lbl>
          <div className={`font-serif text-3xl mt-1 tabular-nums ${s.awaitingApproval > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {s.awaitingApproval}
          </div>
          {s.waiting?.value > 0 && <div className="text-xs text-etyme-muted">{s.waiting.note}</div>}
        </div>
        {/* What became of the weeks the client signed, in words that fit
            how they are paid: an employee is paid by payroll and nobody
            bills him, so his card never says a vendor bills his hours
            (`signedWeeksCard`). */}
        <div>
          <Lbl>{s.signed?.label ?? 'Approved, not billed'}</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.signed?.value ?? s.approvedNotBilled}</div>
          <div className="text-xs text-etyme-muted">{s.signed?.note ?? 'your vendor bills these'}</div>
        </div>
        <div>
          <Lbl>Ending within 60 days</Lbl>
          <div className={`font-serif text-3xl mt-1 tabular-nums ${s.endingSoon > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {s.endingSoon}
          </div>
        </div>
      </div>

      {/* Where their employer is moving them next — told, not asked, in
          the words the notice used, and the city change said outright. */}
      {(data.moves?.length ?? 0) > 0 && (
        <section className="mb-8" aria-labelledby="your-next-project">
          <h2 id="your-next-project" className="font-serif text-lg text-etyme-ink mb-3">Your next project</h2>
          <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
            {data.moves.map((m: { kind: string; title: string; body: string; cityChange: boolean }, i: number) => (
              <div key={i} className="p-4">
                <div className="text-etyme-ink">{m.title}</div>
                <p className="text-sm text-etyme-muted mt-1">{m.body}</p>
                {m.cityChange && <span className="chip chip--attention text-[10px] mt-2 inline-block">New city</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Somebody is waiting on them to answer. Nothing else on this
          page expires. */}
      <YourInterviews />

      <YourPapers />

      {/* Weeks sent back to them, first: somebody is waiting on the correction. */}
      {returned.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-etyme-ink mb-1">Sent back to you</h2>
          <p className="text-xs text-etyme-muted mb-3">
            Correct the hours and send the week again. It replaces the week that came back.
          </p>
          <div className="bg-etyme-surface border border-etyme-attention/30 rounded-lg divide-y divide-etyme-rule">
            {returned.map(({ contractId, week }) => (
              <SentBack key={week.timesheetId} contractId={contractId} week={week} onSent={() => load(true)} />
            ))}
          </div>
        </section>
      )}

      {/* Their own week. The one thing on this page that only they may do. */}
      {(data.filing?.length ?? 0) > 0 && (
        <FileYourWeek filing={data.filing} onSent={() => load(true)} />
      )}

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
                {/* One placement, the whole chain in order — the site,
                    every firm between, and whoever pays them. The worker
                    knows the complete chain (decided 2026-09-28); the
                    page listed each rung as a placement of its own. */}
                <div className="text-etyme-ink">{p.chain}</div>
                <div className="text-xs text-etyme-muted">
                  {p.location && `${p.location} · `}
                  {p.span}
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

      {data.owed && <YourPay owed={data.owed} />}

      <section className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Your hours</h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.timesheets.slice(0, 8).map((t: Timesheet) => (
            <div key={t.id} className="p-3 px-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-etyme-ink">{t.period}</div>
                {/* Who approved it, where the client approved by email —
                    never that the client signed in Etyme. */}
                {t.approvedBy && <div className="text-xs text-etyme-muted">{t.approvedBy}</div>}
                {t.door && (
                  <a href={t.door.href} className="text-xs text-etyme-action hover:underline">{t.door.says}</a>
                )}
              </div>
              <div className="text-sm text-etyme-muted tabular-nums w-16 text-right">{t.hours}h</div>
              <div className="w-32 text-right">
                {/* Its one state (`weekState`): "waiting on Computer
                    Systems Inc", "owed to you", "paid". */}
                <Chip tone={t.state?.tone ?? 'passive'}>
                  {t.state?.word ?? (t.billed ? 'billed' : t.status.toLowerCase())}
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
                  {s.by} sent these to {s.to} · until {s.until}
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
