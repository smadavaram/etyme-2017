import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as person } from '@/app/api/people/[id]/route'
import { GET as ledger } from '@/app/api/tenure/route'
import { runsPastWords } from '@/app/dashboard/tenure/words'

/**
 * Lucía Fernández is seeded at Northbend Athletic with a Pinnacle
 * Resourcing contract booked past the day she reaches the 18-month limit.
 * The time-on-site page said so; her own page did not (regulatory,
 * 2026-10-06). It now says it in the same sentence, naming the same day.
 */

const DESK = 'world-nike-programme@demo.etyme.local'
let lucia = ''

beforeAll(async () => {
  await freshWorld()
  lucia = (await prisma.person.findFirstOrThrow({ where: { name: 'Lucía Fernández' }, select: { id: true } })).id
}, 300_000)

describe('a person’s page says when a live contract runs past the time limit', () => {
  it('Lucía’s page says Pinnacle Resourcing’s contract runs past the day she reaches the limit, in the time-on-site page’s own sentence', async () => {
    as(DESK)
    const book = await json(await ledger(req('GET', '/api/tenure')))
    expect(book.status, JSON.stringify(book.body)).toBe(200)
    const row = book.body.data.people.find((p: any) => p.personId === lucia)
    expect(row?.limitReachedOn, 'the ledger names the day she reaches the limit').toBeTruthy()
    expect(row.runsPast.length).toBeGreaterThan(0)

    const page = await json(await person(req('GET', `/api/people/${lucia}`), { params: Promise.resolve({ id: lucia }) }))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    const said: string[] = page.body.data.tenure.runsPast
    const expected = row.runsPast.map((r: any) =>
      runsPastWords({ firm: r.firm, personName: 'Lucía Fernández', endDate: r.endDate, daysPast: r.daysPast, reachedOn: row.limitReachedOn })
    )
    expect(said).toEqual(expected)
    expect(said[0]).toMatch(/^Pinnacle Resourcing’s contract runs to .+ past the day Lucía Fernández reaches the time limit \(.+\)\. Shorten it or plan the break\.$/)
  })

  it('somebody whose contracts end before the limit reads no such sentence', async () => {
    const kwame = (await prisma.person.findFirstOrThrow({ where: { name: 'Kwame Mensah' }, select: { id: true } })).id
    as(DESK)
    const page = await json(await person(req('GET', `/api/people/${kwame}`), { params: Promise.resolve({ id: kwame }) }))
    expect(page.body.data.tenure.runsPast).toEqual([])
  })
})
