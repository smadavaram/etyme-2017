/**
 * Is the company somebody is signed in at a made-up one?
 *
 * The founder, 2026-09-28: show "Demo" in front of the company name
 * whenever the signed-in company is seeded, so nobody mistakes Northbend
 * Athletic for a customer. `DemoBanner` already says so for a visitor's
 * own sandbox, and it is silent on the seeded world, because the world is
 * `isDemo: false` on purpose (seed-world.ts: it must survive the reaper
 * and the reset button). So the world needed its own answer.
 *
 * ── Which signal, and why the other two were refused ─────────────────
 *
 * **The addresses of the people seated there.** A company is a demo when
 * it has at least one seat and every seat is held at a domain nobody can
 * register (`.example`, `.invalid`, `.local` — RFC 2606 and 6761, the
 * suffixes the signed demo cookie already insists on in
 * lib/demo-session). A real tenant is formed by a real person signing in
 * through a real mail provider, so it always holds at least one seat at
 * an address that is not reserved, and that one seat is enough to say
 * "real" forever.
 *
 * - **Not the slug.** `world-` marks the seeded world, but a real firm
 *   named World Wide Technology slugifies to `world-wide-technology`, and
 *   `slugFromDomain` makes `world-bank` out of `world-bank.org`. A real
 *   tenant must never read Demo, so a prefix anybody can be born with is
 *   not a signal.
 * - **Not `Company.domain` alone.** Every one of the seeded world's firms
 *   has a null domain — the reserved domain is on its people, not on its
 *   row — so the domain says nothing about exactly the companies this is
 *   for. Where a domain IS set it is used: a registrable one is a real
 *   tenant and wins over everything, a reserved one is a demo.
 *
 * **`isDemo` still counts.** It is the explicit marker on a visitor's own
 * sandbox, and that sandbox is seated at the visitor's real address, so
 * the seat rule alone would call it real. The one thing that outranks it
 * is a registrable, verified domain: a tenant that proved it owns a real
 * domain is real whatever a flag says.
 *
 * The failure direction is chosen. A seeded company somebody real has
 * been seated at reads as real — a missing chip, which is harmless. The
 * other direction, Demo in front of a paying client's name, is not
 * reachable from any input here.
 */

import { reservedAddress, RESERVED_SUFFIXES } from '@/lib/demo-session'

export interface DemoFacts {
  /** The explicit marker on a visitor's own sandbox. */
  isDemo: boolean
  /** The tenant's domain, if it has one. */
  domain: string | null
  /** True when the domain came from an OAuth tenant. */
  domainVerified: boolean
  /** How many seats the company has, of anybody. */
  seats: number
  /** How many of them are held at an address somebody could register. */
  realSeats: number
}

/** Whether a domain is one nobody can register. */
export function reservedDomain(domain: string | null | undefined): boolean {
  if (!domain) return false
  return reservedAddress(`x@${domain.trim().toLowerCase()}`)
}

export function isDemoCompany(f: DemoFacts): boolean {
  // A verified, registrable domain is a real tenant. Nothing overrides it.
  if (f.domain && f.domainVerified && !reservedDomain(f.domain)) return false
  if (f.isDemo) return true
  if (reservedDomain(f.domain)) return true
  // Somebody real sits here. One is enough.
  if (f.realSeats > 0) return false
  // Nobody at all sits here: a shell somebody listed, which nobody is
  // signed in at. Not a demo on the evidence of an absence.
  if (f.seats === 0) return false
  return true
}

/**
 * The same question, asked of the database for one company.
 *
 * Two indexed counts on `Context.companyId`. Never throws: a failed read
 * is "not a demo", which draws the shell as it was yesterday rather than
 * printing Demo in front of somebody's real name.
 */
export async function demoCompanyFor(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false
  try {
    const { prisma } = await import('@/lib/db')
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isDemo: true, domain: true, domainVerified: true },
    })
    if (!company) return false
    const [seats, realSeats] = await Promise.all([
      prisma.context.count({ where: { companyId } }),
      prisma.context.count({
        where: {
          companyId,
          NOT: {
            OR: RESERVED_SUFFIXES.map((s) => ({ person: { primaryEmail: { endsWith: s, mode: 'insensitive' as const } } })),
          },
        },
      }),
    ])
    return isDemoCompany({ ...company, seats, realSeats })
  } catch {
    return false
  }
}
