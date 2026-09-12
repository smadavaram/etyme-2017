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
    // Find all active (non-expired, non-denied) visa petitions with an expiry date
    const petitions = await prisma.visaPetition.findMany({
      where: {
        expiresAt: { not: null, gt: now },
        status: { notIn: ['DENIED', 'EXPIRED'] },
      },
      include: {
        person: { select: { id: true, name: true } },
      },
    })

    const notifications: Array<{
      personName: string
      petitionType: string
      daysUntilExpiry: number
      milestone: number
    }> = []

    for (const p of petitions) {
      if (!p.expiresAt) continue

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
            type: 'VISA_EXPIRY',
            title: `Visa petition expires in ${daysUntilExpiry} days`,
            body: `${p.person.name}'s ${p.type} petition expires ${p.expiresAt.toLocaleDateString()}`,
            data: {
              petitionId: p.id,
              petitionType: p.type,
              daysUntilExpiry,
              milestone,
            },
          },
        })
        notifications.push({
          personName: p.person.name,
          petitionType: p.type,
          daysUntilExpiry,
          milestone,
        })
      } catch {
        // Skip duplicate notifications
      }
    }

    // AutomationLog — find the person's company through their active context
    if (notifications.length > 0 && petitions.length > 0) {
      const context = await prisma.context.findFirst({
        where: { personId: petitions[0].personId, revokedAt: null, companyId: { not: null } },
        select: { companyId: true },
      })

      if (context?.companyId) {
        await prisma.automationLog.create({
          data: {
            companyId: context.companyId,
            action: 'VISA_WATCH',
            summary: `Sent ${notifications.length} visa expiry notification(s)`,
            reason: 'Nightly visa petition milestone scan',
            payload: { notifications },
            reversible: false,
          },
        })
      }
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
