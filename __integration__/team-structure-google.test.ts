import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { POST as directory, GET as directoryGet } from '@/app/api/settings/team-structure/directory/route'
import { corvaneSeatEmail } from '@/lib/seed-corvane'

/**
 * Google Workspace as the directory (founder, 2026-11-11, "Yes"): connected
 * once by the company's Workspace administrator, kept per company with the
 * refresh token sealed, read only, every read and every refusal logged.
 * Google's endpoints are answered by a stand-in here; nothing leaves the
 * machine.
 */

const DOMAIN = 'demo.etyme.local'
const OWNER = corvaneSeatEmail('owner', DOMAIN)
const AP = corvaneSeatEmail('ap', DOMAIN)
const VERIFIED = 'corvane-google.example'
const UNVERIFIED = 'corvane-unproved.example'
const REFRESH = 'rt-SECRET-refresh-7f3a9c'
const ACCESS = 'at-SECRET-access-1b2c'
let corvaneId = ''

const ENV = {
  ETYME_DIRECTORY_GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET: 'client-secret',
  ETYME_DIRECTORY_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  ETYME_DIRECTORY_LIVE: '1',
  NEXTAUTH_URL: 'http://localhost:3000',
}
const saved: Record<string, string | undefined> = {}
const setEnv = (on: Partial<typeof ENV>) => {
  for (const k of Object.keys(ENV) as (keyof typeof ENV)[]) {
    if (on[k] === undefined) delete process.env[k]
    else process.env[k] = on[k]
  }
}

/** Google, answered here: the token endpoint, the revoke endpoint and the users list. */
const asked: string[] = []
function google(opts: { scope?: string; refresh?: boolean; holdsDomain?: boolean } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    asked.push(String(url))
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      const form = new URLSearchParams(String(init?.body ?? ''))
      if (form.get('grant_type') === 'refresh_token') return new Response(JSON.stringify({ access_token: ACCESS, expires_in: 3600 }))
      return new Response(JSON.stringify({ access_token: ACCESS, ...(opts.refresh === false ? {} : { refresh_token: REFRESH }), scope: opts.scope ?? 'https://www.googleapis.com/auth/admin.directory.user.readonly', expires_in: 3600 }))
    }
    if (String(url).startsWith('https://oauth2.googleapis.com/revoke')) return new Response('{}')
    if (String(url).startsWith('https://admin.googleapis.com/admin/directory/v1/users')) {
      if (opts.holdsDomain === false) return new Response(JSON.stringify({ error: { message: 'Domain not found.' } }), { status: 400 })
      if (String(url).includes('maxResults=1&')) return new Response(JSON.stringify({ users: [{ customerId: 'C01abcd' }] }))
      return new Response(JSON.stringify({ users: [{ primaryEmail: `astrid@${VERIFIED}`, name: { fullName: 'Astrid Berge' }, organizations: [{ primary: true, department: 'Operations', title: 'Head of Operations' }] }] }))
    }
    return new Response('{}', { status: 404 })
  })
}

const post = async (body: unknown, who = OWNER) => {
  as(who)
  return json(await directory(req('POST', '/api/settings/team-structure/directory', body)))
}

/** Press Connect, then come back from Google with a code. */
async function connect(who = OWNER) {
  const start = await post({ source: 'GOOGLE', connect: true }, who)
  expect(start.status, JSON.stringify(start.body)).toBe(200)
  const state = new URL(start.body.data.url).searchParams.get('state')!
  as(who)
  const back = await directoryGet(req('GET', `/api/settings/team-structure/directory?code=abc&state=${encodeURIComponent(state)}`))
  return { start, state, back }
}

const refusals = () => prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: false } })
const reads = () => prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: true } })

beforeAll(async () => {
  for (const k of Object.keys(ENV)) saved[k] = process.env[k]
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
  await prisma.companyDomain.create({ data: { companyId: corvaneId, domain: VERIFIED, verifiedAt: new Date(), verifiedVia: 'DNS_TXT' } })
  await prisma.companyDomain.create({ data: { companyId: corvaneId, domain: UNVERIFIED } })
}, 600_000)

beforeEach(async () => {
  asked.length = 0
  setEnv(ENV)
  vi.stubGlobal('fetch', google())
  await prisma.directoryConnection.deleteMany({ where: { companyId: corvaneId } })
})

afterAll(() => {
  vi.unstubAllGlobals()
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
})

describe('connecting Corvane’s Google Workspace', () => {
  it('the consent goes to Google for one read-only scope on the verified domain, and the administrator comes back to this app’s own Team structure page', async () => {
    const { start, back } = await connect()
    const url = new URL(start.body.data.url)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/admin.directory.user.readonly')
    expect(url.searchParams.get('hd')).toBe(VERIFIED)
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/settings/team-structure/directory')
    expect(back.status).toBe(303)
    expect(back.headers.get('location')).toBe('http://localhost:3000/dashboard/settings/team-structure?google=connected')
    const row = await prisma.directoryConnection.findUniqueOrThrow({ where: { companyId_provider: { companyId: corvaneId, provider: 'GOOGLE' } }, include: { connectedBy: true } })
    expect(row).toMatchObject({ domain: VERIFIED, customerId: 'C01abcd' })
    expect(row.connectedBy?.name).toBe('Graham Ellery')
  })

  it('the refresh token is never stored in plain text, never returned by a route and never written in a log', async () => {
    await connect()
    const row = await prisma.directoryConnection.findUniqueOrThrow({ where: { companyId_provider: { companyId: corvaneId, provider: 'GOOGLE' } } })
    expect(row.tokenSealed).not.toContain(REFRESH)
    expect(row.tokenSealed.startsWith('v1.')).toBe(true)
    as(OWNER)
    const sources = await json(await directoryGet(req('GET', '/api/settings/team-structure/directory')))
    const preview = await post({ source: 'GOOGLE' })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    for (const said of [JSON.stringify(sources.body), JSON.stringify(preview.body)]) {
      expect(said).not.toContain(REFRESH)
      expect(said).not.toContain(ACCESS)
      expect(said).not.toContain(row.tokenSealed)
    }
    const logs = await prisma.accessLog.findMany({ where: { subjectCompanyId: corvaneId } })
    const incidents = await prisma.incident.findMany({})
    for (const said of [JSON.stringify(logs), JSON.stringify(incidents)]) {
      expect(said).not.toContain(REFRESH)
      expect(said).not.toContain(ACCESS)
    }
  })

  it('a read from Google writes an access-log row naming how many people were read, and reads the connected domain only', async () => {
    await connect()
    const before = await reads()
    const preview = await post({ source: 'GOOGLE' })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body.data.people).toBe(1)
    expect(await reads()).toBe(before + 1)
    const row = await prisma.accessLog.findFirstOrThrow({ where: { subjectCompanyId: corvaneId, allowed: true }, orderBy: { at: 'desc' } })
    expect(row.reason).toMatch(/from google workspace: 1 people, for the team structure, as a preview\.$/)
    expect(asked.some((u) => u.includes(`domain=${VERIFIED}`) && u.includes('projection=full'))).toBe(true)
    expect(asked.some((u) => u.includes('customer=my_customer'))).toBe(false)
  })

  it('a seat that is not the Owner or an Admin is refused, and the refusal is logged before it is sent', async () => {
    const before = await refusals()
    const r = await post({ source: 'GOOGLE', connect: true }, AP)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/Graham Ellery, Owner/)
    expect(await refusals()).toBe(before + 1)
    await connect()
    const read = await post({ source: 'GOOGLE' }, AP)
    expect(read.status).toBe(403)
    expect(await refusals()).toBe(before + 2)
  })

  it('a domain the company has not verified is refused in a sentence, logged, and nothing is stored', async () => {
    const before = await refusals()
    const r = await post({ source: 'GOOGLE', connect: true, domain: UNVERIFIED })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(new RegExp(`^${UNVERIFIED.replace(/\./g, '\\.')} is not a domain Corvane Packaging has verified\\.`))
    const g = await post({ source: 'GOOGLE', connect: true, domain: 'gmail.com' })
    expect(g.body.error.message).toMatch(/gmail\.com is a personal or Etyme address and can never stand for a company/)
    expect(await refusals()).toBe(before + 2)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId } })).toBe(0)
  })

  it('a Workspace that does not hold the verified domain keeps nothing, and Google is asked to forget the token', async () => {
    vi.stubGlobal('fetch', google({ holdsDomain: false }))
    const { back } = await connect()
    expect(back.headers.get('location')).toMatch(/google=workspace$/)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId } })).toBe(0)
    expect(asked.some((u) => u.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true)
  })

  it('a consent that comes back to another seat is refused and keeps nothing', async () => {
    const start = await post({ source: 'GOOGLE', connect: true })
    const state = new URL(start.body.data.url).searchParams.get('state')!
    // Astrid Berge is made an Admin for this case: a second seat at the same company that sets it up.
    const adminRole = await prisma.role.create({ data: { companyId: corvaneId, name: 'Admin (test)', permissions: ['settings.manage'] } })
    const astrid = await prisma.context.findFirstOrThrow({ where: { companyId: corvaneId, person: { name: 'Astrid Berge' }, revokedAt: null } })
    await prisma.context.update({ where: { id: astrid.id }, data: { roleId: adminRole.id } })
    as(corvaneSeatEmail('operations', DOMAIN))
    const back = await directoryGet(req('GET', `/api/settings/team-structure/directory?code=abc&state=${encodeURIComponent(state)}`))
    expect(back.headers.get('location')).toMatch(/google=not-yours$/)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId } })).toBe(0)
  })

  it('with the switch or the Google app missing, nothing is stored and the card says not connected, in words with no setting’s name', async () => {
    setEnv({ ...ENV, ETYME_DIRECTORY_LIVE: undefined })
    as(OWNER)
    const s = await json(await directoryGet(req('GET', '/api/settings/team-structure/directory')))
    const g = s.body.data.sources.find((x: any) => x.key === 'GOOGLE')
    expect(g).toMatchObject({ connected: false, connectable: false })
    expect(g.adminApproves).toMatch(/^Not set up on this deployment yet: directory connections are not turned on yet/)
    expect(JSON.stringify(s.body)).not.toMatch(/ETYME_|CLIENT_ID|TOKEN_KEY/)
    const r = await post({ source: 'GOOGLE', connect: true })
    expect(r.status).toBe(409)
    expect(r.body.error.message).not.toMatch(/ETYME_/)
    setEnv({ ...ENV, ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET: undefined })
    expect((await post({ source: 'GOOGLE', connect: true })).status).toBe(409)
    setEnv({ ...ENV, ETYME_DIRECTORY_TOKEN_KEY: undefined })
    expect((await post({ source: 'GOOGLE', connect: true })).status).toBe(409)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId } })).toBe(0)
  })

  it('Disconnect deletes the stored token, asks Google to forget it, says so, and the tree stays', async () => {
    await connect()
    const units = await prisma.orgUnit.count({ where: { companyId: corvaneId } })
    const r = await post({ source: 'GOOGLE', disconnect: true })
    expect(r.status).toBe(200)
    expect(r.body.data.says).toBe(`Google Workspace is disconnected for ${VERIFIED}. The stored access was deleted and Google was asked to forget it. Your team structure stays as it is.`)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId } })).toBe(0)
    expect(await prisma.orgUnit.count({ where: { companyId: corvaneId } })).toBe(units)
    expect(asked.some((u) => u.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true)
    const again = await post({ source: 'GOOGLE' })
    expect(again.status).toBe(409)
  })
})

// ── Microsoft Entra ID, the same door (2026-11-12) ─────────────────────

const TENANT = '9b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0'
const ENTRA_ENV = { ETYME_DIRECTORY_ENTRA_CLIENT_ID: '11111111-2222-3333-4444-555555555555', ETYME_DIRECTORY_ENTRA_CLIENT_SECRET: 'entra-SECRET-client' }

/** Microsoft, answered here: the sign-in metadata, the token endpoint and Graph's users. */
function microsoft(opts: { holder?: string; graph?: number } = {}) {
  return vi.fn(async (url: string) => {
    asked.push(String(url))
    if (String(url).includes('/.well-known/openid-configuration')) return new Response(JSON.stringify({ issuer: `https://login.microsoftonline.com/${opts.holder ?? TENANT}/v2.0` }))
    if (String(url).includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'at-ENTRA-1', expires_in: 3600 }))
    if (String(url).startsWith('https://graph.microsoft.com/')) {
      if (opts.graph && opts.graph !== 200) return new Response('{}', { status: opts.graph })
      return new Response(JSON.stringify({ value: [
        { displayName: 'Astrid Berge', mail: `astrid@${VERIFIED}`, department: 'Operations', jobTitle: 'Head of Operations' },
        { displayName: 'A guest', mail: 'guest@elsewhere.example', department: 'Operations' },
      ] }))
    }
    return new Response('{}', { status: 404 })
  })
}

async function connectEntra(who = OWNER, query = (state: string) => `admin_consent=True&tenant=${TENANT}&state=${encodeURIComponent(state)}`) {
  const start = await post({ source: 'ENTRA', connect: true }, who)
  expect(start.status, JSON.stringify(start.body)).toBe(200)
  const state = new URL(start.body.data.url).searchParams.get('state')!
  as(who)
  const back = await directoryGet(req('GET', `/api/settings/team-structure/directory?${query(state)}`))
  return { start, back }
}

describe('connecting Corvane’s Microsoft Entra ID', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENTRA_ENV)) process.env[k] = v
    vi.stubGlobal('fetch', microsoft())
  })
  afterAll(() => { for (const k of Object.keys(ENTRA_ENV)) delete process.env[k] })

  it('the admin consents in the tenant that holds the verified domain, and the connection keeps the tenant id and no secret', async () => {
    const { start, back } = await connectEntra()
    expect(new URL(start.body.data.url).pathname).toBe(`/${VERIFIED}/v2.0/adminconsent`)
    expect(back.headers.get('location')).toBe('http://localhost:3000/dashboard/settings/team-structure?entra=connected')
    const row = await prisma.directoryConnection.findUniqueOrThrow({ where: { companyId_provider: { companyId: corvaneId, provider: 'ENTRA' } } })
    expect(row).toMatchObject({ domain: VERIFIED, customerId: TENANT, scope: 'User.Read.All', tokenSealed: '' })
    expect(JSON.stringify(row)).not.toContain('entra-SECRET-client')
  })

  it('a read from Entra reads the domain’s people only, writes an access-log row, and never returns the token', async () => {
    await connectEntra()
    const before = await reads()
    const preview = await post({ source: 'ENTRA' })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body.data.people).toBe(1)
    expect(await reads()).toBe(before + 1)
    const row = await prisma.accessLog.findFirstOrThrow({ where: { subjectCompanyId: corvaneId, allowed: true }, orderBy: { at: 'desc' } })
    expect(row.reason).toMatch(/from microsoft entra id: 1 people, for the team structure, as a preview\.$/)
    expect(JSON.stringify(preview.body)).not.toContain('at-ENTRA-1')
  })

  it('a tenant that does not hold the domain keeps nothing, and the refusal is logged', async () => {
    vi.stubGlobal('fetch', microsoft({ holder: '00000000-1111-2222-3333-444444444444' }))
    const before = await refusals()
    const { back } = await connectEntra()
    expect(back.headers.get('location')).toMatch(/entra=tenant$/)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId, provider: 'ENTRA' } })).toBe(0)
    expect(await refusals()).toBe(before + 1)
  })

  it('a consent Microsoft did not grant keeps nothing', async () => {
    const { back } = await connectEntra(OWNER, (state) => `error=access_denied&state=${encodeURIComponent(state)}`)
    expect(back.headers.get('location')).toMatch(/entra=declined$/)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId, provider: 'ENTRA' } })).toBe(0)
  })

  it('a grant that does not let Etyme read users keeps nothing', async () => {
    vi.stubGlobal('fetch', microsoft({ graph: 403 }))
    const { back } = await connectEntra()
    expect(back.headers.get('location')).toMatch(/entra=read$/)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId, provider: 'ENTRA' } })).toBe(0)
  })

  it('without the app’s keys the card reads as before, not connected, and Connect is refused in words', async () => {
    for (const k of Object.keys(ENTRA_ENV)) delete process.env[k]
    as(OWNER)
    const s = await json(await directoryGet(req('GET', '/api/settings/team-structure/directory')))
    expect(s.body.data.sources.find((x: any) => x.key === 'ENTRA')).toMatchObject({ connected: false, connectable: false })
    const r = await post({ source: 'ENTRA', connect: true })
    expect(r.status).toBe(409)
    expect(r.body.error.message).not.toMatch(/ETYME_/)
  })

  it('disconnect stops Etyme reading it and says how the admin takes the consent back', async () => {
    await connectEntra()
    const r = await post({ source: 'ENTRA', disconnect: true })
    expect(r.body.data.says).toMatch(/removes Etyme under Enterprise applications/)
    expect(await prisma.directoryConnection.count({ where: { companyId: corvaneId, provider: 'ENTRA' } })).toBe(0)
  })
})
