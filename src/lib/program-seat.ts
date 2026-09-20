import { prisma } from '@/lib/db'
import { logBulkAccess } from '@/lib/access-log'
import { hasPermission } from '@/lib/permissions'
import type { CallerContext } from '@/lib/api-context'

/**
 * A desk a client grants a program office that is not the client.
 *
 * ── The gap this closes ──────────────────────────────────────────────
 *
 * An MSP runs a client's program and places nobody. Every other party on
 * this platform is tied to a client by a placement — a contract naming
 * the client is the proof of entitlement `lib/resolve-client-company`
 * has always used — so a program office was the one party the platform
 * could not tie to anybody at all. It could not raise a requisition, it
 * could not read the tenure ledger it answers for, and its compliance
 * desk opened an empty page that read as "nobody has asked".
 *
 * Letting a firm's own register of counterparties stand in would have
 * let any firm claim any client, which is worse than the gap. So the
 * client says it: it grants the office a desk in its own program office,
 * the way it grants one to its own people, and the office acts there
 * under the client's own rules with every read logged (CLAUDE.md,
 * 2026-09-14). On 2026-09-20 this stopped being hypothetical — Etyme now
 * offers to run a client's program itself — and the seat became the
 * first build after the census.
 *
 * ── Three rules, and each of them is somebody's refusal ──────────────
 *
 *   1. **The role is the client's.** A seat holds a `Role` belonging to
 *      the client company, so what the office may do is exactly what
 *      that desk may do. The office never writes its own permissions,
 *      and a client narrowing Program Manager narrows the office in the
 *      same moment. This is why the old `Delegation.scope` — a bag of
 *      permission keys somebody typed — is gone.
 *   2. **Only the client grants it, and never the office.** An owner or
 *      the program manager; a firm cannot grant itself a desk at
 *      somebody else's company, and nobody at the office can be the
 *      grantor even if they somehow hold a seat at the client too.
 *   3. **Every read under it is on the record.** The seat is a standing
 *      grant to read a whole contingent workforce, which is the read a
 *      client would most want to be able to account for afterwards.
 */

/** A seat, resolved with everything a caller needs to act in it. */
export interface LiveSeat {
  id: string
  clientCompany: { id: string; name: string; slug: string; kind: string }
  officeCompany: { id: string; name: string }
  /** The client's own role the seat holds. */
  role: { id: string; name: string; permissions: string[] }
  /** The unit the seat reaches, or null for the whole program. */
  orgUnitId: string | null
  grantedAt: Date
  reason: string
}

/**
 * Whether a seat is usable right now.
 *
 * Pure, so the four ways a seat stops working can be read as sentences
 * without a database: revoked, not started yet, run out, or live. A
 * revocation bites the next second — there is no grace period on a
 * client withdrawing somebody's access to its own workforce, and a
 * control that keeps working for an hour after it is switched off is
 * worse than none because everybody believes it worked.
 */
export function seatIsLive(
  seat: { validFrom: Date; validTo: Date | null; revokedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (seat.revokedAt && seat.revokedAt <= now) return false
  if (seat.validFrom > now) return false
  if (seat.validTo && seat.validTo <= now) return false
  return true
}

/** The Prisma filter for "live right now", so one definition serves both. */
export function liveSeatWhere(now: Date = new Date()) {
  return {
    OR: [{ revokedAt: null }, { revokedAt: { gt: now } }],
    validFrom: { lte: now },
    AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }],
  }
}

const SELECT = {
  id: true,
  orgUnitId: true,
  grantedAt: true,
  reason: true,
  clientCompany: { select: { id: true, name: true, slug: true, kind: true } },
  officeCompany: { select: { id: true, name: true } },
  role: { select: { id: true, name: true, permissions: true } },
} as const

function shape(row: {
  id: string
  orgUnitId: string | null
  grantedAt: Date
  reason: string
  clientCompany: { id: string; name: string; slug: string; kind: string }
  officeCompany: { id: string; name: string }
  role: { id: string; name: string; permissions: string[] }
}): LiveSeat {
  return {
    id: row.id,
    clientCompany: row.clientCompany,
    officeCompany: row.officeCompany,
    role: row.role,
    orgUnitId: row.orgUnitId,
    grantedAt: row.grantedAt,
    reason: row.reason,
  }
}

/**
 * The seat this caller's firm holds at this client, if any.
 *
 * `clientCompanyId` null means "any" — used when a caller named no
 * client and we are deciding which program to open for them. Ordered by
 * the client's name so two clients never silently swap between requests,
 * which is the same determinism the placement fallback already has.
 */
export async function seatFor(
  caller: CallerContext,
  clientCompanyId: string | null,
  now: Date = new Date()
): Promise<LiveSeat | null> {
  if (!caller.company) return null
  const row = await prisma.programSeat.findFirst({
    where: {
      officeCompanyId: caller.company.id,
      ...(clientCompanyId ? { clientCompanyId } : {}),
      ...liveSeatWhere(now),
    },
    select: SELECT,
    orderBy: [{ clientCompany: { name: 'asc' } }, { id: 'asc' }],
  })
  return row ? shape(row) : null
}

/** Every live seat this firm holds, for its own list of programs. */
export async function seatsHeldBy(
  officeCompanyId: string,
  now: Date = new Date()
): Promise<LiveSeat[]> {
  const rows = await prisma.programSeat.findMany({
    where: { officeCompanyId, ...liveSeatWhere(now) },
    select: SELECT,
    orderBy: [{ clientCompany: { name: 'asc' } }, { id: 'asc' }],
  })
  return rows.map(shape)
}

/**
 * The caller as they act inside the seat.
 *
 * Two things change and one deliberately does not. The permissions
 * become the client role's, because the office acts under the client's
 * rules rather than its own. The org unit becomes the seat's, so a seat
 * scoped to one business unit cannot read the rest of the program.
 *
 * `company` stays the office's. The office is who is reading, and a
 * trail that recorded the client reading its own records would be a
 * trail that hides exactly the thing it exists to show.
 */
export function actingInSeat(caller: CallerContext, seat: LiveSeat): CallerContext {
  return {
    ...caller,
    permissions: seat.role.permissions,
    orgUnitId: seat.orgUnitId,
  }
}

/**
 * Record that the office read this client's program under the seat.
 *
 * ── Why the subjects are the people on site ──────────────────────────
 *
 * An `AccessLog` row is about a person, and a program office opening a
 * client's program is reading the people at that client: who is on site,
 * for how long, through whom. So the read is logged against exactly
 * those people, one row each, the same shape the tenure screen already
 * writes — with the seat named in the reason, which is the fact a client
 * asking "who looked at my workforce, and on whose authority" needs and
 * could not otherwise get.
 *
 * Fire-and-forget, like every other access log: the invariant is that
 * the read is recorded, not that the reader waits for it.
 */
export async function noteSeatRead(
  seat: LiveSeat,
  caller: CallerContext,
  what: string
): Promise<void> {
  const contracts = await prisma.sellContract.findMany({
    where: {
      OR: [
        { endClientCompanyId: seat.clientCompany.id },
        { endClientCompanyId: null, clientCompanyId: seat.clientCompany.id },
      ],
      state: { in: ['IN_PROGRESS', 'PAUSED'] },
    },
    select: { personId: true },
  })

  const subjects = [...new Set(contracts.map((c) => c.personId))]
  if (subjects.length === 0) return

  logBulkAccess(subjects, {
    actorPersonId: caller.isService ? undefined : caller.person.id,
    actorCompanyId: caller.company?.id ?? undefined,
    action: 'CONTRACT_VIEW',
    reason: seatTrail(seat, what),
  })
}

/** What the trail says, in a sentence a client can read back. */
export function seatTrail(seat: LiveSeat, what: string): string {
  return (
    `${what} by ${seat.officeCompany.name} in the ${seat.role.name} seat ` +
    `${seat.clientCompany.name} granted it (seat ${seat.id})`
  )
}

// ── Granting, and the four ways it is refused ────────────────────────

export interface GrantAsk {
  /** The company the caller is seated at. */
  grantorCompany: { id: string; kind: string; name: string }
  /** What the caller's own role can do at the client. */
  grantorPermissions: readonly string[]
  /** The firm the seat is being granted to. */
  officeCompany: { id: string; kind: string; name: string } | null
  /** The client role the seat would hold. */
  role: { id: string; companyId: string; name: string } | null
  reason: string
  /** A seat this firm already holds at this client, live right now. */
  alreadyHas: boolean
}

export type GrantVerdict =
  | { ok: true }
  | { ok: false; code: string; says: string }

/**
 * May this caller grant this seat, and if not, what are they told.
 *
 * Pure. Every branch is a sentence somebody acts on rather than a code,
 * because a refusal is the product and the code is for the machine.
 *
 * ── Why governance.write is the gate ─────────────────────────────────
 *
 * The rule is "an owner or the program manager". Those are exactly the
 * two client roles that hold `governance.write` in
 * `lib/company-defaults` — the owner by holding everything, the program
 * manager by owning the rules — and no other client desk holds it: a
 * hiring manager, an approver, HR, procurement, AP, compliance and a
 * viewer all read the rules and none of them write them. Reading the
 * permission rather than matching the role name means a client that
 * renames its desks keeps working, and a client that hands the rules to
 * a fourth desk has decided that desk may do this too.
 */
export function mayGrantSeat(ask: GrantAsk): GrantVerdict {
  // Asked first, and before the caller's own kind, because a firm
  // seating itself is the one refusal that has to read the same whoever
  // tries it. A program office reaching for a desk at a client it has no
  // deal with would otherwise be told only that it is "not the client",
  // which is true and is not the thing it just tried to do.
  if (ask.officeCompany && ask.officeCompany.id === ask.grantorCompany.id) {
    return {
      ok: false,
      code: 'SELF_GRANT',
      says:
        ask.grantorCompany.kind === 'CLIENT'
          ? `A program office cannot grant itself a seat. ${ask.grantorCompany.name} already runs its own ` +
            `program from its own desks; a seat is for a firm that is not the client.`
          : `A program office cannot grant itself a seat. The desk is the client's to give — ask an owner ` +
            `or the program manager there to grant ${ask.grantorCompany.name} a seat in their program office.`,
    }
  }

  if (ask.grantorCompany.kind !== 'CLIENT') {
    return {
      ok: false,
      code: 'NOT_A_CLIENT',
      says:
        `A seat in a program is the client's to give, and ${ask.grantorCompany.name} is not the ` +
        `client here. Whoever owns the program grants the desk.`,
    }
  }

  if (!hasPermission(ask.grantorPermissions, 'governance.write')) {
    return {
      ok: false,
      code: 'NOT_YOURS_TO_GRANT',
      says:
        `Only an owner or the program manager may grant a seat. A seat lets another firm read ` +
        `this whole program, so it is granted from the desk that owns the rules.`,
    }
  }

  if (!ask.officeCompany) {
    return {
      ok: false,
      code: 'NO_SUCH_FIRM',
      says: 'That firm is not on the system, so there is nobody to seat. Add it first, then grant the seat.',
    }
  }

  if (!ask.role) {
    return {
      ok: false,
      code: 'NO_SUCH_ROLE',
      says: 'No such desk at this company. A seat holds one of your own roles — Program Manager, most often.',
    }
  }

  if (ask.role.companyId !== ask.grantorCompany.id) {
    return {
      ok: false,
      code: 'NOT_YOUR_ROLE',
      says:
        `A seat holds one of ${ask.grantorCompany.name}'s own roles, not the other firm's. That is what ` +
        `"under the client's rules" means: they act as your desk does, and change when you change it.`,
    }
  }

  if (ask.reason.trim().length < 8) {
    return {
      ok: false,
      code: 'REASON',
      says:
        'Say why this firm is being seated, in a sentence. A standing grant to read a whole workforce ' +
        'with no reason recorded is the finding an audit opens with.',
    }
  }

  if (ask.alreadyHas) {
    return {
      ok: false,
      code: 'ALREADY_SEATED',
      says:
        `${ask.officeCompany.name} already holds a live seat in this program. Revoke that one first if the ` +
        `desk it sits at has changed.`,
    }
  }

  return { ok: true }
}

/**
 * What a program office with no seat is told.
 *
 * Exported so the sentence lives in one place: it is read by the
 * resolution, by the seats route, and by the test that holds it. It says
 * what is missing and who can fix it, never "No client company found for
 * this caller" — which is what it said for months and told somebody
 * running a program office nothing at all.
 */
export function noSeatYet(officeName: string): string {
  return (
    `${officeName} is not tied to a client yet. A role belongs to the company that is hiring, so until ` +
    `${officeName} places somebody there is no client to raise it for. And if ${officeName} runs a ` +
    `client's program rather than supplying people, it places nobody by design — it acts in a seat the ` +
    `client grants it, under the client's own rules and with every read logged. Ask an owner or the ` +
    `program manager at that client to grant ${officeName} a seat in their program office.`
  )
}
