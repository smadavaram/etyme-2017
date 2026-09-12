import { prisma } from '@/lib/db'
import { OUTBOUND_PACKS, type OwnDocument } from '@/lib/outbound-pack'

/**
 * Where our own documents actually live.
 *
 * There is no "our documents" table, and this file does not add one. Two
 * places already hold them and both are read here:
 *
 *   **Verification rows about us.** `Verification.companyId` is the
 *   company being checked, not the company doing the checking, so rows
 *   with our own id are checks somebody ran on us — our certificates of
 *   insurance and our business registration.
 *
 *   **Packet items where we are the subject.** Anything collected into a
 *   `DocumentPacket` whose `subjectCompanyId` is us. That covers the
 *   kinds `VerificationType` has no enum value for — the W-9, the SOC 2
 *   report, the financials, the bank letter, the diversity certification
 *   — which is most of what a client's procurement team asks for.
 *
 * The second is also where `POST /api/outbound-pack/documents` writes, so
 * a company that has never been screened can put its own papers on file
 * without waiting for somebody else to verify them.
 */

/** The packet that holds a company's own papers. One per company. */
export const LIBRARY_KEY = 'OWN_DOCUMENT_LIBRARY'
export const LIBRARY_LABEL = 'Our own documents'

/** Every key any outbound pack can ask for, with the label to show. */
export const OWN_DOCUMENT_KINDS = (() => {
  const m = new Map<string, { key: string; label: string; validMonths: number | null }>()
  for (const p of OUTBOUND_PACKS) {
    for (const i of p.items) {
      if (!m.has(i.key)) m.set(i.key, { key: i.key, label: i.label, validMonths: i.validMonths })
    }
  }
  return [...m.values()]
})()

export function kindByKey(key: string) {
  return OWN_DOCUMENT_KINDS.find((k) => k.key === key) ?? null
}

/**
 * Statuses that mean we hold something.
 *
 * `EXPIRED` is included deliberately. A lapsed certificate is not the
 * same as one that was never collected — the first needs a phone call to
 * a broker, the second needs a policy — and collapsing them into
 * "missing" hides the difference on the one screen that exists to show
 * it.
 */
const HELD_STATUSES = ['CLEAR', 'CONDITIONAL', 'EXPIRED'] as const

export async function loadOwnDocuments(companyId: string): Promise<OwnDocument[]> {
  const [verifications, items] = await Promise.all([
    prisma.verification.findMany({
      where: { companyId, status: { in: [...HELD_STATUSES] } },
      select: {
        type: true, issuedAt: true, expiresAt: true,
        verifiedById: true, verifiedAt: true,
      },
    }),
    prisma.packetItem.findMany({
      where: {
        state: { in: ['RECEIVED', 'ACCEPTED'] },
        packet: { companyId, subjectCompanyId: companyId, cancelledAt: null },
      },
      select: {
        key: true, label: true, receivedAt: true, validUntil: true,
        reviewedById: true, reviewedAt: true, state: true,
      },
    }),
  ])

  const out: OwnDocument[] = []

  for (const v of verifications) {
    out.push({
      key: v.type,
      label: kindByKey(v.type)?.label ?? v.type,
      issuedAt: v.issuedAt,
      expiresAt: v.expiresAt,
      verifiedById: v.verifiedById,
      verifiedAt: v.verifiedAt,
    })
  }

  for (const i of items) {
    out.push({
      key: i.key,
      label: i.label,
      issuedAt: i.receivedAt,
      expiresAt: i.validUntil,
      // RECEIVED means a file arrived. Only ACCEPTED means somebody here
      // said they had looked at it, and the difference is the whole point
      // of having two states.
      verifiedById: i.state === 'ACCEPTED' ? i.reviewedById : null,
      verifiedAt: i.state === 'ACCEPTED' ? i.reviewedAt : null,
    })
  }

  return out
}

/** The library packet for a company, created on first use. */
export async function libraryPacket(companyId: string, createdById: string) {
  const existing = await prisma.documentPacket.findFirst({
    where: { companyId, subjectCompanyId: companyId, packetKey: LIBRARY_KEY },
    select: { id: true },
  })
  if (existing) return existing

  const { randomBytes } = await import('crypto')
  return prisma.documentPacket.create({
    data: {
      companyId,
      subjectCompanyId: companyId,
      packetKey: LIBRARY_KEY,
      label: LIBRARY_LABEL,
      purpose: 'COMPLIANCE_ANNUAL',
      direction: 'COLLECT',
      recipientEmail: 'library@internal.invalid',
      recipientName: 'Our own records',
      token: randomBytes(32).toString('base64url'),
      // The library is not a link anybody is given. The far date keeps the
      // shape of the model honest without inviting somebody to share it.
      expiresAt: new Date(Date.UTC(2999, 0, 1)),
      // Marked complete on creation so it does not sit in the "documents
      // asked for" queue forever waiting on a stranger who does not exist.
      completedAt: new Date(),
      createdById,
    },
    select: { id: true },
  })
}
