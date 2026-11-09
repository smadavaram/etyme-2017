import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as submitCandidate } from '@/app/api/submissions/route'
import { POST as awardSubmission } from '@/app/api/submissions/[id]/award/route'
import { agreeTerms, UNDER_WAY } from './hire-terms-walk'

/**
 * Who put the person forward is written on the submission, and the award
 * writes the firm's default commissions from it.
 *
 * CLAUDE.md, "Commission is an object on the sell line and on the buy
 * line" (2026-11-08): a recruiting commission is earned by whoever put the
 * person forward, a sales commission by whoever sold the deal. The column
 * `Submission.submittedById` existed and nothing wrote it, so no award
 * could ever name the recruiter.
 *
 *   Cavanaugh Glassworks   the client. Publishes the seat and awards it.
 *   Ardent Systems         a GSI, with its own employee Arun, a recruiter
 *                          (Nia) who puts him forward, and an account
 *                          manager (Omar) who holds the Cavanaugh account.
 *   Veritan Talent         a vendor whose firm sets no default commissions,
 *                          the shipped default.
 */

const CORNING_PM = 'program@corning.test'
const ARDENT_OWNER = 'owner@ardent.test'
const ARDENT_RECRUITER = 'nia@ardent.test'
const VERTEX = 'owner@vertex.test'

const co = { corning: '', ardent: '', vertex: '' }
const who = { pm: '', owner: '', nia: '', omar: '', priya: '', arun: '', maya: '', lena: '', vertexLead: '' }
const it_ = { requirement: '', arun: '', lena: '', lastLine: '', award: null as any }

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45 },
  })
  const role = await prisma.role.create({
    data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'internal submission walk' },
  })
  return { companyId: c.id, personId: p.id, roleId: role.id }
}

/** Cover on file for a supplier, which is what lets it place anybody. */
async function insure(companyId: string, uploadedById: string) {
  for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
    await prisma.verification.create({
      data: {
        companyId, type, status: 'CLEAR', provider: 'Hartford',
        issuedAt: new Date('2026-06-01'), expiresAt: new Date('2027-06-01'),
        uploadedById, verifiedById: uploadedById, verifiedAt: new Date('2026-06-02'),
        result: { outcome: 'CLEAR', notes: 'Certificate on file' },
      },
    })
  }
}


beforeAll(async () => {
  await resetDatabase()
  const corning = await company('Cavanaugh Glassworks', 'corning', 'CLIENT', CORNING_PM)
  co.corning = corning.companyId
  who.pm = corning.personId
  const ardent = await company('Ardent Systems', 'ardent-systems', 'GSI', ARDENT_OWNER)
  co.ardent = ardent.companyId
  who.owner = ardent.personId
  const vertex = await company('Veritan Talent', 'vertex-talent', 'VENDOR', VERTEX)
  co.vertex = vertex.companyId
  who.vertexLead = vertex.personId
  await insure(co.ardent, who.owner)
  await insure(co.vertex, who.vertexLead)

  const recruiter = await prisma.role.create({
    data: { companyId: co.ardent, name: 'Recruiter', permissions: ['submissions.create', 'submissions.read', 'requirements.read', 'consultants.read'] },
  })
  const am = await prisma.role.create({
    data: { companyId: co.ardent, name: 'Account Manager', permissions: ['requirements.read', 'submissions.read'] },
  })
  const engineer = await prisma.role.create({
    data: { companyId: co.ardent, name: 'Validation Engineer', permissions: ['assignments.read', 'timesheets.read'] },
  })
  const nia = await prisma.person.create({ data: { name: 'Nia Adeyemi', primaryEmail: ARDENT_RECRUITER } })
  who.nia = nia.id
  await prisma.context.create({ data: { personId: nia.id, companyId: co.ardent, roleId: recruiter.id, type: 'EMPLOYEE', grantReason: 'recruiter' } })
  const omar = await prisma.person.create({ data: { name: 'Omar Haddad', primaryEmail: 'omar@ardent.test' } })
  who.omar = omar.id
  await prisma.context.create({ data: { personId: omar.id, companyId: co.ardent, roleId: am.id, type: 'EMPLOYEE', grantReason: 'account manager' } })
  // A second account manager, whom Ardent names on the Cavanaugh relationship later in the walk.
  const priya = await prisma.person.create({ data: { name: 'Priya Nair', primaryEmail: 'priya@ardent.test' } })
  who.priya = priya.id
  await prisma.context.create({ data: { personId: priya.id, companyId: co.ardent, roleId: am.id, type: 'EMPLOYEE', grantReason: 'account manager' } })
  const arun = await prisma.person.create({ data: { name: 'Arun Nadar', primaryEmail: 'arun@ardent.test' } })
  who.arun = arun.id
  await prisma.context.create({ data: { personId: arun.id, companyId: co.ardent, roleId: engineer.id, type: 'EMPLOYEE', grantReason: 'Delivery' } })

  // Arun's last project ended in September, on Ardent's payroll at $75 an
  // hour, so the award writes his new pay line at that rate (an employee
  // between projects keeps his pay).
  const lastLine = await prisma.buyContract.create({
    data: {
      companyId: co.ardent, vendorCompanyId: null, contractType: 'W2', state: 'ENDED',
      startDate: new Date('2025-10-01'), endDate: new Date('2026-09-30'),
    },
  })
  await prisma.buyContractCandidate.create({
    data: {
      buyContractId: lastLine.id, personId: arun.id, payRate: 7_500, payCurrency: 'USD', state: 'ENDED',
      startDate: new Date('2025-10-01'), endDate: new Date('2026-09-30'),
    },
  })
  it_.lastLine = lastLine.id

  // Maya, another of Ardent's own, was put forward before the column
  // existed: her submission names nobody.
  const maya = await prisma.person.create({ data: { name: 'Maya Rao', primaryEmail: 'maya@ardent.test' } })
  who.maya = maya.id
  await prisma.context.create({ data: { personId: maya.id, companyId: co.ardent, roleId: engineer.id, type: 'EMPLOYEE', grantReason: 'Delivery' } })
  const mayaLine = await prisma.buyContract.create({
    data: { companyId: co.ardent, vendorCompanyId: null, contractType: 'W2', state: 'ENDED', startDate: new Date('2025-10-01'), endDate: new Date('2026-09-30') },
  })
  await prisma.buyContractCandidate.create({
    data: { buyContractId: mayaLine.id, personId: maya.id, payRate: 7_000, payCurrency: 'USD', state: 'ENDED', startDate: new Date('2025-10-01'), endDate: new Date('2026-09-30') },
  })

  // Omar put Cavanaugh on Ardent's register: the account manager on the relationship.
  await prisma.counterparty.create({
    data: { companyId: co.ardent, otherCompanyId: co.corning, relationship: 'CLIENT', createdById: omar.id },
  })

  // Ardent's own defaults: 10% of the margin to whoever recruited, 5% of what is billed to whoever sold.
  await prisma.company.update({
    where: { id: co.ardent },
    data: {
      commissionDefaults: {
        RECRUITING: { basis: 'SHARE_OF_MARGIN', rateBps: 1000, amountCents: null, capCents: null, accrueOn: 'ACCEPTED', currency: null, setById: who.owner, setByName: 'Ardent Systems', setAt: '2026-11-01T00:00:00.000Z' },
        SALES: { basis: 'SHARE_OF_BILLED', rateBps: 500, amountCents: null, capCents: null, accrueOn: 'ACCEPTED', currency: null, setById: who.owner, setByName: 'Ardent Systems', setAt: '2026-11-01T00:00:00.000Z' },
      },
    },
  })

  const lena = await prisma.person.create({ data: { name: 'Lena Ortiz', primaryEmail: 'lena@person.test' } })
  who.lena = lena.id
  const profile = await prisma.consultantProfile.create({
    data: { personId: lena.id, skills: ['Validation', 'GxP'], location: 'Cavanaugh Glassworks, New York', visibility: 'VERIFIED', workAuth: 'GC' },
  })
  await prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: co.vertex, tier: 'MARKETING', state: 'GRANTED',
      invitedAt: new Date('2026-08-10'), respondedAt: new Date('2026-08-11'), grantedAt: new Date('2026-08-11'),
    },
  })

  // The job is the client's: its owner (the program manager) sits at no supplier.
  const requirement = await prisma.requirement.create({
    data: {
      companyId: co.corning, title: 'Validation engineer — Sullivan Park',
      skills: ['Validation', 'GxP'], location: 'Cavanaugh Glassworks, New York',
      status: 'OPEN', approvalState: 'APPROVED', headcount: 3,
      billMin: 9_000, billMax: 13_000, months: 12,
      startDate: new Date('2026-10-05'), raisedById: who.pm, ownerId: who.pm,
    },
  })
  it_.requirement = requirement.id
  for (const toCompanyId of [co.ardent, co.vertex]) {
    await prisma.requirementInvitation.create({
      data: { requirementId: requirement.id, fromCompanyId: co.corning, toCompanyId, status: 'SENT', payMin: 9_000, payMax: 13_000, expiresAt: new Date('2026-10-01') },
    })
  }
}, 240_000)

describe('the submission names the seat that put the person forward', () => {
  it('a recruiter who puts her firm’s employee forward is written on the submission as who put him forward', async () => {
    as(ARDENT_RECRUITER)
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.requirement, personIds: [who.arun], rate: 11_500, fromCompanyId: co.ardent,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const [result] = r.body.data.results
    expect(result.status, JSON.stringify(result)).toBe('created')
    it_.arun = result.submissionId
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: it_.arun } })
    expect(row.submittedById).toBe(who.nia)
  })

  it('a vendor’s owner who puts a bench consultant forward is written as who put her forward', async () => {
    as(VERTEX)
    const r = await json(await submitCandidate(req('POST', '/api/submissions', {
      requirementId: it_.requirement, personIds: [who.lena], rate: 10_500, fromCompanyId: co.vertex,
    })))
    const [result] = r.body.data.results
    expect(result.status, JSON.stringify(result)).toBe('created')
    it_.lena = result.submissionId
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: it_.lena } })
    expect(row.submittedById).toBe(who.vertexLead)
  })

  it('a submission written before the column keeps no name, and nothing fills one in', async () => {
    const older = await prisma.submission.create({
      data: { requirementId: it_.requirement, personId: who.owner, fromCompanyId: co.ardent, toCompanyId: co.corning, kind: 'INTERNAL', rate: 11_000, status: 'SUBMITTED' },
    })
    expect(older.submittedById).toBeNull()
    await prisma.submission.delete({ where: { id: older.id } })
  })
})

describe('the award writes the firm’s default commissions on the two lines', () => {
  it('the client awards Arun, and the award is never refused for a commission', async () => {
    as(CORNING_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.arun}/award`, { rate: 11_500, startDate: '2026-10-05', endDate: '2027-10-04', ...UNDER_WAY }),
      { params: Promise.resolve({ id: it_.arun }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.award = r.body.data
  })

  it('a recruiting commission sits on the buy line, earned by the recruiter who put Arun forward', async () => {
    const buy = await prisma.buyContract.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], where: { companyId: co.ardent, id: { not: it_.lastLine }, candidates: { some: { personId: who.arun } } } })
    const rows = await prisma.contractCommission.findMany({ where: { companyId: co.ardent, kind: 'RECRUITING' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].buyContractId).toBe(buy.id)
    expect(rows[0].sellContractId).toBeNull()
    expect(rows[0].earnedById).toBe(who.nia)
    expect(rows[0].rateBps).toBe(1000)
  })

  it('a sales commission sits on the sell line, earned by the account manager on the client relationship, because the job’s owner sits at the client', async () => {
    const sell = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.ardent, personId: who.arun } })
    const rows = await prisma.contractCommission.findMany({ where: { companyId: co.ardent, kind: 'SALES' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].sellContractId).toBe(sell.id)
    expect(rows[0].earnedById).toBe(who.omar)
    expect(rows[0].setById).toBe(who.pm)
  })

  it('the award’s result counts the two rows it wrote and has nothing to say about a missing one', () => {
    expect(it_.award.commissions).toEqual({ written: 2, notWritten: [] })
  })

  it('a firm that set no default commissions gets no rows, and the award says nothing is missing', async () => {
    as(CORNING_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${it_.lena}/award`, { rate: 10_500, startDate: '2026-10-05', endDate: '2027-10-04', ...UNDER_WAY }),
      { params: Promise.resolve({ id: it_.lena }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.commissions).toEqual({ written: 0, notWritten: [] })
    expect(await prisma.contractCommission.count({ where: { companyId: co.vertex } })).toBe(0)
  })
})

describe('a firm that names nobody gets a sentence, never a refused award', () => {
  it('an older submission that names nobody is still awarded, with the sales row written and a sentence saying no recruiting commission was written', async () => {
    // Ardent names Priya as the account manager on Cavanaugh, so she sells
    // it, ahead of Omar, who only recorded the client.
    await prisma.counterparty.updateMany({ where: { companyId: co.ardent, otherCompanyId: co.corning }, data: { accountManagerId: who.priya } })
    const older = await prisma.submission.create({
      data: { requirementId: it_.requirement, personId: who.maya, fromCompanyId: co.ardent, toCompanyId: co.corning, kind: 'INTERNAL', rate: 11_000, status: 'SUBMITTED', submittedAt: new Date('2026-09-20') },
    })
    as(CORNING_PM)
    const r = await json(await awardSubmission(
      req('POST', `/api/submissions/${older.id}/award`, { rate: 11_000, startDate: '2026-10-05', endDate: '2027-10-04', ...UNDER_WAY }),
      { params: Promise.resolve({ id: older.id }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.commissions.written).toBe(1)
    expect(r.body.data.commissions.notWritten).toEqual(['No recruiting commission was written: nobody is named as having put this person forward.'])
    const sell = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.ardent, personId: who.maya } })
    expect(await prisma.contractCommission.count({ where: { sellContractId: sell.id, kind: 'SALES', earnedById: who.priya } })).toBe(1)
  })

  it('the account manager named on the client relationship earns the sales commission, ahead of whoever recorded the client', async () => {
    const sell = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.ardent, personId: who.maya } })
    const [row] = await prisma.contractCommission.findMany({ where: { sellContractId: sell.id, kind: 'SALES' } })
    expect(row.earnedById).toBe(who.priya)
    expect(row.earnedById).not.toBe(who.omar)
  })

  it('with no account manager on the relationship and the job owned at the client, no sales commission is written and the award says nobody sold it', async () => {
    const { soldBy } = await import('@/app/api/submissions/[id]/award/commission-earners')
    expect(soldBy({ jobOwner: { personId: who.pm, seatedAtSeller: false }, relationship: null })).toBeNull()
    expect(soldBy({ jobOwner: { personId: who.pm, seatedAtSeller: false }, relationship: { personId: who.nia, isAccountManager: false } })).toBeNull()
  })
})
