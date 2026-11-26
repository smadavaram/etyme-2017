import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { pluginGate } from '@/lib/plugin-gate'
import { podStaffOnly, podWriteRefusal } from '@/lib/pods/caller'
import { startRule } from '@/lib/pods'

type Ctx = { params: Promise<{ id: string; deliverableId: string }> }

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status })

/**
 * POST /api/pods/projects/[id]/deliverables/[deliverableId]/start
 *
 * The supplier says work on a deliverable has begun. It sets `startedAt`
 * once, and only while the milestone is still planned; the client then
 * reads "In progress". The seat, the plugin and the write permission are
 * asked first, as on every route of project teams. Writes nothing else.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = podStaffOnly(caller)
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'PODS')
  if (off) return off
  const refused = await podWriteRefusal(caller, request.nextUrl.pathname)
  if (refused) return refused

  const { id, deliverableId } = await params
  const d = await prisma.podDeliverable.findFirst({
    where: { id: deliverableId, podProjectId: id, podProject: { pod: { companyId: caller.company!.id } } },
    select: { id: true, startedAt: true, milestone: { select: { name: true, status: true } } },
  })
  if (!d) return fail(404, 'NOT_FOUND', 'That deliverable is not on a project of yours.')
  const no = startRule(d.milestone, d.startedAt)
  if (no) return fail(409, 'NOT_PLANNED', no)
  // Set once: a second press, or a delivery in between, changes nothing.
  const set = await prisma.podDeliverable.updateMany({ where: { id: d.id, startedAt: null, milestone: { status: 'PENDING' } }, data: { startedAt: new Date() } })
  if (set.count === 0) return fail(409, 'NOT_PLANNED', 'That deliverable is already marked started.')
  return NextResponse.json({ data: { says: `${d.milestone.name} is marked started.` } })
}
