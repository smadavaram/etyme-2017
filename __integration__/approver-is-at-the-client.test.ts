import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as sendOrAttach } from '@/app/api/week-approvals/route'
import { NORTHBEND_MAIL } from '@/lib/seed-week-approval'

/**
 * Evidence of the client's approval names a person, and that person must
 * be somebody at the client: an address at its own domain, at a domain it
 * proved, or the address of a person seated there
 * (`approverIsKnownAtClient`, wired into lib/week-approval for both doors).
 * Until this, nothing stopped a worker giving her own address as the
 * client's approver, and the evidence would have read as the client's yes.
 */

const HELENA = 'helena.marsh@seed.etyme.invalid'
const NORTHBEND_HIRING = 'world-nike-hiring@demo.etyme.local'
const it_: Record<string, string> = {}

const sendLink = async (body: unknown) => json(await sendOrAttach(req('POST', '/api/week-approvals', body)))
const attach = async (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return json(await sendOrAttach(new NextRequest('http://localhost:3000/api/week-approvals', { method: 'POST', body: fd })))
}

describe('the approver named on a week is somebody at the client', () => {
  beforeAll(async () => {
    await freshWorld()
    process.env.NEXTAUTH_URL ||= 'https://etyme.example'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFY_FROM_EMAIL = 'hours@etyme.example'
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }))
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HELENA } })
    it_.helena = helena.id
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    it_.week = week.id
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('a worker cannot name their own address as the client’s approver', async () => {
    as(HELENA)
    const ev = await attach({
      timesheetId: it_.week, how: 'EVIDENCE', approverName: 'Helena Marsh', approverEmail: HELENA,
      kind: 'EMAIL', pastedText: 'Approved.',
    })
    expect(ev.status).toBe(422)
    expect(ev.body.error.code).toBe('APPROVER_NOT_AT_CLIENT')
    expect(ev.body.error.message).toBe(
      `${HELENA} is not an address at Northbend Athletic, and nobody with that address holds a seat there. ` +
        'Give the address of the person at Northbend Athletic who approved this week.'
    )
    const link = await sendLink({ timesheetId: it_.week, how: 'LINK', approverName: 'Helena Marsh', approverEmail: HELENA })
    expect(link.status).toBe(422)
    expect(link.body.error.code).toBe('APPROVER_NOT_AT_CLIENT')

    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })
    expect(row.clientApprovedAt).toBeNull()
    expect(await prisma.weekApproval.count({ where: { timesheetId: it_.week } })).toBe(0)
    const logged = await prisma.accessLog.count({
      where: { subjectId: it_.helena, allowed: false, action: { in: ['APPROVAL_LINK_SEND', 'APPROVAL_EVIDENCE_ATTACH'] } },
    })
    expect(logged).toBe(2)
  })

  it('a seated client approver’s address is accepted', async () => {
    as(HELENA)
    const r = await sendLink({ timesheetId: it_.week, how: 'LINK', approverName: 'Marcus Oyelaran', approverEmail: NORTHBEND_HIRING })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
  })

  it('an address at a domain the client proved is accepted', async () => {
    as(HELENA)
    const r = await sendLink({
      timesheetId: it_.week, how: 'LINK', approverName: 'Dana Whitfield', approverEmail: `dana.whitfield@${NORTHBEND_MAIL}`,
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
  })
})
