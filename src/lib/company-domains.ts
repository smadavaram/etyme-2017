/**
 * Domains a company has claimed, which is not the same as its identity.
 *
 * The old model was `Company.domain`, one unique string, and the company
 * *was* that domain. It is a common pattern and it is wrong, in ways that
 * only show up once real companies arrive:
 *
 *   Conglomerates hold dozens of domains and are one buyer.
 *   Subsidiaries share a domain family and are deliberately separate
 *     tenants — Infosys US and Infosys India have different legal entities,
 *     different payroll and different clients.
 *   Mergers need two tenants to become one, and a unique column forbids it.
 *   Rebrands change the domain, and identity should survive that.
 *   Contractors arrive on consumer addresses and belong to nobody.
 *
 * Patching the string does not help. Reducing every address to its
 * registrable domain fixed `mail.corp.com` creating a duplicate and
 * immediately broke the other direction, forcing `us.infosys.com` and
 * `infosys.com` into one tenant that neither asked for. One failure traded
 * for another.
 *
 * So: **a domain is a claim, not an identity.** A company has its own id
 * and holds any number of verified domains. Each domain says, on its own,
 * what should happen when somebody signs in on it. Exact domains, never
 * reduced — `us.infosys.com` is its own claim, and if Infosys wants both
 * under one tenant they add both. The company decides, not DNS.
 *
 * The registrable-domain logic survives, demoted to what it is honestly
 * good for: noticing that somebody signing in from `us.infosys.com` might
 * belong with the Infosys that is already here, and offering to ask.
 */

import { registrableDomain } from '@/lib/registrable-domain'

/** What happens when somebody signs in on a domain a company has claimed. */
export type JoinPolicy =
  /** They are in. For a domain only employees hold. */
  | 'AUTO'
  /** They get a seat with no role, and somebody is asked. The default. */
  | 'REQUEST'
  /** Nothing. For a domain claimed to prove ownership, not to admit people. */
  | 'NONE'

export interface ClaimedDomain {
  domain: string
  companyId: string
  companyName: string
  verified: boolean
  joinPolicy: JoinPolicy
}

export type Entry =
  | { action: 'JOIN'; companyId: string; companyName: string; domain: string; message: string }
  | { action: 'REQUEST'; companyId: string; companyName: string; domain: string; message: string }
  | { action: 'SUGGEST'; companyId: string; companyName: string; domain: string; message: string }
  | { action: 'CREATE'; domain: string; message: string }
  | { action: 'CONSULTANT'; message: string }
  | { action: 'REFUSE'; message: string }

/**
 * Consumer providers. Somebody here is a person, not a company.
 *
 * Kept as an exact list rather than a heuristic, because being wrong makes
 * a consultant try to found a company called Gmail.
 */
const CONSUMER = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.de', 'mail.com', 'zoho.com', 'yandex.com', 'rediffmail.com',
  'qq.com', '163.com', '126.com', 'naver.com', 'daum.net',
])

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER.has(domain.toLowerCase())
}

export function domainOfEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  const d = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '')
  return d.includes('.') ? d : null
}

/**
 * What should happen when this person signs in.
 *
 * Answered against exact claims first, because that is a fact somebody
 * asserted and verified. Only when nothing matches exactly does the
 * registrable domain get used, and then only to *suggest* — never to
 * decide.
 *
 * The distinction is the whole point. An exact claim with an AUTO policy
 * is somebody saying "everyone here works for us". A registrable-domain
 * near-match is a guess, and a guess that silently joins somebody to a
 * tenant is how a subsidiary's data ends up inside its parent.
 */
export function decideEntry(email: string, claims: ClaimedDomain[]): Entry {
  const domain = domainOfEmail(email)

  if (!domain) {
    return { action: 'REFUSE', message: 'That is not an email address we can read.' }
  }

  if (isConsumerDomain(domain)) {
    return {
      action: 'CONSULTANT',
      // Not a lesser outcome. Consultants are the third side of this
      // market and sign in the same way.
      message: 'Setting you up as a consultant. You keep your own profile and take it between agencies.',
    }
  }

  // ── An exact claim ──────────────────────────────────────────────────
  const exact = claims.find((c) => c.domain === domain && c.verified)

  if (exact) {
    switch (exact.joinPolicy) {
      case 'AUTO':
        return {
          action: 'JOIN',
          companyId: exact.companyId,
          companyName: exact.companyName,
          domain,
          message: `${exact.companyName} is already here. Joining you to them.`,
        }
      case 'REQUEST':
        return {
          action: 'REQUEST',
          companyId: exact.companyId,
          companyName: exact.companyName,
          domain,
          message: `${exact.companyName} is already here. You will get a seat, and somebody there decides what you can see.`,
        }
      case 'NONE':
        // The domain is claimed but does not admit anybody — a company
        // proving it owns a marketing domain, say. Falling through to
        // CREATE would hand them a second tenant, so this is a refusal
        // with somewhere to go.
        return {
          action: 'REFUSE',
          message: `${exact.companyName} has claimed ${domain} but does not let people join through it. Ask them to invite you.`,
        }
    }
  }

  // ── A near match, offered rather than acted on ──────────────────────
  const registrable = registrableDomain(domain)
  const near = registrable
    ? claims.find((c) => c.verified && registrableDomain(c.domain) === registrable)
    : undefined

  if (near) {
    return {
      action: 'SUGGEST',
      companyId: near.companyId,
      companyName: near.companyName,
      domain,
      // Both readings are real, so the person is asked rather than guessed
      // at. us.infosys.com may be part of Infosys or a separate entity
      // that shares a name, and DNS cannot tell you which.
      message: `${near.companyName} is here on ${near.domain}. Are you part of them, or a separate company that shares the name?`,
    }
  }

  return {
    action: 'CREATE',
    domain,
    message: `Nobody from ${domain} is here yet, so you are setting it up.`,
  }
}

// ── Claiming a domain ─────────────────────────────────────────────────

export interface ClaimVerdict {
  ok: boolean
  reason: string
  /** Set when it would need proving rather than being taken on trust. */
  needsProof: boolean
}

/**
 * Whether a company may claim this domain.
 *
 * A claim is a real assertion — it can admit people to a tenant — so it is
 * never taken on somebody's word except in the one case where an identity
 * provider already proved it.
 */
export function canClaim(
  domain: string,
  claimedElsewhere: ClaimedDomain | undefined,
  provedByIdentityProvider: boolean
): ClaimVerdict {
  const d = domain.trim().toLowerCase()

  if (!d.includes('.') || /\s/.test(d)) {
    return { ok: false, reason: 'That is not a domain name.', needsProof: false }
  }
  if (isConsumerDomain(d)) {
    return {
      ok: false,
      // Claiming gmail.com would admit the entire internet to a tenant.
      reason: `${d} belongs to everybody. A company cannot claim a consumer provider — invite those people individually instead.`,
      needsProof: false,
    }
  }
  if (claimedElsewhere) {
    return {
      ok: false,
      reason: `${d} is already claimed by ${claimedElsewhere.companyName}. If that is wrong, they can release it.`,
      needsProof: false,
    }
  }

  if (provedByIdentityProvider) {
    return {
      ok: true,
      // The tenant is the proof. Asking somebody to confirm an address
      // their identity provider already asserted is theatre.
      reason: `Verified — your identity provider proved you are on ${d}.`,
      needsProof: false,
    }
  }

  return {
    ok: true,
    reason: `Add a DNS record on ${d} to prove you own it. Until then it admits nobody.`,
    needsProof: true,
  }
}

/**
 * How risky is a policy on this domain?
 *
 * Said before somebody picks it, because AUTO on a domain that is not
 * exclusively yours is the mistake that quietly admits strangers — a
 * shared-hosting domain, a university, a holding company whose domain a
 * dozen unrelated firms use.
 */
export function describePolicy(policy: JoinPolicy, domain: string): {
  label: string
  detail: string
  caution: string | null
} {
  switch (policy) {
    case 'AUTO':
      return {
        label: 'They are in',
        detail: `Anybody signing in on ${domain} joins with no role, and can be given one.`,
        caution: `Only choose this where everybody on ${domain} genuinely works for you. On a shared or university domain it admits strangers.`,
      }
    case 'REQUEST':
      return {
        label: 'They wait for somebody',
        detail: `Anybody signing in on ${domain} gets a seat and somebody here is asked to give them a role.`,
        caution: null,
      }
    case 'NONE':
      return {
        label: 'Nobody joins through it',
        detail: `${domain} is claimed so nobody else can take it, but signing in on it does nothing.`,
        caution: null,
      }
  }
}
