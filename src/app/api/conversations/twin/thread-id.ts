/**
 * Which Ask Etyme conversation a request names, and how the list in the
 * left column reads (founder, 2026-11-03, "Conversations are kept and
 * listed"; built into the column 2026-11-08, "One app, two tabs").
 *
 * Pure, so the route and the screen read one rule. The record itself is
 * lib/ask-etyme-thread's: a conversation named here is still read only
 * inside the seat's own, and another person's is refused and logged there.
 */

/** The address's word for the open conversation: /dashboard/conversations/etyme?thread=<id>. */
export const THREAD_PARAM = 'thread'

/** What a conversation with no question in it yet is called in the list. */
export const UNTITLED = 'New conversation'

/** Said when a link names a conversation that is not the reader's own. */
export const NOT_YOUR_CONVERSATION =
  'That conversation is not one of yours, so it is not shown. Your own conversations are in the list on the left.'

/** Said under the search when no title matches. */
export const NO_TITLE_MATCHES = 'No conversation of yours matches that.'

/**
 * The conversation a request names, or null where it names none. Only an
 * id's own characters are taken; anything else is read as none, never
 * passed on to the record.
 */
export function threadIdOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null
}

/** One conversation as the column lists it. */
export interface ListedConversation {
  id: string
  title: string | null
  lastTurnAt: string | null
  createdAt: string
}

/** A conversation's title in the list: its first question, or "New conversation" before one is asked. */
export function titleIn(c: Pick<ListedConversation, 'title'>): string {
  const t = (c.title ?? '').replace(/\s+/g, ' ').trim()
  return t || UNTITLED
}

/**
 * The column's list: the seat's own conversations as the record orders
 * them (newest first, an empty one just made leading), narrowed by a
 * search over their titles, each marked where it is the one open. Where no
 * conversation is named, the open one is the newest, as the route reads it.
 */
export function conversationList(
  threads: readonly ListedConversation[],
  opts: { query?: string; openId?: string | null } = {},
): Array<ListedConversation & { shownTitle: string; open: boolean }> {
  const q = (opts.query ?? '').trim().toLowerCase()
  const openId = opts.openId ?? threads[0]?.id ?? null
  return threads
    .map((c) => ({ ...c, shownTitle: titleIn(c), open: c.id === openId }))
    .filter((c) => !q || c.shownTitle.toLowerCase().includes(q))
}

/** The address that opens one conversation, or the newest where none is named. */
export function conversationHref(base: string, id: string | null): string {
  return id ? `${base}?${THREAD_PARAM}=${encodeURIComponent(id)}` : base
}
