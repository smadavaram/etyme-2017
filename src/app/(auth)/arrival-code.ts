/**
 * The referral code on the link a person arrived by (`?ref=`), kept in the
 * browser from the first page until the company is made, because sign-up
 * has several pages and a confirmation email between. Sent once, on the
 * request that creates the company; the server decides whether it is a
 * real code (`rememberReferral`). Nothing here reads or writes the record.
 */
const KEY = 'etyme.arrival-code'
const SHAPE = /^[A-Za-z0-9_-]{2,64}$/

export function keepArrivalCode(): void {
  if (typeof window === 'undefined') return
  const ref = new URLSearchParams(window.location.search).get('ref')
  if (ref && SHAPE.test(ref)) {
    try { window.localStorage.setItem(KEY, ref.toLowerCase()) } catch { /* private mode: the link's own query still works */ }
  }
}

export function arrivalCode(): string | null {
  if (typeof window === 'undefined') return null
  const ref = new URLSearchParams(window.location.search).get('ref')
  if (ref && SHAPE.test(ref)) return ref.toLowerCase()
  try { return window.localStorage.getItem(KEY) } catch { return null }
}
