'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { EtymeMark } from '@/components/logo'

/**
 * Where the twin's page used to draw a chat panel. The founder moved it
 * on 2026-10-12: it is "Ask Etyme" now, a conversation pinned at the top
 * of Conversations, and it looks like a chat. The twin's page keeps the
 * ledger and the editors; this is the door from it to the chat.
 *
 * The page finds this file through its slot (`conversation-slot.tsx`,
 * the architect's), so the export keeps its name; the props it passes
 * are accepted and not needed, because Ask Etyme answers for the seat
 * that is signed in.
 */
export function TwinConversation(_props: { companyId?: string | null }) {
  return (
    <Link
      href={'/dashboard/conversations/etyme' as Route}
      className="flex items-center gap-3 rounded-panel border border-etyme-rule bg-etyme-surface px-4 py-3 hover:border-etyme-action-line"
    >
      <EtymeMark size={22} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-etyme-ink">Ask Etyme</span>
        <span className="block text-[13px] text-etyme-muted">Ask what needs you, who is near the time limit, or what each supplier billed. It is in Conversations.</span>
      </span>
      <span aria-hidden="true" className="text-etyme-action-press">→</span>
    </Link>
  )
}
