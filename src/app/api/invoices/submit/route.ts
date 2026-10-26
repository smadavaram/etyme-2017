import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { announceRaised, mayBeSent, maySendBills, markSent } from '@/lib/money/bill-send'
import { sendBillToCustomer } from '@/lib/notify/bill-delivery'

/**
 * POST /api/invoices/submit
 *
 * Bulk send: each bill, raised or drafted, sent exactly as the single
 * Submit button sends it — the firm's own bills only, through the
 * three-way check, a draft raised as it goes.
 *
 * Body: { invoiceIds: string[] }
 *
 * A bill that is not ours, already sent, or failing the check is skipped
 * with its own sentence and never sent (release walk, 2026-10-18: this
 * route used to move any ISSUED bill by id, with no check at all).
 *
 * Returns a summary with submitted/skipped/error counts and per-invoice results.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Sending a bill', needs: 'invoices.issue', kind: caller.company?.kind, companyName: caller.company?.name }) } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { invoiceIds } = body

  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'invoiceIds must be a non-empty array', field: 'invoiceIds' } },
      { status: 422 }
    )
  }

  // Cap bulk operations at a reasonable size
  if (invoiceIds.length > 100) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Cannot submit more than 100 bills at once', field: 'invoiceIds' } },
      { status: 422 }
    )
  }

  const companyId = caller.company?.id ?? null
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'A bill is between two companies, and your seat is not at one.' } },
      { status: 404 }
    )
  }

  let submitted = 0
  let skipped = 0
  let errors = 0
  const results: Array<{
    invoiceId: string
    number: string | null
    status: 'submitted' | 'skipped' | 'not_found'
    reason?: string
    /** Whom a sent bill reached, in the Bills page's sentence; null where delivery failed. */
    delivery?: string | null
    checks?: { reason: string }[]
  }> = []

  // One bill at a time, each through the same door as the Submit button
  // and a yes in Ask Etyme (`lib/money/bill-send`): ours, sendable, and
  // through the three-way check. A bill that fails is skipped with its own
  // sentence and never sent; the others go. Each in its own transaction,
  // so one bill's failure does not hold the rest back.
  //
  // Who sends first, before the check writes anything: a bill Ask Etyme
  // drafted on the caller's authority is sent by another seat that sends
  // bills, wherever one exists (`maySendBills`).
  const asked = [...new Set(invoiceIds.filter((x: unknown): x is string => typeof x === 'string'))]
  const senders = await maySendBills({ personId: caller.person.id, companyId, permissions: caller.permissions }, asked)
  for (const invoiceId of asked) {
    try {
      const who = senders.get(invoiceId)
      if (who && !who.ok) {
        skipped++
        results.push({ invoiceId, number: null, status: 'skipped', reason: who.says })
        continue
      }
      const check = await mayBeSent(invoiceId, companyId, ['ISSUED', 'DRAFT'])
      if (!check.ok) {
        if (check.status === 404) errors++
        else skipped++
        results.push({
          invoiceId,
          number: null,
          status: check.status === 404 ? 'not_found' : 'skipped',
          reason: check.says,
          ...(check.checks ? { checks: check.checks } : {}),
        })
        continue
      }
      const sent = await prisma.$transaction((tx) =>
        markSent(tx, { invoiceId, companyId, by: { personId: caller.person.id, name: caller.person.name } })
      )
      if (sent.raised) await announceRaised(invoiceId, companyId, { personId: caller.person.id })
      // Each bill to the firm that pays it, after its own transaction, the
      // same call as the single Send (lib/notify/bill-delivery). A delivery
      // that fails leaves the bill sent and says so on the row.
      const delivered = await sendBillToCustomer({ invoiceId, byPersonId: caller.person.id }).catch((err) => {
        void reportError('bill-delivery', err, { companyId }).catch(() => {})
        return null
      })
      submitted++
      results.push({ invoiceId, number: sent.number, status: 'submitted', delivery: delivered?.says ?? null, ...(sent.payerNotice.why ? { payerNotice: sent.payerNotice.why } : {}) })
    } catch (err: any) {
      if (err instanceof Error && err.message.startsWith('ALREADY_MOVED')) {
        skipped++
        results.push({ invoiceId, number: null, status: 'skipped', reason: 'This bill was sent a moment ago by somebody else.' })
        continue
      }
      reportError('Bulk invoice submission failed:', err)
      return NextResponse.json(
        { error: { code: 'INTERNAL', message: `The bills could not all be sent: ${submitted} went before the failure.` } },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    data: {
      submitted,
      skipped,
      errors,
      results,
    },
  })
}
