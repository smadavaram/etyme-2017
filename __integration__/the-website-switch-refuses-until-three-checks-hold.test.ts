import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { PATCH as switchPlugin } from '@/app/api/settings/plugins/route'
import { PATCH as staffSwitch } from '@/app/api/superadmin/plugins/route'
import { GET as readChecks, PATCH as setChecks, POST as recordPass } from '@/app/api/settings/website-checks/route'

/** Records 121 and 123: the Website switch goes on only after branding, domain and any compliance pass. */

const OWNER = 'site-owner@firm.example'
const ADMIN = 'site-admin@firm.example'
const STAFF = 'site-staff@etyme-staff.example'
const savedStaff = process.env.ETYME_STAFF_EMAILS
const s: Record<string, string> = {}
const turn = async (on: boolean) => { as(OWNER); return json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'WEBSITE', on }))) }
const check = async (email: string, body: unknown) => { as(email); return json(await setChecks(req('PATCH', '/api/settings/website-checks', body))) }

describe('the Website switch refuses until three checks hold', () => {
  beforeAll(async () => {
    await resetDatabase()
    process.env.ETYME_STAFF_EMAILS = STAFF
    const firm = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'quillbrook-site', kind: 'VENDOR', currency: 'USD' } })
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

  it('turning Website on with nothing set is refused and names the branding and the domain', async () => {
    const r = await turn(true)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('WEBSITE_CHECKS_MISSING')
    expect(r.body.error.message).toContain('The site goes public after three checks: your branding, your domain, and any compliance pass.')
    expect(r.body.error.missing).toEqual(['BRANDING', 'DOMAIN'])
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })).pluginsOn).toEqual([])
    expect(await prisma.pluginSwitch.count({ where: { companyId: s.firm } })).toBe(0)
  })

  it('a Superadmin is refused past the same checks', async () => {
    as(STAFF)
    const r = await json(await staffSwitch(req('PATCH', '/api/superadmin/plugins', { slug: 'quillbrook-site', plugin: 'WEBSITE', on: true, reason: 'Asked for on a call' })))
    expect(r.status).toBe(422)
    expect(r.body.error.missing).toEqual(['BRANDING', 'DOMAIN'])
  })

  it('an Admin cannot approve the branding, and nothing is written', async () => {
    const r = await check(ADMIN, { brandingApproved: true })
    expect(r.status).toBe(403)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { siteBrandingApprovedAt: true } })).siteBrandingApprovedAt).toBeNull()
  })

  it('the Owner approves the branding and it is a dated record of who approved it', async () => {
    const r = await check(OWNER, { brandingApproved: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const c = await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { siteBrandingApprovedAt: true, siteBrandingApprovedById: true } })
    expect(c.siteBrandingApprovedById).toBe(s[OWNER])
    expect(c.siteBrandingApprovedAt).toBeInstanceOf(Date)
    expect(r.body.data.branding).toMatchObject({ approved: true, by: 'Mira Osei' })
    expect(await prisma.event.count({ where: { companyId: s.firm, type: 'site.branding_approved' } })).toBe(1)
  })

  it('with the branding approved the refusal names the domain alone', async () => {
    const r = await turn(true)
    expect(r.status).toBe(422)
    expect(r.body.error.missing).toEqual(['DOMAIN'])
  })

  it('once the Owner says a compliance pass is required, the refusal names it too', async () => {
    const r = await check(OWNER, { compliancePassRequired: true })
    expect(r.status).toBe(200)
    expect((await turn(true)).body.error.missing).toEqual(['DOMAIN', 'COMPLIANCE_PASS'])
  })

  it('a pass with no document attached is refused in a sentence', async () => {
    as(OWNER)
    const r = await json(await recordPass(req('POST', '/api/settings/website-checks', { passedAt: '2026-11-01' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Attach the document that shows the pass.')
  })

  it('the Owner records a pass with the person, the day and the attached document', async () => {
    as(OWNER)
    const r = await json(await recordPass(req('POST', '/api/settings/website-checks', { passedAt: '2026-11-01', fileName: 'pass.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('pass').toString('base64'), note: 'State review' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const pass = await prisma.siteCompliancePass.findFirstOrThrow({ where: { companyId: s.firm }, include: { document: { include: { file: true } } } })
    expect(pass.recordedById).toBe(s[OWNER])
    expect(pass.passedAt.toISOString().slice(0, 10)).toBe('2026-11-01')
    expect(pass.document.file?.fileName).toBe('pass.pdf')
    expect(r.body.data.checks.missing.map((m: any) => m.check)).toEqual(['DOMAIN'])
  })

  it('with a verified primary domain the Owner turns Website on, and turning it off always works', async () => {
    await prisma.customDomain.create({ data: { company: { connect: { id: s.firm } }, addedBy: { connect: { id: s[OWNER] } }, domain: 'quillbrook.example', state: 'VERIFIED', verificationToken: 't', isPrimary: true } })
    const on = await turn(true)
    expect(on.status, JSON.stringify(on.body)).toBe(200)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })).pluginsOn).toContain('WEBSITE')
    await check(OWNER, { brandingApproved: false })
    const off = await turn(false)
    expect(off.status).toBe(200)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })).pluginsOn).not.toContain('WEBSITE')
  })

  it('an Admin reads the checks but cannot set them', async () => {
    as(ADMIN)
    const r = await json(await readChecks(req('GET', '/api/settings/website-checks')))
    expect(r.status).toBe(200)
    expect(r.body.data.canSet).toBe(false)
  })
})
