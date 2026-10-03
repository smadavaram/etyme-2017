/**
 * Saying when, to somebody, in their own day.
 *
 * Screens render in the browser's locale and are fine. Anything the
 * server composes — a notification body, an email, a reminder — reached
 * for `.toISOString().slice(0, 10)`, which is UTC. An interview at 9am
 * Pacific therefore told a reader in London the wrong day, every time the
 * boundary crossed, and the error is invisible to whoever wrote it
 * because their own machine agrees with them.
 *
 * `Person.timezone` is an IANA name and is often null, because nobody has
 * been asked yet. Null is not an error: UTC is used and the text says so,
 * which is honest and lets somebody notice the setting exists.
 */

/** A day, in somebody's own reckoning of it. */
export function dayFor(at: Date, timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at)
  } catch {
    // An unknown zone — a typo, or a name a runtime does not carry.
    // Falling back beats throwing inside a notification nobody sees fail.
    return at.toISOString().slice(0, 10)
  }
}

/**
 * A time somebody can act on, with the zone named.
 *
 * The zone is written out deliberately. "Thursday 09:00" is wrong for
 * half the people who read it and looks right to all of them; "Thursday
 * 09:00 PST" is checkable.
 */
export function momentFor(at: Date, timezone: string | null | undefined): string {
  const zone = timezone || 'UTC'
  try {
    // American English: "Tue, Oct 6, 9:00 AM PDT". It read "Tue 6 Oct
    // 09:00 GMT-7" in en-GB, which is British and names an offset where a
    // US reader expects a zone (conversation, 2026-10-03).
    const when = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(at)
    const short =
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value ?? zone
    // A US zone has a name a reader knows (PDT, EST). Outside the US the
    // runtime gives only an offset, so the place is named beside it.
    const label = /^GMT|^UTC/.test(short) && zone !== 'UTC'
      ? `${short} (${zone.split('/').pop()!.replace(/_/g, ' ')} time)`
      : short
    return `${when} ${label}`
  } catch {
    return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  }
}

/** Whether we actually know, so a caller can offer to ask. */
export function knowsWhere(timezone: string | null | undefined): boolean {
  return Boolean(timezone && timezone.trim())
}
