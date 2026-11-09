import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { GET as tree, POST as change } from '@/app/api/settings/team-structure/route'
import { corvaneSeatEmail } from '@/lib/seed-corvane'
import { actBody, type Act, type ActValues } from '@/lib/team-structure/acts'
import { performAct } from '@/lib/team-structure/write'

/**
 * Settings → Team structure on the seeded world (founder, 2026-11-09,
 * "Build it", on the drawing of Corvane Packaging): the tree as drawn,
 * every act through the route, and every refusal in a sentence.
 */

const DOMAIN = 'demo.etyme.local'
const OWNER = corvaneSeatEmail('owner', DOMAIN)
const HIRING_DAYTON = corvaneSeatEmail('hiring-dayton', DOMAIN)
let corvaneId = ''

const read = async () => {
  as(OWNER)
  const r = await json(await tree(req('GET', '/api/settings/team-structure')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
const box = (t: any, name: string) => t.boxes.find((b: any) => b.name === name)
const post = async (act: Act, v: ActValues, who = OWNER) => {
  as(who)
  return json(await change(req('POST', '/api/settings/team-structure', actBody(act, v))))
}

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
}, 600_000)

describe('Corvane’s team structure, as the drawing has it', () => {
  it('Corvane reads three departments, Operations led by Astrid Berge over the six regions, Finance led by Margaret Osei with Lucas Fairbairn, Compliance led by Yvette Marchetti', async () => {
    const t = await read()
    const tops = t.boxes.filter((b: any) => b.parentId === null).map((b: any) => [b.name, b.kindWord, b.lead?.name])
    expect(tops).toEqual([
      ['Operations', 'Department', 'Astrid Berge'],
      ['Finance', 'Department', 'Margaret Osei'],
      ['Compliance', 'Department', 'Yvette Marchetti'],
    ])
    const ops = box(t, 'Operations')
    expect(t.boxes.filter((b: any) => b.parentId === ops.id).map((b: any) => b.name)).toEqual([
      'United States', 'Latin America', 'Vietnam', 'India', 'Belgium', 'Northern Ireland',
    ])
    expect(box(t, 'Finance').people.map((p: any) => p.name)).toEqual(['Lucas Fairbairn'])
    expect(t.owner.name).toBe('Graham Ellery')
  })

  it('Dayton is led by Marcus Hollins, stands for its site, and rolls up its contractors and open jobs', async () => {
    const t = await read()
    const dayton = box(t, 'Dayton, Ohio')
    expect(dayton.lead.name).toBe('Marcus Hollins')
    expect(dayton.site).toMatchObject({ id: 'cv_site_dayton', country: 'US', timeZone: 'America/New_York' })
    expect(dayton.roll).toMatchObject({ contractors: 14, openJobs: 2, currencies: ['USD'] })
    expect(box(t, 'United States').lead.name).toBe('Dana Whitcombe')
    // The whole of Operations rolls up every plant.
    expect(box(t, 'Operations').roll.sites).toBe(31)
  })
})

describe('the company’s own order and names', () => {
  it('a region’s sites read in the company’s own order, Dayton first, as on Sites and in the drawing', async () => {
    const t = await read()
    const us = box(t, 'United States')
    expect(t.boxes.filter((b: any) => b.parentId === us.id).map((b: any) => b.name)[0]).toBe('Dayton, Ohio')
  })

  it('a box added under a department with no name is named after its kind, "New region"', async () => {
    const r = await post('ADD', { parentId: 'cv_unit_dept_compliance', name: null, kind: null })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Added New region under Compliance. Give it a name and a lead.')
    await post('UNDO', {})
  })
})

describe('only the Owner and the Admin change the tree', () => {
  it('a hiring manager is refused the team structure in a sentence, and the refusal is in the access log before the answer', async () => {
    const before = await prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: false } })
    as(HIRING_DAYTON)
    const r = await json(await tree(req('GET', '/api/settings/team-structure')))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Reading the team structure at Corvane Packaging is done by Graham Ellery, Owner. Ask them to do it, or to give you that role.')
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: false } })).toBe(before + 1)
  })

  it('a hiring manager cannot add a box either, and nothing is written', async () => {
    const before = await prisma.orgUnit.count({ where: { companyId: corvaneId } })
    const r = await post('ADD', { parentId: null, name: 'Shadow team' }, HIRING_DAYTON)
    expect(r.status).toBe(403)
    expect(await prisma.orgUnit.count({ where: { companyId: corvaneId } })).toBe(before)
  })
})

describe('moving and deleting', () => {
  it('a region cannot be moved under one of its own sites', async () => {
    const r = await post('MOVE', { unitId: 'cv_unit_region_us', parentId: 'cv_unit_site_dayton' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('A box cannot go under itself or a box below it.')
  })

  it('Dayton cannot be deleted while contractors are charged to it', async () => {
    const r = await post('DELETE', { unitId: 'cv_unit_site_dayton' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Dayton, Ohio has 14 contractors on site and 1 starting charged to it. Move them to another box first. A site with contractors at it cannot be deleted.')
    expect(await prisma.orgUnit.findUnique({ where: { id: 'cv_unit_site_dayton' } })).not.toBeNull()
  })

  it('moving a contractor changes only the unit their line is charged to, never the supplier, the rate or the dates', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { orgUnitId: 'cv_unit_site_dayton', state: 'IN_PROGRESS' },
      orderBy: { id: 'asc' },
      select: { id: true, companyId: true, billRate: true, startDate: true, endDate: true, person: { select: { name: true } } },
    })
    const r = await post('MOVE_CONTRACTOR', { sellContractId: line.id, unitId: 'cv_unit_site_fresno' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe(`${line.person.name} is now charged to Fresno, California, moved from Dayton, Ohio. Their supplier, rate and dates are unchanged.`)
    const after = await prisma.sellContract.findUniqueOrThrow({ where: { id: line.id }, select: { orgUnitId: true, companyId: true, billRate: true, startDate: true, endDate: true } })
    expect(after).toEqual({ orgUnitId: 'cv_unit_site_fresno', companyId: line.companyId, billRate: line.billRate, startDate: line.startDate, endDate: line.endDate })
    const kept = await prisma.orgChange.findUniqueOrThrow({ where: { id: r.body.data.changeId }, select: { actor: { select: { name: true } }, act: true } })
    expect(kept).toEqual({ actor: { name: 'Graham Ellery' }, act: 'MOVE_CONTRACTOR' })
    // Undo puts them back.
    const u = await post('UNDO', {})
    expect(u.status, JSON.stringify(u.body)).toBe(200)
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: line.id } })).orgUnitId).toBe('cv_unit_site_dayton')
  })

  it('deleting a team moves its people up one level, and undo puts the team and its people back', async () => {
    const added = await post('ADD', { parentId: 'cv_unit_dept_finance', name: 'Payables', kind: 'TEAM' })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    const team = added.body.data.unitId as string
    const moved = await post('MOVE_PERSON', { contextId: 'cv_ctx_ap', unitId: team })
    expect(moved.body.data.says).toBe('Lucas Fairbairn moved from Finance to Payables.')

    const gone = await post('DELETE', { unitId: team })
    expect(gone.status, JSON.stringify(gone.body)).toBe(200)
    expect(await prisma.orgUnit.findUnique({ where: { id: team } })).toBeNull()
    expect((await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_ap' } })).orgUnitId).toBe('cv_unit_dept_finance')
    const kept = await prisma.orgChange.findFirstOrThrow({ where: { companyId: corvaneId, act: 'DELETE' }, orderBy: { at: 'desc' } })
    expect(kept.says).toBe("Deleted Payables. 1 person move up under Finance. Nobody's history or time on site changes.")

    const back = await post('UNDO', {})
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    expect((await prisma.orgUnit.findUniqueOrThrow({ where: { id: team } })).parentId).toBe('cv_unit_dept_finance')
    expect((await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_ap' } })).orgUnitId).toBe(team)
  })

  it('the Owner cannot be put on a region, because a seat there reads only that region and would lose Settings', async () => {
    const r = await post('MOVE_PERSON', { contextId: 'cv_ctx_owner', unitId: 'cv_unit_region_latam' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/^Graham Ellery sets up Corvane Packaging, and a seat on Latin America reads only that place and loses Settings/)
    expect((await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_owner' } })).orgUnitId).toBeNull()
  })

  it('renaming a region renames the region its sites carry, so whoever sits on it reads the same places', async () => {
    const r = await post('RENAME', { unitId: 'cv_unit_region_be', name: 'Benelux' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Renamed Belgium to Benelux. Its 4 sites now say Benelux on Sites, so whoever sits on it reads the same places.')
    expect(await prisma.companyLocation.count({ where: { companyId: corvaneId, region: 'Benelux' } })).toBe(4)
    await post('UNDO', {})
    expect(await prisma.companyLocation.count({ where: { companyId: corvaneId, region: 'Belgium' } })).toBe(4)
  })

  it('naming a lead records who named them and when, and grants nothing', async () => {
    const perms = await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_ap' }, select: { role: { select: { permissions: true } } } })
    const r = await post('LEAD', { unitId: 'cv_unit_dept_compliance', contextId: 'cv_ctx_ap' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toMatch(/^Lucas Fairbairn now leads Compliance\. Leading a box gives no access by itself/)
    const unit = await prisma.orgUnit.findUniqueOrThrow({ where: { id: 'cv_unit_dept_compliance' }, select: { leadContextId: true, leadSetBy: { select: { name: true } }, leadSetAt: true } })
    expect(unit.leadContextId).toBe('cv_ctx_ap')
    expect(unit.leadSetBy?.name).toBe('Graham Ellery')
    expect(unit.leadSetAt).not.toBeNull()
    expect((await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_ap' }, select: { role: { select: { permissions: true } } } })).role?.permissions).toEqual(perms.role?.permissions)
  })

  it('undo puts back the caller’s own last change only: a change somebody else made last is not undone by the Owner', async () => {
    const cfo = await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_cfo' }, select: { person: { select: { id: true, name: true } } } })
    const done = await performAct(
      { companyId: corvaneId, companyName: 'Corvane Packaging', accountWalls: false, personId: cfo.person.id, personName: cfo.person.name },
      { act: 'RENAME', unitId: 'cv_unit_dept_compliance', name: 'Compliance and audit' }
    )
    expect(done.ok).toBe(true)
    const r = await post('UNDO', {})
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('The last change was Margaret Osei\'s: "Renamed Compliance to Compliance and audit." Undo puts back your own last change only.')
    expect((await prisma.orgUnit.findUniqueOrThrow({ where: { id: 'cv_unit_dept_compliance' } })).name).toBe('Compliance and audit')
  })
})
