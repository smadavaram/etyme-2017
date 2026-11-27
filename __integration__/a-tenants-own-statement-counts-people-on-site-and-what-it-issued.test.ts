import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { readOwnStatement } from '@/lib/money/tenant-statement'

/** The statement reads the record: people, one each, on a line in progress; placements and invoices as supplier of record. */
describe('a tenant’s own statement, read from the seeded record', () => {
  beforeAll(freshWorld)

  it('counts each person once however many lines in progress they hold', async () => {
    const line = await prisma.sellContract.findFirst({ where: { state: 'IN_PROGRESS' }, select: { companyId: true } })
    expect(line).toBeTruthy()
    const lines = await prisma.sellContract.findMany({ where: { companyId: line!.companyId }, select: { personId: true, state: true } })
    const people = new Set(lines.filter((l) => l.state === 'IN_PROGRESS').map((l) => l.personId))
    const s = await readOwnStatement(line!.companyId)
    expect(s!.activeContractors).toBe(people.size)
  })

  it('a seeded firm starts as a free user with nothing due', async () => {
    const line = await prisma.sellContract.findFirst({ select: { companyId: true } })
    const s = await readOwnStatement(line!.companyId)
    expect(s!.edition).toBe('USER')
    expect(s!.dueMonthlyCents).toBe(0)
  })

  it('a firm that sells people and has issued bills passes the own-business test', async () => {
    const line = await prisma.sellContract.findFirst({ where: { state: { not: 'DRAFT' } }, select: { companyId: true } })
    const s = await readOwnStatement(line!.companyId)
    expect(s!.ownBusiness.placements).toBeGreaterThan(0)
    expect(s!.ownBusiness.pays).toBe(true)
  })

  it('a company that does not exist has no statement', async () => {
    expect(await readOwnStatement('nobody')).toBeNull()
  })
})
