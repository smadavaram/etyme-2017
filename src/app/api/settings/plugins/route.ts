import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { isOn, notOfferedSays, pluginsOfferedTo, isPluginKey, maySwitchPlugin, pluginLabel, switchOnRefusal, type PluginKey } from '@/lib/plugins'
import { momentFor } from '@/lib/when'

/**
 * GET   /api/settings/plugins            both plugins with their state, and the switches
 *                                        written for them, Etyme staff's included.
 * PATCH /api/settings/plugins { plugin, on }   the Owner switches one (record 120).
 *
 * The flag and its PluginSwitch row are written in one transaction. A
 * staff switch is shown as "Etyme staff", never an address. An Admin reads
 * and may not switch; the twin and every agent are refused.
 */

const WHO_STAFF = 'Etyme staff'

async function readScreen(companyId: string, kind: string | null) {
  const [company, rows] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { pluginsOn: true } }),
    prisma.pluginSwitch.findMany({ where: { companyId }, orderBy: { at: 'desc' }, take: 200 }),
  ])
  const people = await prisma.person.findMany({
    where: { id: { in: [...new Set(rows.filter((r) => !r.byStaff).map((r) => r.byPersonId))] } },
    select: { id: true, name: true },
  })
  const names = new Map(people.map((p) => [p.id, p.name]))
  const switches = rows.map((r) => ({
    id: r.id,
    plugin: r.plugin,
    label: isPluginKey(r.plugin) ? pluginLabel(r.plugin) : r.plugin,
    on: r.on,
    by: r.byStaff ? WHO_STAFF : names.get(r.byPersonId) ?? 'Somebody who has left',
    byStaff: r.byStaff,
    reason: r.reason,
    at: r.at.toISOString(),
    atWords: momentFor(r.at, 'UTC'),
  }))
  return {
    plugins: pluginsOfferedTo(kind).map((p) => {
      const last = switches.find((s) => s.plugin === p.key) ?? null
      return { key: p.key, label: p.label, says: p.says, on: isOn(company?.pluginsOn, p.key), opensSays: switchOnRefusal(p.key), last: last ? { on: last.on, by: last.by, at: last.at, atWords: last.atWords } : null }
    }),
    switches,
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Plugins are a company setting. Open them from a company seat.' } }, { status: 403 })
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (!role || (role.name !== 'Owner' && role.name !== 'Admin')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Plugins at ${caller.company.name} are read by its Owners and Admins.` } }, { status: 403 })
  }
  return NextResponse.json({ data: { ...(await readScreen(caller.company.id, caller.company.kind)), canSwitch: role.name === 'Owner' } })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const may = await maySwitchPlugin({ ...caller, twin: Boolean((caller as any).twin) })
  if (!may.ok) {
    return NextResponse.json({ error: { code: may.code === 'OWNER_NOT_VERIFIED' ? 'OWNER_NOT_VERIFIED' : 'FORBIDDEN', message: may.says, ...(may.href ? { href: may.href } : {}) } }, { status: 403 })
  }
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot switch a plugin. An Owner has to.' } }, { status: 403 })
  const body = await request.json().catch(() => null) as { plugin?: unknown; on?: unknown } | null
  if (!body || !isPluginKey(body.plugin) || typeof body.on !== 'boolean') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which plugin, and whether it is on or off.' } }, { status: 422 })
  }
  if (!pluginsOfferedTo(caller.company!.kind).some((p) => p.key === body.plugin)) {
    return NextResponse.json({ error: { code: 'NOT_OFFERED', message: notOfferedSays() } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const plugin: PluginKey = body.plugin
  const on = body.on
  const closed = on ? switchOnRefusal(plugin) : null
  if (closed) return NextResponse.json({ error: { code: 'NOT_OPEN_YET', message: closed } }, { status: 409 })
  await prisma.$transaction(async (tx) => {
    const c = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { pluginsOn: true } })
    const rest = c.pluginsOn.filter((k) => k !== plugin)
    await tx.company.update({ where: { id: companyId }, data: { pluginsOn: on ? [...rest, plugin] : rest } })
    await tx.pluginSwitch.create({ data: { companyId, plugin, on, byPersonId: by, byStaff: false } })
  })
  return NextResponse.json({ data: { ...(await readScreen(companyId, caller.company!.kind)), canSwitch: true } })
}
