import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { accessActor, recordRefusal } from '@/lib/access-log'
import { marginUnknownSays } from '@/lib/pods'
import { podMarginReadRefusal, podStaffOnly } from '@/lib/pods/caller'
import { mayReadCut } from '@/lib/money/profit-cut'
import { marginReachFor, reachSays } from '@/lib/money/margin-reach'
import { readPodMargin } from '@/lib/money/pod-margin-read'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/pods/projects/[id]/margin   what a sold team has earned so far, on the accepted deliverables
 *
 * The order of the gates: the seat, the plugin, the team caller, a client
 * (never served), then `margin.read` or `pnl.read` and how far it reaches.
 * Every refusal's row is written and waited for before it is sent. A null
 * figure comes back with the reason it is null, never as a zero.
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
    await recordRefusal([{ companyId: caller.company!.id }], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: `Refused a sold team's margin: ${clientSays}` })
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: clientSays } }, { status: 403 })
  }
  if (!hasPermission(caller.permissions, 'margin.read') && !hasPermission(caller.permissions, 'pnl.read')) {
    const says = refusalFor(caller, { doing: 'Reading what a sold team has earned', needs: ['margin.read', 'pnl.read'] })
    await recordRefusal([{ companyId: caller.company!.id }], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: `Refused a sold team's margin: the seat holds neither margin.read nor pnl.read.` })
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: says } }, { status: 403 })
  }

  const reach = await marginReachFor(caller)
  const { id } = await params
  const read = await readPodMargin({ companyId: caller.company!.id, personId: caller.person.id }, reach, id)
  if (!read.ok) {
    if (read.status === 403) {
      await recordRefusal([{ companyId: caller.company!.id }], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: `Refused a sold team's margin: ${read.says}` })
    }
    return NextResponse.json({ error: { code: read.status === 403 ? 'FORBIDDEN' : 'NOT_FOUND', message: read.says } }, { status: read.status })
  }
  return NextResponse.json({ data: { podProjectId: read.podProjectId, margin: read.margin, unknownSays: marginUnknownSays(read.margin), reach: reachSays(reach, caller.company!.name) } })
}
