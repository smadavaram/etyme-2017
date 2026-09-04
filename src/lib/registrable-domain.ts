/**
 * Which domain a company actually is.
 *
 * The whole join-beats-create design rests on one idea: the verified work
 * email domain **is** the company. So the domain has to be the same string
 * for everybody who works there, and it was not.
 *
 * Somebody signing in from `user@mail.corp.com` stored `mail.corp.com`.
 * Their colleague on `user@corp.com` then matched nothing and created a
 * second company — two tenants for one organisation, each unable to see
 * the other's requisitions, invoices or people. That is the exact failure
 * the design exists to prevent, arriving through the back door.
 *
 * The answer is to reduce every email domain to the one somebody actually
 * registered: `mail.corp.com` and `corp.com` both become `corp.com`.
 *
 * The full public suffix list is thousands of entries and changes monthly.
 * This carries the multi-part suffixes that real companies use, which is a
 * far smaller set — and when something is missing the failure is safe: an
 * unknown suffix is treated as a normal two-label domain, which is right
 * for the overwhelming majority and wrong only in the direction of
 * splitting a tenant, never of merging two.
 */

/**
 * Suffixes where the registrable name is the third label from the right.
 *
 * `bbc.co.uk` is registrable; `co.uk` is not. Getting this wrong in the
 * other direction would be far worse — treating `co.uk` as registrable
 * would put every British company into one tenant.
 */
const MULTI_PART_SUFFIXES = new Set([
  // United Kingdom
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk',
  // India
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'ac.in', 'edu.in', 'gov.in',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'ac.nz', 'govt.nz', 'school.nz',
  // Brazil
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  // Japan
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ad.jp',
  // South Africa
  'co.za', 'net.za', 'org.za', 'gov.za', 'ac.za',
  // Mexico, Argentina, Colombia
  'com.mx', 'org.mx', 'gob.mx', 'com.ar', 'net.ar', 'org.ar', 'com.co', 'net.co',
  // Singapore, Hong Kong, Malaysia, Philippines
  'com.sg', 'net.sg', 'org.sg', 'edu.sg', 'gov.sg',
  'com.hk', 'org.hk', 'net.hk', 'edu.hk', 'gov.hk',
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my',
  'com.ph', 'net.ph', 'org.ph',
  // Europe
  'com.tr', 'com.pl', 'com.ua', 'com.ru', 'com.cy', 'com.gr', 'com.es', 'com.pt',
  'co.at', 'or.at', 'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il',
  // Middle East
  'com.sa', 'net.sa', 'org.sa', 'gov.sa',
  'ae.org', 'co.ae', 'net.ae', 'gov.ae',
  // Canada provincials that behave this way in practice
  'gc.ca', 'on.ca', 'qc.ca', 'bc.ca', 'ab.ca',
  // Common hosted platforms — a company on one of these is not the
  // platform, and merging them would be catastrophic.
  'github.io', 'vercel.app', 'netlify.app', 'herokuapp.com',
  'azurewebsites.net', 'cloudfront.net', 'appspot.com', 'firebaseapp.com',
  'pages.dev', 'workers.dev', 'onmicrosoft.com',
])

/**
 * The domain somebody registered.
 *
 *   corp.com            -> corp.com
 *   mail.corp.com       -> corp.com
 *   eu.mail.corp.com    -> corp.com
 *   corp.co.uk          -> corp.co.uk
 *   mail.corp.co.uk     -> corp.co.uk
 *
 * Returns null for anything that is not a domain at all.
 */
export function registrableDomain(input: string): string | null {
  const clean = input
    .trim()
    .toLowerCase()
    // People paste addresses and URLs.
    .replace(/^.*@/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    // A trailing dot is a valid fully-qualified name and means the same
    // thing.
    .replace(/\.$/, '')

  if (!clean || !clean.includes('.')) return null
  if (clean.includes(' ')) return null

  const labels = clean.split('.')
  if (labels.some((l) => l.length === 0)) return null
  if (labels.some((l) => !/^[a-z0-9-]+$/.test(l))) return null

  const lastTwo = labels.slice(-2).join('.')

  // The suffix check comes first. Otherwise a bare `co.uk` is two labels
  // and would be returned as a company, which would put every British
  // firm into one tenant.
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join('.') : null
  }

  return lastTwo
}

/**
 * The name to build an address from.
 *
 * `mail.corp.co.uk` becomes `corp`, not `mail` and not `corp.co`. The old
 * code took the first label, which turned a company on `mail.corp.com`
 * into `mail` — a reserved name, so it fell through to `mail-2`.
 */
export function registrableLabel(input: string): string | null {
  const registrable = registrableDomain(input)
  if (!registrable) return null
  return registrable.split('.')[0] || null
}

/**
 * Do these two addresses belong to the same organisation?
 *
 * The question join-beats-create actually asks. Answering it on the raw
 * domain splits a company across its mail subdomains.
 */
export function sameOrganisation(a: string, b: string): boolean {
  const ra = registrableDomain(a)
  const rb = registrableDomain(b)
  return ra !== null && ra === rb
}
