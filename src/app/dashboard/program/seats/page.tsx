'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * Program office — the desks this client has given to firms that are
 * not this client.
 *
 * ── A decision surface, in CLAUDE.md's sense ─────────────────────────
 *
 * Never more than a handful of rows, each one a standing grant to read
 * a whole contingent workforce. So: prose, the reason in the client's
 * own words, and no density. Nobody manages forty of these.
 *
 * The same page serves both ends, because it is one fact seen from two
 * sides — the client reads the firms it has seated, and a program office
 * reads the programs it has been seated in. What the office cannot do
 * here is grant or revoke anything: a badge is issued at the reception
 * desk of the building you are visiting.
 */

interface Seat {
  id: string
  live: boolean
  client: { id: string; name: string; slug: string }
  office: { id: string; name: string; kind: string }
  role: { id: string; name: string }
  unit: { id: string; name: string } | null
  grantedBy: { id: string; name: string } | null
  grantedAt: string
  reason: string
  validTo: string | null
  revokedAt: string | null
  revokedBy: { id: string; name: string } | null
  revokeReason: string | null
  says: string
}

const on = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function ProgramSeatsPage() {
  const [seats, setSeats] = useState<Seat[]>([])
  const [side, setSide] = useState<'CLIENT' | 'OFFICE'>('CLIENT')
  const [nothingYet, setNothingYet] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    const res = await fetch('/api/program/seats')
    const body = await readJson(res)
    const data = body?.data
    if (!data) throw new Error('The program office came back empty.')
    setSeats(Array.isArray(data.seats) ? data.seats : [])
    setSide(data.side === 'OFFICE' ? 'OFFICE' : 'CLIENT')
    setNothingYet(typeof data.says === 'string' ? data.says : null)
  }

  async function revoke(seat: Seat) {
    const why = window.prompt(`Why is ${seat.office.name} coming out of the ${seat.role.name} desk?`)
    if (why === null) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/program/seats/${encodeURIComponent(seat.id)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: why.trim() }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(body?.error?.message ?? 'That seat could not be taken back.')
      await reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        await reload()
      } catch (err: any) {
        if (!live) return
        setUnreadable(err?.message ?? 'The program office could not be read.')
      }
    })()
    return () => { live = false }
  }, [])

  if (unreadable) {
    return (
      <div className="animate-fade-in">
        <div className="panel py-16 text-center">
          <p className="text-sm text-etyme-muted">{unreadable}</p>
        </div>
      </div>
    )
  }

  const live = seats.filter((s) => s.live)
  const past = seats.filter((s) => !s.live)

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <p className="lbl">Governance</p>
        <h1 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-etyme-ink text-balance">
          Program office
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-etyme-muted">
          {side === 'CLIENT'
            ? 'A firm that runs your program places nobody, so nothing ties it to you the way a placement ties a supplier. You say so here. It acts at one of your own desks, under your rules rather than its own, and every read it makes leaves a trail you can read back.'
            : 'The programs you have been given a desk in. Each one is somebody else’s workforce: you act at their desk, under their rules, and they can take the desk back at any time.'}
        </p>
      </div>

      {error && <p className="text-[13px] text-etyme-danger">{error}</p>}

      {nothingYet && (
        <div className="panel p-5">
          <p className="max-w-2xl text-[14px] leading-relaxed text-etyme-ink">{nothingYet}</p>
        </div>
      )}

      {live.length === 0 && !nothingYet && (
        <div className="panel p-5">
          <p className="text-[14px] text-etyme-muted">
            Nobody outside {side === 'CLIENT' ? 'this company' : 'your own firm'} sits in this program.
            {side === 'CLIENT'
              ? ' That is the ordinary case: your own people run it from their own desks.'
              : ''}
          </p>
        </div>
      )}

      {live.map((seat) => (
        <div key={seat.id} className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-[19px] text-etyme-ink">
                {side === 'CLIENT' ? seat.office.name : seat.client.name}
              </h2>
              <p className="mt-1 text-[13px] text-etyme-muted">{seat.says}</p>
            </div>
            <span className="chip chip-verified">In the seat</span>
          </div>

          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-etyme-ink">{seat.reason}</p>

          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="lbl">Desk</dt>
              <dd className="text-[14px] text-etyme-ink">{seat.role.name}</dd>
            </div>
            <div>
              <dt className="lbl">Reaches</dt>
              <dd className="text-[14px] text-etyme-ink">{seat.unit ? seat.unit.name : 'The whole program'}</dd>
            </div>
            <div>
              <dt className="lbl">Granted</dt>
              <dd className="text-[14px] tabular-nums text-etyme-ink">
                {on(seat.grantedAt)}
                {seat.grantedBy ? ` · ${seat.grantedBy.name}` : ''}
                {seat.validTo ? ` · runs out ${on(seat.validTo)}` : ''}
              </dd>
            </div>
          </dl>

          {side === 'CLIENT' && (
            <button
              onClick={() => revoke(seat)}
              disabled={busy}
              className="mt-4 btn-secondary text-[13px]"
            >
              Take the desk back
            </button>
          )}
        </div>
      ))}

      {past.length > 0 && (
        <div className="panel p-5">
          <h2 className="font-serif text-[17px] text-etyme-ink">No longer in the program</h2>
          <p className="mt-1 text-[13px] text-etyme-muted">
            Kept rather than deleted: who was in the program, from when to when, and why they came out,
            is the answer somebody may have to give later.
          </p>
          <ul className="mt-3 space-y-2">
            {past.map((seat) => (
              <li key={seat.id} className="text-[13px] text-etyme-ink">
                <span className="font-medium">
                  {side === 'CLIENT' ? seat.office.name : seat.client.name}
                </span>
                {' — '}
                {seat.role.name}
                {', '}
                {on(seat.grantedAt)} to {on(seat.revokedAt ?? seat.validTo)}. {seat.says}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
