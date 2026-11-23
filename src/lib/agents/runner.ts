/**
 * The agent runner (record 112, chain 7). `runAgent` reads the firm's
 * switch, refuses when it is Off and says why, stops at the day's cap,
 * and otherwise calls the agent's own step from the registry. Every act a
 * step does is one row on the record ledger with the agent's key, its rule
 * version and the role "agent". `runAllAgents` is the daily cron's one
 * entry: every switched-on agent for every firm, each in its own try, so
 * one failure never stops another.
 *
 * Whose name is on the row: the ledger names a person on every row, and
 * the person here is the one who last set the agent's switch, so the
 * Agent control page reads "<agent> for <that person>". Where the firm
 * has exactly one legal entity the row is for it; where it has several, a
 * step must name one, and a step that does not is refused by the ledger
 * and reported.
 *
 * No agent is registered by this file. The registry starts empty.
 */

import { prisma } from '@/lib/db'
import { writeRecordAction } from '@/lib/record-ledger'
import { reportError } from '@/lib/alerts'
import { dayAround } from '@/lib/decision-queue'
import { NOTE_ACTIONS, SWITCH_RECORD, agentKeys, capReachedSays, offSays } from './switch'

export const AGENT_HELD_AS = 'agent'

export interface AgentAct {
  recordType: string
  recordId: string
  action: string
  summary: string
  /** Where the firm has more than one legal entity, the one this act is for. */
  actingEntityId?: string | null
}

export interface AgentContext {
  agentKey: string
  companyId: string
  now: Date
  /** DRAFT_ONLY: the step prepares and drafts, and never sends. */
  mode: 'DRAFT_ONLY' | 'ON'
  ruleVersion: string
  /** Write one act to the ledger as the agent. Throws once the day's cap is reached. */
  act(a: AgentAct): Promise<void>
}

export interface AgentDef {
  ruleVersion: string
  step: (ctx: AgentContext) => Promise<void>
}

const registry = new Map<string, AgentDef>()
export function registerAgent(key: string, def: AgentDef) { registry.set(key, def) }
export function unregisterAgent(key: string) { registry.delete(key) }
export const registeredAgents = (): string[] => [...registry.keys()]

class CapReached extends Error {}

/** Acts an agent did today, not counting the lines that say why it did nothing. */
export async function actsToday(companyId: string, agentKey: string, now: Date): Promise<number> {
  const { from, to } = dayAround(now)
  return prisma.recordAction.count({
    where: { companyId, agentKey, createdAt: { gte: from, lt: to }, action: { notIn: [...NOTE_ACTIONS] } },
  })
}

export interface RunOutcome {
  ran: boolean
  /** Why it did nothing, or stopped, or failed; null when it ran to its end. */
  why: string | null
  acts: number
}

export async function runAgent(agentKey: string, companyId: string, now: Date = new Date()): Promise<RunOutcome> {
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey } } })
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  const only = entities.length === 1 ? entities[0].id : null

  // A row says why, where there is a person to put on it: the one who last set the switch.
  const note = async (action: typeof NOTE_ACTIONS[number], summary: string, ruleVersion: string | null) => {
    if (!sw) return
    try {
      await writeRecordAction(prisma, {
        companyId, recordType: SWITCH_RECORD, recordId: sw.id, action, summary, actingEntityId: only,
        personId: sw.changedById, heldAs: AGENT_HELD_AS, agentKey, ruleVersion,
      })
    } catch { /* the incident below is the record where the ledger will not take it */ }
  }

  if (!sw || sw.state === 'OFF') {
    const why = offSays(agentKey)
    await note('NOT_RUN', why, null)
    return { ran: false, why, acts: 0 }
  }
  const def = registry.get(agentKey)
  if (!def) return { ran: false, why: 'No step is built for this agent yet, so it did nothing.', acts: 0 }

  const done = await actsToday(companyId, agentKey, now)
  if (sw.dailyCap !== null && done >= sw.dailyCap) {
    const why = capReachedSays(agentKey, sw.dailyCap)
    await note('STOPPED_AT_CAP', why, def.ruleVersion)
    return { ran: false, why, acts: 0 }
  }

  let acts = 0
  const ctx: AgentContext = {
    agentKey, companyId, now, mode: sw.state as 'DRAFT_ONLY' | 'ON', ruleVersion: def.ruleVersion,
    act: async (a) => {
      if (sw.dailyCap !== null && (await actsToday(companyId, agentKey, now)) >= sw.dailyCap) throw new CapReached()
      await writeRecordAction(prisma, {
        companyId, recordType: a.recordType, recordId: a.recordId, action: a.action, summary: a.summary,
        actingEntityId: a.actingEntityId ?? only, personId: sw.changedById, heldAs: AGENT_HELD_AS,
        agentKey, ruleVersion: def.ruleVersion,
      })
      acts++
    },
  }
  try {
    await def.step(ctx)
    return { ran: true, why: null, acts }
  } catch (e) {
    if (e instanceof CapReached) {
      const why = capReachedSays(agentKey, sw.dailyCap ?? 0)
      await note('STOPPED_AT_CAP', why, def.ruleVersion)
      return { ran: true, why, acts }
    }
    const message = e instanceof Error ? e.message : String(e)
    await note('FAILED', `${agentKey} failed: ${message.slice(0, 300)}`, def.ruleVersion)
    await reportError(`agents/${agentKey}`, e, { companyId })
    return { ran: false, why: `The agent failed: ${message.slice(0, 200)}`, acts }
  }
}

/** Every switched-on agent for every firm, each in its own try. The daily cron's one entry. */
export async function runAllAgents(now: Date = new Date()) {
  const rows = await prisma.agentSwitch.findMany({ where: { state: { not: 'OFF' }, agentKey: { in: agentKeys() } }, select: { companyId: true, agentKey: true } })
  const ran: { companyId: string; agentKey: string; acts: number }[] = []
  const broke: { companyId: string; agentKey: string; why: string }[] = []
  const stopped: { companyId: string; agentKey: string; why: string }[] = []
  for (const r of rows) {
    try {
      const out = await runAgent(r.agentKey, r.companyId, now)
      if (out.ran && !out.why) ran.push({ companyId: r.companyId, agentKey: r.agentKey, acts: out.acts })
      else if (out.why && out.why.startsWith('The agent failed')) broke.push({ companyId: r.companyId, agentKey: r.agentKey, why: out.why })
      else if (out.why) stopped.push({ companyId: r.companyId, agentKey: r.agentKey, why: out.why })
    } catch (e) {
      await reportError(`agents/${r.agentKey}`, e, { companyId: r.companyId })
      broke.push({ companyId: r.companyId, agentKey: r.agentKey, why: e instanceof Error ? e.message.slice(0, 200) : String(e) })
    }
  }
  const says = `${rows.length} switched-on agent${rows.length === 1 ? '' : 's'}: ${ran.length} ran, ${stopped.length} stopped or waiting, ${broke.length} failed.`
  return { ran, stopped, broke, says }
}
