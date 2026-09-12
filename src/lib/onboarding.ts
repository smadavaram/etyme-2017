/**
 * Getting a company into Etyme.
 *
 * The thing that goes wrong is not sign-in. It is that the second person
 * from a company creates a second company. Six weeks later there are three
 * "Nike Inc" records, the requisitions are split across them, and nobody
 * can be told which is real without a support conversation.
 *
 * A verified OAuth domain solves it outright, and that is the single
 * design decision this file exists to enforce: the domain is the company's
 * identity, so the first person from terumobct.com creates Terumo BCT and
 * everybody after them JOINS it. Nobody is asked to search for their
 * employer or to paste an invite code, because both are ways of getting
 * the answer wrong.
 *
 * The rest follows from that:
 *
 *   No passwords. Microsoft or Google for anyone with a work email, a
 *   mailed link for anyone without one. A password is a thing to leak and
 *   a thing to reset, and in 2030 it earns neither.
 *
 *   No "verify your email". The tenant already did. Asking again is
 *   theatre that costs a step.
 *
 *   One real question: what does this company do here? It decides
 *   navigation, permissions and what they see for the rest of the
 *   relationship, so it is worth asking properly and worth being able to
 *   change later.
 */

import { registrableDomain, registrableLabel } from '@/lib/registrable-domain'

export type CompanyKind = 'CLIENT' | 'VENDOR' | 'MSP' | 'GSI'

/**
 * How a supplier sits in the chain, at the moment they sign up.
 *
 * A prime holds the agreement with the client. A bench supplier sells
 * through other suppliers. The same company is often both — Infosys is
 * prime to one client and buys bench from three firms in the same week —
 * so this is a starting posture that shapes the first screens, not a
 * permanent identity, and it can be changed without migrating anything.
 */
export type SupplierPosture = 'PRIME' | 'BENCH' | null

export interface CompanyTypeOption {
  key: string
  kind: CompanyKind
  posture: SupplierPosture
  label: string
  /** What this means, for somebody who has never used the product. */
  blurb: string
  example: string
}

/**
 * The five ways in. Written so a person recognises themselves in one line,
 * because a wrong choice here is felt for months.
 */
export const COMPANY_TYPES: CompanyTypeOption[] = [
  {
    key: 'client',
    kind: 'CLIENT',
    posture: null,
    label: 'We hire contractors',
    blurb: 'You bring in contract staff through suppliers, and you want to see what you are spending and who is on site.',
    example: 'Terumo BCT, Nike',
  },
  {
    key: 'gsi',
    kind: 'GSI',
    posture: 'PRIME',
    label: 'We deliver projects and supply people',
    blurb: 'You run delivery for your clients and also buy people in to staff it.',
    example: 'Infosys, Accenture',
  },
  {
    key: 'msp',
    kind: 'MSP',
    posture: null,
    label: 'We run the programme for a client',
    blurb: 'You manage a client’s contingent workforce on their behalf, including their suppliers.',
    example: 'An MSP running a Fortune 500 programme',
  },
  {
    key: 'prime',
    kind: 'VENDOR',
    posture: 'PRIME',
    label: 'We supply people to clients directly',
    blurb: 'You hold the agreement with the client and place your own consultants against their roles.',
    example: 'A staffing firm with its own MSAs',
  },
  {
    key: 'bench',
    kind: 'VENDOR',
    posture: 'BENCH',
    label: 'We supply people to other suppliers',
    blurb: 'You have consultants on the bench and place them through other staffing firms rather than direct.',
    example: 'A bench sales firm',
  },
]

export function typeByKey(key: string): CompanyTypeOption | null {
  return COMPANY_TYPES.find(t => t.key === key) ?? null
}

// ── Who is signing in ──────────────────────────────────────

/** Email providers that belong to a person rather than a company. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'mail.com', 'gmx.com', 'zoho.com', 'yandex.com',
  'rediffmail.com', 'qq.com', '163.com',
])

export type EmailKind = 'CORPORATE' | 'CONSUMER' | 'INVALID'

export function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  const raw = email.slice(at + 1).trim().toLowerCase()
  if (!raw.includes('.')) return null

  // Reduced to the domain somebody actually registered, so that
  // user@mail.corp.com and user@corp.com are the same company.
  //
  // Without this they were not: the first stored mail.corp.com, the second
  // matched nothing and created a second tenant for the same organisation.
  // Neither could see the other's requisitions, invoices or people, and
  // the join-beats-create promise was broken by a mail subdomain.
  return registrableDomain(raw) ?? raw
}

/** The raw domain as typed, for the rare caller that wants exactly that. */
export function rawDomainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  const d = email.slice(at + 1).trim().toLowerCase()
  return d.includes('.') ? d : null
}

/**
 * A consumer address is not a failure. It is a consultant, and consultants
 * are the third side of this market — they sign in the same way and simply
 * do not get a company.
 */
export function classifyEmail(email: string): EmailKind {
  const lower = email.trim().toLowerCase()
  const raw = rawDomainOf(lower)
  if (!raw) return 'INVALID'
  // Checked against both. googlemail.com reduces to itself, but a consumer
  // provider on a multi-part suffix would otherwise slip through as
  // corporate.
  const reduced = domainOf(lower)
  return CONSUMER_DOMAINS.has(raw) || (reduced !== null && CONSUMER_DOMAINS.has(reduced))
    ? 'CONSUMER'
    : 'CORPORATE'
}

// ── Join, or create ────────────────────────────────────────

export interface ExistingCompany {
  id: string
  name: string
  kind: string
  memberCount: number
}

export type EntryDecision =
  | { action: 'JOIN'; company: ExistingCompany; message: string }
  | { action: 'CREATE'; domain: string; message: string }
  | { action: 'CONSULTANT'; message: string }
  | { action: 'REFUSE'; message: string }

/**
 * What happens when somebody signs in.
 *
 * Joining wins whenever a company already holds this domain. There is no
 * "would you like to join or create?" prompt, because offering the choice
 * is how duplicates get made — the person who is unsure picks create.
 */
export function decideEntry(email: string, existing: ExistingCompany | null): EntryDecision {
  const kind = classifyEmail(email)

  if (kind === 'INVALID') {
    return { action: 'REFUSE', message: 'That does not look like an email address.' }
  }

  if (kind === 'CONSUMER') {
    return {
      action: 'CONSULTANT',
      message: 'Signing you in as a consultant. Use your work email if you are setting up a company.',
    }
  }

  const domain = domainOf(email)!

  if (existing) {
    return {
      action: 'JOIN',
      company: existing,
      // A company can exist with nobody in it — imported, or seeded ahead
      // of its first sign-in. "0 colleagues" is true and reads as broken.
      message: existing.memberCount <= 1
        ? `${existing.name} is already on Etyme. Joining it.`
        : `${existing.name} is already here with ${existing.memberCount} colleagues. Joining them.`,
    }
  }

  return {
    action: 'CREATE',
    domain,
    message: `Nobody from ${domain} is here yet, so you are setting it up.`,
  }
}

// ── The company's own address ──────────────────────────────

/** Words a company cannot take as its address, because the product uses them. */
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'dashboard', 'login', 'signup', 'shared',
  'etyme', 'support', 'help', 'status', 'docs', 'mail', 'static', 'assets',
])

/**
 * A readable address from the domain: terumobct.com becomes terumobct.
 *
 * Collisions are numbered rather than refused. Two different companies can
 * genuinely own similar domains, and telling the second one to think of
 * another name is a poor first minute.
 */
export function slugFromDomain(domain: string, taken: Set<string>): string {
  // The registrable label, not the first one. A company on
  // mail.corp.com used to become "mail" — which is reserved, so it fell
  // through to "mail-2.etyme.com" and nobody could tell why.
  const base = (registrableLabel(domain) ?? domain.toLowerCase().replace(/^www\./, '').split('.')[0])
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'company'

  if (!RESERVED.has(base) && !taken.has(base)) return base

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

/**
 * A company name guessed from the domain, so the first screen is not an
 * empty box. Always shown for correction — a guess presented as a fact is
 * worse than no guess.
 */
export function guessCompanyName(domain: string): string {
  const base = domain.replace(/^www\./, '').split('.')[0]
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
