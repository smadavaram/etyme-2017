'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { readJson } from '@/lib/read-response'
import { refusedBy } from '@/app/dashboard/program/own-refusal'
import { PageHead, FilterChips, RefusedState, LoadingState, ErrorState, EmptyState, SubmitButton, FormMessage, Input } from '@/components/ui'

/**
 * Questions — what people asked on the firm's own public page.
 *
 * Record 102, item 1: a question asked on the page used to show once in the
 * greeting and then nowhere. This is where it stays: searchable by the
 * words, the name, the company and the address, taken by one person,
 * marked answered, closed. Etyme sends no reply: the person answers from
 * their own mail to the address on the question.
 */

interface Ask {
  id: string
  asked: string
  replyTo: string
  name: string | null
  companyName: string | null
  status: 'OPEN' | 'ANSWERED' | 'CLOSED'
  assigneePersonId: string | null
  assigneeName: string | null
  createdAt: string
}

const FILTERS = [
  { key: 'OPEN', label: 'Open' },
  { key: 'ANSWERED', label: 'Answered' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'ALL', label: 'All' },
] as const
type Filter = (typeof FILTERS)[number]['key']

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function PageAsksPage() {
  const section = usePageSection('/dashboard/page-asks')
  const [asks, setAsks] = useState<Ask[]>([])
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)
  const opened = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('open')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filter !== 'ALL') qs.set('status', filter)
      if (q.trim()) qs.set('q', q.trim())
      const res = await fetch(`/api/page-asks?${qs}`)
      const no = await refusedBy(res, 'Questions')
      if (no) { setRefused(no); return }
      setAsks((await readJson(res)).data.asks)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter, q])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  async function act(id: string, what: 'assign' | 'answered' | 'close') {
    setBusy(`${what}${id}`)
    setMessage(null)
    try {
      const res = await fetch(`/api/page-asks/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: what }),
      })
      const body = await readJson(res)
      setMessage({ tone: 'ok', says: body.data.message })
      await load()
    } catch (e: any) {
      setMessage({ tone: 'error', says: e.message })
    } finally {
      setBusy(null)
    }
  }

  if (refused) return <RefusedState says={refused} />

  return (
    <div>
      <PageHead
        eyebrow={section}
        title="Questions from your page"
        subtitle="What people typed into the Ask box on your public page. Take one, answer it from your own mail to the address shown, then mark it answered."
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips options={FILTERS.map((f) => ({ key: f.key, label: f.label }))} value={filter} onChange={setFilter} label="Show" />
        <div className="w-full sm:w-72">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, name, company or address" aria-label="Search questions" />
        </div>
      </div>
      {message && <div className="mb-4"><FormMessage tone={message.tone}>{message.says}</FormMessage></div>}
      {loading && asks.length === 0 ? (
        <LoadingState says="Opening the questions…" />
      ) : error ? (
        <ErrorState says={error} action={{ label: 'Try again', onClick: load }} />
      ) : asks.length === 0 ? (
        <EmptyState
          says={q.trim() ? 'No question matches that search.' : filter === 'OPEN' ? 'No open questions from your page.' : 'Nothing here.'}
          detail="A question appears here the moment somebody sends it from your public page."
        />
      ) : (
        <ul className="space-y-3">
          {asks.map((a) => (
            <li key={a.id} className={`panel px-5 py-4 ${opened === a.id ? 'ring-1 ring-etyme-attention' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14px] font-medium text-etyme-ink">
                  {a.name || a.replyTo}
                  {a.companyName ? <span className="font-normal text-etyme-muted"> · {a.companyName}</span> : null}
                </p>
                <p className="text-[11px] tabular-nums text-etyme-faint">{when(a.createdAt)}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-etyme-ink">{a.asked}</p>
              <p className="mt-2 text-[12.5px] text-etyme-muted">
                Reply to <a className="underline" href={`mailto:${a.replyTo}`}>{a.replyTo}</a>
                {' · '}
                {a.status === 'CLOSED' ? 'Closed' : a.status === 'ANSWERED' ? `Answered${a.assigneeName ? `, by ${a.assigneeName}` : ''}` : a.assigneeName ? `${a.assigneeName} has it` : 'Nobody has it yet'}
              </p>
              {a.status !== 'CLOSED' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.status === 'OPEN' && !a.assigneePersonId && (
                    <SubmitButton type="button" tone="secondary" pending={busy === `assign${a.id}`} pendingLabel="Taking…" onClick={() => act(a.id, 'assign')}>
                      Assign to me
                    </SubmitButton>
                  )}
                  {a.status === 'OPEN' && (
                    <SubmitButton type="button" tone="secondary" pending={busy === `answered${a.id}`} pendingLabel="Saving…" onClick={() => act(a.id, 'answered')}>
                      Answered
                    </SubmitButton>
                  )}
                  <SubmitButton type="button" tone="secondary" pending={busy === `close${a.id}`} pendingLabel="Closing…" onClick={() => act(a.id, 'close')}>
                    Close
                  </SubmitButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
