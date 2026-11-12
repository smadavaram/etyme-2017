/**
 * How people join this company, in one sentence, from what the code does
 * (founder, 2026-11-12).
 *
 * Users & permissions said anybody on the company's domain joins at once;
 * Settings said colleagues join by signing up with the Etyme address;
 * setup said they join by signing in once the domain is verified. Each was
 * a copy typed for one kind of company, and for Tapin (no domain of its
 * own, people on Gmail and on Etyme's own domain) none was true.
 *
 * So the sentence is read off the same facts the doors read:
 *  - the sign-in mode (lib/identity/policy): directory only admits nobody
 *    but through the directory, and never says "password" or "emailed
 *    link"; invite-only refuses every join by domain;
 *  - each verified domain the company holds and its join rule
 *    (`CompanyDomain.joinPolicy`, read by `decideEntry`): AUTO joins at
 *    once, REQUEST asks and waits, NONE admits nobody; an unverified claim
 *    admits nobody (`mayJoinByDomain`);
 *  - the Etyme address admits nobody: a company with no verified domain
 *    is joined by invitation only (coordinator's ruling, 2026-11-12;
 *    `colleagueCompany` in lib/password-door reads verified domains only);
 *  - the kind: a one-person firm has no colleagues, so no sentence at all.
 *
 * It changes nothing about who may join; it only says it.
 */
import { prisma } from '@/lib/db'
import { isConsumerDomain, isPlatformDomain } from '@/lib/company-domains'
import { companyPolicy } from '@/lib/identity/read'
import type { EffectiveMode } from '@/lib/identity/policy'

export interface JoinFacts {
  companyName: string
  kind: string
  slug: string
  mode: EffectiveMode
  /** The domains the company has claimed, verified or not, with their join rule. */
  domains: readonly { domain: string; verified: boolean; joinPolicy: string }[]
}

const list = (xs: readonly string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`

/** A domain nobody can join a company by: a consumer provider's, or Etyme's own. */
function nobodysDomain(d: string): boolean {
  return isConsumerDomain(d) || isPlatformDomain(d)
}

/** The sentence. Pure. Null for a one-person firm, which has no colleagues. */
export function joinSentence(f: JoinFacts): string | null {
  if (f.kind === 'CONSULTANT_CORP') return null
  const name = f.companyName

  if (f.mode === 'SSO_ONLY') {
    return `People join ${name} through your company's directory. Add a person there, and they sign in through it.`
  }

  const invite = `An Owner or Admin invites each person from Users & permissions.`
  if (f.mode === 'INVITE_ONLY') return `People join ${name} by invitation only. ${invite}`

  const live = f.domains.filter((d) => d.verified && !nobodysDomain(d.domain))
  const atOnce = live.filter((d) => d.joinPolicy === 'AUTO').map((d) => d.domain)
  const asks = live.filter((d) => d.joinPolicy === 'REQUEST').map((d) => d.domain)

  const more: string[] = []
  if (atOnce.length) more.push(`Anybody who signs in with an address on ${list(atOnce)} joins at once as Member and waits for a role.`)
  if (asks.length) more.push(`Anybody who signs in with an address on ${list(asks)} asks to join, and an Owner or Admin gives them a role.`)
  if (more.length === 0) return `People join ${name} by invitation only. ${invite}`
  return `People join ${name} by invitation. ${invite} ${more.join(' ')}`
}

/** The facts for one company, read the way the doors read them. */
export async function joinFactsFor(companyId: string): Promise<JoinFacts | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, kind: true, slug: true } })
  if (!company) return null
  const [policy, domains] = await Promise.all([
    companyPolicy(companyId),
    prisma.companyDomain.findMany({ where: { companyId }, select: { domain: true, verifiedAt: true, joinPolicy: true } }),
  ])
  return {
    companyName: company.name,
    kind: company.kind,
    slug: company.slug,
    mode: policy.effective,
    domains: domains.map((d) => ({ domain: d.domain, verified: d.verifiedAt !== null, joinPolicy: d.joinPolicy })),
  }
}

/** The sentence for one company, or null. */
export async function joinSentenceFor(companyId: string): Promise<string | null> {
  const f = await joinFactsFor(companyId)
  return f ? joinSentence(f) : null
}
