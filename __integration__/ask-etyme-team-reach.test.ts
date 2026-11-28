import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as askPost } from '@/app/api/conversations/twin/route'
import { GET as listSubmissions } from '@/app/api/submissions/route'

/**
 * Ask Etyme says a team grant of submissions as the routes narrow it
 * (demand, 37c14618b; the Owner gives access by team, 2026-11-08).
 *
 *   Cavanaugh Glassworks   Dayton (Dayton Line 2 under it) and Belfast
 *   Gwen Hart              the Owner, who reads the firm's by her role
 *   Rory Bell              a coordinator given jobs and submissions for Dayton
 *   Veritan Talent         put one person forward to each of the three jobs
 */

const OWNER = 'owner@cavanaugh-ask.test'
const RORY = 'rory@cavanaugh-ask.test'
const DAYTON_REACH = 'You read submissions for the Dayton team; ask the Owner for the firm’s.'

describe('a seat that reads submissions for one team is answered for that team, and told so', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Cavanaugh Glassworks', slug: 'cavanaugh-ask-reach', kind: 'CLIENT', currency: 'USD' } })
    const ownerRole = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const owner = await prisma.person.create({ data: { name: 'Gwen Hart', primaryEmail: OWNER } })
    await prisma.context.create({ data: { personId: owner.id, companyId: client.id, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })
    const dayton = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton', kind: 'BU' } })
    const line2 = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton Line 2', kind: 'DEPARTMENT', parentId: dayton.id } })
    const belfast = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Belfast', kind: 'BU' } })
    const coordinator = await prisma.role.create({ data: { companyId: client.id, name: 'Coordinator', permissions: ['consultants.read'] } })
    const rory = await prisma.person.create({ data: { name: 'Rory Bell', primaryEmail: RORY } })
    const seat = await prisma.context.create({ data: { personId: rory.id, companyId: client.id, roleId: coordinator.id, type: 'EMPLOYEE', grantReason: 'coordinator' } })
    for (const permission of ['requirements.read', 'submissions.read']) {
      await prisma.permissionGrant.create({
        data: { companyId: client.id, permission, contextId: seat.id, scope: 'UNIT', orgUnitId: dayton.id, grantedById: owner.id, reason: 'Rory runs Dayton’s contractors' },
      })
    }
    const vendor = await prisma.company.create({ data: { name: 'Veritan Talent', slug: 'veritan-ask-reach', kind: 'VENDOR', currency: 'USD' } })
    const lead = await prisma.person.create({ data: { name: 'Vera Lane', primaryEmail: 'vera@veritan-ask.test' } })
    const jobs: Array<[string, string, string]> = [
      ['Dayton line lead', dayton.id, 'Ada Quill'],
      ['Line 2 controls tech', line2.id, 'Ben Okoro'],
      ['Belfast furnace engineer', belfast.id, 'Cara Doyle'],
    ]
    for (const [title, orgUnitId, name] of jobs) {
      const r = await prisma.requirement.create({
        data: { companyId: client.id, title, skills: ['PLC'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1, orgUnitId, raisedById: owner.id, ownerId: owner.id },
      })
      const person = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}@person-ask.test` } })
      await prisma.submission.create({
        data: { requirementId: r.id, personId: person.id, fromCompanyId: vendor.id, toCompanyId: client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', submittedById: lead.id },
      })
    }
  }, 240_000)

  const ask = async (email: string, text: string) => {
    as(email)
    const r = await json(await askPost(req('POST', '/api/conversations/twin', { text })))
    expect(r.status, text).toBe(200)
    return r.body.data.answer
  }

  it('“Who applied?” names only the Dayton team’s candidates, the ones the Submissions route gives the same seat, and ends on that reach', async () => {
    as(RORY)
    const listed = (await json(await listSubmissions(req('GET', '/api/submissions?direction=received&limit=50')))).body.data.submissions
      .map((x: { person: { name: string } }) => x.person.name).sort()
    expect(listed).toEqual(['Ada Quill', 'Ben Okoro'])
    const a = await ask(RORY, 'Who applied?')
    expect(a.kind).toBe('LIST')
    expect(a.table.rows.map((r: { cells: string[] }) => r.cells[0]).sort()).toEqual(listed)
    expect(JSON.stringify(a)).not.toContain('Cara Doyle')
    expect(a.says.endsWith(DAYTON_REACH)).toBe(true)
  })

  it('“Who applied for the Dayton line lead job?” is answered for that job, and says the reach', async () => {
    const a = await ask(RORY, 'Who applied for the Dayton line lead job?')
    expect(a.says).toBe(`One candidate applied for the Dayton line lead job: Ada Quill. Checked just now. ${DAYTON_REACH}`)
  })

  it('“Who applied for the Belfast furnace engineer job?”, another team’s, is refused naming the reach, as the submissions route refuses it, and nobody is named', async () => {
    const a = await ask(RORY, 'Who applied for the Belfast furnace engineer job?')
    expect(a).toMatchObject({
      kind: 'TEXT',
      says: 'You read submissions for the Dayton team, and this one is outside it. Ask the Owner of Cavanaugh Glassworks for the firm’s.',
    })
    expect(JSON.stringify(a)).not.toContain('Cara Doyle')
  })

  it('the Owner, whose role reads the firm’s, is answered for every team and told no reach', async () => {
    const a = await ask(OWNER, 'Who applied?')
    expect(a.table.rows.map((r: { cells: string[] }) => r.cells[0]).sort()).toEqual(['Ada Quill', 'Ben Okoro', 'Cara Doyle'])
    expect(a.says).not.toContain('You read submissions for')
  })
})
