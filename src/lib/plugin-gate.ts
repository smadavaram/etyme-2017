import { NextResponse } from 'next/server'
import { accessActor, recordRefusal } from '@/lib/access-log'
import { isOn, notOfferedSays, siteRendersFor, pluginLabel, type PluginKey } from '@/lib/plugins'
import { prisma } from '@/lib/db'

/** Pure: the one sentence every route and page of a plugin says while it is off. */
export function pluginOffSays(key: PluginKey, firm: string): string {
  return `${pluginLabel(key)} is off for ${firm}. The Owner turns it on in Settings.`
}

type GateCaller = Parameters<typeof accessActor>[0] & { company: { id: string; name: string; kind?: string | null } | null }

/**
 * The gate every route of a plugin asks, after the caller check. Returns
 * the 403 to send, or null where the plugin is on. The refusal is written
 * to the access log and waited for before it is sent (`recordRefusal`),
 * with the firm as its subject, because no person's data is behind it.
 */
export async function pluginGate(caller: GateCaller, key: PluginKey): Promise<NextResponse | null> {
  if (!caller.company) return null
  // A company that only buys is not offered a supplier module: one neutral
  // sentence that names no module, and no door to a switch.
  if (caller.company.kind === 'CLIENT') {
    await recordRefusal([{ companyId: caller.company.id }], {
      ...accessActor(caller),
      action: 'PLUGIN_OFF_REFUSED',
      reason: 'Refused a request for a module that is not offered to a client company.',
    })
    return NextResponse.json({ error: { code: 'NOT_OFFERED', message: notOfferedSays() } }, { status: 403 })
  }
  const c = await prisma.company.findUnique({ where: { id: caller.company.id }, select: { pluginsOn: true, siteLiveAt: true } })
  if (isOn(c?.pluginsOn, key)) return null
  // A site live before the flag keeps its editor until an Owner switches it off (record 123).
  if (key === 'WEBSITE' && c && (await siteRendersFor({ id: caller.company.id, siteLiveAt: c.siteLiveAt, pluginsOn: c.pluginsOn }))) return null
  const says = pluginOffSays(key, caller.company.name)
  await recordRefusal([{ companyId: caller.company.id }], {
    ...accessActor(caller),
    action: 'PLUGIN_OFF_REFUSED',
    reason: `Refused a ${pluginLabel(key)} request: the plugin is off for this firm.`,
  })
  // Only the Owner is sent to the switch; anybody else is told whose it is.
  const role = (caller as { context?: { roleId?: string | null } }).context?.roleId
    ? await prisma.role.findFirst({ where: { id: (caller as any).context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  return NextResponse.json({ error: { code: 'PLUGIN_OFF', message: says, ...(role?.name === 'Owner' ? { href: '/dashboard/settings' } : {}) } }, { status: 403 })
}
