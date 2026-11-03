/**
 * What the start reads about the papers, read once for the Activate press
 * and for the panel that draws the button (GET on the same route), so the
 * button and the press cannot give two verdicts. Kept beside the route
 * because a route file may export only its handlers.
 */

import { prisma } from '@/lib/db'
import { contractClearance, lineExtras, ADVERSE_STEPS } from '@/lib/contract-clearance'

/** The facts of the placement the papers are read against. */
export interface StartPapersFor {
  id: string
  personId: string
  companyId: string
  endDate: Date | null
  person: { name: string }
  clientCompany: { name: string }
  requirement: { title: string } | null
}

/** The clearance a start is judged on, today. */
export async function startPapers(contract: StartPapersFor): Promise<ReturnType<typeof contractClearance>> {
  // Both selects ask when a document starts, not only when it runs out.
  // Without `validFrom` the floor added on 2026-09-16 reads undefined
  // and the clearance falls back to the day the certificate was issued
  // — so a policy printed today for cover beginning in October passed
  // here as held, at the one moment that matters: somebody starting
  // work. Addendum E names lapsed supplier insurance as a block, and
  // cover that has not begun is the same exposure a month early.
  //
  // 2026-09-17, on the same precedent and for the same reason a column
  // nobody selects is invisible to arithmetic that is already right:
  // `provider` and `result` carry who issued a license and its number
  // and state, which is what the refusal has to name — "RN 154-882, WI
  // expired" is something a compliance officer can check against a
  // register and "your license expired" is not.
  const FLOOR_AND_CEILING = {
    type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true,
    provider: true, result: true,
  } as const
  // 2026-10-20, found by the simulation: the person's own rows also need
  // the form's edition and the documents recorded behind it, the two
  // columns the placement page already selects. Without them every I-9
  // read "on file with nothing behind it" at the start, and an edition
  // was never judged — the same column-nobody-selects fault as above.
  const now = new Date()
  const [personRows, supplier, supplierCertificates] = await Promise.all([
    prisma.verification.findMany({
      where: { personId: contract.personId },
      select: {
        ...FLOOR_AND_CEILING,
        // The firm's steps after a flagged report, rows of their own since
        // 2026-10-21: a decision not to act on one stops the start warning.
        ...ADVERSE_STEPS,
        formEdition: true,
        backedBy: {
          select: {
            evidence: { select: { type: true, validFrom: true, issuedAt: true, expiresAt: true, status: true } },
          },
        },
      },
    }),
    prisma.company.findUnique({ where: { id: contract.companyId }, select: { name: true } }),
    prisma.verification.findMany({
      where: {
        companyId: contract.companyId,
        type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
      },
      select: FLOOR_AND_CEILING,
    }),
  ])
  // What each form was completed from, and whether that document is in
  // force today — read the way the placement page reads it, so the page
  // and the button give one verdict.
  const personVerifications = personRows.map((v) => ({
    ...v,
    backedBy: v.backedBy.map((b) => {
      const from = b.evidence.validFrom ?? b.evidence.issuedAt
      return {
        key: b.evidence.type,
        inForce:
          (b.evidence.status === 'CLEAR' || b.evidence.status === 'CONDITIONAL') &&
          !(from && from > now) &&
          !(b.evidence.expiresAt && b.evidence.expiresAt < now),
      }
    }),
  }))
  return contractClearance({
    personName: contract.person.name,
    personVerifications,
    supplierName: supplier?.name ?? 'the supplier',
    supplierCertificates,
    clientName: contract.clientCompany.name,
    on: now,
    // 2026-09-17. The role decides which start packet is run, and a
    // licensed role's packet requires the license — so a nurse with no
    // license on file at all is refused here, where before there was
    // no row to be lapsed and nothing to refuse. The last day says
    // whether a license in date today runs out inside the assignment.
    role: contract.requirement?.title ?? null,
    through: contract.endDate,
    // ── What this line itself asks for ──────────────────────────────
    //
    // Spread last, and it must be: it supersedes `supplierCertificates`
    // above with a superset that also carries the certificate of good
    // standing — every caller here selected keys beginning INSURANCE_,
    // so a supplier whose registration had been suspended read as
    // fully covered — and it supersedes nothing else that is set, while
    // adding the line's own required set, the papers signed against it
    // and both firms' document dictionaries.
    //
    // Until this was passed, a start was refused on the old fixed list
    // and a client's own order could ask for a drug screen, a clearance
    // or a code of conduct and nothing at activation would read it. A
    // requirement a client typed and nobody enforces is worse than one
    // it was never offered.
    ...(await lineExtras({ sellContractId: contract.id })),
  })
}
