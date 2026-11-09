import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { POST as directory, GET as sources } from '@/app/api/settings/team-structure/directory/route'
import { POST as change } from '@/app/api/settings/team-structure/route'
import { corvaneSeatEmail } from '@/lib/seed-corvane'
import { actBody } from '@/lib/team-structure/acts'

/**
 * The team structure from Corvane's directory, a file exported from
 * Active Directory (founder, 2026-11-09): previewed, ticked, made through
 * the tree's own acts, nothing deleted, a screen edit kept, nobody made a
 * seat, no contractor moved, and every read of the directory logged.
 */

const DOMAIN = 'demo.etyme.local'
const OWNER = corvaneSeatEmail('owner', DOMAIN)
const e = (desk: string) => corvaneSeatEmail(desk, DOMAIN)
let corvaneId = ''

const CSV = () => [
  'name,email,department,manager,officeLocation,country,jobTitle',
  `Astrid Berge,${e('operations')},Operations,${e('owner')},,,Head of Operations`,
  `Yvette Marchetti,${e('compliance')},Quality,${e('operations')},,,Compliance Officer`,
  `Lucas Fairbairn,${e('ap')},Quality,${e('compliance')},,,AP Clerk`,
  `Somebody New,somebody.new@corvane.example,Quality,${e('compliance')},,,Inspector`,
].join('\n')

const post = async (body: unknown, who = OWNER) => {
  as(who)
  return json(await directory(req('POST', '/api/settings/team-structure/directory', body)))
}

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
}, 600_000)

describe('importing Corvane’s team structure from a file', () => {
  it('Entra ID and Google Workspace say they are not connected and what the IT admin approves; the file works today', async () => {
    as(OWNER)
    const s = await json(await sources(req('GET', '/api/settings/team-structure/directory')))
    expect(s.body.data.sources.map((x: any) => [x.key, x.connected])).toEqual([['ENTRA', false], ['GOOGLE', false], ['CSV', true]])
    const r = await post({ source: 'ENTRA' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/^Microsoft Entra ID is not connected for Corvane Packaging\..*User\.Read\.All.*Meanwhile, a file exported from Active Directory works today\.$/)
  })

  it('the preview lists every change and makes none, and the read is in the access log as the company’s', async () => {
    const units = await prisma.orgUnit.count({ where: { companyId: corvaneId } })
    const logged = await prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: true } })
    const r = await post({ source: 'CSV', csv: CSV() })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const says = r.body.data.changes.map((c: any) => c.says)
    expect(says).toContain('New department "Quality" under Operations, led by Yvette Marchetti. 3 people have department = Quality.')
    expect(r.body.data.invitations.map((i: any) => i.email)).toEqual(['somebody.new@corvane.example'])
    expect(await prisma.orgUnit.count({ where: { companyId: corvaneId } })).toBe(units)
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: true } })).toBe(logged + 1)
  })

  it('only the ticked changes are made, each kept as from the directory with the Owner’s name, and nobody is made a seat', async () => {
    const seats = await prisma.context.count({ where: { companyId: corvaneId } })
    const preview = await post({ source: 'CSV', csv: CSV() })
    const keys: string[] = preview.body.data.changes.filter((c: any) => c.ticked && !/Lucas Fairbairn/.test(c.says)).map((c: any) => c.key)
    const r = await post({ source: 'CSV', csv: CSV(), apply: keys })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.refused).toEqual([])
    const quality = await prisma.orgUnit.findFirstOrThrow({ where: { companyId: corvaneId, name: 'Quality' }, select: { id: true, parentId: true, kind: true, lead: { select: { person: { select: { name: true } } } } } })
    expect(quality).toMatchObject({ parentId: 'cv_unit_dept_operations', kind: 'DEPARTMENT', lead: { person: { name: 'Yvette Marchetti' } } })
    // Lucas was not ticked, so he is where he was.
    expect((await prisma.context.findUniqueOrThrow({ where: { id: 'cv_ctx_ap' } })).orgUnitId).toBe('cv_unit_dept_finance')
    expect(await prisma.context.count({ where: { companyId: corvaneId } })).toBe(seats)
    const kept = await prisma.orgChange.findMany({ where: { companyId: corvaneId, source: 'DIRECTORY' }, select: { actor: { select: { name: true } } } })
    expect(kept.length).toBeGreaterThan(0)
    for (const k of kept) expect(k.actor?.name).toBe('Graham Ellery')
  })

  it('a person the Owner placed on the screen stays; the directory’s disagreement asks, unticked', async () => {
    as(OWNER)
    const moved = await json(await change(req('POST', '/api/settings/team-structure', actBody('MOVE_PERSON', { contextId: 'cv_ctx_ap', unitId: 'cv_unit_dept_compliance' }))))
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    const r = await post({ source: 'CSV', csv: CSV() })
    const lucas = r.body.data.changes.find((c: any) => /Lucas Fairbairn/.test(c.says))
    expect(lucas).toMatchObject({ tag: 'ASKS', ticked: false, tickable: true })
  })

  it('an import moves no contractor and deletes nothing', async () => {
    const before = await prisma.sellContract.groupBy({ by: ['orgUnitId'], where: { orgUnit: { companyId: corvaneId } }, _count: { _all: true } })
    const units = await prisma.orgUnit.count({ where: { companyId: corvaneId } })
    const preview = await post({ source: 'CSV', csv: CSV() })
    await post({ source: 'CSV', csv: CSV(), apply: preview.body.data.changes.map((c: any) => c.key) })
    expect(await prisma.sellContract.groupBy({ by: ['orgUnitId'], where: { orgUnit: { companyId: corvaneId } }, _count: { _all: true } })).toEqual(before)
    expect(await prisma.orgUnit.count({ where: { companyId: corvaneId } })).toBeGreaterThanOrEqual(units)
  })

  it('a hiring manager cannot import a directory, and the refusal is logged before it is sent', async () => {
    const before = await prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: false } })
    const r = await post({ source: 'CSV', csv: CSV() }, e('hiring-dayton'))
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: corvaneId, allowed: false } })).toBe(before + 1)
  })
})
