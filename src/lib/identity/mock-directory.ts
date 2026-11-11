import { createHmac, createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from 'node:crypto'
import { reservedDomain } from '@/lib/demo-company'
import { openBlob, pkceChallenge, sameToken, sealBlob, type Discovery, type Jwks } from '@/lib/identity/oidc'

/**
 * THE MOCK DIRECTORY. A stand-in for a client's own identity provider, so
 * the demo can show "your team signs in through your company's directory"
 * without a real one (founder, 2026-11-11: "a mock identity provider ...
 * gated to reserved demo addresses ... It is a mock and KNOWN-LIMITS.md
 * says so").
 *
 * It is a mock, and only ever a mock:
 *  - Its issuer is `https://mock-directory.etyme.invalid/<company>`, a name
 *    nobody can register, so no real directory can ever share it.
 *  - It serves a company only where every verified domain the company
 *    holds is a reserved one (.example, .invalid, .local) and it holds at
 *    least one. A real company can never be signed in through it; the
 *    settings route refuses to save its issuer for one, and the directory
 *    door refuses it again at sign-in.
 *  - It asks nobody for a password. Its sign-in page is a list of the
 *    people it holds; picking one is the mock's whole idea of proof.
 *  - It signs with an Ed25519 key derived from the deployment's own secret,
 *    so every function instance holds the same key with nothing stored.
 *
 * Etyme's side of the door reads it exactly as it reads a real directory:
 * the discovery document, the code exchanged with PKCE and the client
 * secret, the id token's signature checked against the published key, its
 * issuer, audience, dates and nonce. The one difference is that the token
 * and key requests are answered in-process rather than over the network
 * (lib/identity/directory), so a preview behind deployment protection can
 * still run the demo.
 */

export const MOCK_ISSUER_BASE = 'https://mock-directory.etyme.invalid/'
export const MOCK_KID = 'etyme-mock-1'
const CODE_LIFE_SECONDS = 60
const TOKEN_LIFE_SECONDS = 5 * 60

export function mockIssuerFor(slug: string): string {
  return `${MOCK_ISSUER_BASE}${slug}`
}

export function isMockIssuer(issuer: string | null | undefined): boolean {
  return String(issuer ?? '').startsWith(MOCK_ISSUER_BASE)
}

export function mockSlugOf(issuer: string): string | null {
  return isMockIssuer(issuer) ? issuer.slice(MOCK_ISSUER_BASE.length) || null : null
}

/** Whether the mock may serve a company: only one whose every verified domain is a reserved name, and that holds one. */
export function mockMayServe(verifiedDomains: readonly string[]): boolean {
  return verifiedDomains.length > 0 && verifiedDomains.every((d) => reservedDomain(d))
}

export function mockClientId(slug: string): string {
  return `etyme-mock-${slug}`
}

/** The mock's client secret, derived, never stored; both ends compute it. */
export function mockClientSecret(slug: string, secret: string): string {
  return createHmac('sha256', secret).update(`etyme mock directory client secret v1\u0000${slug}`).digest('base64url')
}

/** The marker the provider row carries in `secretRef` for the mock's derived secret. */
export const MOCK_SECRET_REF = 'MOCK_DIRECTORY_DERIVED'

// ── The key ───────────────────────────────────────────────────────────

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

function mockPrivateKey(secret: string): KeyObject {
  const seed = createHmac('sha256', secret).update('etyme mock directory signing key v1').digest()
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' })
}

export function mockJwks(secret: string): Jwks {
  const jwk = createPublicKey(mockPrivateKey(secret)).export({ format: 'jwk' }) as { kty: string; crv: string; x: string }
  return { keys: [{ kty: jwk.kty, crv: jwk.crv, x: jwk.x, kid: MOCK_KID, alg: 'EdDSA', use: 'sig' }] }
}

export function mockDiscovery(slug: string, origin: string): Discovery {
  const base = `${origin}/api/mock-directory/${encodeURIComponent(slug)}`
  return {
    issuer: mockIssuerFor(slug),
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    jwks_uri: `${base}/jwks`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  }
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: MOCK_KID })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = cryptoSign(null, Buffer.from(`${head}.${body}`), mockPrivateKey(secret))
  return `${head}.${body}.${sig.toString('base64url')}`
}

// ── A person at the mock directory ────────────────────────────────────

export interface MockPerson {
  subject: string
  email: string
  name: string
  groups: string[]
}

interface CodeBody extends Record<string, unknown> {
  slug: string
  sub: string
  email: string
  name: string
  groups: string[]
  nonce: string
  clientId: string
  redirectUri: string
  codeChallenge: string
}

/** The one-minute code the mock hands the browser after a person is picked. Sealed, so only this deployment reads it. */
export function issueMockCode(a: { slug: string; person: MockPerson; nonce: string; clientId: string; redirectUri: string; codeChallenge: string }, secret: string, now = Date.now()): string {
  const body: CodeBody = {
    slug: a.slug, sub: a.person.subject, email: a.person.email, name: a.person.name, groups: a.person.groups,
    nonce: a.nonce, clientId: a.clientId, redirectUri: a.redirectUri, codeChallenge: a.codeChallenge,
  }
  return sealBlob(body, 'mock-directory-code', CODE_LIFE_SECONDS, secret, now)
}

/**
 * The token endpoint: the code exchanged for an id token, checked as a real
 * directory checks it — the client id and secret, the redirect address the
 * code was issued for, and the PKCE verifier against the challenge.
 */
export function redeemMockCode(a: {
  slug: string
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
  codeVerifier: string
}, secret: string, now = Date.now()): { ok: true; idToken: string; sub: string } | { ok: false; error: string; says: string } {
  const c = openBlob<CodeBody>(a.code, 'mock-directory-code', secret, now)
  if (!c || c.slug !== a.slug) return { ok: false, error: 'invalid_grant', says: 'The code is not one the mock directory issued, or it ran out.' }
  if (a.clientId !== mockClientId(a.slug) || !sameToken(a.clientSecret, mockClientSecret(a.slug, secret)) || c.clientId !== a.clientId) {
    return { ok: false, error: 'invalid_client', says: 'The client id or secret is not the mock directory\'s.' }
  }
  if (c.redirectUri !== a.redirectUri) return { ok: false, error: 'invalid_grant', says: 'The code was issued for a different redirect address.' }
  if (!a.codeVerifier || !sameToken(pkceChallenge(a.codeVerifier), c.codeChallenge)) {
    return { ok: false, error: 'invalid_grant', says: 'The PKCE verifier does not match the challenge.' }
  }
  const iat = Math.floor(now / 1000)
  const idToken = signJwt({
    iss: mockIssuerFor(a.slug), aud: a.clientId, sub: c.sub, email: c.email, name: c.name, groups: c.groups,
    nonce: c.nonce, iat, exp: iat + TOKEN_LIFE_SECONDS,
  }, secret)
  return { ok: true, idToken, sub: c.sub }
}

/** A subject for somebody typed into the mock as new (just-in-time sign-in), stable for the address. */
export function mockSubjectFor(email: string): string {
  return `mock-${createHmac('sha256', 'etyme mock subject').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)}`
}
