import { describe, it, expect } from 'vitest'
import { parseCsvRows, readDirectoryCsv } from '@/lib/team-structure/directory/csv'
import { applyOrder, planFromDirectory, type PlanSeat, type PlanUnit } from '@/lib/team-structure/directory/plan'
import { directorySources, readEntra, readGoogle, entraToken, GRAPH_USERS } from '@/lib/team-structure/directory/providers'
import { adminConsentUrl, entraReadiness, tenantForDomain, onlyDomain, isTenantId } from '@/lib/team-structure/directory/entra'
import { entraOutcomeSays, ENTRA_OUTCOMES } from '@/lib/team-structure/directory/outcome'
import { signState, readState } from '@/lib/team-structure/directory/sealed'
import { readFileSync as readSrcFile } from 'node:fs'

const ENTRA_ENV = {
  ETYME_DIRECTORY_ENTRA_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
  ETYME_DIRECTORY_ENTRA_CLIENT_SECRET: 'entra-secret',
  ETYME_DIRECTORY_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  ETYME_DIRECTORY_LIVE: '1',
}
const TENANT = '9b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0'

/**
 * The team structure from the directory (founder, 2026-11-09): read
 * only, previewed before any change, nothing deleted, a screen edit wins,
 * people matched by email only, nobody made a seat, no contractor moved.
 */

const CSV = [
  'displayName,mail,department,manager,officeLocation,country,jobTitle',
  'Astrid Berge,astrid@corvane.example,Operations,graham@corvane.example,Dayton,US,Head of Operations',
  'Dana Whitcombe,dana@corvane.example,Quality,astrid@corvane.example,Dayton,US,Quality lead',
  'Priya Shah,priya@corvane.example,Quality,dana@corvane.example,Dayton,US,Inspector',
  '"Ortiz, Gabriel",gabriel@corvane.example,Quality,dana@corvane.example,Fresno,US,Inspector',
  'Lucas Fairbairn,lucas@corvane.example,Finance,margaret@corvane.example,Dayton,US,AP Clerk',
  'Margaret Osei,margaret@corvane.example,Finance,graham@corvane.example,Dayton,US,CFO',
  'New Starter,new@corvane.example,Quality,dana@corvane.example,Dayton,US,Inspector',
  'Rosa Diaz,rosa@corvane.example,Finance,margaret@corvane.example,Dayton,US,Payroll clerk',
].join('\r\n')

const unit = (id: string, name: string, kind = 'DEPARTMENT', o: Partial<PlanUnit> = {}): PlanUnit => ({ id, parentId: null, name, kind, leadContextId: null, movedOnScreen: false, leadOnScreen: false, ...o })
const seat = (id: string, email: string, name: string, o: Partial<PlanSeat> = {}): PlanSeat => ({ contextId: id, email, name, orgUnitId: null, movedOnScreen: false, setsUp: false, ...o })

const UNITS = [unit('ops', 'Operations'), unit('fin', 'Finance', 'DEPARTMENT', { leadContextId: 'c_margaret' }), unit('us', 'United States', 'REGION', { parentId: 'ops' }), unit('dayton', 'Dayton, Ohio', 'SITE', { parentId: 'us' })]
const SEATS = [
  seat('c_astrid', 'astrid@corvane.example', 'Astrid Berge'),
  seat('c_dana', 'dana@corvane.example', 'Dana Whitcombe', { orgUnitId: 'us' }),
  seat('c_priya', 'priya@corvane.example', 'Priya Shah'),
  seat('c_gabriel', 'gabriel@corvane.example', 'Gabriel Ortiz', { orgUnitId: 'dayton', movedOnScreen: true }),
  seat('c_lucas', 'lucas@corvane.example', 'Lucas Fairbairn', { orgUnitId: 'fin' }),
  seat('c_margaret', 'margaret@corvane.example', 'Margaret Osei'),
]
const people = () => {
  const r = readDirectoryCsv(CSV)
  if (!r.ok) throw new Error(r.says)
  return r.people
}
const plan = () => planFromDirectory({ people: people(), units: UNITS, seats: SEATS, sites: [{ unitId: 'dayton', name: 'Dayton', country: 'US' }], companyName: 'Corvane Packaging' })

describe('reading a file exported from Active Directory', () => {
  it('reads Active Directory’s own column names, a quoted name with a comma in it, and Windows line endings', () => {
    const p = people()
    expect(p).toHaveLength(8)
    expect(p[3]).toEqual({ name: 'Ortiz, Gabriel', email: 'gabriel@corvane.example', department: 'Quality', manager: 'dana@corvane.example', officeLocation: 'Fresno', country: 'US', jobTitle: 'Inspector' })
    expect(parseCsvRows('a,"b ""c""",d\n1,2,3')).toEqual([['a', 'b "c"', 'd'], ['1', '2', '3']])
  })

  it('a file with no email column is refused, because people are matched to their seats by email only', () => {
    expect(readDirectoryCsv('name,department\nAstrid,Operations')).toEqual({ ok: false, says: 'The file has no email column. People are matched to their seats by email only, so the import needs one (email or mail).' })
  })

  it('a file with no department, manager or office is refused, because there is no structure in it', () => {
    const r = readDirectoryCsv('name,email\nAstrid,astrid@corvane.example')
    expect(r.ok).toBe(false)
  })

  it('a row with no email or a repeated email is set aside with the row number, and the rest are read', () => {
    const r = readDirectoryCsv('name,email,department\nA,,Ops\nB,b@x.example,Ops\nB again,b@x.example,Ops')
    expect(r.ok && r.people.map((p) => p.email)).toEqual(['b@x.example'])
    expect(r.ok && r.skipped).toEqual(['Row 2 has no email, so it is not read.', 'Row 4 repeats b@x.example; the first row for it is read.'])
  })
})

describe('the preview of every change', () => {
  it('a department nobody has drawn yet becomes a new box, led by the manager most of its people report to, under that manager’s own department', () => {
    const add = plan().changes.find((c) => c.key === 'add:quality')!
    expect(add.says).toBe('New department "Quality" under Operations, led by Dana Whitcombe. 4 people are in the Quality department in the directory.')
    expect(add.op).toEqual({ act: 'ADD', name: 'Quality', parent: { id: 'ops' } })
    expect(plan().changes.find((c) => c.key === 'lead:new:quality')?.op).toEqual({ act: 'LEAD', unit: { newDepartment: 'Quality' }, contextId: 'c_dana' })
  })

  it('people are placed by email, and a person with no seat is listed as an invitation to send, never made a seat', () => {
    const p = plan()
    expect(p.changes.find((c) => c.key === 'person:c_priya')?.says).toBe('Priya Shah moves from no team to Quality: the directory\'s department is Quality (Inspector).')
    expect(p.invitations.map((i) => i.email)).toEqual(['new@corvane.example', 'rosa@corvane.example'])
    expect(p.changes.some((c) => c.says.includes('New Starter'))).toBe(false)
  })

  it('a person somebody placed on this screen stays put: the directory’s disagreement asks you, unticked', () => {
    const c = plan().changes.find((x) => x.key === 'person:c_gabriel')!
    expect(c).toMatchObject({ tag: 'ASKS', ticked: false, tickable: true })
    expect(c.says).toMatch(/They were placed on this screen, so they stay unless you tick this\.$/)
  })

  it('a lead named on this screen stays unless the Owner ticks the directory’s', () => {
    const units = UNITS.map((u) => (u.id === 'fin' ? { ...u, leadContextId: 'c_lucas', leadOnScreen: true } : u))
    const p = planFromDirectory({ people: people(), units, seats: SEATS, sites: [], companyName: 'Corvane Packaging' })
    expect(p.changes.find((c) => c.key === 'lead:fin')).toMatchObject({ tag: 'ASKS', ticked: false })
  })

  it('a five-row file never moves a department the record already holds, nor replaces its lead: most of its people are counted on the record, not only in the file', () => {
    // Walk 10: Dana Whitcombe was the one Operations person in the file, of 37 on the record.
    const units = [unit('ops', 'Operations', 'DEPARTMENT', { leadContextId: 'c_astrid' }), unit('fin', 'Finance'), unit('us', 'United States', 'REGION', { parentId: 'ops' })]
    const seats = [
      seat('c_astrid', 'astrid@corvane.example', 'Astrid Berge'),
      seat('c_yvette', 'yvette@corvane.example', 'Yvette Marchetti'),
      ...Array.from({ length: 36 }, (_, i) => seat(`c_${i}`, `p${i}@corvane.example`, `Person ${i}`, { orgUnitId: 'us' })),
    ]
    const r = readDirectoryCsv('name,email,department,manager\nDana,p0@corvane.example,Operations,yvette@corvane.example\nYvette Marchetti,yvette@corvane.example,Accounts Payable,margaret@corvane.example')
    if (!r.ok) throw new Error(r.says)
    const p = planFromDirectory({ people: r.people, units, seats, sites: [], companyName: 'Corvane Packaging' })
    expect(p.changes.find((c) => c.key === 'move:ops')).toBeUndefined()
    expect(p.changes.find((c) => c.key === 'lead:ops')).toBeUndefined()
    expect(p.changes.some((c) => /most of/.test(c.says))).toBe(false)
  })

  it('where most of a department’s people do report elsewhere, moving it and replacing the lead it already has both ask, unticked', () => {
    const units = [unit('ops', 'Operations', 'DEPARTMENT', { leadContextId: 'c_astrid' }), unit('fin', 'Finance')]
    const seats = [seat('c_astrid', 'astrid@corvane.example', 'Astrid Berge'), seat('c_margaret', 'margaret@corvane.example', 'Margaret Osei'), seat('c_a', 'a@corvane.example', 'Ana'), seat('c_b', 'b@corvane.example', 'Ben')]
    const r = readDirectoryCsv('name,email,department,manager\nAna,a@corvane.example,Operations,margaret@corvane.example\nBen,b@corvane.example,Operations,margaret@corvane.example\nMargaret Osei,margaret@corvane.example,Finance,graham@corvane.example')
    if (!r.ok) throw new Error(r.says)
    const p = planFromDirectory({ people: r.people, units, seats, sites: [], companyName: 'Corvane Packaging' })
    expect(p.changes.find((c) => c.key === 'move:ops')).toMatchObject({ tag: 'ASKS', ticked: false, tickable: true })
    const lead = p.changes.find((c) => c.key === 'lead:ops')!
    expect(lead).toMatchObject({ tag: 'ASKS', ticked: false })
    expect(lead.says).toBe("Operations' lead is Astrid Berge. The directory says Margaret Osei: 2 of its 2 people report to Margaret Osei in the directory. Astrid Berge stays unless you tick this.")
  })

  it('a box the directory does not name is shown and never removed', () => {
    const p = planFromDirectory({ people: people(), units: [...UNITS, unit('legal', 'Legal')], seats: SEATS, sites: [], companyName: 'Corvane Packaging' })
    expect(p.kept).toEqual(['Legal is not in your directory. It stays on the tree.'])
    expect(p.changes.some((c) => c.op && 'act' in c.op && (c.op.act as string) === 'DELETE')).toBe(false)
  })

  it('a seat that sets the company up is never placed on a site by the directory', () => {
    const r = readDirectoryCsv('name,email,officeLocation\nGraham,graham@corvane.example,Dayton')
    if (!r.ok) throw new Error(r.says)
    const p = planFromDirectory({ people: r.people, units: UNITS, seats: [seat('c_owner', 'graham@corvane.example', 'Graham Ellery', { setsUp: true })], sites: [{ unitId: 'dayton', name: 'Dayton', country: 'US' }], companyName: 'Corvane Packaging' })
    expect(p.changes[0]).toMatchObject({ tag: 'ASKS', tickable: false, op: null })
  })

  it('the directory never names a contractor, so no change in the preview is about a contractor’s line', () => {
    for (const c of plan().changes) expect(c.op?.act ?? 'NONE').not.toBe('MOVE_CONTRACTOR')
  })

  it('new boxes are made before anything is put in them', () => {
    const order = applyOrder(plan().changes.filter((c) => c.ticked)).map((c) => c.op!.act)
    expect(order.indexOf('ADD')).toBe(0)
    expect(order.lastIndexOf('ADD')).toBeLessThan(order.indexOf('MOVE_PERSON'))
  })
})

describe('Microsoft Entra ID and Google Workspace', () => {
  it('neither is connected until a company connects it, and each says what the client’s IT admin approves', () => {
    const s = directorySources({ ...ENTRA_ENV, ETYME_DIRECTORY_GOOGLE_CLIENT_ID: 'g', ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET: 'h' })
    expect(s.map((x) => [x.key, x.connected])).toEqual([['ENTRA', false], ['GOOGLE', false], ['CSV', true]])
    expect(s[0].adminApproves).toMatch(/User\.Read\.All .*admin consent/)
    expect(s[1].adminApproves).toMatch(/Google Workspace administrator .*read only/)
    expect(s[1].adminApproves).not.toMatch(/admin\.directory/)
  })

  it('Entra ID is read through Microsoft Graph with the manager expanded, page by page', async () => {
    const asked: string[] = []
    const pages = [
      { value: [{ displayName: 'Dana Whitcombe', mail: 'Dana@corvane.example', department: 'Quality', manager: { mail: 'astrid@corvane.example' }, officeLocation: 'Dayton', country: 'US', jobTitle: 'Lead' }], '@odata.nextLink': 'https://graph.microsoft.com/next' },
      { value: [{ displayName: 'Room 4', userPrincipalName: 'not-an-email' }] },
    ]
    const f = (async (url: string) => { asked.push(url); return new Response(JSON.stringify(pages[asked.length - 1])) }) as unknown as typeof fetch
    const got = await readEntra('t', f)
    expect(asked).toEqual([GRAPH_USERS, 'https://graph.microsoft.com/next'])
    expect(GRAPH_USERS).toContain('$expand=manager')
    expect(got).toEqual([{ name: 'Dana Whitcombe', email: 'dana@corvane.example', department: 'Quality', manager: 'astrid@corvane.example', officeLocation: 'Dayton', country: 'US', jobTitle: 'Lead' }])
  })

  it('Google Workspace is read through the Admin SDK directory, with the manager from the relations', async () => {
    const f = (async () => new Response(JSON.stringify({ users: [{ primaryEmail: 'priya@corvane.example', name: { fullName: 'Priya Shah' }, organizations: [{ primary: true, department: 'Quality', title: 'Inspector' }], relations: [{ type: 'manager', value: 'dana@corvane.example' }], locations: [{ buildingId: 'Dayton' }], addresses: [{ primary: true, countryCode: 'US' }] }] }))) as unknown as typeof fetch
    expect(await readGoogle('t', f)).toEqual([{ name: 'Priya Shah', email: 'priya@corvane.example', department: 'Quality', manager: 'dana@corvane.example', officeLocation: 'Dayton', country: 'US', jobTitle: 'Inspector' }])
  })

  it('a refusal from Microsoft is said in a sentence that names the permission to grant', async () => {
    const f = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
    await expect(readEntra('t', f)).rejects.toThrow(/User\.Read\.All/)
  })
})

describe('Microsoft Entra ID, connected by the client’s IT admin', () => {
  const kept = { domain: 'corvane.example', connectedBy: 'Graham Ellery', connectedAt: '2026-11-12T00:00:00Z', lastReadAt: null, lastReadCount: null }

  it('with the app’s keys absent, Entra reads exactly as before: not connected, nothing to press', () => {
    for (const env of [{}, { ETYME_DIRECTORY_LIVE: '1', ETYME_DIRECTORY_TOKEN_KEY: ENTRA_ENV.ETYME_DIRECTORY_TOKEN_KEY }]) {
      const e = directorySources(env, null, kept)[0]
      expect(e).toMatchObject({ key: 'ENTRA', connected: false, connectable: false })
      expect(e.adminApproves).toBe('Not set up on this deployment yet: Etyme has not turned on Microsoft Entra ID here. Once it does, your Microsoft 365 admin approves read-only access to your users once.')
    }
  })

  it('with the switch or the key missing it cannot be connected, and the words never name a setting', () => {
    for (const env of [{ ...ENTRA_ENV, ETYME_DIRECTORY_LIVE: undefined }, { ...ENTRA_ENV, ETYME_DIRECTORY_TOKEN_KEY: undefined }]) {
      expect(entraReadiness(env).ready).toBe(false)
      const e = directorySources(env)[0]
      expect(e).toMatchObject({ connected: false, connectable: false })
      expect(e.adminApproves).toMatch(/^Not set up on this deployment yet: /)
      expect(e.adminApproves).not.toMatch(/ETYME_|_ID|_SECRET|_KEY|signs the connection/)
    }
    expect(directorySources({ ...ENTRA_ENV, ETYME_DIRECTORY_LIVE: undefined })[0].adminApproves).toContain('the privacy notice that names them is waiting for approval')
  })

  it('with everything set it can be connected, and once connected the card reads it as connected with no secret in it', () => {
    expect(directorySources(ENTRA_ENV)[0]).toMatchObject({ connected: false, connectable: true })
    const e = directorySources(ENTRA_ENV, null, kept)[0]
    expect(e).toMatchObject({ connected: true, connectable: false, adminApproves: null, says: 'Connected for corvane.example. Read only.' })
    expect(Object.keys(e.connection!)).toEqual(['domain', 'connectedBy', 'connectedAt', 'lastReadAt', 'lastReadCount'])
  })

  it('the admin-consent screen opens in the tenant that holds the company’s verified domain and sends the admin back to this app only', () => {
    const url = new URL(adminConsentUrl({ clientId: ENTRA_ENV.ETYME_DIRECTORY_ENTRA_CLIENT_ID, origin: 'https://etyme2040.vercel.app/', state: 's1', domain: 'corvane.example' }))
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/corvane.example/v2.0/adminconsent')
    expect(url.searchParams.get('scope')).toBe('https://graph.microsoft.com/.default')
    expect(url.searchParams.get('redirect_uri')).toBe('https://etyme2040.vercel.app/api/settings/team-structure/directory')
    expect(url.searchParams.get('state')).toBe('s1')
  })

  it('the consent’s state is signed for Entra, so Google’s callback and Microsoft’s are never confused', () => {
    const s = signState({ companyId: 'c1', personId: 'p1', domain: 'corvane.example', provider: 'ENTRA' }, Date.now(), ENTRA_ENV)
    expect(readState(s, Date.now(), ENTRA_ENV)).toMatchObject({ companyId: 'c1', personId: 'p1', domain: 'corvane.example', provider: 'ENTRA' })
    const route = readSrcFile('src/app/api/settings/team-structure/directory/route.ts', 'utf8')
    expect(route).toContain("readState(q.get('state') ?? '')?.provider === 'ENTRA') return entraCallback(request)")
    expect(route).toContain("if (!state || state.provider !== 'ENTRA')")
  })

  it('the tenant that consented must be the tenant Microsoft says holds the domain', async () => {
    const asked: string[] = []
    const f = (async (url: string) => { asked.push(url); return new Response(JSON.stringify({ issuer: `https://login.microsoftonline.com/${TENANT}/v2.0` })) }) as unknown as typeof fetch
    expect(await tenantForDomain('corvane.example', f)).toBe(TENANT)
    expect(asked).toEqual(['https://login.microsoftonline.com/corvane.example/v2.0/.well-known/openid-configuration'])
    const unknown = (async () => new Response(JSON.stringify({ error: 'invalid_tenant' }), { status: 400 })) as unknown as typeof fetch
    await expect(tenantForDomain('nobody.example', unknown)).rejects.toMatchObject({ code: 'tenant' })
    expect(readSrcFile('src/app/api/settings/team-structure/directory/route.ts', 'utf8')).toContain("if (holder !== tenant.toLowerCase())")
    expect(isTenantId(TENANT)).toBe(true)
    expect(isTenantId('corvane.example')).toBe(false)
  })

  it('a read asks Microsoft for an app-only token for that tenant, from the deployment’s own secret', async () => {
    const calls: { url: string; body: string }[] = []
    const f = (async (url: string, init?: RequestInit) => { calls.push({ url, body: String(init?.body ?? '') }); return new Response(JSON.stringify({ access_token: 'at' })) }) as unknown as typeof fetch
    expect(await entraToken({ tenantId: TENANT, clientId: 'cid', clientSecret: 'sec' }, f)).toBe('at')
    expect(calls[0].url).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)
    const form = new URLSearchParams(calls[0].body)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('scope')).toBe('https://graph.microsoft.com/.default')
  })

  it('only the connected domain’s people are read, and a manager outside it is not named', () => {
    const p = (email: string, manager: string | null) => ({ name: email, email, department: 'Quality', manager, officeLocation: null, country: null, jobTitle: null })
    expect(onlyDomain([p('dana@corvane.example', 'astrid@corvane.example'), p('guest@other.example', null), p('liv@corvane.example', 'boss@other.example')], 'corvane.example'))
      .toEqual([p('dana@corvane.example', 'astrid@corvane.example'), p('liv@corvane.example', null)])
  })

  it('the connection keeps the tenant id and the domain, and no secret per company', () => {
    const route = readSrcFile('src/app/api/settings/team-structure/directory/route.ts', 'utf8')
    expect(route).toContain("create: { companyId: writer.companyId, provider: 'ENTRA', domain: state.domain, customerId: holder, scope: ENTRA_PERMISSION, tokenSealed: '', connectedById: writer.personId }")
    // Every directory read and refusal goes to the access log as DIRECTORY_READ.
    expect(route).toContain("reason: `Refused: reading ${writer.companyName}'s directory from Microsoft Entra ID. ${why}`")
    expect(route).toContain("Connected ${writer.companyName}'s Microsoft Entra ID directory for ${state.domain}, read only")
    // Read only: nothing in the Entra code writes to Microsoft Graph.
    expect(readSrcFile('src/lib/team-structure/directory/entra.ts', 'utf8') + route).not.toMatch(/method: '(PATCH|PUT|DELETE)'/)
  })

  it('what Microsoft sends back is said from a short code, never from words in the address', () => {
    expect(entraOutcomeSays('connected')).toEqual({ says: ENTRA_OUTCOMES.connected, no: false })
    expect(entraOutcomeSays('declined')?.no).toBe(true)
    expect(entraOutcomeSays('<script>')).toBeNull()
    const page = readSrcFile('src/app/dashboard/settings/team-structure/page.tsx', 'utf8')
    expect(page).toContain("entraOutcomeSays(url.searchParams.get('entra'))")
  })

  it('the dialog follows only Microsoft’s own consent screen, and offers Connect only where the deployment can', () => {
    const dialog = readSrcFile('src/app/dashboard/settings/team-structure/import-dialog.tsx', 'utf8')
    expect(dialog).toContain("'https://login.microsoftonline.com/'")
    expect(dialog).toContain("source === 'ENTRA' && chosen?.connectable &&")
  })
})
