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

  it('the dashboard, submissions, job requests, contractors and past contractors refuse with the door’s own sentence', () => {
    const words: Record<string, string> = {
      program: 'Dashboard', submissions: 'Submissions', requisitions: 'Job requests', people: 'Contractors', alumni: 'Past contractors',
    }
    for (const [route, page] of Object.entries(words)) {
      expect(walked[route].status, route).toBe(403)
      expect(walked[route].body.error.message).toBe(`${page} is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.`)
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

  it('a colleague’s placement is not there for him, and the refused read is logged', async () => {
    as(KARTHIK)
    const mod = await import('@/app/api/placements/[id]/route')
    const res = await mod.GET(req('GET', `/api/placements/${colleagues}`), { params: Promise.resolve({ id: colleagues }) })
    expect(res.status).toBe(404)
    const logged = await prisma.accessLog.findFirst({
      where: { actorPersonId: karthik, allowed: false, reason: 'A seat with no desk reads only a placement that names it' },
    })
    expect(logged).not.toBeNull()
  })

  it('his firm’s submissions, companies, contacts and missing paperwork refuse him in a sentence', async () => {
    as(KARTHIK)
    for (const route of ['submissions', 'companies', 'contacts', 'loose-ends', 'invitations']) {
      const r = await get(route)
      expect(r.status, `${route} ${r.text.slice(0, 200)}`).toBe(403)
      expect(r.body.error.code).toBe('NO_DESK')
      expect(r.body.error.message).toMatch(/is not part of your seat at Teleworld Solutions\. Ask your company’s owner if you need it\.$/)
    }
  })
})
