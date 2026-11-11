import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { domainOfEmail, isConsumerDomain } from '@/lib/company-domains'
import { unseal } from '@/lib/team-structure/directory/sealed'
import {
  claimsOf, deploymentSecret, discoveryProblem, openBlob, pkce, randomToken, safeOutboundUrl, sameToken, sealBlob, verifyIdToken,
  type Discovery, type Jwks,
} from '@/lib/identity/oidc'
import {
  MOCK_SECRET_REF, isMockIssuer, mockClientSecret, mockDiscovery, mockJwks, mockMayServe, mockSlugOf, redeemMockCode,
} from '@/lib/identity/mock-directory'
import { checkDoor } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { onVerifiedDomain, provision, verifiedDomainsOf } from '@/lib/identity/provision'

/**
 * THE DIRECTORY DOOR (founder, 2026-11-11): a company's own identity
 * provider, by OpenID Connect, as a sign-in door. Etyme never asks for a
 * password here; the company's directory authenticates, and Etyme inherits
 * its multi-factor and password rules and re-implements none.
 *
 *   1. start   — a work email (or the company's link) finds the company by
 *                its verified domain, and its directory that is turned on.
 *                The browser is sent to the directory with a state, a
 *                nonce and a PKCE challenge, all three sealed in a
 *                short-lived cookie only this deployment can read.
 *   2. finish  — the directory sends the browser back with a code. The
 *                state must match the cookie's; the code is exchanged with
 *                the PKCE verifier and the client secret; the id token is
 *                verified (lib/identity/oidc); the person is found by the
 *                issuer and the subject, never the email; the seat is the
 *                one SCIM made, or one made now where the company turned
 *                just-in-time on; the policy is asked (lib/identity/policy).
 *   3. ticket  — a sealed, two-minute ticket, spent once, which the
 *                sign-in page hands NextAuth's `directory-oidc` door so the
 *                session is minted by NextAuth like every other.
 *
 * SAML is configured and stored, and not built in pass 1 (KNOWN-LIMITS).
 */

export const STATE_COOKIE = 'etyme_sso'
export const TICKET_COOKIE = 'etyme_sso_ticket'
export const STATE_LIFE_SECONDS = 10 * 60
export const TICKET_LIFE_SECONDS = 2 * 60
export const DIRECTORY_PROVIDER_ID = 'directory-oidc'

/** The types the directory door signs in through in pass 1. */
const OIDC_TYPES = ['OIDC', 'ENTRA', 'GOOGLE_WORKSPACE'] as const

export const SAML_NOT_BUILT = 'Sign-in through a SAML directory is set up and stored, and not built yet in this pass. Use an OpenID Connect directory, or sign in another way your company allows.'

export function callbackUrl(): string {
  return `${appUrl()}/api/sso/callback`
}

/** Only a path inside this app: anything else lands on /start. */
export function safeNext(next: string | null | undefined): string {
  const n = String(next ?? '')
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/start'
}

type ProviderRow = {
  id: string
  companyId: string
  type: string
  issuer: string
  clientId: string | null
  metadataUrl: string | null
  secretRef: string | null
  secretSealed: string | null
  subjectClaim: string | null
  emailClaim: string | null
  groupsClaim: string | null
  enabled: boolean
}

const PROVIDER_SELECT = {
  id: true, companyId: true, type: true, issuer: true, clientId: true, metadataUrl: true, secretRef: true, secretSealed: true,
  subjectClaim: true, emailClaim: true, groupsClaim: true, enabled: true,
} as const

/** Only names of this shape are read from the secret store, so a stored reference can never read the deployment's own keys. */
export const SECRET_REF_SHAPE = /^ETYME_IDP_[A-Z0-9_]{1,60}$/

/** The client secret, from the platform's secret store or unsealed; null where neither is set or usable. */
export function providerSecret(p: Pick<ProviderRow, 'issuer' | 'secretRef' | 'secretSealed'>, env: Record<string, string | undefined> = process.env): string | null {
  const own = deploymentSecret(env)
  if (isMockIssuer(p.issuer)) {
    const slug = mockSlugOf(p.issuer)
    return own && slug && p.secretRef === MOCK_SECRET_REF ? mockClientSecret(slug, own) : null
  }
  if (p.secretRef && SECRET_REF_SHAPE.test(p.secretRef)) return env[p.secretRef]?.trim() || null
  if (p.secretSealed) return unseal(p.secretSealed, env)
  return null
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const u = safeOutboundUrl(url)
  if (!u) throw new Error('not an https address')
  const res = await fetch(u, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) })
  const text = await res.text()
  if (text.length > 256 * 1024) throw new Error('answer too large')
  if (!res.ok) throw new Error(`answered ${res.status}`)
  return JSON.parse(text)
}

/** The directory's discovery document, checked against its issuer. The mock's is computed in-process. */
export async function discoveryFor(p: Pick<ProviderRow, 'issuer' | 'metadataUrl'>): Promise<{ ok: true; doc: Discovery } | { ok: false; says: string }> {
  if (isMockIssuer(p.issuer)) return { ok: true, doc: mockDiscovery(mockSlugOf(p.issuer)!, appUrl()) }
  const where = p.metadataUrl || `${p.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
  if (!safeOutboundUrl(where)) return { ok: false, says: 'The discovery address must be an https address.' }
  try {
    const doc = await fetchJson(where)
    const problem = discoveryProblem(doc, p.issuer)
    return problem ? { ok: false, says: problem } : { ok: true, doc: doc as Discovery }
  } catch (e: any) {
    return { ok: false, says: `The directory's discovery address could not be read (${String(e?.message ?? 'no answer')}).` }
  }
}

async function jwksFor(p: ProviderRow, doc: Discovery): Promise<Jwks | null> {
  if (isMockIssuer(p.issuer)) {
    const own = deploymentSecret()
    return own ? mockJwks(own) : null
  }
  try {
    const j = (await fetchJson(doc.jwks_uri)) as Jwks
    return Array.isArray(j?.keys) ? j : null
  } catch {
    return null
  }
}

async function exchangeCode(p: ProviderRow, doc: Discovery, code: string, verifier: string, secret: string): Promise<{ ok: true; idToken: string } | { ok: false; says: string }> {
  if (isMockIssuer(p.issuer)) {
    const own = deploymentSecret()
    if (!own) return { ok: false, says: 'This deployment has no secret to run the mock directory with.' }
    const r = redeemMockCode({ slug: mockSlugOf(p.issuer)!, code, clientId: p.clientId ?? '', clientSecret: secret, redirectUri: callbackUrl(), codeVerifier: verifier }, own)
    return r.ok ? { ok: true, idToken: r.idToken } : { ok: false, says: r.says }
  }
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(), code_verifier: verifier })
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  const methods = doc.token_endpoint_auth_methods_supported ?? ['client_secret_basic']
  if (methods.includes('client_secret_basic')) {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(p.clientId ?? '')}:${encodeURIComponent(secret)}`).toString('base64')}`
  } else {
    body.set('client_id', p.clientId ?? '')
    body.set('client_secret', secret)
  }
  try {
    const j = (await fetchJson(doc.token_endpoint, { method: 'POST', headers, body: body.toString() })) as { id_token?: unknown }
    return typeof j?.id_token === 'string' ? { ok: true, idToken: j.id_token } : { ok: false, says: 'Your company\'s directory did not send back a sign-in token.' }
  } catch {
    // The directory's error body is not repeated: it can carry the code.
    return { ok: false, says: 'Your company\'s directory refused to exchange the sign-in code.' }
  }
}

// ── Finding the directory ─────────────────────────────────────────────

export type Found =
  | { ok: true; company: { id: string; name: string; slug: string }; provider: ProviderRow; domains: string[] }
  | { ok: false; code: string; says: string }

/** The company and its directory, by a work email's verified domain or by the company's own address (slug). */
export async function findDirectory(q: { email?: string | null; slug?: string | null }): Promise<Found> {
  let companyId: string | null = null
  const email = String(q.email ?? '').trim().toLowerCase()
  if (email) {
    const d = domainOfEmail(email)
    if (!d || isConsumerDomain(d)) return { ok: false, code: 'NoDirectory', says: 'A personal address has no company directory. Sign in another way.' }
    const c = await prisma.company.findFirst({
      where: { OR: [{ domain: d, domainVerified: true }, { claimedDomains: { some: { domain: d, verifiedAt: { not: null } } } }] },
      select: { id: true },
    })
    companyId = c?.id ?? null
  } else if (q.slug) {
    const c = await prisma.company.findUnique({ where: { slug: String(q.slug) }, select: { id: true } })
    companyId = c?.id ?? null
  }
  if (!companyId) return { ok: false, code: 'NoDirectory', says: 'We could not find a company directory for that address. Sign in another way, or ask your company\'s IT.' }

  const [company, providers, domains] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, slug: true } }),
    prisma.identityProvider.findMany({ where: { companyId, enabled: true }, select: PROVIDER_SELECT, orderBy: { createdAt: 'asc' } }),
    verifiedDomainsOf(companyId),
  ])
  const oidc = providers.find((p) => (OIDC_TYPES as readonly string[]).includes(p.type))
  if (!oidc) {
    if (providers.some((p) => p.type === 'SAML')) return { ok: false, code: 'SamlNotBuilt', says: SAML_NOT_BUILT }
    return { ok: false, code: 'NoDirectory', says: `${company.name} has not turned on a company directory for sign-in. Sign in another way, or ask your company's IT.` }
  }
  if (isMockIssuer(oidc.issuer) && (!mockMayServe(domains) || mockSlugOf(oidc.issuer) !== company.slug)) {
    return { ok: false, code: 'NoDirectory', says: 'The mock directory serves demo companies only.' }
  }
  return { ok: true, company, provider: oidc, domains }
}

// ── 1. start ──────────────────────────────────────────────────────────

interface StateBody extends Record<string, unknown> {
  providerId: string
  companyId: string
  state: string
  nonce: string
  verifier: string
  next: string
}

/** Where to send the browser, and the sealed cookie to set. Refuses with a sentence where the door cannot open. */
export async function startDirectorySignIn(f: Extract<Found, { ok: true }>, next: string): Promise<{ ok: true; redirectTo: string; cookie: string } | { ok: false; code: string; says: string }> {
  const own = deploymentSecret()
  if (!own) return { ok: false, code: 'NoDirectory', says: 'This deployment is not set up to sign anybody in through a directory yet.' }
  if (!f.provider.clientId) return { ok: false, code: 'NoDirectory', says: `${f.company.name}'s directory has no client id set.` }
  const disc = await discoveryFor(f.provider)
  if (!disc.ok) return { ok: false, code: 'DirectoryDown', says: disc.says }
  const state = randomToken(24)
  const nonce = randomToken(24)
  const { verifier, challenge } = pkce()
  const url = new URL(disc.doc.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', f.provider.clientId)
  url.searchParams.set('redirect_uri', callbackUrl())
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  const body: StateBody = { providerId: f.provider.id, companyId: f.company.id, state, nonce, verifier, next: safeNext(next) }
  return { ok: true, redirectTo: url.toString(), cookie: sealBlob(body, 'sso-state', STATE_LIFE_SECONDS, own) }
}

// ── 2. finish ─────────────────────────────────────────────────────────

interface TicketBody extends Record<string, unknown> {
  eid: string
  at: string
  next: string
}

async function refuse(companyId: string, email: string | null, says: string, code = 'DirectoryRefused'): Promise<{ ok: false; code: string; says: string }> {
  let personId: string | null = null
  if (email) personId = (await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } }).catch(() => null))?.id ?? null
  await recordIdentityEvent({
    event: 'JOIN_REFUSED_BY_POLICY', companyId, actorPersonId: personId,
    subject: personId ? { personId } : { companyId }, policy: 'OPEN', surface: 'DIRECTORY',
    says: `Refused a directory sign-in${email ? ` for ${email}` : ''}: ${says}`,
  })
  return { ok: false, code, says }
}

/**
 * The directory sent the browser back. Every check named at the top of
 * this file, in order; a refusal's row is written before it is answered.
 */
export async function finishDirectorySignIn(a: { cookie: string | null | undefined; state: string | null; code: string | null; error: string | null }): Promise<
  | { ok: true; ticket: string; next: string }
  | { ok: false; code: string; says: string }
> {
  const own = deploymentSecret()
  const s = own ? openBlob<StateBody>(a.cookie, 'sso-state', own) : null
  if (!own || !s) return { ok: false, code: 'DirectoryRefused', says: 'This sign-in was started in another browser, or more than ten minutes ago. Start again.' }
  if (!sameToken(a.state, s.state)) return { ok: false, code: 'DirectoryRefused', says: 'This sign-in does not match the one this browser started. Start again.' }
  if (a.error) return refuse(s.companyId, null, 'Your company\'s directory did not sign you in.')
  if (!a.code) return refuse(s.companyId, null, 'Your company\'s directory sent no sign-in code.')

  const provider = await prisma.identityProvider.findFirst({ where: { id: s.providerId, companyId: s.companyId, enabled: true }, select: PROVIDER_SELECT })
  if (!provider) return refuse(s.companyId, null, 'That directory has been turned off since you started. Start again.')
  const domains = await verifiedDomainsOf(provider.companyId)
  if (isMockIssuer(provider.issuer) && !mockMayServe(domains)) return refuse(s.companyId, null, 'The mock directory serves demo companies only.')
  const secret = providerSecret(provider)
  if (!secret) return refuse(s.companyId, null, 'The directory\'s client secret is not set up on this deployment.')
  const disc = await discoveryFor(provider)
  if (!disc.ok) return refuse(s.companyId, null, disc.says)
  const exchanged = await exchangeCode(provider, disc.doc, a.code, s.verifier, secret)
  if (!exchanged.ok) return refuse(s.companyId, null, exchanged.says)
  const jwks = await jwksFor(provider, disc.doc)
  if (!jwks) return refuse(s.companyId, null, 'The directory\'s signing keys could not be read.')
  const v = verifyIdToken({ token: exchanged.idToken, jwks, issuer: provider.issuer, audience: provider.clientId ?? '', nonce: s.nonce })
  if (!v.ok) return refuse(s.companyId, null, v.says)

  const who = claimsOf(v.claims, provider)
  if (!who.subject) return refuse(s.companyId, null, 'The sign-in token does not carry the claim your company named for who a person is.')
  if (!who.email) return refuse(s.companyId, null, 'Your company\'s directory did not send an email address to show.')
  if (!onVerifiedDomain(who.email, domains)) {
    return refuse(s.companyId, who.email, `${who.email} is not on one of the company's verified domains, so its directory cannot sign it in here.`)
  }

  // Who the person is: the issuer and the subject.
  let ei = await prisma.externalIdentity.findUnique({
    where: { issuer_subject: { issuer: provider.issuer, subject: who.subject } },
    select: { id: true, companyId: true, personId: true, disabledAt: true },
  })
  if (ei && ei.companyId !== provider.companyId) return refuse(s.companyId, who.email, 'That directory identity belongs to another company on Etyme.')
  if (ei?.disabledAt) return refuse(s.companyId, who.email, 'Your company\'s directory has turned your account off. Ask your company\'s IT.')
  const pol = await prisma.companySignInPolicy.findUnique({ where: { companyId: provider.companyId }, select: { jit: true } })
  if (!ei) {
    if (!pol?.jit) return refuse(s.companyId, who.email, 'Your company\'s directory knows you, but it has not given you a seat on Etyme yet. Ask your company\'s IT to assign you.')
    const made = await provision({
      companyId: provider.companyId, identityProviderId: provider.id, issuer: provider.issuer, subject: who.subject,
      email: who.email, name: who.name, groups: who.groups, source: 'JIT', surface: 'DIRECTORY',
    })
    if (!made.ok) return refuse(s.companyId, who.email, made.says)
    ei = { id: made.externalIdentityId, companyId: provider.companyId, personId: made.personId, disabledAt: null }
  }

  const [person, seat] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { id: ei.personId }, select: { id: true, primaryEmail: true } }),
    prisma.context.findFirst({ where: { personId: ei.personId, companyId: provider.companyId, revokedAt: null, suspendedAt: null }, select: { id: true } }),
  ])
  if (!seat) return refuse(s.companyId, who.email, 'Your seat at this company is turned off. Ask an Owner or Admin there.')

  // The company's sign-in policy, the same one every door asks.
  const door = await checkDoor({ door: 'DIRECTORY', email: person.primaryEmail, targetCompanyId: provider.companyId, issuer: provider.issuer, surface: 'DIRECTORY', subjectPersonId: person.id })
  if (!door.allowed) return { ok: false, code: 'DirectoryOnly', says: door.says }

  // The ticket is spent by comparing this stamp, so it opens one session.
  const at = new Date()
  await prisma.externalIdentity.update({ where: { id: ei.id }, data: { lastSignInAt: at, email: who.email } })
  const ticket: TicketBody = { eid: ei.id, at: at.toISOString(), next: s.next }
  return { ok: true, ticket: sealBlob(ticket, 'sso-ticket', TICKET_LIFE_SECONDS, own), next: s.next }
}

// ── 3. the ticket, spent once ─────────────────────────────────────────

/** Read a cookie out of a raw Cookie header. */
export function cookieFrom(header: string | null | undefined, name: string): string | null {
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

/**
 * Spend the ticket: one session per directory sign-in. The stamp the ticket
 * carries must still be the identity's, and is moved on as it is spent, so
 * a second use of the same ticket finds nothing to compare against.
 */
export async function spendTicket(sealed: string | null | undefined): Promise<{ personId: string; email: string; issuer: string } | null> {
  const own = deploymentSecret()
  const t = own ? openBlob<TicketBody>(sealed, 'sso-ticket', own) : null
  if (!t) return null
  const at = new Date(t.at)
  const spent = await prisma.externalIdentity.updateMany({
    where: { id: t.eid, lastSignInAt: at, disabledAt: null },
    data: { lastSignInAt: new Date(at.getTime() + 1) },
  })
  if (spent.count !== 1) return null
  const ei = await prisma.externalIdentity.findUnique({ where: { id: t.eid }, select: { issuer: true, person: { select: { id: true, primaryEmail: true } } } })
  return ei ? { personId: ei.person.id, email: ei.person.primaryEmail, issuer: ei.issuer } : null
}
