import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { approverIsKnownAtClient } from '@/app/api/timesheets/approval-by-email'

/**
 * The seeded approval by email — Marcus Oyelaran at Northbend Athletic —
 * passes the rule that the approver is somebody at the client, and a
 * worker naming herself does not.
 */

let client: { name: string; domain: string | null; aliases: string[]; seatedEmails: string[] }
let marcus = ''

beforeAll(async () => {
  await freshWorld()
  const evidence = await prisma.weekApproval.findFirstOrThrow({
    where: { how: 'EVIDENCE', approverName: 'Marcus Oyelaran' },
    select: { approverEmail: true, clientCompanyId: true },
  })
  marcus = evidence.approverEmail
  const c = await prisma.company.findUniqueOrThrow({ where: { id: evidence.clientCompanyId }, select: { name: true, domain: true } })
  const aliases = await prisma.companyDomain.findMany({ where: { companyId: evidence.clientCompanyId, verifiedAt: { not: null } }, select: { domain: true } })
  const seats = await prisma.context.findMany({
    where: { companyId: evidence.clientCompanyId, revokedAt: null, suspendedAt: null },
    select: { person: { select: { primaryEmail: true } } },
  })
  client = {
    name: c.name, domain: c.domain, aliases: aliases.map((a) => a.domain),
    seatedEmails: seats.map((s) => s.person.primaryEmail).filter((e): e is string => !!e),
  }
}, 240_000)

describe('the seeded approval by email names somebody at the client', () => {
  it('Marcus Oyelaran, seated at Northbend Athletic, is accepted as its approver', () => {
    expect(client.name).toBe('Northbend Athletic')
    expect(approverIsKnownAtClient({ approverEmail: marcus, client }).ok).toBe(true)
  })

  it('Helena Marsh, the worker, naming her own address as Northbend’s approver is refused', () => {
    const v = approverIsKnownAtClient({ approverEmail: 'helena.marsh@seed.etyme.invalid', client })
    expect(v.ok).toBe(false)
  })
})
