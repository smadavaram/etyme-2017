import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readApprovals, POST as sendOrAttach } from '@/app/api/week-approvals/route'
import { GET as openFile } from '@/app/api/week-approvals/[id]/file/route'
import { POST as answerLink } from '@/app/api/approve-week/[token]/route'
import { readWeekChain, needsSigningInEtyme } from '@/lib/week-approval'

/** An address at the week's client: a person seated there (`approverIsKnownAtClient`). */
async function seatedAt(clientId: string): Promise<string> {
  const c = await prisma.context.findFirstOrThrow({
    where: { companyId: clientId, revokedAt: null, suspendedAt: null },
    orderBy: { grantedAt: 'asc' },
    select: { person: { select: { primaryEmail: true } } },
  })
  return c.person.primaryEmail
}


/**
 * Two things the door to an email approval (lib/week-approval) owed the
 * rest of the product, found once the lists could show it.
 *
 *   1. A week approved by email was signed and never reached the books:
 *      the approve button posts the client's signature as revenue
 *      (`postAssertion`), and the email path wrote the same signature
 *      and posted nothing.
 *   2. A program office seated at a client's desk was a stranger on the
 *      week's own page, because the page read the office's own company
 *      rather than the seat — the mistake the approve button made before
 *      it resolved the seat first.
 */

const D = '@demo.etyme.local'
const HELENA = 'helena.marsh@seed.etyme.invalid'
const APTIVA = `world-aptiva${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const DANA = { approverName: 'Dana Whitfield', approverEmail: 'dana.whitfield@northbend.test' }

const letters: { to: string; text: string }[] = []
const it_: Record<string, any> = {}

const read = async (timesheetId: string) =>
  json(await readApprovals(req('GET', `/api/week-approvals?timesheetId=${timesheetId}`)))

describe('a week approved by email reaches the books, and a program office reads it from its seat', () => {
  beforeAll(async () => {
    await freshWorld()
    process.env.NEXTAUTH_URL ||= 'https://etyme.example'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFY_FROM_EMAIL = 'hours@etyme.example'
    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      if (String(url).includes('api.resend.com')) {
        const b = JSON.parse(init?.body ?? '{}')
        letters.push({ to: [b.to].flat()[0], text: b.text })
      }
      return new Response('{}', { status: 200 })
    })
    // The seeded client lives on a reserved demo domain, and no email
    // ever leaves for one. Northbend proves a second domain on the .test
    // name the suite uses for a real address, so the letter to its
    // approver goes out and can be read back.
    const northbend = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    await prisma.companyDomain.create({
      data: { companyId: northbend.id, domain: 'northbend.test', verifiedAt: new Date(), verifiedVia: 'MANUAL' },
    })

    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HELENA } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    it_.week = week.id
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('a week the client approves from the email link is posted to the books once, as revenue at the rate the client pays, naming nobody', async () => {
    as(HELENA)
    const sent = await json(await sendOrAttach(req('POST', '/api/week-approvals', { timesheetId: it_.week, how: 'LINK', ...DANA })))
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
    const token = letters.find((l) => l.to === DANA.approverEmail)!.text.match(/\/answer\/week\/([A-Za-z0-9_-]+)/)![1]

    const r = await json(await answerLink(req('POST', `/api/approve-week/${token}`, { answer: 'APPROVE' }), { params: Promise.resolve({ token }) }))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const signature = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: it_.week, role: 'CLIENT_APPROVAL', state: 'LIVE' } })
    const posted = await prisma.orderPosting.findMany({ where: { source: 'TIMESHEET', sourceId: signature.id } })
    expect(posted.map((p) => p.kind)).toEqual(['REVENUE'])
    expect(posted[0].txAmountCents).toBe(Math.round(Number(signature.hours) * signature.rateCents))
    // Nobody at the client signed in, so the posting names nobody.
    expect(posted[0].createdById).toBeNull()

    // A second press is refused, and the week is still on the books once.
    const again = await json(await answerLink(req('POST', `/api/approve-week/${token}`, { answer: 'APPROVE' }), { params: Promise.resolve({ token }) }))
    expect(again.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: signature.id } })).toBe(1)
  })

  it('a week approved with attached evidence is posted to the books too, and a program office seated at that client reads it, logged as the office in its seat', async () => {
    const seat = await prisma.programSeat.findFirstOrThrow({
      where: { officeCompany: { slug: 'world-aptiva' } },
      include: { clientCompany: true },
    })
    // A week at the seated client, still waiting on it, that email can approve.
    const waiting = await prisma.timesheet.findMany({
      where: {
        status: 'SUBMITTED', clientApprovedAt: null,
        sellContract: { OR: [{ endClientCompanyId: seat.clientCompanyId }, { endClientCompanyId: null, clientCompanyId: seat.clientCompanyId }] },
      },
      select: { id: true, personId: true },
    })
    let found: { id: string; personId: string; chain: NonNullable<Awaited<ReturnType<typeof readWeekChain>>> } | null = null
    for (const w of waiting) {
      const chain = await readWeekChain(w.id)
      if (chain && !needsSigningInEtyme(chain)) { found = { ...w, chain }; break }
    }
    expect(found, `a seeded week at ${seat.clientCompany.name} waiting on its client`).not.toBeNull()
    const { id, personId, chain } = found!
    it_.seatWeek = { id, personId }

    const desk = await prisma.context.findFirstOrThrow({
      where: { companyId: chain.employerId, revokedAt: null, role: { permissions: { hasSome: ['timesheets.approve', '*'] } } },
      include: { person: true },
    })
    as(desk.person.primaryEmail)
    const fd = new FormData()
    for (const [k, v] of Object.entries({ timesheetId: id, how: 'EVIDENCE', approverName: 'Avery Collins', approverEmail: await seatedAt(chain.clientId), kind: 'EMAIL' })) fd.append(k, v)
    fd.set('file', new File(['From: Avery Collins\nApproved.'], 'approval.eml', { type: 'text/plain' }))
    const r = await json(await sendOrAttach(new NextRequest('http://localhost:3000/api/week-approvals', { method: 'POST', body: fd })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const signature = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: id, role: 'CLIENT_APPROVAL', state: 'LIVE' } })
    const posted = await prisma.orderPosting.findMany({ where: { source: 'TIMESHEET', sourceId: signature.id } })
    expect(posted.map((p) => p.kind)).toEqual(['REVENUE'])

    // The program office, at the client's desk through the seat.
    as(APTIVA)
    const seen = await read(id)
    expect(seen.body?.error, JSON.stringify(seen.body)).toBeUndefined()
    expect(seen.body.data.week.clientName).toBe(seat.clientCompany.name)
    expect(seen.body.data.approvals[0].words).toMatch(/^Approved by email: Avery Collins, .+ — evidence attached$/)
    const viewRow = await prisma.accessLog.findFirstOrThrow({
      where: { subjectId: personId, action: 'APPROVAL_EVIDENCE_VIEW', allowed: true },
      orderBy: { at: 'desc' },
    })
    // The office read it, under the seat; never the client reading its own.
    expect(viewRow.actorCompanyId).toBe(seat.officeCompanyId)
    expect(viewRow.reason).toContain(`seat ${seat.id}`)

    const approval = await prisma.weekApproval.findFirstOrThrow({ where: { timesheetId: id } })
    const file = await openFile(req('GET', `/api/week-approvals/${approval.id}/file`), { params: Promise.resolve({ id: approval.id }) })
    expect(file.status).toBe(200)
    expect(await file.text()).toContain('Approved')
  })

  it('a firm with no seat at that client is still refused on the same week, and the refusal is logged', async () => {
    const week = it_.seatWeek
    as(BRIGHTMOOR)
    const r = await read(week.id)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('This week is not on a contract your company is on.')
    expect(await prisma.accessLog.count({
      where: { subjectId: week.personId, action: 'WEEK_APPROVAL_VIEW', allowed: false, actorCompany: { slug: 'world-brightmoor' } },
    })).toBe(1)
  })
})
