import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as submitCandidate } from '@/app/api/submissions/route'

/**
 * The client's time limit and work authorization, at the door where a
 * person is put forward (Addendum E). Checked before, not after the
 * client has read a CV.
 *
 *   Cavanaugh Glassworks  the client. An 18-month time limit and a 90-day
 *                         break, both BLOCK.
 *   Ardent Systems        a GSI putting its own employees forward.
 *   Ravi                  20 months on site through two suppliers, still there.
 *   Sana                  left 30 days ago after 19 months: inside the break.
 *   Omar                  16 months and still on site: a 6-month job runs past the limit.
 *   Tomas                 16 months, then a served break: the count starts again.
 *   Lee                   new to the client, cleared I-9: nothing to say.
 *   Noor                  new to the client, nothing on file.
 */

const CLIENT = 'program@cavanaugh.test'
const ARDENT = 'delivery@ardent.test'
const DAY = 86_400_000
const now = Date.now()
const ago = (d: number) => new Date(now - d * DAY)

const co = { client: '', ardent: '', other: '' }
const who: Record<string, string> = {}
let requirementId = ''

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({ data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 45 } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'time limit walk' } })
  return { id: c.id, personId: p.id }
}

async function employee(name: string, engineerRole: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase()}@ardent.test` } })
  await prisma.context.create({ data: { personId: p.id, companyId: co.ardent, type: 'EMPLOYEE', roleId: engineerRole, grantReason: 'delivery' } })
  return p.id
}

async function onSite(personId: string, fromCompanyId: string, start: Date, end: Date | null, state: any) {
  await prisma.sellContract.create({
    data: { companyId: fromCompanyId, clientCompanyId: co.client, personId, billRate: 10_000, startDate: start, endDate: end, state },
  })
}

async function i9(personId: string) {
  await prisma.verification.create({ data: { personId, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', expiresAt: null, uploadedById: personId } })
}

const submit = async (personId: string, extra: Record<string, unknown> = {}) => {
  as(ARDENT)
  const r = await json(await submitCandidate(req('POST', '/api/submissions', {
    requirementId, personIds: [personId], rate: 11_000, fromCompanyId: co.ardent, ...extra,
  })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.results[0]
}

beforeAll(async () => {
  await resetDatabase()
  const client = await company('Cavanaugh Glassworks', 'cavanaugh', 'CLIENT', CLIENT)
  co.client = client.id
  const ardent = await company('Ardent Systems', 'ardent', 'GSI', ARDENT)
  co.ardent = ardent.id
  const other = await company('Pinnacle Resourcing', 'pinnacle', 'VENDOR', 'owner@pinnacle.test')
  co.other = other.id

  for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
    await prisma.verification.create({
      data: { companyId: co.ardent, type, status: 'CLEAR', provider: 'Hartford', issuedAt: ago(100), expiresAt: new Date(now + 300 * DAY), uploadedById: ardent.personId },
    })
  }

  const policy = await prisma.governancePolicy.create({ data: { companyId: co.client, name: 'Standard contingent policy' } })
  await prisma.governanceRule.create({
    data: { policyId: policy.id, ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', description: 'No more than 18 months', parameters: { maxMonths: 18 } },
  })
  await prisma.governanceRule.create({
    data: { policyId: policy.id, ruleType: 'BREAK_IN_SERVICE', enforcementMode: 'BLOCK', description: '90 days away', parameters: { breakDays: 90 } },
  })

  const engineer = await prisma.role.create({ data: { companyId: co.ardent, name: 'Engineer', permissions: ['assignments.read'] } })
  who.ravi = await employee('Ravi', engineer.id)
  who.sana = await employee('Sana', engineer.id)
  who.omar = await employee('Omar', engineer.id)
  who.tomas = await employee('Tomas', engineer.id)
  who.lee = await employee('Lee', engineer.id)
  who.noor = await employee('Noor', engineer.id)

  // Ravi: ten months through Pinnacle, then ten through Ardent, still there.
  await onSite(who.ravi, co.other, ago(620), ago(316), 'ENDED')
  await onSite(who.ravi, co.ardent, ago(310), new Date(now + 60 * DAY), 'IN_PROGRESS')
  // Sana: nineteen months, left thirty days ago.
  await onSite(who.sana, co.ardent, ago(610), ago(30), 'ENDED')
  // Omar: sixteen months and still on site, his line ending in ten days.
  await onSite(who.omar, co.other, ago(480), new Date(now + 10 * DAY), 'IN_PROGRESS')
  // Tomas: sixteen months, ended four months ago — the 90-day break is served.
  await onSite(who.tomas, co.other, ago(610), ago(120), 'ENDED')
  for (const p of [who.ravi, who.sana, who.omar, who.lee, who.tomas]) await i9(p)

  const r = await prisma.requirement.create({
    data: {
      companyId: co.client, title: 'Validation engineer', skills: ['Validation'], status: 'OPEN', approvalState: 'APPROVED',
      headcount: 5, months: 6, startDate: new Date(now + 14 * DAY), raisedById: client.personId, ownerId: client.personId,
    },
  })
  requirementId = r.id
  await prisma.requirementInvitation.create({
    data: { requirementId, fromCompanyId: co.client, toCompanyId: co.ardent, status: 'SENT', payMin: 9_000, payMax: 13_000, expiresAt: new Date(now + 30 * DAY) },
  })
}, 240_000)

describe('the client’s time limit is checked before a person is put forward', () => {
  it('a person past the limit through two suppliers is refused, with the day they are eligible again, and nothing is written', async () => {
    const result = await submit(who.ravi)
    expect(result.status).toBe('error')
    expect(result.code).toBe('TIME_LIMIT_REACHED')
    expect(result.error).toContain('Cavanaugh Glassworks')
    expect(result.eligibleOn).toBe(new Date(now + 60 * DAY + 90 * DAY).toISOString().slice(0, 10))
    expect(await prisma.submission.count({ where: { personId: who.ravi } })).toBe(0)
  })

  it('the refusal is logged as a refused read of the person, with its reason', async () => {
    const log = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: who.ravi, action: 'SUBMIT', allowed: false } })
    expect(log.reason).toContain('TIME_LIMIT_REACHED')
  })

  it('a person past the limit inside the client’s break is refused until the break ends', async () => {
    const result = await submit(who.sana)
    expect(result.status).toBe('error')
    expect(result.code).toBe('TIME_LIMIT_REACHED')
    expect(result.eligibleOn).toBe(new Date(ago(30).getTime() + 90 * DAY).toISOString().slice(0, 10))
  })

  it('a job that would carry the person past the limit is held for a reason, and nothing is written until one is given', async () => {
    const result = await submit(who.omar)
    expect(result.status).toBe('needs_reason')
    expect(result.code).toBe('RUNS_PAST_LIMIT')
    expect(result.error).toContain('Give a reason')
    expect(await prisma.submission.count({ where: { personId: who.omar } })).toBe(0)
  })

  it('with a reason it goes through, and the warning and the reason are recorded on the submission’s access row', async () => {
    const result = await submit(who.omar, { reason: 'The client asked for him by name to finish the validation he started.' })
    expect(result.status).toBe('created')
    expect(result.tenureWarning).toContain('time limit')
    const log = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: who.omar, action: 'SUBMIT', allowed: true } })
    expect(log.reason).toContain('Time limit warned')
    expect(log.reason).toContain('asked for him by name')
    const warned = await prisma.automationLog.findFirstOrThrow({ where: { action: 'SUBMISSION_TIME_LIMIT_WARNED', companyId: co.ardent } })
    expect(warned.reason).toContain('Reason given: The client asked for him by name')
    expect((warned.payload as any).limitReachedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('a person back after a served break goes through with no warning, because the break reset the count', async () => {
    const result = await submit(who.tomas)
    expect(result.status).toBe('created')
    expect(result.tenureWarning).toBeUndefined()
  })

  it('a person new to the client with a cleared I-9 goes through with no warning', async () => {
    const result = await submit(who.lee)
    expect(result.status).toBe('created')
    expect(result.tenureWarning).toBeUndefined()
    expect(result.workAuthWarning).toBeUndefined()
  })
})

describe('work authorization is warned about at submission', () => {
  it('a person with no work authorization on record goes through with a warning in a sentence, and the warning is recorded', async () => {
    const result = await submit(who.noor)
    expect(result.status).toBe('created')
    expect(result.workAuthCode).toBe('NO_WORK_AUTH')
    expect(result.workAuthWarning).toContain('Noor has no work authorization on record')
    const log = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: who.noor, action: 'SUBMIT', allowed: true } })
    expect(log.reason).toContain('Work authorization warned')
    const warned = await prisma.automationLog.findFirstOrThrow({ where: { action: 'SUBMISSION_WORK_AUTH_WARNED', companyId: co.ardent } })
    expect(warned.reason).toContain('Noor has no work authorization on record')
  })
})
