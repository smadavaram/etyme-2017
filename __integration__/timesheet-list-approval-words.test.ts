import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as list } from '@/app/api/timesheets/route'
import { POST as sendOrAttach } from '@/app/api/week-approvals/route'
import { readWeekChain, needsSigningInEtyme } from '@/lib/week-approval'

/**
 * The timesheet list says who approved a week, where the client approved
 * it by email, and links every week to its own page — where "Approve by
 * email" is sent from.
 *
 * Seeded: Helena Marsh's oldest signed week at Northbend Athletic, through
 * Computer Systems Inc and Techpeple, approved by Marcus Oyelaran by email
 * with his reply attached by Techpeple's desk.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const TECHPEPLE = `world-techpeple${D}`
const HELENA = 'helena.marsh@seed.etyme.invalid'

const letters: { to: string; subject: string; text: string }[] = []
const it_: Record<string, string> = {}

const row = async (id: string) => {
  const r = await json(await list(req('GET', `/api/timesheets?id=${id}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.timesheets.find((t: { id: string }) => t.id === id)
}

describe('the timesheet list says who approved a week by email', () => {
  beforeAll(async () => {
    await freshWorld()
    process.env.NEXTAUTH_URL ||= 'https://etyme.example'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFY_FROM_EMAIL = 'hours@etyme.example'
    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      if (String(url).includes('api.resend.com')) {
        const b = JSON.parse(init?.body ?? '{}')
        letters.push({ to: [b.to].flat()[0], subject: b.subject, text: b.text })
      }
      return new Response('{}', { status: 200 })
    })
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HELENA } })
    it_.helena = helena.id
    const seeded = await prisma.weekApproval.findFirstOrThrow({ where: { how: 'EVIDENCE', timesheet: { personId: helena.id } } })
    it_.seeded = seeded.timesheetId
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('the client’s list reads the seeded Northbend week as approved by email by Marcus Oyelaran, with the evidence attached', async () => {
    as(NIKE)
    const t = await row(it_.seeded)
    expect(t.approvedBy).toMatch(/^Approved by email: Marcus Oyelaran, [A-Z][a-z]{2} \d{1,2}(, \d{4})? — evidence attached$/)
    // The client did not sign in Etyme, so its row does not say it did.
    expect(t.signature.says).toMatch(/^Approved by email: Marcus Oyelaran, .+ — evidence attached\. /)
    expect(t.signature.says).not.toMatch(/^You approved/)
  })

  it('the sentence on the client’s list carries no rate and names no firm below the one the client pays', async () => {
    as(NIKE)
    const t = await row(it_.seeded)
    expect(`${t.approvedBy} ${t.signature.says}`).not.toMatch(/\$|rate/i)
    expect(`${t.approvedBy} ${t.signature.says}`).not.toContain('Techpeple')
  })

  it('every week on the list links to its own page, where “Approve by email” is sent from', async () => {
    as(NIKE)
    const t = await row(it_.seeded)
    expect(t.href).toBe(`/dashboard/weeks/${it_.seeded}`)
  })

  it('the supplier that attached the evidence reads the same sentence on its own list', async () => {
    as(TECHPEPLE)
    const t = await row(it_.seeded)
    expect(t.approvedBy).toMatch(/^Approved by email: Marcus Oyelaran, .+ — evidence attached$/)
  })

  it('the worker reads it on her own week', async () => {
    as(HELENA)
    const t = await row(it_.seeded)
    expect(t.approvedBy).toMatch(/^Approved by email: Marcus Oyelaran, /)
  })

  it('reading who approved a week on the list leaves an access log row naming the worker', async () => {
    as(NIKE)
    const before = await prisma.accessLog.count({ where: { action: 'WEEK_APPROVAL_WORDS_VIEW', subjectId: it_.helena, allowed: true } })
    await row(it_.seeded)
    const after = await prisma.accessLog.count({ where: { action: 'WEEK_APPROVAL_WORDS_VIEW', subjectId: it_.helena, allowed: true } })
    expect(after).toBe(before + 1)
  })

  it('a week the client signed in Etyme carries no email sentence', async () => {
    as(NIKE)
    const signed = await prisma.timesheet.findFirst({
      where: { personId: it_.helena, clientApprovedAt: { not: null }, id: { not: it_.seeded }, weekApprovals: { none: {} } },
      select: { id: true },
    })
    expect(signed, 'another week of Helena’s signed in Etyme').not.toBeNull()
    const t = await row(signed!.id)
    expect(t.approvedBy).toBeNull()
  })

  it('a link sent by a timesheet desk below the client’s supplier names neither that desk nor its firm in the letter, and says to ask the supplier the client pays', async () => {
    const waiting = await prisma.timesheet.findFirstOrThrow({
      where: { personId: it_.helena, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
      select: { id: true },
    })
    const chain = (await readWeekChain(waiting.id))!
    expect(chain.ladder).toHaveLength(2)
    expect(needsSigningInEtyme(chain)).toBeNull()
    as(TECHPEPLE)
    const r = await json(await sendOrAttach(req('POST', '/api/week-approvals', {
      timesheetId: waiting.id, how: 'LINK', approverName: 'Dana Whitfield', approverEmail: 'dana.whitfield@northbend.example',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const letter = letters.find((l) => l.to === 'dana.whitfield@northbend.example')!
    expect(letter.text).toContain('Helena Marsh’s supplier asked us to send you the week to approve. If anything in it looks wrong, ask Computer Systems Inc.')
    expect(letter.text).not.toContain('Techpeple')
    expect(letter.text).not.toContain('side of this placement')
    expect(letter.text).not.toMatch(/\$|rate/i)
  })
})
