import { prisma } from '@/lib/db'
import { accessActor, recordAccess, recordRefusal } from '@/lib/access-log'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { splitIsPayers } from '@/lib/money/coding-reader'
import {
  receiptFile, pickColumns,
  type ReceiptFile, type ReceiptIn, type ReceiptLineIn, type CodeShare,
} from '@/lib/money/receipt-file'

/**
 * Read an approved payment run for the client's file of invoice lines, and
 * record the read.
 *
 * `GET /api/ap/receipts-file?run=<id>` calls this after it has asked who
 * the caller is, whose books the request is on, and whether that seat may
 * release the run (`payments.record`).
 *
 * Which receipts: the ones in an approved payment run. The run is the one
 * place a second person has already said yes to releasing them (nobody
 * approves their own run), every item is fixed at the amount the run was
 * assembled to pay, and nothing yet records a receipt as "sent", so a
 * file of "approved and not yet sent" would have nothing to stand on until
 * slice 2 keeps a message per file. A run may be downloaded twice today;
 * slice 2 is where that stops.
 *
 * Which codes: the client's own, read the way the coding route reads them
 * (`ContractCostAllocation` on the sell line the week was filed on, or on
 * the client's own line further up a chain), and only where every cost
 * center in the split is the payer's own (`splitIsPayers`). Nothing is
 * guessed for a line that has none.
 *
 * Every receipt is put through the payment gate as it stands today. No
 * bank detail is read at all.
 *
 * Refused reads are written to the access log before the refusal is sent;
 * a read that succeeds writes one row for each person on the lines.
 */

export type ReceiptFileRead =
  | { ok: true; runId: string; file: ReceiptFile }
  | { ok: false; status: 404 | 422; code: 'NOT_FOUND' | 'NOT_APPROVED' | 'BAD_COLUMNS'; says: string }

type Caller = Parameters<typeof accessActor>[0]

const CONTRACT_SELECT = {
  id: true,
  clientCompanyId: true,
  costAllocations: {
    select: {
      shareBps: true,
      glAccount: true,
      internalOrder: { select: { code: true } },
      costCenter: { select: { id: true, code: true, glAccount: true, companyId: true } },
    },
  },
} as const

type ContractRead = {
  id: string
  clientCompanyId: string
  costAllocations: {
    shareBps: number
    glAccount: string | null
    internalOrder: { code: string } | null
    costCenter: { id: string; code: string; glAccount: string | null; companyId: string }
  }[]
}

/** The payer's own split on the first contract that has one. */
function sharesOf(candidates: ContractRead[], payerId: string): CodeShare[] {
  for (const c of candidates) {
    if (c.clientCompanyId !== payerId) continue
    if (!splitIsPayers(c.costAllocations, payerId)) continue
    return c.costAllocations.map((a) => ({
      key: a.costCenter.id,
      costObjectType: a.internalOrder ? 'INTERNAL_ORDER' : 'COST_CENTER',
      costObject: a.internalOrder ? a.internalOrder.code : a.costCenter.code,
      glAccount: a.glAccount ?? a.costCenter.glAccount,
      shareBps: a.shareBps,
    }))
  }
  return []
}

export async function readReceiptFile(
  caller: Caller,
  companyId: string,
  runId: string,
  columns: readonly string[] | null,
): Promise<ReceiptFileRead> {
  const actor = accessActor(caller)
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
              periodStart: true, periodEnd: true, buyContractId: true, workOrderId: true,
              vendorCompanyId: true,
              vendorCompany: { select: { name: true } },
              workOrder: { select: { number: true } },
              lines: {
                select: {
                  id: true, personId: true, timesheetId: true, hours: true, rateCents: true, amountCents: true,
                  person: { select: { name: true } },
                  timesheet: {
                    select: {
                      id: true, periodStart: true, periodEnd: true,
                      clientApprovedById: true, clientApprovedAt: true, autoApproved: true,
                      sellContract: { select: CONTRACT_SELECT },
                      weekApprovals: {
                        select: {
                          approverName: true, outcome: true, how: true, approvedOn: true, usedAt: true, createdAt: true,
                          contracts: { orderBy: { position: 'asc' }, select: { sellContract: { select: CONTRACT_SELECT } } },
                        },
                        orderBy: { createdAt: 'asc' },
                      },
                    },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!run || run.companyId !== companyId) {
    // Written before the refusal is sent. A run that is somebody else's is
    // answered exactly as one that does not exist.
    await recordRefusal([{ companyId: run?.companyId ?? companyId }], {
      ...actor,
      action: 'CONTRACT_VIEW',
      reason: `Refused the invoice lines of payment run ${runId}: the run is not the books the reader is on.`,
    })
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such payment run here' }
  }
  if (run.status !== 'APPROVED') {
    return {
      ok: false, status: 422, code: 'NOT_APPROVED',
      says:
        run.status === 'DRAFT'
          ? 'This run is a draft. Somebody other than whoever assembled it approves it first; then its lines can be downloaded for your system.'
          : `This run is ${run.status.toLowerCase()}, so there is nothing in it to send to your system.`,
    }
  }
  const picked = pickColumns(columns)
  if (!picked.ok) return { ok: false, status: 422, code: 'BAD_COLUMNS', says: picked.says }

  // Who approved each week, by name, in one read.
  const approverIds = new Set<string>()
  for (const i of run.items) for (const l of i.vendorBill.lines) {
    if (l.timesheet?.clientApprovedById) approverIds.add(l.timesheet.clientApprovedById)
  }
  const people = approverIds.size
    ? await prisma.person.findMany({ where: { id: { in: [...approverIds] } }, select: { id: true, name: true } })
    : []
  const nameOf = new Map(people.map((p) => [p.id, p.name]))

  const receipts: ReceiptIn[] = []
  for (const i of run.items) {
    const b = i.vendorBill
    const gate = await mayPayKeyedReceipt(b.id)

    // A line with no week behind it (an expense or a milestone) is coded
    // through the client's own line on the same order for the same person.
    const needsOrderLine = b.workOrderId != null && b.lines.some((l) => !l.timesheet && l.personId)
    const byPerson = new Map<string, ContractRead[]>()
    if (needsOrderLine) {
      const found = await prisma.sellContract.findMany({
        where: { workOrderId: b.workOrderId!, clientCompanyId: companyId },
        select: { ...CONTRACT_SELECT, personId: true },
      })
      for (const c of found) byPerson.set(c.personId, [...(byPerson.get(c.personId) ?? []), c])
    }

    const lines: ReceiptLineIn[] = b.lines.map((l) => {
      const t = l.timesheet
      const candidates: ContractRead[] = t
        ? [t.sellContract, ...t.weekApprovals.flatMap((w) => w.contracts.map((c) => c.sellContract))]
        : l.personId ? byPerson.get(l.personId) ?? [] : []

      const signedBy = t?.weekApprovals.find((w) => w.outcome === 'APPROVED' || w.how === 'EVIDENCE')
      const approver = !t ? null
        : t.clientApprovedById ? nameOf.get(t.clientApprovedById) ?? null
        : t.autoApproved ? 'Approved when the time limit ran out'
        : signedBy?.approverName ?? null
      const approvedOn = !t ? null
        : t.clientApprovedAt ?? (signedBy ? signedBy.approvedOn ?? signedBy.usedAt ?? signedBy.createdAt : null)

      return {
        id: l.id,
        personId: l.personId,
        person: l.person?.name ?? null,
        periodStart: t?.periodStart ?? b.periodStart,
        periodEnd: t?.periodEnd ?? b.periodEnd,
        signedWeek: t?.id ?? null,
        approver,
        approvedOn,
        hours: l.hours == null ? null : Number(l.hours.toString()),
        rateCents: l.rateCents,
        amountCents: l.amountCents,
        shares: sharesOf(candidates, companyId),
      }
    })

    receipts.push({
      runItemId: i.id,
      billId: b.id,
      number: b.number,
      vendorId: b.vendorCompanyId,
      vendorName: b.vendorCompany.name,
      orderNumber: b.workOrder?.number ?? null,
      orderLineId: b.buyContractId,
      amountCents: i.amountCents,
      owedCents: b.totalCents - b.paidCents,
      currency: b.currency,
      dueAt: b.dueAt,
      gate: gate == null
        ? { ok: false, says: `${b.vendorCompany.name}’s invoice ${b.number} could not be read, so it is left out.` }
        : gate.ok ? { ok: true } : { ok: false, says: gate.says },
      lines,
    })
  }

  const file = receiptFile(run, receipts, picked.ids)

  // One row for each person on the lines, written before the file leaves.
  await recordAccess(
    file.personIds.map((personId) => ({ personId })),
    {
      ...actor,
      action: 'CONTRACT_VIEW',
      reason:
        `Downloaded the invoice lines of payment run ${run.id} for the payer's own system: ` +
        `the person, the week, the hours and the amount on each line, in the payer's own codes.`,
    },
  )

  return { ok: true, runId: run.id, file }
}
