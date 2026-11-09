'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  HAT_COOKIE, ASK_ETYME_HREF, readHatCookie, hatCookieValue, hatForPath, offersYouHat,
  type Hat, type HatLine,
} from '@/lib/nav-table'

/**
 * Session context — the caller's person, active company, and permissions,
 * fetched once from /api/me and shared by every client component.
 *
 * Before this existed, the shell guessed the company type from the URL
 * path: four routes were "client routes" and everything else rendered the
 * vendor sidebar. A client clicking "Placements" got the vendor nav back,
 * so they could not stay inside their own application.
 *
 * The active context is the authority on company kind — the same rule the
 * API uses (CLAUDE.md: "The OAuth tenant is the authority").
 */

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

export interface SessionCompany {
  id: string
  name: string
  slug: string
  kind: CompanyKind
}

/** Who the signed-in person is here. A consultant on a vendor's bench has
 *  a company but is not of it — the type says so, the company does not. */
export type ContextType = 'CONSULTANT' | 'EMPLOYEE' | 'PARTNER' | 'CLIENT_CONTACT' | 'PLATFORM_ADMIN'

/**
 * A desk somebody else's program office holds in a client's program.
 *
 * Answered on the server, in the dashboard layout, for the same reason
 * `isWorker` is: it is a database read (`seatFor` in lib/program-seat)
 * and the shell draws a menu before any fetch has come back. Null for
 * everybody who is not a program office, which is almost everybody.
 */
export interface SessionSeat {
  /** The client whose program this seat is in. */
  clientId: string
  clientName: string
  /** The client's own role the office holds — its permissions are the client's. */
  roleName: string | null
  permissions: readonly string[]
}

export interface SessionState {
  contextType: ContextType | null
  person: { id: string | null; name: string; email: string } | null
  company: SessionCompany | null
  roleName: string | null
  permissions: readonly string[]
  /**
   * Whether this person is somebody the work is about, as well as
   * somebody's staff.
   *
   * Not read off `contextType`. Every staffer of every company holds an
   * EMPLOYEE context — a client's own bookkeeper has one — so employment
   * alone cannot tell an avionics engineer from an accounts payable
   * clerk. The answer is `ownPage()` in lib/consultant-portfolio, which
   * keys on the work itself: a placement in their name, a submission
   * that put them forward, a contract that pays them.
   *
   * It comes from the server layout rather than /api/me because the
   * question is a database read and the shell renders before any fetch.
   */
  isWorker: boolean
  /**
   * The client's desk this firm is acting at, if any. A program office
   * with a live seat reads the client's book (`lib/money/seated-books`),
   * so it must read the client's menu too — it was being shown Demand
   * and Supply over somebody else's workforce.
   */
  seat: SessionSeat | null
  /**
   * The company this person is signed in at is a made-up one — the
   * seeded world or a visitor's own sandbox. The shell says "Demo" in
   * front of its name. Answered on the server (`demoCompanyFor` in
   * lib/demo-company) for the reason `isWorker` is: a chip that appears
   * one fetch late is a name that changes under the reader.
   */
  isDemo: boolean
  /**
   * The page where this person agrees their own terms, while a placement
   * of theirs reads "Awarded, terms pending" (`lib/your-terms`). Null
   * otherwise. Read on the server for the reason `isWorker` is.
   */
  termsHref: string | null
  /**
   * This person has a live line to file a week on: in progress, or ended
   * inside the final-week grace (`rungsToFile` in lib/consultant-portfolio,
   * the same answer the filing door gives). The + button offers "New
   * timesheet" only then (sign-up walk, round six, problem 7: Karthik
   * Menon was offered it on a line that ended Aug 31). Read on the server
   * for the reason `isWorker` is.
   */
  filesAWeek: boolean
  /**
   * This person earns commission at the seat's firm (a commission row
   * names them), read on the server by the layout. The menu offers "Your
   * commissions" (lib/nav-table, `earnsCommission`).
   */
  earnsCommission: boolean
  /**
   * The region this seat reads, where it sits on a REGION unit
   * (lib/region-scope), or null. Read on the server for the reason `seat`
   * is: the menu is drawn before any fetch, and a region seat's menu is
   * its region alone.
   */
  region: string | null
  /**
   * The hat this person has on (founder, 2026-11-03, "One person, two
   * hats"): the firm's, or their own as a worker. Already corrected for
   * the page being read (`hatForPath`), so a link into a worker's own
   * page reads the You hat. Optional so a fixture describing a seat need
   * not name one; absent reads as the default (`hatOf`).
   */
  hat?: Hat
  /** Every live seat the person holds, for the account menu's list of hats. */
  seats?: readonly SessionSeatLine[]
  /** The seat in use, among `seats`. */
  activeContextId?: string | null
  loading: boolean
  error: string | null
}

/** One live seat the person holds, as /api/me lists it. */
export interface SessionSeatLine {
  contextId: string
  type: string | null
  companyName: string | null
  /**
   * The kind of company the seat is at. The account menu needs it: a seat
   * at a one-person firm is the person's own firm, and she wears one hat.
   */
  companyKind?: string | null
  roleName: string | null
}

/** The seats /api/me lists, as the account menu reads them. */
export function seatLinesFrom(contexts: unknown): SessionSeatLine[] {
  if (!Array.isArray(contexts)) return []
  return contexts.map((c: any) => ({
    contextId: String(c.id),
    type: c.type ?? null,
    companyName: c.company?.name ?? null,
    companyKind: c.company?.kind ?? null,
    roleName: c.role?.name ?? null,
  }))
}

const EMPTY: SessionState = {
  person: null,
  company: null,
  contextType: null,
  roleName: null,
  permissions: [],
  isWorker: false,
  seat: null,
  isDemo: false,
  termsHref: null,
  filesAWeek: false,
  earnsCommission: false,
  region: null,
  loading: true,
  error: null,
}

const SessionContext = createContext<SessionState>(EMPTY)

/** Switching hats: one click, remembered on this device. */
const SwitchHatContext = createContext<(line: HatLine) => void>(() => {})

/** Remember a hat, and a seat where the person holds more than one, on this device for a year. */
function rememberHat(value: string) {
  document.cookie = `${HAT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

/** The hat cookie as this browser holds it. */
function hatCookieHere(): string | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${HAT_COOKIE}=`))
  return hit ? hit.slice(HAT_COOKIE.length + 1) : null
}

/** Company kinds that are not VENDOR still fall back to vendor-shaped nav. */
function normalizeKind(kind: string | undefined): CompanyKind {
  if (kind === 'CLIENT' || kind === 'MSP' || kind === 'GSI' || kind === 'CONSULTANT_CORP') return kind
  // A consultant corp deliberately falls through to nothing special
  // elsewhere: it sells, so screens that branch on VENDOR treat it as
  // one — a company of one is a vendor with one person on the bench,
  // and inventing a fifth navigation for them would be a shell nobody
  // asked for.
  return 'VENDOR'
}

/** What a seat holds by grant, read on the server by the dashboard layout. */
export interface SessionGrants {
  contextId: string
  permissions: readonly string[]
}

/**
 * A seat's role permissions with its grants, the menu's answer and the one
 * caller check's agreeing. Grants for another seat are not this one's.
 * Pure.
 */
export function withGrants(
  rolePermissions: readonly string[],
  activeContextId: string | null,
  granted: SessionGrants | null
): string[] {
  const out = [...rolePermissions]
  if (!granted || !activeContextId || granted.contextId !== activeContextId) return out
  for (const p of granted.permissions) if (!out.includes(p)) out.push(p)
  return out
}

/**
 * The permissions the menu filters by: /api/me's own answer for the active
 * seat (`activeContext.permissions`, the role's with the Owner's grants at
 * that seat, the list the one caller check asks `hasPermission` over), so
 * the menu and the routes read one list. Where /api/me gives no list (an
 * older answer), the role's permissions with the layout's grants. Pure.
 */
export function seatPermissions(
  active: { id?: string | null; permissions?: unknown; menuPermissions?: unknown; role?: { permissions?: readonly string[] | null } | null } | null,
  granted: SessionGrants | null,
): string[] {
  // A team grant of jobs or submissions opens their routes narrowed, so the
  // menu offers their links where /api/me says so (`menuPermissions` in
  // lib/permission-grants); else what hasPermission is asked over.
  for (const list of [active?.menuPermissions, active?.permissions]) {
    if (Array.isArray(list) && list.every((p) => typeof p === 'string')) return [...new Set(list as string[])]
  }
  return withGrants(active?.role?.permissions ?? [], active?.id ?? null, granted)
}

export function SessionProvider({
  children,
  worker = false,
  seat = null,
  demo = false,
  termsHref = null,
  filesAWeek = false,
  earnsCommission = false,
  region = null,
  hat = null,
  granted = null,
}: {
  children: ReactNode
  /**
   * The permissions the Owner granted this seat beyond its role
   * (2026-11-08), read on the server, with the seat they belong to: merged
   * into the menu's permissions only where /api/me answers that same seat.
   */
  granted?: SessionGrants | null
  /** The hat remembered on this device, read from the cookie on the server, so the first paint is the right menu. */
  hat?: Hat | null
  /**
   * Answered on the server, before anything renders, because the shell
   * decides whether to offer this person their own section and a menu
   * that appears one fetch late is a menu that flickers.
   */
  worker?: boolean
  /** The client desk this firm holds, read on the server for the same reason. */
  seat?: SessionSeat | null
  /** The company is a made-up one. Read on the server, never from /api/me. */
  demo?: boolean
  /** Where this person's own terms wait on them, if anywhere. Read on the server. */
  termsHref?: string | null
  /** A live line to file a week on. Read on the server. */
  filesAWeek?: boolean
  /** This person earns commission at the seat's firm, read on the server. */
  earnsCommission?: boolean
  /** The region this seat reads, if it sits on a REGION unit. Read on the server. */
  region?: string | null
}) {
  const [state, setState] = useState<SessionState>({ ...EMPTY, isWorker: worker, seat, isDemo: demo, termsHref, filesAWeek, earnsCommission, region })
  const [storedHat, setStoredHat] = useState<Hat | null>(hat)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // The seat chosen in the account menu, named the way every route
        // reads it, so /api/me and the pages agree on which firm this is.
        const chosen = readHatCookie(hatCookieHere()).contextId
        const res = await fetch('/api/me', chosen ? { headers: { 'x-context-id': chosen } } : undefined)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error?.message ?? `HTTP ${res.status}`)
        }

        const body = await res.json()
        if (cancelled) return

        const active = body.data?.activeContext ?? null
        const company = active?.company ?? null
        const contextType = (active?.type ?? null) as ContextType | null

        setState({
          person: body.data?.person
            ? {
                id: body.data.person.id ?? null,
                name: body.data.person.name ?? '',
                email: body.data.person.email ?? '',
              }
            : null,
          contextType,
          company: company
            ? {
                id: company.id,
                name: company.name,
                slug: company.slug,
                kind: normalizeKind(company.kind),
              }
            : null,
          roleName: active?.role?.name ?? null,
          permissions: seatPermissions(active, granted),
          isWorker: worker,
          seat,
          isDemo: demo,
          termsHref,
          filesAWeek,
          earnsCommission,
          region,
          seats: seatLinesFrom(body.data?.contexts),
          activeContextId: active?.id ?? null,
          loading: false,
          error: null,
        })
      } catch (err: any) {
        if (cancelled) return
        // A failed session read must not blank the app — fall back to the
        // vendor shell and let the individual pages surface their own errors.
        setState({ ...EMPTY, isWorker: worker, seat, isDemo: demo, termsHref, filesAWeek, earnsCommission, region, loading: false, error: err.message })
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // `seat` is deliberately not a dependency: it arrives from the
    // server layout and a fresh object each render would re-fetch the
    // session forever. A seat granted or revoked mid-session is picked
    // up on the next page load, which is how the client granted it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker, demo, termsHref, earnsCommission])

  // ── The hat, corrected for the page being read ─────────────────────
  // Read off the same facts the menu is drawn from, once the session has
  // answered; until then the hat remembered on the device.
  const isConsultant = state.contextType === 'CONSULTANT'
  const kind = state.company?.kind ?? null
  const facts = {
    worker: !isConsultant && state.isWorker,
    permissions: state.seat ? state.seat.permissions : state.permissions,
    seatedAtClient: state.seat?.clientName ?? null,
    region: state.region,
    termsHref: state.termsHref,
    earnsCommission: state.earnsCommission,
    hat: storedHat,
  }
  const menuKind = state.seat && !isConsultant && kind ? 'CLIENT' : kind
  const effective: Hat = state.loading
    ? (storedHat ?? 'firm')
    : hatForPath(menuKind, isConsultant, facts, pathname)

  // A page that belongs to one hat moves the person into it, and the
  // move is remembered, so Ask Etyme greets the hat they are in.
  useEffect(() => {
    if (state.loading || !offersYouHat(menuKind, isConsultant, facts) || effective === storedHat) return
    const pinned = readHatCookie(hatCookieHere()).contextId
    rememberHat(hatCookieValue(effective, pinned))
    setStoredHat(effective)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, storedHat, state.loading])

  const switchHat = useCallback((line: HatLine) => {
    void (async () => {
      const firmSeats = (state.seats ?? []).filter((x) => x.type !== 'CONSULTANT').length
      const changesSeat = Boolean(line.contextId && line.contextId !== state.activeContextId)
      // A seat is pinned only where there is a choice of seat to make.
      const pin = changesSeat || firmSeats > 1 ? line.contextId : null
      if (changesSeat) {
        // The switch is logged by the route that has always logged one.
        await fetch('/api/me/context', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contextId: line.contextId }),
        }).catch(() => null)
      }
      rememberHat(hatCookieValue(line.hat, pin))
      // A whole page, so the shell, the mark and Ask Etyme's greeting are
      // all read again for the hat now worn.
      window.location.assign(ASK_ETYME_HREF)
    })()
  }, [state.seats, state.activeContextId])

  return (
    <SessionContext.Provider value={{ ...state, hat: effective }}>
      <SwitchHatContext.Provider value={switchHat}>{children}</SwitchHatContext.Provider>
    </SessionContext.Provider>
  )
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}

/** Put on another hat: a firm seat, or the person's own. */
export function useSwitchHat(): (line: HatLine) => void {
  return useContext(SwitchHatContext)
}

/**
 * Convenience: the active company kind, or null while it is not known.
 * It returned VENDOR while loading, which drew a supplier's words over a
 * client's page for as long as the session took (sign-up walk, round
 * three). A caller decides what to draw for an unknown reader.
 */
export function useCompanyKind(): CompanyKind | null {
  const { company } = useSession()
  return company?.kind ?? null
}
