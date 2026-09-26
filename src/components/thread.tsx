'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * One thread, embedded where the thing it is about lives.
 *
 * A requisition's own Discussion, a client's note to one supplier about
 * that role, a question about a candidate from the row they arrived on —
 * all the same component, told who is on the far end and whether the
 * reader may start it. The thread is made by the first message, not by
 * the row: a row of empty threads is noise nobody reads.
 *
 * Who may start one is the API's decision (lib/threads: demand opens,
 * supply answers). `canOpen` only decides whether to offer the box; a
 * supplier who may not open a thread sees the sentence in `words.closed`
 * and, once the client has written, the thread and a box to answer in.
 */

export interface Firm {
  id: string
  name: string
}

export interface ThreadWords {
  /** Nothing said yet, and the reader may write. */
  empty: string
  /** Under the box: who will see what is typed. */
  foot: string
  placeholder: string
  /** Nothing said yet, and the reader may not start it. */
  closed?: string
}

interface Row {
  id: string
  otherCompany: Firm | null
  messageCount: number
}

interface Msg {
  id: string
  authorName: string | null
  authorCompany: string | null
  body: string
  type: string
  createdAt: string
}

export function Thread({ topic, topicId, title, withCompany, canOpen, words, onChanged }: {
  topic: 'REQUIREMENT' | 'SUBMISSION' | 'GENERAL'
  topicId: string
  title: string
  /** The firm on the far end. Null for a thread among your own people. */
  withCompany: Firm | null
  /** May the reader start the thread by writing? Answering an existing one is a party's right. */
  canOpen: boolean
  words: ThreadWords
  onChanged?: (messageCount: number) => void
}) {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/conversations?topic=${topic}&topicId=${encodeURIComponent(topicId)}`)
      const j = await readJson(res)
      const rows: Row[] = j?.data?.conversations ?? []
      // The far end matches, or both are nobody.
      const row = rows.find((r) => (r.otherCompany?.id ?? null) === (withCompany?.id ?? null)) ?? null
      setThreadId(row?.id ?? null)
      if (!row) {
        setMessages([])
        onChanged?.(0)
        return
      }
      const m = await fetch(`/api/conversations/messages?conversationId=${row.id}&limit=100`)
      const mj = await readJson(m)
      const list: Msg[] = mj?.data?.messages ?? []
      setMessages(list)
      onChanged?.(list.length)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
    // onChanged is a notification, not an input; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, topicId, withCompany?.id])

  useEffect(() => { load() }, [load])

  async function post() {
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setErr(null)
    try {
      if (!threadId) {
        // The first message makes the thread. The route hands back the
        // existing one when there is one, so two people typing at once
        // do not make two.
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic,
            topicId,
            title,
            withCompanyId: withCompany?.id ?? undefined,
            initialMessage: body,
          }),
        })
        await readJson(res)
      } else {
        const sent = await fetch('/api/conversations/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conversationId: threadId, body }),
        })
        await readJson(sent)
      }
      setText('')
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const mayWrite = threadId !== null || canOpen

  return (
    <div className="p-4">
      {loading && <p className="text-sm text-etyme-muted">Loading…</p>}

      {!loading && messages.length === 0 && (
        <p className="text-sm text-etyme-muted">{mayWrite ? words.empty : (words.closed ?? words.empty)}</p>
      )}

      {messages.length > 0 && (
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm text-etyme-ink">{m.authorName ?? 'Somebody'}</span>
                {withCompany && m.authorCompany && (
                  <span className="text-xs text-etyme-muted">· {m.authorCompany}</span>
                )}
                <span className="text-xs text-etyme-faint tabular-nums">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-etyme-muted whitespace-pre-line mt-0.5">{m.body}</p>
            </div>
          ))}
        </div>
      )}

      {mayWrite && (
        <div className={messages.length > 0 || !loading ? 'mt-4 pt-4 border-t border-etyme-rule' : ''}>
          <label htmlFor={`say-${topicId}-${withCompany?.id ?? 'own'}`} className="sr-only">
            {words.placeholder}
          </label>
          <textarea
            id={`say-${topicId}-${withCompany?.id ?? 'own'}`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={words.placeholder}
            className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action"
          />
          {err && <p className="mt-2 text-sm text-etyme-attention">{err}</p>}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-etyme-faint">{words.foot}</span>
            <button
              onClick={post}
              disabled={busy || text.trim().length === 0}
              className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Sending…' : withCompany ? 'Send' : 'Post'}
            </button>
          </div>
        </div>
      )}
      {!mayWrite && err && <p className="mt-2 text-sm text-etyme-attention">{err}</p>}
    </div>
  )
}

/**
 * The words for a thread among your own people on a role. Kept here so
 * the requisition page and the tests read the same sentences.
 */
export const OWN_NOTES_ON_A_ROLE: ThreadWords = {
  empty: 'Nothing said yet. Notes here stay with your own people — no supplier sees them.',
  foot: 'Your own people only. Suppliers never see this.',
  placeholder: 'Anything your own people should know about this role.',
}

/** The words for writing to one supplier about a role, from the demand side. */
export function toSupplierAboutRole(supplier: string): ThreadWords {
  return {
    empty: `Nothing said to ${supplier} yet. Ask them here and they are told; their answer comes back to this thread.`,
    foot: `${supplier} sees this. Nobody else does.`,
    placeholder: `Anything ${supplier} should know about this role.`,
  }
}

/** The words for writing to the firm that sent a candidate, from the desk that received them. */
export function toSupplierAboutCandidate(supplier: string, candidate: string): ThreadWords {
  return {
    empty: `Nothing said to ${supplier} about ${candidate} yet. Ask here and they are told.`,
    foot: `${supplier} sees this. ${candidate} does not.`,
    placeholder: `A question for ${supplier} about ${candidate}.`,
  }
}

/** The words from the supplier's side: they answer, they do not open. */
export function answeringDemand(client: string, about: string): ThreadWords {
  return {
    empty: `Nothing from ${client} yet.`,
    foot: `${client} sees this.`,
    placeholder: `Your answer to ${client}.`,
    closed: `${client} opens the conversation about ${about}; you answer it here when they do.`,
  }
}
