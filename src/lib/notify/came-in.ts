import { prisma } from '@/lib/db'
import { everCameIn, type CameInTraces } from '@/lib/notify/sign-in-link'

/**
 * Whether anybody has ever used this person's record, by any door
 * (2026-11-16). The one predicate the sign-in door reads before it lets
 * the holder of a firm's link choose a password: only a record with no
 * trace at all may be given a first password from a link a firm holds.
 *
 * Every trace the platform keeps, read in one go: the Person row's own
 * fields, the sign-in methods and directory identities on record, the
 * one-time links she opened (never one a newer link superseded), the
 * seats a request of hers used and her own company-less seat, which
 * only her own session opens, every access-log row naming her as the
 * actor (any firm, any action, refusals included), her own conversations and requests, her own page, and her
 * answers to bench invitations. The list and its reasons are in
 * `CameInTraces` (lib/notify/sign-in-link), which decides.
 *
 * Read only at the door's use, never for the line a firm reads on her
 * row: what the firm reads never says whether an address has an account.
 * A person with no record at all reads as used, so the door never offers
 * a password on a record it cannot read.
 */
export async function cameInTraces(personId: string): Promise<CameInTraces | null> {
  const [p, usedLinks, ownSeats, answers] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      select: {
        passwordHash: true, emailVerifiedAt: true, sessionVersion: true, sessionsEndedAt: true,
        consultant: { select: { bioWrittenBy: true, confirmedAt: true, pageLiveAt: true } },
        _count: {
          select: {
            credentials: true,
            externalIdentities: true,
            contexts: { where: { lastUsedAt: { not: null } } },
            actions: true,
            askEtymeThreads: true,
            modelPrompts: true,
            teamsConversations: true,
            dataRequestsMade: true,
          },
        },
      },
    }),
    // A one-time link she opened. A newer link marks an older one used
    // too, with `supersededAt` on it: that one was never opened by anybody.
    prisma.emailToken.findMany({ where: { personId, usedAt: { not: null } }, select: { payload: true } }),
    // Her own company-less seat: only her own session opens one.
    prisma.context.count({ where: { personId, type: 'CONSULTANT', companyId: null } }),
    prisma.benchListing.count({
      where: { consultant: { personId }, OR: [{ respondedAt: { not: null } }, { termsAgreedAt: { not: null } }] },
    }),
  ])
  if (!p) return null
  const c = p._count
  const ownPage = p.consultant
    ? Number(p.consultant.bioWrittenBy === 'PERSON') + Number(Boolean(p.consultant.confirmedAt)) + Number(Boolean(p.consultant.pageLiveAt))
    : 0
  return {
    password: Boolean(p.passwordHash),
    mailboxProved: Boolean(p.emailVerifiedAt),
    signInMethods: c.credentials,
    directoryIdentities: c.externalIdentities,
    sessionsEnded: p.sessionVersion > 0 || Boolean(p.sessionsEndedAt),
    oneTimeLinksUsed: usedLinks.filter((t) => !(t.payload && typeof t.payload === 'object' && 'supersededAt' in (t.payload as object))).length,
    seatsUsed: c.contexts,
    ownSeats,
    actsAsActor: c.actions,
    ownWords: c.askEtymeThreads + c.modelPrompts + c.teamsConversations + c.dataRequestsMade + ownPage,
    answers,
  }
}

/** The predicate itself: true where any trace exists, or where the record cannot be read. */
export async function hasEverCameIn(personId: string): Promise<boolean> {
  const t = await cameInTraces(personId)
  return t === null || everCameIn(t)
}
