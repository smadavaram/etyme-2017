import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/submissions/:id/interviews
 *
 * Schedule an interview for a submission. Stored as a Notification
 * with type='INTERVIEW' and structured data in the JSON `data` field,
 * since the schema has no dedicated Interview model.
 *
 * Body: {
 *   scheduledAt: string,                                  // ISO datetime
 *   interviewType: 'PHONE' | 'VIDEO' | 'ONSITE' | 'PANEL',
 *   interviewerName?: string,
 *   notes?: string,
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { scheduledAt, interviewType, interviewerName, notes } = body

  // Validate required fields
  const validTypes = ['PHONE', 'VIDEO', 'ONSITE', 'PANEL']
  if (!scheduledAt) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'scheduledAt is required', field: 'scheduledAt' } },
      { status: 422 }
    )
  }

  const scheduled = new Date(scheduledAt)
  if (isNaN(scheduled.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid scheduledAt date', field: 'scheduledAt' } },
      { status: 422 }
    )
  }

  if (!interviewType || !validTypes.includes(interviewType)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `interviewType must be one of: ${validTypes.join(', ')}`, field: 'interviewType' } },
      { status: 422 }
    )
  }

  // Verify submission exists
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      requirement: { select: { id: true, title: true } },
      fromCompany: { select: { id: true, name: true } },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
      { status: 404 }
    )
  }

  // Create interview as a Notification record
  const notification = await prisma.notification.create({
    data: {
      personId: submission.personId,
      companyId: submission.fromCompanyId,
      type: 'INTERVIEW',
      title: `${interviewType} interview for "${submission.requirement.title}"`,
      body: `${interviewType} interview scheduled for ${scheduled.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${scheduled.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}${interviewerName ? ` with ${interviewerName}` : ''}`,
      entityId: id,
      channel: 'IN_APP',
      status: 'UNREAD',
    },
  })

  return NextResponse.json({
    data: {
      id: notification.id,
      submissionId: id,
      interviewType,
      scheduledAt: scheduled.toISOString(),
      interviewerName: interviewerName ?? null,
      notes: notes ?? null,
      personName: submission.person.name,
      requirementTitle: submission.requirement.title,
      message: `${interviewType} interview scheduled for ${submission.person.name}`,
    },
  }, { status: 201 })
}

/**
 * GET /api/submissions/:id/interviews
 *
 * List all interviews for a submission.
 * Returns Notification records with type='INTERVIEW' linked via entityId.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  // Verify submission exists
  const submission = await prisma.submission.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
      { status: 404 }
    )
  }

  const interviews = await prisma.notification.findMany({
    where: {
      entityId: id,
      type: 'INTERVIEW',
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    data: {
      interviews: interviews.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        channel: n.channel,
        status: n.status,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      total: interviews.length,
    },
  })
}
