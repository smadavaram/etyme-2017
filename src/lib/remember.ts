/**
 * What this reader chose last time.
 *
 * A working surface has a handful of choices that are the reader's, not
 * the data's: which direction a list faces, which tab was open, how many
 * rows per page. Resetting those on every visit makes the product feel
 * like it has never met you — a client opens Submissions, sees the
 * outbound list they never use, and clicks the same toggle every single
 * morning.
 *
 * ── What belongs here and what does not ──────────────────────────────
 *
 * Only per-reader conveniences. Anything another person has to see, or
 * that a figure is computed from, belongs in the database — a preference
 * kept in a browser is invisible to everyone else, gone when they open
 * their laptop instead of their phone, and unreadable by us. This is for
 * things where forgetting costs a click and nothing more.
 *
 * ── Why every call is wrapped ────────────────────────────────────────
 *
 * `localStorage` is not merely empty in a private window — the accessor
 * itself throws in some browsers configured to block site data, and it
 * throws on write when a quota is full. An unguarded read takes the whole
 * page down, which is a spectacular price for remembering a tab. So every
 * path here fails quiet and returns the fallback.
 */

/** The narrow slice of Storage this needs. Injectable, so it is testable. */
export interface Remembers {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * The browser's store, or nothing.
 *
 * Server-rendered passes have no `window` at all, and this module is
 * imported by client components that render on both sides.
 */
function browserStore(): Remembers | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    // Site data blocked. Not an error worth surfacing.
    return null
  }
}

/**
 * Namespaced, so one page's choice cannot collide with another's, and so
 * everything Etyme stores can be recognised at a glance in devtools.
 */
function scoped(key: string): string {
  return `etyme.${key}`
}

/**
 * What they chose last time, or the fallback.
 *
 * `allowed` is required rather than optional on purpose: a value read
 * back from storage was last written by an older version of this code,
 * or by hand, and handing an unrecognised string to a component that
 * switches on it is how a remembered preference becomes a blank screen.
 * Anything not on the list is treated as never having been stored.
 */
export function recall<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
  store: Remembers | null = browserStore()
): T {
  if (!store) return fallback
  try {
    const found = store.getItem(scoped(key))
    if (found === null) return fallback
    return (allowed as readonly string[]).includes(found) ? (found as T) : fallback
  } catch {
    return fallback
  }
}

/** Keep it for next time. Silent on failure — it is a convenience. */
export function remember(
  key: string,
  value: string,
  store: Remembers | null = browserStore()
): void {
  if (!store) return
  try {
    store.setItem(scoped(key), value)
  } catch {
    // Quota, or site data blocked. The page carries on without it.
  }
}
