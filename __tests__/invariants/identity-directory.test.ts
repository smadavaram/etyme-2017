import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import { verifyIdToken, safeOutboundUrl, openBlob, sealBlob, discoveryProblem, type Jwks } from '@/lib/identity/oidc'
import {
  issueMockCode, redeemMockCode, mockJwks, mockClientId, mockClientSecret, mockIssuerFor, mockMayServe, isMockIssuer,
} from '@/lib/identity/mock-directory'
import { pkce } from '@/lib/identity/oidc'
import { providerSecret, safeNext, SECRET_REF_SHAPE } from '@/lib/identity/directory'
import { linkedInSeatRefusal, directoryOnlyLockout } from '@/lib/identity/policy'

/**
 * The company's own directory as a door (founder, 2026-11-11, stage B).
 *
 * Nobody is seated on a token that does not prove itself: its signature by
 * a key the directory publishes, its issuer, its audience, its dates and
 * the nonce this browser was sent with. The mock directory signs the way a
 * real one does and serves only demo companies on reserved domains.
 */

const SECRET = 'a-deployment-secret-for-the-tests-0123456789'
const ISS = 'https://login.example-directory.example/tenant-1/v2.0'
const AUD = 'etyme-client-1'
const NOW = Date.UTC(2026, 10, 11, 12, 0, 0)

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...(rsa.publicKey.export({ format: 'jwk' }) as any), kid: 'k1', alg: 'RS256', use: 'sig' }
const JWKS: Jwks = { keys: [jwk] }

function token(claims: Record<string, unknown>, opts: { alg?: string; key?: any; kid?: string } = {}) {
  const head = Buffer.from(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = opts.alg === 'none' ? Buffer.alloc(0) : cryptoSign('sha256', Buffer.from(`${head}.${body}`), opts.key ?? rsa.privateKey)
  return `${head}.${body}.${sig.toString('base64url')}`
}

const now = Math.floor(NOW / 1000)
const good = { iss: ISS, aud: AUD, sub: 'subject-42', email: 'ana@corvane.example', nonce: 'n-1', iat: now, exp: now + 300 }
const check = (t: string, nonce = 'n-1') => verifyIdToken({ token: t, jwks: JWKS, issuer: ISS, audience: AUD, nonce, now: NOW })

describe('a sign-in token from a company directory is verified before anybody is seated', () => {
  it('a token signed by the directory’s published key, for Etyme, in date, with this browser’s nonce, is accepted', () => {
    const v = check(token(good))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.claims.sub).toBe('subject-42')
  })

  it('a token signed by any other key is refused, whatever it says', () => {
    const v = check(token(good, { key: other.privateKey }))
    expect(v).toMatchObject({ ok: false, code: 'SIGNATURE' })
  })

  it('a token with no signature ("none") is refused', () => {
    expect(check(token(good, { alg: 'none' }))).toMatchObject({ ok: false, code: 'ALG' })
  })

  it('a token signed with a shared secret is refused, because a secret proves only that somebody held it', () => {
    expect(check(token(good, { alg: 'HS256' }))).toMatchObject({ ok: false, code: 'ALG' })
  })

  it('a token from another issuer is refused', () => {
    expect(check(token({ ...good, iss: 'https://attacker.example/' }))).toMatchObject({ ok: false, code: 'ISSUER' })
  })

  it('a token issued for another application is refused', () => {
    expect(check(token({ ...good, aud: 'someone-else' }))).toMatchObject({ ok: false, code: 'AUDIENCE' })
    expect(check(token({ ...good, aud: [AUD, 'someone-else'], azp: 'someone-else' }))).toMatchObject({ ok: false, code: 'AUDIENCE' })
  })

  it('a token that has run out is refused, and one with no expiry is refused', () => {
    expect(check(token({ ...good, exp: now - 120 }))).toMatchObject({ ok: false, code: 'EXPIRED' })
    const { exp: _exp, ...noExp } = good
    void _exp
    expect(check(token(noExp))).toMatchObject({ ok: false, code: 'EXPIRY' })
  })

  it('a token made for another sign-in (a different nonce) is refused', () => {
    expect(check(token(good), 'n-2')).toMatchObject({ ok: false, code: 'NONCE' })
  })

  it('a token naming a key the directory does not publish is refused', () => {
    expect(check(token(good, { kid: 'k-unknown' }))).toMatchObject({ ok: false, code: 'KEY' })
  })

  it('no refusal sentence repeats the token', () => {
    const t = token({ ...good, aud: 'x' })
    const v = check(t)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).not.toContain(t.split('.')[1])
  })
})

describe('the state, the nonce and the ticket are sealed and single-purpose', () => {
  it('a sealed blob opens only under its own label and only while in date', () => {
    const b = sealBlob({ a: 1 }, 'sso-state', 60, SECRET, NOW)
    expect(openBlob(b, 'sso-state', SECRET, NOW)?.a).toBe(1)
    expect(openBlob(b, 'sso-ticket', SECRET, NOW)).toBeNull()
    expect(openBlob(b, 'sso-state', SECRET + 'x', NOW)).toBeNull()
    expect(openBlob(b, 'sso-state', SECRET, NOW + 61_000)).toBeNull()
    expect(openBlob(b.slice(0, -2) + 'AA', 'sso-state', SECRET, NOW)).toBeNull()
  })

  it('after sign-in the browser is only ever sent to a path inside this app', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard')
    expect(safeNext('https://evil.example/')).toBe('/start')
    expect(safeNext('//evil.example')).toBe('/start')
    expect(safeNext('/\\evil.example')).toBe('/start')
  })

  it('Etyme fetches a directory only over https, never a private address, never with a password in the address', () => {
    const prod = { NODE_ENV: 'production' }
    expect(safeOutboundUrl('https://login.example.com/x', prod)).not.toBeNull()
    expect(safeOutboundUrl('http://login.example.com/x', prod)).toBeNull()
    expect(safeOutboundUrl('https://169.254.169.254/latest', prod)).toBeNull()
    expect(safeOutboundUrl('https://10.0.0.5/', prod)).toBeNull()
    expect(safeOutboundUrl('https://user:pw@login.example.com/', prod)).toBeNull()
    expect(safeOutboundUrl('http://localhost:3000/', prod)).toBeNull()
  })

  it('a discovery document that names another issuer is refused', () => {
    expect(discoveryProblem({ issuer: 'https://other.example', authorization_endpoint: 'https://a.example/a', token_endpoint: 'https://a.example/t', jwks_uri: 'https://a.example/k' }, ISS)).toMatch(/not https:\/\/login/)
  })

  it('a stored secret reference reads only the directory’s own names in the secret store, never the deployment’s keys', () => {
    const env = { NEXTAUTH_SECRET: SECRET, ETYME_IDP_CORVANE: 'the-client-secret' }
    expect(providerSecret({ issuer: ISS, secretRef: 'ETYME_IDP_CORVANE', secretSealed: null }, env)).toBe('the-client-secret')
    expect(providerSecret({ issuer: ISS, secretRef: 'NEXTAUTH_SECRET', secretSealed: null }, env)).toBeNull()
    expect(SECRET_REF_SHAPE.test('DATABASE_URL')).toBe(false)
  })
})

describe('the mock directory is a mock, for demo companies only', () => {
  it('it serves a company only where every verified domain is a reserved name, and never one with a real domain', () => {
    expect(mockMayServe(['northbend.example'])).toBe(true)
    expect(mockMayServe(['northbend.example', 'northbend.com'])).toBe(false)
    expect(mockMayServe(['acme.com'])).toBe(false)
    expect(mockMayServe([])).toBe(false)
    expect(isMockIssuer(mockIssuerFor('world-nike'))).toBe(true)
    expect(isMockIssuer(ISS)).toBe(false)
  })

  it('its token is signed the way a real directory signs, and checks against its published key', () => {
    const { verifier, challenge } = pkce()
    const redirectUri = 'http://localhost:3000/api/sso/callback'
    const code = issueMockCode({ slug: 'world-nike', person: { subject: 'nb-1', email: 'priya@northbend.example', name: 'Priya', groups: [] }, nonce: 'n-9', clientId: mockClientId('world-nike'), redirectUri, codeChallenge: challenge }, SECRET, NOW)
    const r = redeemMockCode({ slug: 'world-nike', code, clientId: mockClientId('world-nike'), clientSecret: mockClientSecret('world-nike', SECRET), redirectUri, codeVerifier: verifier }, SECRET, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = verifyIdToken({ token: r.idToken, jwks: mockJwks(SECRET), issuer: mockIssuerFor('world-nike'), audience: mockClientId('world-nike'), nonce: 'n-9', now: NOW })
    expect(v.ok).toBe(true)
  })

  it('its code is refused with the wrong PKCE verifier, the wrong client secret or another redirect address', () => {
    const { challenge } = pkce()
    const redirectUri = 'http://localhost:3000/api/sso/callback'
    const args = { slug: 'world-nike', person: { subject: 'nb-1', email: 'p@northbend.example', name: 'P', groups: [] }, nonce: 'n', clientId: mockClientId('world-nike'), redirectUri, codeChallenge: challenge }
    const code = issueMockCode(args, SECRET, NOW)
    const base = { slug: 'world-nike', code, clientId: mockClientId('world-nike'), clientSecret: mockClientSecret('world-nike', SECRET), redirectUri, codeVerifier: pkce().verifier }
    expect(redeemMockCode(base, SECRET, NOW)).toMatchObject({ ok: false, error: 'invalid_grant' })
    expect(redeemMockCode({ ...base, clientSecret: 'guess' }, SECRET, NOW)).toMatchObject({ ok: false, error: 'invalid_client' })
    expect(redeemMockCode({ ...base, redirectUri: 'https://evil.example/cb' }, SECRET, NOW)).toMatchObject({ ok: false, error: 'invalid_grant' })
    expect(redeemMockCode({ ...base, slug: 'world-other' }, SECRET, NOW)).toMatchObject({ ok: false })
  })
})

describe('who may come in through which door, beyond the directory', () => {
  it('a LinkedIn session is refused a seat at a company with colleagues, and allowed a one-person firm’s and a worker’s own', () => {
    expect(linkedInSeatRefusal('LINKEDIN', { name: 'Northbend Athletic', kind: 'CLIENT' })).toMatch(/workers and one-person firms/)
    expect(linkedInSeatRefusal('LINKEDIN', { name: 'Colleen Byrne LLC', kind: 'CONSULTANT_CORP' })).toBeNull()
    expect(linkedInSeatRefusal('LINKEDIN', null)).toBeNull()
    expect(linkedInSeatRefusal('GOOGLE_SOCIAL', { name: 'Northbend Athletic', kind: 'CLIENT' })).toBeNull()
  })

  it('directory only is chosen only from a session the company’s own directory signed in, so the Owner cannot lock themselves out', () => {
    const base = { to: 'SSO_ONLY' as const, issuers: [ISS], companyName: 'Northbend Athletic' }
    expect(directoryOnlyLockout({ ...base, door: 'PASSWORD', issuer: null })).toMatch(/through your company's directory once/)
    expect(directoryOnlyLockout({ ...base, door: 'DIRECTORY', issuer: 'https://other.example' })).not.toBeNull()
    expect(directoryOnlyLockout({ ...base, door: 'DIRECTORY', issuer: ISS })).toBeNull()
    expect(directoryOnlyLockout({ ...base, to: 'HYBRID', door: 'PASSWORD', issuer: null })).toBeNull()
  })
})
