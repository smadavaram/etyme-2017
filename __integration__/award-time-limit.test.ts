import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as award } from '@/app/api/submissions/[id]/award/route'

/**
 * The founder's decision, 2026-10-06: a line booked past the client's
 * time limit is refused at every door that writes an end date. Money put
 * it on the contracts route and on an extension; the award writes a line
 * too, and asks the same question (`endsPastLimit`).
 *
 * Northbend Athletic is seeded with an 18-month limit that blocks.
 */

const HIRING = 'world-nike-hiring@demo.etyme.local'
const MONTH_NAME = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}/

const call = async (id: string, body: unknown) =>
  json(await award(req('POST', `/api/submissions/${id}/award`, body), { params: Promise.resolve({ id }) }))

let daniel = ''

describe('the award asks the client’s time limit before it writes a line', () => {
  beforeAll(async () => {
    await freshWorld()
    daniel = (await prisma.submission.findFirstOrThrow({
      where: { requirement: { title: 'HCM integration lead', company: { slug: 'world-nike' } }, person: { name: 'Daniel Okafor' } },
      select: { id: true },
    })).id
  }, 240_000)

  it('an award whose line would run past the client’s time limit is refused in a sentence naming the date', async () => {
    as(HIRING)
    const start = day(14)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 24)
    const r = await call(daniel, { rate: 13_200, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) })
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.code).toBe('TIME_LIMIT')
    expect(r.body.error.message).toMatch(MONTH_NAME)
    const lines = await prisma.sellContract.count({ where: { requirement: { submissions: { some: { id: daniel } } }, person: { name: 'Daniel Okafor' } } })
    expect(lines).toBe(0)
  })

  it('the same award inside the limit goes through', async () => {
    as(HIRING)
    const start = day(14)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 9)
    const r = await call(daniel, { rate: 13_200, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
  })
})
