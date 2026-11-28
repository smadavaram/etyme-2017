import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'
import { accessActor, recordAccess, recordRefusal, type AccessAction, type AccessSubject } from '@/lib/access-log'
import { prisma } from '@/lib/db'
import { isPluginKey, switchOnBlock, type PluginKey } from '@/lib/plugins'

/**
 * GET   /api/superadmin/plugins — every firm's name, Etyme address, the
 *       plugins it has on, and its newest switch line (plugin, on, when,
 *       whether staff made it). Nothing else: no person, money, paper, seat
 *       or count. The read is logged, and waited for, before it is sent.
 * PATCH /api/superadmin/plugins { companyId, plugin, on, reason }
 *
 * Etyme's Superadmin switches a firm's plugin (record 120, the owner's
 * answer: "Staff tool, switch only"). It writes the flag and a
 * PluginSwitch row with byStaff set, in one transaction, which the firm's
 * Owner reads as "Etyme staff". It reads no tenant data and answers
 * { plugin, on } and nothing more. Staff only (`caller.staff`); anybody
 * else is refused, the refusal written before it is sent.
 */
const SWITCH_REFUSED: AccessAction = 'SUPERADMIN_PLUGIN_REFUSED'

/** Reading the firms' switches. Not yet a line in AccessAction (lib/access-log is regulatory's); the column is text. */
const LIST_READ = 'SUPERADMIN_PLUGIN_LIST_READ' as string as AccessAction

/** How many firms the list draws, by name. */
const FIRMS_LISTED = 500

const REFUSED = "This is for Etyme's Superadmin only. A company's Owner switches its own plugins under Settings."

async function refuse(caller: CallerContext, doing = 'switching'): Promise<NextResponse> {
  const subject: AccessSubject | null = caller.isService
    ? (caller.company ? { companyId: caller.company.id } : null)
    : caller.person.id
  if (subject) {
    await recordRefusal([subject], {
      ...accessActor(caller),
      action: SWITCH_REFUSED,
      reason: `Refused ${doing} a firm’s plugin on the Superadmin screen: not on Etyme’s staff list.`,
    })
  }
  return NextResponse.json({ error: { code: 'FORBIDDEN', message: REFUSED } }, { status: 403 })
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.staff || caller.isService) return refuse(caller, 'listing')
  const firms = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    take: FIRMS_LISTED,
    select: {
      name: true, slug: true, pluginsOn: true,
      pluginSwitches: { orderBy: { at: 'desc' }, take: 1, select: { plugin: true, on: true, at: true, byStaff: true } },
    },
  })
  await recordAccess([caller.person.id], {
    ...accessActor(caller),
    action: LIST_READ,
    reason: `Read ${firms.length} firms’ plugin switches on the Superadmin screen: name, Etyme address, plugins on and the newest switch.`,
  })
  return NextResponse.json({
    data: firms.map((c) => {
      const last = c.pluginSwitches[0]
      return { name: c.name, slug: c.slug, pluginsOn: c.pluginsOn, lastSwitch: last ? { plugin: last.plugin, on: last.on, at: last.at.toISOString(), byStaff: last.byStaff } : null }
    }),
  })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.staff || caller.isService) return refuse(caller)
  const by = realPersonId(caller)
  const body = await request.json().catch(() => null) as { companyId?: unknown; slug?: unknown; plugin?: unknown; on?: unknown; reason?: unknown } | null
  // The screen names the firm by its Etyme address; a caller may send the id.
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const named = slug ? (await prisma.company.findUnique({ where: { slug }, select: { id: true } }))?.id : undefined
  const companyId = typeof body?.companyId === 'string' && body.companyId ? body.companyId : named
  if (slug && !named && !body?.companyId) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No firm has that Etyme address.' } }, { status: 404 })
  if (!by || !body || !companyId || !isPluginKey(body.plugin) || typeof body.on !== 'boolean') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which firm, which plugin, and whether it is on or off.' } }, { status: 422 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 3) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say why, in a few words. The firm’s Owner reads it.' } }, { status: 422 })
  }
  const on = body.on as boolean
  const plugin: PluginKey = body.plugin
  const blocked = on ? await switchOnBlock(plugin, companyId) : null
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status })
  // Only the switch is touched: the company row is read for its flag list alone.
  const found = await prisma.$transaction(async (tx) => {
    const c = await tx.company.findUnique({ where: { id: companyId }, select: { pluginsOn: true } })
    if (!c) return false
    const rest = c.pluginsOn.filter((k) => k !== plugin)
    await tx.company.update({ where: { id: companyId }, data: { pluginsOn: on ? [...rest, plugin] : rest } })
    await tx.pluginSwitch.create({ data: { companyId, plugin, on, byPersonId: by, byStaff: true, reason } })
    return true
  })
  if (!found) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No firm has that id.' } }, { status: 404 })
  return NextResponse.json({ data: { plugin, on } })
}
