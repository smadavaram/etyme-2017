import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { POST as raise } from '@/app/api/requisitions/route'
import { GET as approvalRules } from '@/app/api/settings/approval-rules/route'
import { GET as settings } from '@/app/api/settings/route'
import { corvaneSeatEmail } from '@/lib/seed-corvane'

/**
 * The press of 2026-11-15 on Settings > Approvals and Cost centers: a firm
 * whose only rule applies to everything but is set for one department read
 * "goes to the person your approval rules name" on both tabs, while the
 * engine cleared a job request with no team by itself. Here a real job
 * request is raised through the route, and both tabs are read after it.
 */

const DOMAIN = 'demo.etyme.local'
const MARCUS = corvaneSeatEmail('hiring-dayton', DOMAIN)
const OWNER = corvaneSeatEmail('owner', DOMAIN)

let corvaneId = ''
let cfoId = ''
let unitId = ''

function job(title: string) {
  return {
    title, skills: ['Forklift'], headcount: 1,
    billMin: 2_200, billMax: 2_600, months: 6, hoursPerWeek: 40,
    description: 'Loading and staging on the second shift.', justification: 'Extra hands for the season.',
    locationId: 'cv_site_dayton',
  }
}

async function bothTabs() {
  as(OWNER)
  const a = await json(await approvalRules(req('GET', '/api/settings/approval-rules')))
  expect(a.status, JSON.stringify(a.body)).toBe(200)
  const s = await json(await settings(req('GET', '/api/settings')))
  expect(s.status, JSON.stringify(s.body)).toBe(200)
  return { approvals: a.body.data.summary as string, costCenters: s.body.data.approvalWords.costCenters as string, sameAsApprovals: s.body.data.approvalWords.approvals as string }
}

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
  cfoId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: corvaneSeatEmail('cfo', DOMAIN) } })).id
  // Start from no rules at all, so the case holds only the rule it adds.
  await prisma.approvalRule.updateMany({ where: { companyId: corvaneId }, data: { isActive: false } })
  const unit = await prisma.orgUnit.create({ data: { companyId: corvaneId, name: 'Warehouse operations', kind: 'DEPARTMENT' } })
  unitId = unit.id
}, 600_000)

describe('a rule set for one department, read on both tabs and by the engine', () => {
  it('a rule that applies to everything but is set for one department lets a job request with no team clear by itself, and both tabs say so', async () => {
    const rule = await prisma.approvalRule.create({
      data: { companyId: corvaneId, name: 'Warehouse — every job', kind: 'VALUE', thresholdAmount: null, approverId: cfoId, rank: 1, orgUnitId: unitId },
    })
    try {
      as(MARCUS)
      const r = await json(await raise(req('POST', '/api/requisitions', job('Forklift operator, department rule'))))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.decision.state).toBe('AUTO_APPROVED')

      const w = await bothTabs()
      expect(w.approvals).toBe(w.sameAsApprovals)
      for (const said of [w.approvals, w.costCenters]) {
        expect(said).toContain('A job request with no cost center clears by itself, with a note on it, because no rule for the whole company names a person to ask.')
        expect(said).toContain('One rule is set for one department. It applies only to job requests for that department.')
        expect(said).not.toContain('goes to the person your approval rules name')
      }
    } finally {
      await prisma.approvalRule.update({ where: { id: rule.id }, data: { isActive: false } })
    }
  })

  it('the same rule set for the whole company makes a job request with no team wait for its person, and both tabs say so', async () => {
    const rule = await prisma.approvalRule.create({
      data: { companyId: corvaneId, name: 'Every job', kind: 'VALUE', thresholdAmount: null, approverId: cfoId, rank: 1 },
    })
    try {
      as(MARCUS)
      const r = await json(await raise(req('POST', '/api/requisitions', job('Forklift operator, company rule'))))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.decision.state).toBe('PENDING_APPROVAL')

      const w = await bothTabs()
      for (const said of [w.approvals, w.costCenters]) {
        expect(said).toContain('A job request with no cost center goes to the person your approval rules name.')
        expect(said).not.toContain('set for one department')
      }
    } finally {
      await prisma.approvalRule.update({ where: { id: rule.id }, data: { isActive: false } })
    }
  })

  it('an HR contact set for one department does not make a job request with no team wait, and both tabs say so', async () => {
    const rule = await prisma.approvalRule.create({
      data: { companyId: corvaneId, name: 'Warehouse HR', kind: 'HR', thresholdAmount: null, approverId: cfoId, rank: 1, orgUnitId: unitId },
    })
    try {
      as(MARCUS)
      const r = await json(await raise(req('POST', '/api/requisitions', job('Forklift operator, department HR'))))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.decision.state).toBe('AUTO_APPROVED')

      const w = await bothTabs()
      for (const said of [w.approvals, w.costCenters]) {
        expect(said).toContain('clears by itself')
        expect(said).toContain('One rule is set for one department.')
      }
    } finally {
      await prisma.approvalRule.update({ where: { id: rule.id }, data: { isActive: false } })
    }
  })
})
