/**
 * What the program manager's twin may do: three tiers, as data, read by
 * rules and never by a model.
 *
 * Decided by the founder, 2026-10-12 (CLAUDE.md, "The job twin"). A
 * company's role contract is the latest `RoleContract` row for it; with
 * none, the shipped default below, which mirrors CLAUDE.md:
 *
 *   ACTS_ALONE      reversible or tell-only, inside the company, within a
 *                   rule — record a warning, flag a mismatch, remind,
 *                   draft a summary, tell the program owner
 *   NEEDS_APPROVAL  money, anything that leaves the company, anything
 *                   that cannot be put back
 *   NEVER           pay, signatures, who is placed and who is let go,
 *                   another company's data, deciding what the twin asked
 *
 * `tierOf` is the one door. It is arithmetic over a list; nothing here
 * asks a model, so a model talked into anything is still limited to what
 * this file returns.
 *
 * A company may tighten any act. It may not loosen three things, and
 * `checkContract` refuses each in a sentence: a floor act out of NEVER;
 * a money, external or irreversible act into ACTS_ALONE; an act left
 * out of every tier (it would be read as NEVER, and a contract that says
 * less than it means is not one anybody can review).
 */

import { prisma } from '@/lib/db'
import { TWIN_ACTS, ALL_TWIN_ACTS, isTwinAct } from '@/lib/autonomy'

export type Tier = 'ACTS_ALONE' | 'NEEDS_APPROVAL' | 'NEVER'
export type TwinKindName = 'PROGRAM_MANAGER'

export interface Contract {
  /** 0 is the shipped default, which is not a row. */
  version: number
  /** The row, where there is one. */
  id: string | null
  actsAlone: readonly string[]
  needsApproval: readonly string[]
  neverTouches: readonly string[]
}

/** The shipped default, from each act's own properties in lib/autonomy. */
export const DEFAULT_CONTRACT: Contract = (() => {
  const actsAlone: string[] = []
  const needsApproval: string[] = []
  const neverTouches: string[] = []
  for (const name of ALL_TWIN_ACTS) {
    const a = TWIN_ACTS[name]
    if (a.floor) neverTouches.push(name)
    else if (a.money || a.external || !a.alone) needsApproval.push(name)
    else actsAlone.push(name)
  }
  return { version: 0, id: null, actsAlone, needsApproval, neverTouches }
})()

/** The tier an act sits in on one contract. Unknown names are NEVER. */
export function tierIn(contract: Contract, action: string): Tier {
  if (!isTwinAct(action)) return 'NEVER'
  // Floor first: no stored row, however written, moves one of these.
  if (TWIN_ACTS[action].floor) return 'NEVER'
  if (contract.neverTouches.includes(action)) return 'NEVER'
  if (contract.needsApproval.includes(action)) return 'NEEDS_APPROVAL'
  if (contract.actsAlone.includes(action)) {
    const a = TWIN_ACTS[action]
    // A row written before a rule tightened cannot act alone on money.
    return a.money || a.external || !a.alone ? 'NEEDS_APPROVAL' : 'ACTS_ALONE'
  }
  return 'NEVER'
}

/**
 * Why a proposed contract cannot be saved, in sentences. Empty when it can.
 */
export function checkContract(c: {
  actsAlone: readonly string[]
  needsApproval: readonly string[]
  neverTouches: readonly string[]
}): string[] {
  const out: string[] = []
  const all = [...c.actsAlone, ...c.needsApproval, ...c.neverTouches]
  const unknown = [...new Set(all.filter((a) => !isTwinAct(a)))]
  if (unknown.length) out.push(`The twin has no act called ${unknown.join(', ')}. Use the names the contract lists.`)
  const twice = [...new Set(all.filter((a, i) => all.indexOf(a) !== i))]
  if (twice.length) out.push(`${twice.join(', ')} ${twice.length === 1 ? 'is' : 'are'} in more than one tier. Put each act in one.`)
  const missing = ALL_TWIN_ACTS.filter((a) => !all.includes(a))
  if (missing.length) out.push(`Every act needs a tier, and ${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} none.`)
  for (const a of [...c.actsAlone, ...c.needsApproval]) {
    if (isTwinAct(a) && TWIN_ACTS[a].floor) {
      out.push(`${TWIN_ACTS[a].says.replace(/\.$/, '')} stays with a person, whatever the contract says.`)
    }
  }
  for (const a of c.actsAlone) {
    if (!isTwinAct(a) || TWIN_ACTS[a].floor) continue
    const t = TWIN_ACTS[a]
    if (t.money) out.push(`${t.says.replace(/\.$/, '')} moves money, so a person approves it.`)
    else if (t.external) out.push(`${t.says.replace(/\.$/, '')} leaves the company, so a person approves it.`)
    else if (!t.alone) out.push(`${t.says.replace(/\.$/, '')} cannot be done alone.`)
  }
  return out
}

/** The latest contract for a company, or the shipped default. */
export async function contractFor(companyId: string, kind: TwinKindName = 'PROGRAM_MANAGER'): Promise<Contract> {
  const row = await prisma.roleContract.findFirst({
    where: { companyId, twinKind: kind },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, actsAlone: true, needsApproval: true, neverTouches: true },
  })
  return row ?? DEFAULT_CONTRACT
}

/** The one door: which tier an act is in, for this company, today. */
export async function tierOf(companyId: string, action: string, kind: TwinKindName = 'PROGRAM_MANAGER'): Promise<Tier> {
  return tierIn(await contractFor(companyId, kind), action)
}

/**
 * A new version, never an overwrite, with an automation-log row in the
 * same transaction. Refused in sentences before anything is written.
 */
export async function setContract(args: {
  companyId: string
  kind?: TwinKindName
  personId: string
  reason: string
  actsAlone: string[]
  needsApproval: string[]
  neverTouches: string[]
}): Promise<{ ok: true; version: number; id: string } | { ok: false; says: string[] }> {
  const reason = args.reason.trim()
  const says = checkContract(args)
  if (!reason) says.push('Say why the contract is changing. A change with no reason is the first thing an audit asks about.')
  if (says.length) return { ok: false, says }
  const kind = args.kind ?? 'PROGRAM_MANAGER'

  const row = await prisma.$transaction(async (tx) => {
    const last = await tx.roleContract.findFirst({
      where: { companyId: args.companyId, twinKind: kind },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const version = (last?.version ?? 0) + 1
    const created = await tx.roleContract.create({
      data: {
        companyId: args.companyId, twinKind: kind, version,
        actsAlone: args.actsAlone, needsApproval: args.needsApproval, neverTouches: args.neverTouches,
        setByPersonId: args.personId, reason,
      },
      select: { id: true, version: true },
    })
    await tx.automationLog.create({
      data: {
        companyId: args.companyId,
        action: 'TWIN_ROLE_CONTRACT_SET',
        summary: `The program manager’s twin is now on version ${version} of its role contract.`,
        reason,
        payload: {
          roleContractId: created.id, version, byPersonId: args.personId,
          actsAlone: args.actsAlone, needsApproval: args.needsApproval, neverTouches: args.neverTouches,
        },
        // A new version is put back by writing the old lists again, as
        // the next version; the history is never edited.
        reversible: true,
      },
    })
    return created
  })
  return { ok: true, version: row.version, id: row.id }
}
