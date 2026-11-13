import { prisma } from '@/lib/db'
import { domainOfEmail, isConsumerDomain } from '@/lib/company-domains'
import {
  decideDoor, effectiveMode, sessionStands,
  type CompanyPolicy, type Door, type DoorVerdict, type EffectiveMode, type SignInMode,
} from '@/lib/identity/policy'
import { recordIdentityEvent, type Surface } from '@/lib/identity/ledger'

/**
 * The sign-in policy, read from the record, and the ledger row of every
 * refusal written before the refusal is sent (founder, 2026-11-11).
 *
 * Two reads, both on the identity tables and both narrowed by the record
 * itself: the policy rows, and the directories turned on, of the company
 * whose verified domain an address is on and of the company a door seats
 * the person at. Everything else is lib/identity/policy, which is pure.
 */

/** The company a door seats at, the address's own company, and whether the address is public. */
export interface PolicyFacts {
  domainCompany: CompanyPolicy | null
  target: CompanyPolicy | null
  publicAddress: boolean
}

type Row = {
  companyId: string
  company: { name: string; domain: string | null; domainVerified: boolean; claimedDomains: { id: string }[] }
}

/** The address's own company and the target, read once. */
export async function policyFacts(email: string, targetCompanyId?: string | null): Promise<PolicyFacts> {
  const domain = domainOfEmail(email)
  const publicAddress = !domain || isConsumerDomain(domain)
  // A public address belongs to nobody, so no company's domain governs it.
  const onDomain = domain && !publicAddress
    ? [{ company: { domain, domainVerified: true } }, { company: { claimedDomains: { some: { domain, verifiedAt: { not: null } } } } }]
    : []
  const OR = [...onDomain, ...(targetCompanyId ? [{ companyId: targetCompanyId }] : [])]
  if (OR.length === 0) return { domainCompany: null, target: null, publicAddress }

  const companySelect = {
    name: true, domain: true, domainVerified: true,
    claimedDomains: { where: { domain: domain ?? '__none__', verifiedAt: { not: null } }, select: { id: true } },
  } as const
  const [policies, directories] = await Promise.all([
    prisma.companySignInPolicy.findMany({ where: { OR }, select: { companyId: true, mode: true, company: { select: companySelect } } }),
    prisma.identityProvider.findMany({ where: { enabled: true, OR }, select: { companyId: true, issuer: true, company: { select: companySelect } } }),
  ])

  const byCompany = new Map<string, CompanyPolicy & { onDomain: boolean }>()
  const see = (r: Row) => {
    if (!byCompany.has(r.companyId)) {
      const own = Boolean(domain) && !publicAddress && ((r.company.domainVerified && r.company.domain === domain) || r.company.claimedDomains.length > 0)
      byCompany.set(r.companyId, { companyId: r.companyId, companyName: r.company.name, mode: null, issuers: [], onDomain: own })
    }
    return byCompany.get(r.companyId)!
  }
  for (const p of policies ?? []) see(p as Row).mode = p.mode as SignInMode
  for (const d of directories ?? []) {
    const c = see(d as Row)
    c.issuers = [...c.issuers, d.issuer]
  }
  const all = [...byCompany.values()]
  const strip = (c: (CompanyPolicy & { onDomain: boolean }) | undefined): CompanyPolicy | null =>
    c ? { companyId: c.companyId, companyName: c.companyName, mode: c.mode, issuers: c.issuers } : null
  return {
    domainCompany: strip(all.find((c) => c.onDomain)),
    target: targetCompanyId ? strip(byCompany.get(targetCompanyId)) : null,
    publicAddress,
  }
}

export interface DoorAsked {
  door: Door
  email: string
  /** The company the door seats the person at, where it seats. */
  targetCompanyId?: string | null
  issuer?: string | null
  surface: Surface
  /** Who is asking, where somebody is signed in or the address has an account. */
  actorPersonId?: string | null
  /** The person the address belongs to, where there is one; read here when not passed. */
  subjectPersonId?: string | null
}

/**
 * The door's answer. A refusal's ledger row is written, and waited for,
 * before this returns, so the caller sends the refusal after its row.
 */
export async function checkDoor(a: DoorAsked): Promise<DoorVerdict> {
  const email = String(a.email ?? '').trim().toLowerCase()
  const facts = await policyFacts(email, a.targetCompanyId)
  const verdict = decideDoor({
    door: a.door, email, domainCompany: facts.domainCompany, target: facts.target,
    issuer: a.issuer ?? null, publicAddress: facts.publicAddress,
  })
  if (verdict.allowed) return verdict

  let subjectId = a.subjectPersonId ?? null
  if (subjectId === null && email) {
    try {
      const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } })
      subjectId = person?.id ?? null
    } catch {
      // The row still names the company; a refusal is a refusal.
    }
  }
  await recordIdentityEvent({
    event: verdict.policy === 'SSO_ONLY' ? 'LOGIN_REFUSED_SSO_ONLY' : 'JOIN_REFUSED_BY_POLICY',
    companyId: verdict.companyId,
    actorPersonId: a.actorPersonId ?? subjectId,
    subject: subjectId ? { personId: subjectId } : { companyId: verdict.companyId },
    policy: verdict.policy,
    surface: a.surface,
    says: `Refused ${a.door} for ${email || 'an address nobody typed'}: ${verdict.says}`,
  })
  return verdict
}

/**
 * Whether inviting this address to this company is allowed. Written for
 * `POST /api/access/invite` (etyme-regulatory's route), which is asked to
 * call it before it seats anybody: a public address, or any address off
 * the company's own domain, is never invited into a directory-only company.
 */
export async function inviteRefusal(args: { companyId: string; email: string; actorPersonId: string; surface?: Surface }): Promise<string | null> {
  const v = await checkDoor({ door: 'INVITE', email: args.email, targetCompanyId: args.companyId, actorPersonId: args.actorPersonId, surface: args.surface ?? 'WEB' })
  return v.allowed ? null : v.says
}

/**
 * Whether a session still stands, read on every request through the
 * session callback (lib/auth). Ended sessions and sessions signed in by a
 * door the address's own company no longer allows are refused.
 */
export async function liveSessionStands(s: { email: string; door: Door | null; issuer: string | null; tokenVersion: number | null | undefined }): Promise<{ stands: true } | { stands: false; says: string }> {
  const email = s.email.trim().toLowerCase()
  const [person, facts] = await Promise.all([
    prisma.person.findUnique({ where: { primaryEmail: email }, select: { sessionVersion: true } }),
    policyFacts(email, null),
  ])
  const v = sessionStands({ door: s.door, issuer: s.issuer, tokenVersion: s.tokenVersion, personVersion: person?.sessionVersion ?? 0 }, facts.domainCompany, email)
  return v.stands ? { stands: true } : { stands: false, says: v.says }
}

/** The session version a new session is signed in under. */
export async function sessionVersionOf(email: string): Promise<number> {
  const person = await prisma.person.findUnique({ where: { primaryEmail: email.trim().toLowerCase() }, select: { sessionVersion: true } })
  return person?.sessionVersion ?? 0
}

/**
 * End every live session a person holds: the next request from any of
 * them is refused and they sign in again. The ledger row commits with the
 * change. Used by "sign out everywhere" today; by a directory disabling
 * the person in the second stage; and, once etyme-regulatory wires it, by
 * the revoke and suspend of a person's last seat.
 */
export async function endSessions(args: {
  personId: string
  actorPersonId: string | null
  companyId: string | null
  policy: EffectiveMode
  surface: Surface
  says: string
}): Promise<{ sessionVersion: number }> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.person.update({
      where: { id: args.personId },
      data: { sessionVersion: { increment: 1 }, sessionsEndedAt: new Date(), sessionsEndedById: args.actorPersonId },
      select: { sessionVersion: true },
    })
    await recordIdentityEvent({
      event: 'SESSIONS_ENDED', companyId: args.companyId, actorPersonId: args.actorPersonId,
      subject: { personId: args.personId }, policy: args.policy, surface: args.surface, says: args.says,
    }, tx)
    return p
  })
}

/** A company's own policy, for the settings route. */
export async function companyPolicy(companyId: string): Promise<{
  policy: CompanyPolicy
  effective: EffectiveMode
  row: { jit: boolean; scim: boolean; requiredAssurance: string | null; dataRegion: string | null; requireDirectorySuppliers: boolean; setAt: Date; setBy: string | null; reason: string | null } | null
}> {
  const [company, row, directories] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
    prisma.companySignInPolicy.findUnique({
      where: { companyId },
      select: { mode: true, jit: true, scim: true, requiredAssurance: true, dataRegion: true, requireDirectorySuppliers: true, setAt: true, reason: true, setBy: { select: { name: true } } },
    }),
    prisma.identityProvider.findMany({ where: { companyId, enabled: true }, select: { issuer: true } }),
  ])
  const policy: CompanyPolicy = { companyId, companyName: company.name, mode: (row?.mode as SignInMode | undefined) ?? null, issuers: directories.map((d) => d.issuer) }
  return {
    policy,
    effective: effectiveMode(policy),
    row: row ? { jit: row.jit, scim: row.scim, requiredAssurance: row.requiredAssurance, dataRegion: row.dataRegion, requireDirectorySuppliers: row.requireDirectorySuppliers, setAt: row.setAt, setBy: row.setBy?.name ?? null, reason: row.reason } : null,
  }
}

/**
 * LinkedIn is for candidates only (founder, 2026-11-12: "For LinkedIn,
 * mention for candidate only"). Read in the sign-in callback, after
 * LinkedIn proved the address: a person who holds any seat at a company,
 * a one-person firm included, is refused there, the row written before the
 * refusal goes back. A person with no seat anywhere signs in, and /start
 * seats them as a candidate. Returns whether the sign-in was refused.
 */
export async function linkedInSeatAtSignIn(email: string, surface: Surface = 'WEB'): Promise<boolean> {
  const address = email.trim().toLowerCase()
  if (!address) return false
  const seat = await prisma.context.findFirst({
    where: { revokedAt: null, companyId: { not: null }, person: { primaryEmail: address } },
    select: { personId: true, companyId: true, company: { select: { name: true } } },
    orderBy: { grantedAt: 'asc' },
  })
  if (!seat?.companyId) return false
  const facts = await policyFacts(address, seat.companyId)
  await recordIdentityEvent({
    event: 'JOIN_REFUSED_BY_POLICY',
    companyId: seat.companyId,
    actorPersonId: seat.personId,
    subject: { personId: seat.personId },
    policy: effectiveMode(facts.target),
    surface,
    says: `Refused a LinkedIn sign-in for ${address}, who holds a seat at ${seat.company?.name ?? 'a company'}: LinkedIn is for candidates only.`,
  })
  return true
}
