import { prisma } from '@/lib/db'
import { accessActor, recordAccess } from '@/lib/access-log'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { runFile, type RunFile, type RunFileLine } from '@/lib/money/run-file'

/**
 * Read an approved payment run for its file, and record the read.
 *
 * `GET /api/ap/payment-runs?export=<run>` calls this after it has asked
 * who the caller is and whether they may release the run
 * (`payments.record`). Here: the run is this company's, it is approved,
 * every line is put through the payment gate as it stands today
 * (`mayPayKeyedReceipt`, bank included), and the pay-to details on record
 * are read as the bank name, the account name and the last four digits.
 *
 * Every firm whose pay-to details go into the file is recorded in the
 * access log before the file is handed over, one row per firm.
 */

export type RunFileRead =
  | { ok: true; runId: string; file: RunFile }
  | { ok: false; status: 404 | 422; code: 'NOT_FOUND' | 'NOT_APPROVED'; says: string }

type Caller = Parameters<typeof accessActor>[0]

export async function readRunFile(caller: Caller, companyId: string, runId: string): Promise<RunFileRead> {
  const run = await prisma.paymentRun.findUnique({
    where: { id: runId },
    select: {
      id: true, companyId: true, status: true, currency: true, scheduledFor: true,
      items: {
        select: {
          id: true, amountCents: true,
          vendorBill: {
            select: {
              id: true, number: true, currency: true, totalCents: true, paidCents: true, dueAt: true,
              vendorCompanyId: true,
              vendorCompany: { select: { name: true } },
              workOrder: { select: { number: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  })
  if (!run || run.companyId !== companyId) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such payment run here' }
  }
  if (run.status !== 'APPROVED') {
    return {
      ok: false, status: 422, code: 'NOT_APPROVED',
      says:
        run.status === 'DRAFT'
          ? 'This run is a draft. Somebody other than whoever assembled it approves it first; then it can be downloaded for your payment system.'
          : `This run is ${run.status.toLowerCase()}, so there is nothing in it to send to your payment system.`,
    }
  }

  // The pay-to details on record: the checked ones, the default first.
  const vendorIds = [...new Set(run.items.map((i) => i.vendorBill.vendorCompanyId))]
  const remits = await prisma.remitTo.findMany({
    where: { companyId: { in: vendorIds }, verifiedAt: { not: null } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { companyId: true, bankName: true, accountName: true, legalName: true, accountLast4: true },
  })
  const bankOf = new Map<string, RunFileLine['bank']>()
  for (const r of remits) {
    if (!bankOf.has(r.companyId)) {
      bankOf.set(r.companyId, { bankName: r.bankName, accountName: r.accountName ?? r.legalName, accountLast4: r.accountLast4 })
    }
  }

  const lines: RunFileLine[] = []
  for (const i of run.items) {
    const b = i.vendorBill
    const gate = await mayPayKeyedReceipt(b.id)
    lines.push({
      runItemId: i.id,
      billId: b.id,
      number: b.number,
      vendorName: b.vendorCompany.name,
      orderNumber: b.workOrder?.number ?? null,
      amountCents: i.amountCents,
      owedCents: b.totalCents - b.paidCents,
      currency: b.currency,
      dueAt: b.dueAt,
      bank: bankOf.get(b.vendorCompanyId) ?? null,
      gate: gate == null
        ? { ok: false, says: `${b.vendorCompany.name}’s invoice ${b.number} could not be read, so it is left out.` }
        : gate.ok ? { ok: true } : { ok: false, says: gate.says },
    })
  }

  const file = runFile(run, lines)

  const heldIds = new Set(file.held.map((h) => h.runItemId))
  const inFile = [...new Set(run.items.filter((i) => !heldIds.has(i.id)).map((i) => i.vendorBill.vendorCompanyId))]
  await recordAccess(
    inFile.map((id) => ({ companyId: id })),
    {
      ...accessActor(caller),
      action: 'CONTRACT_VIEW',
      reason:
        `Downloaded payment run ${run.id} for the payer's own payment system: the bank name, the account ` +
        `name and the last four digits of each supplier paid in it.`,
    }
  )

  return { ok: true, runId: run.id, file }
}
