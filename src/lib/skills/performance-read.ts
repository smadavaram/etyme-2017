/**
 * The performance panel's reader and the Owner's targets (records 123, 125),
 * over the database. One company's rows, never another's. The arithmetic is
 * `performance`, the words are `performance-words`; this file only reads,
 * and writes the one thing the Owner sets: a target, with its ledger row.
 *
 * Until an agent is moved onto skills it has no plan and no runs, so its
 * line reads Not graded. That is the truth, not a gap in the screen.
 */

import { prisma } from '@/lib/db'
import { FIRM_AGENTS } from '@/lib/decision-queue'
import { NOTE_ACTIONS } from '@/lib/agents/switch'
import { planOf } from '@/lib/agents/plans'
import { LedgerRefusal, writeRecordAction } from '@/lib/record-ledger'
import { OWNER_ROLE } from '@/lib/owner-rules'
import { SKILLS, skillOf } from './registry'
import { PERIODS, lineOf, periodWindow, performanceOf, type AgentOutput, type PerfLine, type PerfRow, type Period, type Targets } from './performance'
import { cellsOf, gradedLine, tierLine, type Cells } from './performance-words'

export const MAX_TARGET = 1_000_000
export const TARGET_OWNER_ONLY = 'Only the firm’s Owner sets a target.'

export const agentOutputs = (): AgentOutput[] =>
  FIRM_AGENTS.flatMap((a) => { const p = planOf(a.key); return p ? [{ agentKey: a.key, outputSkill: p.outputSkill }] : [] })

export interface PanelLine {
  kind: 'SKILL' | 'AGENT'
  key: string
  name: string
  cells: Cells
  graded: string
  tiers: string
  /** Agents only: acts on the ledger in the period. */
  ledgerActs: number | null
  /** The skill an agent's line stands for; null until the agent is moved onto skills. */
  outputSkill: string | null
}

export interface Panel { period: Period; from: string; to: string; skills: PanelLine[]; agents: PanelLine[] }

const lineOut = (l: PerfLine, kind: 'SKILL' | 'AGENT', name: string, ledgerActs: number | null, outputSkill: string | null): PanelLine => ({
  kind, key: l.key, name, cells: cellsOf(l), graded: gradedLine(l), tiers: tierLine(l.counts), ledgerActs, outputSkill,
})

export async function readTargets(companyId: string, period: Period): Promise<Targets> {
  const rows = await prisma.skillTarget.findMany({ where: { companyId, period }, select: { subjectKind: true, subjectKey: true, target: true } })
  const t: Targets = { skill: {}, agent: {} }
  for (const r of rows) (r.subjectKind === 'AGENT' ? t.agent : t.skill)[r.subjectKey] = r.target
  return t
}

export async function readPanel(companyId: string, period: Period, now: Date = new Date()): Promise<Panel> {
  const { from, to } = periodWindow(period, now)
  const runs = await prisma.agentRun.findMany({
    where: { companyId, skillKey: { not: null }, at: { gte: from, lt: to } },
    select: { id: true, skillKey: true, agentKey: true, tier: true, byTenantModel: true, fallbackFrom: true, escalatedFrom: true, unitsPlanned: true, unitsDone: true },
  })
  const [checks, targets, acts, notes] = await Promise.all([
    runs.length
      ? prisma.check.findMany({ where: { companyId, runId: { in: runs.map((r) => r.id) }, code: { startsWith: 'SKILL_' } }, select: { runId: true, verdict: true } })
      : [],
    readTargets(companyId, period),
    prisma.recordAction.groupBy({ by: ['agentKey'], where: { companyId, createdAt: { gte: from, lt: to }, agentKey: { not: null } }, _count: { _all: true } }),
    prisma.recordAction.groupBy({ by: ['agentKey'], where: { companyId, createdAt: { gte: from, lt: to }, agentKey: { not: null }, action: { in: [...NOTE_ACTIONS] } }, _count: { _all: true } }),
  ])
  const verdictOf = new Map(checks.map((c) => [c.runId, c.verdict]))
  const rows: PerfRow[] = runs.map((r) => {
    const v = verdictOf.get(r.id)
    return { ...r, verdict: v === 'PASS' || v === 'FAIL' || v === 'UNKNOWN' ? v : null }
  })
  const ledgerActs: Record<string, number> = {}
  for (const a of acts) if (a.agentKey) ledgerActs[a.agentKey] = a._count._all - (notes.find((n) => n.agentKey === a.agentKey)?._count._all ?? 0)

  const p = performanceOf(rows, targets, agentOutputs(), ledgerActs)
  // A skill nobody ran, and an agent not yet on skills, read an empty line: Not graded.
  const skillLine = (key: string) => p.skills.find((l) => l.key === key) ?? lineOf(key, [], targets.skill[key] ?? null)
  const agentLine = (a: { key: string; name: string }): PanelLine => {
    const mine = p.agents.find((l) => l.key === a.key)
    return lineOut(mine ?? lineOf(a.key, [], targets.agent[a.key] ?? null), 'AGENT', a.name, ledgerActs[a.key] ?? 0, mine?.outputSkill ?? null)
  }
  return {
    period, from: from.toISOString(), to: to.toISOString(),
    skills: SKILLS.map((s) => lineOut(skillLine(s.key), 'SKILL', s.name, null, null)).sort((a, b) => a.key.localeCompare(b.key)),
    agents: FIRM_AGENTS.map(agentLine),
  }
}

// ---- the Owner's target ----

export interface TargetAsk { subjectKind: 'SKILL' | 'AGENT'; subjectKey: string; period: Period; target: number | null }

/** Reads the body of a target change. Null target clears it. Pure. */
export function readTargetAsk(b: unknown): { ok: true; ask: TargetAsk } | { ok: false; field: string; says: string } {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  if (o.subjectKind !== 'SKILL' && o.subjectKind !== 'AGENT') return { ok: false, field: 'subjectKind', says: 'Choose a skill or an agent.' }
  const key = typeof o.subjectKey === 'string' ? o.subjectKey : ''
  const known = o.subjectKind === 'SKILL' ? skillOf(key) !== null : FIRM_AGENTS.some((a) => a.key === key)
  if (!known) return { ok: false, field: 'subjectKey', says: o.subjectKind === 'SKILL' ? 'That is not one of the firm’s skills.' : 'That is not one of the firm’s agents.' }
  if (!PERIODS.includes(o.period as Period)) return { ok: false, field: 'period', says: 'Choose Day, Week or Month.' }
  let target: number | null
  if (o.target === null) target = null
  else if (typeof o.target === 'number' && Number.isInteger(o.target) && o.target >= 0 && o.target <= MAX_TARGET) target = o.target
  else return { ok: false, field: 'target', says: `A target is a whole number from 0 to ${MAX_TARGET}, or empty to clear it.` }
  return { ok: true, ask: { subjectKind: o.subjectKind, subjectKey: key, period: o.period as Period, target } }
}

/** The Owner's alone. Pure. */
export const mayTarget = (roleName: string | null | undefined): string | null => (roleName === OWNER_ROLE ? null : TARGET_OWNER_ONLY)

export async function setTarget(input: { companyId: string; roleName: string | null; personId: string; heldAs: string; actingEntityId: string | null; ask: TargetAsk }) {
  const who = mayTarget(input.roleName)
  if (who) throw new LedgerRefusal(who)
  const { ask } = input
  const where = { companyId_subjectKind_subjectKey_period: { companyId: input.companyId, subjectKind: ask.subjectKind, subjectKey: ask.subjectKey, period: ask.period } }
  const name = ask.subjectKind === 'SKILL' ? skillOf(ask.subjectKey)?.name ?? ask.subjectKey : FIRM_AGENTS.find((a) => a.key === ask.subjectKey)?.name ?? ask.subjectKey
  const per = { DAY: 'a day', WEEK: 'a week', MONTH: 'a month' }[ask.period]
  return prisma.$transaction(async (tx) => {
    let recordId: string
    if (ask.target === null) {
      const was = await tx.skillTarget.findUnique({ where, select: { id: true } })
      if (!was) throw new LedgerRefusal(`${name} has no target for ${per} to clear.`)
      await tx.skillTarget.delete({ where: { id: was.id } })
      recordId = was.id
    } else {
      const data = { target: ask.target, setById: input.personId, setAt: new Date() }
      const row = await tx.skillTarget.upsert({ where, update: data, create: { companyId: input.companyId, subjectKind: ask.subjectKind, subjectKey: ask.subjectKey, period: ask.period, ...data } })
      recordId = row.id
    }
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: 'SkillTarget', recordId, action: 'TARGET_SET',
      summary: ask.target === null ? `Cleared the target for ${name} over ${per}.` : `Set the target for ${name} to ${ask.target} over ${per}.`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId,
    })
    return { ...ask }
  })
}
