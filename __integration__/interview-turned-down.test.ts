import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { buildProposal, EMPTY_FORM } from '@/lib/interview-proposal'
import { POST as propose } from '@/app/api/submissions/[id]/interviews/route'
import { POST as decide } from '@/app/api/interviews/[id]/route'
import { cancelRoundsFor, turnedDownReason } from '@/lib/interview-notices'

/**
 * A candidate turned down has their open rounds called off, and the
 * supplier and the candidate are told — on the seeded world, through the
 * routes a client and a supplier actually use to book the round.
 *
 * The client tester placed somebody on Northbend Athletic's job and the
 * other candidates' rounds stayed "In all three diaries".
 */

const D = '@demo.etyme.local'
const NIKE_PM = `world-nike-programme${D}`

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const call = async (fn: any, r: Request, id: string) => json(await fn(r, params(id)))

function timeIn(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date, time: '10:00' }
}

/** The notices about one round, once the ones a test waits for have landed. */
async function untilNotices(interviewId: string, arrived: (rows: any[]) => boolean) {
  const read = () => prisma.notification.findMany({ where: { entityId: interviewId }, orderBy: { createdAt: 'asc' } })
  for (let i = 0; i < 40; i++) {
    const rows = await read()
    if (arrived(rows)) return rows
    await new Promise((r) => setTimeout(r, 50))
  }
  return read()
}

let staff: string[]
let seat: string
let meiLin: { personId: string; submissionId: string }
let round: string
const REASON = turnedDownReason('NOT_SELECTED')

describe('when a candidate is turned down their open rounds are cancelled and both the supplier and the candidate are told', () => {
  beforeAll(async () => {
    await freshWorld()
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const pin = await prisma.company.findUniqueOrThrow({
      where: { slug: 'world-pinnacle' },
      select: {
        contexts: {
          where: { revokedAt: null, type: { in: ['EMPLOYEE', 'PARTNER'] } },
          select: { personId: true, person: { select: { primaryEmail: true } } },
          orderBy: { grantedAt: 'asc' },
        },
      },
    })
    seat = pin.contexts[0].person.primaryEmail
    staff = pin.contexts.map((c) => c.personId)
    const ml = await prisma.submission.findFirstOrThrow({
      where: { toCompanyId: nike.id, person: { name: 'Mei-Lin Chao' } },
      select: { id: true, personId: true },
    })
    meiLin = { personId: ml.personId, submissionId: ml.id }

    // A round booked the way the screens book it: the client proposes,
    // the supplier confirms for the candidate.
    as(NIKE_PM)
    const { body } = buildProposal({ ...EMPTY_FORM, stage: 'Screen', mode: 'PHONE', durationMins: 30, times: [timeIn(3)] })
    const made = await call(propose, req('POST', `/api/submissions/${meiLin.submissionId}/interviews`, body), meiLin.submissionId)
    expect(made.body?.error, JSON.stringify(made.body)).toBeUndefined()
    round = made.body.data.id
    as(seat)
    const ok = await call(decide, req('POST', `/api/interviews/${round}`, { action: 'confirm', forConsultant: true }), round)
    expect(ok.body?.error, JSON.stringify(ok.body)).toBeUndefined()
  }, 120_000)

  it('a turned-down candidate’s booked round is called off, with the reason on the round', async () => {
    await prisma.submission.update({ where: { id: meiLin.submissionId }, data: { status: 'NOT_SELECTED' } })
    const off = await cancelRoundsFor(meiLin.submissionId, REASON)
    expect(off).toEqual([round])
    const row = await prisma.interview.findUniqueOrThrow({ where: { id: round }, select: { state: true, cancelledReason: true, cancelledAt: true } })
    expect(row.state).toBe('CANCELLED')
    expect(row.cancelledReason).toBe(REASON)
    expect(row.cancelledAt).not.toBeNull()
  })

  it('the supplier’s people are told in the app, and the candidate by email, in one sentence each', async () => {
    const isOff = (n: any) => n.title.endsWith('is off')
    const rows = (await untilNotices(round, (all) =>
      all.some((n) => isOff(n) && staff.includes(n.personId)) && all.some((n) => isOff(n) && n.personId === meiLin.personId)
    )).filter(isOff)
    const toStaff = rows.filter((n) => staff.includes(n.personId))
    const toHer = rows.filter((n) => n.personId === meiLin.personId)
    expect(toStaff.length, 'nobody at Pinnacle was told').toBeGreaterThan(0)
    expect(toStaff.every((n) => n.channel === 'IN_APP')).toBe(true)
    expect(toStaff[0].body).toContain('The job went to someone else, so this interview is cancelled.')
    expect(toHer).toHaveLength(1)
    expect(toHer[0].channel).toBe('EMAIL')
    expect(toHer[0].title).toBe('Your round 1 with Northbend Athletic is off')
    expect(toHer[0].body).toContain('The job went to someone else, so this interview is cancelled.')
    // The time is named with its zone, never a bare clock.
    expect(toHer[0].body).toMatch(/\d:\d\d (AM|PM) [A-Z]/)
  })

  it('calling it again finds nothing open and tells nobody twice', async () => {
    // Counted by what a second call-off would say. The round's earlier
    // notices — proposed, confirmed — are told without waiting (the routes
    // `void tell(...)` by design), so under load one can land after this
    // count and read as a second telling. Only a call-off says "is off",
    // and the first call's notices were awaited by cancelRoundsFor itself.
    const offNotices = () => prisma.notification.count({ where: { entityId: round, title: { endsWith: ' is off' } } })
    const before = await offNotices()
    expect(before, 'the first call told nobody, so there is nothing to tell twice').toBeGreaterThan(0)
    expect(await cancelRoundsFor(meiLin.submissionId, REASON)).toEqual([])
    await new Promise((r) => setTimeout(r, 200))
    expect(await offNotices()).toBe(before)
  })

  it('a round already held is history and is never called off', async () => {
    const held = await prisma.interview.create({
      data: {
        ...(await prisma.interview.findUniqueOrThrow({
          where: { id: round },
          select: { submissionId: true, companyId: true, vendorId: true, requestedById: true, stage: true, proposedSlots: true },
        })),
        round: 9,
        state: 'DONE',
      } as any,
    })
    expect(await cancelRoundsFor(meiLin.submissionId, REASON)).toEqual([])
    expect((await prisma.interview.findUniqueOrThrow({ where: { id: held.id }, select: { state: true } })).state).toBe('DONE')
  })
})
