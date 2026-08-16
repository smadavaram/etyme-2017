'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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
 * Layout: two-panel — thread list (left) and message pane (right).
 */

// ── Types ────────────────────────────────────────────

interface Conversation {
  id: string
  topic: string
  topicId: string | null
  title: string
  participants: { personId: string; name: string }[]
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

function topicChipClass(topic: string): string {
  const map: Record<string, string> = {
    REQUIREMENT: 'chip--action',
    CONTRACT:    'chip--verified',
    SUBMISSION:  'chip--action',
    EXPENSE:     'chip--attention',
    DIRECT:      'chip--passive',
    GENERAL:     'chip--passive',
  }
  return map[topic] ?? 'chip--passive'
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

function NewConversationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    subject: '',
    channel: 'INTERNAL',
    body: '',
    recipientIds: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const ids = form.recipientIds.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      setError('At least one recipient is required.')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject,
          channel: form.channel,
          body: form.body,
          recipientIds: ids,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error?.message ?? 'Failed to create conversation')
        return
      }

      onCreated()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">New conversation</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Subject *</label>
            <input
              type="text"
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="e.g. SAP BRIM requirement discussion"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Channel *</label>
            <select
              required
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            >
              <option value="INTERNAL">Internal</option>
              <option value="EMAIL">Email</option>
              <option value="TEAMS">Teams</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Recipients *</label>
            <input
              type="text"
              required
              value={form.recipientIds}
              onChange={(e) => setForm({ ...form, recipientIds: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="person-id-1, person-id-2"
            />
            <p className="text-[10px] text-etyme-faint mt-1">(Enter person IDs, comma-separated)</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Message *</label>
            <textarea
              required
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action resize-none"
              placeholder="Type your message…"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting ? 'Creating…' : 'Start conversation'}
            </button>
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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Open the new-conversation modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true)
      router.replace('/dashboard/conversations', { scroll: false })
    }
  }, [searchParams, router])

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
      const res = await fetch('/api/conversations')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      setConversations(body.data?.conversations ?? [])
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
    if (activeConvo) {
      fetchMessages(activeConvo.id)
    }
  }, [activeConvo, fetchMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────
  async function handleSend() {
    if (!newMessage.trim() || !activeConvo || sending) return
    setSending(true)
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
      if (res.ok) {
        setNewMessage('')
        fetchMessages(activeConvo.id)
        fetchConversations() // update last message preview
      }
    } catch {
      // silent
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
  const topicOptions: { key: TopicFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'REQUIREMENT', label: 'Requirements' },
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

      {/* Head */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Today</p>
          <h1>Conversations</h1>
          <p>Messages between your team, clients, and candidates — linked to requirements, contracts, and submissions.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary mt-3 shrink-0">
          + New
        </button>
      </div>

      {/* Topic filters */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {topicOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setTopicFilter(opt.key)}
            className={`filter-tab ${
              topicFilter === opt.key ? 'filter-tab--active' : 'filter-tab--inactive'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-etyme-muted">Loading conversations…</div>
      )}

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
              {filtered.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-etyme-muted">No conversations yet.</p>
                  <p className="text-xs text-etyme-faint mt-1">
                    Conversations are auto-created when requirements, contracts, or submissions are added.
                  </p>
                </div>
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

                  <div className="flex items-center gap-2 ml-5">
                    <span className={`chip text-[9px] ${topicChipClass(c.topic)}`}>{c.topic}</span>
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
                <div className="text-center">
                  <p className="text-lg text-etyme-muted mb-1">Select a conversation</p>
                  <p className="text-sm text-etyme-faint">
                    Choose a thread from the list to view messages.
                  </p>
                </div>
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
                    <div className="flex items-center gap-2">
                      <span className={`chip text-[9px] ${topicChipClass(activeConvo.topic)}`}>
                        {activeConvo.topic}
                      </span>
                      <span className="text-[10px] text-etyme-faint">
                        {activeConvo.participants.length} participant{activeConvo.participants.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messagesLoading && (
                    <div className="text-center text-etyme-faint text-sm py-8">Loading messages…</div>
                  )}

                  {!messagesLoading && messages.length === 0 && (
                    <div className="text-center text-etyme-faint text-sm py-8">No messages yet.</div>
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
                              {msg.authorName ?? 'Unknown'}
                            </span>
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

                {/* Compose */}
                <div className="px-4 py-3 border-t border-etyme-rule bg-white">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder="Type a message…"
                      className="flex-1 px-3 py-2 text-[13px] border border-etyme-rule rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!newMessage.trim() || sending}
                      className="btn-primary px-4 py-2 text-[13px] disabled:opacity-50"
                    >
                      {sending ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* New conversation modal */}
      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setToast('Conversation created')
            fetchConversations()
          }}
        />
      )}
    </>
  )
}
