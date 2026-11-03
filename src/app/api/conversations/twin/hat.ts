import type { NextRequest } from 'next/server'
import { HAT_COOKIE, readHatCookie, offersYouHat, hatForPath, type Hat, type CompanyKind, type SeatFacts } from '@/lib/nav-table'

/**
 * Which hat Ask Etyme greets (founder, 2026-11-03, "One person, two hats,
 * switched in the account menu").
 *
 * The account menu lists a person's firm seats and, where the work makes
 * them a worker, "You". Ask Etyme, the mark and the chips follow the hat
 * they have on: in a firm hat, the firm's queue; in the You hat, their
 * own week, pay and papers, the worker's greeting that already exists
 * (./worker). One person never sees two numbers for one hat, because the
 * greeting and the mark ask this one function.
 *
 * The hat is a view, never a permission. The You hat reads only the
 * person's own doors (/api/me/…), which answer the person whatever hat
 * they wear; so a cookie that says "you" opens nothing the person could
 * not already open, and a cookie the person may not wear is read as the
 * firm's.
 */

/** What decides the hat, read once per request. */
export interface HatFacts {
  /** The seat reads Ask Etyme as a worker already: a consultant seat, or a firm seat with no desk (`isWorkerSeat`). */
  workerSeat: boolean
  /** The seat reads one region of a client's program; it has no You hat. */
  region: string | null
  /** The hat the cookie names, or null where there is none. */
  cookieHat: Hat | null
  /** The kind of menu the seat reads: a seat in a client's program reads the client's. */
  menuKind: CompanyKind | null
  /** The work makes this person a worker (`ownPage`). */
  worker: boolean
  /** The client whose program this seat sits in, if any. */
  seatedAtClient: string | null
  /** The permissions the seat's menu is filtered by. */
  permissions: readonly string[] | null
}

/** The seat facts the menu is drawn from, for the same person, so the greeting and the menu cannot disagree. */
export function seatFactsOf(f: HatFacts, hat?: Hat): SeatFacts {
  return { worker: f.worker, region: f.region, seatedAtClient: f.seatedAtClient, permissions: f.permissions, ...(hat ? { hat } : {}) }
}

/** Whether this person is offered the You hat at this seat: the account menu's own rule. */
export function youOffered(f: HatFacts): boolean {
  if (f.workerSeat) return false
  return offersYouHat(f.menuKind, false, seatFactsOf(f))
}

/**
 * Whether Ask Etyme greets this request as the person's own (the You hat).
 *
 * - A worker's seat is greeted as a worker, as it always was, whatever the
 *   cookie says: a seat with no desk has no firm queue to read.
 * - A region seat never is: it reads its region and nothing else.
 * - A firm seat is greeted as the person only where the cookie says "you"
 *   and the account menu offers them the You hat; anywhere else, the firm.
 */
export function greetsAsYou(f: HatFacts): boolean {
  if (f.region) return false
  if (f.workerSeat) return true
  return f.cookieHat === 'you' && youOffered(f)
}

/** The hat the cookie on this request names, or null. */
export function cookieHatOf(request: NextRequest): Hat | null {
  return readHatCookie(request.cookies?.get(HAT_COOKIE)?.value).hat
}

/**
 * Which hat a notice belongs to, by the page it opens: a page only the
 * You menu holds is the person's own; anything else is the firm's. So
 * "Since you last looked" in the You hat says only what is about the
 * person's own work, and the firm hat never says it a second time.
 */
export function noticeHat(f: HatFacts, href: string | null | undefined): Hat {
  if (!href || !youOffered(f)) return 'firm'
  const path = href.split('?')[0].split('#')[0]
  return hatForPath(f.menuKind, false, seatFactsOf(f, 'firm'), path)
}

/** The notices one hat says, the rest left unread for the other hat. */
export function noticesForHat<N extends { href: string }>(f: HatFacts, hat: Hat, shown: readonly N[]): N[] {
  if (!youOffered(f)) return [...shown]
  return shown.filter((n) => noticeHat(f, n.href) === hat)
}
