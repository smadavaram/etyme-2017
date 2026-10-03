/**
 * Whose turn it is to sign a week, down a chain.
 *
 * The founder, 2026-09-28 (CLAUDE.md, "The signed week travels down the
 * chain, and each rung accepts it in turn"): *"Supplier still accepts it
 * on its own, or gets forwarded the worker's approved timesheet to
 * approve, and the flow continues."* So the client signs first; the
 * signed week goes to the next rung down, which accepts what it pays;
 * then to the rung below that, down to the worker's employer. No rung
 * accepts before the rung above it has, and every rung accepts the same
 * week — one row, one assertion each, never a re-keyed copy.
 *
 * ── What it was ───────────────────────────────────────────────────────
 *
 * Two signatures on the week: the client's and the employer's. In
 * Northbend ← Computer Systems ← CloudEPA (Helena Marsh), Computer
 * Systems — who pays CloudEPA for every hour — had no step at all: the
 * approve route put it on the employer's branch and refused it, "Only the
 * company that pays this person can accept these hours." And CloudEPA
 * could accept before Northbend had signed, on purpose (`maySign`), so a
 * sub-vendor could run payroll on a week its client never agreed.
 *
 * The ledger was built for this and never used for it: `WorkAssertion`
 * has a PASS_THROUGH role for exactly the firm in the middle
 * (`lib/work-ledger`, `roleOf` in `lib/work-chain`). Nothing wrote one.
 *
 * Pure. The route walks the ladder and reads who has signed; this says
 * whose turn it is and who is told next.
 */

export type SignRole = 'CLIENT_APPROVAL' | 'PASS_THROUGH' | 'EMPLOYER_ACCEPTANCE'

/** One contract on the ladder the week sits under. */
export interface LadderRung {
  sellContractId: string
  /** The firm selling on this rung. */
  companyId: string
  clientCompanyId: string
  endClientCompanyId?: string | null
  /** The rung below, where this firm buys the person from another firm. Null at the bottom. */
  supplierSellContractId?: string | null
}

/** One signature the week needs, in the order it is needed. */
export interface Signer {
  companyId: string
  role: SignRole
  /**
   * The contract this signature is about: for the client, the rung it
   * buys on (the top); for every firm below, the rung it pays on — the
   * one directly under it, or the worker's own for the employer.
   */
  rungId: string
}

/** The ladder, top first and the rung the hours are filed on last. */
export function topDown(rungs: LadderRung[]): LadderRung[] {
  if (rungs.length <= 1) return [...rungs]
  const below = new Set(rungs.map((r) => r.supplierSellContractId).filter((x): x is string => !!x))
  const byId = new Map(rungs.map((r) => [r.sellContractId, r]))
  const top = rungs.find((r) => !below.has(r.sellContractId)) ?? rungs[0]
  const out: LadderRung[] = []
  let at: LadderRung | undefined = top
  while (at && !out.includes(at)) {
    out.push(at)
    at = at.supplierSellContractId ? byId.get(at.supplierSellContractId) : undefined
  }
  return out
}

/**
 * Every signature the week needs, in order: the client, then each firm
 * down the chain accepting what it pays, the employer last.
 *
 * A direct placement is two entries for two firms, or one firm twice,
 * which the route signs in one press as it always has.
 */
export function signersOf(ladderTopDown: LadderRung[]): Signer[] {
  if (ladderTopDown.length === 0) return []
  const top = ladderTopDown[0]
  const last = ladderTopDown.length - 1
  return [
    { companyId: top.endClientCompanyId ?? top.clientCompanyId, role: 'CLIENT_APPROVAL', rungId: top.sellContractId },
    ...ladderTopDown.map((r, i) => ({
      companyId: r.companyId,
      role: (i === last ? 'EMPLOYER_ACCEPTANCE' : 'PASS_THROUGH') as SignRole,
      rungId: i === last ? r.sellContractId : ladderTopDown[i + 1].sellContractId,
    })),
  ]
}

export type Turn =
  | { ok: true; signer: Signer; next: Signer | null }
  | { ok: false; code: 'NOT_ON_CHAIN' | 'ALREADY_SIGNED' | 'NOT_YOUR_TURN'; says: string }

/**
 * Whether it is this firm's turn, and what it is signing.
 *
 * `signed` answers for each signer; `nameOf` names a firm for the
 * refusal. A firm waiting on the rung above is told who, in a sentence,
 * never shown a button that will refuse it.
 */
export function turnOf(
  signers: Signer[],
  companyId: string,
  signed: (s: Signer) => boolean,
  nameOf: (companyId: string) => string
): Turn {
  const mine = signers.filter((s) => s.companyId === companyId)
  if (mine.length === 0) {
    return { ok: false, code: 'NOT_ON_CHAIN', says: 'Only the firms on this placement sign this week.' }
  }
  const pending = mine.find((s) => !signed(s))
  if (!pending) {
    return {
      ok: false,
      code: 'ALREADY_SIGNED',
      says: mine[0].role === 'CLIENT_APPROVAL' ? 'Already approved.' : 'Already accepted.',
    }
  }
  const at = signers.indexOf(pending)
  const waiting = signers.slice(0, at).find((s) => !signed(s))
  if (waiting) {
    return {
      ok: false,
      code: 'NOT_YOUR_TURN',
      says:
        `${nameOf(waiting.companyId)} has not ${waiting.role === 'CLIENT_APPROVAL' ? 'signed' : 'accepted'} this week yet. ` +
        'It comes to you once they have.',
    }
  }
  return { ok: true, signer: pending, next: signers[at + 1] ?? null }
}

/**
 * What the next rung reads when the week reaches it.
 *
 * Names who signed above it and who it pays below it — the worker by
 * name for the employer, the firm under it for anybody in the middle —
 * and never a rate: what each rung pays is on its own contract.
 */
export function tellNext(i: {
  personName: string
  period: string
  hours: number
  signedBy: string
  signedRole: SignRole
  paysName: string
}): { title: string; body: string } {
  const verb = i.signedRole === 'CLIENT_APPROVAL' ? 'signed' : 'accepted'
  return {
    title: `${i.personName}’s week is yours to accept`,
    body:
      `${i.signedBy} ${verb} ${i.hours} hours for ${i.period}. Accept what you pay ${i.paysName} for it; ` +
      'nobody below you pays on this week until you do.',
  }
}

/**
 * Whether this signature is on the week.
 *
 * The client's and the employer's are on the row's two columns as well
 * as the ledger, because weeks signed before the ledger existed carry
 * only the columns. The firm in the middle has only the ledger.
 */
export function signedBy(
  s: Signer,
  week: { clientApprovedAt: Date | null; employerAcceptedAt: Date | null },
  live: { companyId: string; role: string }[]
): boolean {
  const onLedger = live.some((a) => a.companyId === s.companyId && a.role === s.role)
  if (s.role === 'CLIENT_APPROVAL') return week.clientApprovedAt !== null || onLedger
  if (s.role === 'EMPLOYER_ACCEPTANCE') return week.employerAcceptedAt !== null || onLedger
  return onLedger
}
