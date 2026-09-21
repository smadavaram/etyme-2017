import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { accountScope, unitsVisibleTo } from '@/lib/walls'
import { isConsultantSeat } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import {
  payerScope, buyContractScope, resolveClientCompany,
} from '@/lib/resolve-client-company'
import {
  actingInSeat, noteSeatRead, seatTrail, type LiveSeat,
} from '@/lib/program-seat'
import { invoiceBetween } from './invoice-parties'
import type { CallerContext } from '@/lib/api-context'

/**
 * Whose books a money page is reading — the one door.
 *
 * ── The gap this closes ──────────────────────────────────────────────
 *
 * A program office that runs a client's program places nobody there, so
 * no contract ever ties the two firms together. The client says so
 * instead: it grants the office a desk in its own program office, and
 * the office acts there under the client's own rules with every read
 * logged (`lib/program-seat`, decided 2026-09-14, built 2026-09-20).
 *
 * Every client-facing surface in the product resolves through
 * `resolveClientCompany`, which knows about that seat. **No money route
 * did.** They scoped by `caller.company.id` to a firm, which is right
 * for everybody who trades and wrong for the one party that does not:
 * an MSP's AP clerk opening the payables of the client it runs was
 * served the MSP's own six bills and none of the client's. Consolidating
 * and matching a client's supplier invoices is the whole of an AP Clerk
 * seat, and it did not work.
 *
 * ── What a seat changes, and what it must never change ───────────────
 *
 *   · **Whose books.** The client's, not the office's. The office is
 *     reading somebody else's record, which is the point.
 *   · **What may be done on them.** The client's own role decides, not
 *     the office's — `actingInSeat` swaps the permissions, so a client
 *     narrowing Program Manager narrows the office in the same second.
 *   · **Who is reading.** Still the office. `caller.company` is
 *     deliberately left alone so the trail names the firm that looked.
 *
 * And the rung: a seated office reads **what the client reads** — the
 * contract the client pays — never the rung below it. That is the same
 * `{ clientCompanyId }` scope a client's own desk gets (`lib/chain-top`,
 * `payerScope`), so a sub-vendor's rate under a prime is as invisible to
 * the office as it is to the client. An office running a client's
 * program has no business knowing what the prime's sub charges the
 * prime; that is the prime's margin, and the NDA between them is the
 * reason the network grows.
 *
 * ── One door ─────────────────────────────────────────────────────────
 *
 * `payerScope`, `buyContractScope` and `invoiceBetween` stay exactly
 * what they were for the unseated case — the seated branch sits beside
 * them here rather than replacing them, because two answers to "which
 * rows are ours" is how a narrow scope gets swapped for a broad one, and
 * every rate leak in this codebase has had that shape.
 *
 * The decision below is pure. Only `booksFor` touches a database.
 */

// ── The decision, with no database in it ─────────────────────────────

/** As much of a seat as the decision needs. `LiveSeat` satisfies it. */
export interface SeatFacts {
  id: string
  clientCompany: { id: string; name: string; slug: string; kind: string }
  officeCompany: { id: string; name: string }
  role: { id: string; name: string; permissions: string[] }
  orgUnitId: string | null
}

export interface BooksInput {
  /** The caller's own firm. */
  own: { id: string; name: string; kind: string }
  /** What `payerScope` says for this caller, where it says anything. */
  ownSellWhere?: Record<string, unknown> | null
  /** What `buyContractScope` says for this caller. */
  ownBuyWhere?: Record<string, unknown> | null
  /** A live seat this firm holds at the client it is opening. */
  seat: SeatFacts | null
  /** The reader asked for their own book rather than the client's. */
  askedForOwn: boolean
  /**
   * The client org units a unit-scoped seat reaches — the seat's own unit
   * and everything under it, resolved against the CLIENT's org chart.
   * Ignored where the seat reaches the whole program.
   */
  unitsInSeat?: string[] | null
}

export interface BooksDecision {
  seated: boolean
  /** Whose books these are. */
  companyId: string
  companyName: string
  companyKind: string
  /** Sell lines in scope, at the rung this reader pays. */
  sellContractWhere: Record<string, unknown> | null
  /** Buy lines in scope. */
  buyContractWhere: Record<string, unknown> | null
  /** Invoices this reader is a party to. */
  invoiceWhere: Record<string, unknown>
  /** One sentence for the screen, or null when nothing needs saying. */
  says: string | null
}

/**
 * Which book, and how far into it.
 *
 * `askedForOwn` is the escape hatch and it is not decoration: a program
 * office is also a firm, with payables of its own and consultants of its
 * own to pay. Opening it straight onto the client's book without a way
 * back to its own would hide a firm's own money from it, which is a
 * worse bug than the one this file fixes.
 */
export function whoseBooks(input: BooksInput): BooksDecision {
  const { own, seat, askedForOwn } = input

  if (!seat || askedForOwn) {
    return {
      seated: false,
      companyId: own.id,
      companyName: own.name,
      companyKind: own.kind,
      sellContractWhere: input.ownSellWhere ?? null,
      buyContractWhere: input.ownBuyWhere ?? null,
      invoiceWhere: invoiceBetween(own.id),
      says:
        seat && askedForOwn
          ? `${own.name}'s own books. The program you run for ${seat.clientCompany.name} is on ` +
            `these same pages, and the screen offers both.`
          : null,
    }
  }

  const client = seat.clientCompany
  const unit = accountScope(input.unitsInSeat ?? null, 'orgUnitId')

  return {
    seated: true,
    companyId: client.id,
    companyName: client.name,
    companyKind: client.kind,
    // The client's own scope, which is the rung the client pays and no
    // rung below it.
    sellContractWhere: { clientCompanyId: client.id, ...unit },
    buyContractWhere: { companyId: client.id },
    invoiceWhere: invoiceBetween(client.id),
    // A sentence, never a parameter. The way back to the office's own
    // book is a button on the screen; a query string in front of a
    // person is a code, and CLAUDE.md is explicit that the code is for
    // the machine and the sentence is the product.
    says:
      `${client.name}'s books, read by ${seat.officeCompany.name} from the ${seat.role.name} ` +
      `desk ${client.name} granted it. What may be done here is what that desk may do, and ` +
      `every read is logged against it.`,
  }
}

// ── What a seated desk may do with money ─────────────────────────────

export type PayVerdict = { ok: true } | { ok: false; says: string }

/**
 * May this seat move money?
 *
 * The answer is the client's, never the office's. An office whose own
 * AP clerks pay its own suppliers every day holds `payments.record` at
 * home and holds nothing of the sort inside somebody else's program
 * unless that client seated it at a desk that pays.
 *
 * The sentence names the client, the desk and who can change it, and
 * never the permission — the code is for the machine.
 */
export function seatMayPay(seat: SeatFacts): PayVerdict {
  // `hasPermission`, never a raw includes: a client that seated the
  // office at its Owner desk holds ["*"], and an includes cannot see it.
  if (hasPermission(seat.role.permissions, 'payments.record')) return { ok: true }
  return {
    ok: false,
    says:
      `${seat.officeCompany.name} sits at ${seat.clientCompany.name}'s ${seat.role.name} desk, ` +
      `and that desk does not pay bills. ${seat.clientCompany.name} decides what the seat may ` +
      `do — ask an owner or the program manager there to seat ${seat.officeCompany.name} at a ` +
      `desk that pays, such as an AP clerk's, or have ${seat.clientCompany.name} record this ` +
      `payment itself.`,
  }
}

/** What a seated reader is told when the desk they hold cannot open a page. */
export function seatedRefusal(seat: SeatFacts, page: string): string {
  return (
    `${page} is not part of the ${seat.role.name} desk ${seat.clientCompany.name} granted ` +
    `${seat.officeCompany.name}. The seat may do exactly what that desk may do, so this is ` +
    `${seat.clientCompany.name}'s to widen — ask an owner or the program manager there.`
  )
}

/**
 * What the record says about an act done in a seat.
 *
 * Null when nobody is seated, so a caller can pass it straight into a
 * log line's reason and get the old sentence back unchanged.
 */
export function moneyTrailFor(seat: SeatFacts | null, what: string): string | null {
  return seat ? seatTrail(seat as LiveSeat, what) : null
}

// ── The door itself ──────────────────────────────────────────────────

export interface Books extends BooksDecision {
  /** The caller as they act: the client's permissions where seated. */
  caller: CallerContext
  /** The seat, where one is being used. */
  seat: LiveSeat | null
}

type BooksVerdict =
  | { books: Books; error: null }
  | { books: null; error: NextResponse }

/**
 * Whose books this request is on.
 *
 * Call it AFTER the route's own "no company" refusal, in whose words
 * that case is better said than here.
 *
 * Three ways in:
 *
 *   · **A client is named** (`?clientCompanyId=`) and it is not the
 *     caller's own firm — resolved through `resolveClientCompany`, which
 *     is demand's one answer to "may this caller see that client" and
 *     which logs the read under the seat. A refusal there is returned as
 *     it stands: a caller who asked for a client they may not see is
 *     told so, rather than quietly handed their own figures under
 *     somebody else's name.
 *   · **Nothing is named and the caller is a program office** — the
 *     office opens on the program it runs, the same way `/api/program`
 *     does, with its own books one `books=own` away.
 *   · **Anything else** — its own books, exactly as before this file
 *     existed. A supplier that also holds a seat keeps its own AP on its
 *     own page and reads the client's by naming it, because a firm with
 *     a book of its own must never be opened onto somebody else's by
 *     default.
 */
export async function booksFor(caller: CallerContext, request: NextRequest): Promise<BooksVerdict> {
  const own = caller.company
  if (!own) {
    return {
      books: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Money belongs to a company' } },
        { status: 403 }
      ),
    }
  }

  const params = request.nextUrl.searchParams
  const named = params.get('clientCompanyId')
  const askedForOwn = (params.get('books') ?? '').toLowerCase() === 'own'
  const naming = named != null && named !== '' && named !== own.id

  // A consultant seat is on nobody's books but their own rows, and a
  // client runs its own program from its own desks: neither is ever a
  // program office, and neither pays for the lookup.
  const couldBeSeated =
    !askedForOwn && !isConsultantSeat(caller) && own.kind !== 'CLIENT' && (naming || own.kind === 'MSP')

  let seat: LiveSeat | null = null
  if (couldBeSeated) {
    const resolved = await resolveClientCompany(caller, naming ? named : null)
    if (resolved.error) {
      // Only when they asked for a named client. An office with no seat
      // and no placement anywhere gets its own books, which is what it
      // got before this existed — a refusal there would close a page
      // that was open yesterday.
      if (naming) return { books: null, error: resolved.error }
    } else {
      seat = resolved.seat ?? null
    }
  }

  const decision = whoseBooks({
    own,
    ownSellWhere: payerScope(caller),
    ownBuyWhere: buyContractScope(caller),
    seat,
    askedForOwn,
    unitsInSeat: seat ? await unitsReachedBy(seat) : null,
  })

  return {
    books: {
      ...decision,
      seat: decision.seated ? seat : null,
      caller: decision.seated && seat ? actingInSeat(caller, seat) : caller,
    },
    error: null,
  }
}

/**
 * The client units a unit-scoped seat reaches.
 *
 * A seat may be granted over one business unit rather than the whole
 * program, and the unit belongs to the CLIENT's org chart — so the tree
 * walked here is the client's, never the office's. `accountFilterFor`
 * walks the caller's own company and would read one firm's unit id
 * against another firm's tree, which is a filter that matches nothing
 * and reads as an empty program.
 */
async function unitsReachedBy(seat: LiveSeat): Promise<string[] | null> {
  if (!seat.orgUnitId) return null
  const units = await prisma.orgUnit.findMany({
    where: { companyId: seat.clientCompany.id },
    select: { id: true, parentId: true },
  })
  const childrenOf = new Map<string, string[]>()
  for (const u of units) {
    if (!u.parentId) continue
    childrenOf.set(u.parentId, [...(childrenOf.get(u.parentId) ?? []), u.id])
  }
  return unitsVisibleTo({ walls: true, unitId: seat.orgUnitId, childrenOf })
}

/**
 * Record that this money page was read in a seat.
 *
 * `resolveClientCompany` already logs the resolution; this is the act
 * itself — which book, and what was done on it — so a client asking
 * afterwards "who read our payables, and on whose authority" is
 * answered with the desk by name rather than with the fact that
 * somebody once resolved a program.
 *
 * Fire-and-forget, like every other access log: the invariant is that
 * the read is recorded, not that the reader waits for it.
 */
export function noteMoneyRead(books: Books, what: string): void {
  if (!books.seat) return
  void noteSeatRead(books.seat, books.caller, what)
}
