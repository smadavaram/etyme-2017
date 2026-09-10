/**
 * Filling in a placement so it has a life to show.
 *
 * The demo workspaces created sell contracts and stopped: no requirement,
 * no buy side, no compliance, no signatures, no invoice. Every screen
 * that lists placements looked fine, because a list only needs a row.
 * The moment one was opened, seven of eight stations read "nothing
 * recorded yet" — which is exactly how a working product comes across as
 * an unfinished one.
 *
 * This completes one placement end to end. It is called once per demo
 * seat, on the placement most worth opening, so there is always at least
 * one person whose whole working life can be walked through.
 *
 * Everything it writes is ordinary production shape — the same rows the
 * award, timesheet and invoice paths write. Nothing here is a fixture the
 * real code would not produce, because a demo that is shaped differently
 * from the product teaches people the wrong thing.
 */

import { prisma } from '@/lib/db'
import { writeCyclesFor } from '@/lib/contract-cycles'

export interface CompleteInput {
  sellContractId: string
  /** The firm supplying the person, and whose cost this is. */
  supplierCompanyId: string
  /** Who is billed. */
  clientCompanyId: string
  personId: string
  /** What the client is billed, in cents. */
  billRateCents: number
  /** What the supplier pays, in cents. Their margin is the difference. */
  payRateCents: number
  /**
   * Somebody at each company, for the "uploaded by" and "signed by"
   * columns. Resolved from whoever holds a seat there when not given, so
   * a call site does not have to go looking.
   */
  supplierPersonId?: string | null
  clientPersonId?: string | null
  /** Weeks of history to lay down. */
  weeks?: number
  /** Where the engagement's invoices hang, when there is one. */
  engagementId?: string | null
}

const day = (from: Date, n: number) => new Date(from.getTime() + n * 86_400_000)

/**
 * Give one placement its buy side, its clearances, its hours and its
 * money. Idempotent: called twice, it adds nothing the second time.
 */
export async function completePlacement(input: CompleteInput): Promise<void> {
  const {
    sellContractId, supplierCompanyId, clientCompanyId, personId,
    billRateCents, payRateCents, weeks = 4, engagementId = null,
  } = input

  // Whoever is there, in order of how well they answer "who did this".
  //
  // Staff first; then anybody with a seat at all; then the person the
  // placement is about. In a demo chain only the visitor's own firm has
  // people, so insisting on staff at the supplier meant four seats out
  // of five recorded no clearances and station five read empty.
  const seatAt = async (companyId: string) =>
    (
      await prisma.context.findFirst({
        where: { companyId, revokedAt: null, NOT: { roleId: null } },
        select: { personId: true },
      })
    )?.personId ??
    (
      await prisma.context.findFirst({
        where: { companyId, revokedAt: null },
        select: { personId: true },
      })
    )?.personId ??
    null

  const supplierPersonId = input.supplierPersonId ?? (await seatAt(supplierCompanyId)) ?? personId
  const clientPersonId = input.clientPersonId ?? (await seatAt(clientCompanyId)) ?? personId

  // ── The other half of the deal ──
  //
  // A placement with a price and no cost reports a hundred per cent
  // margin, which looks like good news and is the kind nobody audits.
  let buy = await prisma.buyContract.findFirst({
    where: { companyId: supplierCompanyId, candidates: { some: { personId } } },
    select: { id: true },
  })

  const sell = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: { startDate: true, endDate: true, billCurrency: true },
  })
  if (!sell) return

  if (!buy) {
    buy = await prisma.buyContract.create({
      data: {
        companyId: supplierCompanyId,
        // The supplier employs them. Null vendor and no purchase order is
        // the correct shape for a W2 placement, not a missing field.
        vendorCompanyId: null,
        contractType: 'W2',
        payCurrency: sell.billCurrency,
        state: 'IN_PROGRESS',
        startDate: sell.startDate,
        endDate: sell.endDate,
      },
      select: { id: true },
    })
    await prisma.buyContractCandidate.create({
      data: {
        buyContractId: buy.id, personId, payRate: payRateCents,
        payCurrency: sell.billCurrency, startDate: sell.startDate, endDate: sell.endDate,
      },
    })
    // Its due dates, on the side each belongs to. Every demo placement
    // opened to a timeline reading "no cycles have been generated",
    // because only the routes wrote them. US_IT: demo firms carry no pack.
    await writeCyclesFor(prisma, {
      sell: { id: sellContractId, startDate: sell.startDate, endDate: sell.endDate },
      buy: { id: buy.id, contractType: 'W2', vendorCompanyId: null },
      packId: 'US_IT',
    })
    await prisma.contractLink.create({
      data: {
        sellContractId, buyContractId: buy.id,
        effectiveFrom: sell.startDate, effectiveTo: sell.endDate,
      },
    })
  }

  // ── How they reached the client, and who met them ──
  //
  // Stations two and three of the placement screen. Without them a
  // placement appears to have arrived from nowhere, which is precisely
  // the flow a demo is supposed to show.
  const contract = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: { requirementId: true },
  })
  if (contract?.requirementId) {
    const already = await prisma.submission.findFirst({
      where: { requirementId: contract.requirementId, personId },
      select: { id: true },
    })
    const submission =
      already ??
      (await prisma.submission.create({
        data: {
          requirementId: contract.requirementId,
          personId,
          fromCompanyId: supplierCompanyId,
          toCompanyId: clientCompanyId,
          // Computed from ownership, never chosen: the supplier employs
          // them, so this is off their own bench.
          kind: 'BENCH',
          rate: billRateCents,
          status: 'PLACED',
          checkState: 'SENT',
          submittedAt: day(sell.startDate, -21),
          decidedAt: day(sell.startDate, -3),
        },
        select: { id: true },
      }))

    const rounds = [
      { round: 1, stage: 'SCREEN', mode: 'PHONE', at: -14, says: 'Passed.' },
      { round: 2, stage: 'TECHNICAL', mode: 'VIDEO', at: -8, says: 'Strong on the close cycle. Offer.' },
    ]
    for (const r of rounds) {
      const has = await prisma.interview.findFirst({
        where: { submissionId: submission.id, round: r.round },
        select: { id: true },
      })
      if (has) continue
      await prisma.interview.create({
        data: {
          submissionId: submission.id,
          companyId: clientCompanyId,
          vendorId: supplierCompanyId,
          round: r.round, stage: r.stage, mode: r.mode, state: 'DONE',
          proposedSlots: [], durationMins: 45,
          scheduledAt: day(sell.startDate, r.at),
          decidedAt: day(sell.startDate, r.at),
          clientConfirmedAt: day(sell.startDate, r.at),
          vendorConfirmedAt: day(sell.startDate, r.at),
          requestedById: clientPersonId,
          decidedById: clientPersonId,
          feedback: r.says,
        },
      })
    }
  }

  // ── Cleared to work ──
  const clearances = [
    { personId, type: 'I9_EVERIFY' as const, provider: 'E-Verify', expiresAt: null },
    { personId, type: 'BACKGROUND_CHECK' as const, provider: 'Sterling', expiresAt: day(new Date(), 300) },
    { companyId: supplierCompanyId, type: 'INSURANCE_GL' as const, provider: 'Hartford', expiresAt: day(new Date(), 240) },
    { companyId: supplierCompanyId, type: 'INSURANCE_WC' as const, provider: 'Hartford', expiresAt: day(new Date(), 240) },
  ]
  for (const c of supplierPersonId ? clearances : []) {
    const where = 'personId' in c ? { personId: c.personId, type: c.type } : { companyId: c.companyId, type: c.type }
    if (await prisma.verification.findFirst({ where, select: { id: true } })) continue
    await prisma.verification.create({
      data: {
        ...c,
        status: 'CLEAR',
        issuedAt: sell.startDate,
        // Uploaded by one person and verified by another, because a
        // clearance somebody checked on themselves is not a control.
        uploadedById: supplierPersonId!,
        verifiedById: clientPersonId,
        verifiedAt: day(sell.startDate, 1),
        result: { outcome: 'CLEAR' },
      },
    })
  }

  // ── The hours, and the two signatures on them ──
  //
  // The client says the work happened; the employer accepts what it will
  // pay for. Two companies, two statements — which is why the ledger has
  // rows rather than the timesheet having columns.
  const anchor = new Date()
  for (let w = weeks; w >= 1; w--) {
    const start = day(anchor, -(w * 7 + 4))
    const end = day(start, 4)
    const days: Record<string, number> = {}
    for (let d = 0; d < 5; d++) days[day(start, d).toISOString().slice(0, 10)] = 8

    const already = await prisma.timesheet.findFirst({
      where: { sellContractId, periodStart: start },
      select: { id: true },
    })
    if (already) continue

    const sheet = await prisma.timesheet.create({
      data: {
        sellContractId, personId, periodStart: start, periodEnd: end,
        days, totalHours: 40, status: 'APPROVED',
        submittedAt: end, approvedAt: day(end, 2),
      },
      select: { id: true },
    })
    await prisma.workAssertion.createMany({
      data: [
        {
          timesheetId: sheet.id, companyId: clientCompanyId, role: 'CLIENT_APPROVAL',
          hours: 40, rateCents: billRateCents, state: 'LIVE', byId: clientPersonId,
        },
        {
          timesheetId: sheet.id, companyId: supplierCompanyId, role: 'EMPLOYER_ACCEPTANCE',
          hours: 40, rateCents: payRateCents, state: 'LIVE', byId: supplierPersonId,
        },
      ],
    })
  }

  // ── The money ──
  //
  // An invoice is raised per engagement, and an engagement hangs off an
  // agreement. Where the caller has neither, they are recorded as the
  // award path records them: the relationship that plainly exists,
  // marked unsigned, rather than the placement having no way to be
  // billed at all.
  let billTo = engagementId
  if (!billTo) {
    const msa =
      (await prisma.masterAgreement.findFirst({
        where: { vendorId: supplierCompanyId, clientId: clientCompanyId },
        select: { id: true },
      })) ??
      (await prisma.masterAgreement.create({
        data: {
          vendorId: supplierCompanyId, clientId: clientCompanyId,
          paymentTerms: 45, currency: sell.billCurrency, signedAt: null,
        },
        select: { id: true },
      }))
    billTo =
      (
        await prisma.engagement.findFirst({ where: { msaId: msa.id }, select: { id: true } })
      )?.id ??
      (
        await prisma.engagement.create({
          data: { msaId: msa.id, title: 'Contingent placement', invoiceCycle: 'MONTHLY' },
          select: { id: true },
        })
      ).id
    await prisma.sellContract.update({
      where: { id: sellContractId },
      data: { engagementId: billTo, msaId: msa.id },
    })
  }
  const billed = await prisma.timesheet.findMany({
    where: { sellContractId, invoiceLines: { none: { sellContractId } } },
    select: { id: true, periodStart: true, periodEnd: true },
    orderBy: { periodStart: 'asc' },
    take: weeks - 1, // the most recent week is still out for approval
  })
  if (billed.length === 0) return

  const amountCents = billed.length * 40 * billRateCents
  const invoice = await prisma.invoice.create({
    data: {
      engagementId: billTo,
      number: `IN-${sellContractId.slice(-6).toUpperCase()}-001`,
      periodStart: billed[0].periodStart,
      periodEnd: billed[billed.length - 1].periodEnd,
      currency: sell.billCurrency,
      total: amountCents / 100,
      paid: amountCents / 100,
      dueAt: day(billed[billed.length - 1].periodEnd, 45),
      issuedAt: day(billed[billed.length - 1].periodEnd, 2),
      status: 'PAID',
    },
    select: { id: true },
  })
  for (const t of billed) {
    await prisma.invoiceLine.create({
      data: {
        invoiceId: invoice.id, timesheetId: t.id, sellContractId, personId,
        hours: 40, rateCents: billRateCents, amountCents: 40 * billRateCents,
      },
    })
  }
  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      payerCompanyId: clientCompanyId,
      receivedByCompanyId: supplierCompanyId,
      amount: amountCents / 100,
      currency: sell.billCurrency,
      method: 'ACH',
      receivedAt: day(billed[billed.length - 1].periodEnd, 40),
      appliedAt: day(billed[billed.length - 1].periodEnd, 40),
    },
  })
}
