import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld, WORLD_SLUGS } from '@/lib/seed-world'

/**
 * The demo world seeds itself and nothing else.
 *
 * On 2026-09-29 the books step timed out on production six calls running.
 * It read every posting, invoice and payment in the database — real firms
 * and every visitor's demo sandbox beside the world — and opened a ledger
 * for any firm with a posting. The postings step signed off every live
 * week in the database through `postAssertion`, the pipeline wrote a CV
 * for every consultant profile and a recorded consent on every live
 * submission, and the payment run went to whichever firm in the database
 * had the most approved bills. On production each of those is a seed
 * writing into a real firm's books or a real person's file.
 *
 * So a firm off the roster is built here with one of everything those
 * steps used to reach — a signed week, a posting, a paid invoice at the
 * front of the numbering, the payment against it, more approved bills
 * than any firm in the world, a live submission and a consultant at an
 * address anybody could own — and the whole world is seeded beside it.
 * Nothing of it may move.
 */

const monday = new Date(Date.UTC(2026, 7, 3))
const friday = new Date(Date.UTC(2026, 7, 7))

let real: {
  client: string; supplier: string; sub: string; person: string
  sell: string; assertion: string; posting: string; invoice: string; submission: string
}

beforeAll(async () => {
  await resetDatabase()

  const client = await prisma.company.create({
    data: { name: 'Harrowgate Freight', slug: 'harrowgate-freight', kind: 'CLIENT', domain: 'harrowgatefreight.com', domainVerified: true },
  })
  const supplier = await prisma.company.create({
    data: { name: 'Tern Staffing', slug: 'tern-staffing', kind: 'VENDOR', domain: 'ternstaffing.com', domainVerified: true },
  })
  const sub = await prisma.company.create({
    data: { name: 'Pell Contract Labor', slug: 'pell-contract-labor', kind: 'VENDOR', domain: 'pellcontractlabor.com', domainVerified: true },
  })
  const person = await prisma.person.create({ data: { name: 'Dana Okoro', primaryEmail: 'dana.okoro@ternstaffing.com' } })
  await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['Freight audit'], location: 'Toledo, OH' } })

  const order = await prisma.workOrder.create({
    data: {
      number: 'HF-PO-0001', issuedById: client.id, issuedToId: supplier.id, recordedById: client.id,
      amount: 100_000, currency: 'USD', status: 'OPEN', startDate: monday,
    },
  })
  const sell = await prisma.sellContract.create({
    data: {
      companyId: supplier.id, clientCompanyId: client.id, personId: person.id,
      billRate: 9_000, startDate: monday, state: 'IN_PROGRESS', workOrderId: order.id,
    },
  })
  const week = await prisma.timesheet.create({
    data: {
      sellContractId: sell.id, personId: person.id, periodStart: monday, periodEnd: friday,
      days: { '2026-08-03': 8, '2026-08-04': 8, '2026-08-05': 8, '2026-08-06': 8, '2026-08-07': 8 },
      totalHours: 40, status: 'APPROVED',
    },
  })
  const assertion = await prisma.workAssertion.create({
    data: { timesheetId: week.id, companyId: client.id, role: 'CLIENT_APPROVAL', hours: 40, rateCents: 9_000, state: 'LIVE' },
  })
  const project = await prisma.projectOrder.create({ data: { companyId: supplier.id, code: 'TS-0001', name: 'Harrowgate Freight' } })
  const posting = await prisma.orderPosting.create({
    data: {
      projectOrderId: project.id, companyId: supplier.id, kind: 'REVENUE',
      amountCents: 360_000, txCurrency: 'USD', txAmountCents: 360_000,
      postedAt: monday, source: 'MANUAL', sourceId: 'tern-first-week', says: '40 hours approved by the client.',
    },
  })
  const engagement = await prisma.engagement.create({ data: { title: 'Freight audit' } })
  // Numbered to sort ahead of every invoice in the world, which is where
  // "the first paid invoice by number" used to find its credit note.
  const invoice = await prisma.invoice.create({
    data: {
      engagementId: engagement.id, number: 'AAA-0001', periodStart: monday, periodEnd: friday,
      currency: 'USD', total: 3_600, paid: 3_600, issuedAt: friday, dueAt: friday, status: 'PAID',
    },
  })
  await prisma.invoiceLine.create({
    data: {
      invoiceId: invoice.id, timesheetId: week.id, sellContractId: sell.id, personId: person.id,
      hours: 40, rateCents: 9_000, amountCents: 360_000, description: 'Week of 3 August',
    },
  })
  await prisma.payment.create({
    data: { amount: 3_600, invoiceId: invoice.id, receivedByCompanyId: supplier.id, payerCompanyId: client.id, appliedAt: friday },
  })
  // More approved, unpaid bills than any firm in the world has.
  await prisma.vendorBill.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      companyId: supplier.id, vendorCompanyId: sub.id, number: `PELL-${1000 + i}`,
      totalCents: 250_000, currency: 'USD', receivedAt: friday, dueAt: friday, status: 'APPROVED',
    })),
  })
  const requirement = await prisma.requirement.create({ data: { companyId: client.id, title: 'Freight auditor', status: 'OPEN' } })
  const submission = await prisma.submission.create({
    data: {
      requirementId: requirement.id, personId: person.id, fromCompanyId: supplier.id, toCompanyId: client.id,
      kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', submittedAt: friday,
    },
  })

  real = {
    client: client.id, supplier: supplier.id, sub: sub.id, person: person.id,
    sell: sell.id, assertion: assertion.id, posting: posting.id, invoice: invoice.id, submission: submission.id,
  }

  await seedWorld()
}, 900_000)

describe('the demo world seeds itself and nothing else', () => {
  it('the firms off the roster really are off it, so the rest of this file tests something', () => {
    expect(WORLD_SLUGS).not.toContain('harrowgate-freight')
    expect(WORLD_SLUGS).not.toContain('tern-staffing')
    expect(WORLD_SLUGS).not.toContain('pell-contract-labor')
  })

  it('a firm off the roster gets no ledger account and no journal entry, though it has a posting, a paid invoice and a receipt', async () => {
    const firms = [real.client, real.supplier, real.sub]
    expect(await prisma.ledgerAccount.count({ where: { companyId: { in: firms } } })).toBe(0)
    expect(await prisma.journalEntry.count({ where: { companyId: { in: firms } } })).toBe(0)
    expect(await prisma.journalEntry.count({ where: { sourceId: { in: [real.posting, real.invoice] } } })).toBe(0)
  })

  it('none of that firm’s signed weeks is posted by the seed: its one posting is the one it made', async () => {
    expect(await prisma.orderPosting.count({ where: { sourceId: real.assertion } })).toBe(0)
    expect(await prisma.orderPosting.count({ where: { companyId: real.supplier } })).toBe(1)
    const sell = await prisma.sellContract.findUnique({ where: { id: real.sell }, select: { projectOrderId: true } })
    expect(sell!.projectOrderId).toBeNull()
  })

  it('the seed puts no order on that firm’s invoice, credits none of it and waives no check on it', async () => {
    const invoice = await prisma.invoice.findUnique({ where: { id: real.invoice }, select: { workOrderId: true } })
    expect(invoice!.workOrderId).toBeNull()
    expect(await prisma.creditNote.count({ where: { invoiceId: real.invoice } })).toBe(0)
    expect(await prisma.invoiceMatchOverride.count({ where: { invoiceId: real.invoice } })).toBe(0)
  })

  it('a person at an address anybody could own gets no CV from the seed', async () => {
    expect(await prisma.resume.count({ where: { personId: real.person } })).toBe(0)
  })

  it('a submission from a firm off the roster gets no hold and no consent recorded for it', async () => {
    expect(await prisma.representation.count({ where: { personId: real.person } })).toBe(0)
  })

  it('the firm off the roster with the most approved bills in the database is given no payment run', async () => {
    expect(await prisma.paymentRun.count({ where: { companyId: real.supplier } })).toBe(0)
  })

  it('the world’s own books are still written: every posting on the roster has its entry, and every entry balances', async () => {
    const world = await prisma.company.findMany({ where: { slug: { in: [...WORLD_SLUGS] } }, select: { id: true } })
    const ids = world.map((c) => c.id)
    const postings = await prisma.orderPosting.findMany({ where: { companyId: { in: ids } }, select: { id: true } })
    expect(postings.length).toBeGreaterThan(0)
    const booked = await prisma.journalEntry.count({ where: { sourceId: { in: postings.map((p) => p.id) } } })
    expect(booked).toBe(postings.length)
    const lopsided = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM (
         SELECT e.id FROM "JournalEntry" e LEFT JOIN "JournalLine" l ON l."entryId" = e.id
         GROUP BY e.id HAVING count(l.id) = 0 OR sum(l."debitCents") <> sum(l."creditCents")
       ) x`
    )) as { n: number }[]
    expect(lopsided[0].n).toBe(0)
    expect(await prisma.creditNote.count()).toBe(1)
    expect(await prisma.paymentRun.count()).toBe(1)
  })
})
