'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { inSentence } from '@/lib/document-stages'
import { readJson } from '@/lib/read-response'
import { saveForm } from '@/lib/form-save'
import { refusalSentence } from '@/lib/refusal-words'
import { useSession } from '@/components/session-provider'
import { DetailHead } from '@/components/ui/detail-head'
import { LoadingState, RefusedState } from '@/components/ui/states'
import { isDeskless } from '@/lib/nav-table'
import { plainDate, daySpan } from '@/lib/plain-date'
import { CoverChip, SubVendorCover } from '@/components/cover-standing'
import { dayOfMomentFor, readerZone } from '@/lib/when'

/**
 * One placement, top to bottom.
 *
 * The screen the demo did not have. There were sixty lists and four
 * things you could open, so a vendor could be shown sets of records and
 * could not follow one person through their working life — where they
 * came from, who sent them on, who met them, what was agreed on both
 * sides, whether they are cleared, whether they filed, whether we were
 * paid, and what we made.
 *
 * Every one of those facts already existed. None was reachable from the
 * others, and a product whose parts do not connect reads as a database
 * with a menu.
 *
 * ── Why it is shaped as a thread ─────────────────────────────────────
 *
 * CLAUDE.md distinguishes decision surfaces from working surfaces. A
 * list of two hundred timesheets is a working surface: dense, sortable,
 * fast. One placement is the other kind — three to ten things, read in
 * order, with prose and space. So this is a single column of stations in
 * the order they actually happen, and the eye can run down it.
 *
 * The station that matters most is the chain, because it is the one no
 * applicant tracking system can draw: a person reaching a client through
 * two firms, one week of hours, and a margin at each hop that neither
 * hop can see.
 */

/**
 * A line, and the document it is a line of.
 *
 * Every string here is written by `lib/order-naming` on the server, so
 * the client, the supplier and a bystander cannot be shown three
 * different words by three different screens. `order` is null where the
 * line is not on one yet — which is every row written before the award
 * began raising a header, and every W2 buy line, which never has one.
 */
interface LineDoc {
  onOrder: boolean
  Noun: string | null
  reference: string | null
  heading: string
  name: string
  does: string
  says: string
  order: {
    id: string; number: string; reference: string; status: string
    startDate: string; endDate: string | null
    ceiling: number | null; currency: string
    drawn: number | null; remaining: number | null
    consumedPercent: number | null; overdrawn: boolean
    says: string | null
  } | null
}

interface Placement {
  id: string
  person: { id: string; name: string; skills: string[]; location: string | null; workAuth: string | null }
  // `nameWithheld` where this reader is below the rung it pays: the name
  // is a sentence naming the firm they can actually call.
  supplier: { id: string; name: string; phrase?: string; nameWithheld?: boolean; suppliedThrough?: string | null }
  client: { id: string; name: string }
  endClient: { id: string; name: string } | null
  hiringManager: { id: string; name: string } | null
  state: string
  startDate: string | null
  endDate: string | null
  paymentTerms: number | null
  currency: string
  // Which side of the trade this reader sits on. The buy-side fields
  // below arrive empty for anybody but the supplier — they are gated in
  // the route, not here, because a screen that filters is a screen
  // somebody reads around with the network tab open.
  viewer: {
    side: 'SUPPLIER' | 'PAYER' | 'END_CLIENT' | null
    isSupplier: boolean; seeBill: boolean; seePay: boolean; seeMargin: boolean
  }
  origin: {
    id: string; title: string; skills: string[]; location: string | null
    raisedBy: { id: string; name: string }; neededBy: string | null; approvalState: string
  } | null
  invitation: { status: string; payMin: number | null; payMax: number | null; message: string | null } | null
  submission: {
    id: string; status: string; rate: number | null
    submittedAt: string | null; forwardedAt: string | null
    from: { id: string; name: string; phrase?: string }; to: { id: string; name: string } | null
    checkState: string
    sentOnBy: { company: { id: string; name: string }; at: string | null; rate: number | null } | null
  } | null
  interviews: Array<{
    id: string; round: number; stage: string; mode: string; state: string
    scheduledAt: string | null; decidedAt: string | null; feedback: string | null
  }>
  contracts: {
    // A purchase order is a header and its lines. `document` is the
    // header as this reader names it — purchase order to the client,
    // sales order to the supplier — and `lines` is everybody on it.
    sell: {
      // The rate in force today, and — where an approved change put it
      // there — "$70/hr since July 29, 2026 — was $66" (lib/placement-rate).
      id: string; billRate: number | null; billRateSays: string | null; state: string
      workOrder: { number: string; amount: number | null; currency: string } | null
      document: LineDoc
    }
    buy: {
      id: string; contractType: string; state: string
      vendor: { id: string; name: string } | null; payRate: number | null; payRateSays: string | null
      document: LineDoc | null
      // Null where this reader may not read the pay rate.
      overtime: OvertimeOnLine | null
      // Null where this reader may not read the pay rate.
      cutOvertime: CutOvertimeOnLine | null
    } | null
    lines: Array<{
      id: string; position: number; person: string; isThisOne: boolean
      site: string; state: string; startDate: string; endDate: string | null
      billed: number | null
    }>
    pair: string | null
    masterContract: { tag: { code: string; name: string } | null; says: string } | null
  }
  // `weEmployThem` is null where the reader is not the supplier: the
  // answer lives on the buy contract, which nobody else is sent.
  chain: { hopsBelow: number; weEmployThem: boolean | null }
  compliance: {
    person: Array<{ type: string; status: string; provider: string | null; expiresAt: string | null }>
    // The firm below us, where there is one. `standing` is computed for
    // today and `says` is the sentence that goes with it; the stored
    // `status` is kept because it is a fact about the record, and is not
    // what the screen reads.
    supplierCover: Array<{
      type: string; status: string
      validFrom: string | null; expiresAt: string | null
      standing: string | null; says: string | null
    }>
    subVendorCover: { vendor: string; outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix: string | null } | null
  }
  timesheets: Array<{
    id: string; periodStart: string; periodEnd: string; hours: number; status: string
    clientApproved: { hours: number; at: string } | null
    employerAccepted: { hours: number; at: string } | null
    billedByUs: boolean
  }>
  money: {
    hoursAccepted: number
    invoices: Array<{ id: string; number: string; status: string; hours: number; weeks: number; amount: number | null; total: number; paid: number; dueAt: string }>
    billed: number | null; collected: number | null
    revenue: number | null; cost: number | null; margin: number | null
    // The employer's burden on the cost, and the two together — what the
    // earned margin subtracts. Read from money's margin service.
    burden: number | null; fullCost: number | null; burdenSays: string | null
    // "Earned margin", from the service, so the word cannot drift.
    marginLabel: string | null
    // The agreed spread: the two rates' difference per hour, never money.
    agreed: { label: string; perHour: number | null; pct: number | null; says: string } | null
    // Why the margin reads as it does: blank and why, or over which weeks.
    marginSays: string | null
    // Where the pay rate changed inside the hours priced, in a sentence.
    payRateChangeSays: string | null
    // How overtime was paid in the weeks priced, and why cost is blank where it is.
    overtimeSays: string | null
    costSays: string | null
    hoursBilled: number; hoursPaid: number
    // Why there is nothing here, where there is nothing here.
    says: string | null
  }
  timeline: {
    hours: Due[]; pay: Due[]; bill: Due[]
    next: Due | null
  }
  /** The start, said truthfully: "started …" only of a running contract (startWords). */
  startSays: string | null
  /** Where this line runs past the person's time limit; null where it does not. */
  runsPast: string | null
  checklist: {
    outcome: 'PASS' | 'WARN' | 'BLOCK'
    says: string
    fix: string | null
    items: Array<{ key: string; label: string; required: boolean; state: string; note: string; blocks: boolean }>
    cover: 'PASS' | 'WARN' | 'BLOCK'
  }
}

type Due = { kind: string; label: string; dueOn: string; done: boolean; overdue: boolean }

const rate = (n: number | null) => (n == null ? '—' : `$${n.toFixed(0)}/hr`)
const cash = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
/**
 * A calendar day — a start, a due date, a last day — is stored as
 * midnight UTC and read in UTC, so a reader in California sees the day
 * the contract says rather than the evening before. lib/plain-date is
 * the one formatter for that, the same one the worker's pages use.
 */
const day = (iso: string | null) => plainDate(iso) ?? '—'
/**
 * A moment — when something was sent, when an interview is — is read
 * in the reader's own zone, because nine at night in Portland is the
 * day it happened there.
 */
const moment = (iso: string | null) =>
  iso ? dayOfMomentFor(new Date(iso), readerZone()) : '—'

/** A word for a state, in the tone it deserves. */
function tone(status: string): string {
  const s = status.toUpperCase()
  if (['CLEAR', 'APPROVED', 'IN_PROGRESS', 'PLACED', 'ACCEPTED', 'PAID', 'DONE'].includes(s)) return 'chip--verified'
  if (['FLAGGED', 'FAILED', 'EXPIRED', 'REJECTED', 'BLOCKED', 'OVERDUE'].includes(s)) return 'chip--danger'
  if (['PENDING', 'IN_REVIEW', 'SUBMITTED', 'DRAFT', 'SENT', 'PROPOSED'].includes(s)) return 'chip--attention'
  return 'chip--passive'
}

const words = (s: string) => s.replace(/_/g, ' ').toLowerCase()

/**
 * One document, and this line on it.
 *
 * A purchase order is a header and its lines (CLAUDE.md, 2026-09-18).
 * The placement is one line; this is the paper it hangs on, what it
 * authorizes, how much of that has been drawn, and who else is on it.
 *
 * Every word comes off the server, because what this paper is called
 * depends on which end of it the reader stands at — a purchase order to
 * the client who raised it, a sales order to the supplier billing
 * against it — and three screens deciding that separately is three
 * screens that will disagree.
 *
 * A line with no header says so in a sentence rather than showing a
 * blank. That is the ordinary case today, not an error: every row
 * written before the award began raising a header has none, and a buy
 * line to our own employee never will.
 */
function Document({
  doc, lines,
}: { doc: LineDoc; lines: Placement['contracts']['lines'] }) {
  if (!doc.onOrder || !doc.order) {
    return (
      <div className="card">
        <div className="lbl mb-1">{doc.heading}</div>
        <p className="text-[13px] leading-relaxed text-etyme-muted">{doc.says}</p>
      </div>
    )
  }
  const o = doc.order
  const others = lines.filter((l) => !l.isThisOne).length
  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="lbl">{doc.heading}</div>
        <span className={`chip ${tone(o.status)}`}>{words(o.status)}</span>
      </div>
      <p className="mt-1 text-[13px] text-etyme-muted">
        {doc.name} · {doc.does}
      </p>
      {o.ceiling != null ? (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] tabular-nums text-etyme-muted">
          <span>
            Authorized <span className="text-etyme-ink">{cash(o.ceiling)}</span>
          </span>
          <span>
            Billed against it <span className="text-etyme-ink">{cash(o.drawn)}</span>
          </span>
          <span className={o.overdrawn ? 'text-etyme-attention' : undefined}>
            Left <span className={o.overdrawn ? '' : 'text-etyme-ink'}>{cash(o.remaining)}</span>
          </span>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-etyme-faint">
          What this document authorizes is money, and this desk does not read money.
        </p>
      )}
      {o.says && o.ceiling != null && (
        <p className="mt-1 text-[12px] text-etyme-faint">{o.says}</p>
      )}
      {lines.length > 0 && (
        <ul className="mt-3 divide-y divide-etyme-rule border-t border-etyme-rule">
          {lines.map((l) => (
            <li
              key={l.id}
              className={`flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-[13px] ${
                l.isThisOne ? 'text-etyme-ink' : 'text-etyme-muted'
              }`}
            >
              <span>
                <span className="tabular-nums text-etyme-faint">{l.position}</span>{' '}
                {l.person} — {l.site}
                {l.isThisOne && <span className="ml-2 chip chip--action">this line</span>}
              </span>
              <span className="tabular-nums">
                {words(l.state)}
                {l.billed != null && <span className="ml-3 text-etyme-ink">{cash(l.billed)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {others > 0 && (
        <p className="mt-2 text-[12px] text-etyme-faint">
          One document, {lines.length} lines. {others === 1 ? 'The other line is' : `The other ${others} lines are`} billed
          against the same ceiling.
        </p>
      )}
    </div>
  )
}

/** One station on the thread. */
function Station({
  n, title, subtitle, children,
}: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="relative pl-10 pb-8">
      {/* The thread itself. It is the whole point of the screen, so it is
          drawn rather than implied by spacing. */}
      <div className="absolute left-[11px] top-7 bottom-0 w-px bg-etyme-rule" aria-hidden="true" />
      <div
        className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full
                   border border-etyme-rule bg-etyme-raised text-[11px] tabular-nums text-etyme-muted"
        aria-hidden="true"
      >
        {n}
      </div>
      <h2 className="headline-serif text-[17px] text-etyme-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** How overtime is priced on our pay line, as `lib/overtime-method-choice` says it. */
interface OvertimeOnLine {
  method: string
  chosen: boolean
  says: string
  chosenBy: string | null
  chosenAt: string | null
  reason: string | null
  mayChange: boolean
}

const OVERTIME_CHOICES: Array<{ value: string; label: string }> = [
  { value: 'US_REGULAR_RATE', label: "The US regular rate (the law's default)" },
  { value: 'RATE_ON_THE_DAY', label: 'The rate in force on each overtime day' },
  { value: 'HIGHER_RATE', label: 'The higher of the rates worked that week' },
]

/**
 * One sentence about how overtime is paid on our pay line, and — for the
 * desk that may change it — a small form. The route refuses what the
 * form does not; the form only saves a trip.
 */
function OvertimeMethod({ placementId, overtime, person }: { placementId: string; overtime: OvertimeOnLine; person: string }) {
  const [now, setNow] = useState(overtime)
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState(overtime.method)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsReason = method !== 'US_REGULAR_RATE'

  async function save() {
    // A refusal is shown under the form in the route's words and Save
    // comes back; `readJson` throws on it, so nothing after the call may
    // be what resets the form (lib/form-save).
    const body = await saveForm({
      send: () => fetch(`/api/placements/${placementId}/overtime-method`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, reason }),
      }),
      setBusy, setError,
      fallback: 'The overtime method could not be saved.',
    })
    if (!body) return
    setNow({ ...body.data, mayChange: now.mayChange })
    setReason('')
    setOpen(false)
  }

  return (
    <div className="mt-3 text-[13px] leading-relaxed text-etyme-muted">
      <p>
        {now.says}
        {now.reason && <span className="text-etyme-ink"> Why: {now.reason}</span>}
      </p>
      {/* On its own line under the sentence: at the end of a wrapped
          sentence it read as the sentence's last word. */}
      {now.mayChange && !open && (
        <button type="button" className="mt-1 block text-etyme-action hover:underline" onClick={() => setOpen(true)}>
          Change
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <label className="lbl block" htmlFor="ot-method">How {person}&rsquo;s overtime is paid in a week paid at two rates</label>
          <select
            id="ot-method"
            className="block w-full min-w-0 max-w-full truncate px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {OVERTIME_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            aria-label="Why"
            placeholder={needsReason ? 'Why (required): what was agreed with the worker' : 'Why (optional)'}
            className="w-full px-3 py-2 text-[13px] text-etyme-ink border border-etyme-rule rounded-lg focus:ring-1 focus:ring-etyme-action focus:border-etyme-action outline-none resize-none"
          />
          {needsReason && (
            <p className="text-[12px]">
              A worker the law entitles to overtime is never paid less than the regular-rate premium, whatever is chosen.
            </p>
          )}
          {error && <p className="text-[12px] text-etyme-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-[13px] disabled:opacity-50" disabled={busy} onClick={save}>
              Save
            </button>
            <button type="button" className="btn-secondary text-[13px]" onClick={() => { setOpen(false); setError(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** How overtime is paid on a cut week, as `lib/cut-overtime-choice` says it. */
interface CutOvertimeOnLine {
  rule: string
  chosen: boolean
  says: string
  chosenBy: string | null
  chosenAt: string | null
  reason: string | null
  mayChange: boolean
}

const CUT_CHOICES: Array<{ value: string; label: string }> = [
  { value: 'ABOVE_THE_LINE', label: 'Only accepted hours over 40 (default, what the law requires)' },
  { value: 'KEEP_WEEK_OVERTIME', label: "Keep the week's overtime (ordinary hours cut first)" },
]

/**
 * One sentence about how overtime is paid when fewer hours are accepted
 * than were worked, and — for the desk that may change it — a small form.
 * The route refuses what the form does not.
 */
function CutOvertime({ placementId, cut, person }: { placementId: string; cut: CutOvertimeOnLine; person: string }) {
  const [now, setNow] = useState(cut)
  const [open, setOpen] = useState(false)
  const [rule, setRule] = useState(cut.rule)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsReason = rule !== 'ABOVE_THE_LINE'

  async function save() {
    const body = await saveForm({
      send: () => fetch(`/api/placements/${placementId}/cut-overtime`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule, reason }),
      }),
      setBusy, setError,
      fallback: 'The choice could not be saved.',
    })
    if (!body) return
    setNow({ ...body.data, mayChange: now.mayChange })
    setReason('')
    setOpen(false)
  }

  return (
    <div className="mt-3 text-[13px] leading-relaxed text-etyme-muted">
      <p>
        {now.says}
        {now.reason && <span className="text-etyme-ink"> Why: {now.reason}</span>}
      </p>
      {/* On its own line under the sentence: at the end of a wrapped
          sentence it read as the sentence's last word. */}
      {now.mayChange && !open && (
        <button type="button" className="mt-1 block text-etyme-action hover:underline" onClick={() => setOpen(true)}>
          Change
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <label className="lbl block" htmlFor="cut-overtime">Overtime when fewer hours are accepted</label>
          <select
            id="cut-overtime"
            className="block w-full min-w-0 max-w-full truncate px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          >
            {CUT_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            aria-label="Why"
            placeholder={needsReason ? `Why (required): what was agreed with ${person}` : 'Why (optional)'}
            className="w-full px-3 py-2 text-[13px] text-etyme-ink border border-etyme-rule rounded-lg focus:ring-1 focus:ring-etyme-action focus:border-etyme-action outline-none resize-none"
          />
          {error && <p className="text-[12px] text-etyme-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-[13px] disabled:opacity-50" disabled={busy} onClick={save}>
              Save
            </button>
            <button type="button" className="btn-secondary text-[13px]" onClick={() => { setOpen(false); setError(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="mt-1 text-[14px] tabular-nums text-etyme-ink">{value}</div>
    </div>
  )
}

export default function PlacementPage() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const session = useSession()
  const [p, setP] = useState<Placement | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A detail page is headed by the section its list sits under on the
  // reader's own menu, never by a company's name (sign-up walk, round
  // six, problem 6). A seat with no desk reaches its placement from Your
  // work, so that is its parent; everybody else's is Contracts.
  const parent = isDeskless(session.permissions) && session.isWorker
    ? ({ href: '/dashboard/my-work', label: 'Your work' } as const)
    : ({ href: '/dashboard/contracts', label: 'Contracts' } as const)

  useEffect(() => {
    let live = true
    ;(async () => {
      // readJson throws the route's own sentence on a refusal, so the
      // refusal is read in the catch; reading it after the await was a
      // line that never ran.
      try {
        const body = await readJson(await fetch(`/api/placements/${id}`))
        if (live) setP(body.data)
      } catch (e: any) {
        if (!live) return
        setError(refusalSentence(e?.message || 'That placement could not be opened.', {
          kind: session.company?.kind, company: session.company?.name,
        }))
      }
    })()
    return () => { live = false }
  }, [id, session.company?.kind, session.company?.name])

  // A refusal is the page: its sentence alone (round six, problem 12).
  if (error) return <RefusedState says={error} />

  if (!p) return <LoadingState says="Opening the placement…" />

  const where = p.endClient ?? p.client
  const chainLine = p.chain.weEmployThem
    ? `${p.supplier.name} employs ${p.person.name.split(' ')[0]} directly.`
    : `${p.person.name.split(' ')[0]} reaches ${where.name} through ${p.chain.hopsBelow + 1} firm${p.chain.hopsBelow ? 's' : ''}.`

  return (
    <div className="animate-fade-in max-w-3xl">
      {/* ── Who, where, and how it stands ── */}
      <DetailHead
        from={parent.href}
        back={parent}
        title={p.person.name}
        subtitle={
          <>
            {p.origin?.title ?? 'Placement'} at {where.name}
            {p.person.location ? ` · ${p.person.location}` : ''}
            {p.startSays ? ` · ${p.startSays}` : ''}
          </>
        }
        meta={
          <>
            <span className={`chip ${tone(p.state)}`}>{words(p.state)}</span>
            {p.person.skills.slice(0, 4).map((s) => (
              <span key={s} className="chip chip--passive">{s}</span>
            ))}
          </>
        }
      >
        {/* A line booked past the person's time limit, said once and
            with what to do (runsPastSentence in lib/tenure-days). */}
        {p.runsPast && (
          <p className="mt-2 text-[13px] leading-relaxed text-etyme-attention">{p.runsPast}</p>
        )}
      </DetailHead>

      <div className="panel mb-8 !py-5">
        {/* What a client is shown, and what it is not.
            A buyer sees the rate it pays and the hours it approved. What
            the supplier pays underneath, and what it keeps, is the
            supplier's business — showing a buyer an empty "Paying" column
            invites exactly the question the column cannot answer. */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* A client reading a leg its own supplier arranged does not
              pay it, and "You pay —" invites the one question the
              column cannot answer. */}
          {p.viewer.side === 'END_CLIENT' ? (
            <Fact label="Arranged by your supplier" value={<span className="text-etyme-faint">not your rate</span>} />
          ) : (
            <Fact label={p.viewer.isSupplier ? 'Billing' : 'You pay'} value={rate(p.contracts.sell.billRate)} />
          )}
          {p.viewer.isSupplier && <Fact label="Paying" value={rate(p.contracts.buy?.payRate ?? null)} />}
          <Fact label="Hours accepted" value={p.money.hoursAccepted || '—'} />
          {/* The header shows two rates, so the figure beside them is
              their difference per hour — the agreed spread. What the
              hours actually earned is the earned margin, under The money. */}
          {p.viewer.isSupplier && p.money.agreed && (
            <Fact
              label={p.money.agreed.label}
              value={
                p.money.agreed.perHour == null
                  ? <span className="text-etyme-faint">not set</span>
                  : `${rate(p.money.agreed.perHour)}${p.money.agreed.pct == null ? '' : ` · ${p.money.agreed.pct.toFixed(1)}%`}`
              }
            />
          )}
        </div>
      </div>

      {/* ── The thread ── */}
      <Station
        n={1}
        title="Where the work came from"
        subtitle={
          p.origin
            ? `${p.origin.raisedBy.name} needed somebody${p.origin.neededBy ? ` by ${day(p.origin.neededBy)}` : ''}.`
            : 'No requirement is recorded against this placement.'
        }
      >
        {p.origin && (
          <div className="card">
            <Link href={`/dashboard/requirements/${p.origin.id}`} className="text-[14px] text-etyme-action hover:underline">
              {p.origin.title}
            </Link>
            {p.invitation && (
              <p className="mt-2 text-[13px] text-etyme-muted">
                You were invited at{' '}
                <span className="tabular-nums text-etyme-ink">
                  {p.invitation.payMin != null && p.invitation.payMax != null
                    ? `$${p.invitation.payMin}–$${p.invitation.payMax}/hr`
                    : 'no stated band'}
                </span>
                . Nobody else can see the band you were given.
              </p>
            )}
          </div>
        )}
      </Station>

      <Station
        n={2}
        title="How they reached you"
        subtitle={
          p.submission?.sentOnBy
            ? `${p.submission.sentOnBy.company.name} put them forward to you on ${moment(p.submission.sentOnBy.at)}.`
            : p.submission
              ? `Submitted by ${p.submission.from.phrase ?? p.submission.from.name}${p.submission.to ? ` to ${p.submission.to.name}` : ''}.`
              : 'This placement has no submission behind it.'
        }
      >
        {p.submission && (
          <div className="card flex flex-wrap items-center gap-x-8 gap-y-3">
            <Fact label="Submitted" value={moment(p.submission.submittedAt)} />
            <Fact label="At" value={rate(p.submission.rate)} />
            {p.submission.sentOnBy && <Fact label="Their price" value={rate(p.submission.sentOnBy.rate)} />}
            <div>
              <div className="lbl">Package</div>
              <span className={`chip ${tone(p.submission.checkState)} mt-1`}>{words(p.submission.checkState)}</span>
            </div>
          </div>
        )}
      </Station>

      <Station
        n={3}
        title="Who met them"
        subtitle={
          p.interviews.length
            ? `${p.interviews.length} round${p.interviews.length === 1 ? '' : 's'}, in order.`
            : 'Nobody has interviewed them for this job.'
        }
      >
        {p.interviews.length > 0 && (
          <ol className="space-y-2">
            {p.interviews.map((i) => (
              <li key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[14px] text-etyme-ink">
                    Round {i.round} · {words(i.stage)}
                  </span>
                  {/* The separator is a character rather than a margin.
                      Spacing that exists only in CSS reads back as
                      "screenphone" to anything that flattens the markup —
                      a screen reader, a copy-paste, a search index. And
                      an onsite interview held onsite says it once. */}
                  {words(i.mode) !== words(i.stage) && (
                    <span className="text-[13px] text-etyme-muted"> · {words(i.mode)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] tabular-nums text-etyme-muted">{moment(i.scheduledAt)}</span>
                  <span className={`chip ${tone(i.state)}`}>{words(i.state)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Station>

      <Station n={4} title="What was agreed, on both sides" subtitle={chainLine}>
        {/* The document first, then the two rates on it.
            A purchase order is a header and its lines: this placement is
            one line, and showing the rate without the paper it hangs on
            is how a line comes to read as a document of its own. */}
        <Document doc={p.contracts.sell.document} lines={p.contracts.lines} />

        {/* min-w-0 on each card: a grid item is as wide as its widest
            child by default, so a long option in a select pushed the pay
            line past its column. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="card min-w-0">
            <div className="lbl mb-2">
              {p.viewer.isSupplier
                ? `You sell to ${p.client.name}`
                : p.viewer.side === 'END_CLIENT'
                  ? `Sold to ${p.client.name}, not to you`
                  : `${p.supplier.name} sells to you`}
            </div>
            <div className="stat-value">{rate(p.contracts.sell.billRate)}</div>
            {p.contracts.sell.billRateSays && (
              <p className="mt-1 text-[13px] tabular-nums text-etyme-muted">{p.contracts.sell.billRateSays}</p>
            )}
            <p className="mt-2 text-[13px] text-etyme-muted">
              {p.paymentTerms ? `Net ${p.paymentTerms}` : 'Terms not set'}
              {' · '}
              {p.contracts.sell.document.does}
            </p>
          </div>
          {/* The buy side belongs to the supplier and is shown only to
              them. A client reading "You employ them" about somebody
              another firm employs is worse than a gap. */}
          {p.viewer.isSupplier && (
          <div className="card min-w-0">
            <div className="lbl mb-2">
              {p.contracts.buy?.vendor ? `You buy from ${p.contracts.buy.vendor.name}` : 'You employ them'}
            </div>
            <div className="stat-value">{rate(p.contracts.buy?.payRate ?? null)}</div>
            {p.contracts.buy?.payRateSays && (
              <p className="mt-1 text-[13px] tabular-nums text-etyme-muted">{p.contracts.buy.payRateSays}</p>
            )}
            <p className="mt-2 text-[13px] text-etyme-muted">
              {p.contracts.buy
                ? p.contracts.buy.document
                  ? `${p.contracts.buy.contractType} · ${
                      p.contracts.buy.document.order
                        ? p.contracts.buy.document.does
                        : p.contracts.buy.document.says
                    }`
                  : `${p.contracts.buy.contractType} · this side has no paper yet.`
                : 'Nothing is bought against this line yet, so this placement has a price and no cost.'}
            </p>
            {p.contracts.buy?.overtime && (
              <OvertimeMethod placementId={p.id} overtime={p.contracts.buy.overtime} person={p.person.name} />
            )}
            {p.contracts.buy?.cutOvertime && (
              <CutOvertime placementId={p.id} cut={p.contracts.buy.cutOvertime} person={p.person.name} />
            )}
          </div>
          )}
        </div>

        {/* Our own order to the firm below us, where we raised one —
            the same shape as the client's, read from the other end. */}
        {p.viewer.isSupplier && p.contracts.buy?.document?.order && (
          <div className="mt-3">
            <Document doc={p.contracts.buy.document} lines={[]} />
          </div>
        )}

        {(p.contracts.pair || p.contracts.masterContract) && (
          <p className="mt-3 text-[13px] leading-relaxed text-etyme-muted">
            {p.contracts.pair}
            {p.contracts.pair && p.contracts.masterContract ? ' ' : ''}
            {p.contracts.masterContract?.says}
          </p>
        )}
      </Station>

      <Station
        n={5}
        title="Cleared to work"
        subtitle="Work authorization stops a placement. The rest are worth chasing."
      >
        {/* The verdict first, in one sentence, then the pieces. This
            station used to list only what was on file, so a person with
            nothing on file showed a blank — which read as "nothing to do"
            when it meant "everything to do". What is missing is the
            point of a checklist. */}
        <p className={`mb-3 text-[13px] leading-relaxed ${
          p.checklist.outcome === 'BLOCK' ? 'text-etyme-attention' : 'text-etyme-muted'
        }`}>
          {p.checklist.says}
          {p.checklist.fix && <span className="text-etyme-ink"> {p.checklist.fix}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {p.checklist.items.map((it) => (
            <span
              key={it.key}
              className={`chip ${
                it.state === 'ALREADY_HELD' ? 'chip--verified'
                : it.blocks ? 'chip--danger'
                : it.state === 'EXPIRING' ? 'chip--attention'
                : it.required ? 'chip--attention'
                : 'chip--passive'
              }`}
              title={it.note}
            >
              {inSentence(it.label)} · {it.state === 'ALREADY_HELD' ? 'on file' : words(it.state)}
            </span>
          ))}
          {/* The sub-vendor's certificates, in the words the compliance
              page uses for the same rows. Shown to the supplier only:
              the firm below us is the buy side, which Station 4 already
              keeps off a client's screen, and a client reading a verdict
              about a firm it has no contract with is worse than a gap. */}
          {p.viewer.isSupplier &&
            p.compliance.supplierCover.map((v, i) => <CoverChip key={`${v.type}-${i}`} cover={v} />)}
        </div>
        {/* Whether the firm below us could put anybody forward today.
            Computed by the same gate the submission door calls, so this
            screen cannot read green on cover that refuses a submission an
            hour later. */}
        {p.viewer.isSupplier && <SubVendorCover cover={p.compliance.subVendorCover} />}
      </Station>

      <Station
        n={6}
        title="The hours"
        subtitle="Filed once by the person. Two signatures, from two different companies — the client says the work happened, the employer accepts what it will pay for."
      >
        {p.timesheets.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">No weeks filed yet.</p>
        ) : (
          <div className="overflow-scroll-x">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-etyme-rule text-left">
                  <th className="lbl pb-2">Week</th>
                  <th className="lbl pb-2 text-right">Hours</th>
                  <th className="lbl pb-2">Client</th>
                  <th className="lbl pb-2">Employer</th>
                  <th className="lbl pb-2">Billed</th>
                </tr>
              </thead>
              <tbody>
                {p.timesheets.map((t) => (
                  <tr key={t.id} className="border-b border-etyme-rule/60">
                    <td className="py-2 tabular-nums text-etyme-ink">{daySpan(t.periodStart, t.periodEnd)}</td>
                    <td className="py-2 text-right tabular-nums text-etyme-ink">{t.hours}</td>
                    <td className="py-2 text-etyme-muted">
                      {t.clientApproved ? `${t.clientApproved.hours} approved` : 'not yet'}
                    </td>
                    <td className="py-2 text-etyme-muted">
                      {t.employerAccepted ? `${t.employerAccepted.hours} accepted` : 'not yet'}
                    </td>
                    <td className="py-2">
                      <span className={`chip ${t.billedByUs ? 'chip--verified' : 'chip--passive'}`}>
                        {t.billedByUs ? 'billed' : 'not billed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Station>

      <Station
        n={7}
        title="The money"
        subtitle={
          !p.viewer.isSupplier
            ? 'What this placement has been invoiced at, and what has been settled.'
            : p.money.margin == null
              ? (p.money.marginSays ?? 'The earned margin stays blank until somebody sets a cost. A number here that nobody agreed would look like good news.')
              : 'What this placement brought in, what it cost, and what is left.'
        }
      >
        <div className="card mb-3 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Two different numbers, and the label has to match the one
              shown. Revenue is what the hours are worth; billed is what
              has actually gone out on an invoice. A buyer reading
              "invoiced to you" beside the accrued figure is being told
              they owe more than anybody has asked them for. */}
          <Fact
            label={p.viewer.isSupplier ? 'Revenue' : 'Invoiced to you'}
            value={cash(p.viewer.isSupplier ? p.money.revenue : p.money.billed)}
          />
          {/* Cost as the earned margin counts it — pay, overtime premium
              and the employer's burden — so revenue less cost is the
              figure beside it. */}
          {p.viewer.isSupplier && <Fact label="Cost" value={cash(p.money.fullCost)} />}
          {p.viewer.isSupplier && <Fact label={p.money.marginLabel ?? 'Earned margin'} value={cash(p.money.margin)} />}
          <Fact label={p.viewer.isSupplier ? 'Collected' : 'Paid'} value={cash(p.money.collected)} />
        </div>
        {p.viewer.isSupplier && p.money.margin != null && p.money.marginSays && (
          <p className="mb-3 text-[13px] text-etyme-muted">{p.money.marginSays}</p>
        )}
        {p.viewer.isSupplier && p.money.burden != null && p.money.burden > 0 && (
          <p className="mb-3 text-[13px] text-etyme-muted">
            Cost includes {cash(p.money.burden)} employer burden on {cash(p.money.cost)} of pay.
            {p.money.burdenSays ? ` ${p.money.burdenSays}` : ''}
          </p>
        )}
        {p.viewer.isSupplier && p.money.payRateChangeSays && (
          <p className="mb-3 text-[13px] text-etyme-muted">{p.money.payRateChangeSays}</p>
        )}
        {p.viewer.isSupplier && p.money.overtimeSays && (
          <p className="mb-3 text-[13px] text-etyme-muted">{p.money.overtimeSays}</p>
        )}
        {p.viewer.isSupplier && p.money.cost == null && p.money.costSays && (
          <p className="mb-3 text-[13px] text-etyme-muted">{p.money.costSays}</p>
        )}

        {p.money.says ? (
          <p className="text-[13px] text-etyme-muted">{p.money.says}</p>
        ) : p.money.invoices.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">
            {/* The party who issues the document names it: the supplier bills,
                the client receives its invoice. */}
            {p.viewer.isSupplier ? 'Nothing billed against this placement yet.' : 'No invoice against this placement yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {p.money.invoices.map((inv) => (
              <li key={inv.id} className="card flex flex-wrap items-center justify-between gap-3">
                <Link href={`/dashboard/invoices/${inv.id}`} className="text-[14px] text-etyme-action hover:underline">
                  {inv.number}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-[13px] tabular-nums text-etyme-muted">
                    {inv.hours} hrs{inv.weeks > 1 ? ` · ${inv.weeks} weeks` : ''}
                  </span>
                  <span className="text-[14px] tabular-nums text-etyme-ink">{cash(inv.amount)}</span>
                  <span className="text-[13px] tabular-nums text-etyme-muted">due {day(inv.dueAt)}</span>
                  <span className={`chip ${tone(inv.status)}`}>{words(inv.status)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Station>

      {/* The contract's timeline. Not a separate screen: the 2017 version
          was a filterable grid of nineteen internal state names, and
          nobody filtering a contract's history thinks "show me
          VendorBillCalculation rows". They think "what have we billed".
          Three words, next thing first, done things counted. */}
      <Station
        n={8}
        title="What is due"
        subtitle={
          p.timeline.next
            ? `Next: ${inSentence(p.timeline.next.label)}, ${day(p.timeline.next.dueOn)}.`
            : 'Nothing outstanding on this placement.'
        }
      >
        {p.timeline.hours.length + p.timeline.pay.length + p.timeline.bill.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">No cycles have been generated for this contract.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([['Hours', p.timeline.hours], ['Pay', p.timeline.pay], ['Bill', p.timeline.bill]] as const).map(
              ([heading, rows]) => (
                <div key={heading}>
                  <div className="lbl mb-2">{heading}</div>
                  {rows.length === 0 ? (
                    <p className="text-[12px] text-etyme-faint">—</p>
                  ) : (
                    <ul className="space-y-1">
                      {rows.filter((r) => !r.done).slice(0, 4).map((r) => (
                        <li key={`${r.kind}-${r.dueOn}`} className="flex items-baseline justify-between gap-2 text-[13px]">
                          <span className={r.overdue ? 'text-etyme-attention' : 'text-etyme-ink'}>{r.label}</span>
                          <span className="tabular-nums text-etyme-muted">{day(r.dueOn)}</span>
                        </li>
                      ))}
                      {rows.filter((r) => r.done).length > 0 && (
                        <li className="text-[12px] text-etyme-faint">
                          {rows.filter((r) => r.done).length} done
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </Station>
    </div>
  )
}
