import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { outreachNotYours } from '@/lib/outreach/rules-of-access'
import { refused, type QueueSeat } from '../decision-items/door'

/**
 * Who may use the advanced-outreach routes (record 135): a seat at a firm that
 * sells, holding the permission the Companies, Outreach link names. A client
 * buys and sends none. The route has already resolved the seat through
 * `queueSeat`; this answers with the one sentence where it may not.
 */
export function outreachNo(seat: QueueSeat): NextResponse | null {
  if (!hasPermission(seat.caller.permissions, 'vendors.read')) return refused(403, outreachNotYours(seat.caller)!)
  const notYours = outreachNotYours(seat.caller)
  return notYours ? refused(403, notYours) : null
}
