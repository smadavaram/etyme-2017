import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { planClockFor } from '@/app/api/conversations/twin/plan-clock'

const DAY = 86_400_000

describe("a paying tenant's Owner hears its clock, and nobody else does", () => {
  let companyId = ''
  const now = new Date()
  const activated = (day: number) => new Date(now.getTime() - (day - 1) * DAY)
  const set = (data: Record<string, unknown>) => prisma.company.update({ where: { id: companyId }, data })

  beforeAll(async () => {
    await freshWorld()
    const seat = await prisma.context.findFirst({ where: { companyId: { not: null }, type: { not: 'CONSULTANT' } }, select: { companyId: true } })
    companyId = seat!.companyId!
    await set({ edition: 'STARTER', activatedAt: activated(1), paidThrough: null, billingExempt: false })
  })
  afterAll(async () => { await set({ edition: 'USER', activatedAt: null, paidThrough: null, billingExempt: false }) })

  const owner = { companyId, roleName: 'Owner' as string | null }
  const as = (roleName: string | null) => ({ companyId, roleName })

  it('on day 49 the Owner hears nothing', async () => {
    await set({ activatedAt: activated(49) })
    expect(await planClockFor(as('Owner'), now)).toEqual({ line: null, card: null })
  })
  it('on day 50 the Owner reads ten days left in the greeting and has no card', async () => {
    await set({ activatedAt: activated(50) })
    const r = await planClockFor(as('Owner'), now)
    expect(r.line!.says).toContain('end in ten days')
    expect(r.card).toBeNull()
  })
  it('on day 61 unpaid the Owner has one card saying the account is read-only', async () => {
    await set({ activatedAt: activated(61) })
    const r = await planClockFor(as('Owner'), now)
    expect(r.card!.title).toBe('Your account is read-only')
    expect(r.line).toBeNull()
  })
  it('on day 61 an Admin and an AP clerk hear nothing', async () => {
    expect(await planClockFor(as('Admin'), now)).toEqual({ line: null, card: null })
    expect(await planClockFor(as('AP & Payroll'), now)).toEqual({ line: null, card: null })
  })
  it('a payment through a later date takes the card away', async () => {
    await set({ paidThrough: new Date(now.getTime() + 30 * DAY) })
    expect(await planClockFor(as('Owner'), now)).toEqual({ line: null, card: null })
  })
  it('an Owner paid ahead inside the free days is not told to choose a plan', async () => {
    await set({ activatedAt: activated(55), paidThrough: new Date(now.getTime() + 90 * DAY) })
    expect(await planClockFor(as('Owner'), now)).toEqual({ line: null, card: null })
  })
  it('with the day-61 rule switched off there is no card', async () => {
    await set({ activatedAt: activated(61), paidThrough: null })
    const r = await planClockFor(as('Owner'), now, { ETYME_DAY61_READ_ONLY: 'off' })
    expect(r.card).toBeNull()
  })
  it('a free user is never told anything', async () => {
    await set({ edition: 'USER' })
    expect(await planClockFor(owner, now)).toEqual({ line: null, card: null })
  })
})
