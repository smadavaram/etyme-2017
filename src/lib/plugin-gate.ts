import { NextResponse } from 'next/server'
import { accessActor, recordRefusal, type AccessAction } from '@/lib/access-log'
import { isOn, pluginLabel, type PluginKey } from '@/lib/plugins'
import { prisma } from '@/lib/db'

/** Pure: the one sentence every route and page of a plugin says while it is off. */
export function pluginOffSays(key: PluginKey, firm: string): string {
  return `${pluginLabel(key)} is off for ${firm}. The Owner turns it on in Settings.`
}

type GateCaller = Parameters<typeof accessActor>[0] & { company: { id: string; name: string } | null }

/**
 * The gate every route of a plugin asks, after the caller check. Returns
 * the 403 to send, or null where the plugin is on. The refusal is written
 * to the access log and waited for before it is sent (`recordRefusal`),
 * with the firm as its subject, because no person's data is behind it.
 */
export async function pluginGate(caller: GateCaller, key: PluginKey): Promise<NextResponse | null> {
  if (!caller.company) return null
  const c = await prisma.company.findUnique({ where: { id: caller.company.id }, select: { pluginsOn: true } })
  if (isOn(c?.pluginsOn, key)) return null
  const says = pluginOffSays(key, caller.company.name)
  await recordRefusal([{ companyId: caller.company.id }], {
    ...accessActor(caller),
    action: 'PLUGIN_OFF_REFUSED' as string as AccessAction,
    reason: `Refused a ${pluginLabel(key)} request: the plugin is off for this firm.`,
  })
  // Only the Owner is sent to the switch; anybody else is told whose it is.
  const role = (caller as { context?: { roleId?: string | null } }).context?.roleId
    ? await prisma.role.findFirst({ where: { id: (caller as any).context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  return NextResponse.json({ error: { code: 'PLUGIN_OFF', message: says, ...(role?.name === 'Owner' ? { href: '/dashboard/settings' } : {}) } }, { status: 403 })
}
