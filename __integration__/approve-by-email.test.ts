import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readApprovals, POST as sendOrAttach } from '@/app/api/week-approvals/route'
import { GET as openFile } from '@/app/api/week-approvals/[id]/file/route'
import { GET as openLink, POST as answerLink } from '@/app/api/approve-week/[token]/route'
import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { readWeekChain, needsSigningInEtyme } from '@/lib/week-approval'
import { dayOf } from '@/app/api/timesheets/approval-by-email'

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
 * A client may approve by email, and the proof travels down the chain.
 * The founder, 2026-09-30.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by Techpeple. Her seeded week of the 17th is filed and nobody has
 * signed it. Dana Whitfield approves it from a link, with no account; then
 * Computer Systems and Techpeple accept it in turn, exactly as they would
 * have after a signature in Etyme.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const TECHPEPLE = `world-techpeple${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const HELENA = 'helena.marsh@seed.etyme.invalid'
const DANA = { approverName: 'Dana Whitfield', approverEmail: 'dana.whitfield@northbend.example' }

/** Every letter that left, as the email provider would have received it. */
const letters: { to: string; subject: string; text: string }[] = []

const it_: Record<string, any> = {}
const today = () => dayOf(new Date(), new Date())

const read = async (timesheetId: string) =>
  json(await readApprovals(req('GET', `/api/week-approvals?timesheetId=${timesheetId}`)))
const sendLink = async (body: unknown) => json(await sendOrAttach(req('POST', '/api/week-approvals', body)))
const attach = async (fields: Record<string, string | string[]>, file?: { name: string; text: string }) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x)
  if (file) fd.set('file', new File([file.text], file.name, { type: 'text/plain' }))
  return json(await sendOrAttach(new NextRequest('http://localhost:3000/api/week-approvals', { method: 'POST', body: fd })))
}
const look = async (token: string) => json(await openLink(req('GET', `/api/approve-week/${token}`), { params: Promise.resolve({ token }) }))
const press = async (token: string, body: unknown) =>
  json(await answerLink(req('POST', `/api/approve-week/${token}`, body), { params: Promise.resolve({ token }) }))
const sign = async (id: string) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, {}), { params: Promise.resolve({ id }) }))

describe('a client approves a week by email, and the proof travels down the chain', () => {
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
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    it_.week = week.id
    const chain = (await readWeekChain(week.id))!
    it_.top = chain.ladder[0].sellContractId
    it_.bottom = chain.ladder[chain.ladder.length - 1].sellContractId
    expect(chain.ladder).toHaveLength(2)
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('a stranger cannot send a link or attach evidence on somebody else’s week, and the refusal is logged', async () => {
    as(BRIGHTMOOR)
    const link = await sendLink({ timesheetId: it_.week, how: 'LINK', ...DANA })
    expect(link.status).toBe(403)
    expect(link.body.error.message).toBe('Only Helena Marsh, or the timesheet desk at a supplier on this placement, can attach the client’s approval.')
    const ev = await attach({ timesheetId: it_.week, how: 'EVIDENCE', ...DANA, kind: 'EMAIL', pastedText: 'Approved' })
    expect(ev.status).toBe(403)
    const logged = await prisma.accessLog.findMany({ where: { subjectId: it_.helena, allowed: false, action: { in: ['APPROVAL_LINK_SEND', 'APPROVAL_EVIDENCE_ATTACH'] } } })
    expect(logged).toHaveLength(2)
    expect(await prisma.weekApproval.count({ where: { timesheetId: it_.week } })).toBe(0)
  })

  it('the client’s own desk is told to approve in Etyme rather than by email', async () => {
    as(NIKE)
    const r = await sendLink({ timesheetId: it_.week, how: 'LINK', ...DANA })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Northbend Athletic approves this week in Etyme itself. Evidence is for an approval given outside it.')
  })

  it('evidence without the approver’s name or email address is refused in a sentence, and nothing is signed', async () => {
    as(HELENA)
    const neither = await attach({ timesheetId: it_.week, how: 'EVIDENCE', kind: 'EMAIL', pastedText: 'Approved' })
    expect(neither.status).toBe(422)
    expect(neither.body.error.message).toBe(
      'Name the person at Northbend Athletic who approved this week, and give their email address. An approval nobody can be traced to is not an approval.'
    )
    const noAddress = await attach({ timesheetId: it_.week, how: 'EVIDENCE', approverName: 'Dana Whitfield', kind: 'EMAIL', pastedText: 'Approved' })
    expect(noAddress.status).toBe(422)
    expect(noAddress.body.error.message).toBe('Give Dana Whitfield’s email address, so anybody reading this can see who said yes.')
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })
    expect(row.clientApprovedAt).toBeNull()
  })

  it('a worker sends “Approve by email” on her own week, and the letter to the client’s approver carries a one-time link and no rate', async () => {
    as(HELENA)
    const r = await sendLink({ timesheetId: it_.week, how: 'LINK', ...DANA })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    expect(r.body.data.delivery.state).toBe('SENT')
    expect(r.body.data.says).toMatch(/^Sent to Dana Whitfield at dana\.whitfield@northbend\.example\. The link works once and runs out on /)
    // The sender is never handed the link: whoever holds it signs for the client.
    expect(JSON.stringify(r.body)).not.toMatch(/answer\/week\//)

    const letter = letters.find((l) => l.to === DANA.approverEmail)!
    expect(letter.subject).toMatch(/^Helena Marsh’s hours for .+: approve or send back$/)
    expect(letter.text).toContain('You do not need an account')
    expect(letter.text).not.toMatch(/\$|rate/i)
    // The client's approver is told the firm it pays, never the one below it.
    expect(letter.text).toContain('Helena Marsh at Computer Systems Inc asked us')
    expect(letter.text).not.toContain('Techpeple')
    it_.token = letter.text.match(/\/answer\/week\/([A-Za-z0-9_-]+)/)![1]

    const row = await prisma.weekApproval.findFirstOrThrow({ where: { timesheetId: it_.week }, include: { contracts: true } })
    expect(row.how).toBe('LINK')
    expect(row.sentAs).toBe('WORKER')
    // The token is kept only as a hash.
    expect(row.tokenHash).not.toContain(it_.token)
    expect(row.contracts.map((c) => c.sellContractId).sort()).toEqual([it_.top, it_.bottom].sort())
    const sent = await prisma.automationLog.findFirst({ where: { action: 'WEEK_APPROVAL_LINK_SENT', payload: { path: ['weekApprovalId'], equals: row.id } } })
    expect(sent?.reversible).toBe(false)
  })

  it('the approver opens the link with no account and sees the hours, and the open is logged', async () => {
    as('')
    const r = await look(it_.token)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.personName).toBe('Helena Marsh')
    expect(r.body.data.clientName).toBe('Northbend Athletic')
    expect(r.body.data.approveRefused).toBeNull()
    expect(JSON.stringify(r.body)).not.toContain('Techpeple')
    expect(JSON.stringify(r.body)).not.toMatch(/rate|cents|\$/i)
    expect(await prisma.accessLog.count({ where: { subjectId: it_.helena, action: 'APPROVAL_LINK_VIEW', allowed: true } })).toBe(1)
  })

  it('sending back needs a reason from the list', async () => {
    const r = await press(it_.token, { answer: 'SEND_BACK' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Pick why you are sending it back, so the worker knows what to fix.')
  })

  it('the client’s approver approves, which writes the client’s signature and nobody else’s', async () => {
    const r = await press(it_.token, { answer: 'APPROVE' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.says).toMatch(/^Thank you\. Helena Marsh’s week is approved/)

    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week }, include: { assertions: { include: { company: true } } } })
    expect(row.status).toBe('SUBMITTED')
    expect(row.clientApprovedAt).not.toBeNull()
    expect(row.clientApprovedById).toBeNull()
    expect(row.employerAcceptedAt).toBeNull()
    const live = row.assertions.filter((a) => a.state === 'LIVE')
    expect(live.map((a) => `${a.company.name}:${a.role}`)).toEqual(['Northbend Athletic:CLIENT_APPROVAL'])
    expect(live[0].byId).toBeNull()
    expect(live[0].auto).toBe(false)
    expect(live[0].note).toBe(`Approved by email: Dana Whitfield, ${today()}`)

    const link = await prisma.weekApproval.findFirstOrThrow({ where: { timesheetId: it_.week } })
    expect(link.outcome).toBe('APPROVED')
    expect(link.assertionId).toBe(live[0].id)
  })

  it('a used link is refused in a sentence saying who approved it and when', async () => {
    const again = await look(it_.token)
    expect(again.status).toBe(409)
    expect(again.body.error.message).toBe(`Dana Whitfield approved this week on ${today()}. Nothing else is needed here.`)
    const pressed = await press(it_.token, { answer: 'APPROVE' })
    expect(pressed.status).toBe(409)
    expect(await prisma.workAssertion.count({ where: { timesheetId: it_.week, role: 'CLIENT_APPROVAL', state: 'LIVE' } })).toBe(1)
    expect(await prisma.accessLog.count({ where: { subjectId: it_.helena, action: 'APPROVAL_LINK_VIEW', allowed: false } })).toBeGreaterThanOrEqual(1)
  })

  it('a link that is not ours is refused in a sentence', async () => {
    const r = await look('not-a-real-token-at-all-xx')
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('This link is not one of ours, or it has been replaced. Ask whoever sent it for a new one.')
  })

  it('then each lower rung accepts in turn: Techpeple must wait for Computer Systems, and nobody is accepted for', async () => {
    const csId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })).id
    const told = await prisma.notification.findFirst({ where: { title: 'Helena Marsh’s week is yours to accept', companyId: csId } })
    expect(told?.body).toMatch(/^Northbend Athletic signed .+ Approved by email: Dana Whitfield/)

    as(TECHPEPLE)
    const early = await sign(it_.week)
    expect(early.status).toBe(409)
    expect(early.body.error.message).toBe('Computer Systems Inc has not accepted this week yet. It comes to you once they have.')

    as(CS)
    const cs = await sign(it_.week)
    expect(cs.body?.error, JSON.stringify(cs.body)).toBeUndefined()
    as(TECHPEPLE)
    const last = await sign(it_.week)
    expect(last.body?.error, JSON.stringify(last.body)).toBeUndefined()

    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week }, include: { assertions: { include: { company: true } } } })
    expect(row.status).toBe('APPROVED')
    expect(row.assertions.filter((a) => a.state === 'LIVE').map((a) => `${a.company.name}:${a.role}`).sort()).toEqual([
      'Computer Systems Inc:PASS_THROUGH',
      'Northbend Athletic:CLIENT_APPROVAL',
      'Techpeple:EMPLOYER_ACCEPTANCE',
    ])
  })

  it('every rung reads “Approved by email”, each sees only its own contracts, and a sub-vendor’s contract is never shown to the client', async () => {
    as(NIKE)
    const client = await read(it_.week)
    expect(client.body?.error, JSON.stringify(client.body)).toBeUndefined()
    const a = client.body.data.approvals[0]
    expect(a.words).toBe(`Approved by email: Dana Whitfield, ${today()}`)
    expect(a.contracts.map((c: any) => c.id)).toEqual([it_.top])
    expect(JSON.stringify(client.body)).not.toContain(it_.bottom)
    expect(JSON.stringify(client.body)).not.toContain('Techpeple')

    as(CS)
    const prime = await read(it_.week)
    expect(prime.body.data.approvals[0].contracts.map((c: any) => c.id)).toEqual([it_.top, it_.bottom])

    as(TECHPEPLE)
    const sub = await read(it_.week)
    expect(sub.body.data.approvals[0].contracts.map((c: any) => c.id)).toEqual([it_.bottom])

    for (const r of [client, prime, sub]) expect(JSON.stringify(r.body)).not.toMatch(/rate|cents|\$/i)
    expect(await prisma.accessLog.count({ where: { subjectId: it_.helena, action: 'APPROVAL_EVIDENCE_VIEW', allowed: true } })).toBeGreaterThanOrEqual(3)
  })

  it('a firm not on the week cannot read its approvals, and the refusal is logged', async () => {
    as(BRIGHTMOOR)
    const r = await read(it_.week)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('This week is not on a contract your company is on.')
    expect(await prisma.accessLog.count({ where: { subjectId: it_.helena, action: 'WEEK_APPROVAL_VIEW', allowed: false } })).toBe(1)
  })

  it('the seeded week approved with evidence says so, and every rung it applies to can open the evidence; a stranger cannot', async () => {
    const seeded = await prisma.weekApproval.findFirstOrThrow({ where: { how: 'EVIDENCE', timesheet: { personId: it_.helena } } })
    as(NIKE)
    const shown = await read(seeded.timesheetId)
    expect(shown.body.data.approvals[0].words).toMatch(/^Approved by email: Marcus Oyelaran, .+ — evidence attached$/)

    for (const who of [NIKE, CS, TECHPEPLE, HELENA]) {
      as(who)
      const res = await openFile(req('GET', `/api/week-approvals/${seeded.id}/file`), { params: Promise.resolve({ id: seeded.id }) })
      expect(res.status, who).toBe(200)
      expect(await res.text()).toContain('Approved')
    }
    as(BRIGHTMOOR)
    const refused = await openFile(req('GET', `/api/week-approvals/${seeded.id}/file`), { params: Promise.resolve({ id: seeded.id }) })
    expect(refused.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { action: 'APPROVAL_EVIDENCE_VIEW', allowed: false, actorCompany: { slug: 'world-brightmoor' } } })).toBeGreaterThanOrEqual(1)
  })

  it('a supplier’s timesheet desk attaches the client’s approval email, which signs for the client only, on the contracts it picked', async () => {
    // Any week in the world still waiting on its client that email can approve.
    const waiting = await prisma.timesheet.findMany({ where: { status: 'SUBMITTED', clientApprovedAt: null, id: { not: it_.week } }, select: { id: true } })
    let found: { id: string; chain: NonNullable<Awaited<ReturnType<typeof readWeekChain>>> } | null = null
    for (const w of waiting) {
      const chain = await readWeekChain(w.id)
      if (chain && !needsSigningInEtyme(chain)) { found = { id: w.id, chain }; break }
    }
    expect(found, 'a seeded week waiting on its client').not.toBeNull()
    const { id, chain } = found!
    const desk = await prisma.context.findFirstOrThrow({
      where: { companyId: chain.employerId, revokedAt: null, role: { permissions: { hasSome: ['timesheets.approve', '*'] } } },
      include: { person: true },
    })
    as(desk.person.primaryEmail)
    const r = await attach(
      { timesheetId: id, how: 'EVIDENCE', approverName: 'Avery Collins', approverEmail: await seatedAt(chain.clientId), kind: 'EMAIL', contracts: [chain.ladder[0].sellContractId] },
      { name: 'approval.eml', text: 'From: Avery Collins\nApproved.' }
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.words).toBe(`Approved by email: Avery Collins, ${today()} — evidence attached`)

    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id }, include: { assertions: true } })
    expect(row.status).toBe('SUBMITTED')
    expect(row.employerAcceptedAt).toBeNull()
    expect(row.assertions.filter((a) => a.state === 'LIVE').map((a) => a.role)).toEqual(['CLIENT_APPROVAL'])
    const ev = await prisma.weekApproval.findFirstOrThrow({ where: { timesheetId: id }, include: { contracts: true, file: true } })
    expect(ev.sentAs).toBe('SUPPLIER_DESK')
    expect(ev.contracts.map((c) => c.sellContractId)).toEqual([chain.ladder[0].sellContractId])
    expect(ev.file?.fileName).toBe('approval.eml')
  })

  it('a week over the job’s hours cannot be approved by email; it is signed in Etyme with a reason', async () => {
    const lucia = await prisma.person.findFirstOrThrow({ where: { name: 'Lucía Fernández' } })
    const long = await prisma.timesheet.findFirstOrThrow({ where: { personId: lucia.id, status: 'SUBMITTED', clientApprovedAt: null, totalHours: 44 } })
    as(lucia.primaryEmail)
    const r = await sendLink({ timesheetId: long.id, how: 'LINK', ...DANA })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/A week like this is signed in Etyme by somebody at Northbend Athletic, with the reason it is right, so it cannot be approved by email\.$/)
  })
})
