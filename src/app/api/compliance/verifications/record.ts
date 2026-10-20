import { prisma } from '@/lib/db'
import type { CheckRow } from '@/lib/attestation'

/**
 * Put one recorded check on file, with the documents behind it.
 *
 * One writer for every door that records a check — the verifications
 * route and, since 2026-10-20, a packet item accepted with its
 * examination recorded — so a check that arrived through a packet is the
 * same row, with the same backing, as one typed in by HR. The start check
 * (`lib/contract-clearance`) reads `Verification` and nothing else, so
 * there is no second shape for it to learn.
 *
 * The same paper recorded twice is one paper: matched on what is printed
 * on it, so a second press does not leave two rows for one certificate —
 * two rows for one certificate is how a lapse hides behind its own
 * renewal.
 */
export async function writeCheck(input: {
  row: CheckRow
  subject: { personId: string } | { companyId: string }
  /** The person the evidence behind an I-9 belongs to. */
  personId: string | null
  recordedById: string
  /** The firm recording it, which is the firm that ordered it where a provider rendered it. */
  recordingCompanyId: string
  now: Date
}): Promise<{ id: string; already: boolean }> {
  const { row, subject, recordedById, now } = input
  const already = await prisma.verification.findFirst({
    where: {
      ...subject,
      type: row.type as never,
      status: row.status as never,
      referenceId: row.referenceId,
      expiresAt: row.expiresAt,
      formEdition: row.formEdition,
      provider: row.provider,
    },
    select: { id: true },
  })
  if (already) return { id: already.id, already: true }

  const id = await prisma.$transaction(async (tx) => {
    const made = await tx.verification.create({
      data: {
        ...subject,
        type: row.type as never,
        status: row.status as never,
        provider: row.provider,
        referenceId: row.referenceId,
        issuedAt: row.issuedAt,
        validFrom: row.validFrom,
        expiresAt: row.expiresAt,
        formEdition: row.formEdition,
        result: (row.result ?? undefined) as never,
        orderedByCompanyId: row.ordered ? input.recordingCompanyId : null,
        orderedAt: row.orderedAt,
        uploadedById: recordedById,
        verifiedById: recordedById,
        verifiedAt: row.verifiedAt,
      },
      select: { id: true },
    })
    for (const e of row.evidence) {
      const seen = await tx.verification.create({
        data: {
          personId: input.personId,
          type: e.type as never,
          status: 'CLEAR',
          provider: e.provider,
          referenceId: e.referenceId,
          expiresAt: e.expiresAt,
          uploadedById: recordedById,
          verifiedById: recordedById,
          verifiedAt: now,
        },
        select: { id: true },
      })
      await tx.documentBacking.create({
        data: { formId: made.id, evidenceId: seen.id, satisfiedKey: e.type, recordedById },
      })
    }
    return made.id
  })
  return { id, already: false }
}
