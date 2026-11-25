import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as activateGet, POST as activatePost } from '@/app/api/contracts/[id]/activate/route'
import { GET as extendGet, POST as extendPost } from '@/app/api/contracts/[id]/extend/route'

/**
 * Record 119: the line between a client's supplier and a firm below it is a
 * deal between two other firms. The client is the site on it, never its
 * payer, and is refused as if it were not there, naming no firm.
 */
const CLIENT = 'world-nike-programme@demo.etyme.local'
const co: Record<string, string> = {}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any
const names = /tecwyn|computer systems/i

beforeAll(async () => {
  await freshWorld()
  for (const slug of ['world-nike', 'world-computer-systems', 'world-tecwyn']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
  }
}, 600_000)

async function lineBelow() {
  return prisma.sellContract.findFirstOrThrow({
    where: { companyId: co['world-tecwyn'], clientCompanyId: co['world-computer-systems'], endClientCompanyId: co['world-nike'], state: 'IN_PROGRESS' },
    select: { id: true, endDate: true, state: true },
    orderBy: { id: 'asc' },
  })
}

describe('a client acting on the line between its supplier and a firm below it', () => {
  it('a client cannot extend the line below its supplier and the refusal names no firm', async () => {
    const line = await lineBelow()
    as(CLIENT)
    const r = await json(await extendPost(req('POST', `/api/contracts/${line.id}/extend`, { months: 1 }), ctx(line.id)))
    expect(r.status).toBe(404)
    expect(JSON.stringify(r.body)).not.toMatch(names)
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: line.id }, select: { endDate: true } })).endDate).toEqual(line.endDate)
  })

  it('a client asking whether it may extend the line below its supplier is told it is not found', async () => {
    const line = await lineBelow()
    as(CLIENT)
    const r = await json(await extendGet(req('GET', `/api/contracts/${line.id}/extend`), ctx(line.id)))
    expect(r.status).toBe(404)
    expect(JSON.stringify(r.body)).not.toMatch(names)
  })

  it('a client cannot pause the line below its supplier and the refusal names no firm', async () => {
    const line = await lineBelow()
    as(CLIENT)
    const r = await json(await activatePost(req('POST', `/api/contracts/${line.id}/activate`, { action: 'pause' }), ctx(line.id)))
    expect(r.status).toBe(404)
    expect(JSON.stringify(r.body)).not.toMatch(names)
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: line.id }, select: { state: true } })).state).toBe(line.state)
  })

  it('a client asking whether it may start the line below its supplier is told it is not found', async () => {
    const line = await lineBelow()
    as(CLIENT)
    const r = await json(await activateGet(req('GET', `/api/contracts/${line.id}/activate`), ctx(line.id)))
    expect(r.status).toBe(404)
    expect(JSON.stringify(r.body)).not.toMatch(names)
  })

  it('each refusal of the client on that line is logged before the answer goes out', async () => {
    const line = await lineBelow()
    const before = await prisma.accessLog.count({ where: { allowed: false } })
    as(CLIENT)
    await extendPost(req('POST', `/api/contracts/${line.id}/extend`, { months: 1 }), ctx(line.id))
    await activatePost(req('POST', `/api/contracts/${line.id}/activate`, { action: 'pause' }), ctx(line.id))
    expect(await prisma.accessLog.count({ where: { allowed: false } })).toBeGreaterThanOrEqual(before + 2)
  })
})
