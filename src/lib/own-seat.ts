/**
 * A person on their own work is their own seat, whether or not any firm
 * has seated them.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The simulation of 2026-10-20 signed in as every seeded worker and found
 * nine people on live placements, and three on a bench and nowhere else,
 * refused at every door — their own week, their own papers, the terms they
 * were asked to agree, Ask Etyme's greeting — with "nobody has given you a
 * seat yet … you do not need to belong to a company". The sentence was
 * right and the door was wrong: the work they were refused was their own.
 *
 * A candidate who signs up gets this seat at sign-up (lib/password-door).
 * A worker a firm put on a placement, or listed on its bench, before they
 * ever signed in got none, because nothing in that path writes one — and a
 * real worker reaches the product exactly that way: a firm adds them, they
 * are asked by email, and they sign in afterwards.
 *
 * ── What the seat is, and what it is carefully not ───────────────────
 *
 * The consultant seat with no company: `type: CONSULTANT`, no company, no
 * role, so no permission. It opens what every company-less candidate
 * already opens — their own work, their own page, their own papers, their
 * own Ask Etyme — and nothing at any firm, because every route that reads
 * a firm's book scopes to `caller.company` and finds none.
 *
 * Who counts: a person on a placement (a sell line names them), put
 * forward to a job (a submission names them), or asked onto a bench (a
 * listing names their profile, whether or not they have answered — the
 * answer is the thing they came to give). Read off the work, never off a
 * seat type, the same rule `ownPage` in lib/consultant-portfolio is built
 * on.
 *
 * Who does not: a person whose seat at a firm is paused (a pause has to
 * actually stop somebody, and it is lifted where it was set), and a person
 * whose own seat was deliberately taken away. Their refusals keep the
 * sentences lib/api-context already writes for them.
 */
import type { PrismaClient } from '@prisma/client'

/** What a person is on, read off the work. */
export interface OwnWork {
  placements: number
  submissions: number
  listings: number
}

export type OwnSeatVerdict =
  | { open: true; because: string }
  | { open: false }

/**
 * Whether this person is their own seat. Pure: the caller has counted the
 * work and checked the two seats that say no.
 */
export function ownSeatFor(args: {
  name: string
  work: OwnWork
  /** A seat at a firm that is paused right now. */
  paused: boolean
  /** Their own company-less seat existed and was taken away. */
  ownSeatRemoved: boolean
}): OwnSeatVerdict {
  if (args.paused || args.ownSeatRemoved) return { open: false }
  const { placements, submissions, listings } = args.work
  if (placements > 0) return { open: true, because: `${args.name} is on a placement` }
  if (submissions > 0) return { open: true, because: `${args.name} was put forward to a job` }
  if (listings > 0) return { open: true, because: `${args.name} was asked onto a bench` }
  return { open: false }
}

/** The reason written on the seat, so an access review reads why it exists. */
export function ownSeatGrantReason(because: string): string {
  return `Their own seat: ${because}. Their own work only — no company and no permission.`
}

/** The work one person is on, counted in three reads. */
export async function ownWorkOf(db: Pick<PrismaClient, 'sellContract' | 'submission' | 'benchListing'>, personId: string): Promise<OwnWork> {
  const [placement, submission, listing] = await Promise.all([
    db.sellContract.findFirst({ where: { personId }, select: { id: true } }),
    db.submission.findFirst({ where: { personId }, select: { id: true } }),
    db.benchListing.findFirst({ where: { consultant: { personId } }, select: { id: true } }),
  ])
  return { placements: placement ? 1 : 0, submissions: submission ? 1 : 0, listings: listing ? 1 : 0 }
}

/** Whether this person's own company-less seat was ever taken away. */
export async function ownSeatWasRemoved(db: Pick<PrismaClient, 'context'>, personId: string): Promise<boolean> {
  const removed = await db.context.findFirst({
    where: { personId, type: 'CONSULTANT', companyId: null, revokedAt: { not: null } },
    select: { id: true },
  })
  return removed !== null
}

/**
 * Write the seat, and say so on the automation log: the system gave
 * somebody a seat nobody asked for in that moment, which is exactly the
 * kind of act a reader asks about afterwards. Reversible, because a seat
 * can be taken away like any other.
 *
 * Returns the new seat's id.
 */
export async function openOwnSeat(
  db: Pick<PrismaClient, 'context' | 'automationLog'>,
  person: { id: string; name: string },
  because: string
): Promise<string> {
  const seat = await db.context.create({
    data: { personId: person.id, type: 'CONSULTANT', grantReason: ownSeatGrantReason(because) },
    select: { id: true },
  })
  await db.automationLog.create({
    data: {
      // An act of the platform, in nobody's books: the seat belongs to no company.
      companyId: null,
      action: 'OWN_SEAT_OPENED',
      summary: `${person.name} signed in and was given their own seat`,
      reason:
        `${because}, and a person's own work is theirs whether or not a firm has seated them. ` +
        `The seat opens their own work only, at no company and with no permission.`,
      payload: { personId: person.id, contextId: seat.id, because },
      reversible: true,
    },
  })
  return seat.id
}
