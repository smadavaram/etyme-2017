import { prisma } from '@/lib/db'
import type { Target } from './desks'

/**
 * Who this company has actually dealt with — the only people and firms
 * it may bar.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * The add form on `/dashboard/blacklist` asked a human being for a
 * **Subject ID**. Typing a name into it produced `404 "Person not
 * found"` and a screen that then showed nothing at all, so the one
 * screen whose whole job is "do not let this person back" could not be
 * used by anybody who did not already have a cuid in their clipboard.
 * The list underneath printed the same ids back, truncated to
 * `cm8k3p…9x2f`, which is not a person.
 *
 * CLAUDE.md, Zero training: "Their words, not the system's… Explain in
 * a sentence, not a code." A database id is the purest form of the
 * system's own words.
 *
 * ── Why the route refuses a stranger as well ─────────────────────────
 *
 * A picker alone would have fixed the screen and left the route open:
 * `POST /api/blacklist` checked only that the row existed *somewhere on
 * Etyme*, so any company could write a do-not-return entry against any
 * person or any firm on the platform, including people it had never
 * met and competitors it had never traded with. That is not a filing
 * mistake, it is a compliance record with a named subject and a stated
 * reason, kept forever, and it is exactly the sort of thing that has to
 * be defensible if the person ever asks what is held about them.
 *
 * So the rule is the one the trade already works to: **you may bar
 * somebody you have dealt with.** Put forward to you, placed with you,
 * on your books, invited by you — any of those, in either direction,
 * because a supplier bars a contractor it employed and a client bars a
 * contractor a supplier sent it, and both are real.
 *
 * Everything below is read from the work rather than typed in, which is
 * lesson one from the client Network week: "Fill from the work, not
 * from data entry."
 */

export interface KnownSubject {
  id: string
  name: string
  /** How this company knows them, in one short phrase for the row. */
  note: string
}

interface Raw {
  id: string
  name: string
  note: string
  /** Lower is a stronger description of the relationship. */
  rank: number
}

/**
 * One row per subject, keeping the strongest description of how they are
 * known, sorted by name.
 *
 * Pure, so the merge can be tested without a database — which matters,
 * because the bug this replaces was in exactly the half that no unit
 * test could reach.
 */
export function mergeKnown(rows: readonly Raw[]): KnownSubject[] {
  const best = new Map<string, Raw>()
  for (const r of rows) {
    if (!r.id || !r.name) continue
    const seen = best.get(r.id)
    if (!seen || r.rank < seen.rank) best.set(r.id, r)
  }
  return [...best.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name, note }) => ({ id, name, note }))
}

/** Case-insensitive contains, and everything when nothing is typed. */
export function matching(subjects: readonly KnownSubject[], q: string): KnownSubject[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...subjects]
  return subjects.filter((s) => s.name.toLowerCase().includes(needle))
}

const TAKE = 2000

/**
 * Everybody this company has dealt with, whichever side of the deal it
 * was on.
 *
 * Five sources, because there are five true ways to have dealt with
 * somebody and no single table holds them: a submission either
 * direction, a placement either direction, a buy line the firm pays, a
 * seat or a bench listing here, and somebody the firm asked for itself
 * before any supplier put them forward.
 */
export async function peopleKnownTo(companyId: string): Promise<KnownSubject[]> {
  const [subsIn, subsOut, sells, buys, seats, invites] = await Promise.all([
    prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { personId: true, person: { select: { name: true } }, fromCompany: { select: { name: true } } },
      take: TAKE,
    }),
    prisma.submission.findMany({
      where: { fromCompanyId: companyId },
      select: { personId: true, person: { select: { name: true } }, toCompany: { select: { name: true } } },
      take: TAKE,
    }),
    prisma.sellContract.findMany({
      where: { OR: [{ companyId }, { clientCompanyId: companyId }] },
      select: { personId: true, person: { select: { name: true } }, state: true },
      take: TAKE,
    }),
    // A buy line names its people through BuyContractCandidate — one row
    // per person, because five people can sit on one line.
    prisma.buyContractCandidate.findMany({
      where: { buyContract: { companyId } },
      select: { personId: true, person: { select: { name: true } } },
      take: TAKE,
    }),
    // A bench, not a staff list. Walked on the seeded world first, where
    // this returned the client's own program manager and HR partner as
    // people to bar — which is not a thing anybody does. You take a
    // colleague's seat away on the access register; you do not put them
    // on a do-not-return list. Only CONSULTANT contexts, which is a
    // supplier's own bench and the one case that is real.
    prisma.context.findMany({
      where: { companyId, revokedAt: null, type: 'CONSULTANT' },
      select: { personId: true, type: true, person: { select: { name: true } } },
      take: TAKE,
    }),
    prisma.contractorInvitation.findMany({
      where: { companyId, personId: { not: null } },
      select: { personId: true, name: true },
      take: TAKE,
    }),
  ])

  return mergeKnown([
    ...sells.map((c) => ({
      id: c.personId,
      name: c.person?.name ?? '',
      note: c.state === 'IN_PROGRESS' ? 'On a placement here now' : 'Has been placed here',
      rank: c.state === 'IN_PROGRESS' ? 0 : 1,
    })),
    ...buys.map((c) => ({ id: c.personId, name: c.person?.name ?? '', note: 'This firm pays them', rank: 1 })),
    ...seats.map((c) => ({
      id: c.personId,
      name: c.person?.name ?? '',
      note: 'On this firm’s bench',
      rank: 2,
    })),
    ...subsIn.map((s) => ({
      id: s.personId,
      name: s.person?.name ?? '',
      note: `Put forward by ${s.fromCompany?.name ?? 'a supplier'}`,
      rank: 3,
    })),
    ...subsOut.map((s) => ({
      id: s.personId,
      name: s.person?.name ?? '',
      note: `Put forward to ${s.toCompany?.name ?? 'a client'}`,
      rank: 3,
    })),
    ...invites.map((i) => ({ id: i.personId!, name: i.name ?? '', note: 'Asked for by this firm', rank: 4 })),
  ])
}

/**
 * Every firm this company has traded with, or agreed to trade with.
 *
 * The own company is dropped here rather than in the route: barring
 * yourself is already refused further down, and a picker that offers it
 * is a picker that invites the refusal.
 */
export async function firmsKnownTo(companyId: string): Promise<KnownSubject[]> {
  const [agreements, subsIn, subsOut, sells, buys, invitations] = await Promise.all([
    prisma.masterAgreement.findMany({
      where: { OR: [{ vendorId: companyId }, { clientId: companyId }] },
      select: {
        vendorId: true, clientId: true, status: true,
        vendor: { select: { name: true } }, client: { select: { name: true } },
      },
      take: TAKE,
    }),
    prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { fromCompanyId: true, fromCompany: { select: { name: true } } },
      take: TAKE,
    }),
    prisma.submission.findMany({
      where: { fromCompanyId: companyId },
      select: { toCompanyId: true, toCompany: { select: { name: true } } },
      take: TAKE,
    }),
    prisma.sellContract.findMany({
      where: { OR: [{ companyId }, { clientCompanyId: companyId }] },
      select: {
        companyId: true, clientCompanyId: true,
        company: { select: { name: true } }, clientCompany: { select: { name: true } },
      },
      take: TAKE,
    }),
    prisma.buyContract.findMany({
      where: { companyId, vendorCompanyId: { not: null } },
      select: { vendorCompanyId: true, vendorCompany: { select: { name: true } } },
      take: TAKE,
    }),
    prisma.requirementInvitation.findMany({
      where: { OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }] },
      select: {
        fromCompanyId: true, toCompanyId: true,
        fromCompany: { select: { name: true } }, toCompany: { select: { name: true } },
      },
      take: TAKE,
    }),
  ])

  const rows: Raw[] = []
  const other = (a: string, aName: string | undefined, b: string, bName: string | undefined, note: string, rank: number) => {
    if (a !== companyId) rows.push({ id: a, name: aName ?? '', note, rank })
    else if (b !== companyId) rows.push({ id: b, name: bName ?? '', note, rank })
  }

  for (const a of agreements) {
    other(a.vendorId, a.vendor?.name, a.clientId, a.client?.name,
      a.status === 'ACTIVE' ? 'Agreement in force' : 'Agreement on file', a.status === 'ACTIVE' ? 0 : 1)
  }
  for (const c of sells) {
    other(c.companyId, c.company?.name, c.clientCompanyId, c.clientCompany?.name, 'On a placement together', 1)
  }
  for (const c of buys) {
    if (c.vendorCompanyId) rows.push({ id: c.vendorCompanyId, name: c.vendorCompany?.name ?? '', note: 'This firm buys from them', rank: 1 })
  }
  for (const s of subsIn) rows.push({ id: s.fromCompanyId, name: s.fromCompany?.name ?? '', note: 'Has put people forward here', rank: 2 })
  for (const s of subsOut) rows.push({ id: s.toCompanyId, name: s.toCompany?.name ?? '', note: 'This firm has put people forward there', rank: 2 })
  for (const i of invitations) {
    other(i.fromCompanyId, i.fromCompany?.name, i.toCompanyId, i.toCompany?.name, 'Invited to a role', 3)
  }

  return mergeKnown(rows.filter((r) => r.id !== companyId))
}

/**
 * What a reader is told when they try to bar somebody this company has
 * never met. Names the person, says the rule, says what to do instead.
 */
export function notKnownHere(target: Target, name: string | null, companyName: string): string {
  const who = name?.trim() || (target === 'PERSON' ? 'That person' : 'That firm')
  return target === 'PERSON'
    ? `${who} has never been put forward to ${companyName}, placed here, or on its books, so there ` +
      `is nothing for ${companyName} to decide about them. A do-not-return list records a decision ` +
      `this company took about somebody it dealt with; it is not a way to mark a stranger. If they ` +
      `are put forward here, you can bar them from the submission.`
    : `${companyName} has no dealings with ${who} on record — no agreement, no submission either way, ` +
      `no placement. A do-not-return list records a decision this company took about a firm it ` +
      `traded with. If they approach you or are recommended as a supplier, you can bar them then.`
}
