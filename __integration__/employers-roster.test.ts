import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'

import { GET as bench } from '@/app/api/bench/route'
import { GET as consultants } from '@/app/api/consultants/route'

/**
 * Two screens on one menu, and the same firm's people on both.
 *
 * Found by a screen-by-screen walk of four party types on 2026-09-26, and
 * both halves are one bug wearing two faces.
 *
 * **CloudEPA**, a staffing vendor: its Bench page read TOTAL 5, RETAINED
 * 3, and all five had skills on record. Two clicks away its Training page
 * read "Bench consultants 0 with skills listed" and computed the skill
 * gap from that nought — because it read the bench answer under
 * `data.listings`, a key `/api/bench` has never sent.
 *
 * **Teleworld Solutions**, an integrator: five live EMPLOYEE seats, and
 * its Consultants page read "TOTAL 0 consultants" while its Bench page
 * was bare. Both screens read bench *listings*, and you do not ask your
 * own W2 for permission to staff them.
 */

const D = '@demo.etyme.local'
const CLOUDEPA = `world-cloudepa${D}`
const TELEWORLD = `world-teleworld${D}`

const TELEWORLD_PAYROLL = ['Amara Nwosu', 'Deepa Varma', 'Felix Brenner', 'Karthik Menon']
// The two delivery managers and the HR desk the internal-moves story
// seats (lib/seed-internal-moves, 2026-09-30) are on the payroll too.
const TELEWORLD_STAFF = ['Ingrid Solberg', 'Rahul Deshpande', 'Farah Haddad']
const SUNDARA = `world-sundara${D}`
const CLOUDEPA_BENCH = ['Grace Lindqvist', 'Helena Marsh', 'Ifeoma Balogun', 'Peter Halloran', 'Priya Raman']

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('a firm’s bench and its training page agree about how many of its people have skills', () => {
  it('reads five on CloudEPA’s bench, every one of them with skills on record', async () => {
    as(CLOUDEPA)
    const r = await json(await bench(req('GET', '/api/bench?scope=company')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const rows = [...r.body.data.tiers.RETAINED, ...r.body.data.tiers.MARKETING]
    expect(rows).toHaveLength(5)
    for (const name of CLOUDEPA_BENCH) {
      expect(rows.map((l: any) => l.consultant.person.name)).toContain(name)
    }
    // The fact the Training page could not see.
    for (const l of rows) expect(l.consultant.skills.length).toBeGreaterThan(0)
  })

  it('the number the training page counts is the number the bench route sent', async () => {
    // The same arithmetic the page now runs, over the same payload.
    const { readBench } = await import('@/lib/bench-filter')
    const { skillGap } = await import('@/lib/training')

    as(CLOUDEPA)
    const r = await json(await bench(req('GET', '/api/bench?scope=company')))
    const reading = readBench(r.body)
    expect(reading.ok, reading.why ?? '').toBe(true)
    expect(reading.rows).toHaveLength(5)

    const gap = skillGap([{ skills: ['ERP finance'] }], { people: reading.rows })
    expect(gap.people).toBe(5)
    expect(gap.peopleWithSkills).toBe(5)
    expect(gap.comparable).toBe(true)
    // Three of the five hold ERP finance, so one open role asking for it
    // is a surplus and not a deficit — which is the number that used to
    // come back as "1 needed".
    const erp = gap.rows.find((x) => x.skill.toLowerCase() === 'erp finance')!
    expect(erp.supply).toBe(3)
    expect(erp.gap).toBe(-2)
  })

  it('a skill gap is not computed from a supply of zero when the bench is full', async () => {
    const { skillGap } = await import('@/lib/training')
    const { readBench } = await import('@/lib/bench-filter')
    as(CLOUDEPA)
    const r = await json(await bench(req('GET', '/api/bench?scope=company')))
    const gap = skillGap([{ skills: ['Epic'] }], { people: readBench(r.body).rows })
    expect(gap.skillsTracked).not.toBeNull()
    expect(gap.skillsTracked).toBeGreaterThan(1)
    expect(gap.people).not.toBe(0)
  })
})

describe('a firm sees the people it employs even where none of them has agreed to be marketed', () => {
  it('names all eight of Teleworld’s own people on its own roster, its managers and HR among them', async () => {
    as(TELEWORLD)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const names = r.body.data.roster.map((x: any) => x.name)
    for (const name of [...TELEWORLD_PAYROLL, ...TELEWORLD_STAFF]) expect(names).toContain(name)
    expect(r.body.data.summary.total).toBe(8)
    // Not one of them granted a listing, and every one of them is here.
    expect(r.body.data.summary.marketable).toBe(0)
  })

  it('somebody whose assignment ended and who is on nothing else is between projects', async () => {
    as(TELEWORLD)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    const karthik = r.body.data.roster.find((x: any) => x.name === 'Karthik Menon')
    expect(karthik.standing).toBe('BETWEEN_PROJECTS')
    expect(karthik.free).toBe(true)
    expect(karthik.freeForDays).toBeGreaterThan(0)
    expect(karthik.says).toContain('Corveldt Aerospace')
    expect(r.body.data.summary.betweenProjects).toBe(1)
  })

  it('the firm’s owner is on the roster as the owner, and is never counted as free', async () => {
    as(TELEWORLD)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    const owner = r.body.data.roster.find((x: any) => x.seat === 'Owner')
    expect(owner).toBeTruthy()
    expect(owner.standing).toBe('NOT_ON_THE_RECORD')
    expect(owner.free).toBe(false)
    expect(owner.says).toContain('Their seat says Owner')
    // The only figure a delivery manager can act on excludes him.
    expect(r.body.data.summary.betweenProjects).toBe(1)
  })

  it('an employee with no work on the record is named, and nothing claims they are free', async () => {
    // Sundara's, because every Teleworld engineer now has work on the
    // record: three on its Portland and San Jose projects, one just off
    // Corveldt.
    as(SUNDARA)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    const amara = r.body.data.roster.find((x: any) => x.name === 'Olivier Renard')
    expect(amara.standing).toBe('NOT_ON_THE_RECORD')
    expect(amara.free).toBe(false)
    expect(amara.freeForDays).toBeNull()
    expect(amara.says).toMatch(/nothing on the record says whether they are free/i)
    expect(r.body.data.summary.says).toMatch(/no contract on the record here/)
  })

  it('a roster never offers to put forward somebody who has granted no listing', async () => {
    as(TELEWORLD)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    for (const row of r.body.data.roster) {
      expect(row.mayMarket).toBe(false)
      expect(row.marketSays).toMatch(/granted no bench listing/)
    }
  })

  it('a firm’s roster carries no rates, no tiers and no listing, because it is not a bench', async () => {
    as(TELEWORLD)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    expect(r.body.data.tiers).toBeUndefined()
    for (const row of r.body.data.roster) {
      expect(row.tier).toBeUndefined()
      expect(row.rateMin).toBeUndefined()
    }
  })

  it('one firm’s roster never shows another firm’s people', async () => {
    as(CLOUDEPA)
    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    const names = r.body.data.roster.map((x: any) => x.name)
    for (const name of TELEWORLD_PAYROLL) expect(names).not.toContain(name)
  })

  it('a revoked seat is off the roster the moment it is revoked', async () => {
    const person = await prisma.person.findFirst({ where: { name: 'Felix Brenner' }, select: { id: true } })
    const seat = await prisma.context.findFirst({
      where: { personId: person!.id, type: 'EMPLOYEE' },
      select: { id: true },
    })
    await prisma.context.update({ where: { id: seat!.id }, data: { revokedAt: new Date() } })
    try {
      as(TELEWORLD)
      const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
      expect(r.body.data.roster.map((x: any) => x.name)).not.toContain('Felix Brenner')
      expect(r.body.data.summary.total).toBe(7)
    } finally {
      await prisma.context.update({ where: { id: seat!.id }, data: { revokedAt: null } })
    }
  })

  it('the consultants page still reports only consultant records, and the roster is elsewhere', async () => {
    // Deliberately unchanged: `/api/consultants` reads ConsultantProfile,
    // and an integrator's own W2 has no such row and needs none. What the
    // screen owed was to stop reporting a confident nought over five real
    // people — it now says how many are on the payroll and links there.
    as(TELEWORLD)
    const c = await json(await consultants(req('GET', '/api/consultants')))
    expect(c.body.data.consultants).toHaveLength(0)

    const r = await json(await bench(req('GET', '/api/bench?scope=payroll')))
    expect(r.body.data.summary.total).toBe(8)
  })
})

describe('two screens on one menu do not disagree about the same firm’s open roles', () => {
  it('counts only the roles this firm could actually put somebody forward for', async () => {
    const { GET: burn } = await import('@/app/api/bench/burn/route')
    const { GET: requirements } = await import('@/app/api/requirements/route')

    as(CLOUDEPA)
    const b = await json(await burn(req('GET', '/api/bench/burn')))
    const r = await json(await requirements(req('GET', '/api/requirements?status=OPEN&limit=100')))

    expect(b.body?.error, JSON.stringify(b.body)).toBeUndefined()
    expect(b.body.data.openRequirements).toBe(r.body.data.requirements.length)
  })

  it('a firm is never told how many open roles exist on the rest of the platform', async () => {
    const { GET: burn } = await import('@/app/api/bench/burn/route')
    const everyOpenRole = await prisma.requirement.count({ where: { status: 'OPEN' } })

    as(CLOUDEPA)
    const b = await json(await burn(req('GET', '/api/bench/burn')))
    // The old count was this number, for every firm, whoever asked.
    expect(everyOpenRole).toBeGreaterThan(b.body.data.openRequirements)
  })
})
