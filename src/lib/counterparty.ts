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
import { isConsumerDomain } from '@/lib/company-domains'
import { registrableDomain, sameOrganisation } from '@/lib/registrable-domain'

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
        `Adding a firm to ${ask.seatedAt.name}'s Companies list is for whoever manages who you ` +
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
      `Recorded on ${ask.seatedAt.name}'s Companies list as a ${RELATIONSHIPS[relationship as Relationship].label.toLowerCase()}. ` +
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

/**
 * The Kinds Add a company offers, each with the one line that says what it
 * is in the trade's words (fix list of 2026-11-14, A7). A Kind is what a
 * company is, never what it is to you: so "Vendor", never "Supplier".
 * "GSI" is an integrator in this product's words, and a contractor's own
 * corporation is somebody else's one-person company, never "My own".
 */
export const KIND_CHOICES = [
  { kind: 'UNCLASSIFIED', word: NOT_CLASSIFIED_KIND_LABEL, means: 'Not sure yet. Only the name is needed, and the kind can be said later.' },
  { kind: 'VENDOR', word: 'Vendor', means: 'A staffing firm. It puts people forward to jobs and employs them.' },
  { kind: 'CLIENT', word: 'Client', means: 'A company that hires contractors through staffing firms.' },
  { kind: 'MSP', word: 'MSP', means: 'A firm that runs a client’s contractor program for it.' },
  { kind: 'GSI', word: 'Integrator', means: 'Delivers projects with its own people and people it buys in.' },
  { kind: 'CONSULTANT_CORP', word: 'Own company — one person', means: 'A contractor’s own company, with only that person in it.' },
] as const

/** The word and the line for one Kind on Add a company. */
export function kindChoice(kind: string): { word: string; means: string } {
  return KIND_CHOICES.find((k) => k.kind === kind) ?? KIND_CHOICES[0]
}

/**
 * The answer "What are they to you?" starts on, once a Kind is chosen.
 * A client is a customer and an MSP is an MSP; anything else starts as a
 * supplier, as the form did before. Only where the box starts: the
 * person sees it and may change it, and the position is still the one
 * they save (three walkers saved a client as a supplier, 2026-11-14).
 */
export function relationshipForKind(kind: string | null | undefined): Relationship {
  const k = String(kind ?? '').toUpperCase()
  if (k === 'CLIENT') return 'CLIENT'
  if (k === 'MSP') return 'MSP'
  return 'SUPPLIER'
}

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
  /**
   * The reader recorded this company as not classified yet, whatever Kind
   * it has been given since (`recordedNotClassified`). Such a record reads
   * only its own register rows too: setting its Kind never turns a stray
   * agreement into a position (review, 2026-11-13).
   */
  recordedUnclassified?: boolean
}): Position[] {
  const rows = input.kind === 'UNCLASSIFIED' || input.recordedUnclassified ? input.stored : [...input.stored, ...input.derived]
  const held = new Set<Position>()
  for (const r of rows) if (r.relationship in POSITION_OF) held.add(POSITION_OF[r.relationship as Relationship])
  return ORDER.filter((p) => held.has(p))
}

/** Where a company sits with the reader, as a gate reads it (`standingWith` in app/api/companies/positions). */
export interface HeldWith {
  positions: readonly Position[]
  /** The reader's own record, holding no position: the Companies badge. */
  notClassified: boolean
  /** Recorded by the reader as not classified yet, whatever Kind since. */
  recorded: boolean
}

/**
 * Whether a gate must refuse because the company holds none of the
 * positions `need` asks for, decided from the register and never from the
 * Kind. Pure.
 *
 *   - Kind not classified, or recorded here as not classified whatever
 *     Kind it has been given since: it needs one of `need` on the reader's
 *     own register.
 *   - Any other record of the reader's own that holds no position at all:
 *     the Companies list reads it Not classified, so every gate does.
 *   - Anything else (`read` null): the existing rules decide.
 */
export function lacksPosition(
  read: HeldWith | null,
  kind: string | null | undefined,
  need: readonly Position[],
): boolean {
  const held = read?.positions ?? []
  if (kind === 'UNCLASSIFIED' || read?.recorded) return !held.some((p) => need.includes(p))
  return read?.notClassified === true
}

/**
 * The domain somebody typed for a company they are recording, as a note:
 * lower case, with no scheme, no "www.", no path. Null where it does not
 * read as a domain, so nothing odd is kept. Pure.
 */
export function notedDomain(typed: unknown): string | null {
  if (typeof typed !== 'string') return null
  const bare = typed.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0]
  if (!bare || bare.length > 120) return null
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(bare) ? bare : null
}

/** The refusal for a domain box that does not read as a domain. */
export const unreadableDomainSays = (typed: string) =>
  `${typed.length > 60 ? `${typed.slice(0, 60)}…` : typed} does not read as a domain. Type it like northwind-staffing.example, or leave the box empty.`

/**
 * What a domain box holds, read once for every door that has one (Add a
 * company, the clients door, Edit). Blank is no domain. An email address
 * gives its domain, and the reply says so. Anything else that does not
 * read as a domain is refused in a sentence, so nothing typed is dropped
 * silently (2026-11-15: "jobs@…", a port, a trailing dot and plain words
 * were accepted and thrown away). Pure.
 */
export function readTypedDomain(typed: unknown):
  | { ok: true; domain: string | null; says: string | null }
  | { ok: false; says: string } {
  if (typed == null) return { ok: true, domain: null, says: null }
  if (typeof typed !== 'string') return { ok: false, says: 'Type the domain as text, like northwind-staffing.example, or leave the box empty.' }
  const t = typed.trim()
  if (!t) return { ok: true, domain: null, says: null }
  const at = t.lastIndexOf('@')
  if (at >= 0) {
    const local = t.slice(0, at)
    const d = local && !/\s/.test(local) ? notedDomain(t.slice(at + 1)) : null
    if (!d) return { ok: false, says: unreadableDomainSays(t) }
    const own = companyDomainOf(d)
    return { ok: true, domain: own, says: `The domain was taken from the email address you typed: ${own}.` }
  }
  const d = notedDomain(t)
  if (!d) return { ok: false, says: unreadableDomainSays(t) }
  const own = companyDomainOf(d)
  return { ok: true, domain: own, says: own === d ? null : `The company's domain is kept as ${own}, read from ${d}.` }
}

/**
 * The domain a company is stored under: the one somebody registered, so
 * mail.zephyr-foods.example is kept as zephyr-foods.example, the same
 * domain its name is read from and twins are matched by (fix list A2,
 * 2026-11-15). Where no registered domain can be read, what was typed.
 * Pure.
 */
export function companyDomainOf(d: string): string {
  return registrableDomain(d) ?? d
}

/**
 * A firm on Etyme the reader reached only by its own writing (a row on
 * its own register, a job it sent): the reader does not work with it
 * (record 61), so the list names it and nothing else, its drawer is not
 * opened, and its seated people are not listed under Contacts. A record
 * the reader made itself that nobody has claimed is never one. The one
 * rule the Companies list, the drawer and Contacts ask. Pure.
 */
export function notLinkedYet(f: { ownSideOnly: boolean; onEtyme: boolean; mine: boolean }): boolean {
  return f.ownSideOnly && f.onEtyme && !f.mine
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

// ── A company is known by its domain (founder, 2026-11-15: "The email is
// the identifier"). Among the companies one firm recorded itself, the
// same organization's domain is the same company whatever the names say;
// two different domains are two companies even under one name; and only
// where neither side holds a domain does the name decide. Nothing here
// looks a firm up on Etyme: that is `findFirm`, and it is left alone.

/**
 * The domain a company is known by, from what somebody typed: the note
 * form (`notedDomain`), and never a consumer mail domain, because a
 * personal mailbox is nobody's company. Pure.
 */
export function identityDomain(typed: unknown): string | null {
  const d = notedDomain(typed)
  if (!d) return null
  return isConsumerDomain(d) || isConsumerDomain(registrableDomain(d) ?? d) ? null : d
}

/** One company the caller recorded itself, as the twin rule reads it. */
export interface OwnRecord {
  id: string
  name: string
  /** The domain the caller typed for it, where one was kept. */
  domain: string | null
}

export type TwinRead<T extends OwnRecord> =
  /** The same company is on the list already: refuse and offer to open it. */
  | { twin: T; by: 'DOMAIN' | 'NAME'; namesake: null }
  /** Not a twin. `namesake` is another record of the same name, said in the reply. */
  | { twin: null; by: null; namesake: T | null }

/**
 * Whether a company being added is one the caller already recorded. Pure;
 * `own` is only the caller's own unclaimed records.
 *
 *   1. The typed domain is the same organization as a record's domain:
 *      the same company, whatever the names.
 *   2. Both hold a domain and the domains differ: two companies.
 *   3. Neither holds a domain: the name decides, as before.
 *   4. The names match and exactly one side holds a domain: recorded, and
 *      the reply says another company on the list shares the name.
 */
export function twinOnOwnList<T extends OwnRecord>(typed: { name: string; domain: unknown }, own: readonly T[]): TwinRead<T> {
  const domain = identityDomain(typed.domain)
  if (domain) {
    const same = own.find((c) => c.domain != null && (c.domain === domain || sameOrganisation(c.domain, domain)))
    if (same) return { twin: same, by: 'DOMAIN', namesake: null }
  }
  const key = firmNameKey(typed.name)
  const named = key ? own.filter((c) => firmNameKey(c.name) === key) : []
  if (!domain) {
    const bare = named.find((c) => c.domain == null)
    if (bare) return { twin: bare, by: 'NAME', namesake: null }
  }
  return { twin: null, by: null, namesake: named[0] ?? null }
}

/** The refusal for a domain already on the caller's list. */
export const sameDomainRefused = (existing: { name: string; domain: string | null }) =>
  `${existing.name} (${existing.domain}) is on your Companies list already on that domain. Open it there rather than record it twice.`

/** The line a reply carries where another company on the list shares the name. */
/**
 * The activity-log line for a corrected company. It always names the
 * company: a change that left the name alone read "changed the entity type
 * from nothing to LLP" with no company in it (walk, 2026-11-15).
 */
export function recordEditedSummary(byName: string, name: string, changes: readonly { box: string; from: string | null; to: string | null }[]): string {
  const said = (v: string | null) => (v == null ? 'nothing' : v)
  const what = changes.map((c) => `the ${c.box} from ${said(c.from)} to ${said(c.to)}`).join(', ')
  return changes.some((c) => c.box === 'name') ? `${byName} changed ${what}` : `${byName} changed ${what} on ${name}`
}

export const namesakeSays = (namesake: { name: string; domain: string | null }) =>
  namesake.domain
    ? `Another company on your list is also called ${namesake.name}, on ${namesake.domain}.`
    : `Another company on your list is also called ${namesake.name}, with no domain yet.`

/** The line a reply carries where the typed domain was a personal mailbox's. */
export const consumerDomainSays = (typed: string) =>
  `${typed} is a personal email domain, so it was not kept as their company's domain.`

/**
 * Whether the caller may correct a company on its own list: its name, the
 * domain it typed and the entity type. Only a record the caller made that
 * nobody has claimed and nobody is seated at; a firm on Etyme keeps its own
 * name. Pure.
 */
export function mayEditRecord(ask: {
  me: { id: string; name: string }
  permissions: readonly string[]
  other: { id: string; name: string; claimedAt: Date | string | null; listedById: string | null; seats: number }
}): { ok: true } | { ok: false; status: number; code: string; says: string } {
  if (!hasPermission(ask.permissions, 'vendors.manage')) {
    return {
      ok: false, status: 403, code: 'FORBIDDEN',
      says: `Correcting a company on ${ask.me.name}'s list is for whoever manages who you trade with. Ask them to do it, or ask them for that access.`,
    }
  }
  if (ask.other.claimedAt != null || ask.other.seats > 0) {
    return { ok: false, status: 403, code: 'ON_ETYME', says: `${ask.other.name} is on Etyme, so it keeps its own name and domain. Nothing was changed.` }
  }
  if (ask.other.listedById !== ask.me.id) {
    return { ok: false, status: 403, code: 'NOT_YOURS', says: `${ask.other.name} is not your own record, so it is not yours to correct.` }
  }
  return { ok: true }
}

// ── The Companies tiles: every row on the list is in one (2026-11-15) ──

/** One row of the Companies list, as the tiles count it. */
export interface TileRow {
  positions: readonly Position[]
  notClassified: boolean
  /** A firm on Etyme reached only through the caller's own writing: not linked yet. */
  notLinked?: boolean
}

export interface Tiles {
  total: number
  customers: number
  suppliers: number
  primes: number
  msps: number
  notClassified: number
  /** On the list through a contract, an order, an invitation or a seat, holding no position. */
  worksWithYou: number
  /** A firm on Etyme you wrote down or sent a job to, that has not linked with you. */
  notLinked: number
  /** Rows counted in more than one tile: a company can hold two positions. */
  countedTwice: number
}

/** The tile a row with no position sits in. Pure. */
export function noPositionTile(row: TileRow): 'NOT_CLASSIFIED' | 'NOT_LINKED' | 'WORKS_WITH_YOU' | null {
  if (row.positions.length > 0) return null
  if (row.notClassified) return 'NOT_CLASSIFIED'
  if (row.notLinked) return 'NOT_LINKED'
  return 'WORKS_WITH_YOU'
}

/**
 * The rows a filtered Companies list draws, and how many of them the
 * filter itself holds (the press of 2026-11-15: under "Not classified",
 * Extend moved the row out of the filter, and its sentence and Undo went
 * with it, leaving no word anywhere). A row that carries the sentence a
 * press left on it stays where it was until that sentence is closed or
 * the filter is changed; it is drawn, never counted. Order is the list's
 * own. Pure.
 */
export function rowsUnderFilter<R extends { id: string }>(
  rows: readonly R[],
  holds: (row: R) => boolean,
  pressedIds: ReadonlySet<string>,
): { rows: R[]; matching: number } {
  let matching = 0
  const drawn = rows.filter((r) => {
    const h = holds(r)
    if (h) matching++
    return h || pressedIds.has(r.id)
  })
  return { rows: drawn, matching }
}

/** The tiles over the Companies list. Every row is in at least one. Pure. */
export function companyTiles(rows: readonly TileRow[]): Tiles {
  const t: Tiles = { total: rows.length, customers: 0, suppliers: 0, primes: 0, msps: 0, notClassified: 0, worksWithYou: 0, notLinked: 0, countedTwice: 0 }
  for (const r of rows) {
    let n = 0
    if (r.positions.includes('CUSTOMER')) { t.customers++; n++ }
    if (r.positions.includes('SUPPLIER')) { t.suppliers++; n++ }
    if (r.positions.includes('PRIME')) { t.primes++; n++ }
    if (r.positions.includes('MSP')) { t.msps++; n++ }
    const none = noPositionTile(r)
    if (none === 'NOT_CLASSIFIED') { t.notClassified++; n++ }
    if (none === 'NOT_LINKED') { t.notLinked++; n++ }
    if (none === 'WORKS_WITH_YOU') { t.worksWithYou++; n++ }
    if (n > 1) t.countedTwice++
  }
  return t
}

/** The words under a row's "To you" when it holds no position. Never a bare dash. */
export const NO_POSITION_WORDS = {
  WORKS_WITH_YOU: 'Works with you, no position yet',
  NOT_LINKED: 'Not linked yet',
} as const

/** What the Domain column says for a row of the Companies list. Never a bare dash. Pure. */
export function domainCell(row: { domain: string | null; notedDomain?: string | null; notLinked?: boolean }): { domain: string | null; note: string | null } {
  if (row.notLinked) return { domain: null, note: 'Shown once they link' }
  if (row.domain) return { domain: row.domain, note: null }
  if (row.notedDomain) return { domain: row.notedDomain, note: 'typed by you' }
  return { domain: null, note: 'No domain yet' }
}

/** The Etyme address column for a firm on Etyme with no page of its own. */
export const ON_ETYME_NO_PAGE = 'On Etyme, no page'

/**
 * What the Etyme address column says. "Not on Etyme" for a company nobody
 * there has joined: no seat and no claim (a seat with no claim is on
 * Etyme). Never a bare dash. Pure.
 */
export function addressCell(row: { slug: string; onEtyme: boolean; notLinked?: boolean; hasPage?: boolean }): { slug: string | null; note: string | null } {
  if (row.notLinked) return { slug: null, note: 'Not linked yet' }
  // A firm on Etyme with no page has no address to show: its slug is a
  // machine name (the press walk l2b, 2026-11-15, read "world-nike").
  if (row.onEtyme && row.hasPage === false) return { slug: null, note: ON_ETYME_NO_PAGE }
  if (row.onEtyme) return { slug: row.slug, note: null }
  return { slug: null, note: 'Not on Etyme' }
}

/** The one line under the tiles where a company is counted twice. */
export const countedTwiceSays = (n: number) =>
  n === 1
    ? '1 company holds two positions with you, such as customer and supplier, so it is counted under both.'
    : `${n} companies hold two positions with you, such as customer and supplier, so each is counted under both.`

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
      says: 'That company is not on your Companies list. Add it there first, then extend it.',
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
        ? ask.other.claimedAt != null
          // A firm on Etyme: only your own row is written, never an
          // agreement on their book (`writeCustomerPosition`).
          ? `${ask.other.name} is your customer now, with no agreement on file. Record it under Contracts, Agreements. What kind of company it is did not change.`
          : `${ask.other.name} is your customer now, with no agreement signed yet. What kind of company it is did not change.`
        : `${ask.other.name} is your supplier now. What kind of company it is did not change. To qualify them, start from Suppliers.`,
  }
}

// Said only to a caller that already holds this firm on its own register
// (the extend route answers every other caller as it answers an unknown
// id), so the name is the one on the caller's own list. No Etyme address:
// where the firm is found on Etyme is not the caller's to learn from
// here (review, 2026-11-13).
function alreadyOnEtymeSays(them: { name: string }, as: string): string {
  return (
    `${them.name} is already on Etyme, so no copy of them was made. ` +
    `Ask them to link, as your ${as}: once they say yes, each of you has the other on your Companies list.`
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
  /**
   * The position would still be held after its register row is taken off,
   * because an agreement between the two firms gives it and removing the
   * row leaves that agreement (`agreementKeepsPosition`). Then there is
   * nothing a press could take off, so no button and a sentence instead
   * (review, 2026-11-13: the press said it worked and the chip stayed).
   */
  heldByAgreement?: boolean
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
  if (ask.heldByAgreement) {
    return {
      ok: false, status: 409, code: 'HELD_BY_AGREEMENT',
      says: `${ask.other.name} is your ${word} through the agreement between you, not by a choice made here, so it cannot be taken off. The agreement stays as it is.`,
    }
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

/**
 * Where the work that keeps a position is ended, as a link beside the
 * refusal (the press walk l2b, 2026-11-15: "End or move that work first"
 * linked nowhere). An open job invitation is ended by cancelling the job
 * on Jobs (PATCH /api/requisitions/:id, action cancel), which stands every
 * supplier asked down. Drawn only for a seat that may cancel a job, and
 * only where invitations are what hangs; other work has no one page. Pure.
 */
export const END_INVITATIONS_HREF = '/dashboard/requisitions'
export const END_INVITATIONS_WORDS = 'Open Jobs to cancel the job you sent them'

export function workEndsAt(work: PositionWork, permissions: readonly string[]): { href: string; words: string } | null {
  if (!work.openInvitations) return null
  if (!hasPermission(permissions, 'requirements.write')) return null
  return { href: END_INVITATIONS_HREF, words: END_INVITATIONS_WORDS }
}

/** What a history row says about taking it back, read now. */
export const CAN_BE_UNDONE = 'Can be undone'
export const CANNOT_BE_UNDONE_NOW = 'Cannot be undone while work hangs off it'
export const CANNOT_BE_UNDONE = 'Cannot be undone'

/**
 * Whether each row of a company's history can still be taken back, read
 * now and never from the flag stored when the row was written (fix list
 * of 2026-11-14, E3: every row said "Can be undone" for good). Pure.
 *
 * Only an extension is ever said to be undoable: the newest row for its
 * position, while the position is held and Remove would be taken. An
 * extension with work hanging off it says so, and one an agreement holds
 * cannot be undone at all. Where the reader may not remove positions, the
 * row says nothing: somebody else may. Every other row says nothing: no
 * control deletes a recorded company, puts a withdrawn invitation back, or
 * undoes a correction. Rows are newest first.
 */
export function historyUndoSays(
  rows: readonly { action: string; position: Position | null }[],
  now: { positions: readonly Position[]; removable: Partial<Record<ExtendAs, { ok: boolean; code?: string }>> },
): (string | null)[] {
  const seen = new Set<string>()
  return rows.map((r) => {
    if (r.action !== 'COMPANY_EXTENDED' && r.action !== 'COMPANY_POSITION_REMOVED') return null
    if (r.position !== 'SUPPLIER' && r.position !== 'CUSTOMER') return null
    const newest = !seen.has(r.position)
    seen.add(r.position)
    if (!newest || r.action !== 'COMPANY_EXTENDED' || !now.positions.includes(r.position)) return null
    const v = now.removable[r.position]
    if (!v) return null
    if (v.ok) return CAN_BE_UNDONE
    if (v.code === 'STILL_IN_USE') return CANNOT_BE_UNDONE_NOW
    if (v.code === 'HELD_BY_AGREEMENT') return CANNOT_BE_UNDONE
    return null
  })
}

/** The Kinds a person may set on a company they recorded. */
export const KINDS_TO_SET = ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as const
export type KindToSet = (typeof KINDS_TO_SET)[number]
/**
 * The Kind in the words the Companies list prints for it (Vendor, Client,
 * MSP, Integrator), never a position's words: a Kind never says who is a
 * supplier or a customer (walk, 2026-11-14).
 */
const KIND_SET_WORDS: Record<KindToSet, string> = { VENDOR: 'a vendor', CLIENT: 'a client', MSP: 'an MSP', GSI: 'an integrator' }

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
  /** The positions the company holds with the caller (`standingWith`). None: the sentence says it is still not classified. */
  positions?: readonly Position[]
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
  const still = (ask.positions ?? []).length === 0
    ? ` It is still not classified: extend it to Supplier or Customer from its row.`
    : ''
  if (ask.other.kind === k) return { ok: true, to: k, already: true, says: `${ask.other.name} is already recorded as ${KIND_SET_WORDS[k]}. Nothing changed.${still}` }
  return {
    ok: true, to: k, already: false,
    says: `${ask.other.name} is recorded as ${KIND_SET_WORDS[k]}.${still}`,
  }
}

/**
 * A company nobody classified cannot be invited to take its page: a claim
 * would seat somebody at a company with no roles. Pure.
 */
export function mayInviteRecorded(company: { name: string; kind?: string | null }): { ok: true } | { ok: false; says: string } {
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
export function mayClaimRecorded(company: { name: string; kind?: string | null }): { ok: true } | { ok: false; says: string } {
  if (company.kind === 'UNCLASSIFIED') {
    return {
      ok: false,
      says: `Nobody has said what kind of company ${company.name} is yet, so this link cannot seat you there. Ask the firm that sent it to set the kind, then open the link again.`,
    }
  }
  return { ok: true }
}

/**
 * The client's own codes (Layer 9, slice 2): the company code, the kind of
 * each cost object, a cost center's profit center and the number the
 * client's books give a supplier. Only the paying client reads or writes
 * them, through the seat that manages settings.
 */
export const CLIENT_CODES_NOT_PAYER =
  'These codes belong to the company that pays. Your firm does not set or read them.'
export const CLIENT_CODES_REFUSED =
  'Only Finance, the Owner or an Admin changes your company’s codes. Ask one of them.'
export const COMPANY_CODE_HELP =
  'Your accounting system’s company code. It goes on every line of the file you download.'
export const VENDOR_NUMBER_HELP =
  'The number your own books give this supplier. Only your company reads it.'
export const COST_OBJECT_KIND_WORDS: readonly { value: 'INTERNAL_ORDER' | 'PROJECT_CODE' | 'WBS_ELEMENT' | 'MATERIAL_CODE'; label: string }[] = [
  { value: 'INTERNAL_ORDER', label: 'Internal order' },
  { value: 'PROJECT_CODE', label: 'Project code' },
  { value: 'WBS_ELEMENT', label: 'WBS element' },
  { value: 'MATERIAL_CODE', label: 'Material code' },
]
