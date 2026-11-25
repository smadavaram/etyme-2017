import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { GET as readPlugins, PATCH as switchPlugin } from '@/app/api/settings/plugins/route'
import { PATCH as staffSwitch } from '@/app/api/superadmin/plugins/route'
import { GET as courses, POST as addCourse } from '@/app/api/training/route'
import { POST as enroll } from '@/app/api/training/enrollments/route'

/**
 * Record 120: a firm's plugin is off until its Owner (or Etyme's staff, on
 * the switch alone) turns it on, and turning it off deletes nothing.
 */

const OWNER = 'plugin-owner@firm.example'
const ADMIN = 'plugin-admin@firm.example'
const STAFF = 'plugin-staff@etyme-staff.example'
const savedStaff = process.env.ETYME_STAFF_EMAILS
const s: Record<string, string> = {}
const patch = async (email: string, body: unknown) => { as(email); return json(await switchPlugin(req('PATCH', '/api/settings/plugins', body))) }

describe('the Owner switches a plugin, and the flag and the ledger row are written together', () => {
  beforeAll(async () => {
    await resetDatabase()
    process.env.ETYME_STAFF_EMAILS = STAFF
    const firm = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'quillbrook-plugins', kind: 'VENDOR', currency: 'USD' } })
    s.firm = firm.id
    const owner = await prisma.role.create({ data: { companyId: firm.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const admin = await prisma.role.create({ data: { companyId: firm.id, name: 'Admin', permissions: ['settings.read'], isDefault: false } })
    for (const [email, name, roleId] of [[OWNER, 'Mira Osei', owner.id], [ADMIN, 'Tom Reyes', admin.id]] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: firm.id, roleId } })
    }
    await prisma.person.create({ data: { name: 'Ruth Calder', primaryEmail: STAFF } })
  }, 240_000)

  afterAll(() => {
    if (savedStaff === undefined) delete process.env.ETYME_STAFF_EMAILS; else process.env.ETYME_STAFF_EMAILS = savedStaff
  })

  it('a new company has every plugin off, and the training routes refuse in one sentence', async () => {
    const row = await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })
    expect(row.pluginsOn).toEqual([])
    as(OWNER)
    const r = await json(await courses(req('GET', '/api/training')))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Train to bench is off for Quillbrook Staffing. The Owner turns it on in Settings.')
    expect(r.body.error.href).toBe('/dashboard/settings')
    const refusal = await prisma.accessLog.findFirst({ where: { action: 'PLUGIN_OFF_REFUSED', subjectCompanyId: s.firm }, select: { allowed: true } })
    expect(refusal?.allowed).toBe(false)
  })

  it('an Admin is refused in a sentence and nothing is written', async () => {
    const r = await patch(ADMIN, { plugin: 'TRAIN_TO_BENCH', on: true })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/Only an Owner of Quillbrook Staffing/)
    expect(await prisma.pluginSwitch.count({ where: { companyId: s.firm } })).toBe(0)
  })

  it('the Owner turns Train to bench on, and the flag and one ledger row are there', async () => {
    const r = await patch(OWNER, { plugin: 'TRAIN_TO_BENCH', on: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })
    expect(row.pluginsOn).toEqual(['TRAIN_TO_BENCH'])
    const rows = await prisma.pluginSwitch.findMany({ where: { companyId: s.firm } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ plugin: 'TRAIN_TO_BENCH', on: true, byPersonId: s[OWNER], byStaff: false })
    expect(r.body.data.plugins.find((p: any) => p.key === 'PODS').on).toBe(false)
  })

  it('with it on, the Owner adds a course and the training door opens', async () => {
    as(OWNER)
    const r = await json(await addCourse(req('POST', '/api/training', { title: 'Data engineering basics', category: 'TECH', duration: 8 })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.course = r.body.data.id
  })

  it('Etyme staff switch Project teams on with a reason, and answer with the switch alone', async () => {
    as(STAFF)
    const r = await json(await staffSwitch(req('PATCH', '/api/superadmin/plugins', { slug: 'quillbrook-plugins', plugin: 'PODS', on: true, reason: 'Asked for on a call' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body).toEqual({ data: { plugin: 'PODS', on: true } })
    const row = await prisma.pluginSwitch.findFirstOrThrow({ where: { companyId: s.firm, plugin: 'PODS' } })
    expect(row).toMatchObject({ byStaff: true, reason: 'Asked for on a call' })
  })

  it('an Owner is refused the staff switch, and the refusal is in the log', async () => {
    as(OWNER)
    const r = await json(await staffSwitch(req('PATCH', '/api/superadmin/plugins', { slug: 'quillbrook-plugins', plugin: 'PODS', on: false, reason: 'trying' })))
    expect(r.status).toBe(403)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })).pluginsOn).toContain('PODS')
  })

  it('the Owner reads the staff switch as Etyme staff, never an address', async () => {
    as(OWNER)
    const r = await json(await readPlugins(req('GET', '/api/settings/plugins')))
    expect(r.status).toBe(200)
    const staff = r.body.data.switches.find((x: any) => x.byStaff)
    expect(staff.by).toBe('Etyme staff')
    expect(JSON.stringify(r.body)).not.toContain(STAFF)
    expect(r.body.data.plugins.find((p: any) => p.key === 'PODS').last.by).toBe('Etyme staff')
  })

  it('switching Train to bench off deletes no course, and switching it on again restores the door', async () => {
    const off = await patch(OWNER, { plugin: 'TRAIN_TO_BENCH', on: false })
    expect(off.status).toBe(200)
    expect(await prisma.course.count({ where: { id: s.course } })).toBe(1)
    as(OWNER)
    expect((await json(await courses(req('GET', '/api/training')))).status).toBe(403)
    expect((await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: s[ADMIN] })))).status).toBe(403)
    await patch(OWNER, { plugin: 'TRAIN_TO_BENCH', on: true })
    as(OWNER)
    const back = await json(await courses(req('GET', '/api/training')))
    expect(back.body.data.courses.map((c: any) => c.id)).toContain(s.course)
    expect(await prisma.pluginSwitch.count({ where: { companyId: s.firm } })).toBe(4)
  })
})
