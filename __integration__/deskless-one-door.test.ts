import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { as, req, json, prisma, freshWorld } from './harness'
import { namesAPermission } from '@/lib/refusal-words'

/**
 * Sign-up walk, round four, problems 1 and 2: one door for a seat with no
 * desk. A colleague seated as Member at Northbend Athletic, a seeded
 * client with data, typed addresses and read the firm's month, every
 * submission with its rate, every job request with its maximum, every
 * contractor's months on site, and seven past contractors. Seated here
 * the way round four seated Mo: a person, an EMPLOYEE seat, and
 * Northbend's own Member role, which holds no permission.
 *
 * The walk is every GET under src/app/api with a fixed address that
 * resolves a caller — not a sample — so a route added tomorrow is walked
 * tomorrow.
 */

const PROGRAM = 'world-nike-programme@demo.etyme.local'
const MO = 'mo@walk4.example'
const KARTHIK = 'karthik.menon@seed.etyme.invalid'

/** The pages round four opened by URL as the Member, by the route behind each. */
const ROUND_FOUR = [
  'program', 'submissions', 'requisitions', 'people', 'alumni', 'requirements', 'timesheets',
  'program/budget', 'program/org', 'tenure', 'invoices', 'expenses', 'contracts', 'purchase-orders',
  'ap', 'rolloff', 'access', 'suppliers', 'vendors/scorecards', 'vendors/concentration',
]

/** A live stream answers forever; it is the bell's, and is checked by the unit test instead. */
const NOT_WALKED = new Set(['notifications/stream'])

function staticGets(): string[] {
  const api = join(process.cwd(), 'src/app/api')
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { if (!name.startsWith('[')) walk(full); continue }
      if (name !== 'route.ts') continue
      const src = readFileSync(full, 'utf8')
      if (!src.includes('export async function GET') || !src.includes('getCallerContext')) continue
      const route = relative(api, dir)
      if (!NOT_WALKED.has(route)) out.push(route)
    }
  }
  walk(api)
  return out.sort()
}

async function get(route: string, query = ''): Promise<{ status: number; body: any; text: string }> {
  const mod = await import(/* @vite-ignore */ `@/app/api/${route}/route`)
  const res: Response = await mod.GET(req('GET', `/api/${route}${query}`), { params: {} })
  const text = await res.text()
  let body: any = null
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, body, text }
}

describe('a Member with no desk at Northbend Athletic reads nothing of the firm’s by URL', () => {
  let mo = ''
  let others: string[] = []
  let nike = ''
  const walked: Record<string, { status: number; body: any; text: string }> = {}

  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    nike = firm.id
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Member' }, select: { id: true, permissions: true } })
    expect(role.permissions).toEqual([])
    mo = (await prisma.person.create({ data: { primaryEmail: MO, name: 'Mo Haddad' }, select: { id: true } })).id
    await prisma.context.create({
      data: { personId: mo, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
    })
    others = (await prisma.person.findMany({ where: { id: { not: mo } }, select: { id: true } })).map((p) => p.id)

    as(MO)
    for (const route of staticGets()) {
      try { walked[route] = await get(route) } catch (e) { walked[route] = { status: 0, body: null, text: String(e) } }
    }
  }, 600_000)

  it('the walk reaches every page round four opened, and more than a hundred routes in all', () => {
    for (const r of ROUND_FOUR) expect(walked[r], r).toBeDefined()
    expect(Object.keys(walked).length).toBeGreaterThan(100)
  })

  it('every route either refuses in a sentence that names no permission key, or answers naming nobody but the Member', () => {
    const open: string[] = []
    for (const [route, r] of Object.entries(walked)) {
      if (r.status === 403) {
        const says = r.body?.error?.message ?? ''
        if (typeof says !== 'string' || says.split(' ').length < 6 || namesAPermission(says)) open.push(`${route}: 403 without a sentence — ${says}`)
        continue
      }
      if (r.status >= 200 && r.status < 300) {
        const named = others.filter((id) => r.text.includes(id))
        if (named.length > 0) open.push(`${route}: ${r.status} naming ${named.length} other people`)
        continue
      }
      // A 400 for a missing parameter, a 404 for nothing here: neither reads anybody.
      if (r.status === 0 || r.status >= 500) open.push(`${route}: ${r.status} ${r.text.slice(0, 160)}`)
    }
    expect(open, open.join('\n')).toEqual([])
  })

  it('the dashboard, job requests, contractors and past contractors refuse with the door’s own sentence', () => {
    const words: Record<string, string> = {
      program: 'Dashboard', requisitions: 'Job requests', people: 'Contractors', alumni: 'Past contractors',
    }
    for (const [route, page] of Object.entries(words)) {
      expect(walked[route].status, route).toBe(403)
      expect(walked[route].body.error.message).toBe(`${page} is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.`)
    }
  })

  it('the firm’s submissions reach him only as the times he was put forward, which is none, with no rate', async () => {
    as(MO)
    for (const direction of ['sent', 'received']) {
      const r = await get('submissions', `?direction=${direction}&companyId=${nike}&limit=50`)
      expect(r.status, r.text.slice(0, 200)).toBe(200)
      expect(r.body.data.desk.ownOnly).toBe(true)
      expect(r.body.data.submissions).toEqual([])
    }
  })

  it('a refusal at a route that would have named people leaves a refused read of each of them in the access log', async () => {
    // Written before the 403 was sent (recordRefusal), so read at once.
    const rows = await prisma.accessLog.findMany({
      where: { actorPersonId: mo, allowed: false, reason: { startsWith: '/api/people at Northbend Athletic refused' } },
      select: { subjectId: true },
    })
    const onSite = await prisma.sellContract.findMany({
      where: { OR: [{ companyId: nike }, { clientCompanyId: nike }, { endClientCompanyId: nike }] },
      select: { personId: true }, distinct: ['personId'],
    })
    expect(onSite.length).toBeGreaterThan(0)
    expect(new Set(rows.map((r) => r.subjectId))).toEqual(new Set(onSite.map((s) => s.personId)))
  })

  it('the Member still reads their own seat, their bell and what is addressed to them', () => {
    for (const r of ['me', 'notifications', 'decisions', 'me/work', 'me/data']) {
      expect(walked[r].status, `${r} ${walked[r].text.slice(0, 200)}`).toBe(200)
    }
  })

  it('the Northbend program manager, who has a desk, still reads every page round four opened', async () => {
    as(PROGRAM)
    const shut: string[] = []
    // The page asks for the firm's own submissions by name, as the screen does.
    const query: Record<string, string> = { submissions: `?companyId=${nike}&direction=received` }
    // Concentration is the owner's report, refused to the program manager by
    // its own route in its own sentence before this door existed.
    for (const route of ROUND_FOUR.filter((r) => r !== 'vendors/concentration')) {
      const r = await get(route, query[route] ?? '')
      if (r.status !== 200) shut.push(`${route}: ${r.status} ${r.text.slice(0, 160)}`)
    }
    expect(shut).toEqual([])
  })

  it('the program manager is never refused by the door anywhere in the walk', async () => {
    as(PROGRAM)
    const stopped: string[] = []
    for (const route of Object.keys(walked)) {
      const r = await get(route).catch(() => null)
      if (r?.body?.error?.code === 'NO_DESK') stopped.push(route)
    }
    expect(stopped).toEqual([])
  }, 300_000)
})

describe('Karthik Menon, an integrator’s own W2 with no desk, reads his own work and nothing of the firm’s (round five)', () => {
  let karthik = ''
  let own = ''
  let colleagues = ''
  beforeAll(async () => {
    await freshWorld()
    karthik = (await prisma.person.findFirstOrThrow({ where: { name: 'Karthik Menon' } })).id
    const seat = await prisma.context.findFirstOrThrow({ where: { personId: karthik, revokedAt: null }, select: { companyId: true } })
    own = (await prisma.sellContract.findFirstOrThrow({ where: { personId: karthik }, select: { id: true } })).id
    colleagues = (await prisma.sellContract.findFirstOrThrow({
      where: { companyId: seat.companyId!, personId: { not: karthik } }, select: { id: true },
    })).id
  }, 240_000)

  it('his own weeks still open to him, and only his', async () => {
    as(KARTHIK)
    const { status, body } = await json(await (await import('@/app/api/timesheets/route')).GET(req('GET', '/api/timesheets?limit=50')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.timesheets.length).toBeGreaterThan(0)
    for (const t of body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(karthik)
  })

  it('his contract lines are his own', async () => {
    as(KARTHIK)
    const { status, body } = await json(await (await import('@/app/api/contracts/route')).GET(req('GET', '/api/contracts?side=sell&limit=50')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.contracts.length).toBeGreaterThan(0)
    for (const r of body.data.contracts) expect(r.personId ?? r.person?.id).toBe(karthik)
  })

  it('his own four pages open: your work, your page, who has you and your data, with your paperwork', async () => {
    as(KARTHIK)
    for (const route of ['me', 'me/work', 'me/portfolio', 'me/benches', 'me/data', 'me/papers']) {
      const r = await get(route)
      expect(r.status, `${route} ${r.text.slice(0, 200)}`).toBe(200)
    }
  })

  it('his own placement opens to him, without the order’s ceiling or the other people on it', async () => {
    as(KARTHIK)
    const mod = await import('@/app/api/placements/[id]/route')
    const res = await mod.GET(req('GET', `/api/placements/${own}`), { params: Promise.resolve({ id: own }) })
    const text = await res.text()
    expect(res.status, text.slice(0, 300)).toBe(200)
    const body = JSON.parse(text)
    expect(JSON.stringify(body)).toContain(karthik)
  })

  it('a colleague’s placement is not part of his seat, said in the door’s words rather than as a missing record, and the refused read is logged', async () => {
    as(KARTHIK)
    const mod = await import('@/app/api/placements/[id]/route')
    const res = await mod.GET(req('GET', `/api/placements/${colleagues}`), { params: Promise.resolve({ id: colleagues }) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.message).toBe('That placement is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    const logged = await prisma.accessLog.findFirst({
      where: { actorPersonId: karthik, allowed: false, reason: 'A seat with no desk reads only a placement that names it' },
    })
    expect(logged).not.toBeNull()
  })

  it('a placement at a firm he has no seat at is still answered as one that is not there', async () => {
    const seat = await prisma.context.findFirstOrThrow({ where: { personId: karthik, revokedAt: null }, select: { companyId: true } })
    const elsewhere = (await prisma.sellContract.findFirstOrThrow({
      where: { companyId: { not: seat.companyId! }, clientCompanyId: { not: seat.companyId! }, OR: [{ endClientCompanyId: null }, { endClientCompanyId: { not: seat.companyId! } }] },
      select: { id: true },
    })).id
    as(KARTHIK)
    const mod = await import('@/app/api/placements/[id]/route')
    const res = await mod.GET(req('GET', `/api/placements/${elsewhere}`), { params: Promise.resolve({ id: elsewhere }) })
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe('No placement by that id.')
  })

  it('his own week opens to him from the "Open this week" link on his own page, with the chain of signatures on it', async () => {
    const week = await prisma.timesheet.findFirstOrThrow({ where: { personId: karthik, status: 'APPROVED' }, select: { id: true } })
    as(KARTHIK)
    const mod = await import('@/app/api/week-approvals/route')
    const res = await mod.GET(req('GET', `/api/week-approvals?timesheetId=${week.id}`))
    const text = await res.text()
    expect(res.status, text.slice(0, 300)).toBe(200)
    const body = JSON.parse(text)
    expect(body.data.week.id).toBe(week.id)
    expect(body.data.week.personName).toBe('Karthik Menon')
  })

  it('a colleague’s week is refused to him in the door’s words, by the route itself, and the refused read is logged', async () => {
    const seat = await prisma.context.findFirstOrThrow({ where: { personId: karthik, revokedAt: null }, select: { companyId: true } })
    // A week Teleworld is on, worked by somebody else: the firm is on its
    // chain, so only the seat having no desk stops him.
    const theirs = await prisma.timesheet.findFirstOrThrow({
      where: {
        personId: { not: karthik },
        sellContract: { OR: [{ companyId: seat.companyId! }, { clientCompanyId: seat.companyId! }, { endClientCompanyId: seat.companyId! }] },
      },
      select: { id: true, personId: true },
    })
    as(KARTHIK)
    const mod = await import('@/app/api/week-approvals/route')
    const res = await mod.GET(req('GET', `/api/week-approvals?timesheetId=${theirs.id}`))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.message).toBe('That week is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    const logged = await prisma.accessLog.findFirst({
      where: { actorPersonId: karthik, subjectId: theirs.personId, allowed: false, action: 'WEEK_APPROVAL_VIEW' },
    })
    expect(logged).not.toBeNull()
  })

  it('his firm’s submissions list shows him only the times he was put forward, with no rate on any', async () => {
    const teleworld = (await prisma.company.findFirstOrThrow({ where: { name: 'Teleworld Solutions' }, select: { id: true } })).id
    const his = await prisma.submission.count({ where: { personId: karthik } })
    expect(his, 'Karthik was put forward on the seeded world').toBeGreaterThan(0)
    as(KARTHIK)
    const r = await get('submissions', `?direction=sent&companyId=${teleworld}&limit=50`)
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.body.data.desk.ownOnly).toBe(true)
    expect(r.body.data.submissions.length).toBeGreaterThan(0)
    for (const row of r.body.data.submissions) {
      expect(row.person.id).toBe(karthik)
      expect(row.rate).toBeNull()
    }
  })

  it('his firm’s companies, contacts, missing paperwork and invitations refuse him in a sentence', async () => {
    as(KARTHIK)
    for (const route of ['companies', 'contacts', 'loose-ends', 'invitations']) {
      const r = await get(route)
      expect(r.status, `${route} ${r.text.slice(0, 200)}`).toBe(403)
      expect(r.body.error.code).toBe('NO_DESK')
      expect(r.body.error.message).toMatch(/is not part of your seat at Teleworld Solutions\. Ask your company’s owner if you need it\.$/)
    }
  })

  it('his firm’s bench refuses him in the Bench page’s name, at the people the page opens on and at bench burn', async () => {
    as(KARTHIK)
    for (const route of ['bench/ours', 'bench/burn', 'bench/wants']) {
      const r = await get(route)
      expect(r.status, `${route} ${r.text.slice(0, 200)}`).toBe(403)
      expect(r.body.error.code).toBe('NO_DESK')
      expect(r.body.error.message).toBe('Bench is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    }
  })

  it('the chain of approvals on his own week stays a desk’s: his own page reads the chain from his own work, and the assert route refuses him at the door', async () => {
    const week = await prisma.timesheet.findFirstOrThrow({ where: { personId: karthik }, select: { id: true } })
    as(KARTHIK)
    const mod = await import('@/app/api/timesheets/[id]/assert/route')
    const res = await mod.GET(req('GET', `/api/timesheets/${week.id}/assert`), { params: Promise.resolve({ id: week.id }) })
    expect(res.status).toBe(403)
    const work = await get('me/work')
    expect(work.status, work.text.slice(0, 200)).toBe(200)
  })
})

/**
 * Sign-up walk, round five, problem 1: the import routes checked only that
 * somebody was signed in and took the company from the body. Mo, a Member
 * at Northbend Athletic, imported a person and a live $150/hr contract into
 * Teleworld Solutions; a candidate with no company read the rows with rates.
 */
describe('nobody imports into, or reads an import of, a company that is not their own (round five)', () => {
  let teleworld = ''
  let theirs = ''
  const NINA = 'nina@walk5.example'

  beforeAll(async () => {
    await freshWorld()
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    teleworld = (await prisma.company.findFirstOrThrow({ where: { name: 'Teleworld Solutions' }, select: { id: true } })).id
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: nike.id, name: 'Member' }, select: { id: true } })
    const mo = await prisma.person.create({ data: { primaryEmail: 'mo5@walk5.example', name: 'Mo Haddad' }, select: { id: true } })
    await prisma.context.create({ data: { personId: mo.id, companyId: nike.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' } })
    await prisma.person.create({ data: { primaryEmail: NINA, name: 'Nina Park' } })
    // Teleworld's own import, not yet committed, with a rate in a row.
    theirs = (await prisma.import.create({
      data: {
        companyId: teleworld, kind: 'PEOPLE', fileName: 'people.csv', mapping: { mappings: [], unmapped: [], warnings: [] } as any,
        rowCount: 1, issueCount: 0,
        rows: { create: { raw: { name: 'Walk Five Probe', 'pay rate': '90', 'bill rate': '150' } as any, parsed: { name: 'Walk Five Probe', payRate: 90, billRate: 150, startDate: '2026-10-01' } as any, issues: [] } },
      },
      select: { id: true },
    })).id
  }, 240_000)

  async function call(path: string, method: string, mod: any, params: Record<string, string>, body?: unknown) {
    const res: Response = await mod[method](req(method, path, body), { params: Promise.resolve(params) })
    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch { /* not JSON */ }
    return { status: res.status, body: parsed, text }
  }

  it('Mo cannot start an import at another company: the door refuses his seat in a sentence and nothing is written', async () => {
    as('mo5@walk5.example')
    const before = await prisma.import.count({ where: { companyId: teleworld } })
    const r = await call('/api/imports', 'POST', await import('@/app/api/imports/route'), {},
      { companyId: teleworld, kind: 'PEOPLE', rows: [{ name: 'Walk Five Probe', email: 'probe5@walk5.example', 'bill rate': '150', 'start date': '2026-10-01' }] })
    expect(r.status, r.text.slice(0, 200)).toBe(403)
    expect(r.body.error.message).toMatch(/is not part of your seat at Northbend Athletic/)
    expect(await prisma.import.count({ where: { companyId: teleworld } })).toBe(before)
  })

  it('Mo cannot read or commit Teleworld’s import, and no person, listing or contract appears at Teleworld', async () => {
    as('mo5@walk5.example')
    const rows = await call(`/api/imports/${theirs}/rows`, 'GET', await import('@/app/api/imports/[id]/rows/route'), { id: theirs })
    expect(rows.status).toBe(403)
    expect(rows.text).not.toContain('150')
    const commit = await call(`/api/imports/${theirs}/commit`, 'POST', await import('@/app/api/imports/[id]/commit/route'), { id: theirs })
    expect(commit.status).toBe(403)
    expect(await prisma.person.findFirst({ where: { name: 'Walk Five Probe' } })).toBeNull()
    expect((await prisma.import.findUniqueOrThrow({ where: { id: theirs } })).committedAt).toBeNull()
  })

  it('a candidate with no company cannot read anybody’s import rows or start an import', async () => {
    as(NINA)
    const rows = await call(`/api/imports/${theirs}/rows`, 'GET', await import('@/app/api/imports/[id]/rows/route'), { id: theirs })
    expect(rows.status).toBeGreaterThanOrEqual(400)
    expect(rows.text).not.toContain('bill rate')
    const start = await call('/api/imports', 'POST', await import('@/app/api/imports/route'), {}, { companyId: teleworld, kind: 'PEOPLE', rows: [{ name: 'X' }] })
    expect(start.status).toBeGreaterThanOrEqual(400)
  })

  it('a desk at another company is told there is no such import, and a company named in the request is never the one written to', async () => {
    as(PROGRAM)
    const rows = await call(`/api/imports/${theirs}/rows`, 'GET', await import('@/app/api/imports/[id]/rows/route'), { id: theirs })
    expect([403, 404]).toContain(rows.status)
    expect(rows.text).not.toContain('150')
    const before = await prisma.import.count({ where: { companyId: teleworld } })
    await call('/api/imports', 'POST', await import('@/app/api/imports/route'), {}, { companyId: teleworld, kind: 'PEOPLE', rows: [{ name: 'Y Z', email: 'yz@walk5.example' }] })
    expect(await prisma.import.count({ where: { companyId: teleworld } })).toBe(before)
  })

  /** Seated the way candidate sign-up seats her: a consultant context, no company (lib/password-door). */
  async function candidate(): Promise<string> {
    const email = 'nina6@walk6.example'
    const p = await prisma.person.upsert({ where: { primaryEmail: email }, update: {}, create: { primaryEmail: email, name: 'Nina Park' }, select: { id: true } })
    if (!(await prisma.context.findFirst({ where: { personId: p.id } }))) {
      await prisma.context.create({ data: { personId: p.id, type: 'CONSULTANT' } })
    }
    return email
  }

  it('a candidate with no company is told what the Companies list is, rather than handed an empty one to create a company in', async () => {
    as(await candidate())
    const r = await get('companies')
    expect(r.status, r.text.slice(0, 200)).toBe(403)
    expect(r.body.error.message).toBe('This is a company’s list of the firms it trades with, and you are not signed in at a company.')
  })

  it('a candidate with no company is refused an import in a full sentence, not a fragment', async () => {
    as(await candidate())
    const r = await get('imports/sheets')
    expect(r.status, r.text.slice(0, 200)).toBe(403)
    expect(r.body.error.message).toBe('An import loads people into a company, and you are not signed in at one.')
  })

  it('a company’s work sites are read only by itself and the firms it trades with', async () => {
    as(NINA)
    const mod = await import('@/app/api/companies/[id]/locations/route')
    const nina = await call(`/api/companies/${teleworld}/locations`, 'GET', mod, { id: teleworld })
    expect(nina.status).toBeGreaterThanOrEqual(400)
    expect(nina.text).not.toContain('Wichita')
  })
})
