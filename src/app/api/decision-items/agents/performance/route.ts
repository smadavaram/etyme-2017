import { NextRequest, NextResponse } from 'next/server'
import { recordRefusal } from '@/lib/access-log'
import { PERIODS, type Period } from '@/lib/skills/performance'
import { readPanel } from '@/lib/skills/performance-read'
import { queueSeat, refused } from '../../door'

/**
 * GET /api/decision-items/agents/performance?period=DAY|WEEK|MONTH
 *
 * Planned, Actual, Target, Variance, Var % and Completion % for each skill
 * and each agent over a day, the company's Sunday to Saturday week, or a
 * month (records 123, 125). Read by the Owner and Admins; any other seat is
 * refused in a sentence, logged first. One company's book only. Every
 * figure is a number, a dash or a label; no price or charge is in it.
 */

export const PERFORMANCE_READERS = 'The performance panel is read by the firm’s Owner and Admins.'

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!seat.ownerOrAdmin) {
    await recordRefusal([{ companyId: seat.companyId }], { actorPersonId: seat.personId, actorCompanyId: seat.companyId, action: 'CONTRACT_VIEW', reason: 'Refused the agent performance panel to a seat that is not an Owner or Admin.' })
    return refused(403, PERFORMANCE_READERS)
  }
  const asked = request.nextUrl.searchParams.get('period') ?? 'WEEK'
  if (!PERIODS.includes(asked as Period)) return refused(422, 'Choose Day, Week or Month.', 'period')
  return NextResponse.json({ data: await readPanel(seat.companyId, asked as Period) })
}
