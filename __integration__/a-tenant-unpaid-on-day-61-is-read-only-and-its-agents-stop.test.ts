import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { readOnlyRefusalFor, tenantIsReadOnly, READ_ONLY_SAYS } from '@/lib/tenant-state'
import { runAgent as runLedgered } from '@/lib/agent-run'
import { runAgent } from '@/lib/agents/runner'

const DAY = 86_400_000
const req = (method: string, pathname: string) => ({ method, nextUrl: { pathname } })

describe('a paying tenant unpaid on day 61', () => {
  let companyId = ''
  let personId = ''
  const now = new Date()
  const activated = (day: number) => new Date(now.getTime() - (day - 1) * DAY)
  const set = (data: Record<string, unknown>) => prisma.company.update({ where: { id: companyId }, data })
  const caller = () => ({ person: { id: personId }, company: { id: companyId } })

  beforeAll(async () => {
    await freshWorld()
    const seat = await prisma.context.findFirst({ where: { companyId: { not: null }, type: { not: 'CONSULTANT' } }, select: { companyId: true, personId: true } })
    companyId = seat!.companyId!
    personId = seat!.personId
    await set({ edition: 'STARTER', activatedAt: activated(61), paidThrough: null, billingExempt: false })
  })
  afterAll(async () => { await set({ edition: 'USER', activatedAt: null, paidThrough: null, billingExempt: false }) })

  it('a new placement is refused on day 61 with the sentence naming Settings, and the refusal is logged first', async () => {
    const before = await prisma.accessLog.count({ where: { actorCompanyId: companyId, allowed: false } })
    const res = await readOnlyRefusalFor(caller(), req('POST', '/api/placements'), now)
    expect(res!.status).toBe(403)
    expect((await res!.json()).error.message).toBe(READ_ONLY_SAYS)
    expect(await prisma.accessLog.count({ where: { actorCompanyId: companyId, allowed: false } })).toBe(before + 1)
    const row = await prisma.accessLog.findFirst({ where: { actorCompanyId: companyId, allowed: false, action: 'TENANT_READ_ONLY_REFUSED' }, select: { reason: true } })
    expect(row?.reason).toContain('read-only')
  })

  it('a timesheet on an existing placement is allowed on day 61', async () => {
    expect(await readOnlyRefusalFor(caller(), req('POST', '/api/timesheets'), now)).toBeNull()
  })

  it('reads are allowed on day 61', async () => {
    expect(await readOnlyRefusalFor(caller(), req('GET', '/api/placements'), now)).toBeNull()
  })

  it('an agent run is refused on day 61 and nothing is recorded or deleted', async () => {
    const people = await prisma.person.count()
    await expect(runLedgered({ companyId, agent: 'x', recordType: 'SUBMISSION' as any, recordId: 'r', attempt: 1 } as any, async () => ({ result: 1 }))).rejects.toThrow(READ_ONLY_SAYS)
    const out = await runAgent('timesheet-chase', companyId, now)
    expect(out).toMatchObject({ ran: false, why: READ_ONLY_SAYS })
    expect(await prisma.person.count()).toBe(people)
  })

  it('day 60 allows everything', async () => {
    await set({ activatedAt: activated(60) })
    expect(await readOnlyRefusalFor(caller(), req('POST', '/api/placements'), now)).toBeNull()
    expect(await tenantIsReadOnly(companyId, now)).toBe(false)
  })

  it('a payment recorded through a later date lifts it', async () => {
    await set({ activatedAt: activated(61), paidThrough: new Date(now.getTime() + 30 * DAY) })
    expect(await readOnlyRefusalFor(caller(), req('POST', '/api/placements'), now)).toBeNull()
  })

  it('a free user is never blocked, however old the clock', async () => {
    await set({ edition: 'USER', activatedAt: activated(200), paidThrough: null })
    expect(await readOnlyRefusalFor(caller(), req('POST', '/api/placements'), now)).toBeNull()
  })

  it('an exempt proving tenant is never blocked', async () => {
    await set({ edition: 'STARTER', activatedAt: activated(200), paidThrough: null, billingExempt: true })
    expect(await tenantIsReadOnly(companyId, now)).toBe(false)
  })

  it('with the switch off everything is allowed on day 61', async () => {
    await set({ edition: 'STARTER', activatedAt: activated(61), paidThrough: null, billingExempt: false })
    expect(await tenantIsReadOnly(companyId, now)).toBe(true)
    expect(await tenantIsReadOnly(companyId, now, { ETYME_DAY61_READ_ONLY: 'off' })).toBe(false)
  })
})
