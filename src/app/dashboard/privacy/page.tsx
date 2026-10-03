'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { statusMeans } from '@/lib/read-response'
import { deskRefusal } from '@/lib/data-request'
import { ListSurface, type Column } from '@/components/list-surface'

/**
 * One read, one envelope.
 *
 * These three routes answer `{ data: ... }` and refuse with
 * `{ error: <sentence> }`, the way every route in this domain does.
 * `readJson` was used here and it throws a *generic* message on a
 * refusal — `body.error.message` on a body whose error is a sentence —
 * so the words the route chose never reached the screen, and the page
 * fell back to a refusal it had written itself. Both halves of that are
 * what this replaces.
 */
async function read(url: string): Promise<{ data: any | null; error: string | null }> {
  try {
    const res = await fetch(url)
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const said = typeof body?.error === 'string' ? body.error : body?.error?.message
      return { data: null, error: said ?? statusMeans(res.status) }
    }
    return { data: body?.data ?? null, error: null }
  } catch {
    return { data: null, error: 'We could not reach the server just now. Nothing has changed — try again in a moment.' }
  }
}

/**
 * Privacy — the compliance desk's own page: requests soonest due first,
 * the holds this company has placed, and any incident its records were
 * in.
 *
 * The queue is ordered by the day it is due and nothing else. A queue
 * ordered any other way is a queue that misses the one that mattered,
 * and this one has statutory deadlines on it.
 *
 * Every list is a ListSurface, so each is a table at two hundred rows
 * and a feed at eight, and the reader chooses.
 */

interface Request_ {
  id: string
  reference: string
  kind: 'EXPORT' | 'ERASURE'
  status: string
  subject: string
  subjectPersonId: string | null
  receivedAt: string
  dueAt: string
  dueBasis: string
  runsOn: string | null
  keptBecause: string[]
  refusedBecause: string | null
  completedAt: string | null
}

interface Hold {
  id: string
  subject: string
  subjectPersonId: string | null
  reason: string
  matter: string | null
  placedAt: string
  placedBy: string
  reviewBy: string | null
  liftedAt: string | null
  liftedReason: string | null
}

interface Desk { says: string; missing: string | null }
interface Clock { who: string; reading: string; says: string; hours: number | null }
interface Breach_ {
  id: string
  reference: string
  summary: string
  discoveredAt: string
  personalData: boolean
  closedAt: string | null
  openedBy: string | null
  says: string
  nobodyHasDecided: boolean
  clocks: Clock[]
  companies: { id: string; name: string; notifyBy: string | null; notifiedAt: string | null }[]
}

function day(iso: string | null): string {
  if (!iso) return 'Nobody has decided'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysLeft(iso: string, now: number): number {
  return Math.round((new Date(iso).getTime() - now) / 86_400_000)
}

/** Three words, not five states. */
function word(r: Request_): string {
  if (r.status === 'REFUSED') return 'Closed'
  if (r.status === 'DONE') return 'Answered'
  if (r.status === 'READY') return 'Ready'
  if (r.status === 'HELD') return 'On a hold'
  return 'Open'
}

export default function PrivacyPage() {
  const [requests, setRequests] = useState<Request_[]>([])
  const [desk, setDesk] = useState<Desk | null>(null)
  const [holds, setHolds] = useState<Hold[]>([])
  const [overdue, setOverdue] = useState<string[]>([])
  const [breaches, setBreaches] = useState<Breach_[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const now = useMemo(() => Date.now(), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [d, h, b] = await Promise.all([
        read('/api/data-requests'),
        read('/api/legal-holds'),
        read('/api/breaches'),
      ])
      setRequests(d.data?.requests ?? [])
      setDesk(d.data?.desk ?? null)
      setHolds(h.data?.holds ?? [])
      setOverdue(h.data?.overdueForReview ?? [])
      setBreaches(b.data?.breaches ?? [])
      // A company that was in no incident is refused by the incidents
      // route, correctly, and that is not a refusal of this page. Only
      // the two lists every compliance desk has decide whether this seat
      // can read the desk at all.
      setError(deskRefusal({ requests: d.error, holds: h.error }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function answer(id: string, kind: 'EXPORT' | 'ERASURE') {
    const res = await fetch('/api/data-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: kind === 'EXPORT' ? 'EXPORT' : 'ERASE', requestId: id }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error ?? body?.says ?? 'That did not go through.'); return }
    setSaid(body?.says ?? 'Answered.')
    await load()
  }

  async function lift(id: string) {
    const because = window.prompt('Why is this hold being lifted? A hold lifted with no reason is one nobody can explain afterwards.')
    if (!because) return
    const res = await fetch('/api/legal-holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lift: id, because }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error ?? 'That did not go through.'); return }
    setSaid(body?.says ?? 'Lifted.')
    await load()
  }

  const open = requests.filter((r) => r.status !== 'DONE' && r.status !== 'REFUSED')
  const urgent = open.filter((r) => daysLeft(r.dueAt, now) <= 1)

  const headline =
    open.length === 0
      ? 'Nothing is waiting on this desk today.'
      : `${open.length} request${open.length === 1 ? '' : 's'} need${open.length === 1 ? 's' : ''} you.` +
        (urgent.length > 0 ? ` ${urgent.length} ${urgent.length === 1 ? 'is' : 'are'} due inside a day.` : '')

  const requestColumns: Column<Request_>[] = [
    { key: 'subject', label: 'Who' },
    {
      key: 'kind', label: 'Asked for',
      render: (r) => (r.kind === 'EXPORT' ? 'A copy of everything held' : 'To be forgotten'),
    },
    {
      key: 'dueAt', label: 'Due', align: 'right',
      sortValue: (r) => new Date(r.dueAt).getTime(),
      render: (r) => <span className="tabular-nums">{day(r.dueAt)}</span>,
    },
    { key: 'status', label: 'Where it is', render: (r) => word(r) },
    {
      key: 'do', label: '', sortable: false,
      render: (r) =>
        r.status === 'DONE' || r.status === 'REFUSED' ? null : (
          <button onClick={() => void answer(r.id, r.kind)} className="text-xs text-etyme-action hover:underline">
            {r.kind === 'EXPORT' ? 'Produce it' : 'Run it'}
          </button>
        ),
    },
  ]

  const holdColumns: Column<Hold>[] = [
    { key: 'subject', label: 'Who is held' },
    { key: 'reason', label: 'Why', render: (h) => <span className="text-etyme-muted">{h.reason}</span> },
    {
      key: 'reviewBy', label: 'Look again by', align: 'right',
      render: (h) => (
        <span className={`tabular-nums ${overdue.includes(h.id) ? 'text-etyme-attention' : ''}`}>
          {h.reviewBy ? day(h.reviewBy) : 'No date set'}
        </span>
      ),
    },
    {
      key: 'liftedAt', label: 'Standing',
      render: (h) => (h.liftedAt ? `Lifted ${day(h.liftedAt)}` : 'Live'),
    },
    {
      key: 'do', label: '', sortable: false,
      render: (h) =>
        h.liftedAt ? null : (
          <button onClick={() => void lift(h.id)} className="text-xs text-etyme-action hover:underline">Lift it</button>
        ),
    },
  ]

  const breachColumns: Column<Breach_>[] = [
    { key: 'reference', label: 'Incident' },
    { key: 'summary', label: 'What happened', render: (b) => <span className="text-etyme-muted">{b.summary}</span> },
    {
      key: 'discoveredAt', label: 'Found', align: 'right',
      render: (b) => <span className="tabular-nums">{day(b.discoveredAt)}</span>,
    },
    { key: 'says', label: 'Where it stands', render: (b) => b.says },
  ]

  return (
    <div className="max-w-6xl">
      <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">Governance</p>
      <h1 className="font-serif text-3xl text-etyme-ink tracking-[-0.02em] text-balance mt-1">{headline}</h1>
      {/* Whose desk this is, said the way this kind of firm would say it.
          The page used to describe a client program to a staffing
          supplier and to an MSP alike; the sentence now comes from the
          route, which knows the company kind, the same way
          `lib/order-naming` decides what each end of an order is
          called. */}
      <p className="text-sm text-etyme-muted mt-2 max-w-2xl">
        {desk?.says ??
          'Requests for somebody’s data, the records this company has asked to keep, and any incident its records were in.'}{' '}
        Soonest due first.
      </p>

      {desk?.missing && (
        <p className="mt-3 px-4 py-3 rounded-lg bg-etyme-canvas border border-etyme-rule text-sm text-etyme-muted max-w-2xl">
          {desk.missing}
        </p>
      )}

      {said && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-etyme-verified/10 text-sm text-etyme-verified flex justify-between gap-4">
          <span>{said}</span>
          <button onClick={() => setSaid(null)} className="text-etyme-verified/70 shrink-0">Close</button>
        </div>
      )}
      {error && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-etyme-attention/10 text-sm text-etyme-attention flex justify-between gap-4">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-etyme-attention/70 shrink-0">Close</button>
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-1">
          Requests <span className="text-xs text-etyme-faint tabular-nums font-sans">{requests.length}</span>
        </h2>
        {open.length > 0 && (
          <p className="text-sm text-etyme-muted mb-3">{open[0].dueBasis}</p>
        )}
        <ListSurface
          columns={requestColumns}
          data={requests}
          rowKey={(r) => r.id}
          loading={loading}
          feedOmit={['do']}
          searchFilter={(r, q) => r.subject.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q)}
          searchPlaceholder="Search by person or reference&hellip;"
          emptyMessage="Nobody has asked this company for their data."
          emptyDetail="A request that arrives by email is logged here, and the clock counts from the day it arrived rather than the day you type it in."
          exportName="etyme-data-requests"
        />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg text-etyme-ink mb-1">
          Holds <span className="text-xs text-etyme-faint tabular-nums font-sans">{holds.length}</span>
        </h2>
        <p className="text-sm text-etyme-muted mb-3 max-w-2xl">
          A hold suspends the erasure of whoever it names everywhere, not only here. Only this
          company can lift one it placed, and a hold with no review date is a retention schedule
          set by forgetting.
        </p>
        <ListSurface
          columns={holdColumns}
          data={holds}
          rowKey={(h) => h.id}
          loading={loading}
          feedOmit={['do']}
          searchFilter={(h, q) => h.subject.toLowerCase().includes(q) || h.reason.toLowerCase().includes(q)}
          searchPlaceholder="Search by person or reason&hellip;"
          emptyMessage="This company holds nobody's records back."
          emptyDetail="A hold is placed when a matter needs records that would otherwise be deleted, and it carries a reason that can be shown to the person."
          exportName="etyme-legal-holds"
        />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg text-etyme-ink mb-1">
          Incidents <span className="text-xs text-etyme-faint tabular-nums font-sans">{breaches.length}</span>
        </h2>
        <p className="text-sm text-etyme-muted mb-3 max-w-2xl">
          Where personal data went somewhere it should not have. A clock with no date on it means
          nobody has decided whether a notice is owed, which is not the same as nothing being owed.
        </p>
        <ListSurface
          columns={breachColumns}
          data={breaches}
          rowKey={(b) => b.id}
          loading={loading}
          defaultView="feed"
          card={(b) => (
            <div>
              <div className="flex justify-between gap-4 flex-wrap">
                <h3 className="text-sm text-etyme-ink font-medium">{b.reference}</h3>
                <span className="text-xs text-etyme-faint tabular-nums">Found {day(b.discoveredAt)}</span>
              </div>
              <p className="text-sm text-etyme-muted mt-1">{b.summary}</p>
              <p className={`text-sm mt-2 ${b.nobodyHasDecided ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{b.says}</p>
              <ul className="mt-2 space-y-1">
                {b.clocks.map((c, i) => (
                  <li key={i} className="text-xs text-etyme-muted">{c.says}</li>
                ))}
              </ul>
            </div>
          )}
          searchFilter={(b, q) => b.summary.toLowerCase().includes(q) || b.reference.toLowerCase().includes(q)}
          searchPlaceholder="Search incidents&hellip;"
          emptyMessage="Nothing has gone anywhere it should not have."
          emptyDetail="Anything that reached your company's records would be here, and you would have been written to as well."
          exportName="etyme-incidents"
        />
      </section>
    </div>
  )
}
