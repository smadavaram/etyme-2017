'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/components/session-provider'
import { readJson } from '@/lib/read-response'
import { conversationsFraming } from '@/lib/page-framing'
import { usePageSection } from '@/components/page-section'
import {
  Chip, EmptyState, ErrorState, Field, FilterChips, FormMessage, Input, LoadingState, PageHead,
  SubmitButton, Textarea, type FilterOption,
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
 * Layout: two-panel — thread list (left) and message pane (right).
 */

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

type TopicFilter = 'all' | 'REQUIREMENT' | 'CONTRACT' | 'SUBMISSION' | 'EXPENSE' | 'DIRECT' | 'GENERAL'

// ── Helpers ──────────────────────────────────────────

function topicIcon(topic: string): string {
  const map: Record<string, string> = {
    REQUIREMENT: '◈',
    CONTRACT:    '▤',
    SUBMISSION:  '◇',
    DOCUMENT:    '▪',
    INVOICE:     '▧',
    EXPENSE:     '◫',
    DIRECT:      '◌',
    GENERAL:     '●',
  }
  return map[topic] ?? '●'
}

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
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all')
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

  // Open the new-conversation modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true)
      router.replace('/dashboard/conversations', { scroll: false })
    }
  }, [searchParams, router])

  // The bell lands here with ?open=<thread>. Open that one, from the list
  // if it is there, else by asking for it — a thread older than the first
  // page is still the one the bell rang about.
  const openId = searchParams.get('open')
  useEffect(() => {
    if (!openId || loading) return
    const inList = conversations.find((c) => c.id === openId)
    if (inList) {
      setActiveConvo(inList)
      return
    }
    fetch(`/api/conversations/messages?conversationId=${openId}&limit=1`)
      .then(readJson)
      .then((j) => {
        const t = j?.data?.thread
        if (!t) return
        const mine = t.company?.id === company?.id
        setActiveConvo({
          id: t.id, topic: t.topic, topicId: t.topicId, title: t.title ?? 'Conversation',
          participants: [], messageCount: 0, lastMessage: null,
          otherCompany: mine ? t.withCompany ?? null : t.company ?? null,
          side: t.withCompany ? (mine ? 'OPENED' : 'ANSWERS') : null,
          createdAt: '', updatedAt: '',
        })
      })
      .catch(() => {})
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

  // ── Filter conversations ──────────────────────────
  const filtered = conversations.filter((c) => {
    if (topicFilter !== 'all' && c.topic !== topicFilter) return false
    return true
  })

  // ── Topic filter options ──────────────────────────
  const topicOptions: FilterOption<TopicFilter>[] = [
    { key: 'all', label: 'All' },
    { key: 'REQUIREMENT', label: 'Job requests' },
    { key: 'CONTRACT', label: 'Contracts' },
    { key: 'SUBMISSION', label: 'Submissions' },
    { key: 'EXPENSE', label: 'Expenses' },
    { key: 'DIRECT', label: 'Direct' },
    { key: 'GENERAL', label: 'General' },
  ]

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] px-4 py-3 rounded-lg bg-etyme-verified text-white text-sm shadow-lg animate-slide-up">
          {toast}
        </div>
      )}

      {/* The heading the reader's own menu prints over this page: a firm
          files it under Today, a client under Workforce. It was typed as
          "Today" for everybody, and nothing until the company is known
          (sign-up walk, round three, item 11). "Job requests", the screen
          word for a requirement on every party's menu (CLAUDE.md, plain
          words; round three, item 10). No party list either: a client's
          messages are with its suppliers, a supplier's with its clients.
          A conversation belongs to a company, and the route refuses one
          to somebody who is not at one; a button that only refuses is
          not offered. */}
      <PageHead
        eyebrow={eyebrow}
        title="Conversations"
        subtitle={!session.loading ? words.subtitle : undefined}
        actions={!session.loading && words.mayStart ? (
          <button onClick={() => setShowNew(true)} className="btn-primary">
            + New
          </button>
        ) : undefined}
      />

      {/* Topic filters */}
      {words.topics && !session.loading && (
        <div className="mb-5">
          <FilterChips
            label="What the conversation is about"
            options={topicOptions.map((o) => ({
              ...o,
              count: o.key === 'all' ? conversations.length : conversations.filter((c) => c.topic === o.key).length,
            }))}
            value={topicFilter}
            onChange={setTopicFilter}
          />
        </div>
      )}

      {error && <div className="mb-4"><ErrorState says={error} action={{ label: 'Try again', onClick: () => { void fetchConversations() } }} /></div>}

      {loading && <LoadingState says="Opening conversations…" />}

      {/* Two-panel layout */}
      {!loading && (
        <div className="flex gap-0 border border-etyme-rule rounded-xl overflow-hidden bg-white" style={{ height: 'calc(100vh - 280px)', minHeight: '460px' }}>
          {/* Left: thread list */}
          <div className={`${activeConvo ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[340px] border-r border-etyme-rule flex-shrink-0`}>
            <div className="px-4 py-3 border-b border-etyme-rule bg-etyme-surface/50">
              <p className="text-[11px] text-etyme-faint tabular-nums">
                {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* The sentence is the reader's own: a firm's desk, somebody
                  on a firm's bench, or somebody with no company at all
                  (conversationsFraming). */}
              {filtered.length === 0 && (
                <EmptyState compact says="No conversations yet." detail={words.empty} />
              )}

              {filtered.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveConvo(c)}
                  className={`px-4 py-3 cursor-pointer transition-colors border-b border-etyme-rule/50 ${
                    activeConvo?.id === c.id
                      ? 'bg-etyme-action/[0.05] border-l-2 border-l-etyme-action'
                      : 'hover:bg-etyme-canvas/60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] opacity-50">{topicIcon(c.topic)}</span>
                    <p className="text-[13px] font-medium text-etyme-ink truncate flex-1">
                      {c.title}
                    </p>
                    <span className="text-[10px] text-etyme-faint tabular-nums shrink-0">
                      {timeAgo(c.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-5 flex-wrap">
                    {c.otherCompany
                      ? <Chip tone="action">with {c.otherCompany.name}</Chip>
                      : <Chip tone="passive">own people</Chip>}
                    <span className="text-[10px] text-etyme-faint">{topicLabel(c.topic)}</span>
                    <span className="text-[10px] text-etyme-faint tabular-nums">{c.messageCount} msgs</span>
                  </div>

                  {c.lastMessage && (
                    <p className="text-[11px] text-etyme-muted truncate mt-1 ml-5">
                      {c.lastMessage.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: message pane */}
          <div className={`${activeConvo ? 'flex' : 'hidden md:flex'} flex-col flex-1`}>
            {!activeConvo ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState compact says="Select a conversation" detail="Choose a thread from the list to view messages." />
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="px-4 py-3 border-b border-etyme-rule bg-etyme-surface/50 flex items-center gap-3">
                  {/* Back button on mobile */}
                  <button
                    onClick={() => setActiveConvo(null)}
                    className="md:hidden text-etyme-muted hover:text-etyme-ink"
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
        </div>
      )}

      {/* New conversation modal */}
      {showNew && words.mayStart && (
        <NewConversationModal
          isClient={company?.kind === 'CLIENT'}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setToast('Conversation started')
            fetchConversations().then(() => {
              if (id) router.replace(`/dashboard/conversations?open=${id}`, { scroll: false })
            })
          }}
        />
      )}
    </>
  )
}
