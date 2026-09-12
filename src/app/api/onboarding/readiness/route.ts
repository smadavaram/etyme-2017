import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  clientChecklist, supplierChecklist, consultantChecklist, assignmentChecklist,
} from '@/lib/party-onboarding'

/**
 * GET /api/onboarding/readiness — the five onboardings, derived live.
 *
 * Nothing here is stored. Every checklist is computed from what actually
 * exists, so it cannot drift from the truth — the same rule that turned
 * the delivery matrix into a test.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Onboarding')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  const [counterparties, msas, contacts, costCenters, calendars, approvalRules] =
    await Promise.all([
      prisma.counterparty.findMany({
        where: { companyId },
        include: { otherCompany: { select: { id: true, name: true } } },
      }),
      prisma.masterAgreement.findMany({
        where: { OR: [{ vendorId: companyId }, { clientId: companyId }] },
        select: { vendorId: true, clientId: true },
      }),
      prisma.companyContact.groupBy({ by: ['atCompanyId'], where: { companyId }, _count: true }),
      prisma.costCenter.count({ where: { companyId } }),
      prisma.holiday.count({ where: { companyId } }),
      prisma.approvalRule.count({ where: { companyId } }),
    ])

  const contactCount = new Map(contacts.map((c) => [c.atCompanyId, c._count]))
  const msaWith = (otherId: string) =>
    msas.some(
      (m) =>
        (m.vendorId === companyId && m.clientId === otherId) ||
        (m.clientId === companyId && m.vendorId === otherId)
    )

  const clients = counterparties
    .filter((c) => c.relationship === 'CLIENT')
    .map((c) =>
      clientChecklist({
        name: c.otherCompany.name,
        onRegister: true,
        contacts: contactCount.get(c.otherCompanyId) ?? 0,
        msaSigned: msaWith(c.otherCompanyId),
        costCenters,
        holidayCalendar: calendars > 0,
        approvalRules: approvalRules > 0,
      })
    )

  // Supplier documents come from verifications and packet items held
  // about that company.
  const supplierRows = counterparties.filter((c) => c.relationship === 'SUPPLIER')
  const suppliers = await Promise.all(
    supplierRows.map(async (c) => {
      const [insurance, w9, remit] = await Promise.all([
        prisma.verification.findFirst({
          where: { companyId: c.otherCompanyId, type: { in: ['INSURANCE_GL', 'INSURANCE_WC'] } },
          orderBy: { expiresAt: 'desc' },
          select: { expiresAt: true },
        }),
        // W9 is not a VerificationType — company papers live as packet
        // items on a packet about that company. The regulatory agent
        // named this gap; until the enum grows, this is where the truth is.
        prisma.packetItem.count({
          where: {
            key: 'W9',
            state: { not: 'PENDING' },
            packet: { companyId, subjectCompanyId: c.otherCompanyId },
          },
        }),
        prisma.remitTo.count({ where: { companyId: c.otherCompanyId } }),
      ])
      return supplierChecklist({
        name: c.otherCompany.name,
        onRegister: true,
        contacts: contactCount.get(c.otherCompanyId) ?? 0,
        msaSigned: msaWith(c.otherCompanyId),
        insuranceCurrent: insurance
          ? insurance.expiresAt == null || insurance.expiresAt > new Date()
          : null,
        w9OnFile: w9 > 0,
        remitToOnFile: remit > 0,
      })
    })
  )

  const listings = await prisma.benchListing.findMany({
    where: { companyId, revokedAt: null },
    include: { consultant: { include: { person: { select: { id: true, name: true } } } } },
    take: 200,
  })
  const consultants = await Promise.all(
    listings.map(async (l) => {
      const p = l.consultant
      const buy = await prisma.buyContract.findFirst({
        where: { companyId, candidates: { some: { personId: p.personId } } },
        select: { payModel: true },
      })
      const packets = await prisma.documentPacket.findMany({
        where: { companyId, subjectPersonId: p.personId },
        select: { completedAt: true },
      })
      return consultantChecklist({
        name: p.person.name,
        profileComplete: (p.skills?.length ?? 0) > 0 && !!p.location,
        listingGranted: true,
        buyContract: buy != null,
        payModelSet: buy?.payModel != null,
        packetsComplete:
          packets.length === 0 ? null : packets.every((x) => x.completedAt != null),
      })
    })
  )

  const running = await prisma.sellContract.findMany({
    where: { companyId, state: { in: ['IN_PROGRESS', 'PAUSED', 'DRAFT', 'VERIFIED', 'PENDING_VERIFICATION'] } },
    include: {
      person: { select: { name: true } },
      clientCompany: { select: { name: true } },
      timesheets: { select: { id: true }, take: 1 },
    },
    take: 200,
  })
  const assignments = running.map((c) =>
    assignmentChecklist({
      label: `${c.person.name} at ${c.clientCompany.name}`,
      contractActive: c.state === 'IN_PROGRESS',
      cleared: true, // the block lives at submission; a running contract passed it
      startConfirmed: c.startConfirmedAt != null,
      firstTimesheetIn: c.timesheets.length > 0,
    })
  )

  // The id rides along so the screen can offer confirm-start.
  const assignmentIds = running.map((c) => c.id)

  return NextResponse.json({
    data: { clients, suppliers, consultants, assignments, assignmentIds },
  })
}
