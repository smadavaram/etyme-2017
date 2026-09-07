import { prisma } from '@/lib/db'
import { applyReply, type Kind, type Reply } from '@/lib/texts'
import { lastAsked } from '@/lib/messages'

/**
 * What happens when a consultant answers.
 *
 * There are two ways an answer arrives and they must do exactly the same
 * thing to the record, or the two paths drift and one of them quietly
 * stops honouring a stop request.
 *
 *   A click on a signed link. The normal way. The answer is unambiguous
 *   because the link carries it.
 *
 *   An email written back. Plenty of people will reply rather than click,
 *   and "no im on a contract till march" is a perfectly good answer that
 *   `readReply` can read. Treating it as silence would push a responsive
 *   consultant down the rankings for being polite.
 *
 * So both land here.
 */

export interface Answer {
  /** The consultant profile row. */
  profileId: string
  personId: string
  /** What we asked. Decides how the answer is read and what it changes. */
  asked: Kind
  reply: Reply
  /** Stored verbatim as the inbound message, so the trail is honest. */
  heard: string
}

export interface Recorded {
  says: string
  needsFollowUp: boolean
  /** Whose message this was filed under. */
  companyId: string
}

/**
 * Write the answer down and let it change the record.
 *
 * Order matters. The inbound message is recorded first, whatever it turns
 * out to mean — an answer we failed to act on is recoverable, an answer
 * we never wrote down is not.
 */
export async function recordAnswer(a: Answer): Promise<Recorded> {
  const asked = await lastAsked(a.personId)
  const companyId = asked?.companyId ?? (await anyBench(a.personId))
  const now = new Date()
  const effect = applyReply(a.reply, now)

  await prisma.textMessage.create({
    data: {
      companyId,
      personId: a.personId,
      kind: a.asked,
      direction: 'IN',
      body: a.heard,
      status: 'SENT',
      read: a.reply,
      replyToId: asked?.id ?? null,
      aboutType: asked?.aboutType ?? null,
      aboutId: asked?.aboutId ?? null,
    },
  })

  await prisma.consultantProfile.update({
    where: { id: a.profileId },
    data: {
      ...(effect.confirmedAt ? { confirmedAt: effect.confirmedAt, confirmedVia: 'EMAIL' } : {}),
      ...(effect.unanswered !== null ? { unanswered: effect.unanswered } : {}),
      ...(effect.textsOffAt ? { textsOffAt: effect.textsOffAt } : {}),
    },
  })

  // A consent answer decides a hold. This is the cheapest deduplication
  // anybody will ever build: "no, someone already put me forward there"
  // arrives before the client sees the same name twice and rejects both.
  if (a.asked === 'CONSENT' && (a.reply === 'YES' || a.reply === 'NO')) {
    const hold = await prisma.representation.findFirst({
      where: {
        personId: a.personId,
        companyId,
        state: { in: ['HELD', 'REQUESTED'] },
      },
      orderBy: { takenAt: 'desc' },
      select: { id: true },
    })

    if (hold) {
      await prisma.representation.update({
        where: { id: hold.id },
        data:
          a.reply === 'YES'
            ? { consentedAt: now, consentVia: 'EMAIL', state: 'HELD' }
            : {
                state: 'DECLINED',
                // Cleared, not left standing. A declined hold carrying an
                // old consent timestamp is a record that can be read two
                // ways, and the wrong reading submits somebody who said no.
                consentedAt: null,
                consentVia: null,
                endedAt: now,
                endedReason: 'They said no to being put forward for this one.',
              },
      })
    }
  }

  return { says: effect.says, needsFollowUp: effect.needsFollowUp, companyId }
}

/** Which vendor to file an answer under when we cannot tell from the ask. */
export async function anyBench(personId: string): Promise<string> {
  const listing = await prisma.benchListing.findFirst({
    where: { consultant: { personId }, revokedAt: null },
    select: { companyId: true },
  })
  if (listing) return listing.companyId

  const contract = await prisma.sellContract.findFirst({
    where: { personId },
    select: { companyId: true },
  })
  return contract!.companyId
}
