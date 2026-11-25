import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { GET as activateGet, POST as activatePost } from '@/app/api/contracts/[id]/activate/route'
import { GET as extendGet, POST as extendPost } from '@/app/api/contracts/[id]/extend/route'

/**
 * Record 119: no trace of a firm below reaches the client, not the id of
 * the line between its supplier and that firm, and the line is answered
 * as not found whether or not the client is named on it.
 */
const SUB = 'world-tecwyn@demo.etyme.local'
const CLIENT = 'world-harlow-health@demo.etyme.local'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any

let subLine = ''
let primeLine = ''
let subName = ''

beforeAll(async () => {
  await freshWorld()
  const [tecwyn, cs, harlow] = await Promise.all(
    ['world-tecwyn', 'world-computer-systems', 'world-harlow-health'].map((slug) =>
      prisma.company.findFirstOrThrow({ where: { slug }, select: { id: true, name: true } })),
  )
  subName = tecwyn.name
  subLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: tecwyn.id, clientCompanyId: cs.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
  primeLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: cs.id, clientCompanyId: harlow.id, person: { name: 'Priya Ramesh' } }, select: { id: true } })).id
}, 600_000)

describe('a client reading timesheets for a person a firm below its supplier employs', () => {
  it('the id of the line between its supplier and the firm below is nowhere in the client’s timesheets', async () => {
    as(CLIENT)
    const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50')))
    expect(r.status).toBe(200)
    const rows: any[] = r.body.data.timesheets
    expect(rows.length).toBeGreaterThan(0)
    const text = JSON.stringify(r.body)
    expect(text).not.toContain(subLine)
    expect(text).not.toContain(subName)
    expect(rows.every((t) => t.sellContract.id === null || typeof t.sellContract.id === 'string')).toBe(true)
  })

  it('a week the client pays for reads the id of the client’s own line', async () => {
    const priya = await prisma.timesheet.findFirst({ where: { sellContractId: subLine }, select: { id: true } })
    as(CLIENT)
    const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50')))
    const rows: any[] = r.body.data.timesheets
    if (priya) {
      const row = rows.find((t) => t.id === priya.id)
      expect(row?.sellContract.id).toBe(primeLine)
    }
    expect(rows.some((t) => t.sellContract.id === primeLine)).toBe(true)
  })

  it('the firm below still reads its own line id on its own timesheets', async () => {
    as(SUB)
    const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50')))
    expect(JSON.stringify(r.body)).toContain(subLine)
  })
})

describe('a client that is not named on the line below its supplier', () => {
  it('is told contract not found on start, verify, extend and the questions that ask about them', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false } })
    as(CLIENT)
    const answers = [
      await json(await activatePost(req('POST', `/api/contracts/${subLine}/activate`, { action: 'activate' }), ctx(subLine))),
      await json(await activatePost(req('POST', `/api/contracts/${subLine}/activate`, { action: 'verify' }), ctx(subLine))),
      await json(await activateGet(req('GET', `/api/contracts/${subLine}/activate`), ctx(subLine))),
      await json(await extendPost(req('POST', `/api/contracts/${subLine}/extend`, { months: 1 }), ctx(subLine))),
      await json(await extendGet(req('GET', `/api/contracts/${subLine}/extend`), ctx(subLine))),
    ]
    for (const r of answers) {
      expect(r.status).toBe(404)
      expect(r.body.error.message).toBe('Contract not found')
      expect(JSON.stringify(r.body)).not.toContain(subName)
    }
    expect(await prisma.accessLog.count({ where: { allowed: false } })).toBeGreaterThanOrEqual(before + 5)
  })
})

describe('a contract in the wrong state is refused in plain words', () => {
  it('starting a contract that is already running says so with the person’s name and no state code', async () => {
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: { not: undefined }, state: 'IN_PROGRESS', person: { name: 'Priya Ramesh' }, company: { slug: 'world-tecwyn' } },
      select: { id: true },
    })
    as(SUB)
    const r = await json(await activatePost(req('POST', `/api/contracts/${line.id}/activate`, { action: 'activate' }), ctx(line.id)))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Priya Ramesh\'s contract is already running, so it cannot be activated again.')
    expect(r.body.error.message).not.toMatch(/IN_PROGRESS|Allowed from|PENDING_VERIFICATION/)
  })

  it('an act that is not one of the six is answered with the choices as a sentence', async () => {
    as(SUB)
    const r = await json(await activatePost(req('POST', `/api/contracts/${subLine}/activate`, { action: 'explode' }), ctx(subLine)))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Choose verify, activate, pause, resume, complete or cancel.')
  })
})
