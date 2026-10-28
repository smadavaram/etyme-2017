import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { GET as siteForm } from '@/app/api/requisitions/sites/route'
import { POST as raise } from '@/app/api/requisitions/route'
import { GET as readJob } from '@/app/api/requisitions/[id]/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as approve } from '@/app/api/requisitions/[id]/approve/route'
import { POST as awardSubmission } from '@/app/api/submissions/[id]/award/route'
import { UNDER_WAY } from './hire-terms-walk'
import { corvaneSeatEmail } from '@/lib/seed-corvane'

/**
 * What the site changes when Marcus Hollins posts a job (founder,
 * 2026-10-28, the Sites drawing, screen three): the form opens on his
 * site, the job goes to the suppliers approved there, a firm not
 * approved there is refused in a sentence that says to ask Procurement,
 * and the placement awarded from it is at the same site.
 */

const DOMAIN = 'demo.etyme.local'
const MARCUS = corvaneSeatEmail('hiring-dayton', DOMAIN)
const OWNER = corvaneSeatEmail('owner', DOMAIN)
const DAYTON_THREE = ['Harbor Industrial Labor', 'Keystone Crew Partners', 'Ridgeline Staffing']
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const firm: Record<string, string> = {}
let corvaneId = ''

/** A forklift job at Dayton, posted as Marcus. */
function job(extra: Record<string, unknown>) {
  return {
    title: 'Forklift operator, second shift', skills: ['Forklift'], headcount: 1,
    billMin: 2_200, billMax: 2_600, months: 6, hoursPerWeek: 40,
    description: 'Loading and staging on the second shift.', justification: 'Extra hands for the season.',
    ...extra,
  }
}

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
  for (const slug of ['ridgeline-staffing', 'harbor-industrial-labor', 'keystone-crew-partners', 'lakemont-workforce']) {
    const c = await prisma.company.findUniqueOrThrow({ where: { slug: `world-cv-${slug}` }, select: { id: true, name: true } })
    firm[c.name] = c.id
  }
}, 600_000)

describe('the job form at a site', () => {
  it('a job form pre-selects the primary site', async () => {
    as(MARCUS)
    const r = await json(await siteForm(req('GET', '/api/requisitions/sites')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const primary = await prisma.companyLocation.findFirstOrThrow({ where: { companyId: corvaneId, isPrimary: true } })
    expect(r.body.data.site.id).toBe(primary.id)
    expect(r.body.data.site.id).toBe('cv_site_dayton')
    expect(r.body.data.sites.length).toBe(31)
    expect(r.body.data.siteSays).toBe('Your site. Days off, the time limit and the pay currency follow it.')
    expect(r.body.data.suppliers.map((f: any) => f.name)).toEqual(DAYTON_THREE)
    expect(r.body.data.suppliers.every((f: any) => f.says === 'approved at Dayton')).toBe(true)
    expect(r.body.data.says).toBe(
      'Three suppliers are approved at Dayton. To send it to Lakemont Workforce as well, ask Procurement to add them to this site.'
    )
  })
})

describe('who a job at a site goes to', () => {
  let daytonJob = ''

  it('a job at a site goes to that site’s suppliers by default', async () => {
    as(MARCUS)
    const form = await json(await siteForm(req('GET', '/api/requisitions/sites')))
    const ticks = form.body.data.suppliers.map((f: any) => f.id)
    const r = await json(await raise(req('POST', '/api/requisitions', job({ locationId: 'cv_site_dayton', sendTo: ticks }))))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    daytonJob = r.body.data.requisition.id
    const row = await prisma.requirement.findUniqueOrThrow({ where: { id: daytonJob } })
    expect(row.locationId).toBe('cv_site_dayton')
    expect(row.location).toBe('Dayton, Ohio')
    // Within plan it publishes itself, and goes out on the raise.
    expect(r.body.data.decision.state).toBe('AUTO_APPROVED')
    const sent = await prisma.requirementInvitation.findMany({ where: { requirementId: daytonJob }, select: { toCompanyId: true } })
    expect(sent.map((i) => i.toCompanyId).sort()).toEqual(DAYTON_THREE.map((n) => firm[n]).sort())
    expect(r.body.data.sentSays).toBe('Sent to Harbor Industrial Labor, Keystone Crew Partners and Ridgeline Staffing.')
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: corvaneId, action: 'REQUISITION_DISTRIBUTED', payload: { path: ['requirementId'], equals: daytonJob } },
    })
    expect(log.reason).toMatch(/^Sent when it cleared by rule, to the suppliers Marcus Hollins ticked approved at Dayton: /)
    as(OWNER)
    const page = await json(await readJob(req('GET', `/api/requisitions/${daytonJob}`), params(daytonJob)))
    expect(page.body.data.requisition.site).toMatchObject({ id: 'cv_site_dayton', name: 'Dayton, Ohio' })
    expect(page.body.data.requisition.siteSuppliers.ids.sort()).toEqual(DAYTON_THREE.map((n) => firm[n]).sort())
  })

  it('the hiring manager may untick a supplier, and the job goes to the ones left', async () => {
    as(MARCUS)
    const r = await json(await raise(req('POST', '/api/requisitions', job({
      title: 'Forklift operator, night shift', locationId: 'cv_site_dayton', sendTo: [firm['Ridgeline Staffing']],
    }))))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.decision.state).toBe('AUTO_APPROVED')
    const sent = await prisma.requirementInvitation.findMany({ where: { requirementId: r.body.data.requisition.id } })
    expect(sent.map((i) => i.toCompanyId)).toEqual([firm['Ridgeline Staffing']])
  })

  it('a job at a site cannot be sent to a supplier not approved there, and the refusal says to ask Procurement', async () => {
    const before = await prisma.requirement.count({ where: { companyId: corvaneId } })
    as(MARCUS)
    const r = await json(await raise(req('POST', '/api/requisitions', job({
      title: 'Forklift operator, weekend shift', locationId: 'cv_site_dayton',
      sendTo: [firm['Ridgeline Staffing'], firm['Lakemont Workforce']],
    }))))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(
      'Lakemont Workforce is not approved at Dayton. Ask Procurement to add them to this site, or pick another supplier.'
    )
    expect(await prisma.requirement.count({ where: { companyId: corvaneId } })).toBe(before)

    // And the release route refuses the same firm on a job already at Dayton.
    as(OWNER)
    const out = await json(await distribute(
      req('POST', `/api/requisitions/${daytonJob}/distribute`, { vendors: [{ companyId: firm['Lakemont Workforce'] }] }),
      params(daytonJob),
    ))
    expect(out.status).toBe(403)
    expect(out.body.error.message).toBe(
      'Lakemont Workforce is not approved at Dayton. Ask Procurement to add them to this site, or pick another supplier.'
    )
    expect(await prisma.requirementInvitation.count({ where: { requirementId: daytonJob, toCompanyId: firm['Lakemont Workforce'] } })).toBe(0)
  })

  it('a job with no site goes to every approved supplier and says so', async () => {
    // A job posted before sites: no site on it, so the release goes where it always went.
    const marcus = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MARCUS } })
    const older = await prisma.requirement.create({
      data: {
        companyId: corvaneId, title: 'Maintenance technician', skills: ['Maintenance'], location: 'Dayton plant',
        status: 'OPEN', approvalState: 'APPROVED', headcount: 1, raisedById: marcus.id, ownerId: marcus.id,
      },
    })
    as(OWNER)
    const page = await json(await readJob(req('GET', `/api/requisitions/${older.id}`), params(older.id)))
    expect(page.body.data.requisition.site).toBeNull()
    expect(page.body.data.requisition.siteSuppliers).toBeNull()
    const out = await json(await distribute(
      req('POST', `/api/requisitions/${older.id}/distribute`, { vendors: [{ companyId: firm['Lakemont Workforce'] }] }),
      params(older.id),
    ))
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect(out.body.data.summary.sent).toBe(1)

    // A company with no site at all: the form says the job goes to every
    // approved supplier, and ticks them all.
    const bare = await prisma.company.create({ data: { name: 'Fernhill Bakeries', slug: 'job-site-fernhill', kind: 'CLIENT', currency: 'USD' } })
    const role = await prisma.role.create({ data: { companyId: bare.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const owner = await prisma.person.create({ data: { name: 'Odile Fernhill', primaryEmail: 'owner@fernhill.invalid' } })
    await prisma.context.create({ data: { personId: owner.id, companyId: bare.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'job site walk' } })
    await prisma.counterparty.create({ data: { companyId: bare.id, otherCompanyId: firm['Lakemont Workforce'], relationship: 'SUPPLIER', tier: 'APPROVED' } })
    as('owner@fernhill.invalid')
    const r = await json(await siteForm(req('GET', '/api/requisitions/sites')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.site).toBeNull()
    expect(r.body.data.says).toBe('No site is set, so the job goes to every approved supplier.')
  })
})

describe('the placement', () => {
  it('the placement is at the job’s site', async () => {
    const marcus = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MARCUS } })
    const ridgelineOwner = await prisma.context.findFirstOrThrow({
      where: { companyId: firm['Ridgeline Staffing'], type: 'EMPLOYEE', revokedAt: null, role: { permissions: { has: '*' } } },
      select: { roleId: true },
    })
    const seat = await prisma.requirement.create({
      data: {
        companyId: corvaneId, title: 'Line lead, first shift', skills: ['Line lead'],
        location: 'Dayton, Ohio', locationId: 'cv_site_dayton',
        status: 'OPEN', approvalState: 'APPROVED', headcount: 1, billMax: 3_000, months: 6,
        startDate: new Date(), raisedById: marcus.id, ownerId: marcus.id,
      },
    })
    // Cover on file, which is what lets a supplier place anybody at all.
    for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
      await prisma.verification.create({
        data: {
          companyId: firm['Ridgeline Staffing'], type, status: 'CLEAR', provider: 'Hartford',
          issuedAt: new Date(Date.now() - 90 * 86_400_000), expiresAt: new Date(Date.now() + 300 * 86_400_000),
          uploadedById: marcus.id, verifiedById: marcus.id, verifiedAt: new Date(),
          result: { outcome: 'CLEAR', notes: 'Certificate on file' },
        },
      })
    }
    // Ridgeline's own employee, so the employment is the consent.
    const worker = await prisma.person.create({ data: { name: 'Tomasz Wierzbicki', primaryEmail: 'tomasz@ridgeline.invalid' } })
    await prisma.context.create({
      data: { personId: worker.id, companyId: firm['Ridgeline Staffing'], roleId: ridgelineOwner.roleId, type: 'EMPLOYEE', grantReason: 'Delivery' },
    })
    const sub = await prisma.submission.create({
      data: {
        requirementId: seat.id, personId: worker.id, fromCompanyId: firm['Ridgeline Staffing'], toCompanyId: corvaneId,
        kind: 'INTERNAL', rate: 2_800, contractType: 'W2', status: 'SUBMITTED',
      },
    })
    as(MARCUS)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${sub.id}/award`, { ...UNDER_WAY, startDate: new Date().toISOString().slice(0, 10) }),
      params(sub.id),
    ))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    const line = await prisma.sellContract.findFirstOrThrow({ where: { requirementId: seat.id, personId: worker.id } })
    expect(line.workLocationId).toBe('cv_site_dayton')
  })
})

describe('posting for somebody else’s site', () => {
  it('an MSP seated in a client’s program posts at the client’s sites, never its own', async () => {
    const seat = await prisma.programSeat.findFirstOrThrow({
      where: { revokedAt: null },
      select: { officeCompanyId: true, clientCompanyId: true },
    })
    const officeSeat = await prisma.context.findFirstOrThrow({
      where: { companyId: seat.officeCompanyId, type: 'EMPLOYEE', revokedAt: null, role: { permissions: { has: '*' } } },
      select: { person: { select: { primaryEmail: true } } },
    })
    as(officeSeat.person.primaryEmail)
    const r = await json(await siteForm(req('GET', '/api/requisitions/sites')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const clientSites = await prisma.companyLocation.findMany({ where: { companyId: seat.clientCompanyId }, select: { id: true } })
    expect(r.body.data.sites.map((x: any) => x.id).sort()).toEqual(clientSites.map((x) => x.id).sort())
    expect(r.body.data.sites.length).toBeGreaterThan(0)
  })
})

describe('a job that waits for approval', () => {
  it('a hiring manager’s unticks survive the approval and the job goes only to the ones left', async () => {
    // Somebody to ask: every job at Corvane over a dollar goes to its CFO.
    const cfo = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: corvaneSeatEmail('cfo', DOMAIN) } })
    const rule = await prisma.approvalRule.create({
      data: { companyId: corvaneId, name: 'Every job — CFO', kind: 'VALUE', thresholdAmount: 1, approverId: cfo.id, rank: 1 },
    })
    try {
      as(MARCUS)
      const keep = [firm['Ridgeline Staffing'], firm['Keystone Crew Partners']]
      const r = await json(await raise(req('POST', '/api/requisitions', job({
        title: 'Forklift operator, relief shift', locationId: 'cv_site_dayton', sendTo: keep, budget: 9_000_000,
      }))))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.decision.state).toBe('PENDING_APPROVAL')
      expect(r.body.data.sentSays).toBe('Once it is approved, it goes to the two suppliers you ticked at Dayton.')
      const id = r.body.data.requisition.id
      const marcus = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MARCUS } })
      const kept = await prisma.requirement.findUniqueOrThrow({ where: { id } })
      expect([...kept.sendToSupplierIds].sort()).toEqual([...keep].sort())
      expect(kept.sendToSetById).toBe(marcus.id)
      expect(kept.sendToSetAt).not.toBeNull()
      expect(await prisma.requirementInvitation.count({ where: { requirementId: id } })).toBe(0)

      // The job's page ticks his two, not the site's three.
      as(OWNER)
      const page = await json(await readJob(req('GET', `/api/requisitions/${id}`), params(id)))
      expect([...page.body.data.requisition.ticked.ids].sort()).toEqual([...keep].sort())
      expect(page.body.data.requisition.ticked.by).toBe('Marcus Hollins')

      as(corvaneSeatEmail('cfo', DOMAIN))
      const yes = await json(await approve(req('POST', `/api/requisitions/${id}/approve`, { action: 'approve' }), params(id)))
      expect(yes.status, JSON.stringify(yes.body)).toBeLessThan(300)
      const sent = await prisma.requirementInvitation.findMany({ where: { requirementId: id }, select: { toCompanyId: true } })
      expect(sent.map((i) => i.toCompanyId).sort()).toEqual([...keep].sort())
      expect(sent.map((i) => i.toCompanyId)).not.toContain(firm['Harbor Industrial Labor'])
      const log = await prisma.automationLog.findFirstOrThrow({
        where: { companyId: corvaneId, action: 'REQUISITION_DISTRIBUTED', payload: { path: ['requirementId'], equals: id } },
      })
      expect(log.reason).toMatch(/^Sent when it was approved, to the suppliers Marcus Hollins ticked approved at Dayton: /)
    } finally {
      await prisma.approvalRule.update({ where: { id: rule.id }, data: { isActive: false } })
    }
  })
})
