import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { renewFields, staySays } from '@/lib/bench-stay'
import { possessive } from '@/lib/requisition-approval'

/**
 * Tell a firm's recruiting desks something about one of its listings.
 *
 * The desks that put people forward — the same ones told when a person
 * takes a hold back (`app/api/me/benches`).
 */
export async function tellFirm(companyId: string, title: string, body: string, entityId: string) {
  const desks = await prisma.context.findMany({
    where: { companyId, revokedAt: null, role: { permissions: { hasSome: ['submissions.create', '*'] } } },
    select: { personId: true },
    take: 5,
  })
  // Awaited, never left to run after the answer: on a serverless host a
  // promise nobody waits for may never finish, and the firm would not be
  // told. A failed notice is its own incident (notify reports it) and
  // never undoes the ending it reports.
  await Promise.all(
    desks.map((d) => notify({ personId: d.personId, companyId, type: 'BENCH', title, body, entityId }).catch(() => null))
  )
  return desks.length
}

/**
 * Renew a bench stay, told to the firm and written down.
 *
 * Two doors lead here — the one tap in the reminder letter
 * (`/bench-invite/[token]`) and the person's own page
 * (`/dashboard/my-benches`) — and both write the same thing: the same
 * stay again from today, back on the bench, the firm told, a row on the
 * automation log so the renew can be read beside the ending it undid.
 */
export async function renewStay(listingId: string, via: 'LINK' | 'PAGE', now: Date = new Date()) {
  const listing = await prisma.benchListing.findUnique({
    where: { id: listingId },
    select: {
      id: true, state: true, stayDays: true, staysUntil: true, stayRemindedAt: true, revokedAt: true, lapsedAt: true,
      company: { select: { id: true, name: true } },
      consultant: { select: { personId: true, person: { select: { name: true } } } },
    },
  })
  if (!listing) return { ok: false as const, code: 'NOT_FOUND', says: 'That is not one of your listings.' }
  if (listing.state !== 'GRANTED') return { ok: false as const, code: 'INVALID_STATE', says: 'There is no yes here to renew.' }
  const renewed = renewFields(listing, now)
  if (!renewed.ok) return { ok: false as const, code: 'INVALID_STATE', says: renewed.says }

  const [after] = await prisma.$transaction([
    prisma.benchListing.update({ where: { id: listing.id }, data: renewed.data }),
    prisma.automationLog.create({
      data: {
        companyId: listing.company.id,
        action: 'BENCH_STAY_RENEWED',
        summary: `${listing.consultant.person.name} renewed their stay on ${possessive(listing.company.name)} bench for ${listing.stayDays} days`,
        reason:
          via === 'LINK'
            ? 'The person renewed it themselves, from the reminder link.'
            : 'The person renewed it themselves, from their own page.',
        payload: { listingId: listing.id, via, stayDays: listing.stayDays },
        reversible: true,
      },
    }),
  ])
  await tellFirm(
    listing.company.id,
    `${listing.consultant.person.name} renewed their stay on your bench`,
    `They chose ${listing.stayDays} more days. You can put them forward for jobs again.`,
    listing.id
  )
  return { ok: true as const, says: `Renewed. ${staySays(after, listing.company.name, now)}` }
}
