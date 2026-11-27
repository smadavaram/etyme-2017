/**
 * The golden-snapshot harness (record 123, plan step 7, correction C4),
 * shared by every agent migration. On a seeded world at a fixed clock an
 * agent is run and everything it leaves behind is captured as plain data:
 * the ledger acts (action, record type, summary, order), the tasks
 * (kind, status, plan), the decision cards opened (kind, seat owed), the
 * mail ledger rows (to, template) and the activity log. A snapshot taken
 * before a migration must equal the one taken after; `diffSnapshots` names
 * every row that differs. Ids and clocks are left out on purpose: they
 * differ between two runs of the same rules.
 */

import { prisma } from '@/lib/db'
import { runAgent } from '@/lib/agents/runner'

export interface GoldenSnapshot {
  recordActions: { order: number; action: string; recordType: string; summary: string }[]
  tasks: { kind: string; status: string; plan: unknown }[]
  cards: { kind: string; owedSeat: string }[]
  mail: { to: string; template: string }[]
  automation: { action: string; summary: string; reason: string; reversible: boolean }[]
}

const SECTIONS: (keyof GoldenSnapshot)[] = ['recordActions', 'tasks', 'cards', 'mail', 'automation']

/** Key order never matters to a plan, so objects are written with sorted keys. */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as any)[k])]))
  }
  return v
}

const line = (v: unknown) => JSON.stringify(canonical(v))

/** Every difference, one sentence each; empty means the two snapshots are equal. */
export function diffSnapshots(before: GoldenSnapshot, after: GoldenSnapshot): string[] {
  const out: string[] = []
  for (const s of SECTIONS) {
    const a = before[s] as unknown[]
    const b = after[s] as unknown[]
    if (a.length !== b.length) out.push(`${s}: ${a.length} row${a.length === 1 ? '' : 's'} before, ${b.length} after`)
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (line(a[i]) !== line(b[i])) out.push(`${s} row ${i + 1}: ${line(a[i])} became ${line(b[i])}`)
    }
  }
  return out
}

/** The rows an agent left for one firm since `since`, as a snapshot. */
export async function captureSnapshot(companyId: string, agentKey: string, since: Date): Promise<GoldenSnapshot> {
  const acts = await prisma.recordAction.findMany({
    where: { companyId, agentKey, createdAt: { gte: since } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey, createdAt: { gte: since } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { decision: true },
  })
  const items = await prisma.decisionItem.findMany({
    where: { companyId, createdAt: { gte: since } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const seats = async (personId: string) => {
    const cs = await prisma.context.findMany({ where: { personId, companyId }, include: { role: true } })
    return [...new Set(cs.map((c: any) => c.role?.name).filter(Boolean))].sort().join(' / ') || 'No role yet'
  }
  const cards: GoldenSnapshot['cards'] = []
  for (const d of items) {
    const links = Array.isArray(d.proofLinks) ? (d.proofLinks as any[]) : []
    const task = tasks.find((t) => t.decisionId === d.id)
    cards.push({ kind: task?.kind ?? links[0]?.recordType ?? 'DECISION', owedSeat: await seats(d.ownerPersonId) })
  }
  const mail = await prisma.mailSend.findMany({
    where: { companyId, agentKey, createdAt: { gte: since } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const log = await prisma.automationLog.findMany({
    where: { companyId, at: { gte: since } }, orderBy: [{ at: 'asc' }, { id: 'asc' }],
  })
  return {
    recordActions: acts.map((a, i) => ({ order: i + 1, action: a.action, recordType: a.recordType, summary: a.summary })),
    tasks: tasks.map((t) => ({ kind: t.kind, status: t.state, plan: canonical(t.plan) })),
    cards,
    mail: mail.map((m) => ({ to: [...m.toAddresses].sort().join(', '), template: m.template })),
    automation: log.map((l) => ({ action: l.action, summary: l.summary, reason: l.reason, reversible: l.reversible })),
  }
}

/** Run one agent for one firm at the fixed clock and capture what it left. */
export async function runAndCapture(companyId: string, agentKey: string, now: Date): Promise<GoldenSnapshot> {
  const since = new Date(Math.min(now.getTime(), Date.now()) - 1000)
  await runAgent(agentKey, companyId, now)
  return captureSnapshot(companyId, agentKey, since)
}
