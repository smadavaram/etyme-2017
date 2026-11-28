import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'

/**
 * GET and PATCH /api/learn/ranking  { on: boolean }
 *
 * Whether a learner may read her own place within her cohort. The Owner's
 * alone, off by default, and ledgered. It never makes a board public: the
 * learner reads a number and a size, within her own cohort only.
 */
async function owner(caller: NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>) {
  const role = caller.context.roleId ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company!.id }, select: { name: true } }) : null
  return role?.name === 'Owner'
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  const c = await prisma.company.findUnique({ where: { id: caller.company!.id }, select: { learnRankingOn: true } })
  return NextResponse.json({ data: { on: !!c?.learnRankingOn, mayChange: await owner(caller) } })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!(await owner(caller))) return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Whether learners see their place is the Owner’s to say at ${caller.company!.name}.` } }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (typeof body.on !== 'boolean') return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say on or off.', field: 'on' } }, { status: 422 })
  await prisma.company.update({ where: { id: caller.company!.id }, data: { learnRankingOn: body.on } })
  await prisma.automationLog.create({
    data: {
      companyId: caller.company!.id, action: 'LEARN_RANKING_SWITCHED',
      summary: `${caller.person.name}, an Owner, turned the place in the cohort ${body.on ? 'on' : 'off'} for learners.`,
      reason: 'Whether a learner reads her own place is a company setting, off by default. It is read within her own cohort only and is never public.',
      payload: { on: body.on, personId: caller.person.id }, reversible: false,
    },
  })
  return NextResponse.json({ data: { on: body.on } })
}
