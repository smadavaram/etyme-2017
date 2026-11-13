import { prisma } from '@/lib/db'
import { verificationsFromChecklist, type VerificationToWrite } from '@/lib/onboarding-evidence'
import type { ChecklistItem } from '@/lib/supplier-onboarding'

/**
 * Write what a desk verified onto the firm's own compliance record.
 *
 * `documentTypeKey` is resolved to the client's own `DocumentType` row
 * where the client invented the type, so a hot floor induction verified
 * here carries the client's key and not only the closest built-in enum
 * value. A key nobody defined leaves `documentTypeId` null, which is the
 * shipped-type case and is correct.
 *
 * Idempotent on the pair (company, type, the day it runs out): a desk
 * that unmarks an item and marks it again does not leave two rows for
 * one certificate, and two rows for one certificate is how a lapse hides
 * behind its own renewal.
 */
export async function recordEvidence(rows: VerificationToWrite[], definedBy: string): Promise<number> {
  if (rows.length === 0) return 0
  const defined = await prisma.documentType.findMany({
    where: { companyId: definedBy, key: { in: [...new Set(rows.map((r) => r.documentTypeKey))] } },
    select: { id: true, key: true },
  })
  const typeId = new Map(defined.map((d) => [d.key, d.id]))

  let written = 0
  for (const r of rows) {
    const already = await prisma.verification.findFirst({
      where: { companyId: r.companyId, type: r.type as never, expiresAt: r.expiresAt },
      select: { id: true },
    })
    if (already) continue
    const { documentTypeKey, ...row } = r
    await prisma.verification.create({
      data: {
        ...row,
        type: row.type as never,
        documentTypeId: typeId.get(documentTypeKey) ?? null,
        // The column is not nullable and a desk verifying a certificate
        // is the person who put it on the record.
        uploadedById: row.uploadedById ?? row.verifiedById ?? '',
      },
    })
    written++
  }
  return written
}

/**
 * What the client's own people verified on a supplier request, written
 * onto the firm's compliance record on the firm's yes to linking.
 *
 * A firm on Etyme approved before it took part gets nothing on its record
 * at the last yes (review, 2026-11-13); the items stay on the request.
 * The yes is the first moment its record may be written, so the
 * trade-link accept calls this once, with the asker and the firm saying
 * yes. One rule, `recordEvidence` over `verificationsFromChecklist`, the
 * same the approval uses for a firm that took part: never a copy of it.
 * Idempotent, so a second yes writes nothing twice. Returns how many rows
 * were written; zero where no approved request names the firm.
 */
export async function evidenceOnLinkYes(askerId: string, firmId: string, at: Date = new Date()): Promise<number> {
  const req = await prisma.supplierRequest.findFirst({
    where: { companyId: askerId, supplierCompanyId: firmId, state: 'APPROVED' },
    orderBy: { decidedAt: 'desc' },
    select: { checklist: true, decidedById: true },
  })
  if (!req) return 0
  const items = (Array.isArray(req.checklist) ? req.checklist : []) as unknown as ChecklistItem[]
  const evidence = verificationsFromChecklist(items, firmId, { personId: req.decidedById ?? '', at })
  return recordEvidence(evidence.rows, askerId)
}
