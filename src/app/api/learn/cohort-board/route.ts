import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { readBoards } from '@/lib/training/progress/read'

/**
 * GET /api/learn/cohort-board
 *
 * The mentor's board: each cohort's learners by points, weeks in a row and
 * badges. Whoever develops the bench here reads every cohort; a trainer
 * reads only her own. A learner is never offered this: a staff seat only.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  const all = hasPermission(caller.permissions, 'consultants.write')
  return NextResponse.json({ data: await readBoards(caller.company!.id, all ? {} : { trainerPersonId: caller.person.id }, new Date()) })
}
