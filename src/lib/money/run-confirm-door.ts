import { getCallerContext, realPersonId } from '@/lib/api-context'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'
import { prisma } from '@/lib/db'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { confirmRun, readConfirmBody, type RunLineFacts } from '@/lib/money/run-confirm'
import { recordKeyedPayment } from '@/lib/money/keyed-payment'
import { logPaymentRefused } from '@/lib/money/payment-refused'
import { paymentReference } from '@/lib/money/run-file'
import { tellPaidOrReport, toldSays } from '@/lib/money/paid-notice'
import { reportError } from '@/lib/alerts'
import { remittanceAdvice } from '@/lib/ap-delay'

/**
 * The confirmation from the payer's own system, as one function the
 * payment-runs route and the invoice-lines answer both call, so there is
 * one way to mark a receipt paid from a confirmation (Layer 9, slice 3).
 * Moved unchanged from the payment-runs route; it returns the status and
 * the body and the route wraps them.
 */
type CallerCtx = NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>

export async function confirmRunPayments(
  caller: CallerCtx,
  companyId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const read = readConfirmBody(body)
  if (!read.ok) {
    return { status: 422, body: { error: { code: 'VALIDATION', message: read.says, field: read.field } } }
  }
  const personId = realPersonId(caller)
  if (!personId) {
    return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'A payment is recorded by a person, and this request names none.' } } }
  }
  const payerName = caller.company!.name

  let runCurrency = ''
  // The supplier is told the moment its line commits, line by line, so a
  // failure on a later line never leaves an earlier payment untold: a
  // retry refuses that line as already paid and would never tell it.
  const told = new Map<string, number>()
  const paidAts: Date[] = []
  // A receipt the payment gate refuses today, read once per line.
  const gateRefused = new Map<string, { says: string; code: string }>()
  const lineOf = new Map<string, { billId: string; number: string }>()
  let result: Awaited<ReturnType<typeof confirmRun>>
  try {
    result = await confirmRun(
      {
        ownerGate: async () => {
          const g = await needsVerifiedOwnerAt(companyId, 'PAY')
          return g.ok ? { ok: true } : { ok: false, says: g.says, href: g.href }
        },
        loadRun: async () => {
          const run = await prisma.paymentRun.findUnique({
            where: { id: read.runId },
            select: {
              id: true, companyId: true, status: true, currency: true,
              items: {
                select: {
                  id: true, amountCents: true,
                  vendorBill: {
                    select: {
                      id: true, number: true, currency: true, totalCents: true, paidCents: true, status: true,
                      receivedAt: true, vendorCompanyId: true, vendorCompany: { select: { name: true } },
                    },
                  },
                },
                orderBy: { id: 'asc' },
              },
            },
          })
          if (!run || run.companyId !== companyId) return null
          runCurrency = run.currency
          for (const i of run.items) lineOf.set(paymentReference(i.id), { billId: i.vendorBill.id, number: i.vendorBill.number })
          const lines: RunLineFacts[] = run.items.map((i) => ({
            runItemId: i.id,
            billId: i.vendorBill.id,
            number: i.vendorBill.number,
            vendorName: i.vendorBill.vendorCompany.name,
            vendorCompanyId: i.vendorBill.vendorCompanyId,
            amountCents: i.amountCents,
            currency: i.vendorBill.currency,
            totalCents: i.vendorBill.totalCents,
            paidCents: i.vendorBill.paidCents,
            status: i.vendorBill.status,
            receivedAt: i.vendorBill.receivedAt,
          }))
          return { id: run.id, status: run.status, currency: run.currency, lines }
        },
        gateSays: async (billId) => {
          const gate = await mayPayKeyedReceipt(billId, personId)
          if (!gate) return 'This invoice receipt could not be read, so it is not marked paid.'
          if (!gate.ok) gateRefused.set(billId, { says: gate.says, code: gate.code })
          return gate.ok ? null : gate.says
        },
        pay: async (row) => {
          const out = await prisma.$transaction((tx) =>
            recordKeyedPayment(tx, {
              billId: row.billId,
              payerCompanyId: companyId,
              payerName,
              vendorCompanyId: row.vendorCompanyId,
              vendorName: row.vendorName,
              number: row.number,
              currency: row.currency,
              amountCents: row.amountCents,
              expectPaidCents: row.expectPaidCents,
              paidAt: row.paidAt,
              payerReference: row.payerReference,
              etymeReference: paymentReference(row.runItemId),
              runId: read.runId,
              appliedById: personId,
              appliedByName: caller.person.name,
            })
          )
          if (out.ok) {
            paidAts.push(row.paidAt)
            told.set(out.paymentId, await tellPaidOrReport(out.notice, 'a payment run line paid'))
          }
          return out
        },
      },
      read.by === 'FILE' ? { by: 'FILE', csv: read.csv } : { by: 'TYPED', reference: read.reference, paidOn: read.paidOn }
    )
  } finally {
    // The run is paid once every line in it is, even where a later line
    // failed: what committed is on the run.
    if (paidAts.length > 0) {
      const left = await prisma.paymentRunItem.count({
        where: { runId: read.runId, vendorBill: { status: { notIn: ['PAID', 'CANCELLED'] } } },
      })
      if (left === 0) {
        const last = paidAts.reduce((d, x) => (x > d ? x : d), paidAts[0])
        const flipped = await prisma.paymentRun.updateMany({ where: { id: read.runId, status: 'APPROVED' }, data: { status: 'PAID', paidAt: last } })
        // The advice kept on each line is what the supplier is sent: it
        // now says the day the confirmation paid, not the scheduled day.
        if (flipped.count === 1) {
          await rewriteAdvice(read.runId, last, payerName).catch((e) => reportError('Rewriting a paid run’s remittance advice', e))
        }
      }
    }
  }

  if (!result.ok) {
    if (result.code === 'OWNER_NOT_VERIFIED') {
      await logPaymentRefused({ companyId, byPersonId: personId, door: 'RUN_CONFIRM', why: 'OWNER_NOT_VERIFIED', says: result.says, runId: read.runId })
    }
    return { status: result.status, body: { error: { code: result.code, message: result.says, ...(result.href ? { href: result.href } : {}) } } }
  }

  // A row the payment gate refused (the three-way check or the bank) is
  // kept before the answer goes; a row refused for its own figures is the
  // file being read, and the one write keeps its own refusals.
  for (const r of result.refused) {
    const line = r.reference ? lineOf.get(r.reference) : undefined
    const gate = line ? gateRefused.get(line.billId) : undefined
    if (!line || !gate || !r.says.endsWith(gate.says)) continue
    await logPaymentRefused({
      companyId, byPersonId: personId, door: 'RUN_CONFIRM',
      why: gate.code === 'BANK_NOT_CHECKED' ? 'BANK_NOT_CHECKED' : 'MATCH_FAILED',
      says: r.says, vendorBillId: line.billId, runId: read.runId, number: line.number,
    })
  }

  return {
    status: 200,
    body: {
    data: {
      runId: read.runId,
      currency: runCurrency,
      paid: result.paid.map((p) => ({
        reference: paymentReference(p.runItemId), number: p.number, vendorName: p.vendorName,
        amountMinor: p.amountCents, currency: p.currency, paidOn: p.paidAt.toISOString().slice(0, 10),
        payerReference: p.payerReference, paymentId: p.paymentId,
        suppliersTold: told.get(p.paymentId) ?? 0,
      })),
      refused: result.refused,
      says:
        result.says +
        (result.paid.length > 0
          ? ` ${toldSays(result.paid.map((p) => ({ vendorName: p.vendorName, told: told.get(p.paymentId) ?? 0 })))}`
          : ''),
    },
    },
  }
}

// ── A paid run's advice ───────────────────────────────────────────────

type RunWithItems = {
  currency: string
  scheduledFor: Date
  paidAt: Date | null
  items: {
    vendorBillId: string
    amountCents: number
    vendorBill: { number: string; dueAt: Date; vendorCompany: { id: string; name: string } }
  }[]
}

/** The advice's input for a run, dated by its confirmation where it paid. */
export function paidRunAdvice(run: RunWithItems) {
  return {
    currency: run.currency,
    scheduledFor: run.scheduledFor,
    paidOn: run.paidAt,
    lines: run.items.map((i) => ({
      billId: i.vendorBillId,
      billNumber: i.vendorBill.number,
      vendorCompanyId: i.vendorBill.vendorCompany.id,
      vendorName: i.vendorBill.vendorCompany.name,
      amountCents: i.amountCents,
      dueAt: i.vendorBill.dueAt,
    })),
  }
}

/** Each line's kept advice, written again once the run is confirmed paid. */
async function rewriteAdvice(runId: string, paidOn: Date, payerName: string) {
  const run = await prisma.paymentRun.findUnique({
    where: { id: runId },
    select: {
      currency: true, scheduledFor: true, paidAt: true,
      items: {
        select: {
          id: true, vendorBillId: true, amountCents: true,
          vendorBill: { select: { number: true, dueAt: true, vendorCompany: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  if (!run) return
  const advice = remittanceAdvice({ ...paidRunAdvice(run), paidOn }, payerName)
  const byVendor = new Map(advice.map((a) => [a.vendorCompanyId, a.text]))
  for (const i of run.items) {
    const text = byVendor.get(i.vendorBill.vendorCompany.id)
    if (text) await prisma.paymentRunItem.update({ where: { id: i.id }, data: { remittance: text } })
  }
}
