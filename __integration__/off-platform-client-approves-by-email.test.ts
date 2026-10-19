import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listClients, POST as listClient, PATCH as recordContact } from '@/app/api/clients/route'
import { POST as sendOrAttach } from '@/app/api/week-approvals/route'
import { POST as claim } from '@/app/api/claim/[token]/route'
import { answerLink, readWeekApprovals, readerOf, newLinkToken, hashLinkToken } from '@/lib/week-approval'

/**
 * Tapin's first day: a supplier whose client is not on Etyme.
 *
 * The supplier lists the client (POST /api/clients), which makes a record
 * nobody has claimed — no domain, no aliases, no seats. Until 2026-10-19
 * every approver address was refused against it, so the supplier could
 * neither send "Approve by email" nor attach the client's approval. Now,
 * while nobody has claimed it, the address the supplier recorded for the
 * client — or another at that company domain — may approve, and the
 * signature says the client was not on Etyme. Once the client claims its
 * record, its own domain and seats decide, as for every client.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const DANA = 'dana.whitfield@larkspur-freight.example'
const COLLEAGUE = 'raj.patel@larkspur-freight.example'
const it_: Record<string, string> = {}

const send = async (timesheetId: string, approverName: string, approverEmail: string) =>
  json(await sendOrAttach(req('POST', '/api/week-approvals', { timesheetId, how: 'LINK', approverName, approverEmail })))

async function submittedWeek(sellContractId: string, personId: string, sunday: string) {
  const start = new Date(`${sunday}T00:00:00.000Z`)
  const day = (n: number) => new Date(start.getTime() + n * 86_400_000).toISOString().slice(0, 10)
  const t = await prisma.timesheet.create({
    data: {
      sellContractId, personId, periodStart: start, periodEnd: new Date(start.getTime() + 6 * 86_400_000),
      days: { [day(1)]: 8, [day(2)]: 8, [day(3)]: 8, [day(4)]: 8, [day(5)]: 8 }, totalHours: 40,
      status: 'SUBMITTED', submittedAt: new Date(start.getTime() + 6 * 86_400_000),
    },
    select: { id: true },
  })
  return t.id
}

describe('a supplier whose client is not on Etyme gets its weeks approved by email', () => {
  beforeAll(async () => {
    await freshWorld()
    process.env.NEXTAUTH_URL ||= 'https://etyme.example'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFY_FROM_EMAIL = 'hours@etyme.example'
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }))

    as(OWNER)
    const listed = await json(await listClient(req('POST', '/api/clients', { name: 'Larkspur Freight', domain: 'larkspur-freight.example' })))
    expect(listed.status, JSON.stringify(listed.body)).toBe(201)
    it_.client = listed.body.data.client.id

    const brightmoor = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { person: { primaryEmail: OWNER } } } }, select: { id: true } })
    it_.brightmoor = brightmoor.id
    const worker = await prisma.person.create({ data: { name: 'Ines Carvalho', primaryEmail: 'ines.carvalho@seed.etyme.invalid' } })
    it_.worker = worker.id
    const line = await prisma.sellContract.create({
      data: {
        companyId: brightmoor.id, clientCompanyId: it_.client, personId: worker.id,
        billRate: 9000, state: 'IN_PROGRESS', startDate: new Date('2026-08-02T00:00:00.000Z'),
      },
      select: { id: true },
    })
    it_.line = line.id
    it_.week1 = await submittedWeek(line.id, worker.id, '2026-09-27')
    it_.week2 = await submittedWeek(line.id, worker.id, '2026-10-04')
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('a client listed with no address refuses every approver, and says to record the person there first', async () => {
    as(OWNER)
    const r = await send(it_.week1, 'Dana Whitfield', DANA)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('APPROVER_NOT_AT_CLIENT')
    expect(r.body.error.message).toMatch(/^Larkspur Freight is not on Etyme and no address is recorded for it/)
  })

  it('the supplier records the person at its client after listing it, and cannot record one of its own people instead', async () => {
    as(OWNER)
    const own = await json(await recordContact(req('PATCH', '/api/clients', { clientId: it_.client, email: OWNER, contactName: 'Somebody' })))
    expect(own.status).toBe(422)
    expect(own.body.error.message).toBe(`${OWNER} is somebody at your own firm. Record the person at Larkspur Freight who approves the hours.`)

    const r = await json(await recordContact(req('PATCH', '/api/clients', { clientId: it_.client, email: DANA, contactName: 'Dana Whitfield' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const contact = await prisma.companyContact.findFirstOrThrow({ where: { companyId: it_.brightmoor, atCompanyId: it_.client } })
    expect(contact).toMatchObject({ email: DANA, name: 'Dana Whitfield' })
    // Recording somebody is not inviting them: no claim link is made.
    expect(await prisma.supplierInvite.count({ where: { companyId: it_.client } })).toBe(0)

    const list = await json(await listClients(req('GET', '/api/clients')))
    expect(list.body.data.clients.find((c: { id: string }) => c.id === it_.client)).toMatchObject({ onEtyme: false, yours: true })
  })

  it('a supplier that asks to invite its client makes the invitation once, and is told it was sent only where the email left', async () => {
    as(OWNER)
    const body = { name: 'Quarry Lane Foods', contactName: 'Mo Reyes', email: 'mo.reyes@quarry-lane.example', invite: true }
    const first = await json(await listClient(req('POST', '/api/clients', body)))
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const shell = await prisma.company.findUniqueOrThrow({ where: { id: first.body.data.client.id } })
    expect(shell.kind).toBe('CLIENT')
    expect(await prisma.supplierInvite.count({ where: { companyId: shell.id, email: 'mo.reyes@quarry-lane.example' } })).toBe(1)
    // A demo firm's letters do not leave, and the screen says so rather than "sent".
    expect(first.body.data.invited.delivery.state).toBe('DEMO_SKIPPED')
    expect(first.body.data.message).toContain('The invitation to mo.reyes@quarry-lane.example is ready, but the email did not leave')
    expect(first.body.data.message).not.toContain('has been sent')

    const again = await json(await listClient(req('POST', '/api/clients', body)))
    expect(again.body.data.message).toContain('mo.reyes@quarry-lane.example was invited before; no second email was sent.')
    expect(await prisma.supplierInvite.count({ where: { companyId: shell.id } })).toBe(1)
  })

  it('an address the supplier never recorded for an off-platform client is still refused, and the refusal is logged', async () => {
    as(OWNER)
    const r = await send(it_.week1, 'Pat Stranger', 'pat@somewhere-else.example')
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('APPROVER_NOT_AT_CLIENT')
    expect(r.body.error.message).toMatch(/pat@somewhere-else\.example is not an address recorded for Larkspur Freight, which is not on Etyme/)
    const logged = await prisma.accessLog.count({ where: { subjectId: it_.worker, allowed: false, action: 'APPROVAL_LINK_SEND' } })
    expect(logged).toBeGreaterThanOrEqual(2)
    expect(await prisma.weekApproval.count({ where: { timesheetId: it_.week1 } })).toBe(0)
  })

  it('a supplier whose client is not on Etyme sends the approval link to the person it recorded for that client, and the signature says the client was not on Etyme', async () => {
    as(OWNER)
    const r = await send(it_.week1, 'Dana Whitfield', DANA)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    const row = await prisma.weekApproval.findFirstOrThrow({ where: { timesheetId: it_.week1 } })
    expect(row.clientOffPlatform).toBe(true)

    // A demo firm's letter is not sent, so the test holds the token the
    // letter would have carried: only its hash is ever stored.
    const token = newLinkToken()
    await prisma.weekApproval.update({ where: { id: row.id }, data: { tokenHash: hashLinkToken(token) } })
    const answered = await answerLink(token, { answer: 'APPROVE' })
    expect(answered.ok, JSON.stringify(answered)).toBe(true)

    const words = `Approved by email: Dana Whitfield, ${DANA} — Larkspur Freight was not on Etyme`
    const signature = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: it_.week1, role: 'CLIENT_APPROVAL', state: 'LIVE' } })
    expect(signature.note).toBe(words)
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'WEEK_APPROVAL_LINK_SENT', companyId: it_.brightmoor }, orderBy: { at: 'desc' } })
    expect(log.reason).toContain(`Larkspur Freight is not on Etyme, so ${DANA} was accepted as an address its supplier recorded for it.`)
  })

  it('a colleague at the recorded person’s company address may attach the client’s approval while the client is not on Etyme', async () => {
    as(OWNER)
    const fd = new FormData()
    for (const [k, v] of Object.entries({ timesheetId: it_.week2, approverName: 'Raj Patel', approverEmail: COLLEAGUE, kind: 'EMAIL', pastedText: 'Approved, thanks. Raj' })) fd.append(k, v)
    const { NextRequest } = await import('next/server')
    const r = await json(await sendOrAttach(new NextRequest('http://localhost:3000/api/week-approvals', { method: 'POST', body: fd })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.words).toBe(`Approved by email: Raj Patel, ${COLLEAGUE} — Larkspur Freight was not on Etyme`)
  })

  it('once the client claims its record, its own domain and seats decide, as before, and the approvals it gave off the platform still say so', async () => {
    // The invitation Larkspur would receive once its letter exists; written
    // here as the invite path writes it.
    const invite = await prisma.supplierInvite.create({
      data: { companyId: it_.client, byId: it_.brightmoor, email: DANA, contactName: 'Dana Whitfield', domain: 'larkspur-freight.example', token: 'larkspur-claim-token-0001' },
    })
    as(DANA)
    const claimed = await json(await claim(req('POST', `/api/claim/${invite.token}`), { params: Promise.resolve({ token: invite.token }) }))
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200)
    const client = await prisma.company.findUniqueOrThrow({ where: { id: it_.client } })
    expect(client.claimedAt).not.toBeNull()

    const week3 = await submittedWeek(it_.line, it_.worker, '2026-10-11')
    as(OWNER)
    // Raj was good enough while Larkspur was not here. Its domain is not
    // proved and he holds no seat, so he is not now.
    const raj = await send(week3, 'Raj Patel', COLLEAGUE)
    expect(raj.status).toBe(422)
    expect(raj.body.error.message).toBe(
      `${COLLEAGUE} is not an address at Larkspur Freight, and nobody with that address holds a seat there. ` +
        'Give the address of the person at Larkspur Freight who approved this week.'
    )
    // Dana holds a seat now, so she is accepted the way any client's person is.
    const dana = await send(week3, 'Dana Whitfield', DANA)
    expect(dana.status, JSON.stringify(dana.body)).toBe(201)
    expect((await prisma.weekApproval.findFirstOrThrow({ where: { timesheetId: week3 } })).clientOffPlatform).toBe(false)

    // The supplier no longer edits who approves for a client that is here.
    const edit = await json(await recordContact(req('PATCH', '/api/clients', { clientId: it_.client, email: COLLEAGUE, contactName: 'Raj Patel' })))
    expect(edit.status).toBe(409)

    // What was approved before the claim still reads as it was given.
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true, name: true } })
    const seen = await readWeekApprovals(
      readerOf({ person: owner, company: { id: it_.brightmoor, name: 'Brightmoor', kind: 'VENDOR' }, permissions: ['*'] }),
      it_.week1,
    )
    expect(seen.ok && seen.seen.approvals[0].words).toBe(`Approved by email: Dana Whitfield, ${DANA} — Larkspur Freight was not on Etyme`)
  })
})
