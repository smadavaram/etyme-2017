import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { accessActor, recordRefusal } from '@/lib/access-log'
import { podMarginReadRefusal, podStaffOnly } from '@/lib/pods/caller'
import { mayReadCut } from '@/lib/money/profit-cut'
import { marginReachFor } from '@/lib/money/margin-reach'
import { readPodVariance } from '@/lib/pods/variance-read'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/pods/projects/[id]/variance   planned versus actual on a sold team (record 123)
 *
 * The schedule (PV, EV, SV, SPI, and each deliverable's planned date, actual
 * date and days of variance) goes to a seat that reads jobs or margin. The
 * cost (AC, CV, CPI) goes only to a seat that may read margin, over lines
 * its reach covers. A client is never served. A figure the record cannot
 * support is null with its reason, never a zero.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = podStaffOnly(caller)
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'PODS')
  if (off) return off
  const refused = await podMarginReadRefusal(caller, request.nextUrl.pathname)
  if (refused) return refused

  const clientSays = mayReadCut({ kind: caller.company?.kind })
  if (clientSays) {
    await recordRefusal([{ companyId: caller.company!.id }], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: `Refused a sold team's plan against actual: ${clientSays}` })
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: clientSays } }, { status: 403 })
  }

  const reach = await marginReachFor(caller)
  const { id } = await params
  const read = await readPodVariance(
    { companyId: caller.company!.id, personId: caller.person.id, readsJobs: hasPermission(caller.permissions, 'requirements.read'), readsMargin: hasPermission(caller.permissions, 'margin.read') || hasPermission(caller.permissions, 'pnl.read') },
    reach, id
  )
  if (!read.ok) {
    if (read.status === 403) await recordRefusal([{ companyId: caller.company!.id }], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: `Refused a sold team's plan against actual: ${read.says}` })
    return NextResponse.json({ error: { code: read.status === 403 ? 'FORBIDDEN' : 'NOT_FOUND', message: read.says } }, { status: read.status })
  }
  return NextResponse.json({ data: { podProjectId: read.podProjectId, variance: read.variance, costSays: read.costSays } })
}
