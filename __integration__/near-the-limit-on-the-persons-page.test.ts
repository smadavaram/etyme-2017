import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as person } from '@/app/api/people/[id]/route'
import { GET as ledger } from '@/app/api/tenure/route'

/**
 * One window for "near the time limit" (regulatory, 2026-11-09): the
 * company's widest warning, 90 days by default. A person's own page reads
 * it the way the Tenure page and Ask Etyme do, so the three never name
 * different people. Lucía Fernández is about 121 days from Northbend's
 * limit: not near it by default, near it where Northbend warns at 150.
 */

const DESK = 'world-nike-compliance@demo.etyme.local'
const s = { lucia: '', northbend: '', setBy: '' }

const page = async () => {
  as(DESK)
  const r = await json(await person(req('GET', `/api/people/${s.lucia}`), { params: Promise.resolve({ id: s.lucia }) }))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}
const tenureStatus = async () => {
  as(DESK)
  const r = await json(await ledger(req('GET', '/api/tenure')))
  return r.body.data.people.find((p: any) => p.name === 'Lucía Fernández')?.status
}

beforeAll(async () => {
  await freshWorld()
  s.lucia = (await prisma.person.findFirstOrThrow({ where: { name: 'Lucía Fernández' }, select: { id: true } })).id
  const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
  s.northbend = co.id
  s.setBy = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: DESK }, select: { id: true } })).id
}, 600_000)

describe('a person’s page says near the time limit where the Tenure page does', () => {
  it('by default, Lucía is not near the limit on her own page, as on the Tenure page', async () => {
    const data = await page()
    expect(data.tenure.status).toBe('OK')
    expect(await tenureStatus()).toBe('OK')
  })

  it('a company that set 150 days sees Lucía near the limit on her own page', async () => {
    const last = await prisma.ruleSet.findFirst({ where: { companyId: s.northbend }, orderBy: { version: 'desc' }, select: { version: true } })
    await prisma.ruleSet.create({
      data: { companyId: s.northbend, version: (last?.version ?? 0) + 1, tenureWarnAtDays: [150, 60, 30], hoursToleranceBps: 50, setByPersonId: s.setBy, reason: 'Warn earlier, five months out.' },
    })
    const data = await page()
    expect(data.tenure.status).toBe('WARNING')
    expect(await tenureStatus()).toBe('WARNING')
  })
})
