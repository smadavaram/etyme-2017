'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

/**
 * The pile.
 *
 * Everything four vendors sent for one job, and what a hiring manager
 * should actually read. A decision surface: prose, reasoning, calm,
 * four items rather than four hundred.
 *
 * The headline is deliberately the subtraction — "10 arrived, 4 worth
 * reading, 6 held back" — because the subtraction is the thing being
 * bought. A screen that opened on four excellent candidates would look
 * like every other shortlist and prove nothing.
 *
 * Every hold-back names the vendor's own remedy. A screen that only says
 * no trains suppliers to send more, not better.
 */

interface Finding {
  code: string
  checker: 'RULE' | 'MODEL' | 'HUMAN'
  verdict: 'PASS' | 'FAIL'
  reason: string
  evidence?: string | null
}

interface Row {
  submissionId: string
  personName: string
  vendorName: string
  rateCents: number | null
  submittedAt: string
  cleared: boolean
  heldBackFor: Finding[]
  notes: Finding[]
  score: number | null
}

interface Pile {
  requirementId: string
  title: string
  role?: {
    location: string | null
    billMin: number | null
    billMax: number | null
    startDate: string | null
  }
  screened: number
  neverRun?: boolean
  show: Row[]
  more: Row[]
  heldBack: Row[]
  orderedBy: string
  summary: string
}

function hourly(cents: number | null): string {
  if (cents == null) return '—'
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

export default function PilePage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [pile, setPile] = useState<Pile | null>(null)
  const [loading, setLoading] = useState(true)
  const [screening, setScreening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/requirements/${id}/screen`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setPile(body.data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function screen() {
    if (!id) return
    setScreening(true)
    setError(null)
    try {
      const res = await fetch(`/api/requirements/${id}/screen`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setPile((prev) => ({ ...(prev ?? {}), ...body.data }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setScreening(false)
    }
  }

  const arrived = pile ? pile.show.length + pile.more.length + pile.heldBack.length : 0

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Program</p>
        <h1 className="headline-serif text-[30px] leading-tight">
          {pile?.title ?? 'The pile'}
        </h1>
        {pile?.role && (
          <p className="mt-1 text-[13px] text-etyme-faint">
            {[
              pile.role.location,
              pile.role.billMin && pile.role.billMax
                ? `${hourly(pile.role.billMin)}–${hourly(pile.role.billMax)}/hr`
                : null,
              pile.role.startDate
                ? `starts ${new Date(pile.role.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          Everything your suppliers sent for this job, and what is worth your
          afternoon. The ones held back are named, with what the vendor has to
          fix.
        </p>
      </header>

      {pile && !pile.neverRun && (
        <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
          <div>
            <p className="stat-label">Arrived</p>
            <p className="stat-value">{arrived}</p>
          </div>
          <div>
            <p className="stat-label">Worth reading</p>
            <p className="stat-value" style={{ color: 'var(--color-verified)' }}>
              {pile.show.length + pile.more.length}
            </p>
          </div>
          <div>
            <p className="stat-label">Held back</p>
            <p
              className="stat-value"
              style={{ color: pile.heldBack.length ? 'var(--color-attention)' : undefined }}
            >
              {pile.heldBack.length}
            </p>
          </div>
        </div>
      )}

      {pile && <p className="text-[14px] text-etyme-ink">{pile.summary}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={screen}
          disabled={screening || loading}
          className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white
                     disabled:cursor-not-allowed disabled:opacity-40"
        >
          {screening ? 'Screening…' : pile?.neverRun ? 'Screen what has arrived' : 'Screen again'}
        </button>
        {pile && !pile.neverRun && (
          <span className="text-[12px] text-etyme-faint">{pile.orderedBy}</span>
        )}
      </div>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && pile && arrived === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing has arrived for this role yet. Nothing to screen.
          </p>
        </div>
      )}

      {/* ── Worth reading ─────────────────────────────────────────── */}
      {pile && pile.show.length > 0 && (
        <section className="space-y-3">
          <p className="stat-label">Worth reading</p>
          {pile.show.map((r) => (
            <article key={r.submissionId} className="panel">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{r.personName}</p>
                  <p className="text-[12px] text-etyme-faint">
                    {r.vendorName} · <span className="tabular-nums">{hourly(r.rateCents)}</span>/hr
                    {' · '}
                    {new Date(r.submittedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                {r.score != null && (
                  <p
                    className="headline-serif text-[24px] tabular-nums"
                    style={{
                      color:
                        r.score >= 85
                          ? 'var(--color-verified)'
                          : r.score >= 70
                            ? undefined
                            : 'var(--color-attention)',
                    }}
                  >
                    {r.score}
                  </p>
                )}
              </div>

              {/* The three things nobody in the building knows. */}
              {r.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-etyme-rule pt-3">
                  {r.notes.map((n, i) => (
                    <li key={i} className="text-[12px] text-etyme-muted">
                      {n.reason}
                      {n.evidence && (
                        <span className="mt-0.5 block text-etyme-faint">{n.evidence}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      )}

      {pile && pile.more.length > 0 && (
        <section className="space-y-2">
          <p className="stat-label">Also cleared</p>
          <div className="panel">
            <ul className="space-y-1.5">
              {pile.more.map((r) => (
                <li key={r.submissionId} className="text-[13px] text-etyme-muted">
                  {r.personName} — {r.vendorName},{' '}
                  <span className="tabular-nums">{hourly(r.rateCents)}</span>/hr
                  {r.score != null && <span className="text-etyme-faint"> · {r.score}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Held back ─────────────────────────────────────────────── */}
      {pile && pile.heldBack.length > 0 && (
        <section className="space-y-3">
          <p className="stat-label">Held back</p>
          <p className="max-w-[58ch] text-[12px] text-etyme-faint">
            Not a judgement on the person. These do not reach a hiring manager
            until somebody fixes what is named — and the vendor is told exactly
            what.
          </p>
          {pile.heldBack.map((r) => (
            <article key={r.submissionId} className="panel">
              <button
                onClick={() => setOpenRow(openRow === r.submissionId ? null : r.submissionId)}
                className="flex w-full items-baseline justify-between gap-4 text-left"
              >
                <span>
                  <span className="text-[14px] text-etyme-ink">{r.personName}</span>
                  <span className="ml-2 text-[12px] text-etyme-faint">
                    {r.vendorName} · <span className="tabular-nums">{hourly(r.rateCents)}</span>/hr
                  </span>
                </span>
                <span className="text-[12px] text-etyme-attention">
                  {r.heldBackFor.length} to fix
                </span>
              </button>

              <ul className="mt-2 space-y-1.5">
                {(openRow === r.submissionId ? r.heldBackFor : r.heldBackFor.slice(0, 1)).map(
                  (f, i) => (
                    <li key={i} className="text-[12px] text-etyme-muted">
                      {f.reason}
                      {openRow === r.submissionId && f.evidence && (
                        <span className="mt-0.5 block text-etyme-faint">{f.evidence}</span>
                      )}
                    </li>
                  )
                )}
              </ul>

              {r.heldBackFor.length > 1 && openRow !== r.submissionId && (
                <p className="mt-1 text-[11px] text-etyme-faint">
                  and {r.heldBackFor.length - 1} more — click to read
                </p>
              )}
            </article>
          ))}
        </section>
      )}

      <p className="pt-2 text-[12px] text-etyme-faint">
        <Link href="/dashboard/requirements" className="underline">
          Back to open roles
        </Link>
      </p>
    </div>
  )
}
