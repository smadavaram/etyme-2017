'use client'

import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { refusalSentence } from '@/lib/refusal-words'
import { Chip, EmptyState, ErrorState, LoadingState, PageHead, RefusedState, Stat } from '@/components/ui'

import { useEffect, useState } from 'react'

/**
 * What has been said to consultants, and what came back.
 *
 * The screen behind the data integrity layer. Everything clever in this
 * product sits on a bench record, and the bench record rots — somebody
 * free three weeks ago took a contract on Tuesday and nobody updated it,
 * because updating records is nobody's job. The page says it with no
 * figure: a rate on it was read as a fact about a real person (fix
 * list, layer five, F3).
 *
 * The number at the top is the one that matters: how much of this bench
 * nobody has heard from. It is the number the whole loop exists to move.
 *
 * Scoped to one vendor, and that is not a formality. A consultant on two
 * benches must never learn that from us.
 */

interface Message {
  id: string
  person: { id: string; name: string }
  kind: string
  direction: 'OUT' | 'IN'
  /** Null before her yes, where the firm reads only what it typed (`checkInShown`). */
  body: string | null
  /** The line drawn in its place, or null. */
  bodyWaits: string | null
  /** What this letter was, from the route (`lib/notify/check-in-rows`): never "reply" for one the firm sent. */
  what: string
  status: string
  /** The chip on a try that did not go, or null. */
  notSent: string | null
  /** Why it did not go, in the words every screen uses for an email that did not go. */
  whyNotSent: string | null
  read: string | null
  at: string
}

interface Feed {
  messages: Message[]
  bench: { total: number; unconfirmed: number; noEmail: number; optedOut: number; says: string }
  provider: string
}

function when(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function TextsPage() {
  // Read off the menu this reader is actually shown, never the company's
  // whole one: a seat with no desk was headed "Supply" over a page its
  // menu does not have (sign-up walk, round seven, problem 3). Null while
  // the session loads and where the menu does not list the page.
  const eyebrow = usePageSection('/dashboard/texts')
  const [f, setF] = useState<Feed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // A refusal is the page: its sentence alone. The heading and the line
  // about a bench record going out of date are for the seats
  // that read check-ins, and a reader who may not open the page is not
  // shown either (round seven, problem 6).
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/texts')
      .then(async (r) => {
        if (r.status === 403) {
          const body = await r.json().catch(() => ({}))
          setRefused(
            refusalSentence(typeof body?.error === 'string' ? body.error : body?.error?.message) ||
              'Bench check-ins is not part of your seat. Ask your company’s owner if you need it.'
          )
          return
        }
        const body = await readJson(r)
        setF(body.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (refused) return <RefusedState says={refused} />
  // Nothing about whose bench this is until the read says it may be read.
  if (loading) return <LoadingState says="Opening bench check-ins…" />

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-6">
      {/* The section the reader's own menu puts this page under — a
          bench firm files it under Procure, an integrator and a program
          office under Supply. It read "Talent" until the menus were
          organized, and by then no menu had a Talent section at all. */}
      <PageHead
        eyebrow={eyebrow}
        title="Bench check-ins"
        subtitle={f && (
          <>
            A bench record goes out of date fast. Somebody free three weeks
            ago may have started a contract since. So each person is asked
            one question, answered in one tap, in your name.
          </>
        )}
      />

      {f && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Not confirmed"
              value={<>{f.bench.unconfirmed}<span className="text-[16px] text-etyme-faint">/{f.bench.total}</span></>}
              tone={f.bench.unconfirmed > 0 ? 'attention' : 'default'}
            />
            <Stat label="No email" value={f.bench.noEmail} />
            <Stat label="Asked us to stop" value={f.bench.optedOut} />
          </div>

          <p className="text-[13px] text-etyme-muted">{f.bench.says}</p>

          {f.provider.startsWith('not set up') && (
            <div className="rounded-panel border border-etyme-rule bg-etyme-canvas px-4 py-3 text-[13px] text-etyme-ink">
              Messages are being written down but not sent — no email
              provider is set up yet. Everything below is what would have
              gone out.
            </div>
          )}
        </>
      )}

      {error && <ErrorState says={error} />}

      {f && f.messages.length === 0 && (
        <EmptyState
          says="Nothing sent yet"
          detail="The check-in runs every fortnight for anybody on the bench who is not currently working. The consent ask goes out with each submission."
        />
      )}

      <div className="space-y-2">
        {f?.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-md border px-3 py-2 ${
              m.direction === 'IN'
                ? 'border-etyme-rule bg-etyme-raised'
                : 'border-transparent bg-etyme-canvas'
            }`}
          >
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[12px]">
                <span className="font-medium text-etyme-ink">{m.person.name}</span>
                <span className="text-etyme-faint">
                  {' '}
                  · {m.what} ·{' '}
                  {when(m.at)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {m.read && <Chip tone="action">{m.read.toLowerCase()}</Chip>}
                {m.notSent && (
                  <Chip tone={m.status === 'FAILED' ? 'danger' : 'passive'}>{m.notSent}</Chip>
                )}
              </span>
            </div>
            {m.body != null ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-etyme-ink">
                {m.body}
              </p>
            ) : (
              m.bodyWaits && <p className="text-[13px] leading-relaxed text-etyme-muted">{m.bodyWaits}</p>
            )}
            {/* Why a try did not go, on the row and not in a tooltip a phone cannot open. */}
            {m.whyNotSent && <p className="mt-1 text-[12px] text-etyme-muted">{m.whyNotSent}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
