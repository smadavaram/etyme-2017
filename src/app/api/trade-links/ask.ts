import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { readerReads } from '@/lib/trade-link'
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
 * The standing behind an ask, where there is one: the asker's own supplier
 * walk approved this firm, and this ask is the one that approval led to.
 * Read on the firm's yes so the firm lands on the asker's own list at the
 * standing the asker's own people gave it. It is the asker's judgment, on
 * the asker's own register row, and asserts nothing about the firm.
 *
 * What it never gives (review, 2026-11-13): an agreement, and least of
 * all a signed one. A yes to link is not a signature, and a file the
 * asker's own people attached is not the firm's paper, so nothing here
 * reads it. And an old
 * approval does not ride on every later ask: it stands behind an ask only
 * where the ask was made after the approval and is the first ask from the
 * asker to the firm since then.
 */
export async function standingBehind(ask: {
  fromCompanyId: string
  toCompanyId: string
  createdAt: Date
}): Promise<'APPROVED' | null> {
  const req = await prisma.supplierRequest.findFirst({
    where: {
      companyId: ask.fromCompanyId,
      supplierCompanyId: ask.toCompanyId,
      state: 'APPROVED',
      decidedAt: { not: null, lte: ask.createdAt },
    },
    orderBy: { decidedAt: 'desc' },
    select: { decidedAt: true },
  })
  if (!req?.decidedAt) return null
  const earlier = await prisma.tradeLinkRequest.count({
    where: {
      fromCompanyId: ask.fromCompanyId,
      toCompanyId: ask.toCompanyId,
      createdAt: { gte: req.decidedAt, lt: ask.createdAt },
    },
  })
  return earlier === 0 ? 'APPROVED' : null
}
