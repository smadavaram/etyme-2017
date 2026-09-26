import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { isConsultantSeat } from '@/lib/seat'
import { maySeeOutside } from '@/lib/walls'
import { seatFor, actingInSeat, noteSeatRead, type LiveSeat } from '@/lib/program-seat'
import { descendants } from '@/lib/org-tree'
import type { CallerContext } from '@/lib/api-context'

/**
 * Resolve which client company the caller is entitled to view.
 *
 * The client-facing surfaces — program, tenure, alumni, compliance —
 * are all views over "the people on contract at this client". Before
 * this helper existed each route took `?clientCompanyId=` straight from
 * the query string with no check, so any authenticated user could read
 * any client's tenure ledger by editing the URL.
 *
 * Two legitimate callers, and there is no third:
 *
 *   1. The client themselves (company.kind === 'CLIENT').
 *      They are the subject. They may not name a different client.
 *
 *   2. A program office sitting in a seat the client granted it
 *      (`lib/program-seat`, decided 2026-09-14, built 2026-09-20). It
 *      places nobody, so no contract can prove its entitlement — the
 *      client saying so is the proof, the client's own role is what it
 *      may do, and every read under it is logged against the seat.
 *
 * There was a third until 2026-09-21: a vendor, MSP or GSI that placed
 * somebody at the client. It is gone, and the reason is written where
 * it used to be. Supplying people to a client is not a claim on the
 * client's own book, and a supplier holding one reads what its
 * competitors charge.
 *
 * What replaces it is not a refusal but a narrower answer: a firm that
 * names nobody reads **its own** contingent workforce, because a prime
 * and a GSI buy as well as sell. A program office is the one kind that
 * has none of its own, and is told what is missing instead.
 *
 * Naming somebody else's company gets 403, whether or not it exists.
 *
 * CLAUDE.md: "Every read path filters by context from the first commit."
 */

export interface ResolvedClientCompany {
  id: string
  name: string
  slug: string
  kind: string
}

type Resolution =
  | { client: ResolvedClientCompany; seat?: LiveSeat | null; error: null }
  | { client: null; seat?: null; error: NextResponse }

function forbidden(message: string): Resolution {
  return {
    client: null,
    error: NextResponse.json(
      { error: { code: 'FORBIDDEN', message } },
      { status: 403 }
    ),
  }
}

/**
 * Which contracts this caller is a party to the money of.
 *
 * The scope for every list that shows a rate, a value or a bill — which,
 * on a sell contract, is every list there is.
 *
 *   CLIENT    → the contracts it pays for
 *   VENDOR    → the contracts it sells
 *   MSP · GSI → either, since it can be the seller or the paying middle
 *
 * A client legitimately sees everybody working at its sites — that is
 * how tenure aggregates across suppliers and how it answers for
 * co-employment. That is a different question, asked with
 * `endClientFilter` on the screens built for it, and it is not this one.
 *
 * In a chain the sub-vendor's contract also carries the client as its
 * end client, so an end-client filter handed a client the row where
 * CloudEPA sells to Computer Systems at $118 — next to the row where
 * Computer Systems sells to the client at $145. Subtracting one from
 * the other is the prime's whole margin, and a prime whose margin its
 * client can read has no business left.
 *
 * Returns null when the caller has no company, meaning "entitled to
 * nothing". Never an empty object: a list route that built `where = {}`
 * returned every contract in the database to any authenticated caller.
 */
export function payerScope(caller: CallerContext): Record<string, unknown> | null {
  if (isConsultantSeat(caller)) return { personId: caller.person.id }
  if (!caller.company) return null

  const id = caller.company.id

  switch (caller.company.kind) {
    case 'CLIENT':
      return { clientCompanyId: id }
    case 'MSP':
    case 'GSI':
      return { OR: [{ companyId: id }, { clientCompanyId: id }] }
    default:
      return { companyId: id }
  }
}

/**
 * Which side of a sell contract this caller sits on, if any.
 *
 * Three companies have a say in a placement: the supplier whose contract
 * it is, the company it bills, and the site the work is done at when
 * that is a third party. Everybody else is a stranger to it — and the
 * activate route used to take a stranger's word: it authenticated the
 * caller, threw the answer away, and moved any contract whose id it was
 * handed from draft to live, or from live to ended.
 *
 * Returns null for a stranger. A consultant seat is never a party to the
 * commercial record, even the one that names them; their hours are theirs
 * and the contract is between firms.
 */
export type ContractSide = 'SUPPLIER' | 'PAYER' | 'END_CLIENT'

export function contractSide(
  caller: CallerContext,
  contract: { companyId: string; clientCompanyId: string; endClientCompanyId: string | null }
): ContractSide | null {
  if (isConsultantSeat(caller) || !caller.company) return null
  const id = caller.company.id
  if (id === contract.companyId) return 'SUPPLIER'
  if (id === contract.clientCompanyId) return 'PAYER'
  if (contract.endClientCompanyId && id === contract.endClientCompanyId) return 'END_CLIENT'
  return null
}

/**
 * @deprecated Use `payerScope`. This is the same function.
 *
 * It used to be a second, wider answer: a client got `endClientFilter`,
 * every rung of every chain at its sites, rates and all. Two routes
 * picked it — timesheets and rolloff — and both printed a sub-vendor's
 * rate on the client's own screen. That is the fourth rate leak of the
 * same shape found in this codebase, and the shape is always this one:
 * a narrow helper exists beside a broad one and a caller reaches for
 * the broad one.
 *
 * So the broad one is gone rather than documented. The name survives
 * only because `app/api/rolloff` imports it and that file belongs to
 * another domain; delete the export once they have switched.
 *
 * Who is on site, as opposed to what they cost, is `endClientFilter`
 * from lib/resolve-end-client, asked explicitly and never by accident.
 */
export function sellContractScope(
  caller: CallerContext
): Record<string, unknown> | null {
  return payerScope(caller)
}

/**
 * Prisma WHERE fragment for BuyContract reads. A buy contract is what a
 * company pays for talent, so it is always owned by the caller's company.
 * A client company has none, and correctly sees an empty list.
 */
export function buyContractScope(
  caller: CallerContext
): Record<string, unknown> | null {
  // What the agency pays for talent is the agency's business. A consultant
  // sees the line that names them — their own pay rate — and no other.
  if (isConsultantSeat(caller)) {
    return { candidates: { some: { personId: caller.person.id } } }
  }
  if (!caller.company) return null
  return { companyId: caller.company.id }
}

/**
 * Prisma WHERE fragment for Expense reads.
 *
 * A vendor owns its expenses outright (Expense.companyId). A client is not
 * a party to them, but is a party to the *billable* ones raised against work
 * at their own sites — those land on their invoices. A vendor's internal
 * costs stay with the vendor, the same principle that keeps pay rates and
 * margin off the client's screen.
 */
export function expenseScope(
  caller: CallerContext
): Record<string, unknown> | null {
  if (isConsultantSeat(caller)) return { personId: caller.person.id }

  if (!caller.company) return null

  if (caller.company.kind === 'CLIENT') {
    return {
      billable: true,
      sellContract: endClientFilter(caller.company.id),
    }
  }

  return { companyId: caller.company.id }
}

export async function resolveClientCompany(
  caller: CallerContext,
  requestedClientId: string | null
): Promise<Resolution> {
  if (!caller.company) {
    return forbidden('No company context. You must belong to a company.')
  }

  // ── Case 1: the caller IS the client ──
  if (caller.company.kind === 'CLIENT') {
    if (requestedClientId && requestedClientId !== caller.company.id) {
      return forbidden('You may only view your own company\'s workforce.')
    }
    return {
      client: {
        id: caller.company.id,
        name: caller.company.name,
        slug: caller.company.slug,
        kind: caller.company.kind,
      },
      error: null,
    }
  }

  // ── Case 2: a seat the client granted ──
  //
  // Checked before the placement path and before any permission of the
  // caller's own, because that is what the seat means: a program office
  // is entitled by the client having said so, not by a contract it does
  // not have, and what it may do inside is the CLIENT'S role rather than
  // its own (`actingInSeat`). Asking for the caller's own
  // assignments.read first would have refused an MSP coordinator whose
  // firm never gave its coordinators that permission, on a program the
  // client had deliberately opened to them.
  //
  // The read is on the record before it is served. A seat is a standing
  // grant to read a whole contingent workforce, and a client asking
  // afterwards "who looked, and on whose authority" gets the seat by
  // name out of the access log.
  const seat = await seatFor(caller, requestedClientId)
  if (seat) {
    await noteSeatRead(seat, caller, 'Program read')
    return { client: seat.clientCompany, seat, error: null }
  }

  // ── There is no case 3 ──────────────────────────────────────────────
  //
  // There used to be: a vendor, MSP or GSI that placed somebody at a
  // client was handed that client's program, and where no client was
  // named the helper picked one off the caller's first contract. On
  // 2026-09-21 that put Corveldt Aerospace's own dashboard — "2
  // contractors on site through 2 suppliers, $43,680 this month" — in
  // front of two of the suppliers competing to staff it, and in front of
  // a validation engineer at one of them who holds two read
  // permissions.
  //
  // Supplying somebody is not a claim on the buyer's book. What a client
  // spends, how many contractors it has and which other firms it buys
  // from is the client's own picture, and a supplier that can read it
  // knows what its competitors charge — which is the same leak
  // `lib/chain-top` exists to stop one rung down, pointed sideways.
  //
  // A supplier is not shut out of anything it is a party to. Its own
  // placements, its own contracts, its own weeks and its own bills are
  // scoped by `payerScope`, `buyContractScope` and the rest of this
  // file, and none of them goes through here. What goes through here is
  // a whole client program, and that has exactly two readers: the client
  // itself, and a firm holding a seat the client granted it.
  if (requestedClientId && requestedClientId !== caller.company.id) {
    const client = await prisma.company.findUnique({
      where: { id: requestedClientId },
      select: { id: true, name: true },
    })
    // Whether that id exists is not answered. Saying "no such client" to
    // one id and "you have no seat there" to another is a way of asking
    // which of our customers is on the platform.
    return forbidden(notYourProgram(caller.company.name, client?.name ?? null))
  }

  // ── Nobody else's, so their own ─────────────────────────────────────
  //
  // A prime, a GSI, a sub and a one-person corporation all buy as well
  // as sell (CLAUDE.md, "Who sells and who buys"). They have a
  // contingent workforce of their own — the people they engage, the
  // subs below them, those firms' insurance and those people's tenure at
  // *their* site — and these routes are how it is read. Computer Systems
  // reading CloudEPA's certificate is Computer Systems reading its own
  // supply chain, and that is a different question from Computer Systems
  // reading Auralis's.
  //
  // A program office is the exception, and it is the kind's whole
  // meaning: an MSP places nobody, so "the program" is never its own —
  // it is a client's, or it is nothing. Shown its own it would read an
  // empty page, which the 2026-09-14 decision names as the wrong answer:
  // "told what is missing, not shown an empty program."
  if (caller.company.kind === 'MSP') {
    return forbidden(notYourProgram(caller.company.name, null))
  }

  return {
    client: {
      id: caller.company.id,
      name: caller.company.name,
      slug: caller.company.slug,
      kind: caller.company.kind,
    },
    error: null,
  }
}

/**
 * Why a firm that is not the client cannot read the client's program.
 *
 * Says what is missing and what opens it, in the words a program office
 * would use — never "FORBIDDEN", and never the old sentence, which told
 * a supplier it would be let in once it placed somebody.
 */
function notYourProgram(callerName: string, clientName: string | null): string {
  if (!clientName) {
    // Nobody was named, so the sentence cannot name anybody either. It
    // says what is missing — a seat — rather than "no client company
    // found for this caller", which is a machine talking to itself.
    return (
      `${callerName} is not tied to a client yet. A client's program — its headcount, its spend ` +
      `and the other firms it buys from — is read by the client itself and by a firm holding a ` +
      `seat the client granted. Supplying people there does not open it. Ask an owner or the ` +
      `program manager at that client to grant ${callerName} a seat in their program office.`
    )
  }
  return (
    `${clientName}'s program belongs to ${clientName}. Supplying people there does not open it — ` +
    `what a client spends and which other firms it buys from is its own picture. ` +
    `${callerName} reads its own placements, contracts, weeks and bills wherever they are. ` +
    `If ${callerName} runs this program rather than supplying people, ask an owner or the program ` +
    `manager at ${clientName} to grant ${callerName} a seat in their program office.`
  )
}

/**
 * Whether this caller is a party to bills at all.
 *
 * Returns null for a consultant seat: an invoice is a bill between
 * companies, and the person whose hours are on it is not a party to it.
 * Their hours are on their own timesheet, which is theirs to read. Null
 * too for a caller with no company, because a seat with no firm behind
 * it is on nobody's paper.
 *
 * The list route composed this by hand; the two single-invoice routes
 * never composed it at all. They authenticated the caller and threw them
 * away, so a competitor with the id read the number, the total, the
 * purchase order and its ceiling.
 *
 * ── Two questions, not one ───────────────────────────────────────
 *
 * This answers *who may look at a bill*. **Which** bills are ours is a
 * different question and has moved: an invoice used to name its two
 * firms on the agreement behind the engagement, and an agreement is
 * optional now (2026-09-18, and the award stopped inventing one on
 * 2026-09-19). A relation filter on a null relation matches nothing, so
 * a firm's own bill would vanish from its own receivables rather than
 * merely losing a name.
 *
 * `invoiceBetween` in `lib/money/invoice-parties` is that cascade — the
 * agreement, then the order, then the sell lines actually billed — and
 * every route that opens one invoice asks both: this for the gate, that
 * for the scope. The filter returned here is the agreement alone and is
 * not enough on its own; a new reader wants the pair.
 */
export function invoiceScope(
  caller: CallerContext
): Record<string, unknown> | null {
  if (isConsultantSeat(caller)) return null
  if (!caller.company) return null

  const id = caller.company.id
  return {
    engagement: { msa: { OR: [{ vendorId: id }, { clientId: id }] } },
  }
}

/**
 * Prisma WHERE fragment for Requirement reads.
 *
 * Three legitimate readers: the company that raised it, a supplier who was
 * invited to it, and — where the raiser deliberately opened it to the
 * network — anybody permitted to look outside their own company.
 *
 * Note what this does NOT cover. Being able to see a role is not the same
 * as being able to see who the raiser has lined up for it: the match list
 * is the raiser's shortlist of named people, and it belongs to them alone.
 * Use requirementOwnerOnly for that.
 */
export function requirementScope(
  caller: CallerContext,
  /**
   * A seat the caller is acting in, if any. A program office in a seat
   * reads the client's roles, not its own — its own are none, because an
   * office that places nobody raises nothing for itself, and the page
   * read as "this client has posted nothing" when the client had posted
   * eleven.
   */
  seat?: LiveSeat | null
): Record<string, unknown> | null {
  if (isConsultantSeat(caller) || !caller.company) return null

  const id = seat ? seat.clientCompany.id : caller.company.id

  const outside = maySeeOutside({
    posture: caller.company.outsideAccess,
    permissions: caller.permissions,
  })

  const visible: Record<string, unknown>[] = [
    { companyId: id },
    { invitations: { some: { toCompanyId: id } } },
  ]

  // Demo and real are separate universes.
  //
  // Open-to-network is the one branch here that crosses a company
  // boundary, and it was crossing that one too: a visitor looking around
  // in a sandbox was reading three real customers' open roles, and a real
  // customer with an open posture would have read strangers' sandboxes
  // back. A sandbox has its own demand seeded into it and has no business
  // on the network at all.
  if (outside.ok && !caller.company.isDemo) {
    visible.push({ openToNetwork: true, status: 'OPEN', company: { isDemo: false } })
  }

  return { OR: visible }
}

/**
 * Whether this caller raised this requirement.
 *
 * The gate on anything derived from a role that is the raiser's own working
 * material — the match list above all. A competitor with the id read the
 * shortlist: names, headlines, skills, scores. Which is the bench.
 */
export function raisedIt(
  caller: CallerContext,
  requirement: { companyId: string }
): boolean {
  return !isConsultantSeat(caller) && caller.company?.id === requirement.companyId
}

// ── The company the URL is allowed to name ────────────────────────────
//
// A route that authenticates the caller and then reads whichever company
// its query string names has not authorized anything. The permission
// check does not save it: a vendor owner holds `*` inside their own
// company, so `payroll.read` passes and the route then hands over
// somebody else's book.
//
// This is the same fault `resolveClientCompany` was written for, in the
// routes that helper was never applied to.

/**
 * The company whose own book this caller may read.
 *
 * `named` is whatever the URL asked for, and it is allowed to say only
 * one thing: the caller's own company. The screens that send it are
 * sending back the id the server gave them, so nothing legitimate is
 * lost — and a request naming anybody else is refused out loud rather
 * than quietly answered with the caller's own data, which would leave
 * somebody staring at figures that are not the ones they asked for.
 */
export function resolveOwnCompany(
  caller: CallerContext,
  named: string | null
):
  | { companyId: string; error: null }
  | { companyId: null; error: NextResponse } {
  const mine = caller.company?.id ?? null
  if (!mine) {
    return {
      companyId: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'No company context' } },
        { status: 403 }
      ),
    }
  }
  if (named && named !== mine) {
    return {
      companyId: null,
      error: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You can only read your own company here.',
          },
        },
        { status: 403 }
      ),
    }
  }
  return { companyId: mine, error: null }
}

/**
 * Prisma WHERE fragment for Submission reads.
 *
 * A submission has two parties and both may read it: the supplier who
 * sent it and the company it was sent to. Nobody else, which is the part
 * that was missing — the list route built its filter entirely from query
 * parameters, so `?personId=` returned one person's whole history across
 * every firm in the market, rates included, and `?companyId=` returned a
 * competitor's outbound pipeline.
 *
 * Not `payerScope`. A client legitimately reads submissions addressed to
 * it, and it is the `toCompanyId` on those rows rather than a party to
 * any contract yet, so the contract-shaped scopes do not describe this.
 *
 * A consultant sees the submissions that are about them and no others.
 * Their context points at the agency whose bench they sit on, and read
 * as membership it would hand them that agency's entire pipeline.
 */
export function submissionScope(
  caller: CallerContext
): Record<string, unknown> | null {
  if (isConsultantSeat(caller)) return { personId: caller.person.id }
  if (!caller.company) return null
  const id = caller.company.id
  return { OR: [{ fromCompanyId: id }, { toCompanyId: id }] }
}

// ── Acting in a seat the client granted ───────────────────────────────
//
// `resolveClientCompany` answers *which* program a caller may open. From
// 2026-09-20 it also hands back the seat, and the seat changes the other
// half of the question: what the caller may *do* inside.
//
// Every demand route asked the caller's own permissions before it asked
// which program this was. So a program office whose own firm is thin on
// permissions — most are, because an MSP's own company exists to hold
// people rather than to run its own contingent program — was refused on
// a program its client had deliberately opened to it, under a desk its
// client had deliberately named. The seat resolved and then decided
// nothing.
//
// Two lines fix it everywhere, in this order: resolve first, gate on
// `acting`. Written here rather than repeated per route, because the
// version that is repeated is the version one route forgets.

/**
 * The program, the seat, and the caller as they act inside it.
 *
 * `acting` is the caller with the seat's permissions and the seat's org
 * unit, or the caller unchanged where there is no seat. Gate on
 * `acting.permissions`, never on `caller.permissions`, in any route that
 * a program office may legitimately reach.
 *
 * `acting.company` stays the office's on purpose (`actingInSeat`): the
 * office is who is reading, and a trail recording the client reading its
 * own records hides the one fact it exists to show.
 */
export type ProgramResolution =
  | { client: ResolvedClientCompany; seat: LiveSeat | null; acting: CallerContext; error: null }
  | { client: null; seat: null; acting: null; error: NextResponse }

export async function resolveProgram(
  caller: CallerContext,
  requestedClientId: string | null
): Promise<ProgramResolution> {
  const res = await resolveClientCompany(caller, requestedClientId)
  if (res.error) return { client: null, seat: null, acting: null, error: res.error }
  const seat = res.seat ?? null
  return {
    client: res.client,
    seat,
    acting: seat ? actingInSeat(caller, seat) : caller,
    error: null,
  }
}

/**
 * The same answer for a route scoped to the caller's *own* company.
 *
 * Suppliers, the register of people, agreements, milestones and units
 * are all "this company's own book". Under a seat the book being kept is
 * the client's, so the company id has to move as well as the
 * permissions — otherwise a seated office reads its own empty register
 * and concludes nobody has ever been put in front of the client it runs.
 *
 * Never fails: a caller with no seat is simply themselves. A caller with
 * no company at all gets null, which every one of these routes already
 * refuses in words of its own.
 */
export interface SeatedDesk {
  companyId: string
  companyName: string
  seat: LiveSeat | null
  acting: CallerContext
}

export async function seatedDesk(
  caller: CallerContext,
  requestedClientId: string | null = null
): Promise<SeatedDesk | null> {
  if (!caller.company) return null
  // A client is never in a seat at itself, and asking would cost a query
  // on every request from the population that makes most of them.
  if (caller.company.kind !== 'CLIENT') {
    const seat = await seatFor(caller, requestedClientId)
    if (seat) {
      return {
        companyId: seat.clientCompany.id,
        companyName: seat.clientCompany.name,
        seat,
        acting: actingInSeat(caller, seat),
      }
    }
  }
  return {
    companyId: caller.company.id,
    companyName: caller.company.name,
    seat: null,
    acting: caller,
  }
}

/**
 * The units a seat reaches, as a Prisma `in` list — or null for "all".
 *
 * A seat may be scoped to one business unit, and the whole point of that
 * scope is that the office cannot read the rest of the program. Narrowing
 * is a read filter and not a permission: the desk holds the same
 * permissions everywhere, and reaches fewer rows.
 *
 * The unit and everything under it, because a unit is a tree and a seat
 * at Technology that could not read R&D 1 would be a seat at nothing.
 */
export async function unitsReachedBy(
  seat: LiveSeat | null
): Promise<string[] | null> {
  if (!seat || !seat.orgUnitId) return null
  const units = await prisma.orgUnit.findMany({
    where: { companyId: seat.clientCompany.id },
    select: { id: true, parentId: true },
  })
  return [seat.orgUnitId, ...descendants(units, seat.orgUnitId)]
}
