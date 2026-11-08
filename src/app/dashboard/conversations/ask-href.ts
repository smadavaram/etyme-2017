/** Ask Etyme's own address. */
export const ASK_ETYME_PATH = '/dashboard/conversations/etyme'

/**
 * Ask Etyme, opened with a question to send once: a pinned question in the
 * left column, or "Ask about this table" on Profitability (2026-11-08).
 */
export function askHref(question: string): string {
  return `${ASK_ETYME_PATH}?ask=${encodeURIComponent(question)}`
}

/** The question a link carries, trimmed and capped as the box caps it; null where there is none. */
export function askOf(raw: string | null | undefined): string | null {
  const q = (raw ?? '').trim().replace(/\s+/g, ' ')
  return q ? q.slice(0, 2000) : null
}
