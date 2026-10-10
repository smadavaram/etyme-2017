import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as setStatus } from '@/app/api/submissions/[id]/status/route'

/**
 * The client tester turned candidates down at Northbend Athletic and
 * their rounds stayed "In all three diaries". The award already called
 * rounds off; turning one candidate down from the row did not. It does
 * now, through conversation's `cancelRoundsFor`, and the decision's own
 * log row names the rounds.
 */

const HIRING = 'world-nike-hiring@demo.etyme.local'

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const ids: Record<string, string> = {}

describe('turning a candidate down calls off the rounds they had left', () => {
  beforeAll(async () => {
    await freshWorld()
    const s = await prisma.submission.findFirstOrThrow({
      where: { requirement: { title: 'HCM integration lead', company: { slug: 'world-nike' } }, person: { name: 'Rajesh Iyer' } },
      select: { id: true },
    })
    ids.rajesh = s.id
    const round = await prisma.interview.findFirstOrThrow({ where: { submissionId: s.id } })
    ids.round = round.id
  }, 240_000)

  it('Rajesh Iyer’s round is booked before anybody decides', async () => {
    const r = await prisma.interview.findUniqueOrThrow({ where: { id: ids.round } })
    expect(r.state).toBe('CONFIRMED')
  })

  it('the hiring manager turns Rajesh down with a reason, and his booked round is called off with the sentence on it', async () => {
    as(HIRING)
    const r = await call(setStatus, 'PATCH', `/api/submissions/${ids.rajesh}/status`, ids.rajesh, { status: 'REJECTED', reason: 'RATE' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const round = await prisma.interview.findUniqueOrThrow({ where: { id: ids.round } })
    expect(round.state).toBe('CANCELLED')
    expect(round.cancelledReason).toBe('This interview is cancelled.')
  })

  it('the decision’s own log row names the round it called off', async () => {
    const logs = await prisma.automationLog.findMany({
      where: { action: 'SUBMISSION_STATUS_CHANGED' },
      orderBy: { at: 'desc' },
    })
    const log = logs.find((l) => (l.payload as any)?.submissionId === ids.rajesh)!
    expect(log).toBeDefined()
    expect((log.payload as any).interviewsCalledOff).toEqual([ids.round])
    expect((log.payload as any).to).toBe('REJECTED')
  })
})
