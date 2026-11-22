import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { desksHolding } from '@/lib/permissions'
import { POST as record } from '@/app/api/compliance/verifications/route'

/**
 * The I-9 door, refused to a seat that does not record checks, names who
 * at this firm does from the roles it has seated (fix list, the last
 * batch's press). It named HR and a compliance officer whether or not the
 * firm had either; a firm with neither was sent to nobody.
 *
 *   Tellisford, a seeded integrator. An Accounts Receivable seat is added.
 *   With every seat that records checks paused, it is refused the I-9 in
 *   a sentence naming the Owner, the one of the two it has seated. Then an HR seat is added,
 *   and the same refusal names HR.
 */

const AR = 'ar.i9-refusal@seed.etyme.invalid'
const HR = 'hr.i9-refusal@seed.etyme.invalid'

let tellisford = ''
let contractId = ''

async function seatAt(companyId: string, roleName: string, name: string, email: string) {
  await ensureDefaultRoles(companyId, 'GSI')
  const role = await prisma.role.findFirstOrThrow({ where: { companyId, name: roleName } })
  const person = await prisma.person.upsert({ where: { primaryEmail: email }, update: { name }, create: { name, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', side: 'SELL', grantReason: `${roleName}, for the I-9 refusal test` },
  })
}

const recordI9 = () =>
  record(req('POST', '/api/compliance/verifications', {
    contractId, about: 'PERSON', type: 'I9_EVERIFY', formEdition: '01/20/25',
    evidence: [{ type: 'US_PASSPORT', expiresAt: '2030-01-01' }],
  }))

beforeAll(async () => {
  await freshWorld()
  tellisford = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-tellisford' } })).id
  // A line Tellisford sells, for a person Tellisford itself employs, so the
  // I-9 is Tellisford's to record and only the seat decides the answer.
  const own = await prisma.context.findMany({ where: { companyId: tellisford, type: 'EMPLOYEE' }, select: { personId: true } })
  const line = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: tellisford, personId: { in: own.map((c) => c.personId) } },
    select: { id: true },
  })
  contractId = line.id
  await seatAt(tellisford, 'Accounts Receivable', 'Dana Whitfield', AR)
})

describe('a seat that may not record an I-9 is told who at its own firm may', () => {
  it('where nobody here holds a role that records checks and no Admin is seated, the refusal names the Owner alone', async () => {
    // Every seat here that records checks is paused first, so the firm
    // has nobody seated who may: the case this sentence is about.
    const records = desksHolding(['consultants.write', 'privacy.manage'], 'GSI').filter((d) => !['Owner', 'Admin'].includes(d))
    await prisma.context.updateMany({
      where: { companyId: tellisford, revokedAt: null, suspendedAt: null, role: { name: { in: records } } },
      data: { suspendedAt: new Date() },
    })
    as(AR)
    const { status, body } = await json(await recordI9())
    expect(status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toContain('is for the Owner here. Ask them.')
    expect(body.error.message).not.toContain('Admin')
    expect(body.error.message).not.toMatch(/compliance officer/i)
  })

  it('once HR is seated here, the same refusal names HR, in one sentence with the door', async () => {
    await seatAt(tellisford, 'HR', 'Mara Quist', HR)
    as(AR)
    const { status, body } = await json(await recordI9())
    expect(status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toMatch(/^Recording the I-9 for .+ is for the .*HR.* here\. Ask (them|one of them)\.$/)
    expect(body.error.message).not.toMatch(/whoever runs Users & permissions/)
  })
})
