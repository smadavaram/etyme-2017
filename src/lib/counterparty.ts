/**
 * Who a firm works with, and as what.
 *
 * ── The model this replaces ──────────────────────────────────────────
 *
 * Partnership: symmetric, untyped, and never written by anything in the
 * product's life — the audit found `partnership.create` appears zero
 * times in the repository. A status enum nothing could move out of
 * PENDING, because nothing inserted a row.
 *
 * The replacement is directional and typed, because "Wipro" is not a
 * fact about a relationship. Wipro is somebody's client, somebody
 * else's prime, and a third firm's supplier, all in the same week. Each
 * firm keeps its own register, and the register is private — who you
 * sell to is commercial information.
 *
 * ── Where the register meets the agreements ──────────────────────────
 *
 * A MasterAgreement already implies a relationship: its vendor sells to
 * its client. The register does not duplicate that — it derives it, and
 * adds what agreements cannot hold: the prospect you are courting, the
 * prime you sit under without paper yet, the firm you have blocked.
 * Deriving instead of duplicating means the two can never disagree.
 */

import { hasPermission } from '@/lib/permissions'

export type Relationship = 'CLIENT' | 'SUPPLIER' | 'PRIME' | 'MSP'
export type Status = 'PROSPECT' | 'ACTIVE' | 'DORMANT' | 'BLOCKED'

export const RELATIONSHIPS: Record<Relationship, { label: string; means: string }> = {
  CLIENT: { label: 'Client', means: 'They buy from us. Our bills go to them.' },
  SUPPLIER: { label: 'Supplier', means: 'We buy from them. Their people, our placements.' },
  PRIME: { label: 'Prime', means: 'They hold the client relationship; our work flows through them.' },
  MSP: { label: 'MSP', means: 'They run the program our work goes into.' },
}

export interface RegisterRow {
  otherCompanyId: string
  otherCompanyName: string
  relationship: Relationship
  status: Status
  /** True where an agreement backs it, false where it is register-only. */
  hasAgreement: boolean
  says: string
}

export interface MsaLite {
  vendorId: string
  clientId: string
  otherName: string
}

export interface StoredRow {
  otherCompanyId: string
  otherCompanyName: string
  relationship: string
  status: string
}

/**
 * The register a screen shows: stored rows, unioned with what the
 * agreements already prove.
 *
 * An MSA where we are the vendor makes the other side a CLIENT; where we
 * are the client, a SUPPLIER. A stored row for the same pair and
 * relationship wins on status — an agreement proves you trade, not that
 * you still want to.
 */
export function register(
  companyId: string,
  stored: StoredRow[],
  msas: MsaLite[]
): RegisterRow[] {
  const out = new Map<string, RegisterRow>()

  for (const m of msas) {
    const isVendor = m.vendorId === companyId
    const otherId = isVendor ? m.clientId : m.vendorId
    const relationship: Relationship = isVendor ? 'CLIENT' : 'SUPPLIER'
    out.set(`${otherId}:${relationship}`, {
      otherCompanyId: otherId,
      otherCompanyName: m.otherName,
      relationship,
      status: 'ACTIVE',
      hasAgreement: true,
      says: `${RELATIONSHIPS[relationship].label} — an agreement is on file.`,
    })
  }

  for (const r of stored) {
    if (!(r.relationship in RELATIONSHIPS)) continue
    const key = `${r.otherCompanyId}:${r.relationship}`
    const fromMsa = out.get(key)
    out.set(key, {
      otherCompanyId: r.otherCompanyId,
      otherCompanyName: r.otherCompanyName,
      relationship: r.relationship as Relationship,
      // The stored status wins: an agreement proves you trade, not that
      // you still want to. BLOCKED on the register blocks, MSA or not.
      status: (r.status in { PROSPECT: 1, ACTIVE: 1, DORMANT: 1, BLOCKED: 1 }
        ? r.status
        : 'ACTIVE') as Status,
      hasAgreement: fromMsa?.hasAgreement ?? false,
      says:
        r.status === 'BLOCKED'
          ? `Blocked. Nothing moves between you until somebody unblocks it.`
          : r.status === 'PROSPECT'
            ? `${RELATIONSHIPS[r.relationship as Relationship].label} you are courting — no agreement yet.`
            : `${RELATIONSHIPS[r.relationship as Relationship].label}${fromMsa ? ' — an agreement is on file.' : '.'}`,
    })
  }

  return [...out.values()].sort(
    (a, b) => a.otherCompanyName.localeCompare(b.otherCompanyName) || a.relationship.localeCompare(b.relationship)
  )
}

export interface RemoveVerdict {
  may: boolean
  says: string
}

/**
 * Whether a counterparty may be removed from the register.
 *
 * Not while money or people are live between you. Removing the register
 * row under a running contract does not end the contract — it just makes
 * the contract's counterparty invisible on the one screen that lists who
 * you deal with, which is worse than either keeping or ending it.
 */
export function mayRemove(liveContracts: number, unpaidInvoices: number): RemoveVerdict {
  if (liveContracts > 0) {
    return {
      may: false,
      says: `${liveContracts} live contract${liveContracts === 1 ? '' : 's'} run between you. End or reassign them first — removing the register row would only hide them.`,
    }
  }
  if (unpaidInvoices > 0) {
    return {
      may: false,
      says: `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? '' : 's'} sit between you. Settle or write off before removing them from the register.`,
    }
  }
  return { may: true, says: 'Nothing live between you. Mark them DORMANT to keep the history, or remove the row.' }
}

// ── The judgment somebody sets on a counterparty ─────────────────────

export const RISK_LEVELS = ['OK', 'WATCH', 'AT_RISK'] as const

export interface RiskJudgementVerdict {
  ok: boolean
  says: string
}

/**
 * A risk level is a judgment, and a judgment needs a date to be
 * remade. One set without a review date is one nobody will remember to
 * revisit — the supplier-risk sweep flags exactly that, and refusing it
 * at the door beats flagging it forever.
 */
export function riskJudgement(level: string, reviewBy: Date | null, on: Date): RiskJudgementVerdict {
  if (!RISK_LEVELS.includes(level as any)) {
    return { ok: false, says: `A risk level is ${RISK_LEVELS.join(', ')} — not "${level}".` }
  }
  if (!reviewBy) {
    return {
      ok: false,
      says: 'Set a date to look again. A judgment with no review date is one nobody will remember to remake.',
    }
  }
  if (reviewBy.getTime() <= on.getTime()) {
    return { ok: false, says: 'The review date has to be in the future, or it is already overdue.' }
  }
  return { ok: true, says: `${level}, to be looked at again by ${reviewBy.toISOString().slice(0, 10)}.` }
}

// ── Who may put a firm on the register, and what it makes them ────────

export interface AddAsk {
  /** Does the caller already hold a seat at a company? */
  seatedAt: { id: string; name: string } | null
  /** What that seat holds. Empty for somebody with no seat. */
  permissions: readonly string[]
  /** What the new firm is to the caller's firm, if they said. */
  relationship?: string | null
  /**
   * The Kind chosen on the form. "Company — not classified yet"
   * (UNCLASSIFIED) records a firm with no position, so it asks for no
   * relationship (founder, 2026-11-12).
   */
  kind?: string | null
}

export interface AddVerdict {
  ok: boolean
  /**
   * Whether creating it seats the creator as its Owner.
   *
   * True only at the sign-up door — somebody with no seat anywhere
   * registering their own firm. A record of a firm you trade with never
   * makes you its owner, whatever else it does.
   */
  ownsIt: boolean
  says: string
}

/**
 * Whether this caller may create a company, and what it makes them.
 *
 * ── The walk that produced this ──────────────────────────────────────
 *
 * 2026-09-21, signed in as Karthik Menon — an integrator's own W2
 * holding two read permissions. "Add company" worked: a real company
 * (`isDemo: false`), with Karthik granted **Owner, permissions `*`**.
 * Because a person's contexts are read most-recently-granted first,
 * that seat then outranked his employer's, and every page he opened
 * read "Walk test — functional review" instead of Teleworld Solutions.
 * No confirmation, no refusal, no "you already work at Teleworld".
 *
 * Two different acts wear one button:
 *
 *   · **Founding a firm** — the sign-up door. Somebody with no seat
 *     anywhere, including a consultant registering their own one-person
 *     corporation, becomes its Owner. That is what registering means.
 *   · **Recording a counterparty** — somebody already seated writing
 *     down a firm they trade with, so a contract, an invitation or an
 *     invoice has something to point at. That is the register
 *     (`Counterparty`), it needs the permission that manages the
 *     register, and it makes the creator nothing at all at the new firm.
 *     A client of ours is not a company we own.
 *
 * The permission is `vendors.manage`, the one that already governs the
 * supplier register, rather than a new key: who a firm trades with is
 * one desk's job whichever direction the trade runs.
 */
export function mayAddCompany(ask: AddAsk): AddVerdict {
  if (ask.kind === 'UNCLASSIFIED') return mayRecordCompany(ask)
  if (!ask.seatedAt) {
    return {
      ok: true,
      ownsIt: true,
      says: 'Registering a firm of your own seats you as its Admin. You become its Owner once you prove the domain and yourself, under Setup → Prove ownership.',
    }
  }

  // `hasPermission`, not a raw includes: an owner holds everything as
  // the single wildcard `*` and never as a list, so comparing strings
  // here would refuse exactly the people who can do the most.
  if (!hasPermission(ask.permissions, 'vendors.manage')) {
    return {
      ok: false,
      ownsIt: false,
      says:
        `Adding a firm to ${ask.seatedAt.name}'s register is for whoever manages who you ` +
        `trade with. Ask whoever runs your suppliers and clients to add it, or ask them for ` +
        `that access.`,
    }
  }

  const relationship = String(ask.relationship ?? '')
  if (!(relationship in RELATIONSHIPS)) {
    return {
      ok: false,
      ownsIt: false,
      says:
        `Say what this firm is to ${ask.seatedAt.name} — a client, a supplier, a prime or an ` +
        `MSP. A company on the register with no relationship on it is a name ` +
        `nothing can point at.`,
    }
  }

  return {
    ok: true,
    ownsIt: false,
    says:
      `Recorded on ${ask.seatedAt.name}'s register as a ${RELATIONSHIPS[relationship as Relationship].label.toLowerCase()}. ` +
      `You are not seated there: a firm you trade with is not a firm you own.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// WHO A BUYER BUYS FROM
// ═════════════════════════════════════════════════════════════════════

/**
 * The facts that make a firm a buyer's supplier, gathered by the caller
 * (`lib/suppliers-of`). No database in here.
 *
 * Four ways, and any one is enough: the buyer pays a sell line the firm
 * raised (it has somebody on site — the rung the buyer pays, never the
 * rung below it, so a prime's sub-vendor is not the client's supplier by
 * this route); an agreement with the buyer as client; the buyer's own
 * register naming the firm as a supplier or a prime; a buy line the
 * buyer pays the firm on (a prime buying from its sub).
 *
 * An invitation still walking supplier onboarding does not count. A
 * purchase order commits money, and a firm the client has not finished
 * qualifying is not yet a firm it buys from.
 */
export interface SupplierFacts {
  buyerId: string
  /** `SellContract.companyId` where `clientCompanyId` is the buyer. */
  sellersPaid: string[]
  /** `MasterAgreement.vendorId` where `clientId` is the buyer. */
  agreementVendors: string[]
  /** The buyer's own register. */
  register: { otherCompanyId: string; relationship: string; status: string }[]
  /** `BuyContract.vendorCompanyId` where `companyId` is the buyer. */
  buysFrom: (string | null)[]
  /** Companies the buyer has blocked, by the blacklist. */
  blacklisted: string[]
}

export type SupplierStanding = 'SUPPLIER' | 'BLOCKED' | 'NONE'

export interface Suppliers {
  /** Firms the buyer may raise an order to. */
  ids: Set<string>
  /** Firms that would be suppliers and are blocked. */
  blocked: Set<string>
}

export function suppliersFrom(f: SupplierFacts): Suppliers {
  const any = new Set<string>()
  for (const id of f.sellersPaid) any.add(id)
  for (const id of f.agreementVendors) any.add(id)
  for (const id of f.buysFrom) if (id) any.add(id)
  for (const r of f.register) {
    if (r.relationship === 'SUPPLIER' || r.relationship === 'PRIME') any.add(r.otherCompanyId)
  }
  any.delete(f.buyerId)

  const blocked = new Set<string>()
  for (const r of f.register) if (r.status === 'BLOCKED') blocked.add(r.otherCompanyId)
  for (const id of f.blacklisted) blocked.add(id)

  const ids = new Set<string>()
  const blockedSuppliers = new Set<string>()
  for (const id of any) (blocked.has(id) ? blockedSuppliers : ids).add(id)
  return { ids, blocked: blockedSuppliers }
}

export function supplierStanding(s: Suppliers, sellerId: string): SupplierStanding {
  if (s.ids.has(sellerId)) return 'SUPPLIER'
  if (s.blocked.has(sellerId)) return 'BLOCKED'
  return 'NONE'
}

// ── The account manager on a client relationship (2026-11-08) ─────────

/**
 * The role that names itself the account manager on a client. Shipped by
 * that name at a supplier, an integrator and an MSP (lib/company-defaults).
 */
export const ACCOUNT_MANAGER_ROLE = 'Account Manager'

/**
 * Who may name the account manager on a client's record: the Owner and
 * the Admin (they run the team, `team.manage`), and an Account Manager.
 * Pure.
 */
export function mayNameAccountManager(permissions: readonly string[], roleName: string | null | undefined): boolean {
  return hasPermission(permissions, 'team.manage') || roleName === ACCOUNT_MANAGER_ROLE
}

export const NAME_ACCOUNT_MANAGER_REFUSED =
  'The Owner, an Admin or an Account Manager names the account manager on a client.'

export const accountManagerNotSeated = (name: string, firm: string) =>
  `${name} is not seated at ${firm}, so they cannot be the account manager on its client. Invite them to ${firm} first.`

export const accountManagerSays = (person: string | null, client: string) =>
  person
    ? `${person} is the account manager on ${client}. Sales commission on lines sold to ${client} goes to them where the job names no owner here.`
    : `Nobody is named as the account manager on ${client} now.`


// ═════════════════════════════════════════════════════════════════════
// A COMPANY NOT CLASSIFIED YET, AND ITS POSITIONS (founder, 2026-11-12)
// ═════════════════════════════════════════════════════════════════════
//
// Two facts, never one. The Kind is what a company is (a supplier, a
// client, an MSP, an integrator, a one-person firm, or "Company — not
// classified yet"). The position is where it sits with *us*: a Customer
// above us, a Supplier below us, a Prime, an MSP. A position lives on
// the relationship record between the two firms (the register row, and
// for a Customer the agreement record), never on the company, so one firm
// can be a Customer and a Supplier at once and a Kind never decides
// either. Nothing in this section reads a company's Kind except where it
// says so and why.

/** Where a company sits with the reader. CUSTOMER is the register's CLIENT. */
export type Position = 'CUSTOMER' | 'SUPPLIER' | 'PRIME' | 'MSP'

export const POSITION_OF: Record<Relationship, Position> = {
  CLIENT: 'CUSTOMER', SUPPLIER: 'SUPPLIER', PRIME: 'PRIME', MSP: 'MSP',
}

export const POSITION_WORDS: Record<Position, string> = {
  CUSTOMER: 'Customer', SUPPLIER: 'Supplier', PRIME: 'Prime', MSP: 'MSP',
}

/** The two positions a person gives a company by extending it. */
export type ExtendAs = 'SUPPLIER' | 'CUSTOMER'
export const EXTEND_AS: Record<ExtendAs, Relationship> = { SUPPLIER: 'SUPPLIER', CUSTOMER: 'CLIENT' }

/** The badge on the Companies list for a company holding no position with the reader. */
export const NOT_CLASSIFIED = 'Not classified'
/** The one line the Add a company form always carries. */
export const NEVER_EMAILS = 'Saving a company never emails them.'
/** The first Kind on the form. */
export const NOT_CLASSIFIED_KIND_LABEL = 'Company — not classified yet'

const ORDER: Position[] = ['CUSTOMER', 'SUPPLIER', 'PRIME', 'MSP']

/**
 * The positions a company holds with the reader. Pure.
 *
 * `stored` is the reader's own register rows for that company;
 * `derived` is what `register()` returned for it (stored rows unioned
 * with agreements). For a company of kind UNCLASSIFIED only the explicit
 * register rows give a position: an agreement written elsewhere never
 * classifies a firm nobody classified. Every other company reads exactly
 * as `register()` already read it.
 */
export function positionsOf(input: {
  kind: string
  stored: readonly { relationship: string }[]
  derived: readonly { relationship: string }[]
}): Position[] {
  const rows = input.kind === 'UNCLASSIFIED' ? input.stored : [...input.stored, ...input.derived]
  const held = new Set<Position>()
  for (const r of rows) if (r.relationship in POSITION_OF) held.add(POSITION_OF[r.relationship as Relationship])
  return ORDER.filter((p) => held.has(p))
}

/** The reader recorded this company and nobody has claimed it. Pure. */
export function isMine(company: { claimedAt: Date | string | null; listedById: string | null }, me: string): boolean {
  return company.claimedAt == null && company.listedById === me
}

/**
 * "Not classified", as a screen means it: this company is on my
 * Companies list because I recorded it, and it holds no position with
 * me. A firm that is on my list only through work between us (a
 * contract, an order) keeps reading as it does today. Pure.
 */
export function isNotClassified(input: { mine: boolean; positions: readonly Position[] }): boolean {
  return input.mine && input.positions.length === 0
}

/**
 * Who may record a company with no position. A seat that manages who the
 * firm trades with, the same seats that may add a company today. Nobody
 * founds their own firm as "not classified". Pure.
 */
export function mayRecordCompany(ask: Pick<AddAsk, 'seatedAt' | 'permissions'>): AddVerdict {
  if (!ask.seatedAt) {
    return {
      ok: false,
      ownsIt: false,
      says: 'Say what kind of company you are registering: a supplier, a client, an MSP, an integrator or your own one-person company.',
    }
  }
  if (!hasPermission(ask.permissions, 'vendors.manage')) {
    return {
      ok: false,
      ownsIt: false,
      says:
        `Adding a company to ${ask.seatedAt.name}'s Companies list is for whoever manages who you ` +
        `trade with. Ask them to add it, or ask them for that access.`,
    }
  }
  return {
    ok: true,
    ownsIt: false,
    says:
      `Recorded on ${ask.seatedAt.name}'s Companies list, not classified yet. ${NEVER_EMAILS} ` +
      `Extend it to Supplier or Customer when you start working together.`,
  }
}

/** A firm's name as two names are compared: no case, spaces or punctuation. Pure. */
export function firmNameKey(name: string): string {
  return String(name ?? '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * The company on my own list already holding this name, if one does.
 * Pure; `mine` is the companies the caller recorded itself.
 */
export function sameNameAmong<T extends { id: string; name: string }>(name: string, mine: readonly T[]): T | null {
  const key = firmNameKey(name)
  if (!key) return null
  return mine.find((c) => firmNameKey(c.name) === key) ?? null
}

export const sameNameRefused = (existing: { name: string }) =>
  `${existing.name} is on your Companies list already. Open it there rather than record it twice.`

export type PositionVerdict =
  | { ok: true; as: ExtendAs; relationship: Relationship; already: boolean; says: string }
  | { ok: false; status: number; code: string; field?: string; says: string }

/** What `as` asks for, read strictly: SUPPLIER or CUSTOMER, nothing else. */
export function readExtendAs(as: unknown): ExtendAs | null {
  const v = String(as ?? '').toUpperCase()
  return v === 'SUPPLIER' || v === 'CUSTOMER' ? v : null
}

const positionWord = (as: ExtendAs) => (as === 'CUSTOMER' ? 'customer' : 'supplier')

/**
 * Whether a company may be extended to Supplier or to Customer. Pure.
 *
 * Irrespective of company type: `other` carries no Kind, on purpose, so
 * the rule cannot read one. Any company the caller has on its own list,
 * or already works with, may be extended either way, and both at once. A
 * firm on Etyme the caller does not work with is asked to link instead,
 * because a position on one's own register is what lets a contract name
 * a firm, and that is not one side's to give itself.
 */
export function mayExtend(ask: {
  as: unknown
  me: { id: string; name: string }
  permissions: readonly string[]
  other: { id: string; name: string; claimedAt: Date | string | null; listedById: string | null; slug?: string | null }
  /** `workTogether` between the two firms, read by the caller. */
  worksTogether: boolean
  /** What the other firm already is to the caller (`positionsOf`). */
  positions: readonly Position[]
}): PositionVerdict {
  if (!hasPermission(ask.permissions, 'vendors.manage')) {
    return {
      ok: false, status: 403, code: 'FORBIDDEN',
      says: `Extending a company on ${ask.me.name}'s list is for whoever manages who you trade with. Ask them to do it, or ask them for that access.`,
    }
  }
  const as = readExtendAs(ask.as)
  if (!as) return { ok: false, status: 422, code: 'VALIDATION', field: 'as', says: 'Say whether to extend it to Supplier or to Customer.' }
  const word = positionWord(as)
  if (ask.other.id === ask.me.id) {
    return { ok: false, status: 422, code: 'OWN_COMPANY', says: `${ask.other.name} is your own company, so it cannot be your ${word} too.` }
  }
  if (ask.other.claimedAt != null && !ask.worksTogether) {
    return { ok: false, status: 409, code: 'ALREADY_ON_ETYME', says: alreadyOnEtymeSays(ask.other, word) }
  }
  if (ask.other.claimedAt == null && ask.other.listedById !== ask.me.id && !ask.worksTogether) {
    return {
      ok: false, status: 403, code: 'NOT_YOURS',
      says: `${ask.other.name} is not on your Companies list. Add it there first, then extend it.`,
    }
  }
  const relationship = EXTEND_AS[as]
  if (ask.positions.includes(as)) {
    return { ok: true, as, relationship, already: true, says: `${ask.other.name} is already your ${word}. Nothing changed.` }
  }
  return {
    ok: true, as, relationship, already: false,
    says:
      as === 'CUSTOMER'
        ? `${ask.other.name} is your customer now, with no agreement signed yet. What kind of company it is did not change.`
        : `${ask.other.name} is your supplier now. What kind of company it is did not change. To qualify them, start from Suppliers.`,
  }
}

// The same sentence lib/off-system writes, kept here so this file stays
// free of a runtime import from it (off-system reads this file's types).
function alreadyOnEtymeSays(them: { name: string; slug?: string | null }, as: string): string {
  const where = them.slug ? `, at ${them.slug}.etyme.com` : ''
  return (
    `${them.name} is already on Etyme${where}, so no copy of them was made. ` +
    `Ask them to link, as your ${as}: once they say yes, each of you has the other on your companies.`
  )
}

/** What hangs off one position between two firms, counted by the caller. */
export interface PositionWork {
  orders: number
  lines: number
  /** Bills sent upward, or invoice receipts from below, not settled. */
  bills: number
  signedAgreement: boolean
  submissions: number
  openInvitations: number
  supplierRequests: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The work hanging off a position, said as a list. Empty where none. Pure. */
export function workSaid(w: PositionWork): string[] {
  const out: string[] = []
  if (w.orders) out.push(plural(w.orders, 'order', 'orders'))
  if (w.lines) out.push(plural(w.lines, 'contract line', 'contract lines'))
  if (w.bills) out.push(plural(w.bills, 'bill or invoice receipt', 'bills or invoice receipts'))
  if (w.signedAgreement) out.push('a signed agreement')
  if (w.submissions) out.push(plural(w.submissions, 'submission', 'submissions'))
  if (w.openInvitations) out.push(plural(w.openInvitations, 'open job invitation', 'open job invitations'))
  if (w.supplierRequests) out.push(plural(w.supplierRequests, 'supplier request', 'supplier requests'))
  return out
}

/**
 * Whether a position may be taken off a company. Pure.
 *
 * Removing a position takes away that one relationship record (and for a
 * Customer the unsigned agreement record extending wrote) and leaves the
 * other position and the Kind as they were. It is refused while real
 * work hangs off it, because taking the record away would only hide that
 * work from the one list that says who you deal with.
 */
export function mayRemovePosition(ask: {
  as: unknown
  me: { id: string; name: string }
  permissions: readonly string[]
  other: { id: string; name: string }
  positions: readonly Position[]
  work: PositionWork
}): PositionVerdict & { notClassifiedAfter?: boolean } {
  if (!hasPermission(ask.permissions, 'vendors.manage')) {
    return {
      ok: false, status: 403, code: 'FORBIDDEN',
      says: `Changing what a company is to ${ask.me.name} is for whoever manages who you trade with. Ask them to do it, or ask them for that access.`,
    }
  }
  const as = readExtendAs(ask.as)
  if (!as) return { ok: false, status: 422, code: 'VALIDATION', field: 'as', says: 'Say whether to remove Supplier or Customer.' }
  const word = positionWord(as)
  if (!ask.positions.includes(as)) {
    return { ok: false, status: 404, code: 'NOT_HELD', says: `${ask.other.name} is not your ${word}, so there is nothing to remove.` }
  }
  const hangs = workSaid(ask.work)
  if (hangs.length > 0) {
    const list = hangs.length === 1 ? hangs[0] : `${hangs.slice(0, -1).join(', ')} and ${hangs[hangs.length - 1]}`
    return {
      ok: false, status: 409, code: 'STILL_IN_USE',
      says: `${ask.other.name} stays your ${word} while ${list} ${hangs.length === 1 && !/s$/.test(hangs[0]) ? 'hangs' : 'hang'} off it. End or move that work first.`,
    }
  }
  const left = ask.positions.filter((p) => p !== as)
  return {
    ok: true, as, relationship: EXTEND_AS[as], already: false, notClassifiedAfter: left.length === 0,
    says:
      `${ask.other.name} is no longer your ${word}. What kind of company it is did not change.` +
      (left.length === 0 ? ` It stays on your Companies list, not classified.` : ` It is still your ${left.map((p) => POSITION_WORDS[p].toLowerCase()).join(' and ')}.`),
  }
}

/** The Kinds a person may set on a company they recorded. */
export const KINDS_TO_SET = ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as const
export type KindToSet = (typeof KINDS_TO_SET)[number]
const KIND_SET_WORDS: Record<KindToSet, string> = { VENDOR: 'a supplier', CLIENT: 'a client', MSP: 'an MSP', GSI: 'an integrator' }

export type KindSetVerdict =
  | { ok: true; to: KindToSet; already: boolean; says: string }
  | { ok: false; status: number; code: string; field?: string; says: string }

/**
 * Whether the caller may say what kind of company a firm it recorded is.
 * Pure.
 *
 * Only a company the caller recorded itself, that nobody has claimed and
 * nobody is seated at: a firm on Etyme says what it is through its own
 * Owner, never through somebody else's list. Setting the Kind never gives
 * a position, and a position never sets the Kind.
 */
export function maySetRecordedKind(ask: {
  to: unknown
  me: { id: string; name: string }
  permissions: readonly string[]
  other: { id: string; name: string; kind: string; claimedAt: Date | string | null; listedById: string | null; seats: number }
}): KindSetVerdict {
  if (!hasPermission(ask.permissions, 'vendors.manage')) {
    return {
      ok: false, status: 403, code: 'FORBIDDEN',
      says: `Saying what kind of company ${ask.other.name} is belongs to whoever manages who you trade with. Ask them to do it, or ask them for that access.`,
    }
  }
  if (ask.other.claimedAt != null || ask.other.seats > 0) {
    return {
      ok: false, status: 403, code: 'ON_ETYME',
      says: `${ask.other.name} is on Etyme, so only its own Owner says what kind of company it is.`,
    }
  }
  if (ask.other.listedById !== ask.me.id) {
    return { ok: false, status: 403, code: 'NOT_YOURS', says: `${ask.other.name} is not on your Companies list, so its kind is not yours to set.` }
  }
  const to = String(ask.to ?? '').toUpperCase()
  if (!(KINDS_TO_SET as readonly string[]).includes(to)) {
    return {
      ok: false, status: 422, code: 'VALIDATION', field: 'kind',
      says: `Say what kind of company ${ask.other.name} is: a supplier, a client, an MSP or an integrator.`,
    }
  }
  const k = to as KindToSet
  if (ask.other.kind === k) return { ok: true, to: k, already: true, says: `${ask.other.name} is already ${KIND_SET_WORDS[k]}. Nothing changed.` }
  return {
    ok: true, to: k, already: false,
    says: `${ask.other.name} is ${KIND_SET_WORDS[k]} now. What it is to you did not change.`,
  }
}

/**
 * A company nobody classified cannot be invited to take its page: a claim
 * would seat somebody at a company with no roles. Pure.
 */
export function mayInviteRecorded(company: { name: string; kind: string }): { ok: true } | { ok: false; says: string } {
  if (company.kind === 'UNCLASSIFIED') {
    return { ok: false, says: `Say what kind of company ${company.name} is before you invite them.` }
  }
  return { ok: true }
}

/**
 * The claim link's refusal for a company nobody classified. It never
 * seats anybody at a company with no roles and never reads it as a
 * supplier. Pure.
 */
export function mayClaimRecorded(company: { name: string; kind: string }): { ok: true } | { ok: false; says: string } {
  if (company.kind === 'UNCLASSIFIED') {
    return {
      ok: false,
      says: `Nobody has said what kind of company ${company.name} is yet, so this link cannot seat you there. Ask the firm that sent it to set the kind, then open the link again.`,
    }
  }
  return { ok: true }
}
