import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'
import { GET as decisionsList } from '@/app/api/decisions/route'
import { FIRM_AGENTS, NOT_LIVE_AGENTS } from '@/lib/decision-queue'
import { mayChangeSwitch } from '@/lib/agents/switch'
import { oneCardsFrom, type OneCard } from './build'
import { onTimePct, type DoneCard } from './score-bar'

/**
 * The one-card screen's reader (record 130): the decisions list the
 * number on Ask Etyme counts, plus what this seat finished today, the
 * firm's agent switch and the latest ledger line on each card's record.
 * It reads the queue by asking the queue (`GET /api/decisions`), so the
 * mark, the greeting, Today and this screen cannot disagree. It writes
 * nothing, and it is no door for a verdict: every Yes goes through the
 * route its row already has.
 */

export interface OneCardRead {
  cards: OneCard[]
  /** The Ask Etyme badge's own figure. */
  queue: number
  /** What this seat answered today: twin questions and decisions. */
  doneToday: number
  /** Done on time, or null where nothing done had a due date. */
  onTimePct: number | null
  agent: { state: 'On' | 'Drafts only' | 'Off'; ownerMaySwitch: boolean; href: string }
}

export const AGENT_CONTROL_HREF = '/dashboard/decisions/agents'

/** One word for the firm's live agents: On where any is on, Drafts only where any drafts, else Off. */
export function agentWord(states: readonly string[]): OneCardRead['agent']['state'] {
  if (states.includes('ON')) return 'On'
  if (states.includes('DRAFT_ONLY')) return 'Drafts only'
  return 'Off'
}

/** "2026-11-26 09:14 · Helena Marsh · Pay invoice · INV-2041 matched". */
export function ledgerLine(r: { createdAt: Date; person: { name: string }; action: string; summary: string }): string {
  const at = r.createdAt.toISOString().slice(0, 16).replace('T', ' ')
  return `${at} · ${r.person.name} · ${r.summary}`
}

export async function readOneCard(request: NextRequest, now = new Date()): Promise<{ read: OneCardRead } | { refusal: Response }> {
  const listed = await decisionsList(request)
  if (!listed.ok) return { refusal: listed }
  const body = await listed.json()
  const { caller, error } = await getCallerContext(request)
  if (error) return { refusal: error }
  const companyId = caller.company?.id
  if (!companyId) return { refusal: new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'The decision queue is a firm’s, and you are not signed in at one.' } }), { status: 403 }) }

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [twinDone, itemsDone, switches, role] = await Promise.all([
    prisma.twinApproval.findMany({ where: { companyId, approverPersonId: caller.person.id, decision: { in: ['APPROVED', 'REJECTED'] }, decidedAt: { gte: dayStart } }, select: { decidedAt: true } }),
    prisma.decisionItem.findMany({ where: { companyId, decidedByPersonId: caller.person.id, decidedAt: { gte: dayStart } }, select: { decidedAt: true } }),
    prisma.agentSwitch.findMany({ where: { companyId }, select: { agentKey: true, state: true } }),
    caller.context.roleId ? prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null,
  ])
  // Neither a twin question nor a decision item carries a due date, so none of what is done today can be judged on time.
  const done: DoneCard[] = [...twinDone, ...itemsDone].map((d) => ({ dueOn: null, doneAt: (d.decidedAt ?? now).toISOString() }))

  const entityIds = ((body?.data?.decisions ?? []) as { entityId?: unknown }[]).map((r) => r.entityId).filter((x): x is string => typeof x === 'string')
  const ledger = new Map<string, string>()
  if (entityIds.length > 0) {
    const rows = await prisma.recordAction.findMany({
      where: { companyId, recordId: { in: entityIds } },
      orderBy: { createdAt: 'desc' },
      select: { recordId: true, createdAt: true, action: true, summary: true, person: { select: { name: true } } },
    })
    for (const r of rows) if (!ledger.has(r.recordId)) ledger.set(r.recordId, ledgerLine(r))
  }

  const built = oneCardsFrom(body, ledger, now)
  if (!built) return { refusal: new Response(JSON.stringify({ error: { code: 'VALIDATION', message: 'What needs you could not be read just now. Try again.' } }), { status: 502 }) }
  const live = new Set<string>(FIRM_AGENTS.map((a) => a.key).filter((k) => !NOT_LIVE_AGENTS.includes(k)))
  return {
    read: {
      cards: built.cards,
      queue: built.total,
      doneToday: done.length,
      onTimePct: onTimePct(done),
      agent: {
        state: agentWord(switches.filter((s) => live.has(s.agentKey)).map((s) => s.state)),
        ownerMaySwitch: mayChangeSwitch(role?.name ?? null) === null,
        href: AGENT_CONTROL_HREF,
      },
    },
  }
}
