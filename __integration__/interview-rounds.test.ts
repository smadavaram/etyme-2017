import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { buildProposal, EMPTY_FORM } from '@/lib/interview-proposal'
import { POST as propose } from '@/app/api/submissions/[id]/interviews/route'
import { POST as decide } from '@/app/api/interviews/[id]/route'
import { POST as answer } from '@/app/api/me/interviews/[id]/respond/route'

/**
 * Interviews, from the client's desk, the way the founder tried it.
 *
 * "In submissions — I could not invite for interviews and conduct
 * multiple rounds of interviews." The rounds were modelled and the
 * routes were proven; nothing on a screen called them and nobody was
 * told anything. This walks what the screens now do, as the routes
 * they call, with the body the form actually builds — from Nike's
 * programme desk, Pinnacle's seat, and the candidate's own page.
 */

const D = '@demo.etyme.local'
const NIKE_PM = `world-nike-programme${D}`

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const call = async (fn: any, r: Request, id: string) => json(await fn(r, params(id)))

/** A day and time in the form's own terms, N days from now at 10:00 local. */
function timeIn(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date, time: '10:00' }
}

/** Notices are fire-and-forget; give the bell a moment to ring. */
async function noticesAbout(interviewId: string, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const rows = await prisma.notification.findMany({ where: { entityId: interviewId }, orderBy: { createdAt: 'asc' } })
    if (rows.length > 0) return rows
    await new Promise((r) => setTimeout(r, 50))
  }
  return prisma.notification.findMany({ where: { entityId: interviewId } })
}

let nike: { id: string }
let pinnacle: { id: string; seat: string; staff: string[] }
let meiLin: { personId: string; email: string; submissionId: string }
let daniel: { submissionId: string }
let round1: string
let round2: string

describe('Nike interviews a candidate, from the desk that received her', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    nike = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } }))
    const pin = await prisma.company.findUniqueOrThrow({
      where: { slug: 'world-pinnacle' },
      select: {
        id: true,
        contexts: {
          where: { revokedAt: null, type: { in: ['EMPLOYEE', 'PARTNER'] } },
          select: { personId: true, person: { select: { primaryEmail: true } } },
          orderBy: { grantedAt: 'asc' },
        },
      },
    })
    pinnacle = { id: pin.id, seat: pin.contexts[0].person.primaryEmail, staff: pin.contexts.map((c) => c.personId) }

    const ml = await prisma.submission.findFirstOrThrow({
      where: { toCompanyId: nike.id, person: { name: 'Mei-Lin Chao' } },
      select: { id: true, person: { select: { id: true, primaryEmail: true } } },
    })
    meiLin = { personId: ml.person.id, email: ml.person.primaryEmail, submissionId: ml.id }

    const dk = await prisma.submission.findFirstOrThrow({
      where: { toCompanyId: nike.id, person: { name: 'Daniel Okafor' } },
      select: { id: true },
    })
    daniel = { submissionId: dk.id }
  }, 120_000)

  it('a client proposes round one from the candidate\'s row, with the body the form builds', async () => {
    const { body, problems } = buildProposal({
      ...EMPTY_FORM,
      stage: 'Screen',
      mode: 'PHONE',
      durationMins: 30,
      times: [timeIn(2), timeIn(3)],
      interviewers: ['Marcus Oyelaran, People Technology'],
    })
    expect(problems).toEqual([])

    as(NIKE_PM)
    const res = await call(propose, req('POST', `/api/submissions/${meiLin.submissionId}/interviews`, body), meiLin.submissionId)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()
    expect(res.body.data.round).toBe(1)
    expect(res.body.data.says).toContain('Round 1 proposed for Mei-Lin Chao')
    round1 = res.body.data.id
  })

  it('the submission now reads as interviewing', async () => {
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: meiLin.submissionId }, select: { status: true } })
    expect(sub.status).toBe('INTERVIEW')
  })

  it('the supplier\'s people are told in the app, and the candidate by email', async () => {
    const rows = await noticesAbout(round1)
    const toStaff = rows.filter((n) => pinnacle.staff.includes(n.personId))
    const toHer = rows.filter((n) => n.personId === meiLin.personId)
    expect(toStaff.length, 'nobody at Pinnacle was told').toBeGreaterThan(0)
    expect(toStaff.every((n) => n.channel === 'IN_APP')).toBe(true)
    expect(toHer).toHaveLength(1)
    expect(toHer[0].channel).toBe('EMAIL')
    expect(toHer[0].title).toBe('Nike would like to interview you')
    expect(rows.every((n) => n.type === 'INTERVIEW')).toBe(true)
  })

  it('a second round cannot be proposed while the first is still ahead', async () => {
    as(NIKE_PM)
    const { body } = buildProposal({ ...EMPTY_FORM, times: [timeIn(5)] })
    const res = await call(propose, req('POST', `/api/submissions/${meiLin.submissionId}/interviews`, body), meiLin.submissionId)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ROUND_STILL_OPEN')
    expect(res.body.error.message).toBe('Round 1 is still ahead of you. Record how it went before proposing the next.')
  })

  it('a supplier cannot start a round on its own submission', async () => {
    as(pinnacle.seat)
    const { body } = buildProposal({ ...EMPTY_FORM, times: [timeIn(5)] })
    const res = await call(propose, req('POST', `/api/submissions/${meiLin.submissionId}/interviews`, body), meiLin.submissionId)
    expect(res.status).toBe(404)
  })

  it('the supplier confirms for the candidate, and the person who asked is told', async () => {
    as(pinnacle.seat)
    const before = (await noticesAbout(round1)).length
    const res = await call(decide, req('POST', `/api/interviews/${round1}`, { action: 'confirm', forConsultant: true }), round1)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()

    const requester = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE_PM }, select: { id: true } })
    let told: any[] = []
    for (let i = 0; i < 20 && told.length === 0; i++) {
      const rows = await prisma.notification.findMany({ where: { entityId: round1, personId: requester.id } })
      told = rows.filter((n) => n.title.startsWith('Pinnacle Resourcing confirmed'))
      if (told.length === 0) await new Promise((r) => setTimeout(r, 50))
    }
    expect(told, `no confirmation reached the desk that asked (had ${before} notices before)`).toHaveLength(1)
  })

  it('the client says she goes through; the supplier hears the outcome and never the notes', async () => {
    as(NIKE_PM)
    const notes = 'Sharp on Studio, thin on Prism. Wants the integrations team to see her.'
    const res = await call(decide, req('POST', `/api/interviews/${round1}`, { action: 'outcome', outcome: 'ADVANCE', feedback: notes }), round1)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()

    let rows: any[] = []
    for (let i = 0; i < 20; i++) {
      rows = await prisma.notification.findMany({ where: { entityId: round1, personId: { in: pinnacle.staff }, title: { contains: 'round 2' } } })
      if (rows.length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(rows.length, 'Pinnacle was not told she went through').toBeGreaterThan(0)
    for (const n of rows) {
      expect(n.title).toContain('goes through to round 2')
      expect(n.body).not.toContain('Prism')
      expect(n.body).not.toContain(notes)
    }
    // And nowhere at all do the notes travel.
    const anyLeak = await prisma.notification.findMany({ where: { body: { contains: 'Prism' } } })
    expect(anyLeak).toHaveLength(0)
  })

  it('round two is numbered two', async () => {
    as(NIKE_PM)
    const { body } = buildProposal({ ...EMPTY_FORM, stage: 'Technical', mode: 'VIDEO', times: [timeIn(7), timeIn(8), timeIn(9)] })
    const res = await call(propose, req('POST', `/api/submissions/${meiLin.submissionId}/interviews`, body), meiLin.submissionId)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()
    expect(res.body.data.round).toBe(2)
    round2 = res.body.data.id
  })

  it('a candidate already through round one can be given round two straight away', async () => {
    as(NIKE_PM)
    const { body } = buildProposal({ ...EMPTY_FORM, times: [timeIn(4)] })
    const res = await call(propose, req('POST', `/api/submissions/${daniel.submissionId}/interviews`, body), daniel.submissionId)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()
    expect(res.body.data.round).toBe(2)
  })

  it('the candidate accepts a time from her own page, in her own name, and both firms are told', async () => {
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id: round2 }, select: { proposedSlots: true } })
    const slot = (iv.proposedSlots as any[])[1].start

    as(meiLin.email)
    const res = await call(answer, req('POST', `/api/me/interviews/${round2}/respond`, { action: 'ACCEPT', slot }), round2)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()

    const after = await prisma.interview.findUniqueOrThrow({ where: { id: round2 } })
    expect(after.consultantConfirmedAt).not.toBeNull()
    expect(after.consultantConfirmedVia).toBe('SELF')
    expect(after.scheduledAt?.toISOString()).toBe(new Date(slot).toISOString())
    // Three diaries. The supplier has not confirmed round two, so it is
    // not booked yet — accepted is not the same as in the diary.
    expect(after.state).toBe('PROPOSED')

    const requester = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE_PM }, select: { id: true } })
    let rows: any[] = []
    for (let i = 0; i < 20; i++) {
      rows = await prisma.notification.findMany({ where: { entityId: round2, title: { contains: 'accepted round 2' } } })
      if (rows.length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(rows.some((n) => n.personId === requester.id), 'the desk that asked was not told').toBe(true)
    expect(rows.some((n) => pinnacle.staff.includes(n.personId)), 'Pinnacle was not told').toBe(true)
    expect(rows.some((n) => n.personId === meiLin.personId), 'she was told about her own answer').toBe(false)
  })

  it('she can say she cannot make any of them, in a sentence, and the desk is told what to do', async () => {
    // A fresh round on Daniel to decline, so Mei-Lin's booked one stands.
    const iv = await prisma.interview.findFirstOrThrow({ where: { submissionId: daniel.submissionId, round: 2 }, select: { id: true, submission: { select: { person: { select: { primaryEmail: true } } } } } })
    as(iv.submission.person.primaryEmail)
    const res = await call(answer, req('POST', `/api/me/interviews/${iv.id}/respond`, { action: 'DECLINE', reason: 'I start a new contract that week.' }), iv.id)
    expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()

    const requester = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE_PM }, select: { id: true } })
    let rows: any[] = []
    for (let i = 0; i < 20; i++) {
      rows = await prisma.notification.findMany({ where: { entityId: iv.id, personId: requester.id } })
      if (rows.length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Daniel Okafor cannot make round 2')
    expect(rows[0].body).toContain('They said: I start a new contract that week.')
    expect(rows[0].body).toContain('Offer other times')
  })
})
