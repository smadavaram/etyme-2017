import Link from 'next/link'
import { ASK_ETYME_HREF } from '@/lib/nav-table'

/**
 * Where the twin's page points to the conversation with it.
 *
 * The conversation is "Ask Etyme" now (founder, 2026-10-12): one chat,
 * pinned inside Conversations and first on the menu, rather than a panel
 * embedded in this page. So this is one line to it, and the chat itself
 * is conversation's (app/dashboard/conversations).
 */
export function TwinConversationSlot() {
  return (
    <p className="text-[13.5px] text-etyme-muted">
      <Link href={ASK_ETYME_HREF as any} className="font-medium text-etyme-action hover:underline">
        Ask Etyme about this program
      </Link>
      {' '}— what needs you, why the twin did something, how invoice receipts compare by supplier.
    </p>
  )
}
