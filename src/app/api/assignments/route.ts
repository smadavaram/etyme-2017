import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateCycles } from '@/lib/cycle-generator'
import type { CycleDefinition } from '@/lib/cycle-generator'
import { getTemplatePack } from '@/lib/template-packs'

/**
 * POST /api/assignments
 *
 * BUILD.md: "→ generates the full Cycle chain in one transaction"
 *
 * Creates an Assignment and generates all cycle dates based on the
 * company's template pack configuration.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const {
    personId,
    employerCompanyId,
    engagementId,
    payRate,
    billRate,
    contractType,
    startDate,
    endDate,
    originEntityId,
    subVendorCompanyId,
  } = body

  // Validation
  if (!personId) return errResponse('personId is required', 'personId')
  if (!employerCompanyId) return errResponse('employerCompanyId is required', 'employerCompanyId')
  if (typeof payRate !== 'number' || payRate <= 0) return errResponse('payRate must be a positive number', 'payRate')
  if (!contractType) return errResponse('contractType is required', 'contractType')
  if (!startDate) return errResponse('startDate is required', 'startDate')

  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  if (isNaN(start.getTime())) return errResponse('Invalid startDate', 'startDate')
  if (end && isNaN(end.getTime())) return errResponse('Invalid endDate', 'endDate')
  if (end && end <= start) return errResponse('endDate must be after startDate', 'endDate')

  // Verify company and get template pack for cycle definitions
  const company = await prisma.company.findUnique({
    where: { id: employerCompanyId },
    select: { id: true, name: true, templatePack: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create the assignment
      const assignment = await tx.assignment.create({
        data: {
          personId,
          employerCompanyId,
          engagementId: engagementId ?? null,
          originEntityId: originEntityId ?? null,
          subVendorCompanyId: subVendorCompanyId ?? null,
          payRate,
          billRate: billRate ?? null,
          contractType,
          state: 'PENDING',
          startDate: start,
          endDate: end,
        },
      })

      // Generate cycles from template pack
      let cyclesCreated = 0
      if (company.templatePack && end) {
        const pack = getTemplatePack(company.templatePack)
        if (pack) {
          const definitions: CycleDefinition[] = pack.cycleDefinitions.map((cd) => ({
            kind: cd.kind as any,
            frequency: cd.frequency as any,
            offsetDays: 0,
          }))

          const generatedCycles = generateCycles(start, end, definitions)

          if (generatedCycles.length > 0) {
            await tx.cycle.createMany({
              data: generatedCycles.map((c) => ({
                assignmentId: assignment.id,
                kind: c.kind,
                dueOn: c.dueOn,
              })),
            })
            cyclesCreated = generatedCycles.length
          }
        }
      }

      // If endDate is within 8 weeks, create RolloffEvent
      let rolloff = null
      if (end) {
        const eightWeeksOut = new Date(Date.now() + 8 * 7 * 24 * 60 * 60 * 1000)
        if (end <= eightWeeksOut && end > new Date()) {
          rolloff = await tx.rolloffEvent.create({
            data: {
              assignmentId: assignment.id,
              endDate: end,
              notified: {},
              checklist: {
                knowledgeTransfer: false,
                finalTimesheet: false,
                accessRevocation: false,
                assets: false,
              },
            },
          })
        }
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId: employerCompanyId,
          action: 'ASSIGNMENT_CREATED',
          summary: `Assignment created for person ${personId}: ${contractType} at $${payRate}/hr, ${cyclesCreated} cycles generated`,
          reason: 'Assignment created via API',
          payload: {
            assignmentId: assignment.id,
            personId,
            contractType,
            payRate,
            billRate,
            cyclesCreated,
            hasRolloff: !!rolloff,
          },
          reversible: false,
        },
      })

      return { assignment, cyclesCreated, rolloff }
    })

    return NextResponse.json({
      data: {
        assignment: {
          id: result.assignment.id,
          personId: result.assignment.personId,
          state: result.assignment.state,
          contractType: result.assignment.contractType,
          payRate: result.assignment.payRate,
          billRate: result.assignment.billRate,
          startDate: result.assignment.startDate.toISOString(),
          endDate: result.assignment.endDate?.toISOString() ?? null,
        },
        cyclesCreated: result.cyclesCreated,
        rolloff: result.rolloff ? { id: result.rolloff.id, endDate: result.rolloff.endDate.toISOString() } : null,
        message: `Assignment created with ${result.cyclesCreated} cycles${result.rolloff ? ' and rolloff event' : ''}`,
      },
    }, { status: 201 })
  } catch (err: any) {
    console.error('Assignment creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Assignment creation failed' } },
      { status: 500 }
    )
  }
}

/**
 * GET /api/assignments
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const url = request.nextUrl
  const companyId = url.searchParams.get('companyId')
  const state = url.searchParams.get('state')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const where: any = {}
  if (companyId) where.employerCompanyId = companyId
  if (state) where.state = state.toUpperCase()

  const [assignments, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        _count: { select: { cycles: true, timesheets: true } },
        rolloff: { select: { id: true, endDate: true, outcome: true } },
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.assignment.count({ where }),
  ])

  return NextResponse.json({
    data: {
      assignments: assignments.map((a) => ({
        id: a.id,
        person: a.person,
        state: a.state,
        contractType: a.contractType,
        payRate: a.payRate,
        billRate: a.billRate,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate?.toISOString() ?? null,
        cycles: a._count.cycles,
        timesheets: a._count.timesheets,
        rolloff: a.rolloff ? { id: a.rolloff.id, endDate: a.rolloff.endDate.toISOString(), outcome: a.rolloff.outcome } : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}

function errResponse(message: string, field: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 422 }
  )
}
