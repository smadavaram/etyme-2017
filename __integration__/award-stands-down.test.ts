import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'
import { buildProposal, EMPTY_FORM } from '@/lib/interview-proposal'

import { POST as proposeRound } from '@/app/api/submissions/[id]/interviews/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { GET as requisitionDetail } from '@/app/api/requisitions/[id]/route'

/**
 * The client tester's walk on the seeded world, at Northbend Athletic:
 * three candidates on HCM integration lead, Rajesh Iyer's round already
 * in all three diaries, a round proposed for Mei-Lin Chao, and Daniel
 * Okafor placed at $132 an hour against the $131 his supplier asked.
 *
 * Before this, the award stood the others down on the submission and
 * left both rounds booked — two people would have turned up for a job
 * that was already filled, and nobody had told them.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const ids: Record<string, string> = {}

const inTwoDays = () => {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date, time: '10:00' }
}

describe('awarding a job stands the others down and calls off their interviews', () => {
  beforeAll(async () => {
    await freshWorld()
    const job = await prisma.requirement.findFirstOrThrow({
      where: { title: 'HCM integration lead', company: { slug: 'world-nike' } },
      select: { id: true },
    })
    ids.job = job.id
    for (const name of ['Rajesh Iyer', 'Mei-Lin Chao', 'Daniel Okafor']) {
      const s = await prisma.submission.findFirstOrThrow({
        where: { requirementId: job.id, person: { name } },
        select: { id: true, personId: true },
      })
      ids[name] = s.id
      ids[`${name}:person`] = s.personId
    }
  }, 240_000)

  it('the seeded world has Rajesh Iyer’s round in all three diaries before the award', async () => {
    const r = await prisma.interview.findFirstOrThrow({ where: { submissionId: ids['Rajesh Iyer'] } })
    expect(r.state).toBe('CONFIRMED')
    ids.rajeshRound = r.id
  })

  it('the hiring manager proposes a round for Mei-Lin Chao, as the tester did', async () => {
    const { body, problems } = buildProposal({ ...EMPTY_FORM, stage: 'Technical', mode: 'VIDEO', durationMins: 60, times: [inTwoDays()] })
    expect(problems).toEqual([])
    as(HIRING)
    const r = await call(proposeRound, 'POST', `/api/submissions/${ids['Mei-Lin Chao']}/interviews`, ids['Mei-Lin Chao'], body)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    ids.meiLinRound = r.body.data.id
  })

  it('placing Daniel Okafor says what happened in one paragraph, each thing once and in words', async () => {
    as(HIRING)
    const r = await call(award, 'POST', `/api/submissions/${ids['Daniel Okafor']}/award`, ids['Daniel Okafor'], {
      rate: 13_200, startDate: day(23).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    const said: string = r.body.data.message
    expect(said).toMatch(/^Daniel Okafor is placed\. This fills the job: Two other candidates were told they were not chosen, and two interviews were called off/)
    expect(said).not.toContain('(s)')
    expect(r.body.data.interviewsCalledOff).toBe(2)
  })

  it('Rajesh Iyer’s booked round and Mei-Lin Chao’s proposed one are both called off, with the reason on each', async () => {
    for (const id of [ids.rajeshRound, ids.meiLinRound]) {
      const round = await prisma.interview.findUniqueOrThrow({ where: { id } })
      expect(round.state).toBe('CANCELLED')
      expect(round.cancelledReason).toBe('HCM integration lead has been filled by another candidate, so this round will not go ahead.')
    }
  })

  it('each candidate turned down hears by email that their round is off', async () => {
    // The notices go out after the response; give the bell a moment.
    await new Promise((r) => setTimeout(r, 500))
    for (const name of ['Rajesh Iyer', 'Mei-Lin Chao']) {
      const n = await prisma.notification.findFirst({
        where: { personId: ids[`${name}:person`], type: 'INTERVIEW', title: { contains: 'is off' } },
      })
      expect(n, `${name} was not told`).not.toBeNull()
    }
  })

  it('the two stood down are not chosen for a counted reason — beaten to it — never a blank', async () => {
    for (const name of ['Rajesh Iyer', 'Mei-Lin Chao']) {
      const s = await prisma.submission.findUniqueOrThrow({ where: { id: ids[name] } })
      expect(s.status).toBe('NOT_SELECTED')
      expect(s.rejectReason).toBe('TIMING')
    }
  })

  it('the award’s own record names the rounds it called off and the reason each party was given', async () => {
    const log = await prisma.automationLog.findFirst({
      where: { action: 'CANDIDATE_AWARDED', payload: { path: ['requirementId'], equals: ids.job } },
      orderBy: { at: 'desc' },
    })
    const off = (log?.payload as any)?.interviewsCalledOff as { id: string; reason: string }[]
    expect(off.map((r) => r.id).sort()).toEqual([ids.rajeshRound, ids.meiLinRound].sort())
    expect((log?.payload as any)?.candidatesStoodDown).toEqual({ count: 2, reason: 'TIMING' })
  })

  it('the job request then shows Daniel at the $132 the award agreed, not the $131 his supplier asked', async () => {
    as(HIRING)
    const r = await call(requisitionDetail, 'GET', `/api/requisitions/${ids.job}`, ids.job)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const daniel = r.body.data.candidates.find((c: any) => c.person.name === 'Daniel Okafor')
    expect(daniel.rate).toBe(13_100)
    expect(daniel.placedRate).toBe(13_200)
    expect(r.body.data.requisition.status).toBe('FILLED')
  })
})
