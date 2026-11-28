/**
 * The numbers a chase agent proposes with, set by the Owner per firm (record
 * 112, chain 4 and 5): letters after the first, and working days apart. They
 * live on the agent's switch row. A new task takes the firm's numbers when it
 * is proposed and keeps them in its plan; a task already approved is never
 * touched by a later change. The Owner alone changes them, each change on
 * the ledger.
 */

import { prisma } from '@/lib/db'
import { writeRecordAction, LedgerRefusal } from '@/lib/record-ledger'
import { agentName, mayChangeSwitch, SWITCH_RECORD } from './switch'
import type { TaskPlan } from './tasks'

export const CHASE_AGENT_KEYS: readonly string[] = ['timesheet-chase', 'money-owed-chase']
export const RETRIES_RANGE = { min: 0, max: 5 } as const
export const DAYS_APART_RANGE = { min: 1, max: 15 } as const

export interface ChaseNumbers { retries: number; daysApart: number }

/** What the route reads, or the sentence it refuses with. Pure. */
export function readChaseNumbers(agentKey: string, body: unknown): { ok: true; numbers: ChaseNumbers } | { ok: false; says: string; field: string } {
  if (!CHASE_AGENT_KEYS.includes(agentKey)) return { ok: false, field: 'agentKey', says: 'Only the two chase agents have letters and spacing to set.' }
  const b = (body ?? {}) as Record<string, unknown>
  const whole = (v: unknown) => typeof v === 'number' && Number.isInteger(v)
  if (!whole(b.retries) || (b.retries as number) < RETRIES_RANGE.min || (b.retries as number) > RETRIES_RANGE.max) {
    return { ok: false, field: 'retries', says: `Letters after the first is a whole number from ${RETRIES_RANGE.min} to ${RETRIES_RANGE.max}.` }
  }
  if (!whole(b.daysApart) || (b.daysApart as number) < DAYS_APART_RANGE.min || (b.daysApart as number) > DAYS_APART_RANGE.max) {
    return { ok: false, field: 'daysApart', says: `Working days apart is a whole number from ${DAYS_APART_RANGE.min} to ${DAYS_APART_RANGE.max}.` }
  }
  return { ok: true, numbers: { retries: b.retries as number, daysApart: b.daysApart as number } }
}

/** A stored value read back; anything out of range is not the Owner's and reads as none. Pure. */
export function chaseNumbersFrom(stored: unknown): ChaseNumbers | null {
  if (!stored || typeof stored !== 'object') return null
  const r = readChaseNumbers(CHASE_AGENT_KEYS[0], stored)
  return r.ok ? r.numbers : null
}

/** The plan with the firm's numbers in it; the proposed plan where the Owner set none. Pure. */
export function planWith(base: TaskPlan, numbers: ChaseNumbers | null): TaskPlan {
  return numbers ? { ...base, retries: numbers.retries, daysApart: numbers.daysApart } : base
}

/** The firm's numbers for this agent, or null where the Owner set none. */
export async function chaseNumbersOf(companyId: string, agentKey: string): Promise<ChaseNumbers | null> {
  const row = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey } }, select: { chasePlan: true } })
  return chaseNumbersFrom(row?.chasePlan)
}

/** The sentence the card says about its numbers. Pure. */
export function numbersSource(set: boolean): string {
  return set ? 'These are the numbers the Owner set in Agent control.' : 'These numbers are proposals; the Owner can change them in Agent control.'
}

/** Set the numbers. The Owner only; the change is a row on the ledger. Tasks already approved keep their own plan. */
export async function setChaseNumbers(input: { companyId: string; agentKey: string; roleName: string | null; personId: string; heldAs: string; actingEntityId: string | null; numbers: ChaseNumbers }) {
  const who = mayChangeSwitch(input.roleName)
  if (who) throw new LedgerRefusal('Only the firm’s Owner sets how many letters a chase sends and how far apart.')
  const read = readChaseNumbers(input.agentKey, input.numbers)
  if (!read.ok) throw new LedgerRefusal(read.says)
  const n = read.numbers
  return prisma.$transaction(async (tx) => {
    const row = await tx.agentSwitch.upsert({
      where: { companyId_agentKey: { companyId: input.companyId, agentKey: input.agentKey } },
      update: { chasePlan: { ...n } },
      create: { companyId: input.companyId, agentKey: input.agentKey, state: 'OFF', changedById: input.personId, chasePlan: { ...n } },
    })
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: SWITCH_RECORD, recordId: row.id, action: 'SWITCH_CHANGED',
      summary: `Set ${agentName(input.agentKey)} to one letter, then up to ${n.retries} ${n.retries === 1 ? 'reminder' : 'reminders'}, ${n.daysApart} working ${n.daysApart === 1 ? 'day' : 'days'} apart. Tasks already approved keep the plan they were approved with.`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: input.actingEntityId,
    })
    return row
  })
}
