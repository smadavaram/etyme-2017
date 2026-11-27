import { prisma } from '@/lib/db'
import { dayAround } from '@/lib/decision-queue'
import { NOTE_ACTIONS } from '@/lib/agents/switch'
import { PLUGIN_REGISTRY, type PluginKey } from '@/lib/plugin-registry'

/**
 * What a firm's agents did under each plugin (record 123, usage metered
 * through the ledger). There is no second counter: it is the same
 * RecordAction rows every agent act already writes, grouped by the agent's
 * plugin as the registry declares it. The Owner reads it per plugin in
 * Settings. A plugin with no agent reads zero, never a blank guess.
 */
export type PluginUsage = { key: PluginKey; agents: string[]; actsToday: number; actsLast30Days: number }

/** Pure: fold ledger counts per agent into counts per plugin, in the registry's order. */
export function foldUsage(today: Record<string, number>, last30: Record<string, number>): PluginUsage[] {
  return [...PLUGIN_REGISTRY].sort((a, b) => a.order - b.order).map((p) => ({
    key: p.key,
    agents: [...p.agents],
    actsToday: p.agents.reduce((n, a) => n + (today[a] ?? 0), 0),
    actsLast30Days: p.agents.reduce((n, a) => n + (last30[a] ?? 0), 0),
  }))
}

export async function pluginUsage(companyId: string, now: Date = new Date()): Promise<PluginUsage[]> {
  const agentKey = { in: PLUGIN_REGISTRY.flatMap((p) => [...p.agents]) }
  const { from, to } = dayAround(now)
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const count = async (gte: Date, lt?: Date) => {
    const rows = await prisma.recordAction.groupBy({
      by: ['agentKey'], _count: { _all: true },
      where: { companyId, agentKey, createdAt: lt ? { gte, lt } : { gte }, action: { notIn: [...NOTE_ACTIONS] } },
    })
    return Object.fromEntries(rows.map((r) => [r.agentKey as string, r._count._all]))
  }
  const [today, last30] = await Promise.all([count(from, to), count(since)])
  return foldUsage(today, last30)
}
