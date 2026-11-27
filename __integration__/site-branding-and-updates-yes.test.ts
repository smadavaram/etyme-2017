import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { GET as readSite, PATCH as saveSite } from '@/app/api/settings/site-branding/route'
import { PATCH as setChecks } from '@/app/api/settings/website-checks/route'
import { GET as readYes, POST as giveYes, DELETE as takeBack } from '@/app/api/updates-consent/route'
import { POST as startProposal, GET as listProposals } from '@/app/api/proposals/route'
import { websiteFacts } from '@/lib/plugins'
import { saidYesToUpdates } from '@/lib/updates-consent'

/** Records 111, 79, 117, 124 with the lead's rulings of 2026-11-27. */

const OWNER = 'brand-owner@firm.example'
const ADMIN = 'brand-admin@firm.example'
const CAND = 'her@candidate.example'
const s: Record<string, string> = {}
const save = async (email: string, body: unknown) => { as(email); return json(await saveSite(req('PATCH', '/api/settings/site-branding', body))) }
const checks = async (body: unknown) => { as(OWNER); return json(await setChecks(req('PATCH', '/api/settings/website-checks', body))) }
const row = () => prisma.company.findUniqueOrThrow({ where: { id: s.firm } })
const BRAND = { logoRef: 'https://cdn.firm.example/logo.png', primaryColor: '#1b2a4a', secondaryColor: '#1F9E8F', fontPairing: 'SERIF_SANS' }

describe('a tenant saves its template and branding, and the Owner’s yes is tied to what is saved', () => {
  beforeAll(async () => {
    await resetDatabase()
    const firm = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'quillbrook-brand', kind: 'VENDOR', currency: 'USD' } })
    s.firm = firm.id
    const owner = await prisma.role.create({ data: { companyId: firm.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const admin = await prisma.role.create({ data: { companyId: firm.id, name: 'Admin', permissions: ['settings.read'], isDefault: false } })
    for (const [email, name, roleId] of [[OWNER, 'Mira Osei', owner.id], [ADMIN, 'Tom Reyes', admin.id]] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: firm.id, roleId } })
    }
    const c = await prisma.person.create({ data: { name: 'Ana Ruiz', primaryEmail: CAND } })
    s[CAND] = c.id
    await prisma.context.create({ data: { personId: c.id, type: 'CONSULTANT' } })
  }, 240_000)

  it('a new firm starts on the Ask first template with no branding stored', async () => {
    const c = await row()
    expect(c.siteTemplate).toBe('ASK_FIRST')
    expect(c.sitePrimaryColor).toBeNull()
    expect(c.sitePages).toBeNull()
  })

  it('an Admin can read the site settings but cannot save them', async () => {
    as(ADMIN)
    expect((await json(await readSite(req('GET', '/api/settings/site-branding')))).body.data.canSet).toBe(false)
    const r = await save(ADMIN, { template: 'FEED' })
    expect(r.status).toBe(403)
    expect((await row()).siteTemplate).toBe('ASK_FIRST')
  })

  it('a colour that is not six hex digits is refused in a sentence and nothing is saved', async () => {
    const r = await save(OWNER, { branding: { primaryColor: 'navy' } })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('#2B47E5')
    expect((await row()).sitePrimaryColor).toBeNull()
  })

  it('a template that is not one of the three is refused', async () => {
    expect((await save(OWNER, { template: 'GRID' })).status).toBe(422)
  })

  it('the Owner saves the branding, ledgered, and the colours are stored in capitals', async () => {
    const r = await save(OWNER, { branding: BRAND })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const c = await row()
    expect(c).toMatchObject({ sitePrimaryColor: '#1B2A4A', siteFontPairing: 'SERIF_SANS', siteLogoRef: BRAND.logoRef })
    expect(await prisma.event.count({ where: { companyId: s.firm, type: 'site.settings_saved' } })).toBe(1)
  })

  it('the Owner’s yes is over the saved values, and the website check then holds', async () => {
    expect((await checks({ brandingApproved: true })).status).toBe(200)
    const c = await row()
    expect(c.siteBrandingApprovedHash).toBeTruthy()
    expect((await websiteFacts(s.firm)).brandingApprovedAt).toBeInstanceOf(Date)
  })

  it('switching the template keeps the branding and keeps the yes', async () => {
    const r = await save(OWNER, { template: 'BOARD' })
    expect(r.status).toBe(200)
    expect(r.body.data.approvalCleared).toBe(false)
    expect((await row()).siteBrandingApprovedAt).toBeInstanceOf(Date)
    expect((await row()).sitePrimaryColor).toBe('#1B2A4A')
  })

  it('saving pages keeps the yes, because the yes is over the branding and not the words', async () => {
    const r = await save(OWNER, { pages: [{ slug: 'about-us', title: 'About us', body: 'Who we are.' }] })
    expect(r.status).toBe(200)
    expect((await row()).siteBrandingApprovedAt).toBeInstanceOf(Date)
    expect(r.body.data.pages).toHaveLength(1)
  })

  it('saving the same branding again keeps the yes', async () => {
    const r = await save(OWNER, { branding: BRAND })
    expect(r.body.data.approvalCleared).toBe(false)
    expect((await websiteFacts(s.firm)).brandingApprovedAt).not.toBeNull()
  })

  it('changing one stored colour clears the Owner’s yes and says so', async () => {
    const r = await save(OWNER, { branding: { ...BRAND, secondaryColor: '#7A1FA2' } })
    expect(r.status).toBe(200)
    expect(r.body.data.approvalCleared).toBe(true)
    expect(r.body.data.says).toContain('no longer counts')
    const c = await row()
    expect(c.siteBrandingApprovedAt).toBeNull()
    expect(c.siteBrandingApprovedHash).toBeNull()
    expect((await websiteFacts(s.firm)).brandingApprovedAt).toBeNull()
    expect(await prisma.event.count({ where: { companyId: s.firm, type: 'site.branding_withdrawn' } })).toBe(1)
  })

  it('a yes whose saved values were changed behind the route does not count and the check says why', async () => {
    await checks({ brandingApproved: true })
    expect((await websiteFacts(s.firm)).brandingApprovedAt).not.toBeNull()
    await prisma.company.update({ where: { id: s.firm }, data: { sitePrimaryColor: '#000000' } })
    const f = await websiteFacts(s.firm)
    expect(f.brandingApprovedAt).toBeNull()
    expect(f.brandingApprovalStale).toBe(true)
  })

  it('a colour too pale to read on white is warned about and still kept as the Owner set it', async () => {
    const r = await save(OWNER, { branding: { ...BRAND, primaryColor: '#FFEE88' } })
    expect(r.body.data.contrastWarnings[0]).toContain('hard to read')
    expect((await row()).sitePrimaryColor).toBe('#FFEE88')
  })
})

describe('a candidate’s own yes to updates', () => {
  it('nobody has said yes until she does, and the page says so', async () => {
    as(CAND)
    const r = await json(await readYes(req('GET', '/api/updates-consent')))
    expect(r.body.data?.yes, JSON.stringify(r.body)).toBe(false)
    expect(r.body.data.says).toContain('until you say yes')
  })

  it('she says yes and the day is kept on her own record', async () => {
    as(CAND)
    const r = await json(await giveYes(req('POST', '/api/updates-consent')))
    expect(r.status).toBe(201)
    const p = await prisma.person.findUniqueOrThrow({ where: { id: s[CAND] } })
    expect(p.updatesYesAt).toBeInstanceOf(Date)
    expect(saidYesToUpdates(p)).toBe(true)
    expect(await prisma.event.count({ where: { subjectId: s[CAND], type: 'person.updates_yes_given' } })).toBe(1)
  })

  it('she takes it back and the yes ends, with both days kept', async () => {
    as(CAND)
    await takeBack(req('DELETE', '/api/updates-consent'))
    const p = await prisma.person.findUniqueOrThrow({ where: { id: s[CAND] } })
    expect(p.updatesYesAt).toBeInstanceOf(Date)
    expect(p.updatesRevokedAt).toBeInstanceOf(Date)
    expect(saidYesToUpdates(p)).toBe(false)
  })

  it('a new yes after a revoke restores it', async () => {
    as(CAND)
    await giveYes(req('POST', '/api/updates-consent'))
    expect(saidYesToUpdates(await prisma.person.findUniqueOrThrow({ where: { id: s[CAND] } }))).toBe(true)
  })

  it('her yes is on her own record only and never on anybody else’s', async () => {
    expect((await prisma.person.findUniqueOrThrow({ where: { id: s[OWNER] } })).updatesYesAt).toBeNull()
  })
})

describe('a person records a bid for the proposals agent', () => {
  const start = async (body: unknown) => { as(OWNER); return json(await startProposal(req('POST', '/api/proposals', body))) }
  it('a bid is recorded with its title, issuing body, due day, link and pasted requirements, by the person who typed them', async () => {
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['PUBLIC_SECTOR'] } })
    const r = await start({ title: 'RFP 26-114 Data services', buyer: 'County Office of Technology', dueAt: '2027-01-31', sourceUrl: 'https://county.example/rfp/26-114', requirements: 'Vendor must hold insurance of 2 million.' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const p = await prisma.proposal.findUniqueOrThrow({ where: { id: r.body.data.id } })
    expect(p).toMatchObject({ buyer: 'County Office of Technology', sourceUrl: 'https://county.example/rfp/26-114', requirements: 'Vendor must hold insurance of 2 million.', createdById: s[OWNER] })
    as(OWNER)
    const list = await json(await listProposals(req('GET', '/api/proposals')))
    expect(list.body.data[0].sourceUrl).toBe('https://county.example/rfp/26-114')
  })
  it('a link that is not a web address is refused in a sentence and no bid is recorded', async () => {
    const before = await prisma.proposal.count({ where: { companyId: s.firm } })
    const r = await start({ title: 'Bad link', sourceUrl: 'not a link' })
    expect(r.status).toBe(422)
    expect(await prisma.proposal.count({ where: { companyId: s.firm } })).toBe(before)
  })
})
