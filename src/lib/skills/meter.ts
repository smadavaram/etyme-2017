/**
 * The meter (record 123): how many skill calls ran, by skill, by agent and
 * by tier, with how many fell back, escalated or ran on the tenant's own
 * model. Counts only. There is no price, charge or cost field anywhere in
 * it: the rate card (record 127) is not published to code, and the run
 * row's `costMicros` is Etyme's own provider cost, never a charge.
 *
 * `meterOf` is pure. `readMeter` reads one company's skill rows in a window;
 * a row with no skill (the match, check and evidence runs from before the
 * skill layer) is never in it.
 */

import { prisma } from '@/lib/db'
import { TIERS, type Tier } from './registry'

export interface MeterRow {
  skillKey: string | null
  agentKey: string | null
  tier: string | null
  byTenantModel: boolean
  fallbackFrom: string | null
  escalatedFrom: string | null
}

export interface MeterLine {
  key: string
  /** Every counted call. */
  calls: number
  rules: number
  low: number
  high: number
  /** Calls that fell to the next model in the same tier. */
  fallback: number
  /** Calls that moved from the low tier to the high tier. */
  escalated: number
  /** Calls that ran on the tenant's own model. */
  ownModel: number
}

export interface Meter {
  bySkill: MeterLine[]
  byAgent: MeterLine[]
  total: MeterLine
}

const empty = (key: string): MeterLine => ({ key, calls: 0, rules: 0, low: 0, high: 0, fallback: 0, escalated: 0, ownModel: 0 })

function add(line: MeterLine, r: MeterRow) {
  line.calls++
  line[(r.tier as Tier).toLowerCase() as 'rules' | 'low' | 'high']++
  if (r.fallbackFrom) line.fallback++
  if (r.escalatedFrom) line.escalated++
  if (r.byTenantModel) line.ownModel++
}

export function meterOf(rows: readonly MeterRow[]): Meter {
  const skills = new Map<string, MeterLine>()
  const agents = new Map<string, MeterLine>()
  const total = empty('all')
  for (const r of rows) {
    if (!r.skillKey || !r.tier || !TIERS.includes(r.tier as Tier)) continue
    add(total, r)
    if (!skills.has(r.skillKey)) skills.set(r.skillKey, empty(r.skillKey))
    add(skills.get(r.skillKey)!, r)
    if (r.agentKey) {
      if (!agents.has(r.agentKey)) agents.set(r.agentKey, empty(r.agentKey))
      add(agents.get(r.agentKey)!, r)
    }
  }
  const byKey = (a: MeterLine, b: MeterLine) => a.key.localeCompare(b.key)
  return { bySkill: [...skills.values()].sort(byKey), byAgent: [...agents.values()].sort(byKey), total }
}

/** One company's meter for the window [from, to). Another company's runs are never read. */
export async function readMeter(companyId: string, from: Date, to: Date): Promise<Meter> {
  const rows = await prisma.agentRun.findMany({
    where: { companyId, skillKey: { not: null }, at: { gte: from, lt: to } },
    select: { skillKey: true, agentKey: true, tier: true, byTenantModel: true, fallbackFrom: true, escalatedFrom: true },
  })
  return meterOf(rows)
}
