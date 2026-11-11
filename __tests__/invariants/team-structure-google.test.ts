import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { seal, unseal, sealingKey, signState, readState, STATE_LIFE_SECONDS } from '@/lib/team-structure/directory/sealed'
import { consentUrl, exchangeCode, googleReadiness, GOOGLE_SCOPE, redirectUri } from '@/lib/team-structure/directory/google'
import { directorySources, readGoogle } from '@/lib/team-structure/directory/providers'
import { googleOutcomeSays } from '@/lib/team-structure/directory/outcome'

/**
 * Google Workspace as the directory (founder, 2026-11-11): the stored
 * access is sealed, the consent asks for one read-only scope, the state is
 * bound to the seat, and the card says plainly what is missing.
 */

const KEY = { ETYME_DIRECTORY_TOKEN_KEY: Buffer.alloc(32, 3).toString('base64') }
const ALL = { ...KEY, ETYME_DIRECTORY_GOOGLE_CLIENT_ID: 'id', ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET: 'secret', ETYME_DIRECTORY_LIVE: '1' }

describe('the stored access', () => {
  it('a sealed refresh token does not contain the token, and opens only with the same key', () => {
    const sealed = seal('1//refresh-token-value', KEY)
    expect(sealed).not.toContain('refresh-token-value')
    expect(unseal(sealed, KEY)).toBe('1//refresh-token-value')
    expect(unseal(sealed, { ETYME_DIRECTORY_TOKEN_KEY: Buffer.alloc(32, 4).toString('base64') })).toBeNull()
    expect(unseal(sealed.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), KEY)).toBeNull()
  })

  it('a sealed value with any one byte of its secret changed does not open, whatever the nonce', () => {
    for (let n = 0; n < 50; n++) {
      const [v, iv, tag, body] = seal('1//refresh-token-value', KEY).split('.')
      const b = Buffer.from(body, 'base64url')
      b[n % b.length] ^= 0x01
      expect(unseal([v, iv, tag, b.toString('base64url')].join('.'), KEY)).toBeNull()
      const t = Buffer.from(tag, 'base64url')
      t[n % t.length] ^= 0x80
      expect(unseal([v, iv, t.toString('base64url'), body].join('.'), KEY)).toBeNull()
    }
  })

  it('a sealed value whose last character differs only in its spare bits does not open', () => {
    for (let n = 0; n < 50; n++) {
      const sealed = seal('1//refresh-token-value', KEY)
      expect(unseal(sealed.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), KEY)).toBeNull()
    }
  })

  it('two seals of one token differ, so a stored value says nothing about another', () => {
    expect(seal('same', KEY)).not.toBe(seal('same', KEY))
  })

  it('with no key, or a key that is not 32 bytes, nothing can be sealed', () => {
    expect(sealingKey({})).toBeNull()
    expect(sealingKey({ ETYME_DIRECTORY_TOKEN_KEY: 'short' })).toBeNull()
    expect(() => seal('x', {})).toThrow(/no key/)
  })
})

describe('the consent', () => {
  it('asks Google for the one read-only users scope and nothing else, offline, back to this app’s own address', () => {
    const u = new URL(consentUrl({ clientId: 'id', origin: 'https://etyme2040.vercel.app/', state: 's', domain: 'corvane.example' }))
    expect(u.searchParams.get('scope')).toBe(GOOGLE_SCOPE)
    expect(GOOGLE_SCOPE).toBe('https://www.googleapis.com/auth/admin.directory.user.readonly')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('include_granted_scopes')).toBeNull()
    expect(u.searchParams.get('redirect_uri')).toBe('https://etyme2040.vercel.app/api/settings/team-structure/directory')
    expect(redirectUri('https://etyme2040.vercel.app')).toBe(u.searchParams.get('redirect_uri'))
  })

  it('a state signed for one seat reads back, and is refused once altered, after ten minutes, or under another key', () => {
    const now = Date.UTC(2026, 10, 11, 12)
    const s = signState({ companyId: 'co', personId: 'p', domain: 'corvane.example' }, now, KEY)
    expect(readState(s, now, KEY)).toMatchObject({ companyId: 'co', personId: 'p', domain: 'corvane.example' })
    const [body, mac] = s.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), companyId: 'other' })).toString('base64url')
    expect(readState(`${forged}.${mac}`, now, KEY)).toBeNull()
    expect(readState(s, now + (STATE_LIFE_SECONDS + 1) * 1000, KEY)).toBeNull()
    expect(readState(s, now, { ETYME_DIRECTORY_TOKEN_KEY: Buffer.alloc(32, 9).toString('base64') })).toBeNull()
  })

  it('a grant of anything beyond read-only access to users keeps nothing, and Google is asked to forget it', async () => {
    const calls: string[] = []
    const f = vi.fn(async (url: string) => {
      calls.push(url)
      return url.includes('/revoke') ? new Response('{}') : new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', scope: `${GOOGLE_SCOPE} https://www.googleapis.com/auth/gmail.readonly` }))
    }) as unknown as typeof fetch
    await expect(exchangeCode({ code: 'c', clientId: 'id', clientSecret: 's', origin: 'https://x' }, f)).rejects.toMatchObject({ code: 'scope' })
    expect(calls.some((u) => u.includes('/revoke'))).toBe(true)
  })

  it('a grant with no lasting access keeps nothing', async () => {
    const f = (async (url: string) => (url.includes('/revoke') ? new Response('{}') : new Response(JSON.stringify({ access_token: 'a', scope: GOOGLE_SCOPE })))) as unknown as typeof fetch
    await expect(exchangeCode({ code: 'c', clientId: 'id', clientSecret: 's', origin: 'https://x' }, f)).rejects.toMatchObject({ code: 'no-refresh' })
  })
})

describe('the card', () => {
  it('with the switch, the Google app or the key missing, Google Workspace is not connected and says what is missing in words, never a setting’s name', () => {
    for (const env of [{ ...ALL, ETYME_DIRECTORY_LIVE: undefined }, { ...ALL, ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET: undefined }, { ...ALL, ETYME_DIRECTORY_TOKEN_KEY: undefined }]) {
      expect(googleReadiness(env).ready).toBe(false)
      const g = directorySources(env, { domain: 'corvane.example', connectedBy: 'Graham Ellery', connectedAt: '2026-11-11T00:00:00Z', lastReadAt: null, lastReadCount: null })[1]
      expect(g).toMatchObject({ key: 'GOOGLE', connected: false, connectable: false })
      expect(g.adminApproves).toMatch(/^Not set up on this deployment yet: /)
      expect(g.adminApproves).not.toMatch(/ETYME_|_ID|_SECRET|_KEY/)
    }
  })

  it('a client never reads a scope name or how the stored access is locked, only that Etyme has not turned it on here', () => {
    for (const env of [{}, { ...ALL, ETYME_DIRECTORY_TOKEN_KEY: undefined }, ALL]) {
      for (const s of directorySources(env)) {
        expect(s.adminApproves ?? '').not.toMatch(/admin\.directory|readonly|key that locks/)
      }
    }
    expect(directorySources({ ...ALL, ETYME_DIRECTORY_TOKEN_KEY: undefined })[1].adminApproves).toMatch(/^Not set up on this deployment yet: Etyme has not turned on Google Workspace here\./)
  })

  it('a source that is not connected and cannot be connected here draws no Connect and preview button', () => {
    const dialog = readFileSync('src/app/dashboard/settings/team-structure/import-dialog.tsx', 'utf8')
    expect(dialog).not.toContain('Connect and preview')
  })

  it('with everything set, Google can be connected, and once connected the card reads it as connected with no token in it', () => {
    expect(directorySources(ALL)[1]).toMatchObject({ connected: false, connectable: true })
    const g = directorySources(ALL, { domain: 'corvane.example', connectedBy: 'Graham Ellery', connectedAt: '2026-11-11T00:00:00Z', lastReadAt: null, lastReadCount: null })[1]
    expect(g).toMatchObject({ connected: true, connectable: false, adminApproves: null })
    expect(Object.keys(g.connection!)).toEqual(['domain', 'connectedBy', 'connectedAt', 'lastReadAt', 'lastReadCount'])
  })

  it('the directory is read for the connected domain only, never every domain of the Workspace', async () => {
    const asked: string[] = []
    const f = (async (url: string) => { asked.push(url); return new Response(JSON.stringify({ users: [] })) }) as unknown as typeof fetch
    await readGoogle('t', f, 50, 'corvane.example')
    expect(asked).toEqual(['https://admin.googleapis.com/admin/directory/v1/users?domain=corvane.example&projection=full&maxResults=500'])
  })

  it('what the screen says when Google sends the administrator back is chosen from a short code, never from words in the address', () => {
    expect(googleOutcomeSays('connected')).toMatchObject({ no: false })
    expect(googleOutcomeSays('scope')?.no).toBe(true)
    expect(googleOutcomeSays('Your account is hacked, call this number')).toBeNull()
    expect(googleOutcomeSays('toString')).toBeNull()
  })

  it('no route or screen in the directory reads the sealed token except to open it for Google', () => {
    const route = readFileSync('src/app/api/settings/team-structure/directory/route.ts', 'utf8')
    const dialog = readFileSync('src/app/dashboard/settings/team-structure/import-dialog.tsx', 'utf8')
    expect(dialog).not.toMatch(/tokenSealed|refresh_token|refreshToken/)
    // The card's read selects the connection's facts and never the sealed column.
    const view = route.slice(route.indexOf('async function connectionView'), route.indexOf('async function verifiedDomains'))
    expect(view).not.toContain('tokenSealed')
    // Nothing about a token is ever passed to a log or an alert.
    expect(route).not.toMatch(/reason:[^\n]*(refreshToken|accessToken|tokenSealed|got\.)/)
    expect(route).not.toMatch(/reportError\([^\n]*(refreshToken|accessToken|tokenSealed)/)
  })
})
