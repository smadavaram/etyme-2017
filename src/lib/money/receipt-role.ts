/**
 * What this reader may do to an invoice receipt, with the sentence where
 * they may not — read once, from the same answers the routes refuse on:
 * recording and cancelling (`mayRecordSupplierInvoice`), waiving
 * (`waiveDesk`), paying (`payments.record`, or the seat's role where a
 * client seated the reader). No database.
 */

import { hasPermission, askTheDesk } from '@/lib/permissions'
import { mayRecordSupplierInvoice, NOT_THE_PAYING_DESK } from '@/lib/money/desks'
import { waiveDesk } from '@/lib/money/pay-desk'
import { seatMayPay, seatedRefusal, type Books } from '@/lib/money/seated-books'
import type { ReaderRole } from '@/lib/money/receipt-screen'
import type { CompanyKind } from '@/lib/company-defaults'

export function receiptRole(reading: Books): ReaderRole {
  const perms = reading.caller.permissions
  const seat = reading.seat
  const waive = waiveDesk({
    permissions: perms,
    direction: 'PAYABLE',
    companyKind: reading.companyKind as CompanyKind,
    companyName: reading.companyName,
    seat: seat ? { clientName: seat.clientCompany.name, roleName: seat.role.name } : null,
  })
  const mayPay = hasPermission(perms, 'payments.record')
  const seated = seat ? seatMayPay(seat) : null
  const mayRecord = mayRecordSupplierInvoice(perms)
  return {
    mayRecord,
    recordSays: mayRecord ? null : seat ? seatedRefusal(seat, 'Recording what a supplier has invoiced') : NOT_THE_PAYING_DESK,
    mayWaive: waive.mayWaive,
    waiveSays: waive.mayWaive ? null : waive.says,
    mayPay,
    paySays: mayPay
      ? null
      : seated && !seated.ok
        ? seated.says
        : askTheDesk({ doing: 'Recording a payment', needs: 'payments.record', kind: reading.companyKind, companyName: reading.companyName }),
  }
}
