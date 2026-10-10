import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { desksFor, deskPeople, orderedOfSuppliers } from '@/lib/supplier-desks'
import { applyUrl, newApplyToken, sendLink } from '@/lib/supplier-link'
import { newChecklist, withOrderedItems } from '@/lib/supplier-onboarding'

/**
 * Open one supplier request: the row, the link, and the first desk told.
 *
 * Two doors lead here and they must not drift: a hiring manager
 * recommending a firm by name from Suppliers (`/api/supplier-requests`),
 * and a client's recruiter asking to add a firm a match suggested
 * (`/api/requirements/[id]/matches/add-firm`, 2026-09-30). Both walk the
 * same four desks from the same first one, so the row is written in one
 * place.
 */

export type ComesInAs = 'PRIME_VENDOR' | 'SUB_UNDER_MSP' | 'SUB_UNDER_PRIME'

export const COMES_IN_AS: readonly ComesInAs[] = ['PRIME_VENDOR', 'SUB_UNDER_MSP', 'SUB_UNDER_PRIME']

/** How the firm comes in, in the words a program office uses. */
export function comesInWords(as: ComesInAs, underName: string | null): string {
  switch (as) {
    case 'PRIME_VENDOR':
      return 'as a prime vendor, billing you directly'
    case 'SUB_UNDER_MSP':
      return underName
        ? `as a supplier in the program ${underName} runs for you`
        : 'as a supplier in the program Etyme’s program office runs for you'
    case 'SUB_UNDER_PRIME':
      return `as a sub-vendor under ${underName ?? 'one of your prime vendors'}, who bills you`
  }
}

export interface OpenInput {
  companyId: string
  companyName: string
  recommender: { id: string; name: string }
  name: string
  domain: string | null
  contactName: string | null
  /** Stored on the request, and the link goes to it. */
  contactEmail: string | null
  reason: string
  skills: string[]
  /** Where the link goes when it is not a contact the client should hold. */
  linkTo?: { email: string; name: string | null } | null
  fromMatch?: {
    requirementId: string
    matchId: string
    firmCompanyId: string
    comesInAs: ComesInAs
    underCompanyId: string | null
  } | null
}

export async function openSupplierRequest(input: OpenInput) {
  const row = await prisma.supplierRequest.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      domain: input.domain,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      skills: input.skills,
      reason: input.reason,
      recommendedById: input.recommender.id,
      stage: 'LEAD',
      decisions: [],
      checklist: withOrderedItems(newChecklist(), await orderedOfSuppliers(input.companyId), input.companyName) as unknown as object,
      token: newApplyToken(),
      ...(input.fromMatch ?? {}),
    },
  })

  const to = input.contactEmail
    ? { email: input.contactEmail, name: input.contactName }
    : input.linkTo ?? null
  let delivery: { state: string; note: string } | null = null
  if (to) {
    delivery = await sendLink({ to: to.email, contactName: to.name, firmName: input.name, clientName: input.companyName, token: row.token })
    await prisma.supplierRequest.update({ where: { id: row.id }, data: { linkSentAt: new Date() } })
  }

  const desks = await desksFor(input.companyId, input.recommender.id)
  for (const personId of (await deskPeople(input.companyId, 'LEAD', desks, [input.recommender.id])).filter((p) => p !== input.recommender.id)) {
    void notify({
      personId, companyId: input.companyId, type: 'SYSTEM', entityId: row.id, channel: 'EMAIL',
      title: `Supplier recommended — ${input.name}`,
      body: `${input.recommender.name} recommends ${input.name}${input.skills.length ? ` for ${input.skills.join(', ')}` : ''}: ${input.reason}. It is on your desk to confirm the need, then Procurement, HR and Finance take it in turn. Open Suppliers to decide.`,
      data: { href: '/dashboard/suppliers' },
    })
  }

  return { row, delivery, leadNamed: desks.leadId != null, link: applyUrl(row.token) }
}
