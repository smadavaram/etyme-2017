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
 *  - its state: INVITED (never signed in here), WAITING_FOR_ROLE (signed in,
 *    and nobody has given them a role yet), WITH_ACCESS (signed in with a
 *    role), or PAUSED. Users & permissions lists a seat with no role under
 *    "Waiting for access" (`seatPlace` in lib/access-grant), so it is never
 *    counted as with access here either;
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
 *
 * Signed in means signed in at this firm (2026-11-16), read the way Users
 * & permissions reads it: `seatHasSignedIn` over this firm's own record
 * (`signedInHere` in lib/access-log), never her account anywhere else. It
 * read "any sign-in anywhere on Etyme", so a seat invited at an address
 * that already signs in at another firm counted as with access on
 * Settings, Team structure, setup, Compliance and the Give access picker
 * while Users & permissions said Invited, and those screens told the firm
 * the address has an account elsewhere.
 */
import { prisma } from '@/lib/db'
import { seatHasSignedIn } from '@/lib/access-grant'
import { signedInHere } from '@/lib/access-log'
import { stateOf, seatByDate, type DatedSeat } from '@/lib/account-lifecycle'
import { OWNER_ROLE } from '@/lib/owner-rules'
import { isSamplePerson } from '@/lib/sample-seat'
import { domainOfEmail, isConsumerDomain } from '@/lib/company-domains'

export type SeatState = 'INVITED' | 'WAITING_FOR_ROLE' | 'WITH_ACCESS' | 'PAUSED'

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
  /**
   * A shared sign-in, such as timesheets@ or support@ on the company's own
   * mail: an address several people may use, not one person
   * (`isSharedSignIn`). Listed and counted exactly like any other seat.
   */
  shared: boolean
  /**
   * Past its end date and still open, and why (2026-11-15): an Owner's
   * seat, or the last one that may manage access (`seatByDate`). Null for
   * a seat in date. A seat past its date for any other reason is ended and
   * never in this list.
   */
  keptPastEndDate: 'OWNER' | 'LAST_MANAGER' | null
}

export interface SeatCounts {
  withAccess: number
  invited: number
  /** Signed in, not paused, and holding no role yet. */
  waitingForRole: number
  paused: number
}

/** No seats in any state. */
export const NO_SEATS: SeatCounts = { withAccess: 0, invited: 0, waitingForRole: 0, paused: 0 }

/** Every seat counted, whatever its state. */
export function seatTotal(c: SeatCounts): number {
  return c.withAccess + c.invited + c.waitingForRole + c.paused
}

/** The name part of an address, in words: "sharath.m@x.com" → "Sharath M". */
export function nameFromAddress(email: string): string {
  const local = (email.split('@')[0] ?? email).replace(/[._+-]+/g, ' ').trim()
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : email
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The words before the @ that name a mailbox, not a person (founder,
 * 2026-11-12: timesheets@ read as a person called "Timesheets"). A fixed
 * list on purpose: a name that happens to match its own address
 * (oliver@, "Oliver") is a person, and is never guessed to be shared.
 */
export const SHARED_MAILBOX_WORDS: readonly string[] = [
  'timesheets', 'timesheet', 'support', 'admin', 'hr', 'hradmin', 'info', 'billing', 'accounts', 'accounting',
  'payroll', 'ap', 'ar', 'finance', 'noreply', 'no-reply', 'team', 'office', 'contact', 'hello', 'sales',
  'jobs', 'careers', 'recruiting',
]
const MAILBOX = new Set(SHARED_MAILBOX_WORDS)

/**
 * Is this sign-in address a shared mailbox rather than one person? Both
 * must hold: the part before the @ is one of the mailbox words, and the
 * address is not on a personal mail provider (the sign-in rule's own list,
 * `isConsumerDomain`), because hr@ on Gmail is somebody's own address.
 * Pure.
 */
export function isSharedSignIn(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return false
  const domain = domainOfEmail(e)
  if (!domain || isConsumerDomain(domain)) return false
  return MAILBOX.has(e.slice(0, at))
}

/**
 * The words to show for a seat, and the name to store for a person: never
 * the company's. Where the name typed is the company's own name (a seat
 * named "Tapin" at Tapin), or nothing was typed, the name part of the
 * address stands in. A shared sign-in (`isSharedSignIn`) whose name is only
 * that stand-in ("Timesheets" for timesheets@) is shown by its address
 * instead, so a mailbox never reads as a person; a name somebody typed for
 * it stays. Pure; every screen that names a seat reads this one answer.
 */
export function personNameFor(typed: string | null | undefined, email: string | null | undefined, companyName: string | null | undefined): string {
  const t = String(typed ?? '').trim()
  const fromAddress = email ? nameFromAddress(email) : ''
  const fallback = fromAddress || t
  const standIn = !t || Boolean(companyName && same(t, companyName)) || Boolean(fromAddress && same(t, fromAddress))
  if (standIn && email && isSharedSignIn(email)) return email.trim()
  if (!t) return fallback
  if (companyName && same(t, companyName)) return fallback || t
  return t
}

/**
 * The state a seat reads as, from the lifecycle's own rule, with one more
 * step: a signed-in seat with no role waits for one, the way Users &
 * permissions lists it (`seatPlace`). Pure.
 */
export function seatStateOf(s: { revokedAt: Date | null; suspendedAt: Date | null; signedIn: boolean; hasRole?: boolean }): SeatState | null {
  const st = stateOf({ contextId: '', personId: '', roleId: null, rolePermissions: [], revokedAt: s.revokedAt, suspendedAt: s.suspendedAt, hasSignedIn: s.signedIn })
  if (st === 'REVOKED') return null
  if (st === 'SUSPENDED') return 'PAUSED'
  if (st === 'INVITED') return 'INVITED'
  return s.hasRole === false ? 'WAITING_FOR_ROLE' : 'WITH_ACCESS'
}

/** Every live seat at one company, once each, oldest first. */
export async function readCompanySeats(companyId: string, db: Pick<typeof prisma, 'company' | 'context' | 'accessLog'> = prisma): Promise<CompanySeat[]> {
  const [company, rows] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.context.findMany({
      where: { companyId, revokedAt: null },
      select: {
        id: true, personId: true, type: true, roleId: true, orgUnitId: true, grantedAt: true,
        invitedAt: true, lastUsedAt: true, suspendedAt: true, revokedAt: true, expiresAt: true,
        role: { select: { name: true, permissions: true } },
        person: { select: { name: true, primaryEmail: true } },
      },
      orderBy: { grantedAt: 'asc' },
      take: 5000,
    }),
  ])
  // Whether each invited person came in at this firm: its own record, never
  // her account elsewhere. A seat nobody invited was made by a sign-in, and
  // a seat with a use date was used, so only the rest are asked about.
  const here = await signedInHere(companyId, rows.filter((r) => r.invitedAt !== null && r.lastUsedAt === null).map((r) => r.personId), db)
  return seatsFrom(rows.map((r) => ({ ...r, signedInHere: here.has(r.personId) })), company?.name ?? null)
}

type Row = {
  id: string; personId: string; type: string; roleId: string | null; orgUnitId: string | null; grantedAt: Date
  invitedAt: Date | null; lastUsedAt: Date | null; suspendedAt: Date | null; revokedAt: Date | null
  /** The seat's end date. Absent reads as none. */
  expiresAt?: Date | null
  role: { name: string; permissions?: string[] } | null
  person: { name: string; primaryEmail: string | null }
  /**
   * Whether her person did anything at this firm as herself
   * (`signedInHere` in lib/access-log). Absent reads as no: an invited
   * seat with no use date then reads Invited.
   */
  signedInHere?: boolean
}

/**
 * The rows as seats. Pure, so the counting rule is tested without a
 * database. A seat past its end date is ended here, as a revoked one is
 * (2026-11-15), unless `seatByDate` keeps it open: so it is in no count,
 * no picker and no sentence naming who to ask. `rows` is the company's
 * live seats, which the rule reads to find who else may manage access.
 */
export function seatsFrom(rows: readonly Row[], companyName: string | null, now: Date = new Date()): CompanySeat[] {
  const out: CompanySeat[] = []
  // Signed in at this firm, as Users & permissions reads it (`seatHasSignedIn`).
  const signedIn = (r: Row) => seatHasSignedIn({ invitedAt: r.invitedAt, lastUsedAt: r.lastUsedAt, signedInHere: r.signedInHere === true })
  const dated = (r: Row): DatedSeat => ({
    contextId: r.id,
    // Every row is this one company's, so one shared mark stands for it.
    companyId: 'this company',
    expiresAt: r.expiresAt ?? null,
    isOwner: r.role?.name === OWNER_ROLE,
    rolePermissions: r.role?.permissions ?? [],
    revokedAt: r.revokedAt,
    suspendedAt: r.suspendedAt,
    hasSignedIn: signedIn(r),
  })
  const all = rows.map(dated)
  for (const r of rows) {
    const byDate = seatByDate(dated(r), all, now)
    if (!byDate.open) continue
    const state = seatStateOf({
      revokedAt: r.revokedAt, suspendedAt: r.suspendedAt,
      signedIn: signedIn(r),
      hasRole: Boolean(r.role?.name),
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
      shared: isSharedSignIn(r.person.primaryEmail),
      keptPastEndDate: byDate.kept,
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
  const c: SeatCounts = { ...NO_SEATS }
  for (const s of seats) {
    if (s.state === 'WITH_ACCESS') c.withAccess++
    else if (s.state === 'INVITED') c.invited++
    else if (s.state === 'WAITING_FOR_ROLE') c.waitingForRole++
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
 * The counts in words: "2 with access", then " · 3 invited",
 * " · 1 waiting for a role" and " · 1 paused" only where not zero. Where
 * all are zero, `empty`.
 */
export function countWords(c: SeatCounts, empty = 'nobody yet'): string {
  if (seatTotal(c) === 0) return empty
  const parts = [`${c.withAccess} with access`]
  if (c.invited) parts.push(`${c.invited} invited`)
  if (c.waitingForRole) parts.push(`${c.waitingForRole} waiting for a role`)
  if (c.paused) parts.push(`${c.paused} paused`)
  return parts.join(' · ')
}

/** A role's line on Settings → Roles. */
export function roleHeldWords(c: SeatCounts | undefined): string {
  return countWords(c ?? NO_SEATS, 'nobody holds this yet')
}

/** The headline for a company's people: "6 people: 3 with access · 3 invited". */
export function peopleWords(c: SeatCounts): string {
  const n = seatTotal(c)
  if (n === 0) return 'Nobody here yet.'
  return `${n} ${n === 1 ? 'person' : 'people'}: ${countWords(c)}`
}
