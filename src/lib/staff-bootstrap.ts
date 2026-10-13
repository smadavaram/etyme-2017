/**
 * Staff bootstrap of a real company, for a deployment with no email key.
 *
 * Founder, 2026-10-14 ("Etyme runs on Etyme"): a real vendor company with
 * its first seats, on a production that cannot send mail. Sign-up confirms
 * an address by email and an invitation is an email, so neither works
 * there. This makes the company through the same function sign-up and
 * "Add company" use (lib/company-create: the same pack, roles, location
 * and holidays), seats each person at the role named, and hands back, per
 * seat, a one-time link that sets a password on first use and expires in
 * seven days. Staff vouch for the domain, and say so in the log.
 *
 * Two halves, so the rules can be read and tested without a database:
 *
 *   planBootstrap(input, existing)   pure: what to create, what to re-issue,
 *                                    what to refuse, each in a sentence
 *   bootstrapCompany(input)          does the plan, logs every row it makes
 *
 * Run twice, it adds nothing twice: a company that exists is found by its
 * domain, a seat that exists is kept, a seat whose person never signed in
 * gets a fresh link (the old one stops working), and a person who has
 * signed in is never touched.
 */
import { prisma } from '@/lib/db'
import { classifyEmail } from '@/lib/onboarding'
import { reservedDomain } from '@/lib/demo-company'
import { checkSubdomain, RESERVED_SUBDOMAINS } from '@/lib/domains-owned'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'
import { createCompany } from '@/lib/company-create'
import { issueSetPassword } from '@/lib/password-door'

/** How long a seat's one-time link works: seven days. */
export const LINK_HOURS = 7 * 24

export interface SeatAsked {
  email: string
  name?: string | null
  role: string
}

export interface BootstrapInput {
  name: string
  domain: string
  kind: CompanyKind
  address: string
  seats: SeatAsked[]
}

/** What the record already holds, read before planning. */
export interface Existing {
  /** The company already on this domain, if any. */
  company: { id: string; slug: string; name: string } | null
  /** Addresses already in use by another company. */
  takenAddresses: Set<string>
  /** Each asked email as the record knows it. */
  people: Record<string, {
    personId: string
    /** Has a password or a sign-in on record: never touched. */
    signedIn: boolean
    /** Their seat at this company, if any, and its role. */
    seatRole: string | null
  } | undefined>
}

export type SeatPlan =
  | { email: string; role: string; name: string; does: 'CREATE_PERSON_AND_SEAT' }
  | { email: string; role: string; name: string; does: 'ADD_SEAT'; personId: string }
  | { email: string; role: string; name: string; does: 'REISSUE_LINK'; personId: string }
  | { email: string; role: string; name: string; does: 'LEAVE'; says: string }

export type Plan =
  | { ok: false; says: string }
  | {
      ok: true
      createCompany: boolean
      domain: string
      address: string
      seats: SeatPlan[]
    }

const clean = (s: unknown) => String(s ?? '').trim()

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  const words = local.replace(/[._-]+/g, ' ').trim()
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : email
}

/** Pure: what a bootstrap would do, or why it refuses. */
export function planBootstrap(input: BootstrapInput, existing: Existing): Plan {
  const name = clean(input.name)
  const domain = clean(input.domain).toLowerCase()
  const address = clean(input.address).toLowerCase()
  if (!name) return { ok: false, says: 'Give the company its name.' }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { ok: false, says: `${domain || 'That'} is not a domain. Give the company's work domain, like etyme.com.` }
  if (classifyEmail(`someone@${domain}`) === 'CONSUMER') {
    return { ok: false, says: `${domain} is a personal mail provider, not a company's domain. Use the company's own work domain.` }
  }
  if (reservedDomain(domain)) {
    return { ok: false, says: `${domain} belongs to the demo world and nobody can own it. Use a real, registered domain.` }
  }
  if (!rolesFor(input.kind).length) return { ok: false, says: `${input.kind} is not a kind of company Etyme makes.` }
  const roleNames = new Set(rolesFor(input.kind).map((r) => r.name))
  if (!Array.isArray(input.seats) || input.seats.length === 0) return { ok: false, says: 'Name at least one seat, with its email and role.' }

  const seen = new Set<string>()
  for (const s of input.seats) {
    const email = clean(s.email).toLowerCase()
    if (!email.includes('@')) return { ok: false, says: `${email || 'A seat'} is not an email address.` }
    if (email.split('@')[1] !== domain) {
      return { ok: false, says: `${email} is not at ${domain}. Every seat here is on the company's own domain.` }
    }
    if (seen.has(email)) return { ok: false, says: `${email} is named twice. Give each person one seat.` }
    seen.add(email)
    if (!roleNames.has(clean(s.role))) {
      return { ok: false, says: `${clean(s.role) || 'No role'} is not a role at a ${input.kind.toLowerCase()} firm. Use one of: ${[...roleNames].join(', ')}.` }
    }
  }

  const createIt = existing.company === null
  if (createIt) {
    if (!input.seats.some((s) => clean(s.role) === 'Owner')) {
      return { ok: false, says: 'A new company needs one seat named Owner, who answers its setup.' }
    }
    // A staff-made company may take the address that is its own domain's
    // name, even where that word is kept back for everybody else.
    const own = address === domain.split('.')[0] && RESERVED_SUBDOMAINS.has(address)
    if (!own) {
      const v = checkSubdomain(address, existing.takenAddresses)
      if (!v.ok) return { ok: false, says: v.reason }
    } else if (existing.takenAddresses.has(address)) {
      return { ok: false, says: `${address}.etyme.com is already somebody else's.` }
    }
  }

  const seats: SeatPlan[] = input.seats.map((s) => {
    const email = clean(s.email).toLowerCase()
    const role = clean(s.role)
    const person = existing.people[email]
    const nm = clean(s.name) || nameFromEmail(email)
    if (!person) return { email, role, name: nm, does: 'CREATE_PERSON_AND_SEAT' as const }
    if (person.signedIn) {
      return {
        email, role, name: nm, does: 'LEAVE' as const,
        says: person.seatRole
          ? `${email} already signs in here as ${person.seatRole}. Nothing was changed.`
          : `${email} already has an Etyme account. Invite them from Users & permissions instead.`,
      }
    }
    if (person.seatRole) return { email, role, name: nm, does: 'REISSUE_LINK' as const, personId: person.personId }
    return { email, role, name: nm, does: 'ADD_SEAT' as const, personId: person.personId }
  })

  return { ok: true, createCompany: createIt, domain, address, seats }
}

export interface SeatResult {
  email: string
  role: string
  outcome: 'CREATED' | 'SEAT_ADDED' | 'LINK_REISSUED' | 'LEFT_ALONE'
  /** A one-time link that sets a password on first use; seven days. Never a password. */
  link: string | null
  says: string
}

export type BootstrapResult =
  | { ok: false; says: string }
  | { ok: true; company: { id: string; name: string; slug: string; domain: string; created: boolean }; seats: SeatResult[] }

/** What the record holds for this input, read once. */
async function readExisting(input: BootstrapInput): Promise<Existing> {
  const domain = clean(input.domain).toLowerCase()
  const byDomain = await prisma.company.findFirst({
    where: { OR: [{ domain }, { claimedDomains: { some: { domain } } }] },
    select: { id: true, slug: true, name: true },
  })
  const taken = new Set((await prisma.company.findMany({ select: { slug: true } })).map((c) => c.slug))
  if (byDomain) taken.delete(byDomain.slug)
  const emails = (input.seats ?? []).map((s) => clean(s.email).toLowerCase())
  const persons = await prisma.person.findMany({
    where: { primaryEmail: { in: emails } },
    select: {
      id: true, primaryEmail: true, passwordHash: true,
      credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
      contexts: byDomain
        ? { where: { companyId: byDomain.id, revokedAt: null }, select: { role: { select: { name: true } } }, take: 1 }
        : { where: { id: '__none__' }, select: { role: { select: { name: true } } }, take: 1 },
    },
  })
  const people: Existing['people'] = {}
  for (const p of persons) {
    people[p.primaryEmail.toLowerCase()] = {
      personId: p.id,
      signedIn: p.passwordHash !== null || p.credentials.length > 0,
      seatRole: p.contexts[0]?.role?.name ?? null,
    }
  }
  return { company: byDomain, takenAddresses: taken, people }
}

const REASON = 'Staff bootstrapped this company on a deployment with no email key; staff vouch for the domain (founder, 2026-10-14).'

/**
 * Do the plan. Every row it makes writes an AutomationLog row
 * (`STAFF_BOOTSTRAP`) saying which, in words; no password and no link is
 * ever logged or returned except the link itself in the response.
 */
export async function bootstrapCompany(input: BootstrapInput): Promise<BootstrapResult> {
  const plan = planBootstrap(input, await readExisting(input))
  if (!plan.ok) return plan
  const existing = await readExisting(input)

  // People first, so the Owner can found the company.
  const created = new Map<string, string>()
  for (const s of plan.seats) {
    if (s.does !== 'CREATE_PERSON_AND_SEAT') continue
    const p = await prisma.person.create({ data: { name: s.name, primaryEmail: s.email }, select: { id: true } })
    created.set(s.email, p.id)
  }

  let company = existing.company
  let companyCreated = false
  if (plan.createCompany) {
    const owner = plan.seats.find((s) => s.role === 'Owner')!
    const ownerId = owner.does === 'CREATE_PERSON_AND_SEAT' ? created.get(owner.email)! : (owner as { personId: string }).personId
    const made = await createCompany({
      name: clean(input.name), kind: input.kind, slug: plan.address, domain: plan.domain,
      byPersonId: ownerId, seatAsOwner: true, claimDomain: true, startsSetup: true,
    })
    company = { id: made.company.id, slug: made.company.slug, name: made.company.name }
    companyCreated = true
    // Staff vouched for the domain, not an identity provider: said so on the claim.
    await prisma.companyDomain.updateMany({ where: { companyId: company.id, domain: plan.domain }, data: { verifiedVia: 'STAFF' } })
    await prisma.automationLog.create({
      data: {
        companyId: company.id, action: 'STAFF_BOOTSTRAP',
        summary: `Staff made ${company.name} (${plan.address}.etyme.com) on ${plan.domain}, the domain verified on staff's word.`,
        reason: REASON,
        payload: { made: 'COMPANY', slug: plan.address, domain: plan.domain, kind: input.kind, ownerPersonId: ownerId },
        reversible: false,
      },
    })
  }
  const companyId = company!.id
  const roles = await prisma.role.findMany({ where: { companyId }, select: { id: true, name: true } })
  const roleId = (n: string) => roles.find((r) => r.name === n)?.id ?? null

  const results: SeatResult[] = []
  for (const s of plan.seats) {
    if (s.does === 'LEAVE') {
      results.push({ email: s.email, role: s.role, outcome: 'LEFT_ALONE', link: null, says: s.says })
      continue
    }
    const personId = s.does === 'CREATE_PERSON_AND_SEAT' ? created.get(s.email)! : s.personId
    let outcome: SeatResult['outcome'] = 'LINK_REISSUED'
    if (s.does !== 'REISSUE_LINK') {
      // The Owner of a company made just now was seated by createCompany.
      const seated = await prisma.context.findFirst({ where: { personId, companyId, revokedAt: null }, select: { id: true } })
      if (!seated) {
        await prisma.context.create({ data: { personId, type: 'EMPLOYEE', companyId, roleId: roleId(s.role) } })
      }
      outcome = s.does === 'CREATE_PERSON_AND_SEAT' ? 'CREATED' : 'SEAT_ADDED'
    }
    const link = await issueSetPassword(personId, LINK_HOURS)
    await prisma.automationLog.create({
      data: {
        companyId, action: 'STAFF_BOOTSTRAP',
        summary: outcome === 'LINK_REISSUED'
          ? `Staff issued ${s.email} a new one-time sign-in link; the earlier one stopped working.`
          : `Staff seated ${s.email} as ${s.role} and issued a one-time sign-in link, good for seven days.`,
        reason: REASON,
        payload: { made: outcome, email: s.email, role: s.role, personId, linkDays: 7 },
        reversible: false,
      },
    })
    results.push({
      email: s.email, role: s.role, outcome, link,
      says: outcome === 'LINK_REISSUED'
        ? `${s.email} is seated as ${s.role} and has never signed in, so here is a fresh link. The earlier one no longer works.`
        : `${s.email} is seated as ${s.role}. The link sets a password on first use and works for seven days.`,
    })
  }

  return {
    ok: true,
    company: { id: companyId, name: company!.name, slug: company!.slug, domain: plan.domain, created: companyCreated },
    seats: results,
  }
}
