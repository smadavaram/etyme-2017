'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { ListSurface, type Column } from '@/components/list-surface'

/**
 * Your data — what Etyme holds about you, a copy of it, and a way to
 * ask to be forgotten.
 *
 * A decision surface, not a working one: three or four rows at most, so
 * it reads as prose with the list under it rather than as a table with
 * a sentence on top. The two buttons are the whole point of the page and
 * they are above everything else.
 *
 * What is held is rendered from the privacy notice's own categories
 * (`HELD` in `lib/legal`, through `/api/me/data`), never from a second
 * list written here. A page that describes the same thing in different
 * words from the notice is a page that cannot be checked against it.
 */

interface Held { category: string; examples: string; about: string }
interface Holder { name: string; how: 'EMPLOYER' | 'SUPPLIER' | 'CLIENT' }
interface Request_ {
  id: string
  reference: string
  kind: 'EXPORT' | 'ERASURE'
  status: string
  receivedAt: string
  dueAt: string
  dueBasis: string
  runsOn: string | null
  keptBecause: string[]
  refusedBecause: string | null
  completedAt: string | null
  canWithdraw: boolean
  downloadUrl: string | null
}

/** Three words, not five states. */
function word(r: Request_): string {
  if (r.status === 'REFUSED') return r.completedAt ? 'Stopped' : 'Not done'
  if (r.status === 'DONE') return r.kind === 'EXPORT' ? 'Downloaded' : 'Done'
  if (r.status === 'READY') return 'Ready'
  if (r.status === 'HELD') return 'Waiting on a hold'
  return 'With us'
}

function day(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function MyDataPage() {
  const [held, setHeld] = useState<Held[]>([])
  const [aboutYou, setAboutYou] = useState<string[]>([])
  const [youAre, setYouAre] = useState<string[]>([])
  const [told, setTold] = useState<Holder[]>([])
  const [requests, setRequests] = useState<Request_[]>([])
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // `{ data: ... }`, which is what this route sends and what
      // `/api/me/papers` next door sends. `readJson` hands back the
      // whole body, so the envelope is unwrapped here rather than
      // assumed away.
      const r = await fetch('/api/me/data').then(readJson)
      const d = r?.data ?? {}
      setHeld(d.held ?? [])
      setAboutYou(d.aboutYou ?? [])
      setYouAre(d.youAre ?? [])
      setTold(d.whoWouldBeTold ?? [])
      setRequests(d.requests ?? [])
      setContact(d.contactEmail ?? '')
    } catch {
      setError('We could not read your record just now. Nothing has changed — try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function ask(kind: 'EXPORT' | 'ERASURE') {
    setAsking(true)
    setError(null)
    try {
      const res = await fetch('/api/me/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? 'That did not go through.'); return }
      setSaid(body?.says ?? 'Done.')
      setConfirming(false)
      await load()
    } finally {
      setAsking(false)
    }
  }

  async function withdraw(id: string) {
    const res = await fetch(`/api/data-requests/${id}/withdraw`, { method: 'POST' })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error ?? 'That did not go through.'); return }
    setSaid(body?.says ?? 'Withdrawn.')
    await load()
  }

  const open = requests.filter((r) => r.status !== 'DONE' && r.status !== 'REFUSED')

  const columns: Column<Held>[] = [
    { key: 'category', label: 'What', width: 'w-64' },
    { key: 'examples', label: 'Which means', render: (h) => <span className="text-etyme-muted">{h.examples}</span> },
  ]

  return (
    <div className="max-w-4xl">
      <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">You</p>
      <h1 className="font-serif text-3xl text-etyme-ink tracking-[-0.02em] text-balance mt-1">Your data</h1>
      <p className="text-sm text-etyme-muted mt-2 max-w-2xl">
        Everything Etyme holds about you, where it came from, and what you can do about it.
        Asking for a copy or asking to be forgotten takes one click and neither needs
        anybody&rsquo;s permission.
      </p>

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

      {/* ── The two things this page is for ─────────────────────────── */}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => void ask('EXPORT')}
          disabled={asking}
          className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          Export everything
        </button>
        <button
          onClick={() => setConfirming(true)}
          disabled={asking}
          className="px-4 py-2 border border-etyme-rule rounded text-sm font-medium text-etyme-ink hover:bg-etyme-canvas disabled:opacity-50"
        >
          Ask to be forgotten
        </button>
      </div>

      {confirming && (
        <div className="mt-4 bg-etyme-surface border border-etyme-rule rounded-lg p-4">
          <h2 className="font-serif text-lg text-etyme-ink">Before you ask to be forgotten</h2>
          {/* Two readers, and for a week only one of them was written
              for. A firm's own staff — an AP clerk, a recruiter, a
              compliance officer — read a paragraph about payroll and
              a client's site and nothing about the seat that is their
              whole relationship with this product. Whether somebody is
              a worker, a business user or both is read off the work
              (`audiencesOf`), never off a seat type. */}
          <p className="text-sm text-etyme-muted mt-2">
            Nothing happens for fourteen days, so you can change your mind, and you will get a
            letter first saying exactly what goes and what stays.
          </p>
          {youAre.includes('candidate') && (
            <p className="text-sm text-etyme-muted mt-2">
              Some of it stays: whoever paid you keeps payroll and tax records, whoever took your
              I-9 keeps it, and the client whose site you stood on keeps the days you were there.
              Those are their obligations, not ours to waive.
            </p>
          )}
          {youAre.includes('business') && (
            <p className="text-sm text-etyme-muted mt-2">
              Your seat and what you decided from it stay under a marker: a requisition you
              raised, an approval you gave with its reason, a week of somebody&rsquo;s hours you
              signed. Those are your company&rsquo;s record of its own decisions, and they keep
              their dates and their reasons while they stop naming you. An approval with nobody
              behind it is worse for everybody than one nobody is named on.
            </p>
          )}
          <p className="text-sm text-etyme-muted mt-2">
            Your name, your sign-in, your profile and your resumes go, and you will not be able
            to sign in again.
          </p>
          {told.length > 0 && (
            <p className="text-sm text-etyme-muted mt-2">
              We write to {told.map((t) => t.name).join(', ')} the day it runs, because it is
              their records that change. There is nothing for them to do and nothing for them to
              decide.
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => void ask('ERASURE')}
              disabled={asking}
              className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Yes, start it
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-4 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-canvas"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── What is open ────────────────────────────────────────────── */}

      <section className="mt-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-3">
          What you have asked for{' '}
          <span className="text-xs text-etyme-faint tabular-nums font-sans">{requests.length}</span>
        </h2>
        {loading && <p className="text-sm text-etyme-muted">Reading your record&hellip;</p>}
        {!loading && requests.length === 0 && (
          <p className="text-sm text-etyme-muted">
            You have not asked for anything yet. Nothing on this page changes until you do.
          </p>
        )}
        <div className="space-y-3">
          {requests.map((r) => (
            <article key={r.id} className="bg-etyme-surface border border-etyme-rule rounded-lg p-4">
              <div className="flex justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm text-etyme-ink font-medium">
                    {r.kind === 'EXPORT' ? 'A copy of everything held about you' : 'Your request to be forgotten'}
                  </h3>
                  <p className="text-xs text-etyme-faint tabular-nums mt-0.5">
                    {r.reference} &middot; asked {day(r.receivedAt)}
                  </p>
                </div>
                <span className="inline-block h-fit px-2 py-0.5 rounded text-[11px] font-medium bg-etyme-rule/50 text-etyme-muted">
                  {word(r)}
                </span>
              </div>

              <p className="text-sm text-etyme-ink mt-3">
                {r.kind === 'ERASURE' && r.runsOn && !r.completedAt
                  ? <>It runs on <span className="tabular-nums">{day(r.runsOn)}</span>. An answer is owed by <span className="tabular-nums">{day(r.dueAt)}</span>.</>
                  : <>An answer is owed by <span className="tabular-nums">{day(r.dueAt)}</span>.</>}
              </p>
              <p className="text-xs text-etyme-muted mt-1">{r.dueBasis}</p>

              {r.keptBecause.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
                    What is kept, and why
                  </p>
                  <ul className="mt-1 space-y-1">
                    {r.keptBecause.map((k, i) => (
                      <li key={i} className="text-sm text-etyme-muted">{k}</li>
                    ))}
                  </ul>
                </div>
              )}

              {r.refusedBecause && (
                <p className="text-sm text-etyme-attention mt-3">{r.refusedBecause}</p>
              )}

              <div className="mt-3 flex gap-3">
                {r.downloadUrl && (
                  <a href={r.downloadUrl} className="text-xs text-etyme-action hover:underline">
                    Download the file
                  </a>
                )}
                {r.canWithdraw && (
                  <button onClick={() => void withdraw(r.id)} className="text-xs text-etyme-action hover:underline">
                    Stop this
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── What is held ────────────────────────────────────────────── */}

      <section className="mt-10">
        <h2 className="font-serif text-lg text-etyme-ink">What is held about you</h2>
        <p className="text-sm text-etyme-muted mt-1 mb-3 max-w-2xl">
          These are the privacy notice&rsquo;s own categories, in its own words, so what you read
          here and what the notice promises cannot drift apart.{' '}
          {aboutYou.length > 0 && (
            <>The ones that apply to you are {aboutYou.join(', ')}.</>
          )}
        </p>
        <ListSurface
          columns={columns}
          data={held}
          rowKey={(h) => h.category}
          loading={loading}
          defaultView="feed"
          searchFilter={(h, q) =>
            h.category.toLowerCase().includes(q) || h.examples.toLowerCase().includes(q)
          }
          searchPlaceholder="Search what is held&hellip;"
          emptyMessage="Nothing is listed yet."
          exportName="etyme-what-is-held"
        />
      </section>

      {open.length === 0 && (
        <p className="text-xs text-etyme-faint mt-8">
          Questions about any of this go to {contact}.
        </p>
      )}
    </div>
  )
}
