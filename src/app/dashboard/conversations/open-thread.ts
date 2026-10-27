import { readJson } from '@/lib/read-response'

/**
 * Opening a thread from a link (`?open=<id>`): the thread, or the route's
 * own sentence for why this seat may not open it.
 *
 * The release walk of 2026-10-27: a regional manager's link to a thread
 * about a plant outside her region showed "Select a conversation", as if
 * nothing had been asked. The route had refused in a sentence that names
 * her region and where to look instead; that sentence is what she reads.
 */
export type OpenedThread =
  | { ok: true; thread: Record<string, any> }
  | { ok: false; says: string }

export const NOT_OPENED = 'That conversation could not be opened just now. Try again in a minute.'

export async function openThread(id: string, get: (url: string) => Promise<Response> = (u) => fetch(u)): Promise<OpenedThread> {
  try {
    const res = await get(`/api/conversations/messages?conversationId=${encodeURIComponent(id)}&limit=1`)
    const body = await readJson(res)
    const thread = body?.data?.thread
    return thread ? { ok: true, thread } : { ok: false, says: 'That conversation is not here.' }
  } catch (err) {
    const says = err instanceof Error && err.message ? err.message : NOT_OPENED
    return { ok: false, says }
  }
}
