/**
 * The agent switch (record 112, chain 7): one row per company per agent,
 * Off until the Owner says otherwise. Off, Drafts only, On. Drafts only is
 * probation: the agent prepares tasks and drafts and sends nothing, even
 * after a yes. Only the Owner changes it (an Admin may not); each change is
 * a row on the record ledger. A cap is the most acts an agent may do in a
 * day; none is the default, and there is no price.
 */

import { prisma } from '@/lib/db'
import { writeRecordAction, LedgerRefusal } from '@/lib/record-ledger'
import { OWNER_ROLE } from '@/lib/owner-rules'
import { FIRM_AGENTS, SWITCH_WORDS as WORDS } from '@/lib/decision-queue'

export type SwitchState = 'OFF' | 'DRAFT_ONLY' | 'ON'
export const SWITCH_STATES: readonly SwitchState[] = ['OFF', 'DRAFT_ONLY', 'ON']
export const SWITCH_WORDS: Record<SwitchState, string> = WORDS

/** The record type of a switch on the ledger. */
export const SWITCH_RECORD = 'AgentSwitch'
/** The words on a ledger row an agent's step did not write: why it did nothing, or that it failed. They are not acts and are not metered. */
export const NOTE_ACTIONS = ['NOT_RUN', 'STOPPED_AT_CAP', 'FAILED', 'SWITCH_CHANGED'] as const

export const agentKeys = (): string[] => FIRM_AGENTS.map((a) => a.key)
export const agentName = (key: string): string => FIRM_AGENTS.find((a) => a.key === key)?.name ?? key

/** Changing a switch or a cap is the Owner's act alone. Pure. */
export function mayChangeSwitch(roleName: string | null | undefined): string | null {
  return roleName === OWNER_ROLE ? null : 'Only the firm’s Owner switches an agent on or off, or sets its cap.'
}

/** The sentence an agent that is off gives for doing nothing. Pure. */
export function offSays(key: string): string {
  return `${agentName(key)} is off, so it did nothing. The Owner switches it on from Agent control.`
}

/** "3 of 10 today", or "3 today" where no cap is set. Pure. */
export function capWords(acts: number, cap: number | null): string {
  return cap === null ? `${acts} today · no cap` : `${acts} of ${cap} today`
}

export function capReachedSays(key: string, cap: number): string {
  return `${agentName(key)} reached its cap of ${cap} for today, so it stopped. It starts again tomorrow, or when the Owner raises the cap.`
}

export interface SwitchAsk { state: SwitchState; dailyCap: number | null | undefined; actingEntityId: string | null }

/** What the switch route reads, or the sentence it refuses with. Pure. */
export function readSwitchAsk(key: string, body: unknown, hasEntities: boolean):
  | { ok: true; ask: SwitchAsk } | { ok: false; says: string; field: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (!agentKeys().includes(key)) return { ok: false, field: 'agentKey', says: 'That is not one of the firm’s agents.' }
  if (!SWITCH_STATES.includes(b.state as SwitchState)) return { ok: false, field: 'state', says: 'Choose Off, Drafts only or On.' }
  let dailyCap: number | null | undefined
  if ('dailyCap' in b) {
    if (b.dailyCap === null || b.dailyCap === '') dailyCap = null
    else if (typeof b.dailyCap === 'number' && Number.isInteger(b.dailyCap) && b.dailyCap >= 1) dailyCap = b.dailyCap
    else return { ok: false, field: 'dailyCap', says: 'A cap is a whole number of acts a day, one or more, or none.' }
  }
  const entity = typeof b.actingEntityId === 'string' && b.actingEntityId.trim() ? b.actingEntityId.trim() : null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: 'This company has legal entities. Choose which one this change is made for.' }
  return { ok: true, ask: { state: b.state as SwitchState, dailyCap, actingEntityId: entity } }
}

/** What a switch reads now; an agent never touched is Off with no cap. */
export async function switchOf(companyId: string, agentKey: string) {
  const row = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey } } })
  return { row, state: (row?.state ?? 'OFF') as SwitchState, dailyCap: row?.dailyCap ?? null }
}

/** Set the state, and the cap where given. The Owner only; the change is a row on the ledger. */
export async function setSwitch(input: { companyId: string; agentKey: string; roleName: string | null; personId: string; heldAs: string; ask: SwitchAsk }) {
  const who = mayChangeSwitch(input.roleName)
  if (who) throw new LedgerRefusal(who)
  if (!agentKeys().includes(input.agentKey)) throw new LedgerRefusal('That is not one of the firm’s agents.')
  const { ask } = input
  return prisma.$transaction(async (tx) => {
    const data = { state: ask.state, changedById: input.personId, changedAt: new Date(), ...(ask.dailyCap !== undefined ? { dailyCap: ask.dailyCap } : {}) }
    const row = await tx.agentSwitch.upsert({
      where: { companyId_agentKey: { companyId: input.companyId, agentKey: input.agentKey } },
      update: data,
      create: { companyId: input.companyId, agentKey: input.agentKey, ...data },
    })
    const cap = ask.dailyCap === undefined ? '' : ask.dailyCap === null ? ' No daily cap.' : ` Daily cap ${ask.dailyCap}.`
    await writeRecordAction(tx, {
      companyId: input.companyId, recordType: SWITCH_RECORD, recordId: row.id, action: 'SWITCH_CHANGED',
      summary: `Set ${agentName(input.agentKey)} to ${SWITCH_WORDS[ask.state]}.${cap}`,
      personId: input.personId, heldAs: input.heldAs, actingEntityId: ask.actingEntityId,
    })
    return row
  })
}
