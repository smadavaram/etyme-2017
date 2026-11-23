import { prisma } from '@/lib/db'
import { awardFromOffer } from './rules'

/**
 * What the award opens on where somebody accepted an offer on this
 * submission: the rate in cents and the start day (`awardFromOffer`). Null
 * where no offer was accepted. The one reader the award route and the
 * Place dialog share, so they cannot disagree.
 */
export async function acceptedOfferFor(submissionId: string, buyerCurrency: string | null) {
  const offer = await prisma.offer.findFirst({
    where: { submissionId, state: 'ACCEPTED' },
    orderBy: { updatedAt: 'desc' },
    select: { state: true, rate: true, currency: true, startDate: true },
  })
  return awardFromOffer(offer, buyerCurrency)
}
