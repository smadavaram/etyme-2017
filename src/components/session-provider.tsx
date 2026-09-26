'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

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
  loading: boolean
  error: string | null
}

const EMPTY: SessionState = {
  person: null,
  company: null,
  contextType: null,
  roleName: null,
  permissions: [],
  isWorker: false,
  seat: null,
  loading: true,
  error: null,
}

const SessionContext = createContext<SessionState>(EMPTY)

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

export function SessionProvider({
  children,
  worker = false,
  seat = null,
}: {
  children: ReactNode
  /**
   * Answered on the server, before anything renders, because the shell
   * decides whether to offer this person their own section and a menu
   * that appears one fetch late is a menu that flickers.
   */
  worker?: boolean
  /** The client desk this firm holds, read on the server for the same reason. */
  seat?: SessionSeat | null
}) {
  const [state, setState] = useState<SessionState>({ ...EMPTY, isWorker: worker, seat })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/me')
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
          permissions: active?.role?.permissions ?? [],
          isWorker: worker,
          seat,
          loading: false,
          error: null,
        })
      } catch (err: any) {
        if (cancelled) return
        // A failed session read must not blank the app — fall back to the
        // vendor shell and let the individual pages surface their own errors.
        setState({ ...EMPTY, isWorker: worker, seat, loading: false, error: err.message })
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
  }, [worker])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}

/** Convenience: the active company kind, defaulting to VENDOR while loading. */
export function useCompanyKind(): CompanyKind {
  const { company } = useSession()
  return company?.kind ?? 'VENDOR'
}
