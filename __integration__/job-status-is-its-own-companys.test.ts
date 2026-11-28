import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A job is its own company's to open or close. The status door had no
 * check at all: any signed-in person could close or reopen any firm's job
 * by its id (found 2026-11-15; no screen calls it). Another firm's job is
 * answered exactly as an id that does not exist, and nothing is written.
 */

const status = await import('@/app/api/requirements/[id]/status/route')

const D = '@demo.etyme.local'
const CLIENT_OWNER = `world-northbend${D}`
const SUPPLIER_OWNER = `world-brightmoor${D}`

let jobId = ''
const move = async (id: string, to: string) =>
  json(await status.PATCH(req('PATCH', `/api/requirements/${id}/status`, { status: to }) as any, { params: Promise.resolve({ id }) } as any))
const read = (id: string) => prisma.requirement.findUniqueOrThrow({ where: { id }, select: { status: true } })
const logged = (id: string) => prisma.automationLog.count({ where: { action: 'REQUIREMENT_STATUS_CHANGED', payload: { path: ['requirementId'], equals: id } } })

describe('a job is opened or closed only by its own company', () => {
  beforeAll(async () => {
    await freshWorld()
    const client = await prisma.company.findFirstOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })
    // The test's own job, so no seeded row's state or order is relied on.
    const made = await prisma.requirement.create({
      data: { companyId: client.id, title: 'Controls engineer, the status door', status: 'OPEN' },
      select: { id: true },
    })
    jobId = made.id
  }, 900_000)

  it('another firm’s signed-in Owner cannot close a client’s job by its id, and is answered as for an id that does not exist', async () => {
    as(SUPPLIER_OWNER)
    const stranger = await move(jobId, 'CLOSED')
    const unknown = await move('no-such-job', 'CLOSED')
    expect(stranger.status).toBe(404)
    expect(stranger.body).toEqual(unknown.body)
    expect((await read(jobId)).status).toBe('OPEN')
    expect(await logged(jobId)).toBe(0)
  })

  it('the client’s own Owner closes it and opens it again, and each move is on the activity log once', async () => {
    as(CLIENT_OWNER)
    const closed = await move(jobId, 'CLOSED')
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect((await read(jobId)).status).toBe('CLOSED')
    const reopened = await move(jobId, 'OPEN')
    expect(reopened.status).toBe(200)
    expect((await read(jobId)).status).toBe('OPEN')
    expect(await logged(jobId)).toBe(2)
  })

  it('inside the firm the door asks for the right to change job requests, after it has checked whose job it is', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/requirements/[id]/status/route.ts'), 'utf8')
    const whose = src.indexOf('requirement.companyId !== caller.company.id')
    const right = src.indexOf("hasPermission(caller.permissions, 'requirements.write')")
    const write = src.indexOf('prisma.requirement.update(')
    expect(whose).toBeGreaterThan(-1)
    expect(right).toBeGreaterThan(whose)
    expect(write).toBeGreaterThan(right)
    expect(src).toContain('Your role cannot open or close a job request. Ask whoever raises job requests at your company.')
  })
})
