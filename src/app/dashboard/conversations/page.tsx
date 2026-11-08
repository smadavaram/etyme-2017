'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RailSlot } from '@/components/shell/rail-slots'
import { askHref } from './ask-href'
import { AskEtyme } from './ask-etyme'
import { useSession } from '@/components/session-provider'
import { readJson } from '@/lib/read-response'
import { openThread } from './open-thread'
import { conversationsFraming } from '@/lib/page-framing'
import { usePageSection } from '@/components/page-section'
import {
  Chip, EmptyState, ErrorState, Field, FormMessage, Input, LoadingState, PageHead,
  SubmitButton, Textarea,
} from '@/components/ui'

/**
 * Conversations page — messaging between vendors, clients, and candidates.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   Decision surfaces: "Prose, reasoning, confidence, calm"
 *
 * BUILD.md §6.1: "The connective tissue. Its absence will be felt immediately."
 *   Auto-created threads per requirement, per contract, per document request.
 *
 * LEGACY_RULES.md §7.1: Conversations are always scoped to a company.
 *   Topics: GENERAL · REQUIREMENT · CONTRACT · SUBMISSION · DOCUMENT · INVOICE · EXPENSE · DIRECT
 *
 * Two kinds of thread sit in the one list, and a row says which: your
 * own people's, and one across a deal with another firm ("with Nike").
 * The second kind is opened by the demand side from the role or the
 * candidate — never from here, because a conversation with a supplier is
 * about something — and answered from either side. A supplier hears
 * from a client by being written to; it cannot start a thread with one
 * (src/lib/threads.ts). The bell's deep link lands here with ?open=.
 *
 * Layout (founder, 2026-11-08, "One app, two tabs"): the switch at the
 * top of the left column is Ask Etyme, and the column under it holds New
 * conversation and search, the role's three pinned questions, then the
 * conversations, newest first. This page fills those three places
 * (RailSlot); the shell draws the column, and on a phone its menu sheet.
 * The pane is the open thread, or Ask Etyme when none is open, at
 * /dashboard/conversations/etyme or here.
 */

const ASK_ETYME_HREF = '/dashboard/conversations/etyme'

// ── Types ────────────────────────────────────────────

interface Conversation {
  id: string
  topic: string
  topicId: string | null
  title: string
  participants: { personId: string; name: string }[]
  /** The firm on the far end, from where the reader sits. Null on your own people's thread. */
  otherCompany: { id: string; name: string } | null
  side: 'OPENED' | 'ANSWERS' | null
  messageCount: number
  lastMessage: {
    body: string
    authorId: string
    createdAt: string
  } | null
  createdAt: string
  updatedAt: string
}

interface Message {
  id: string
  authorId: string
  authorName: string | null
  /** Which firm they write for, on a thread across a deal. */
  authorCompany?: string | null
  body: string
  type: string
  metadata: any
  createdAt: string
}

// ── Helpers ──────────────────────────────────────────

/** The trade's word for what a thread is about — never the enum. */
function topicLabel(topic: string): string {
  const map: Record<string, string> = {
    REQUIREMENT: 'a job',
    CONTRACT:    'a contract',
    SUBMISSION:  'a candidate',
    DOCUMENT:    'paperwork',
    INVOICE:     'a bill or an invoice',
    EXPENSE:     'an expense',
    DIRECT:      'direct',
    GENERAL:     'general',
  }
  return map[topic] ?? 'general'
}


function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function messageTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function messageTypeClass(type: string): string {
  if (type === 'SYSTEM') return 'italic text-etyme-faint'
  if (type === 'RATE_CONFIRMATION') return 'text-etyme-attention font-medium'
  if (type === 'INTERVIEW') return 'text-etyme-action font-medium'
  return ''
}

// ── New Conversation Modal ───────────────────────────

/**
 * A note among your own people.
 *
 * This form used to ask for a channel and a list of person ids and then
 * post fields the route never read — a form whose answer is thrown away,
 * which CLAUDE.md names as the thing never to hand anybody. It now asks
 * for the two things that make a thread, and says plainly how the other
 * kind of conversation starts.
 */
function NewConversationModal({ isClient, onClose, onCreated }: {
  isClient: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [form, setForm] = useState({ title: '', body: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'GENERAL', title: form.title.trim(), initialMessage: form.body.trim() }),
      })
      const j = await readJson(res)
      onCreated(j?.data?.conversation?.id)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'That could not be started.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-serif text-h3 text-etyme-ink">New conversation</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-etyme-muted mb-5">
          {isClient
            ? 'Among your own people. To write to a supplier, open the job or the candidate and message them from there — they answer on that thread.'
            : 'Among your own people. A client writes to you from their job or your candidate, and you answer on that thread; a supplier does not start one.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="What it is about">
            <Input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Q4 hiring plan"
            />
          </Field>

          <Field label="First note">
            <Textarea
              required
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="resize-none"
              placeholder="Type your note…"
            />
          </Field>

          {error && <FormMessage tone="error">{error}</FormMessage>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <SubmitButton
              pending={submitting}
              pendingLabel="Starting…"
              disabled={!form.title.trim() || !form.body.trim()}
            >
              Start conversation
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function ConversationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const askOpen = pathname === ASK_ETYME_HREF
  const session = useSession()
  const { company, contextType } = session
  // Read off the menu on the left of this screen — the trimmed one this
  // reader is shown — and null until the session lands, so the page never
  // borrows a heading (sign-up walk, round seven, problem 3).
  const eyebrow = usePageSection('/dashboard/conversations')
  // Whose words: a firm's desk, somebody on a firm's bench, or somebody
  // with no company at all (round seven, problem 11).
  const words = conversationsFraming(company?.kind ?? null, contextType === 'CONSULTANT', company?.name)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Search over the conversations in the column.
  const [query, setQuery] = useState('')
  // The role's three pinned questions, read with nothing marked seen.
  const [pinned, setPinned] = useState<string[]>([])
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  // The route's own sentence when a reply did not go — "That conversation
  // is not here.", a desk the seat does not hold — said under the box.
  // It was swallowed, so a refused reply looked like a reply that sent.
  const [sendError, setSendError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // The route's own refusal when a link opens a thread this seat may not
  // read (release walk, 2026-10-27): said in place of "Select a conversation".
  const [openRefused, setOpenRefused] = useState<string | null>(null)

  // Open the new-conversation modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true)
      router.replace('/dashboard/conversations' as Route, { scroll: false })
    }
  }, [searchParams, router])

  // The bell lands here with ?open=<thread>. Open that one, from the list
  // if it is there, else by asking for it — a thread older than the first
  // page is still the one the bell rang about.
  const openId = searchParams.get('open')
  // "Ask about this table" on Profitability, and any link with ?ask=,
  // opens Ask Etyme itself with the question; Ask Etyme sends it once.
  const askParam = searchParams.get('ask')
  useEffect(() => {
    if (askParam && !askOpen) router.replace(askHref(askParam) as Route, { scroll: false })
  }, [askParam, askOpen, router])

  // The pinned questions for the column (GET ?only=pinned marks nothing seen).
  useEffect(() => {
    let live = true
    void fetch('/api/conversations/twin?only=pinned')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const got = b?.data?.pinned
        if (live && Array.isArray(got)) setPinned(got.filter((x: unknown): x is string => typeof x === 'string').slice(0, 3))
      })
      .catch(() => { /* No pinned questions is a column without them, never an error. */ })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!openId || loading) return
    const inList = conversations.find((c) => c.id === openId)
    if (inList) {
      setOpenRefused(null)
      setActiveConvo(inList)
      return
    }
    void openThread(openId).then((got) => {
      if (!got.ok) { setOpenRefused(got.says); return }
      const t = got.thread
      const mine = t.company?.id === company?.id
      setOpenRefused(null)
      setActiveConvo({
        id: t.id, topic: t.topic, topicId: t.topicId, title: t.title ?? 'Conversation',
        participants: [], messageCount: 0, lastMessage: null,
        otherCompany: mine ? t.withCompany ?? null : t.company ?? null,
        side: t.withCompany ? (mine ? 'OPENED' : 'ANSWERS') : null,
        createdAt: '', updatedAt: '',
      })
    })
    // conversations is read once the list has loaded; re-running per item would re-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Fetch conversations ───────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/conversations?limit=50')
      const body = await readJson(res)
      setConversations(body?.data?.conversations ?? [])
    } catch (err: any) {
      setError(err.message)
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // ── Fetch messages for active conversation ────────
  const fetchMessages = useCallback(async (convoId: string) => {
    setMessagesLoading(true)
    try {
      const res = await fetch(`/api/conversations/messages?conversationId=${convoId}&limit=100`)
      if (!res.ok) throw new Error('Failed to load messages')
      const body = await res.json()
      setMessages(body.data?.messages ?? [])
    } catch {
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  useEffect(() => {
    setSendError(null)
    if (activeConvo) {
      setOpenRefused(null)
      fetchMessages(activeConvo.id)
    }
  }, [activeConvo, fetchMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newMessage.trim() || !activeConvo || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/conversations/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConvo.id,
          body: newMessage.trim(),
          type: 'TEXT',
        }),
      })
      await readJson(res)
      setNewMessage('')
      fetchMessages(activeConvo.id)
      fetchConversations() // update last message preview
    } catch (err: any) {
      setSendError(err?.message ?? 'That note did not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  // ── The column's list: newest first, searched by what a person remembers ──
  const q = query.trim().toLowerCase()
  const filtered = [...conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((c) => !q || [c.title, c.otherCompany?.name ?? '', c.lastMessage?.body ?? '']
      .some((x) => x.toLowerCase().includes(q)))

  // The pane: a thread when one is open, else Ask Etyme. Nothing chosen is
  // never a blank pane (onboarding walk, 2026-10-27), and since the list
  // moved into the left column (2026-11-08) that holds on a phone too.
  const threadOpen = !askOpen && !!activeConvo
  const showAsk = askOpen || (!activeConvo && !openId && !openRefused)

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] px-4 py-3 rounded-lg bg-etyme-verified text-white text-sm shadow-lg animate-slide-up">
          {toast}
        </div>
      )}

      {/* The left column under the switch (founder, 2026-11-08, "One app,
          two tabs"): New conversation and search, the role's pinned
          questions, then the conversations, newest first. The shell draws
          the column; this page fills it (RailSlot), so on a phone the
          menu sheet shows the same three. */}
      <RailSlot name="top">
        <div className="space-y-1.5 px-0.5 pt-1">
          {!session.loading && words.mayStart && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="w-full rounded-nav border border-etyme-rule bg-etyme-raised px-2.5 py-1.5 text-left text-[13px] text-etyme-ink hover:border-etyme-action-line"
            >
              + New conversation
            </button>
          )}
          <label className="sr-only" htmlFor="conversation-search">Search conversations</label>
          <input
            id="conversation-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-nav border border-etyme-rule bg-etyme-raised px-2.5 py-1.5 text-[13px] text-etyme-ink placeholder:text-etyme-faint focus-visible:outline-none focus-visible:border-etyme-action"
          />
        </div>
      </RailSlot>

      {pinned.length > 0 && (
        <RailSlot name="pinned">
          <ul className="space-y-0.5">
            {pinned.map((question) => (
              <li key={question}>
                {/* One press sends the question, as if it were typed. */}
                <button
                  type="button"
                  onClick={() => router.push(askHref(question) as Route)}
                  className="flex w-full items-center gap-2 rounded-nav px-2.5 py-1.5 text-left text-[13px] text-etyme-ink hover:bg-etyme-sunk"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-action" />
                  <span className="truncate">{question}</span>
                </button>
              </li>
            ))}
          </ul>
        </RailSlot>
      )}

      {!loading && (
        <RailSlot name="conversations">
          {error ? (
            <p className="px-2.5 py-1.5 text-[12.5px] text-etyme-muted">
              {error} <button type="button" className="text-etyme-action-press underline-offset-2 hover:underline" onClick={() => { void fetchConversations() }}>Try again</button>
            </p>
          ) : filtered.length === 0 ? (
            // The sentence is the reader's own (conversationsFraming).
            <p className="px-2.5 py-1.5 text-[12.5px] leading-snug text-etyme-muted">
              {q ? 'No conversation matches that.' : words.empty}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={!askOpen && activeConvo?.id === c.id ? 'page' : undefined}
                    onClick={() => router.push(`/dashboard/conversations?open=${c.id}` as Route)}
                    className={`block w-full rounded-nav px-2.5 py-1.5 text-left transition-colors ${
                      !askOpen && activeConvo?.id === c.id ? 'bg-etyme-sunk text-etyme-ink' : 'text-etyme-muted hover:bg-etyme-sunk'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] flex-1">{c.title}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-etyme-faint">{timeAgo(c.updatedAt)}</span>
                    </span>
                    <span className="block truncate text-[11px] text-etyme-faint">
                      {c.otherCompany ? `with ${c.otherCompany.name}` : 'own people'} · {topicLabel(c.topic)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </RailSlot>
      )}

      {/* A thread's heading, the reader's own (a firm's, somebody on a
          firm's bench, or somebody with no company), over the thread only:
          Ask Etyme is a chat and nothing else. */}
      {threadOpen && (
        <PageHead
          eyebrow={eyebrow}
          title="Conversations"
          subtitle={!session.loading ? words.subtitle : undefined}
        />
      )}

      <div
        className={`flex flex-col overflow-hidden bg-white ${showAsk
          ? '-mx-4 -mb-6 h-[calc(100dvh-150px)] min-h-[420px] border-y border-etyme-rule sm:mx-0 sm:mb-0 sm:rounded-xl sm:border md:h-[calc(100vh-130px)] md:min-h-[520px]'
          : 'border border-etyme-rule rounded-xl h-[calc(100vh-220px)] min-h-[460px]'}`}
      >
        {showAsk ? (
          <AskEtyme />
        ) : !activeConvo ? (
          <div className="flex-1 flex items-center justify-center">
            {openRefused
              ? <ErrorState says={openRefused} />
              : <EmptyState compact says="Opening the conversation" detail="It opens here in a moment." />}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-etyme-rule bg-etyme-surface/50 flex items-center gap-3">
              {/* Back to Ask Etyme: the list is in the column (the menu sheet on a phone). */}
              <button
                type="button"
                aria-label="Back to Ask Etyme"
                onClick={() => { setActiveConvo(null); router.replace(ASK_ETYME_HREF as Route) }}
                className="text-etyme-muted hover:text-etyme-ink"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-etyme-ink truncate">
                  {activeConvo.title}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {activeConvo.otherCompany
                    ? <Chip tone="action">with {activeConvo.otherCompany.name}</Chip>
                    : <Chip tone="passive">own people</Chip>}
                  <span className="text-[10px] text-etyme-faint">{topicLabel(activeConvo.topic)}</span>
                  {activeConvo.participants.length > 0 && (
                    <span className="text-[10px] text-etyme-faint">
                      {activeConvo.participants.length} on the thread
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messagesLoading && <LoadingState compact says="Loading messages…" />}

              {!messagesLoading && messages.length === 0 && (
                <EmptyState compact says="No messages yet." />
              )}

              {messages.map((msg) => {
                const isSystem = msg.authorId === 'SYSTEM' || msg.type === 'SYSTEM'

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="px-3 py-1.5 bg-etyme-canvas rounded-full">
                        <p className="text-[11px] text-etyme-faint italic">{msg.body}</p>
                        <p className="text-[9px] text-etyme-faint text-center mt-0.5">{messageTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className="flex gap-3">
                    {/* Avatar */}
                    <div className="w-7 h-7 rounded-full bg-etyme-action/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-semibold text-etyme-action">
                        {(msg.authorName ?? '?')[0].toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-medium text-etyme-ink">
                          {msg.authorName ?? 'Somebody'}
                        </span>
                        {activeConvo.otherCompany && msg.authorCompany && (
                          <span className="text-[11px] text-etyme-muted">· {msg.authorCompany}</span>
                        )}
                        {msg.type !== 'TEXT' && (
                          <span className="chip chip--passive text-[8px]">{msg.type.replace(/_/g, ' ')}</span>
                        )}
                        <span className="text-[10px] text-etyme-faint tabular-nums">
                          {messageTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className={`text-[13px] text-etyme-ink leading-relaxed ${messageTypeClass(msg.type)}`}>
                        {msg.body}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose: one field, and under it who reads what is typed. */}
            <form onSubmit={handleSend} className="px-4 py-3 border-t border-etyme-rule bg-etyme-raised space-y-2">
              <Field
                label="Reply"
                help={activeConvo.otherCompany
                  ? `${activeConvo.otherCompany.name} sees this. Nobody else does.`
                  : 'Your own people only.'}
                error={sendError ?? undefined}
              >
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={newMessage}
                    onChange={(e) => { setNewMessage(e.target.value); if (sendError) setSendError(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder="Type a message…"
                    className="flex-1"
                  />
                  <SubmitButton pending={sending} pendingLabel="Sending…" disabled={!newMessage.trim()}>
                    Send
                  </SubmitButton>
                </div>
              </Field>
            </form>
          </>
        )}
      </div>

      {/* New conversation modal */}
      {showNew && words.mayStart && (
        <NewConversationModal
          isClient={company?.kind === 'CLIENT'}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setToast('Conversation started')
            fetchConversations().then(() => {
              if (id) router.replace(`/dashboard/conversations?open=${id}` as Route, { scroll: false })
            })
          }}
        />
      )}
    </>
  )
}
