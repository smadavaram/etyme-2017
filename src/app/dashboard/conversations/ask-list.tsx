'use client'

import { conversationList, NO_TITLE_MATCHES, type ListedConversation } from '@/app/api/conversations/twin/thread-id'

/**
 * The seat's own Ask Etyme conversations, newest first, each titled by its
 * first question and the open one marked (founder, 2026-11-03,
 * "Conversations are kept and listed"). Drawn in the left column's
 * "conversations" slot, and on a phone as its own screen behind the back
 * arrow, from one list so the two never disagree.
 */
export function AskConversationList({ threads, query, openId, onOpen }: {
  threads: readonly ListedConversation[]
  query: string
  /** The conversation open, as the chat read it; the newest where none is named. */
  openId: string | null
  onOpen: (id: string) => void
}) {
  const shown = conversationList(threads, { query, openId })
  if (threads.length === 0) return null
  if (shown.length === 0) {
    return <p className="px-2.5 py-1.5 text-[12.5px] leading-snug text-etyme-muted">{NO_TITLE_MATCHES}</p>
  }
  return (
    <ul className="space-y-0.5" aria-label="Your Ask Etyme conversations">
      {shown.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-current={c.open ? 'page' : undefined}
            onClick={() => onOpen(c.id)}
            className={`block w-full truncate rounded-nav px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              c.open ? 'bg-etyme-sunk text-etyme-ink' : 'text-etyme-muted hover:bg-etyme-sunk'
            }`}
          >
            {c.shownTitle}
          </button>
        </li>
      ))}
    </ul>
  )
}
