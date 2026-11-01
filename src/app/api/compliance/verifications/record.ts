import { prisma } from '@/lib/db'
import type { CheckRow } from '@/lib/attestation'
import {
  EMPLOYED_ON,
  employerOnChain,
  type ChainLine,
  type Employer,
  type EmploymentFact,
} from '@/lib/document-stages/employer'

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

/**
 * What the record says about who employs a person: their live lines,
 * and every fact that a firm employs them (an employee seat, or a buy
 * line of the firm's own that pays them by payroll with nobody in
 * between). Read once and handed to `lib/document-stages/employer`.
 */
export async function employmentOf(personId: string): Promise<{ lines: ChainLine[]; facts: EmploymentFact[] }> {
  const [lines, seats, payroll] = await Promise.all([
    prisma.sellContract.findMany({
      where: { personId, state: { notIn: ['CANCELLED', 'ENDED'] } },
      select: { id: true, companyId: true, clientCompanyId: true },
      orderBy: { id: 'asc' },
      take: 40,
    }),
    prisma.context.findMany({
      where: { personId, type: 'EMPLOYEE', revokedAt: null, companyId: { not: null } },
      select: { companyId: true },
    }),
    prisma.buyContractCandidate.findMany({
      where: {
        personId,
        state: 'ACTIVE',
        buyContract: { vendorCompanyId: null, contractType: { in: [...EMPLOYED_ON] as never[] }, state: { notIn: ['CANCELLED', 'ENDED'] as never[] } },
      },
      select: { buyContract: { select: { companyId: true } } },
    }),
  ])
  return {
    lines,
    facts: [
      ...seats.map((s) => ({ companyId: s.companyId!, how: 'EMPLOYEE' as const })),
      ...payroll.map((p) => ({ companyId: p.buyContract.companyId, how: 'PAYROLL' as const })),
    ],
  }
}

/**
 * The firm that employs the person on the chain under this line, with
 * its name, or null where the line is not one of theirs.
 */
export async function employerOfRecord(personId: string, fromLineId: string): Promise<(Employer & { name: string }) | null> {
  const { lines, facts } = await employmentOf(personId)
  const employer = employerOnChain({ fromLineId, lines, facts })
  if (!employer) return null
  const firm = await prisma.company.findUnique({ where: { id: employer.companyId }, select: { name: true } })
  return { ...employer, name: firm?.name ?? 'the firm that employs them' }
}

/**
 * Which firms employ each of these people, as the record says it: an
 * employee seat, or a buy line of the firm's own paying them by payroll.
 * Keyed `companyId:personId`, for a page that asks of many rows at once.
 */
export async function employedPairs(personIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(personIds.filter(Boolean))]
  if (ids.length === 0) return new Set()
  const [seats, payroll] = await Promise.all([
    prisma.context.findMany({
      where: { personId: { in: ids }, type: 'EMPLOYEE', revokedAt: null, companyId: { not: null } },
      select: { companyId: true, personId: true },
    }),
    prisma.buyContractCandidate.findMany({
      where: {
        personId: { in: ids },
        state: 'ACTIVE',
        buyContract: { vendorCompanyId: null, contractType: { in: [...EMPLOYED_ON] as never[] }, state: { notIn: ['CANCELLED', 'ENDED'] as never[] } },
      },
      select: { personId: true, buyContract: { select: { companyId: true } } },
    }),
  ])
  return new Set([
    ...seats.map((s) => `${s.companyId}:${s.personId}`),
    ...payroll.map((p) => `${p.buyContract.companyId}:${p.personId}`),
  ])
}
