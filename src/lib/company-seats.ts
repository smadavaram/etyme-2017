/**
 * One reader of a company's seats (founder, 2026-11-12).
 *
 * Five screens counted a company's people from five queries, each with its
 * own filter: one kept invited seats and paused seats, one dropped seats
 * with no role, one kept consultants and the shared sample seat. So
 * Settings, Team structure, setup and Give access disagreed by one or two,
 * and nobody could say which number was right.
 *
 * This reads each live seat once, with what it is:
 *  - its state: INVITED (never signed in), WITH_ACCESS, or PAUSED;
 *  - its role, or none;
 *  - whether it is a person at the company or a consultant on its books;
 *  - whether it is the shared sample seat, which is nobody.
 *
 * A screen counts from it and says in words what it counted
 * ("3 with access · 3 invited"). The Owners reader (`seatsAt` in
 * lib/owner-asks) is left as it is on purpose: the last-Owner guard reads
 * it, and who counts as a live Owner is not a display question.
 *
 * Scoped to one company: the query names `companyId`, never a person, so a
 * person with seats at two companies is counted once at each and never
 * shows in the other's list.
 */
import { prisma } from '@/lib/db'
import { hasSignedIn } from '@/lib/access-grant'
import { stateOf } from '@/lib/account-lifecycle'
import { isSamplePerson } from '@/lib/sample-seat'

export type SeatState = 'INVITED' | 'WITH_ACCESS' | 'PAUSED'

export interface CompanySeat {
  contextId: string
  personId: string
  /** The person's name, never the company's: see `personNameFor`. */
  name: string
  email: string | null
  roleId: string | null
  roleName: string | null
  orgUnitId: string | null
  grantedAt: Date
  state: SeatState
  /** A person at the company. False for a consultant on its books. */
  isPerson: boolean
  /** The shared sample seat of the home page: nobody's. */
  isSample: boolean
}

export interface SeatCounts {
  withAccess: number
  invited: number
  paused: number
}

/** The name part of an address, in words: "sharath.m@x.com" → "Sharath M". */
export function nameFromAddress(email: string): string {
  const local = (email.split('@')[0] ?? email).replace(/[._+-]+/g, ' ').trim()
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : email
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A person's name, never the company's. Where the name typed for a person
 * is the company's own name (a seat named "Tapin" at Tapin), or nothing was
 * typed, the name part of their address stands in. Pure.
 */
export function personNameFor(typed: string | null | undefined, email: string | null | undefined, companyName: string | null | undefined): string {
  const t = String(typed ?? '').trim()
  const fallback = email ? nameFromAddress(email) : t
  if (!t) return fallback
  if (companyName && same(t, companyName)) return fallback || t
  return t
}

/** The state a seat reads as, from the lifecycle's own rule. Pure. */
export function seatStateOf(s: { revokedAt: Date | null; suspendedAt: Date | null; signedIn: boolean }): SeatState | null {
  const st = stateOf({ contextId: '', personId: '', roleId: null, rolePermissions: [], revokedAt: s.revokedAt, suspendedAt: s.suspendedAt, hasSignedIn: s.signedIn })
  if (st === 'REVOKED') return null
  if (st === 'SUSPENDED') return 'PAUSED'
  if (st === 'INVITED') return 'INVITED'
  return 'WITH_ACCESS'
}

/** Every live seat at one company, once each, oldest first. */
export async function readCompanySeats(companyId: string, db: Pick<typeof prisma, 'company' | 'context'> = prisma): Promise<CompanySeat[]> {
  const [company, rows] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.context.findMany({
      where: { companyId, revokedAt: null },
      select: {
        id: true, personId: true, type: true, roleId: true, orgUnitId: true, grantedAt: true,
        invitedAt: true, lastUsedAt: true, suspendedAt: true, revokedAt: true,
        role: { select: { name: true } },
        person: {
          select: {
            name: true, primaryEmail: true,
            // Any sign-in anywhere on Etyme, as Users & permissions reads it.
            credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { grantedAt: 'asc' },
      take: 5000,
    }),
  ])
  return seatsFrom(rows, company?.name ?? null)
}

type Row = {
  id: string; personId: string; type: string; roleId: string | null; orgUnitId: string | null; grantedAt: Date
  invitedAt: Date | null; lastUsedAt: Date | null; suspendedAt: Date | null; revokedAt: Date | null
  role: { name: string } | null
  person: { name: string; primaryEmail: string | null; credentials: { id: string }[] }
}

/** The rows as seats. Pure, so the counting rule is tested without a database. */
export function seatsFrom(rows: readonly Row[], companyName: string | null): CompanySeat[] {
  const out: CompanySeat[] = []
  for (const r of rows) {
    const state = seatStateOf({
      revokedAt: r.revokedAt, suspendedAt: r.suspendedAt,
      signedIn: hasSignedIn({ invitedAt: r.invitedAt, lastUsedAt: r.lastUsedAt, everSignedIn: r.person.credentials.length > 0 }),
    })
    if (!state) continue
    out.push({
      contextId: r.id,
      personId: r.personId,
      name: personNameFor(r.person.name, r.person.primaryEmail, companyName),
      email: r.person.primaryEmail,
      roleId: r.roleId,
      roleName: r.role?.name ?? null,
      orgUnitId: r.orgUnitId,
      grantedAt: r.grantedAt,
      state,
      isPerson: r.type !== 'CONSULTANT',
      isSample: isSamplePerson(r.person.primaryEmail),
    })
  }
  return out
}

/** The company's own people: not a consultant on its books, not the sample seat. */
export function peopleOf(seats: readonly CompanySeat[]): CompanySeat[] {
  return seats.filter((s) => s.isPerson && !s.isSample)
}

/**
 * Teammates for the setup checklist: the company's people beside the one
 * who set it up, invited ones included, because inviting is the act the
 * item asks for. Never below nought, so a one-person firm reads 0.
 */
export function teammatesOf(seats: readonly CompanySeat[]): number {
  return Math.max(0, peopleOf(seats).length - 1)
}

/** How many seats are in each state. */
export function countSeats(seats: readonly Pick<CompanySeat, 'state'>[]): SeatCounts {
  const c: SeatCounts = { withAccess: 0, invited: 0, paused: 0 }
  for (const s of seats) {
    if (s.state === 'WITH_ACCESS') c.withAccess++
    else if (s.state === 'INVITED') c.invited++
    else c.paused++
  }
  return c
}

/** Counts per role id, people only. A seat with no role is under `null`. */
export function countsByRole(seats: readonly CompanySeat[]): Map<string | null, SeatCounts> {
  const by = new Map<string | null, CompanySeat[]>()
  for (const s of peopleOf(seats)) by.set(s.roleId, [...(by.get(s.roleId) ?? []), s])
  return new Map([...by].map(([k, v]) => [k, countSeats(v)]))
}

/**
 * The counts in words: "2 with access", then " · 3 invited" and
 * " · 1 paused" only where not zero. Where all three are zero, `empty`.
 */
export function countWords(c: SeatCounts, empty = 'nobody yet'): string {
  if (c.withAccess === 0 && c.invited === 0 && c.paused === 0) return empty
  const parts = [`${c.withAccess} with access`]
  if (c.invited) parts.push(`${c.invited} invited`)
  if (c.paused) parts.push(`${c.paused} paused`)
  return parts.join(' · ')
}

/** A role's line on Settings → Roles. */
export function roleHeldWords(c: SeatCounts | undefined): string {
  return countWords(c ?? { withAccess: 0, invited: 0, paused: 0 }, 'nobody holds this yet')
}

/** The headline for a company's people: "6 people: 3 with access · 3 invited". */
export function peopleWords(c: SeatCounts): string {
  const n = c.withAccess + c.invited + c.paused
  if (n === 0) return 'Nobody here yet.'
  return `${n} ${n === 1 ? 'person' : 'people'}: ${countWords(c)}`
}
