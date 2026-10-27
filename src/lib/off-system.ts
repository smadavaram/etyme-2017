/**
 * When one party is not on the system.
 *
 * ── The gap this closes ──────────────────────────────────────────────
 *
 * `Company.claimedAt` is null for a **shell** — a firm on the register
 * that has not taken possession of itself. The schema states the rule:
 * *"An unclaimed shell can be sent a role and can be scored. It cannot
 * sign in, cannot be seen by the network, and must never be mistaken for
 * a firm that chose to be here."*
 *
 * Almost everything worked against a shell already. One thing did not,
 * and it was the opposite way round from the assumption in "Who pays":
 * **only a client could create one.** Both paths that made a shell ran
 * from the client's side, so a staffing firm that signs up on a Tuesday
 * with an existing book of business could record none of it — every
 * contract it holds names a client that is not here, and nothing let it
 * say so. The client-first path was built; the vendor who arrives first
 * had no door.
 *
 * ── The trap this must not fall into ─────────────────────────────────
 *
 * CLAUDE.md names it under the MSP seat: letting a firm's own record of
 * a counterparty stand in *"would let any firm claim any client, which is
 * worse than the gap"*. So the carve-out below is for **shells only**.
 *
 * A shell is not a claim on anybody. It cannot sign in, it is invisible
 * to the network, and the day somebody at that firm takes possession
 * through the invite-and-claim path, every row already points at their
 * company id and becomes theirs. A **claimed** firm is a tenant with its
 * own desks, and asserting that it is your client — or that it raised an
 * order it never raised — is exactly the thing that must go through
 * them.
 *
 * No database in here, on purpose. The routes read the rows; this
 * decides.
 */

import type { SupplierStanding } from '@/lib/counterparty'
import { domainOfEmail, isConsumerDomain } from '@/lib/company-domains'

export interface CompanyStanding {
  id: string
  name: string
  /** Null = a shell: on the register, not on the system. */
  claimedAt: Date | null
  /** The firm that put them on the register, where that is how it began. */
  listedById?: string | null
  /** Its Etyme address, where it has one worth printing. */
  slug?: string | null
}

/** On the register, not on the system. */
export function isShell(company: Pick<CompanyStanding, 'claimedAt'>): boolean {
  return company.claimedAt == null
}

export interface Verdict {
  ok: boolean
  /** A refusal says what is missing and what to do. Never a code. */
  says: string
}

/**
 * What a screen says beside a firm that has not taken possession of
 * itself, so nobody mistakes it for one that chose to be here.
 */
export function shellNotice(company: CompanyStanding): string | null {
  if (!isShell(company)) return null
  return `${company.name} is not on Etyme. You listed them, so this is your record of them — they cannot see it, and nothing here carries their agreement. Invite them when the relationship is worth it to them.`
}

// ═════════════════════════════════════════════════════════════════════
// LISTING A COMPANY THAT IS NOT HERE
// ═════════════════════════════════════════════════════════════════════

/**
 * What a firm is told when the company it is adding is on Etyme already
 * and the two do not work together yet (onboarding walk, 2026-10-27).
 *
 * No copy is made: a second record of a real firm is two histories. No
 * link is made either, on the adder's word alone — a row on the adder's
 * register counts as a relationship wherever a contract names a client
 * (`mayNameCounterparty`), so linking on request would let any firm name
 * any firm. The adder asks to link (`lib/trade-link`) and the other side
 * says yes.
 */
export function alreadyOnEtyme(them: { name: string; slug?: string | null }, as: string): string {
  const where = them.slug ? `, at ${them.slug}.etyme.com` : ''
  return (
    `${them.name} is already on Etyme${where}, so no copy of them was made. ` +
    `Ask them to link, as your ${as}: once they say yes, each of you has the other on your companies.`
  )
}

/**
 * May this firm list a counterparty under this name?
 *
 * Three answers, and the second is the one that keeps the register
 * honest:
 *
 *   **Nothing here by that domain** — list it. A new shell, listed by
 *   the caller, claimable later.
 *
 *   **A claimed firm at that domain** — refuse to make a second record
 *   of them, and say so. A second copy of a real firm is worse than no
 *   copy: two scorecards, two histories, and a person who is a duplicate
 *   of themselves. It is also the door to the trap above — a shell
 *   bearing a real firm's name and domain is a claim on that firm.
 *   Neither is a hard stop on the work: the caller invites them, or asks
 *   them to raise their own paper.
 *
 *   **A shell this same firm already listed** — reuse it. Two contacts
 *   at one firm is one counterparty, not two.
 */
export function mayList(input: {
  callerCompanyId: string
  /** A claimed company already at that domain, where one was found. */
  claimedAtDomain?: CompanyStanding | null
  /** A shell the caller listed before, where one was found. */
  alreadyListed?: CompanyStanding | null
  name: string
}): Verdict & { reuse: CompanyStanding | null; create: boolean } {
  if (input.claimedAtDomain) {
    const them = input.claimedAtDomain
    return {
      ok: false,
      reuse: null,
      create: false,
      says:
        alreadyOnEtyme(them, 'client'),
    }
  }
  if (input.alreadyListed) {
    return {
      ok: true,
      reuse: input.alreadyListed,
      create: false,
      says: `You already listed ${input.alreadyListed.name}. Using that record rather than making a second one.`,
    }
  }
  if (input.name.trim().length < 2) {
    return {
      ok: false,
      reuse: null,
      create: false,
      says: 'Say the name your contracts with them are in. It is what every screen will call them until they join.',
    }
  }
  return {
    ok: true,
    reuse: null,
    create: true,
    says: `${input.name.trim()} goes on your register. They are not on Etyme, so nothing here reaches them until you invite them.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// WRITING AN ORDER WHEN ONE END OF IT IS NOT HERE
// ═════════════════════════════════════════════════════════════════════

/**
 * May this firm write this order?
 *
 * A work order has a buyer and a seller. The buyer ordinarily raises it
 * — that is what a purchase order *is*, a commitment of the buyer's own
 * money — and that path is unchanged.
 *
 * **The carve-out.** A supplier whose client is not on Etyme was handed a
 * purchase order on paper. `SellContract.workOrderId` exists to hold
 * exactly that and nothing could write the row it points at, which is why
 * the four commercial terms on an order — the billing basis, the
 * milestones, the four-party split, and whether an unanswered timesheet
 * counts as approved — were unreachable for every supplier in the world.
 * So the seller may record it, **only where the buyer is a shell**, and
 * the row records who typed it in.
 *
 * Where the buyer *is* on Etyme the refusal is not a dead end: the order
 * is theirs to raise, and saying so is a next step rather than a wall.
 */
export function mayWriteOrder(input: {
  callerCompanyId: string
  buyer: CompanyStanding
  seller: CompanyStanding
  /**
   * What the seller is to the buyer, from `suppliersOf` in
   * `lib/suppliers-of` — the same answer the supplier picker lists from.
   * A purchase order commits the buyer's money, so it goes only to a
   * firm the buyer already buys from. Left out, the check is not made:
   * that is the state of a route that has not yet passed it, and is
   * named in the matrix as owed rather than read as a yes.
   */
  sellerStanding?: SupplierStanding
}): Verdict & { recordedById: string; onBehalf: boolean } {
  const { callerCompanyId: me, buyer, seller } = input

  if (buyer.id === seller.id) {
    return {
      ok: false,
      recordedById: me,
      onBehalf: false,
      says: 'A firm cannot raise an order to itself. Name the other party to the deal.',
    }
  }

  if (me === buyer.id) {
    if (input.sellerStanding === 'BLOCKED') {
      return {
        ok: false,
        recordedById: me,
        onBehalf: false,
        says:
          `${buyer.name} has blocked ${seller.name}, so no new purchase order can go to them. ` +
          `Lift the block on the suppliers page first if that is what you mean to do.`,
      }
    }
    if (input.sellerStanding === 'NONE') {
      return {
        ok: false,
        recordedById: me,
        onBehalf: false,
        says:
          `${seller.name} is not one of ${buyer.name}'s suppliers. A purchase order goes to a ` +
          `firm ${buyer.name} already buys from. Recommend them as a supplier first; the order ` +
          `can follow once they are approved.`,
      }
    }
    return {
      ok: true,
      recordedById: me,
      onBehalf: false,
      says: `Your purchase order to ${seller.name}.`,
    }
  }

  if (me === seller.id) {
    if (isShell(buyer)) {
      return {
        ok: true,
        recordedById: me,
        onBehalf: true,
        says:
          `${buyer.name} is not on Etyme, so you are recording the purchase order they ` +
          `handed you. It will say you entered it, and it becomes theirs to see the day ` +
          `they join.`,
      }
    }
    return {
      ok: false,
      recordedById: me,
      onBehalf: false,
      says:
        `${buyer.name} is on Etyme, so the purchase order is theirs to raise — recording ` +
        `it for them would put a commitment in their name that nobody at their firm made. ` +
        `Ask their MSP or AP clerk to raise it, and it will appear here against ` +
        `your contracts.`,
    }
  }

  return {
    ok: false,
    recordedById: me,
    onBehalf: false,
    says:
      `An order is written by one of the two firms on it. You are neither ${buyer.name} ` +
      `nor ${seller.name} here.`,
  }
}

/**
 * May this firm name that firm as the counterparty on a contract it is
 * recording?
 *
 * The same rule as an order, said for the contract path: a firm may name
 * anybody it is actually trading with, and may *invent* only a firm that
 * is not here. A claimed company is named only where a relationship
 * already exists on the platform — a submission, an agreement, an
 * invitation — which the caller passes in as `relationshipExists`.
 *
 * `relationshipExists` is deliberately a parameter rather than a query.
 * What counts as a relationship differs by route, and a rule that goes
 * looking for one on its own is a rule that will quietly find the wrong
 * one.
 */
export function mayNameCounterparty(input: {
  callerCompanyId: string
  other: CompanyStanding
  /** Whether the two firms already have something between them here. */
  relationshipExists: boolean
  /** What the other firm is to the caller, in the caller's words. */
  as: 'client' | 'supplier'
}): Verdict {
  const { callerCompanyId: me, other } = input

  if (other.id === me) {
    return { ok: false, says: `A firm cannot be its own ${input.as}.` }
  }

  if (isShell(other)) {
    // Your own record, or one nobody owns. A shell another firm listed is
    // that firm's record of its counterparty, not yours: naming it would
    // write your contract onto somebody else's register — and, for a
    // client, make your recorded contacts nothing and theirs your
    // approvers — so it needs something between the two of you first,
    // the same as a firm that is here.
    if (other.listedById == null || other.listedById === me || input.relationshipExists) {
      return {
        ok: true,
        says: `${other.name} is not on Etyme. This is your own record of them until they join.`,
      }
    }
    return {
      ok: false,
      says:
        `${other.name} is on another firm's register, not yours, and has nothing on file with you. ` +
        `Put them on your own register as your ${input.as} — that makes your own record of them.`,
    }
  }

  if (input.relationshipExists) {
    return { ok: true, says: `${other.name} is on Etyme and already works with you.` }
  }

  return {
    ok: false,
    says:
      `${other.name} is on Etyme and has nothing on file with you. A firm cannot name ` +
      `another as its ${input.as} without them — ask them to add you, or invite them to ` +
      `the deal, and it is theirs to accept.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// THE PERSON AT A CLIENT THAT IS NOT HERE
// ═════════════════════════════════════════════════════════════════════

export type ContactVerdict =
  | { ok: true; email: string; contactName: string | null; remove: boolean; says: string }
  | { ok: false; status: number; code: string; field?: string; says: string }

/**
 * May this firm record (or take off) the person at a client it listed?
 *
 * While a client is not on Etyme, the address its supplier records is
 * what an approval of a week by email is checked against — that address,
 * or another at its company domain (`approverIsKnownAtClient`, demand's).
 * So the supplier is trusted to name the client's person, and the rules
 * here keep that trust to what it is:
 *
 *   - only the firm that listed the client, and only while nobody has
 *     claimed it — once claimed, the client's own domain and seats decide
 *     who approves for it, and its record is not the supplier's to edit;
 *   - never somebody at the supplier itself: a firm recording its own
 *     staffer as the client's approver is the hole a worker naming herself
 *     was, one rung up;
 *   - always a named person when an address is added, because an
 *     approval nobody can be traced to is not an approval.
 */
export function recordClientContact(input: {
  callerCompanyId: string
  client: CompanyStanding | null
  email: unknown
  contactName?: unknown
  remove?: boolean
  /** The addresses of everybody seated at the caller's own firm. */
  ownSeatEmails: readonly (string | null | undefined)[]
}): ContactVerdict {
  const c = input.client
  if (!c || c.listedById !== input.callerCompanyId) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'That client is not one you listed. Put them on your register first.' }
  }
  if (!isShell(c)) {
    return {
      ok: false, status: 409, code: 'ON_ETYME',
      says: `${c.name} is on Etyme now, so its own people decide who approves for it. Ask them to seat the person you mean.`,
    }
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!email) {
    return { ok: false, status: 422, code: 'VALIDATION', field: 'email', says: `Give the email address of the person at ${c.name}.` }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 422, code: 'VALIDATION', field: 'email', says: `${email} is not an email address. Give the address the person at ${c.name} reads.` }
  }
  const name = typeof input.contactName === 'string' ? input.contactName.trim() : ''
  if (input.remove) {
    return {
      ok: true, email, contactName: null, remove: true,
      says: `${email} is no longer recorded for ${c.name}, so it cannot be named as its approver. Approvals already given stand.`,
    }
  }
  const own = new Set(input.ownSeatEmails.filter((e): e is string => typeof e === 'string').map((e) => e.trim().toLowerCase()))
  if (own.has(email)) {
    return {
      ok: false, status: 422, code: 'VALIDATION', field: 'email',
      says: `${email} is somebody at your own firm. Record the person at ${c.name} who approves the hours.`,
    }
  }
  if (!name) {
    return { ok: false, status: 422, code: 'VALIDATION', field: 'contactName', says: `Name the person at ${c.name} whose address this is.` }
  }
  const domain = domainOfEmail(email)
  const colleagues = domain && !isConsumerDomain(domain) ? `, or a colleague at @${domain},` : ''
  return {
    ok: true, email, contactName: name, remove: false,
    says:
      `${name} (${email}) is recorded at ${c.name}. While ${c.name} is not on Etyme, ${name}${colleagues} ` +
      `can approve a week by email, and the approval says ${c.name} was not on Etyme.`,
  }
}
