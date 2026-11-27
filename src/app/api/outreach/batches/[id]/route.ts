import { outreachNotYours } from '@/lib/outreach/rules-of-access'
import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { queueSeat, refused } from '../../../decision-items/door'
import { batchView } from '@/lib/outreach/batch'
import { OUTREACH_SETTINGS_HREF } from '@/lib/agents/tasks'

/**
 * GET /api/outreach/batches/:id  one batch, counted per contact
 *
 * Sent and bounced are counted from the mail sent; interested and
 * unsubscribed from the letters. There is no open rate, because Etyme
 * puts no tracking in a letter. Only this firm's own batches.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  // The permission the menu link names, read here; then the one rule that also refuses a client.
  if (!hasPermission(seat.caller.permissions, 'vendors.read')) return refused(403, outreachNotYours(seat.caller)!)
  const notYours = outreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  const { id } = await params
  const view = await batchView(seat.companyId, id)
  if (!view) return refused(404, 'That batch is not one of this firm’s.')
  // Only the Owner may turn Outreach on, so only the Owner is shown the way to it.
  return NextResponse.json({ data: { ...view, pausedHref: view.paused && seat.roleName === 'Owner' ? OUTREACH_SETTINGS_HREF : null } })
}
