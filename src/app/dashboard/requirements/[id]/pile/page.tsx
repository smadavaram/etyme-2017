'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePageSection } from '@/components/page-section'
import { PageHead, Stat, RefusedState, LoadingState, ErrorState, EmptyState, Lbl } from '@/components/ui'

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
  // A client's job requests are under /dashboard/requisitions, a
  // supplier's under /dashboard/requirements; whichever this reader's
  // menu holds names the section.
  const asBuyer = usePageSection('/dashboard/requisitions')
  const asSeller = usePageSection('/dashboard/requirements')
  const section = asBuyer ?? asSeller

  const [pile, setPile] = useState<Pile | null>(null)
  const [loading, setLoading] = useState(true)
  const [screening, setScreening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)
  // The door's sentence when it refused this reader, drawn alone — never
  // under a "Screen again" button (round six, problem 13).
  const [refused, setRefused] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/requirements/${id}/screen`)
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body?.error?.message ?? 'Job requests is not part of your seat. Ask your company’s owner if you need it.')
        return
      }
      const body = await readJson(res)
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
      const body = await readJson(res)
      setPile((prev) => ({ ...(prev ?? {}), ...body.data }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setScreening(false)
    }
  }

  const arrived = pile ? pile.show.length + pile.more.length + pile.heldBack.length : 0

  if (refused) {
    return <RefusedState says={refused} />
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-6">
      {/* The reader's own menu section for job requests — a client's
          Workforce, a supplier's Sell — never "Program", which is on no
          client's menu (round five, #18). Blank until the seat is known. */}
      <PageHead
        eyebrow={section}
        title={pile?.title ?? 'The pile'}
        subtitle={<>
        {pile?.role && (
          <span className="mb-2 block text-[13px] text-etyme-faint">
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
          </span>
        )}
          Everything your suppliers sent for this job, and what is worth your
          afternoon. The ones held back are named, with what the vendor has to
          fix.
        </>}
      />

      {pile && !pile.neverRun && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Arrived" value={arrived} />
          <Stat label="Worth reading" value={pile.show.length + pile.more.length} tone="verified" />
          <Stat label="Held back" value={pile.heldBack.length} tone={pile.heldBack.length ? 'attention' : 'default'} />
        </div>
      )}

      {pile && <p className="text-[14px] text-etyme-ink">{pile.summary}</p>}

      {/* Offered once the pile is read, so a reader the door refuses is
          never shown a button first. */}
      {pile && (
      <div className="flex items-center gap-3">
        <button
          onClick={screen}
          disabled={screening || loading}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {screening ? 'Screening…' : pile?.neverRun ? 'Screen what has arrived' : 'Screen again'}
        </button>
        {pile && !pile.neverRun && (
          <span className="text-[12px] text-etyme-faint">{pile.orderedBy}</span>
        )}
      </div>
      )}

      {loading && <LoadingState says="Opening what was submitted…" />}

      {error && <ErrorState says={error} />}

      {!loading && pile && arrived === 0 && (
        <EmptyState says="Nothing has arrived for this job yet." detail="Nothing to screen." />
      )}

      {/* ── Worth reading ─────────────────────────────────────────── */}
      {pile && pile.show.length > 0 && (
        <section className="space-y-3">
          <Lbl>Worth reading</Lbl>
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
          <Lbl>Also cleared</Lbl>
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
          <Lbl>Held back</Lbl>
          <p className="max-w-[58ch] text-[12px] text-etyme-faint">
            Not a judgment on the person. These do not reach a hiring manager
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
          Back to open jobs
        </Link>
      </p>
    </div>
  )
}
