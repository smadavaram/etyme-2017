import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/cron/visa-watch
 *
 * BUILD.md §5: "visaWatch — monitor visa petition milestones"
 *
 * Runs nightly. Scans for visa petitions with T-90, T-60, or T-30 day
 * milestones approaching and creates notifications.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const MILESTONES = [90, 60, 30] // days before expiry

  try {
    // Find all active (non-expired, non-denied) visa petitions
    const petitions = await prisma.visaPetition.findMany({
      where: {
        expiresAt: { gt: now },
        status: { notIn: ['DENIED', 'WITHDRAWN', 'EXPIRED'] },
      },
      include: {
        person: { select: { id: true, name: true } },
      },
    })

    const notifications = []

    for (const p of petitions) {
      const daysUntilExpiry = Math.ceil(
        (p.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )

      // Check if we're at a milestone boundary
      const milestone = MILESTONES.find((m) => daysUntilExpiry <= m && daysUntilExpiry > m - 1)
      if (!milestone) continue

      try {
        await prisma.notification.create({
          data: {
            personId: p.personId,
            companyId: p.companyId,
            type: 'VISA_EXPIRY',
            title: `Visa petition expires in ${daysUntilExpiry} days`,
            body: `${p.person.name}'s ${p.petitionType} petition (${p.caseNumber ?? 'no case#'}) expires ${p.expiresAt.toLocaleDateString()}`,
            data: {
              petitionId: p.id,
              petitionType: p.petitionType,
              daysUntilExpiry,
              milestone,
            },
          },
        })
        notifications.push({
          personName: p.person.name,
          petitionType: p.petitionType,
          daysUntilExpiry,
          milestone,
        })
      } catch {
        // Skip duplicate notifications
      }
    }

    // AutomationLog
    if (notifications.length > 0 && petitions.length > 0) {
      await prisma.automationLog.create({
        data: {
          companyId: petitions[0].companyId,
          action: 'VISA_WATCH',
          summary: `Sent ${notifications.length} visa expiry notification(s)`,
          reason: 'Nightly visa petition milestone scan',
          payload: { notifications },
          reversible: false,
        },
      })
    }

    return NextResponse.json({
      data: {
        scanned: petitions.length,
        notifications: notifications.length,
        message: `Scanned ${petitions.length} petition(s), sent ${notifications.length} notification(s)`,
      },
    })
  } catch (err: any) {
    console.error('Visa watch failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Visa watch failed' } },
      { status: 500 }
    )
  }
}
