/**
 * Who checks a supplier's bank details before it is paid, and what a
 * held receipt says about it. Pure: no database in here.
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The founder's tester on production, 2026-11-08, item 2: every bill
 * Computer Systems sent the demo client was held "bank details not
 * checked", and the client has no Finance seat, so nobody could check
 * them and nothing could be paid. The only door that recorded a check
 * was the supplier walk's Finance item, and a supplier already on the
 * panel never walks it. A hold nobody can lift is a refusal in disguise.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * Coordinator's call, reversible in a sentence: where the paying firm has
 * a seat in a role named Finance, Finance checks. Where it has none, the
 * check falls back to the seat that pays (`payments.record`, the
 * permission Finance's item on the supplier walk stands in on: the AP
 * clerk at a client), because a role nobody has named falls back and
 * never refuses (CLAUDE.md, 2026-09-13). The check is the same record the
 * walk writes (`RemitTo.verifiedAt`, `verifiedById`, `verifiedByCompanyId`:
 * who, when, for which client), and it shows only the bank, the account
 * name and the last four digits, because that is all Etyme keeps.
 *
 * A held receipt says who checks and offers the check to that person;
 * anybody else reads whom to ask. Never a silent hold.
 */

/** The permission that pays a firm, which is also Finance's stand-in on the supplier walk. */
export const BANK_CHECK_PERMISSION = 'payments.record'

/** The role named for the check where a firm has one. */
export const FINANCE_ROLE = 'Finance'

export interface PayerSeat {
  personId: string
  name: string
  roleName: string | null
  permissions: readonly string[]
}

export interface BankCheckers {
  /** FINANCE: a Finance seat checks. FALLBACK: no Finance seat, the seat that pays checks. NOBODY: no seat may. */
  by: 'FINANCE' | 'FALLBACK' | 'NOBODY'
  people: { personId: string; name: string }[]
}

const holds = (s: PayerSeat, p: string) => s.permissions.includes(p) || s.permissions.includes('*')

/** Who at the paying firm checks a supplier's bank details. */
export function bankCheckers(seats: readonly PayerSeat[]): BankCheckers {
  const uniq = (xs: readonly PayerSeat[]) => {
    const seen = new Set<string>()
    return xs.filter((s) => (seen.has(s.personId) ? false : (seen.add(s.personId), true)))
      .map((s) => ({ personId: s.personId, name: s.name }))
  }
  const finance = seats.filter((s) => s.roleName === FINANCE_ROLE)
  if (finance.length > 0) return { by: 'FINANCE', people: uniq(finance) }
  // The seat that pays, the named desk (the AP clerk) before a seat that
  // holds everything (the Owner), so a sentence names the desk.
  const pays = seats.filter((s) => holds(s, BANK_CHECK_PERMISSION))
  if (pays.length > 0) {
    const desk = pays.filter((s) => !s.permissions.includes('*'))
    return { by: 'FALLBACK', people: uniq([...desk, ...pays.filter((s) => s.permissions.includes('*'))]) }
  }
  return { by: 'NOBODY', people: [] }
}

/** Whether this person may check, and the sentence where not. */
export function mayCheckBank(
  personId: string,
  checkers: BankCheckers,
  payer: string,
): { ok: true } | { ok: false; says: string } {
  if (checkers.people.some((p) => p.personId === personId)) return { ok: true }
  if (checkers.by === 'NOBODY') {
    return { ok: false, says: `Nobody at ${payer} pays suppliers yet, so nobody can check their bank details. Give a seat the AP Clerk or Finance role first.` }
  }
  return { ok: false, says: `${namesOf(checkers)} checks a supplier’s bank details at ${payer}.` }
}

/** "Imelda Santoro", "Imelda Santoro or Rosalind Tay", "A, B or C" — desks named first, the Owner last. */
export function namesOf(checkers: BankCheckers): string {
  const names = checkers.people.map((p) => p.name).slice(0, 3)
  if (names.length === 0) return 'Nobody'
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

export interface BankFactsShown {
  bankName: string | null
  /** The name on the account, else the legal name. */
  accountName: string | null
  accountLast4: string | null
}

/** Whether the firm has entered anything a person could check. */
export function hasDetails(f: BankFactsShown | null): f is BankFactsShown {
  return !!f && !!f.bankName?.trim() && !!f.accountLast4?.trim()
}

/** "Chase, Computer Systems Inc, account ending 4471". */
export function factsSay(f: BankFactsShown): string {
  return [f.bankName, f.accountName, f.accountLast4 ? `account ending ${f.accountLast4}` : null].filter(Boolean).join(', ')
}

export interface BankHeld {
  headline: 'Held: bank details not checked'
  /** The sentence the receipt says, to this reader. */
  says: string
  /** Draw "Check them" for this reader. */
  mayCheck: boolean
  /** What the check shows before the yes; null where nothing is entered. */
  facts: BankFactsShown | null
}

/**
 * What a held receipt says about the bank, to this reader. `viewerId`
 * null is the twin or a queue line read by whoever opens it: it names
 * who checks rather than speaking to one of them.
 */
export function bankHeldSays(i: {
  payee: string
  payer: string
  checkers: BankCheckers
  viewerId: string | null
  facts: BankFactsShown | null
}): BankHeld {
  const headline = 'Held: bank details not checked' as const
  const mine = i.viewerId != null && i.checkers.people.some((p) => p.personId === i.viewerId)
  const who = namesOf(i.checkers)
  if (!hasDetails(i.facts)) {
    const then = mine ? 'then you check them and pay' : i.checkers.by === 'NOBODY' ? 'then somebody who pays suppliers checks them' : `then ${who} checks them`
    return {
      headline, mayCheck: false, facts: null,
      says: `${i.payee} has not entered its bank details yet. It enters them under Setup → Bank details; ${then}.`,
    }
  }
  if (mine) return { headline, mayCheck: true, facts: i.facts, says: 'Bank details not checked. Check them, then pay.' }
  if (i.checkers.by === 'NOBODY') {
    return { headline, mayCheck: false, facts: i.facts, says: `Bank details not checked, and nobody at ${i.payer} pays suppliers yet. Give a seat the AP Clerk or Finance role; that seat checks them, then pays.` }
  }
  if (i.viewerId == null) {
    return { headline, mayCheck: false, facts: i.facts, says: `${i.payee}’s bank details are not checked. ${who} checks them on this invoice receipt, then it can be paid.` }
  }
  return { headline, mayCheck: false, facts: i.facts, says: `Bank details not checked. Ask ${who} to check them, then pay.` }
}

/**
 * The check, written: the same three columns the supplier walk's Finance
 * item writes, and the sentence said back.
 */
export function bankCheckWrite(i: {
  payee: string
  payer: { id: string; name: string }
  by: { personId: string; name: string }
  facts: BankFactsShown | null
  at: Date
}):
  | { ok: true; data: { verifiedAt: Date; verifiedById: string; verifiedByCompanyId: string }; says: string }
  | { ok: false; says: string } {
  if (!hasDetails(i.facts)) {
    return { ok: false, says: `${i.payee} has not entered its bank details yet, so there is nothing to check. It enters them under Setup → Bank details.` }
  }
  return {
    ok: true,
    data: { verifiedAt: i.at, verifiedById: i.by.personId, verifiedByCompanyId: i.payer.id },
    says: `${i.by.name} checked ${i.payee}’s bank details for ${i.payer.name}: ${factsSay(i.facts)}. ${i.payee} can be paid.`,
  }
}
