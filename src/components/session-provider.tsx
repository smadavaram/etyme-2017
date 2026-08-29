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

export interface SessionState {
  contextType: ContextType | null
  person: { id: string | null; name: string; email: string } | null
  company: SessionCompany | null
  roleName: string | null
  permissions: readonly string[]
  loading: boolean
  error: string | null
}

const EMPTY: SessionState = {
  person: null,
  company: null,
  contextType: null,
  roleName: null,
  permissions: [],
  loading: true,
  error: null,
}

const SessionContext = createContext<SessionState>(EMPTY)

/** Company kinds that are not VENDOR still fall back to vendor-shaped nav. */
function normaliseKind(kind: string | undefined): CompanyKind {
  if (kind === 'CLIENT' || kind === 'MSP' || kind === 'GSI' || kind === 'CONSULTANT_CORP') return kind
  // A consultant corp deliberately falls through to nothing special
  // elsewhere: it sells, so screens that branch on VENDOR treat it as
  // one — a company of one is a vendor with one person on the bench,
  // and inventing a fifth navigation for them would be a shell nobody
  // asked for.
  return 'VENDOR'
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(EMPTY)

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
                kind: normaliseKind(company.kind),
              }
            : null,
          roleName: active?.role?.name ?? null,
          permissions: active?.role?.permissions ?? [],
          loading: false,
          error: null,
        })
      } catch (err: any) {
        if (cancelled) return
        // A failed session read must not blank the app — fall back to the
        // vendor shell and let the individual pages surface their own errors.
        setState({ ...EMPTY, loading: false, error: err.message })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

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
