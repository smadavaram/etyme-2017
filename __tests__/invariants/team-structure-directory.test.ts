import { describe, it, expect } from 'vitest'
import { parseCsvRows, readDirectoryCsv } from '@/lib/team-structure/directory/csv'
import { applyOrder, planFromDirectory, type PlanSeat, type PlanUnit } from '@/lib/team-structure/directory/plan'
import { directorySources, readEntra, readGoogle, GRAPH_USERS } from '@/lib/team-structure/directory/providers'

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
    expect(add.says).toBe('New department "Quality" under Operations, led by Dana Whitcombe. 4 people have department = Quality.')
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
  it('neither is connected today, and each says what the client’s IT admin approves', () => {
    const s = directorySources({ ETYME_DIRECTORY_ENTRA_CLIENT_ID: 'x', ETYME_DIRECTORY_ENTRA_CLIENT_SECRET: 'y' })
    expect(s.map((x) => [x.key, x.connected])).toEqual([['ENTRA', false], ['GOOGLE', false], ['CSV', true]])
    expect(s[0].adminApproves).toMatch(/User\.Read\.All .*admin consent/)
    expect(s[1].adminApproves).toMatch(/admin\.directory\.user\.readonly/)
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
