import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { readerReads } from '@/lib/trade-link'
import { signedOnFile, type ChecklistItem } from '@/lib/supplier-onboarding'
import type { Relationship } from '@/lib/counterparty'

/**
 * Asking a firm already on Etyme to link: the one place the ask is
 * written and heard.
 *
 * Two doors make it: a person pressing "Ask them to link" under Companies
 * (`POST /api/trade-links`), and a supplier approval that finds the firm
 * already here and not yet working with the client
 * (`app/api/supplier-requests/[id]/link-ask`). Both write the same row and
 * tell the same people, so the two can never disagree about who hears an
 * ask or what they read. Whether the ask may be made at all is
 * `mayAskToLink` in `lib/trade-link`, read by each caller first.
 */

/** Who may answer an ask to link, and so who hears one: whoever keeps the firm's list of companies. */
export const ANSWERS_A_LINK = 'vendors.manage'

/** The people at a firm who may answer an ask to link. */
export async function answerersAt(companyId: string): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, roleId: { not: null } },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  return [...new Set(seats.filter((s) => hasPermission((s.role?.permissions ?? []) as string[], ANSWERS_A_LINK)).map((s) => s.personId))]
}

/** The open ask between two firms, either way, or null. One open ask per pair. */
export async function openAskBetween(a: string, b: string): Promise<{ fromCompanyId: string } | null> {
  return prisma.tradeLinkRequest.findFirst({
    where: {
      answeredAt: null,
      OR: [{ fromCompanyId: a, toCompanyId: b }, { fromCompanyId: b, toCompanyId: a }],
    },
    select: { fromCompanyId: true },
  })
}

/**
 * Write the ask and tell whoever at the other firm may answer it, in the
 * app and by email. Nothing goes on either register: that waits for the
 * other firm's yes (`POST /api/trade-links/:id`).
 */
export async function askToLink(input: {
  asker: { id: string; name: string; kind: string }
  other: { id: string; name: string; kind: string }
  /** What the other firm is to the asker. */
  relationship: Relationship
  askedBy: { id: string; name: string }
  note?: string | null
}): Promise<{ id: string }> {
  const row = await prisma.tradeLinkRequest.create({
    data: {
      fromCompanyId: input.asker.id,
      toCompanyId: input.other.id,
      relationship: input.relationship,
      askedById: input.askedBy.id,
      note: input.note ?? null,
    },
    select: { id: true },
  })
  const words = readerReads({
    asker: { name: input.asker.name, kind: input.asker.kind },
    other: { name: input.other.name, kind: input.other.kind },
    relationship: input.relationship,
    askedBy: input.askedBy.name,
  })
  for (const personId of await answerersAt(input.other.id)) {
    void notify({
      personId, companyId: input.other.id, type: 'SYSTEM', channel: 'EMAIL', entityId: row.id,
      title: words.title, body: words.body, data: { href: '/dashboard/companies', tradeLinkId: row.id },
    })
  }
  return row
}

/**
 * The approval behind an ask, where there is one: the asker's own supplier
 * request, approved by its four steps, for the firm now saying yes. The
 * approval route records the firm on the request for exactly this case
 * (`supplierCompanyId`) and writes nothing on the firm until its yes.
 * Read on the yes so the firm arrives at the standing the client's own
 * people already gave it, not as a supplier nobody rated.
 */
export async function approvalBehind(askerId: string, answererId: string): Promise<{
  /** A sub-vendor under a prime keeps its paper with the prime: no agreement with the client. */
  underPrime: boolean
  /** The signed agreement, both firms' copy, was on file when the request was approved. */
  agreementSigned: boolean
} | null> {
  const req = await prisma.supplierRequest.findFirst({
    where: { companyId: askerId, supplierCompanyId: answererId, state: 'APPROVED' },
    orderBy: { decidedAt: 'desc' },
    select: { comesInAs: true, checklist: true },
  })
  if (!req) return null
  const items = (Array.isArray(req.checklist) ? req.checklist : []) as unknown as ChecklistItem[]
  const agreement = items.find((i) => i.key === 'AGREEMENT')
  return {
    underPrime: req.comesInAs === 'SUB_UNDER_PRIME',
    agreementSigned: signedOnFile(agreement),
  }
}
