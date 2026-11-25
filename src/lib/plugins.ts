import { prisma } from '@/lib/db'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'

/**
 * Plugins (record 120): modules a firm does not have until its Owner, or
 * Etyme's staff on the switch alone, turns them on. Off for every firm by
 * default. Switching off hides and never deletes. The state is
 * `Company.pluginsOn`; the ledger is `PluginSwitch`.
 */

export type PluginKey = 'TRAIN_TO_BENCH' | 'PODS'

export const PLUGINS: readonly { key: PluginKey; label: string; says: string }[] = [
  { key: 'TRAIN_TO_BENCH', label: 'Train to bench', says: 'Courses and cohorts for your people, and a trainee who finishes joins your bench with her own yes.' },
  { key: 'PODS', label: 'Project teams', says: 'Named teams sold as a project, with deliverables the client accepts and milestones billed from them.' },
]

/**
 * Both plugins are supplier modules. A company that only buys (kind
 * CLIENT) is offered neither, and is never told they exist.
 */
export function pluginsOfferedTo(kind: string | null | undefined): typeof PLUGINS {
  return kind === 'CLIENT' ? [] : PLUGINS
}

/** The one sentence for a module that is not offered to this company; it names no module. */
export function notOfferedSays(): string {
  return 'That is not offered for your company.'
}

export function isPluginKey(v: unknown): v is PluginKey {
  return PLUGINS.some((p) => p.key === v)
}

export function pluginLabel(key: PluginKey): string {
  return PLUGINS.find((p) => p.key === key)?.label ?? key
}

/** Pure: is the plugin in this list. Nothing in the list is off. */
export function isOn(pluginsOn: readonly string[] | null | undefined, key: PluginKey): boolean {
  return Boolean(pluginsOn?.includes(key))
}

/** Whether the firm has the plugin on. Reads the database. */
export async function pluginOn(companyId: string, key: PluginKey): Promise<boolean> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { pluginsOn: true } })
  return isOn(c?.pluginsOn, key)
}

/** A twin or an agent never switches a plugin; a person does. */
export type PluginActor = {
  twin?: boolean
  agent?: boolean
  actorKind?: string | null
  company: { id: string; name: string } | null
  context: { roleId: string | null }
}

export type MaySwitch = { ok: true } | { ok: false; code: 'AGENT' | 'NOT_OWNER' | 'OWNER_NOT_VERIFIED' | 'NO_COMPANY'; says: string; href?: string }

/**
 * May this caller switch a plugin at their firm? The twin and any agent are
 * refused first, then anybody who is not an Owner of the company, then the
 * wait for a verified Owner (a GatedAct).
 */
export async function maySwitchPlugin(caller: PluginActor): Promise<MaySwitch> {
  if (caller.twin || caller.agent || caller.actorKind === 'TWIN' || caller.actorKind === 'AGENT') {
    return { ok: false, code: 'AGENT', says: 'Ask Etyme and the agents never switch a plugin. The Owner does, in Settings.' }
  }
  if (!caller.company) return { ok: false, code: 'NO_COMPANY', says: 'A plugin is a company setting. Open it from a company seat.' }
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (role?.name !== 'Owner') {
    return { ok: false, code: 'NOT_OWNER', says: `Only an Owner of ${caller.company.name} switches a plugin on or off. An Admin may read the switches.` }
  }
  const gate = await needsVerifiedOwnerAt(caller.company.id, 'PLUGIN_SWITCH')
  if (!gate.ok) return { ok: false, code: 'OWNER_NOT_VERIFIED', says: gate.says, href: gate.href }
  return { ok: true }
}
