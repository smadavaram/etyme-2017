import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as benchProfit } from '@/app/api/bench/profit/route'
import { GET as placementGET } from '@/app/api/placements/[id]/route'

/**
 * Bench profit on the seeded world (CLAUDE.md, "Bench profit, next after
 * the integrator flow", decided 2026-09-30).
 *
 * Pellwright Validation Partners is a niche bench vendor: validation
 * engineers, one course at $1,800 a seat, half pay on the bench for up to
 * ninety days, placing through Sundara Systems at Corveldt Aerospace
 * (lib/seed-bench-profit). Teleworld Solutions is the integrator whose
 * people move between its own projects. Every figure below is read off
 * the route and re-derived in the comment beside it.
 */

const D = '@demo.etyme.local'
const OWNER = `world-pellwright${D}`
const FINANCE = `world-pellwright-finance${D}`
const RECRUITER = `world-pellwright-recruiter${D}`

async function read(email: string) {
  as(email)
  return json(await benchProfit(req('GET', '/api/bench/profit')))
}
const row = (body: any, name: string) => body.data.people.find((p: any) => p.name === name)

let owner: any

beforeAll(async () => {
  await freshWorld()
  owner = await read(OWNER)
}, 900_000)

describe('bench to bill, per person, at Pellwright Validation Partners', () => {
  it('the owner reads what Tobias Wren’s days on the bench cost and the day his margin paid it back', () => {
    expect(owner.status, JSON.stringify(owner.body)).toBe(200)
    expect(owner.body.data.policySays).toBe('50% of their pay while on the bench, for up to 90 days.')
    const tobias = row(owner.body, 'Tobias Wren')
    // Finished the course and joined the bench on Apr 13; placed on Jun 1.
    expect(tobias).toMatchObject({ spell: 'BEFORE', benchFrom: '2026-04-13', benchTo: '2026-06-01', days: 49 })
    // 49 calendar days are 35 working days, at half of $62 × 8 = $248 a day.
    expect(tobias.costCents).toBe(868_000)
    // Seventeen signed weeks at ($88 − $62) × 40, two of them a holiday short.
    expect(tobias.marginCents).toBe(1_726_400)
    expect(tobias.paidBackOn).toBe('2026-07-31')
    expect(tobias.paybackSays).toBe('Paid back on Jul 31, 2026, 60 days after they started on Jun 1, 2026.')
    expect(tobias.placedAt).toBe('Corveldt Aerospace, through Sundara Systems')
    expect(tobias.costSays).toBe(
      '49 days on the bench at 50% of $496.00 a day, under your bench pay policy: $8,680.00. ' +
        'Priced at what they are paid on the placement that followed, as your policy reads it.'
    )
  })

  it('Noor Abernathy has not paid her bench back yet, and the page says how much is left', () => {
    const noor = row(owner.body, 'Noor Abernathy')
    // 35 days are 25 working days at half of $58 × 8.
    expect(noor).toMatchObject({ days: 35, costCents: 580_000, marginCents: 364_800, paidBackOn: null, leftCents: 215_200 })
    expect(noor.paybackSays).toBe('Not yet. $2,152.00 left to earn back.')
  })

  it('somebody on the bench with no pay on record has a cost that is not known yet, and says why', () => {
    for (const name of ['Lucia Brandvold', 'Samuel Varga']) {
      const r = row(owner.body, name)
      expect(r.spell, name).toBe('NOW')
      expect(r.costCents, name).toBeNull()
      expect(r.costSays, name).toContain('No pay rate is on record for them')
      expect(r.paybackSays, name).toBe('Not known yet, because the bench cost is not.')
    }
    expect(row(owner.body, 'Lucia Brandvold').days).toBe(40)
  })

  it('Hector Valdivia, on the bench since his placement ended, costs $11,008 so far and has nothing billed since', () => {
    const hector = row(owner.body, 'Hector Valdivia')
    // 60 days since Aug 1 are 43 working days at half of $64 × 8.
    expect(hector).toMatchObject({ spell: 'NOW', benchFrom: '2026-08-01', days: 60, costCents: 1_100_800, marginCents: null })
    expect(hector.paybackSays).toBe('Not placed yet. $11,008.00 to earn back.')
    // Nothing pays him today, and the sentence says the figure is the policy's.
    expect(hector.costSays).toContain('Nothing on the record pays them today; priced at the pay of their last placement')
  })

  it('somebody who took a seat and never joined the bench is not on the bench list', () => {
    expect(row(owner.body, 'Greta Lindahl')).toBeUndefined()
    expect(owner.body.data.people.map((p: any) => p.name).sort()).toEqual(
      ['Hector Valdivia', 'Lucia Brandvold', 'Noor Abernathy', 'Samuel Varga', 'Tobias Wren']
    )
  })

  it('the margin on a placement is the placement page’s own figure, to the cent', async () => {
    const tobias = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'tobias.wren@seed.etyme.invalid' }, select: { id: true } })
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pellwright' }, select: { id: true } })
    const line = await prisma.sellContract.findFirstOrThrow({ where: { companyId: firm.id, personId: tobias.id }, select: { id: true } })
    as(OWNER)
    const page = await json(await placementGET(req('GET', `/api/placements/${line.id}`), { params: Promise.resolve({ id: line.id }) }))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(Math.round(page.body.data.money.margin * 100)).toBe(row(owner.body, 'Tobias Wren').marginCents)
  })
})

describe('per course', () => {
  it('the validation course cost $9,000 for five seats, placed two people a median of 42 days after they finished, and they earned $20,912', () => {
    const [course] = owner.body.data.courses
    expect(owner.body.data.courses).toHaveLength(1)
    expect(course).toMatchObject({
      title: 'Equipment and process validation: IQ, OQ and PQ',
      seats: 5, finished: 3, dropped: 1,
      pricePerSeatCents: 180_000, costCents: 900_000,
      placed: 2,
      // 49 days for Tobias and 35 for Noor.
      medianDaysToPlace: 42,
      marginCents: 1_726_400 + 364_800,
    })
    expect(course.marginSays).toBe('$20,912.00 earned by the 2 people it placed, more than the course cost.')
  })
})

describe('who reads it', () => {
  it('the finance desk reads the same figures as the owner', async () => {
    const f = await read(FINANCE)
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    expect(f.body.data.people).toEqual(owner.body.data.people)
    expect(f.body.data.courses).toEqual(owner.body.data.courses)
  })

  it('the recruiter is refused in a sentence naming the desks that read it, and is shown no figure', async () => {
    const r = await read(RECRUITER)
    expect(r.status).toBe(403)
    expect(r.body.data).toBeUndefined()
    expect(r.body.error.message).toBe(
      'Bench profit at Pellwright Validation Partners is read by the owner, the admin and the finance desk. ' +
        'Your seat (Recruiter) is none of them. Ask one of them, or ask whoever manages roles there.'
    )
  })

  it('a client is refused bench profit, so a client never reads a supplier’s margin', async () => {
    const r = await read(`world-corveldt${D}`)
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('CLIENT')
  })

  it('the prime Pellwright places through reads none of Pellwright’s people in its own bench profit', async () => {
    const r = await read(`world-sundara${D}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const names = r.body.data.people.map((p: any) => p.name)
    for (const n of ['Tobias Wren', 'Noor Abernathy', 'Hector Valdivia']) expect(names).not.toContain(n)
    expect(r.body.data.courses).toEqual([])
  })

  it('every person whose pay a figure was worked from is on the access trail, under the reader’s name', async () => {
    const reader = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })
    const trail = await prisma.accessLog.findMany({
      where: { actorPersonId: reader.id, action: 'PAYROLL_VIEW', reason: { contains: 'bench profit' } },
      select: { subjectId: true, allowed: true },
    })
    const shown = owner.body.data.people.map((p: any) => p.personId)
    for (const id of shown) expect(trail.some((t) => t.subjectId === id && t.allowed), id).toBe(true)
  })
})

describe('utilization, for an integrator', () => {
  it('Teleworld’s owner reads three of four people billing and one on the bench, by project', async () => {
    const r = await read(`world-teleworld${D}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.utilization).toMatchObject({
      billing: 3, onBench: 1, billingPct: 75, benchPct: 25,
      perProject: [{ project: 'Northbend Athletic', billing: 2 }, { project: 'Harlow Health', billing: 1 }],
    })
    // Owners, managers and HR have nothing on the record and are counted apart.
    expect(r.body.data.utilization.says).toContain('3 of 4 billing (75%), 1 on the bench (25%).')
    // Nobody has been moved yet: the demo leaves the move to whoever walks it.
    expect(r.body.data.moves).toEqual([])
  })

  it('under Teleworld’s no bill, no pay policy Karthik Menon’s month between projects cost nothing', async () => {
    const r = await read(`world-teleworld${D}`)
    const karthik = row(r.body, 'Karthik Menon')
    expect(karthik).toMatchObject({ spell: 'NOW', days: 30, costCents: 0, paybackSays: 'Nothing to pay back.' })
  })

  it('a bench vendor is not shown utilization, which is an integrator’s question', () => {
    expect(owner.body.data.utilization).toBeNull()
  })
})
