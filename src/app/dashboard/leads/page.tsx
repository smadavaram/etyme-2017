'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The paste box, and the seats it collapses into.
 *
 * A decision surface, not a working one. CLAUDE.md: "Prose, reasoning,
 * confidence, calm. 3–10 items. User decides well and leaves."
 *
 * The demand a sub-vendor works arrives as adverts — a Dice posting, a
 * forwarded email from a prime, four of them for the same seat with the
 * title reworded and the rate shaved. Every one of those was a
 * hand-typed requirement before this page, which is why leads sat at zero.
 *
 * The screen is the collapse. Not "eleven adverts came in" but "four
 * seats, and one you are seeing from three different primes" — because
 * submitting the same person down all three is how a client sees the name
 * three times and rejects all three.
 */

interface Opening {
  id: string
  title: string
  skills: string[]
  location: string | null
  status: string
  client: string
  clientKnown: boolean
  firstSeen: string
  lastSeen: string
  routeCount: number
  rateLow: number | null
  rateHigh: number | null
  leads: {
    id: string
    source: string
    postedBy: string | null
    rateCents: number | null
    seenAt: string
    matchStrength: string | null
    matchBecause: string[]
  }[]
  bestRoute: {
    leadId: string
    postedBy: string | null
    rateCents: number | null
    because: string
  } | null
  requirements: { id: string; title: string; status: string }[]
  holds: number
}

function money(cents: number | null): string {
  return cents === null ? '—' : `$${Math.round(cents / 100)}`
}

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── The box ────────────────────────────────────────────────

function PasteBox({ onRead }: { onRead: (summary: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function paste() {
    if (text.trim().length < 20) {
      setError('Paste the advert — a line or two is not enough to read.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setText('')
      onRead(body.data.summary)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <p className="eyebrow mb-2">Paste it in</p>
      <h2 className="headline-serif text-[22px] mb-1">What came in this morning</h2>
      <p className="text-[13px] text-etyme-muted mb-4 max-w-[62ch]">
        A Dice advert, a forwarded email, or the whole lot at once separated
        by a line of dashes. It reads each one and tells you which are the
        same seat.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={`Senior SAP FICO Consultant\nLocation: Denver, CO (Hybrid)\nRate: $62 - $68/hr C2C\nSkills: SAP FICO, S/4HANA\nPosted by: Vertex Global Solutions`}
        className="w-full rounded-md border border-etyme-rule bg-etyme-raised p-3 font-mono text-[12px] leading-relaxed text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-action focus:outline-none"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={paste}
          disabled={busy}
          className="rounded-md bg-etyme-action px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Reading…' : 'Read it'}
        </button>
        {error && <span className="text-[12px] text-etyme-attention">{error}</span>}
      </div>
    </div>
  )
}

// ── One seat ───────────────────────────────────────────────

function Seat({ seat, onWrittenUp }: { seat: Opening; onWrittenUp: (note: string) => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const written = seat.requirements.length > 0

  async function writeUp() {
    setBusy(true)
    try {
      const res = await fetch(`/api/openings/${seat.id}/requirement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      onWrittenUp(body.data.note)
      router.push(`/dashboard/requirements?id=${body.data.requirement.id}`)
    } catch (err: any) {
      onWrittenUp(err.message)
      setBusy(false)
    }
  }

  const spread =
    seat.rateLow !== null && seat.rateHigh !== null && seat.rateLow !== seat.rateHigh

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="headline-serif text-[19px] leading-snug">{seat.title}</h3>
          <p className="mt-1 text-[12px] text-etyme-muted">
            {seat.location ?? 'location not given'} ·{' '}
            {seat.clientKnown ? seat.client : 'client not named'}
            {' · first seen '}
            {when(seat.firstSeen)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {seat.routeCount > 1 && (
            <span className="chip chip--attention">
              {seat.routeCount} routes to it
            </span>
          )}
          {seat.holds > 0 && (
            <span className="chip chip--verified">{seat.holds} held</span>
          )}
          {written && <span className="chip chip--verified">Written up</span>}
        </div>
      </div>

      {seat.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {seat.skills.slice(0, 8).map((s) => (
            <span key={s} className="chip chip--action">{s}</span>
          ))}
        </div>
      )}

      {/* The recommendation, in a sentence, before any of the working.
          With one advert there is nothing to recommend, so it says so
          rather than dressing a single option up as a choice. */}
      {seat.bestRoute && !written && (
        <div className="mt-4 rounded-md border border-etyme-rule bg-etyme-canvas p-3">
          <p className="text-[13px] text-etyme-ink">
            {seat.routeCount > 1 ? 'Answer ' : 'One route so far — '}
            <strong className="font-semibold">
              {seat.bestRoute.postedBy ?? 'whoever posted it'}
            </strong>
            {seat.bestRoute.rateCents !== null && (
              <>, at {money(seat.bestRoute.rateCents)}/hr</>
            )}
            .
          </p>
          {seat.routeCount > 1 && (
            <p className="mt-1 text-[12px] text-etyme-muted">
              {seat.bestRoute.because}
              {spread && (
                <>
                  {' '}· the same seat is posted between {money(seat.rateLow)} and{' '}
                  {money(seat.rateHigh)}
                </>
              )}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!written && (
          <button
            onClick={writeUp}
            disabled={busy}
            className="rounded-md bg-etyme-action px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Writing it up…' : 'Write it up as a role'}
          </button>
        )}
        {written && (
          <a
            href={`/dashboard/requirements?id=${seat.requirements[0].id}`}
            className="text-[12px] font-medium text-etyme-action hover:underline"
          >
            Open the role →
          </a>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="text-[12px] text-etyme-muted hover:text-etyme-ink"
        >
          {open ? 'Hide' : `${seat.leads.length} advert${seat.leads.length === 1 ? '' : 's'} behind this`}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-etyme-rule pt-3">
          {seat.leads.map((l) => (
            <div key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
              <div className="min-w-0">
                <span className="font-medium text-etyme-ink">
                  {l.postedBy ?? 'not named'}
                </span>
                <span className="text-etyme-faint"> · {l.source.toLowerCase()} · {when(l.seenAt)}</span>
                {l.matchBecause.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-etyme-muted">
                    Same seat because {l.matchBecause.join(', ')}.
                  </p>
                )}
              </div>
              <span className="tabular-nums text-etyme-ink">
                {money(l.rateCents)}
                {l.rateCents !== null && <span className="text-etyme-faint">/hr</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── The page ───────────────────────────────────────────────

export default function LeadsPage() {
  const [seats, setSeats] = useState<Opening[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/openings')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setSeats(body.data.openings)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const multiRoute = seats.filter((s) => s.routeCount > 1).length
  const unwritten = seats.filter((s) => s.requirements.length === 0).length

  return (
    <div className="mx-auto max-w-[880px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Sell</p>
        <h1 className="headline-serif text-[30px] leading-tight" style={{ textWrap: 'balance' } as any}>
          Leads
        </h1>
        <p className="mt-1 max-w-[62ch] text-[13px] text-etyme-muted">
          Demand does not arrive as a requisition. It arrives as adverts, and
          the same seat arrives four times. This puts them together.
        </p>
      </header>

      <PasteBox
        onRead={(summary) => {
          setSaid(summary)
          load()
        }}
      />

      {said && (
        <div className="rounded-md border border-etyme-rule bg-etyme-canvas px-4 py-3 text-[13px] text-etyme-ink">
          {said}
        </div>
      )}

      {seats.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-6 border-b border-etyme-rule pb-4">
          <div>
            <p className="stat-label">Seats</p>
            <p className="stat-value">{seats.length}</p>
          </div>
          <div>
            <p className="stat-label">Seen more than once</p>
            <p className="stat-value" style={{ color: multiRoute > 0 ? 'var(--color-attention)' : undefined }}>
              {multiRoute}
            </p>
          </div>
          <div>
            <p className="stat-label">Not written up</p>
            <p className="stat-value">{unwritten}</p>
          </div>
        </div>
      )}

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && !error && seats.length === 0 && (
        <div className="panel">
          <h2 className="headline-serif text-[19px]">Nothing yet</h2>
          <p className="mt-1 max-w-[58ch] text-[13px] text-etyme-muted">
            Paste an advert above. One is enough to start — the value shows
            up on the second one for the same seat, which is usually the
            same afternoon.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {seats.map((s) => (
          <Seat key={s.id} seat={s} onWrittenUp={(note) => setSaid(note)} />
        ))}
      </div>
    </div>
  )
}
