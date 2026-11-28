/**
 * Who is this in Teams, at Etyme?
 *
 * Identity binds at activation (CLAUDE.md, "The job twin"): the first
 * time somebody writes to the bot, or presses a button on its card, their
 * Microsoft account is matched to a person at Etyme with a live seat at a
 * company, and the bot acts for that seat and nothing more — the seat's
 * own permissions, read the way the web reads them.
 *
 * ── What counts as the identity ─────────────────────────────────────
 *
 * The activity is signed by the Bot Framework (lib/teams/auth), and the
 * member's sign-in name is read back from Teams with the bot's own token
 * (`getMember` in lib/teams/connector), so it is what Entra holds for the
 * account, not anything the person typed. The sign-in name (UPN) is
 * matched first, because a tenant can only issue one on a domain it has
 * verified. The mail address is used only where it is on the same
 * domain as the sign-in name.
 *
 * ── Which seat ───────────────────────────────────────────────────────
 *
 * One tenant is one domain name, so the seat at the company whose domain
 * is the account's domain wins. With no such company, a person holding
 * exactly one seat is bound to it. Anything else is refused in a
 * sentence rather than guessed. A consultant is reached by email, never
 * in Teams, so a consultant's seat is never bound.
 *
 * ── A seat's end date ───────────────────────────────────────────────
 *
 * A seat past its end date is ended in Teams exactly as on the web: the
 * one rule (`seatByDate` in lib/account-lifecycle) decides, so an Owner's
 * seat, and the last one that may manage access, are never ended by a
 * date (2026-11-15).
 */

import { prisma } from '@/lib/db'
import { isConsumerDomain } from '@/lib/company-domains'
import { seatHasSignedIn } from '@/lib/access-grant'
import { signedInHere } from '@/lib/access-log'
import { seatByDate, pastEndDate, MANAGES_ACCESS, type DatedSeat } from '@/lib/account-lifecycle'
import { OWNER_ROLE } from '@/lib/owner-rules'

export interface TeamsIdentity {
  /** The Entra sign-in name, as Teams reports it. */
  userPrincipalName?: string | null
  email?: string | null
  aadObjectId?: string | null
  tenantId?: string | null
  /** "29:…" */
  teamsUserId?: string | null
  name?: string | null
}

export interface Seat {
  contextId: string
  type: string
  companyId: string
  companyName: string
  companyKind: string
  companyDomain: string | null
  roleName: string | null
  permissions: readonly string[]
}

export interface BoundPerson {
  personId: string
  personName: string
  email: string
  contextId: string
  companyId: string
  companyName: string
  companyKind: string
  roleName: string | null
  permissions: readonly string[]
}

export type Binding =
  | { ok: true; bound: BoundPerson }
  | { ok: false; code: 'NO_ADDRESS' | 'NOBODY' | 'PERSONAL_ADDRESS' | 'CONSULTANT' | 'NO_SEAT' | 'WHICH_SEAT'; says: string }

/** The coordinator's sentence, word for word: what is wrong and what to do. */
export const NOBODY_HAS_THIS_EMAIL = 'Nobody at Etyme has this email. Ask your company’s owner to invite you.'

const domainOf = (address: string) => address.slice(address.lastIndexOf('@') + 1).toLowerCase()
const looksLikeAddress = (s: string | null | undefined): s is string => !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim())

/** The addresses to try, in order: the sign-in name, then mail on the same domain. */
export function addressesOf(identity: TeamsIdentity): string[] {
  const upn = looksLikeAddress(identity.userPrincipalName) ? identity.userPrincipalName.trim().toLowerCase() : null
  const mail = looksLikeAddress(identity.email) ? identity.email.trim().toLowerCase() : null
  const out: string[] = []
  if (upn) out.push(upn)
  if (mail && mail !== upn && (!upn || domainOf(mail) === domainOf(upn))) out.push(mail)
  return out
}

/**
 * The decision, pure: given the person the address belongs to (or
 * nobody) and their live seats, which seat the bot acts for, or the
 * sentence that says why none.
 */
export function chooseSeat(
  identity: TeamsIdentity,
  person: { id: string; name: string; primaryEmail: string } | null,
  seats: readonly Seat[],
): Binding {
  const addresses = addressesOf(identity)
  if (addresses.length === 0) {
    return {
      ok: false, code: 'NO_ADDRESS',
      says: 'Teams did not tell us this account’s sign-in address, so it cannot be matched to anybody at Etyme. Ask your Teams administrator to check the account has one.',
    }
  }
  if (!person) return { ok: false, code: 'NOBODY', says: NOBODY_HAS_THIS_EMAIL }
  const domain = domainOf(person.primaryEmail)
  if (isConsumerDomain(domain)) {
    return {
      ok: false, code: 'PERSONAL_ADDRESS',
      says: `${person.primaryEmail} is a personal address, and Etyme writes to people with a personal address by email, not in Teams.`,
    }
  }
  const business = seats.filter((s) => s.type !== 'CONSULTANT')
  if (business.length === 0) {
    return seats.length > 0
      ? { ok: false, code: 'CONSULTANT', says: 'You are on Etyme as a consultant, and Etyme writes to consultants by email, not in Teams. Nothing here needs you.' }
      : { ok: false, code: 'NO_SEAT', says: 'Your Etyme account has ended or is paused, so the bot cannot act for you. Ask your company’s owner to turn it back on.' }
  }
  const onDomain = business.filter((s) => s.companyDomain && s.companyDomain.toLowerCase() === domain)
  const seat = onDomain.length === 1 ? onDomain[0] : business.length === 1 ? business[0] : null
  if (!seat) {
    const names = [...new Set(business.map((s) => s.companyName))]
    return {
      ok: false, code: 'WHICH_SEAT',
      says: `You have accounts at ${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names[names.length - 1]}, and none is the company on ${domain}. Teams acts for one company: ask the owner of the one you want to put ${domain} on it.`,
    }
  }
  return {
    ok: true,
    bound: {
      personId: person.id,
      personName: person.name,
      email: person.primaryEmail,
      contextId: seat.contextId,
      companyId: seat.companyId,
      companyName: seat.companyName,
      companyKind: seat.companyKind,
      roleName: seat.roleName,
      permissions: seat.permissions,
    },
  }
}

/** Read the person and their live seats, then decide. */
export async function bindTeamsIdentity(identity: TeamsIdentity): Promise<Binding> {
  const addresses = addressesOf(identity)
  let person: { id: string; name: string; primaryEmail: string } | null = null
  for (const address of addresses) {
    person = await prisma.person.findFirst({
      where: { primaryEmail: { equals: address, mode: 'insensitive' } },
      select: { id: true, name: true, primaryEmail: true },
    })
    if (person) break
  }
  const rows = person
    ? await prisma.context.findMany({
        where: { personId: person.id, revokedAt: null, suspendedAt: null, companyId: { not: null } },
        select: {
          id: true, type: true, expiresAt: true, revokedAt: true, suspendedAt: true,
          company: { select: { id: true, name: true, kind: true, domain: true } },
          role: { select: { name: true, permissions: true } },
        },
        orderBy: { grantedAt: 'desc' },
      })
    : []
  const now = new Date()
  const open: typeof rows = []
  for (const r of rows) {
    if (!r.company) continue
    if (pastEndDate(r.expiresAt, now) && !seatByDate(datedSeat(r, true), await mayManageAccessAt(r.company.id), now).open) continue
    open.push(r)
  }
  const seats: Seat[] = open.map((r) => ({
    contextId: r.id,
    type: r.type,
    companyId: r.company!.id,
    companyName: r.company!.name,
    companyKind: r.company!.kind,
    companyDomain: r.company!.domain,
    roleName: r.role?.name ?? null,
    permissions: (r.role?.permissions as string[] | undefined) ?? [],
  }))
  return chooseSeat(identity, person, seats)
}

type DatedRow = {
  id: string
  company: { id: string } | null
  expiresAt: Date | null
  revokedAt: Date | null
  suspendedAt: Date | null
  role: { name: string; permissions: unknown } | null
}

/** A seat as the end-date rule reads it. The person writing in Teams has signed in. */
function datedSeat(r: DatedRow, signedIn: boolean): DatedSeat {
  return {
    contextId: r.id,
    companyId: r.company?.id ?? null,
    expiresAt: r.expiresAt,
    isOwner: r.role?.name === OWNER_ROLE,
    rolePermissions: (r.role?.permissions as string[] | undefined) ?? [],
    revokedAt: r.revokedAt,
    suspendedAt: r.suspendedAt,
    hasSignedIn: signedIn,
  }
}

/**
 * The company's live seats that may manage access, as the end-date rule
 * reads them. Read only for a seat past its date, so a seat in date costs
 * no query.
 *
 * Signed in is this firm's own record (`seatHasSignedIn` over
 * `signedInHere`, 2026-11-16), exactly as the web's caller check reads it
 * (`seatOpenByDate` in lib/api-context), so Teams and the web keep the
 * same seats open. It read a sign-in anywhere on Etyme, so a manager
 * invited here who had never come in could keep a seat open in Teams
 * that the web had ended.
 */
async function mayManageAccessAt(companyId: string): Promise<DatedSeat[]> {
  const rows = await prisma.context.findMany({
    where: { companyId, revokedAt: null, suspendedAt: null, role: { permissions: { hasSome: ['*', ...MANAGES_ACCESS] } } },
    select: {
      id: true, expiresAt: true, revokedAt: true, suspendedAt: true, invitedAt: true, lastUsedAt: true, personId: true,
      company: { select: { id: true } },
      role: { select: { name: true, permissions: true } },
    },
  })
  const here = await signedInHere(companyId, rows.filter((r) => r.invitedAt !== null && r.lastUsedAt === null).map((r) => r.personId))
  return rows.map((r) => datedSeat(r, seatHasSignedIn({ invitedAt: r.invitedAt, lastUsedAt: r.lastUsedAt, signedInHere: here.has(r.personId) })))
}
