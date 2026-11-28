import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as listJobs } from '@/app/api/requirements/route'
import { GET as listSubmissions } from '@/app/api/submissions/route'
import { POST as raiseJob } from '@/app/api/requisitions/route'

/**
 * The Owner gives access by team (CLAUDE.md, 2026-11-08): a seat given
 * jobs and submissions for the Dayton team reads the Dayton team's jobs
 * and the teams under it, and their submissions, and nothing of Belfast's;
 * the role's own permission still reads the firm's.
 *
 *   Cavanaugh Glassworks   the client: Dayton (with Dayton Line 2 under it) and Belfast
 *   Gwen Hart              the Owner, who reads the firm's book by her role
 *   Rory Bell              a coordinator whose role opens no jobs or submissions;
 *                          the Owner gives him both for the Dayton team
 *   Veritan Talent         a supplier that put people forward to all three jobs
 */

const OWNER = 'owner@cavanaugh.test'
const RORY = 'rory@cavanaugh.test'
const co = { client: '', vendor: '' }
const unit = { dayton: '', line2: '', belfast: '' }
const job = { dayton: '', line2: '', belfast: '' }
const who = { owner: '', rory: '', vendorLead: '' }

beforeAll(async () => {
  await resetDatabase()
  const client = await prisma.company.create({ data: { name: 'Cavanaugh Glassworks', slug: 'cavanaugh-grants', kind: 'CLIENT', currency: 'USD' } })
  co.client = client.id
  const ownerRole = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: 'Gwen Hart', primaryEmail: OWNER } })
  who.owner = owner.id
  await prisma.context.create({ data: { personId: owner.id, companyId: client.id, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })

  const dayton = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton', kind: 'BU' } })
  const line2 = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton Line 2', kind: 'DEPARTMENT', parentId: dayton.id } })
  const belfast = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Belfast', kind: 'BU' } })
  Object.assign(unit, { dayton: dayton.id, line2: line2.id, belfast: belfast.id })

  // A coordinator: a desk of his own (he reads consultants), and nothing
  // that opens jobs or submissions until the Owner gives it.
  const coordinator = await prisma.role.create({ data: { companyId: client.id, name: 'Coordinator', permissions: ['consultants.read'] } })
  const rory = await prisma.person.create({ data: { name: 'Rory Bell', primaryEmail: RORY } })
  who.rory = rory.id
  const seat = await prisma.context.create({ data: { personId: rory.id, companyId: client.id, roleId: coordinator.id, type: 'EMPLOYEE', grantReason: 'coordinator' } })
  for (const permission of ['requirements.read', 'requirements.write', 'submissions.read']) {
    await prisma.permissionGrant.create({
      data: { companyId: client.id, permission, contextId: seat.id, scope: 'UNIT', orgUnitId: dayton.id, grantedById: owner.id, reason: 'Rory runs Dayton’s contractors' },
    })
  }

  const vendor = await prisma.company.create({ data: { name: 'Veritan Talent', slug: 'veritan-grants', kind: 'VENDOR', currency: 'USD' } })
  co.vendor = vendor.id
  const lead = await prisma.person.create({ data: { name: 'Vera Lane', primaryEmail: 'vera@veritan.test' } })
  who.vendorLead = lead.id

  const mk = (title: string, orgUnitId: string) => prisma.requirement.create({
    data: { companyId: client.id, title, skills: ['PLC'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1, orgUnitId, raisedById: owner.id, ownerId: owner.id },
  })
  job.dayton = (await mk('Dayton line lead', dayton.id)).id
  job.line2 = (await mk('Line 2 controls tech', line2.id)).id
  job.belfast = (await mk('Belfast furnace engineer', belfast.id)).id

  let n = 0
  for (const requirementId of [job.dayton, job.line2, job.belfast]) {
    const person = await prisma.person.create({ data: { name: `Candidate ${++n}`, primaryEmail: `candidate${n}@person.test` } })
    await prisma.submission.create({
      data: { requirementId, personId: person.id, fromCompanyId: vendor.id, toCompanyId: client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', submittedById: lead.id },
    })
  }
}, 240_000)

const jobsAs = async (email: string) => {
  as(email)
  const r = await json(await listJobs(req('GET', '/api/requirements?limit=50')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}
const submissionsAs = async (email: string) => {
  as(email)
  const r = await json(await listSubmissions(req('GET', `/api/submissions?direction=received&companyId=${co.client}&limit=50`)))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

describe('a team grant of jobs and submissions is narrowed at the query', () => {
  it('a recruiter granted submissions on the Dayton team reads that team’s jobs and submissions only', async () => {
    const jobs = await jobsAs(RORY)
    expect(jobs.requirements.map((r: any) => r.title).sort()).toEqual(['Dayton line lead', 'Line 2 controls tech'])
    expect(jobs.reach.says).toBe('You read jobs for the Dayton team.')
    const subs = await submissionsAs(RORY)
    const on = (subs.submissions ?? subs.items ?? []).map((s: any) => s.requirementId ?? s.requirement?.id).sort()
    expect(on).toEqual([job.dayton, job.line2].sort())
  })

  it('a team grant never opens another team’s: Belfast’s job and its submission are not read, and raising a job in Belfast is refused naming the reach', async () => {
    const jobs = await jobsAs(RORY)
    expect(jobs.requirements.map((r: any) => r.id)).not.toContain(job.belfast)
    const subs = await submissionsAs(RORY)
    expect(JSON.stringify(subs)).not.toContain(job.belfast)

    as(RORY)
    const r = await json(await raiseJob(req('POST', '/api/requisitions', {
      title: 'Belfast batch mixer', skills: ['Batch'], location: 'Belfast', headcount: 1, months: 6, orgUnitId: unit.belfast,
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('OUTSIDE_YOUR_REACH')
    expect(r.body.error.message).toBe('You read jobs for the Dayton team, and this one is outside it. Ask the Owner of Cavanaugh Glassworks for the firm’s.')
  })

  it('the role’s own permission still reads the firm’s', async () => {
    const jobs = await jobsAs(OWNER)
    expect(jobs.requirements.map((r: any) => r.title).sort()).toEqual(['Belfast furnace engineer', 'Dayton line lead', 'Line 2 controls tech'])
    expect(jobs.reach.says).toBeNull()
    const subs = await submissionsAs(OWNER)
    expect(JSON.stringify(subs)).toContain(job.belfast)
  })
})
