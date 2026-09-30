import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { DEFAULT_ACCOUNTS } from '@/lib/gl'
import { CLEANUP_KINDS, CLEANUP_PHRASE, SEED_CREDIT_NOTE, SEED_MATCH_OVERRIDE, planCleanup } from '@/lib/seed-cleanup'
import { POST as cleanup } from '@/app/api/seed-world/cleanup/route'

/**
 * Taking back what earlier seeds wrote outside the demo world.
 *
 * The world is seeded, and beside it a real firm and a real visitor who
 * carry one row of every kind the old seeds wrote — each with the seed's
 * marker — and, beside each, a row of the same kind without it. Only the
 * marked rows outside the world may go; everything the world holds and
 * everything unmarked stays, down to the id.
 */

const SECRET = 'cleanup-test-secret'
const MODELS = [
  'verificationDoc', 'resume', 'journalEntry', 'journalLine', 'ledgerAccount', 'paymentRun', 'paymentRunItem',
  'creditNote', 'invoiceMatchOverride', 'visaPetition', 'visaEvent', 'visaDocument',
] as const
type Snapshot = Record<(typeof MODELS)[number], Set<string>>

async function snapshot(): Promise<Snapshot> {
  const out = {} as Snapshot
  for (const m of MODELS) {
    const rows = await (prisma as any)[m].findMany({ select: { id: true } })
    out[m] = new Set(rows.map((r: { id: string }) => r.id))
  }
  return out
}

const post = (body: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  cleanup(req('POST', '/api/seed-world/cleanup', body, auth ? { authorization: auth } : {})).then(json)

const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const DAY = 86_400_000

/** The rows the test made, marked and not. */
const marked: Record<string, string[]> = {}
const unmarked: Record<string, string[]> = {}
const mark = (k: string, id: string) => (marked[k] ??= []).push(id)
const keep = (k: string, id: string) => (unmarked[k] ??= []).push(id)

let emptyWorldPlan: Awaited<ReturnType<typeof planCleanup>>
let before: Snapshot
let heldResume = ''
let heldEntry = ''

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET
  await resetDatabase()
  await seedWorld()
  emptyWorldPlan = await planCleanup()

  // ── A real firm, a real supplier under it, and a real visitor ──────
  const firm = await prisma.company.create({
    data: { name: 'Harrowgate Freight', slug: 'harrowgate-freight', kind: 'VENDOR', domain: 'harrowgatefreight.com', domainVerified: true },
  })
  const client = await prisma.company.create({
    data: { name: 'Tern Logistics', slug: 'tern-logistics', kind: 'CLIENT', domain: 'ternlogistics.com', domainVerified: true },
  })
  const sub = await prisma.company.create({
    data: { name: 'Pell Contract Labor', slug: 'pell-contract-labor', kind: 'VENDOR', domain: 'pellcontractlabor.com', domainVerified: true },
  })
  const owner = await prisma.person.create({ data: { name: 'Dana Okoro', primaryEmail: 'dana@harrowgatefreight.com' } })
  await prisma.context.create({ data: { personId: owner.id, companyId: firm.id, type: 'EMPLOYEE', grantReason: 'Founder' } })
  const visitor = await prisma.person.create({ data: { name: 'Maya Lindqvist', primaryEmail: 'maya.lindqvist@gmail.com' } })

  // Verification files.
  const check = await prisma.verification.create({ data: { personId: visitor.id, type: 'I9_EVERIFY', status: 'CLEAR', uploadedById: owner.id } })
  mark('verificationDoc', (await prisma.verificationDoc.create({
    data: { verificationId: check.id, fileName: 'maya-i9.pdf', fileUrl: `/files/verifications/${check.id}/maya-i9.pdf`, fileHash: `seed:${check.id}` },
  })).id)
  keep('verificationDoc', (await prisma.verificationDoc.create({
    data: { verificationId: check.id, fileName: 'i9-signed.pdf', fileUrl: '/files/real/i9-signed.pdf', fileHash: 'a3f1c9e0b7d24e5f8a61c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3' },
  })).id)

  // CVs: the seed's, one the visitor wrote, and a seed CV a submission went out with.
  const seedCv = (name: string) =>
    `${name}\nFreight audit — Toledo, OH\n\nSkills: Freight audit, Rate negotiation\nWork authorization: USC\n\n` +
    'Experience\nContract assignments delivering Freight audit and Rate negotiation work for enterprise clients.\n'
  mark('resume', (await prisma.resume.create({
    data: { personId: visitor.id, label: 'Freight audit 2026', fileName: 'maya-lindqvist-cv.pdf', contentType: 'application/pdf', sizeBytes: 200, textExtract: seedCv('Maya Lindqvist'), currentKey: visitor.id },
  })).id)
  keep('resume', (await prisma.resume.create({
    data: {
      personId: visitor.id, label: 'My CV', fileName: 'maya-lindqvist-cv.pdf', contentType: 'application/pdf', sizeBytes: 900,
      textExtract: 'Maya Lindqvist\nLogistics analyst\n\nExperience\nContract assignments delivering freight audits for three carriers.\n',
    },
  })).id)
  const sent = await prisma.resume.create({
    data: { personId: owner.id, label: 'Freight audit 2026', fileName: 'dana-okoro-cv.pdf', contentType: 'application/pdf', sizeBytes: 200, textExtract: seedCv('Dana Okoro') },
  })
  heldResume = sent.id
  keep('resume', sent.id)
  const requirement = await prisma.requirement.create({ data: { companyId: client.id, title: 'Freight auditor', status: 'OPEN' } })
  await prisma.submission.create({
    data: {
      requirementId: requirement.id, personId: owner.id, fromCompanyId: firm.id, toCompanyId: client.id,
      kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', resumeId: sent.id,
    },
  })

  // Books: the seed's chart, an entry keyed on a posting, and one typed by hand.
  await prisma.ledgerAccount.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({ companyId: firm.id, code: a.code, name: a.name, type: a.type as never, normalSide: a.normalSide as never })),
  })
  const accounts = await prisma.ledgerAccount.findMany({ where: { companyId: firm.id }, orderBy: { code: 'asc' } })
  const [a1, a2, a3] = accounts
  const project = await prisma.projectOrder.create({ data: { companyId: firm.id, code: 'HF-0001', name: 'Tern Logistics' } })
  const posting = await prisma.orderPosting.create({
    data: {
      projectOrderId: project.id, companyId: firm.id, kind: 'REVENUE', amountCents: 360_000, txCurrency: 'USD', txAmountCents: 360_000,
      postedAt: new Date('2026-08-07T00:00:00Z'), source: 'MANUAL', sourceId: 'hf-first-week', says: '40 hours approved by the client.',
    },
  })
  const seeded = await prisma.journalEntry.create({
    data: {
      companyId: firm.id, postedAt: posting.postedAt, source: 'MANUAL', sourceId: posting.id, memo: '40 hours approved by the client.',
      lines: { create: [
        { accountId: a1.id, debitCents: 360_000, creditCents: 0, currency: 'USD' },
        { accountId: a2.id, debitCents: 0, creditCents: 360_000, currency: 'USD' },
      ] },
    },
    include: { lines: true },
  })
  mark('journalEntry', seeded.id)
  seeded.lines.forEach((l) => mark('journalLine', l.id))
  const typed = await prisma.journalEntry.create({
    data: {
      companyId: firm.id, postedAt: new Date('2026-08-31T00:00:00Z'), source: 'MANUAL', sourceId: 'hf-accrual-august', memo: 'August accrual',
      lines: { create: [
        { accountId: a3.id, debitCents: 5_000, creditCents: 0, currency: 'USD' },
        { accountId: a2.id, debitCents: 0, creditCents: 5_000, currency: 'USD' },
      ] },
    },
    include: { lines: true },
  })
  heldEntry = typed.id
  keep('journalEntry', typed.id)
  typed.lines.forEach((l) => keep('journalLine', l.id))
  // Every account the typed entry uses stays; every other default account goes.
  for (const a of accounts) (a.id === a2.id || a.id === a3.id ? keep : mark)('ledgerAccount', a.id)

  // A payment run the seed's way, and one raised the product's way.
  const bills = await Promise.all([0, 1].map((i) =>
    prisma.vendorBill.create({
      data: { companyId: firm.id, vendorCompanyId: sub.id, number: `PELL-${1000 + i}`, totalCents: 250_000, currency: 'USD', receivedAt: new Date(), dueAt: new Date(), status: 'APPROVED' },
    })
  ))
  const born = midnight(new Date(Date.now() - DAY))
  const seededRun = await prisma.paymentRun.create({
    data: {
      companyId: firm.id, currency: 'USD', status: 'APPROVED', scheduledFor: new Date(+born + 4 * DAY), totalCents: 250_000,
      createdById: owner.id, approvedById: owner.id, createdAt: born,
      items: { create: [{ vendorBillId: bills[0].id, amountCents: 250_000, remittance: 'PELL-1000 — Pell Contract Labor' }] },
    },
    include: { items: true },
  })
  mark('paymentRun', seededRun.id)
  mark('paymentRunItem', seededRun.items[0].id)
  const realRun = await prisma.paymentRun.create({
    data: {
      companyId: firm.id, currency: 'USD', status: 'DRAFT', scheduledFor: new Date(Date.now() + 3 * DAY), totalCents: 250_000, createdById: owner.id,
      items: { create: [{ vendorBillId: bills[1].id, amountCents: 250_000, remittance: 'Harrowgate Freight pays PELL-1001' }] },
    },
    include: { items: true },
  })
  keep('paymentRun', realRun.id)
  keep('paymentRunItem', realRun.items[0].id)

  // A paid invoice of the real firm's, credited and waived the seed's way and a person's way.
  const sell = await prisma.sellContract.create({
    data: { companyId: firm.id, clientCompanyId: client.id, personId: owner.id, billRate: 9_000, startDate: new Date('2026-08-03T00:00:00Z'), state: 'IN_PROGRESS' },
  })
  const engagement = await prisma.engagement.create({ data: { title: 'Freight audit' } })
  const invoice = await prisma.invoice.create({
    data: {
      engagementId: engagement.id, number: 'AAA-0001', periodStart: new Date('2026-08-03T00:00:00Z'), periodEnd: new Date('2026-08-07T00:00:00Z'),
      currency: 'USD', total: 3_600, paid: 3_600, status: 'PAID', dueAt: new Date('2026-09-06T00:00:00Z'),
      invoiceLines: { create: [{ sellContractId: sell.id, personId: owner.id, hours: 40, rateCents: 9_000, amountCents: 360_000, description: 'Week of 3 August' }] },
    },
  })
  mark('creditNote', (await prisma.creditNote.create({
    data: { invoiceId: invoice.id, amount: 360, reasonCode: 'HOURS_DISPUTED', note: SEED_CREDIT_NOTE, createdById: owner.id },
  })).id)
  keep('creditNote', (await prisma.creditNote.create({
    data: { invoiceId: invoice.id, amount: 90, reasonCode: 'HOURS_DISPUTED', note: 'One hour billed twice on the Tuesday.', createdById: owner.id },
  })).id)
  mark('invoiceMatchOverride', (await prisma.invoiceMatchOverride.create({
    data: { invoiceId: invoice.id, code: 'QUANTITY', reason: SEED_MATCH_OVERRIDE, byId: owner.id, invoiceTotalCentsAtOverride: 360_000 },
  })).id)
  keep('invoiceMatchOverride', (await prisma.invoiceMatchOverride.create({
    data: { invoiceId: invoice.id, code: 'PRICE', reason: 'Rate agreed on the phone before the order caught up.', byId: owner.id, invoiceTotalCentsAtOverride: 360_000 },
  })).id)

  // A visa petition walked the seed's way, and one the visitor's firm filed.
  const petition = await prisma.visaPetition.create({
    data: { personId: visitor.id, type: 'H1B', country: 'US', status: 'ACTIVE', transferOk: true },
  })
  mark('visaPetition', petition.id)
  mark('visaEvent', (await prisma.visaEvent.create({ data: { petitionId: petition.id, eventType: 'FILED', occurredAt: new Date(), notes: 'Filed with premium processing.' } })).id)
  for (const [docType, f] of [['LCA', 'lca-certified.pdf'], ['I797', 'i797-approval-notice.pdf'], ['VISA_STAMP', 'visa-stamp.jpg']]) {
    mark('visaDocument', (await prisma.visaDocument.create({ data: { petitionId: petition.id, docType, fileName: f, fileUrl: `/files/visas/${petition.id}/${f}` } })).id)
  }
  const filed = await prisma.visaPetition.create({ data: { personId: visitor.id, type: 'H1B', country: 'US', status: 'FILED' } })
  keep('visaPetition', filed.id)
  keep('visaEvent', (await prisma.visaEvent.create({ data: { petitionId: filed.id, eventType: 'FILED', occurredAt: new Date(), notes: 'Filed with premium processing.' } })).id)
  keep('visaDocument', (await prisma.visaDocument.create({ data: { petitionId: filed.id, docType: 'I797', fileName: 'i797-approval-notice.pdf', fileUrl: '/uploads/maya/i797.pdf' } })).id)

  before = await snapshot()
}, 900_000)

afterAll(() => {
  delete process.env.CRON_SECRET
})

describe('taking back what earlier seeds wrote outside the demo world', () => {
  it('on the seeded world alone there is nothing to take back', () => {
    expect(emptyWorldPlan.total).toBe(0)
    expect(emptyWorldPlan.says).toBe('Nothing a seed wrote is left outside the demo world.')
  })

  it('refuses without the deployment secret, and reads nothing', async () => {
    const r = await post({ dryRun: true }, null)
    expect(r.status).toBe(401)
    expect(r.body.error.message).toContain('needs the CRON_SECRET')
    expect((await post({ dryRun: true }, 'Bearer not-it')).status).toBe(401)
  })

  it('refuses a body that is neither a dry run nor the typed phrase, and deletes nothing', async () => {
    const r = await post({ confirm: 'yes' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain(CLEANUP_PHRASE)
    expect(await snapshot()).toEqual(before)
  })

  it('the dry run lists only the marked rows outside the demo world, and touches nothing', async () => {
    const r = await post({ dryRun: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const plan = r.body.data
    expect(plan.dryRun).toBe(true)
    const listed = (k: string) => [...plan.kinds[k].ids].sort()
    expect(listed('verificationFiles')).toEqual([...marked.verificationDoc].sort())
    expect(listed('resumes')).toEqual([...marked.resume].sort())
    expect(listed('journalEntries')).toEqual([...marked.journalEntry].sort())
    expect(listed('ledgerAccounts')).toEqual([...marked.ledgerAccount].sort())
    expect(listed('paymentRuns')).toEqual([...marked.paymentRun].sort())
    expect(listed('creditNotes')).toEqual([...marked.creditNote].sort())
    expect(listed('matchOverrides')).toEqual([...marked.invoiceMatchOverride].sort())
    expect(listed('visaPetitions')).toEqual([...marked.visaPetition].sort())
    expect([...plan.dependents.journalLines].sort()).toEqual([...marked.journalLine].sort())
    expect([...plan.dependents.paymentRunItems].sort()).toEqual([...marked.paymentRunItem].sort())
    expect([...plan.dependents.visaEvents].sort()).toEqual([...marked.visaEvent].sort())
    expect([...plan.dependents.visaDocuments].sort()).toEqual([...marked.visaDocument].sort())
    expect(await snapshot()).toEqual(before)
  })

  it('keeps a seeded CV a submission went out with, and says why', async () => {
    const plan = await planCleanup()
    expect(plan.kinds.resumes.held).toEqual([
      { id: heldResume, why: 'A submission went out with this CV (1), and a client may have read it.' },
    ])
    expect(plan.kinds.journalEntries.held.map((h) => h.id)).toEqual([heldEntry])
  })

  it('the run deletes exactly the rows the plan listed, and every demo row and every unmarked real row is untouched', async () => {
    const r = await post({ confirm: CLEANUP_PHRASE })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const expected = Object.values(marked).reduce((n, ids) => n + ids.length, 0)
    expect(r.body.data.deleted).toBe(expected)

    const after = await snapshot()
    const models: Record<string, (typeof MODELS)[number]> = {
      verificationDoc: 'verificationDoc', resume: 'resume', journalEntry: 'journalEntry', journalLine: 'journalLine',
      ledgerAccount: 'ledgerAccount', paymentRun: 'paymentRun', paymentRunItem: 'paymentRunItem', creditNote: 'creditNote',
      invoiceMatchOverride: 'invoiceMatchOverride', visaPetition: 'visaPetition', visaEvent: 'visaEvent', visaDocument: 'visaDocument',
    }
    for (const m of MODELS) {
      const gone = new Set(marked[m] ?? [])
      const want = [...before[m]].filter((id) => !gone.has(id)).sort()
      expect([...after[m]].sort(), m).toEqual(want)
    }
    for (const [k, ids] of Object.entries(unmarked)) {
      for (const id of ids) expect(after[models[k]].has(id), `${k} ${id}`).toBe(true)
    }
    // Never a person, never a company.
    expect(await prisma.person.count({ where: { primaryEmail: 'maya.lindqvist@gmail.com' } })).toBe(1)
    expect(await prisma.company.count({ where: { slug: 'harrowgate-freight' } })).toBe(1)
  })

  it('writes one automation row with a plain reason, and says it cannot be undone', async () => {
    const logs = await prisma.automationLog.findMany({ where: { action: 'SEED_ROWS_CLEANED' } })
    expect(logs).toHaveLength(1)
    expect(logs[0].reversible).toBe(false)
    expect(logs[0].companyId).toBeNull()
    expect(logs[0].reason).toContain('Only rows carrying the seed’s own marker and belonging to a real person or firm were deleted.')
    expect((logs[0].payload as any).ids.paymentRuns).toEqual(marked.paymentRun)
  })

  it('a second run finds nothing to take back', async () => {
    const plan = await planCleanup()
    expect(CLEANUP_KINDS.every((k) => plan.kinds[k].ids.length === 0)).toBe(true)
    expect(plan.total).toBe(0)
    const r = await post({ confirm: CLEANUP_PHRASE })
    expect(r.status).toBe(200)
    expect(r.body.data.deleted).toBe(0)
    expect(await prisma.automationLog.count({ where: { action: 'SEED_ROWS_CLEANED' } })).toBe(1)
  })
})
