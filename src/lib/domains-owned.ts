/**
 * The address a company lives at.
 *
 * Sign-up guesses one from the email domain — terumobct.com becomes
 * terumobct.etyme.com — and until now nothing could change it. Which is
 * fine for ninety seconds and wrong forever after: companies rebrand, the
 * guess is sometimes ugly, and a firm with its own domain wants its own
 * address rather than a subdomain of ours.
 *
 * Two things are handled here, and they are different.
 *
 * **A subdomain** is ours to give. Changing one is instant and free, and
 * the only real cost is that every link anybody saved stops working — so
 * the old one is kept and redirects rather than being released.
 *
 * **A custom domain** is theirs, and we cannot simply believe them. Anybody
 * can type `google.com` into a form. So a custom domain is unverified until
 * a DNS record only its owner could publish is visible, and it serves
 * nothing until then.
 */

/**
 * Names nobody may take.
 *
 * Three kinds, and the third is the one people forget. Ours (`api`,
 * `app`), the ones mail and certificates need (`mail`, `mx`,
 * `autodiscover`, `_acme-challenge`), and the ones that would let somebody
 * impersonate the platform to their own customers (`secure`, `billing`,
 * `verify`).
 */
export const RESERVED_SUBDOMAINS = new Set([
  // Ours
  'www', 'api', 'app', 'admin', 'dashboard', 'login', 'signup', 'signin',
  'auth', 'etyme', 'shared', 'static', 'assets', 'cdn', 'docs', 'status',
  'support', 'help', 'blog', 'about', 'legal', 'privacy', 'terms',
  // Where a listed supplier takes possession of their own record. Every
  // invitation in the product points at this one address.
  'claim',
  // Where a supplier answers a role without an account. Every
  // invitation email points at this address.
  'answer',
  // Infrastructure that must not be shadowed
  'mail', 'smtp', 'imap', 'pop', 'mx', 'ns', 'ns1', 'ns2', 'dns',
  'autodiscover', 'autoconfig', '_acme-challenge', '_dmarc', 'dkim',
  'localhost', 'test', 'staging', 'dev', 'preview',
  // Words that would let a company impersonate the platform to its own
  // customers. "secure.etyme.com" reads as ours, not theirs.
  'secure', 'billing', 'payment', 'payments', 'verify', 'verification',
  'account', 'accounts', 'my', 'portal', 'internal', 'root', 'system',
])

export interface SubdomainVerdict {
  ok: boolean
  /** Cleaned up, when it is usable. */
  value: string | null
  reason: string
}

/**
 * Is this a subdomain somebody may have?
 *
 * Refusals say which rule was broken, because "invalid subdomain" sends
 * somebody to guess, and guessing at a form is how people give up.
 */
export function checkSubdomain(raw: string, taken: Set<string>): SubdomainVerdict {
  const value = raw.trim().toLowerCase()

  if (!value) {
    return { ok: false, value: null, reason: 'Type the address you want.' }
  }
  if (value.length < 3) {
    return { ok: false, value: null, reason: 'Too short — three characters or more.' }
  }
  if (value.length > 63) {
    // Not our rule. A DNS label cannot exceed 63 characters.
    return { ok: false, value: null, reason: 'Too long — DNS does not allow more than 63 characters.' }
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    return {
      ok: false,
      value: null,
      reason: 'Letters, numbers and hyphens only. No spaces, dots or underscores.',
    }
  }
  if (value.startsWith('-') || value.endsWith('-')) {
    return { ok: false, value: null, reason: 'Cannot start or end with a hyphen.' }
  }
  if (value.includes('--')) {
    // Reserved by IDNA for punycode. A name with a double hyphen in the
    // third and fourth position is read as an encoded international name.
    return { ok: false, value: null, reason: 'Two hyphens together are reserved by DNS for encoded names.' }
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return {
      ok: false,
      value: null,
      reason: `${value} is kept back — it is either ours, or it belongs to mail and certificates, or it would read as part of Etyme rather than as you.`,
    }
  }
  if (taken.has(value)) {
    return { ok: false, value: null, reason: `${value}.etyme.com is already somebody else's.` }
  }

  return { ok: true, value, reason: `${value}.etyme.com is free.` }
}

// ── Custom domains ────────────────────────────────────────────────────

export interface DomainVerdict {
  ok: boolean
  value: string | null
  reason: string
}

/**
 * Is this a domain somebody could plausibly own?
 *
 * Shape only. Whether they actually own it is settled by DNS, below —
 * nothing here is evidence of anything.
 */
export function checkCustomDomain(raw: string, taken: Set<string>): DomainVerdict {
  let value = raw.trim().toLowerCase()

  // People paste a URL because that is what is in their address bar.
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')

  if (!value) {
    return { ok: false, value: null, reason: 'Type the domain you want to use.' }
  }
  if (!value.includes('.')) {
    return { ok: false, value: null, reason: 'A full domain, like talent.yourcompany.com.' }
  }
  if (value.length > 253) {
    return { ok: false, value: null, reason: 'Too long to be a domain name.' }
  }

  const labels = value.split('.')
  for (const label of labels) {
    if (!/^[a-z0-9-]+$/.test(label) || label.startsWith('-') || label.endsWith('-') || label.length > 63) {
      return { ok: false, value: null, reason: `"${label}" is not a valid part of a domain name.` }
    }
  }

  if (value.endsWith('.etyme.com') || value === 'etyme.com') {
    return {
      ok: false,
      value: null,
      reason: 'That is one of ours. Change your Etyme address instead — it is the field above.',
    }
  }
  if (taken.has(value)) {
    return { ok: false, value: null, reason: `${value} is already mapped to another company.` }
  }

  return { ok: true, value, reason: `${value} looks right. Next you prove you own it.` }
}

/**
 * The record they add to prove ownership.
 *
 * A TXT record on a name only somebody with control of the zone can
 * publish. The token is per company and per domain, so a record copied
 * from one company's screen proves nothing on another's.
 */
export function verificationRecord(domain: string, token: string): {
  type: 'TXT'
  name: string
  value: string
  instruction: string
} {
  return {
    type: 'TXT',
    name: `_etyme-verify.${domain}`,
    value: `etyme-domain-verification=${token}`,
    instruction:
      'Add this to your DNS, then come back and check. It usually appears within a few minutes, sometimes an hour. You can leave this page.',
  }
}

/**
 * Where it points once it is verified.
 *
 * A CNAME rather than an A record, because our addresses change and a
 * hardcoded IP in somebody else's zone file is an outage waiting for the
 * day we move.
 */
export function servingRecord(domain: string): {
  type: 'CNAME' | 'ALIAS'
  name: string
  value: string
  note: string
} {
  const apex = domain.split('.').length === 2
  return {
    // An apex domain cannot carry a CNAME. Most registrars offer ALIAS or
    // ANAME for exactly this, and saying so saves a support conversation.
    type: apex ? 'ALIAS' : 'CNAME',
    name: domain,
    value: 'cname.etyme.com',
    note: apex
      ? 'A bare domain cannot hold a CNAME, so use ALIAS or ANAME — most registrars offer one. If yours does not, use a subdomain like talent.yourcompany.com instead.'
      : 'Point it here and we handle the certificate.',
  }
}

// ── Changing a subdomain ──────────────────────────────────────────────

export interface ChangeAssessment {
  allowed: boolean
  /** What breaks, said before anybody clicks. */
  consequences: string[]
  reason: string
}

/**
 * What changing an address costs.
 *
 * The old subdomain is kept and redirects rather than being released, so
 * saved links and bookmarks keep working. That is the whole reason this is
 * safe to offer at all — without it, changing an address is a decision
 * somebody regrets on Monday.
 *
 * Released subdomains are never handed to another company. A name that
 * used to be a firm's address, given to somebody else, means old links now
 * land on a stranger's data.
 */
export function assessSubdomainChange(
  current: string,
  next: string,
  aliasCount: number
): ChangeAssessment {
  if (current === next) {
    return { allowed: false, consequences: [], reason: 'That is already your address.' }
  }

  const consequences = [
    `${current}.etyme.com will keep working and send people to ${next}.etyme.com, so saved links do not break.`,
    'Anything you have already sent — invitations, document requests, invoices — keeps working.',
  ]

  // A company changing address repeatedly is usually confused rather than
  // rebranding, and each old name is one more thing to keep alive forever.
  if (aliasCount >= 3) {
    consequences.push(
      `You have changed this ${aliasCount} times. Every old address is kept alive forever, so it is worth settling on one.`
    )
  }

  return {
    allowed: true,
    consequences,
    reason: `Your address becomes ${next}.etyme.com.`,
  }
}

/**
 * Which host is being asked for, and what that means.
 *
 * Used by the request path to decide whose company a visitor is looking
 * at. Returns null for the platform's own hosts, which are not a tenant.
 */
export function tenantFromHost(host: string, platformHost = 'etyme.com'): {
  kind: 'SUBDOMAIN' | 'CUSTOM' | 'PLATFORM'
  value: string | null
} {
  const clean = host.toLowerCase().split(':')[0]

  if (clean === platformHost || clean === `www.${platformHost}`) {
    return { kind: 'PLATFORM', value: null }
  }

  if (clean.endsWith(`.${platformHost}`)) {
    const sub = clean.slice(0, -(platformHost.length + 1))
    // Only a single label is a tenant. Anything deeper is ours.
    if (!sub.includes('.') && !RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: 'SUBDOMAIN', value: sub }
    }
    return { kind: 'PLATFORM', value: null }
  }

  // Local development is not a tenant.
  if (clean === 'localhost' || clean.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(clean)) {
    return { kind: 'PLATFORM', value: null }
  }

  return { kind: 'CUSTOM', value: clean }
}
