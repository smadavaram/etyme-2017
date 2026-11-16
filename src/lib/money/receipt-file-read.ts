import { prisma } from '@/lib/db'
import { accessActor, recordAccess, recordRefusal } from '@/lib/access-log'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { splitIsPayers } from '@/lib/money/coding-reader'
import {
  receiptFile, pickColumns,
  type ReceiptFile, type ReceiptIn, type ReceiptLineIn, type CodeShare,
} from '@/lib/money/receipt-file'
import { costObjectTypeOf, codingBlock, vendorNumberFor, poLineNumber, savedColumns } from '@/lib/money/client-codes'
import { mayGoInFile, feedKey, nextGeneration, stateInWords, standingOfRows, type FeedMessageRead } from '@/lib/money/bill-feed'
import { formatDay } from '@/lib/format-date'
import { Prisma } from '@prisma/client'

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
      createdAt: true,
      internalOrder: { select: { code: true, kind: true } },
      costCenter: { select: { id: true, code: true, glAccount: true, companyId: true, profitCenter: true } },
    },
  },
} as const

type ContractRead = {
  id: string
  clientCompanyId: string
  costAllocations: {
    shareBps: number
    glAccount: string | null
    createdAt: Date
    internalOrder: { code: string; kind: string | null } | null
    costCenter: { id: string; code: string; glAccount: string | null; companyId: string; profitCenter: string | null }
  }[]
}

/** The payer's own split on the first contract that has one. */
function sharesOf(candidates: ContractRead[], payerId: string): CodeShare[] {
  for (const c of candidates) {
    if (c.clientCompanyId !== payerId) continue
    if (!splitIsPayers(c.costAllocations, payerId)) continue
    return c.costAllocations.map((a) => ({
      key: a.costCenter.id,
      costObjectType: costObjectTypeOf({ internalOrder: a.internalOrder }),
      costObject: a.internalOrder ? a.internalOrder.code : a.costCenter.code,
      glAccount: a.glAccount ?? a.costCenter.glAccount,
      profitCenter: codingBlock(null, a.costCenter).profitCenter,
      shareBps: a.shareBps,
    }))
  }
  return []
}

type Loaded =
  | { ok: true; run: { id: string; currency: string; scheduledFor: Date }; receipts: ReceiptIn[] }
  | Extract<ReceiptFileRead, { ok: false }>

/** An approved run's receipts as the file builder reads them, with the client's own codes. */
export async function loadRunReceipts(
  caller: Caller,
  companyId: string,
  runId: string,
  /** A paid run is read too where the answer is. */
  statuses: readonly string[] = ['APPROVED'],
): Promise<Loaded> {
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
              id: true, number: true, currency: true, totalCents: true, paidCents: true, dueAt: true, updatedAt: true,
              periodStart: true, periodEnd: true, buyContractId: true, workOrderId: true,
              vendorCompanyId: true,
              vendorCompany: { select: { name: true } },
              workOrder: { select: { number: true, buyContracts: { select: { id: true, createdAt: true } } } },
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
  if (!statuses.includes(run.status)) {
    return {
      ok: false, status: 422, code: 'NOT_APPROVED',
      says:
        run.status === 'DRAFT'
          ? 'This run is a draft. Somebody other than whoever assembled it approves it first; then its lines can be downloaded for your system.'
          : `This run is ${run.status.toLowerCase()}, so there is nothing in it to send to your system.`,
    }
  }
  // Who approved each week, by name, in one read.
  const approverIds = new Set<string>()
  for (const i of run.items) for (const l of i.vendorBill.lines) {
    if (l.timesheet?.clientApprovedById) approverIds.add(l.timesheet.clientApprovedById)
  }
  const people = approverIds.size
    ? await prisma.person.findMany({ where: { id: { in: [...approverIds] } }, select: { id: true, name: true } })
    : []
  const nameOf = new Map(people.map((p) => [p.id, p.name]))

  const [register, coding] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId, otherCompanyId: { in: [...new Set(run.items.map((i) => i.vendorBill.vendorCompanyId))] } },
      select: { companyId: true, otherCompanyId: true, relationship: true, vendorNumber: true },
    }),
    prisma.companyCoding.findUnique({ where: { companyId }, select: { companyCode: true } }),
  ])
  const companyCode = codingBlock(coding, null).companyCode

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
        poLine: poLineNumber(b.workOrder?.buyContracts ?? [], b.buyContractId),
        // A line is fixed when its receipt changes or a code is added to a contract it bills.
        fixedAt: candidates
          .flatMap((c) => c.costAllocations.map((a) => a.createdAt))
          .reduce<Date>((d, x) => (x > d ? x : d), b.updatedAt),
      }
    })

    receipts.push({
      runItemId: i.id,
      billId: b.id,
      number: b.number,
      vendorId: b.vendorCompanyId,
      vendorName: b.vendorCompany.name,
      vendorNumber: vendorNumberFor(register, companyId, b.vendorCompanyId),
      companyCode,
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

  return { ok: true, run, receipts }
}

// ── The file is a message (Layer 9, slice 2) ──────────────────────────
//
// A download writes one OUT message per row, SENT, keyed by run, line,
// share, direction and generation, in the same transaction that reads
// what was sent before. If the write fails, the request fails and no
// bytes leave. A line already sent, accepted or paid is not in the next
// file; a rejected or failed line is held until it is fixed, and then
// goes again as the next generation while the old message is marked
// SUPERSEDED. Two requests at one moment make one message per row: the
// second finds the unique key taken and serves the same rows.

type Msg = FeedMessageRead & {
  id: string; lineId: string | null; shareKey: string; reason: string | null
  externalRef: string | null; answeredAt: Date | null; sentAt: Date | null
}

const MESSAGE_SELECT = {
  id: true, lineId: true, shareKey: true, direction: true, state: true, reason: true,
  externalRef: true, answeredAt: true, sentAt: true, createdAt: true,
} as const

const rowKeyOf = (m: { lineId: string | null; shareKey: string }) => `${m.lineId ?? ''}:${m.shareKey}`

function groupByRow(msgs: readonly Msg[]): Map<string, Msg[]> {
  const by = new Map<string, Msg[]>()
  for (const m of msgs) by.set(rowKeyOf(m), [...(by.get(rowKeyOf(m)) ?? []), m])
  return by
}

/** What each row of a run's lines is, given what was sent before. */
function rowStateFor(
  run: { id: string },
  by: Map<string, Msg[]>,
  serve: ReadonlySet<string>,
  opts: { lineId?: string; resend?: boolean },
) {
  return (r: ReceiptIn, l: ReceiptLineIn, rowId: string) => {
    if (serve.has(rowId)) return null
    if (opts.lineId && l.id !== opts.lineId) return { kind: 'SKIP' as const, says: '' }
    const ms = by.get(rowId) ?? []
    const stands = standingMessageOf(ms)
    if (opts.resend || opts.lineId) {
      if (!stands || (stands.state !== 'REJECTED' && stands.state !== 'FAILED')) return { kind: 'SKIP' as const, says: '' }
    }
    const verdict = mayGoInFile(ms, l.fixedAt ?? null)
    if (verdict.ok) return null
    const what = l.person ? `${l.person}’s line` : 'A line'
    if (stands && (stands.state === 'REJECTED' || stands.state === 'FAILED')) {
      const why = stands.state === 'REJECTED' ? `rejected${stands.reason ? `: ${stands.reason}` : ''}` : `not delivered${stands.reason ? `: ${stands.reason}` : ''}`
      return {
        kind: 'HELD' as const,
        says: `${what} on ${r.vendorName}’s invoice ${r.number} was ${why}. It has not been changed since. Fix it, then send it again.`,
      }
    }
    const out = ms.filter((m) => m.direction === 'OUT' && m.state !== 'SUPERSEDED').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const when = out ? formatDay(out.sentAt ?? out.createdAt) : 'an earlier day'
    return { kind: 'SENT' as const, says: `${what} on ${r.vendorName}’s invoice ${r.number} was already sent on ${when}, file ${run.id.slice(-6)}.` }
  }
}

function standingMessageOf(ms: readonly Msg[]): Msg | null {
  const live = ms.filter((m) => m.state !== 'SUPERSEDED')
  if (live.length === 0) return null
  const rank: Record<string, number> = { QUEUED: 1, FAILED: 2, REJECTED: 3, SENT: 4, ACCEPTED: 5, PAID: 6 }
  return [...live].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || rank[a.state] - rank[b.state])[live.length - 1]
}

export async function readReceiptFile(
  caller: Caller,
  companyId: string,
  runId: string,
  columns: readonly string[] | null,
  opts: { lineId?: string; resend?: boolean } = {},
): Promise<ReceiptFileRead> {
  const loaded = await loadRunReceipts(caller, companyId, runId)
  if (!loaded.ok) return loaded
  const { run, receipts } = loaded

  const coding = await prisma.companyCoding.findUnique({ where: { companyId }, select: { fileColumns: true } })
  const picked = pickColumns(columns && columns.length > 0 ? columns : savedColumns(coding?.fileColumns))
  if (!picked.ok) return { ok: false, status: 422, code: 'BAD_COLUMNS', says: picked.says }

  const attempted = new Set<string>()
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const msgs = (await tx.billFeedMessage.findMany({ where: { runId: run.id, companyId }, select: MESSAGE_SELECT })) as Msg[]
      const by = groupByRow(msgs)
      const file = receiptFile(run, receipts, picked.ids, rowStateFor(run, by, new Set(), opts))
      const data = file.items.map((row) => {
        const ms = by.get(row.rowId) ?? []
        attempted.add(row.rowId)
        return {
          companyId, runId: run.id, vendorBillId: row.billId, lineId: row.lineId, shareKey: row.shareKey,
          direction: 'OUT', state: 'SENT', sentAt: new Date(),
          idempotencyKey: feedKey({ runId: run.id, lineId: row.lineId, shareKey: row.shareKey, direction: 'OUT', generation: nextGeneration(ms, 'OUT') }),
          attempts: nextGeneration(ms, 'OUT'),
        }
      })
      if (data.length > 0) {
        await tx.billFeedMessage.createMany({ data })
        const old = file.items.flatMap((row) => (by.get(row.rowId) ?? []).filter((m) => m.state !== 'SUPERSEDED').map((m) => m.id))
        if (old.length > 0) await tx.billFeedMessage.updateMany({ where: { id: { in: old } }, data: { state: 'SUPERSEDED' } })
      }
      return file
    })

  let file: ReceiptFile
  try {
    file = await attempt()
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e
    // Another request made these messages a moment ago: serve the same rows.
    const msgs = (await prisma.billFeedMessage.findMany({ where: { runId: run.id, companyId }, select: MESSAGE_SELECT })) as Msg[]
    file = receiptFile(run, receipts, picked.ids, rowStateFor(run, groupByRow(msgs), attempted, opts))
  }

  // One row for each person on the lines, written before the file leaves.
  await recordAccess(
    file.personIds.map((personId) => ({ personId })),
    {
      ...accessActor(caller),
      action: 'CONTRACT_VIEW',
      reason:
        `Downloaded the invoice lines of payment run ${run.id} for the payer's own system: ` +
        `the person, the week, the hours and the amount on each line, in the payer's own codes.`,
    },
  )
  return { ok: true, runId: run.id, file }
}

// ── What each line says, for the page ─────────────────────────────────

export interface LineStateRow {
  billId: string
  number: string
  vendorName: string
  lineId: string
  person: string | null
  amountCents: number
  currency: string
  /** NOT_SENT · SENT · ACCEPTED · REJECTED · PAID · FAILED */
  state: string
  /** The line's state in the client's words. */
  says: string
  /** True where the line may be sent again now: rejected or failed, and fixed. */
  canSendAgain: boolean
}

export async function readLineStates(
  caller: Caller,
  companyId: string,
  runId: string,
): Promise<{ ok: true; lines: LineStateRow[] } | Extract<ReceiptFileRead, { ok: false }>> {
  const loaded = await loadRunReceipts(caller, companyId, runId, ['APPROVED', 'PAID'])
  if (!loaded.ok) return loaded
  const { run, receipts } = loaded
  const msgs = (await prisma.billFeedMessage.findMany({ where: { runId: run.id, companyId }, select: MESSAGE_SELECT })) as Msg[]
  const by = groupByRow(msgs)
  const file = receiptFile(run, receipts, undefined, rowStateFor(run, by, new Set(), {}))
  const out: LineStateRow[] = []
  for (const r of receipts) {
    const receiptWhy = file.held.find((h) => h.billId === r.billId && h.lineId == null)?.says ?? null
    for (const l of r.lines) {
      const rowIds = l.shares.map((s) => `${l.id}:${s.key}`)
      const stands = standingOfRows(rowIds.map((id) => standingMessageOf(by.get(id) ?? [])))
      const why = file.held.find((h) => h.lineId === l.id)?.says ?? receiptWhy
      const canSendAgain =
        !!stands && (stands.state === 'REJECTED' || stands.state === 'FAILED') &&
        rowIds.every((id) => mayGoInFile(by.get(id) ?? [], l.fixedAt ?? null).ok)
      out.push({
        billId: r.billId, number: r.number, vendorName: r.vendorName, lineId: l.id, person: l.person,
        amountCents: l.amountCents, currency: r.currency,
        state: stands ? stands.state : 'NOT_SENT',
        says: stateInWords(stands, why ? why.replace(/^.*? is left out: /, '') : null),
        canSendAgain,
      })
    }
  }
  return { ok: true, lines: out }
}
