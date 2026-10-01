import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import type { PostingKind } from '@prisma/client'

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { POST as assertHours } from '@/app/api/timesheets/[id]/assert/route'

/**
 * A week signed from the approve button reaches the books, the same as
 * one signed through /assert.
 *
 * Before this, the approve route wrote the client's approval and the
 * employer's acceptance onto the ledger and posted neither, so an accepted
 * week had no pay posting and was missing from "W-2 wages accepted and not
 * yet paid" on the year-end tax screen.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by CloudEPA. Northbend approves, Computer Systems accepts in its
 * turn, CloudEPA accepts what it pays her.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const CLOUDEPA = `world-cloudepa${D}`

const sign = async (id: string) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, {}), { params: Promise.resolve({ id }) }))
const say = async (id: string, body: unknown) =>
  json(await assertHours(req('POST', `/api/timesheets/${id}/assert`, body), { params: Promise.resolve({ id }) }))

const s: Record<string, string> = {}

const live = (role: string) =>
  prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: s.week, role, state: 'LIVE' } })
const postings = (sourceId: string, kind: PostingKind) =>
  prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId, kind, reversalOfId: null } })

describe('a week signed from the approve button is posted to the books once', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    s.week = week.id
  }, 240_000)

  it('the client’s approval from the approve button is posted as revenue once', async () => {
    as(NIKE)
    const r = await sign(s.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const a = await live('CLIENT_APPROVAL')
    expect(await postings(a.id, 'REVENUE')).toBe(1)
  })

  it('the firm in the middle accepting in its turn posts nothing of its own here', async () => {
    as(CS)
    const r = await sign(s.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const a = await live('PASS_THROUGH')
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: a.id } })).toBe(0)
  })

  it('a week accepted from the approve button is posted to the books once, the same as one accepted any other way', async () => {
    as(CLOUDEPA)
    const r = await sign(s.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const a = await live('EMPLOYER_ACCEPTANCE')
    expect(await postings(a.id, 'PAY')).toBe(1)
  })

  it('pressing the button again, or answering the same week through /assert, posts nothing twice', async () => {
    as(CLOUDEPA)
    await sign(s.week)
    const again = await say(s.week, {})
    expect(again.status).not.toBe(200)
    expect(await prisma.workAssertion.count({ where: { timesheetId: s.week, role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } })).toBe(1)
    const a = await live('EMPLOYER_ACCEPTANCE')
    expect(await postings(a.id, 'PAY')).toBe(1)
    const c = await live('CLIENT_APPROVAL')
    expect(await postings(c.id, 'REVENUE')).toBe(1)
  })
})
