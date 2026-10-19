import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as listClient, PATCH as recordContact } from '@/app/api/clients/route'
import { GET as openBill } from '@/app/api/answer/bill/[token]/route'
import { sendBillToCustomer, resendBillToCustomer, billDeliverySays, openBillLink, RESEND_NOT_WITHIN_MS } from '@/lib/notify/bill-delivery'
import { billLinkToken } from '@/lib/notify/bill-letter'
import { formatDay } from '@/lib/format-date'

/**
 * Tapin's first day, blocker 3 (2026-10-19): a bill was sent and nothing
 * reached the client. The supplier emailed it by hand.
 *
 * Brightmoor Staffing stands in for Tapin. Harrow Lane Foods is a client
 * it wrote down that is not on Etyme, with the person who receives its
 * bills recorded. Northbend Athletic is a client on Etyme, with an AP
 * clerk. Money's `markSent` moves a bill to SUBMITTED; these are what
 * happens next, called the way money calls it after its transaction.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
// `.test` is sendable (lib/notification-delivery), so this letter really goes to the provider.
const PAYABLES = 'payables@harrow-lane.test'
const mail: { to: string; subject: string; text: string }[] = []
const it_: Record<string, string> = {}
const today = () => formatDay(new Date(), { year: false })
const getBill = async (token: string) => json(await openBill(req('GET', `/api/answer/bill/${token}`), { params: Promise.resolve({ token }) }))
const tokenIn = (text: string) => text.match(/\/answer\/bill\/(\S+)/)?.[1] ?? ''

async function signedWeek(sellContractId: string, personId: string, sunday: string, approvedOn: string) {
  const start = new Date(`${sunday}T00:00:00.000Z`)
  const day = (n: number) => new Date(start.getTime() + n * 86_400_000).toISOString().slice(0, 10)
  const at = new Date(`${approvedOn}T15:00:00.000Z`)
  return prisma.timesheet.create({
    data: {
      sellContractId, personId, periodStart: start, periodEnd: new Date(start.getTime() + 6 * 86_400_000),
      days: { [day(1)]: 8, [day(2)]: 8, [day(3)]: 8, [day(4)]: 8, [day(5)]: 8 }, totalHours: 40,
      status: 'APPROVED', submittedAt: at, clientApprovedAt: at, approvedAt: at,
    },
    select: { id: true },
  })
}

async function billFor(clientId: string, number: string) {
  const msa = await prisma.masterAgreement.findFirstOrThrow({ where: { vendorId: it_.brightmoor, clientId } })
  const engagement = await prisma.engagement.create({ data: { title: `${number} work`, msaId: msa.id }, select: { id: true } })
  const line = await prisma.sellContract.create({
    data: {
      companyId: it_.brightmoor, clientCompanyId: clientId, personId: it_.worker, engagementId: engagement.id,
      billRate: 14500, state: 'IN_PROGRESS', startDate: new Date('2026-09-01T00:00:00.000Z'),
    },
    select: { id: true },
  })
  const w1 = await signedWeek(line.id, it_.worker, '2026-10-04', '2026-10-12')
  const w2 = await signedWeek(line.id, it_.worker, '2026-10-11', '2026-10-19')
  const inv = await prisma.invoice.create({
    data: {
      engagementId: engagement.id, number, currency: 'USD', total: 11600,
      periodStart: new Date('2026-10-01T00:00:00.000Z'), periodEnd: new Date('2026-10-31T00:00:00.000Z'),
      dueAt: new Date('2026-12-15T00:00:00.000Z'), status: 'SUBMITTED', issuedAt: new Date(), submittedAt: new Date(),
      remitToId: it_.remit,
      invoiceLines: {
        create: [w1, w2].map((w) => ({ timesheetId: w.id, sellContractId: line.id, personId: it_.worker, hours: 40, rateCents: 14500, amountCents: 580000 })),
      },
    },
    select: { id: true },
  })
  return { invoiceId: inv.id, weeks: [w1.id, w2.id], line: line.id }
}

describe('a bill reaches the firm that pays it', () => {
  beforeAll(async () => {
    await freshWorld()
    process.env.NEXTAUTH_URL = 'https://etyme.example'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFY_FROM_EMAIL = 'bills@etyme.test'
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body ?? '{}'))
      mail.push({ to: b.to, subject: b.subject, text: b.text })
      return new Response('{}', { status: 200 })
    })

    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })
    it_.owner = owner.id
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    it_.brightmoor = brightmoor.id
    const remit = await prisma.remitTo.create({
      data: { companyId: brightmoor.id, legalName: 'Brightmoor Staffing LLC', addressLines: ['1 Mill Street'], country: 'US', bankName: 'First Harbor Bank', accountLast4: '4421', isDefault: true },
    })
    it_.remit = remit.id

    as(OWNER)
    const listed = await json(await listClient(req('POST', '/api/clients', { name: 'Harrow Lane Foods', contactName: 'Dana Whitfield', email: PAYABLES })))
    expect(listed.status, JSON.stringify(listed.body)).toBe(201)
    it_.harrow = listed.body.data.client.id

    const worker = await prisma.person.create({ data: { name: 'Ines Okafor', primaryEmail: 'ines.okafor@seed.etyme.invalid' } })
    it_.worker = worker.id
    // A firm below Brightmoor, on the record for the same person at a lower
    // rate. Nothing about it may reach the client's page.
    const sub = await prisma.company.create({ data: { name: 'Quietwater Talent', slug: 'quietwater-talent-bill-test', kind: 'VENDOR' }, select: { id: true } })
    await prisma.sellContract.create({
      data: { companyId: sub.id, clientCompanyId: brightmoor.id, personId: worker.id, billRate: 9100, state: 'IN_PROGRESS', startDate: new Date('2026-09-01T00:00:00.000Z') },
    })
    const bill = await billFor(it_.harrow, 'IN-HARROW-202610')
    it_.bill = bill.invoiceId
  }, 300_000)

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('a bill sent to a client not on Etyme is emailed to the person the supplier recorded, with a link that opens the bill and nothing below the supplier’s own rate', async () => {
    const r = await sendBillToCustomer({ invoiceId: it_.bill, byPersonId: it_.owner })
    expect(r).toEqual({ sent: true, to: [PAYABLES], says: `Sent to ${PAYABLES} on ${today()}` })

    expect(mail).toHaveLength(1)
    expect(mail[0].to).toBe(PAYABLES)
    expect(mail[0].subject).toBe('Brightmoor Staffing’s bill IN-HARROW-202610 for Ines Okafor, October 2026: 80 hours, $11,600.00, due Dec 15, 2026')
    expect(mail[0].text).toContain('It is built from 2 weeks Harrow Lane Foods signed.')
    expect(mail[0].text).toContain('Brightmoor Staffing recorded you as the person at Harrow Lane Foods who receives its bills.')
    // Where to pay is on the page, behind the link; no account digits travel in an email.
    expect(mail[0].text).not.toContain('4421')

    const opened = await getBill(tokenIn(mail[0].text))
    expect(opened.status, JSON.stringify(opened.body)).toBe(200)
    const v = opened.body.data
    expect(v.lines.map((l: { rate: string }) => l.rate)).toEqual(['$145/hr', '$145/hr'])
    expect(v.total).toBe('$11,600.00')
    expect(v.due).toBe('Dec 15, 2026')
    expect(v.weeks.map((w: { signed: string }) => w.signed)).toEqual(['Signed Oct 12, 2026', 'Signed Oct 19, 2026'])
    expect(v.remit).toEqual({ payTo: 'Brightmoor Staffing LLC', method: 'ACH bank transfer', bank: 'First Harbor Bank', account: 'ending 4421' })
    expect(v.recordOnEtyme).toBeNull()
    const shown = JSON.stringify(v)
    expect(shown).not.toContain('$91')
    expect(shown).not.toContain('Quietwater')

    expect(await billDeliverySays(it_.bill)).toBe(r.says)
    const event = await prisma.event.findFirstOrThrow({ where: { subjectType: 'Invoice', subjectId: it_.bill, type: 'invoice.submitted' } })
    expect(event).toMatchObject({ companyId: it_.brightmoor, actorPersonId: it_.owner })
  })

  it('a bill is emailed once; sending it again is a separate act by somebody who sends bills', async () => {
    const again = await sendBillToCustomer({ invoiceId: it_.bill, byPersonId: it_.owner })
    expect(again).toEqual({ sent: false, to: [PAYABLES], says: `Sent to ${PAYABLES} on ${today()}` })
    expect(mail).toHaveLength(1)

    // A seat at Brightmoor that does not send bills is told who does.
    const recruiter = await prisma.context.findFirstOrThrow({
      where: { companyId: it_.brightmoor, revokedAt: null, role: { NOT: { permissions: { hasSome: ['invoices.issue', '*'] } } } },
      select: { personId: true },
    })
    const refused = await resendBillToCustomer({ invoiceId: it_.bill, byPersonId: recruiter.personId, companyId: it_.brightmoor })
    expect(refused).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' })
    expect(!refused.ok && refused.says).toMatch(/^Sending a bill again is done by .+ at Brightmoor Staffing/)

    // Another firm cannot send Brightmoor's bill at all.
    const northbend = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const stranger = await resendBillToCustomer({ invoiceId: it_.bill, byPersonId: it_.owner, companyId: northbend.id })
    expect(stranger).toMatchObject({ ok: false, status: 404 })

    // A double press is not a second letter.
    const soon = await resendBillToCustomer({ invoiceId: it_.bill, byPersonId: it_.owner, companyId: it_.brightmoor })
    expect(soon).toMatchObject({ ok: false, status: 409, code: 'JUST_SENT' })
    expect(mail).toHaveLength(1)

    const later = new Date(Date.now() + RESEND_NOT_WITHIN_MS + 60_000)
    const resent = await resendBillToCustomer({ invoiceId: it_.bill, byPersonId: it_.owner, companyId: it_.brightmoor, now: later })
    expect(resent).toMatchObject({ ok: true, sent: true, to: [PAYABLES] })
    expect(mail).toHaveLength(2)
    const logged = await prisma.event.findFirstOrThrow({ where: { subjectType: 'Invoice', subjectId: it_.bill, type: 'invoice.resent' } })
    expect(logged.actorPersonId).toBe(it_.owner)
    expect(await billDeliverySays(it_.bill, later)).toBe(`Sent again to ${PAYABLES} on ${formatDay(later, { year: false })}`)
  })

  it('the bill link opens without a sign-in, is logged as the contact’s read, and dies 90 days after the due date', async () => {
    const token = tokenIn(mail[0].text)
    const read = await prisma.accessLog.findFirstOrThrow({
      where: { subjectId: it_.worker, action: 'TIMESHEET_VIEW', allowed: true, actorCompanyId: it_.harrow },
    })
    expect(read.reason).toContain(`emailed to ${PAYABLES}`)
    expect(read.reason).toContain('Harrow Lane Foods was not on Etyme')

    const closed = await openBillLink(token, new Date('2027-03-15T00:00:01.000Z'))
    expect(closed).toEqual({
      ok: false, status: 410, code: 'LINK_EXPIRED',
      says: 'This link to bill IN-HARROW-202610 ran out on Mar 15, 2027, 90 days after the bill was due. Ask Brightmoor Staffing for a copy.',
    })
    expect(await prisma.accessLog.count({ where: { subjectId: it_.worker, action: 'TIMESHEET_VIEW', allowed: false, actorCompanyId: it_.harrow } })).toBe(1)
    expect((await openBillLink(token, new Date('2027-03-14T23:59:00.000Z'))).ok).toBe(true)

    const forged = await getBill(token.slice(0, -3) + 'abc')
    expect(forged.status).toBe(404)
    expect(forged.body.error.message).toBe('This link is not one of ours, or the bill it named is gone. Ask whoever sent it for a new one.')
  })

  it('a bill sent to a client on Etyme reaches the seats that record payments there, in the app and on their channel, and no stranger is emailed a link', async () => {
    const northbend = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const seeded = await prisma.invoice.findFirstOrThrow({
      where: { invoiceLines: { some: { sellContract: { companyId: it_.brightmoor, clientCompanyId: northbend.id } } } },
      select: { id: true, number: true },
    })
    await prisma.invoice.update({ where: { id: seeded.id }, data: { status: 'SUBMITTED' } })
    const before = mail.length

    const r = await sendBillToCustomer({ invoiceId: seeded.id, byPersonId: it_.owner })
    expect(r.says).toBe(`Sent on Etyme to Northbend Athletic’s AP Clerk on ${today()}`)
    expect(r.to).toEqual(['world-nike-ap@demo.etyme.local'])
    expect(mail.length).toBe(before)

    const ap = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'world-nike-ap@demo.etyme.local' }, select: { id: true } })
    const notice = await prisma.notification.findFirstOrThrow({ where: { personId: ap.id, type: 'INVOICE', entityId: seeded.id } })
    expect(notice.title).toMatch(new RegExp(`^Brightmoor Staffing’s bill ${seeded.number}: \\$`))
    expect(notice.body).not.toMatch(/https?:\/\//)
    expect((notice.data as { href: string }).href).toBe(`/dashboard/invoices/${seeded.id}`)

    // An old link a client on Etyme still holds opens the bill and offers to record it there.
    const opened = await openBillLink(billLinkToken(seeded.id, 'dana.whitfield@northbend.example'))
    expect(opened.ok && opened.view.recordOnEtyme).toBe(`/dashboard/invoices/${seeded.id}`)
  })

  it('a client not on Etyme with nobody recorded is not emailed, and the supplier is told to record the person who receives bills there', async () => {
    as(OWNER)
    const listed = await json(await listClient(req('POST', '/api/clients', { name: 'Quill Street Bakery' })))
    expect(listed.status, JSON.stringify(listed.body)).toBe(201)
    const quill = listed.body.data.client.id
    const bill = await billFor(quill, 'IN-QUILL-202610')
    const before = mail.length

    const r = await sendBillToCustomer({ invoiceId: bill.invoiceId, byPersonId: it_.owner })
    expect(r).toEqual({
      sent: false, to: [],
      says: 'Not sent: Quill Street Bakery is not on Etyme and no address is recorded for it. Record the person there who receives bills, then send it again.',
    })
    expect(mail.length).toBe(before)

    const recorded = await json(await recordContact(req('PATCH', '/api/clients', { clientId: quill, email: 'ap@quill-street.test', contactName: 'Mo Reyes' })))
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200)
    const later = new Date(Date.now() + RESEND_NOT_WITHIN_MS + 60_000)
    const resent = await resendBillToCustomer({ invoiceId: bill.invoiceId, byPersonId: it_.owner, companyId: it_.brightmoor, now: later })
    expect(resent).toMatchObject({ ok: true, sent: true, to: ['ap@quill-street.test'] })
    expect(mail[mail.length - 1].text.split('\n\n')[0]).toBe('Mo,')
  })
})
