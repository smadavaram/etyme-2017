import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { byCalendar } from '@/lib/visa-petition'

/**
 * GET /api/cron/visa-watch
 *
 * BUILD.md §5: "visaWatch — monitor visa petition milestones"
 *
 * Runs nightly. Scans for visa petitions with T-90, T-60, or T-30 day
 * milestones approaching and creates notifications.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const MILESTONES = [90, 60, 30] // days before expiry

  try {
    // Find all active (non-expired, non-denied) visa petitions with an expiry date
    const petitions = await prisma.visaPetition.findMany({
      where: {
        expiresAt: { not: null },
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

    // The calendar moves the last two statuses: inside ninety days an
    // active petition is running out; past the date it is expired. Each
    // move is an event on the petition, so the file reads like a file.
    let moved = 0
    for (const p of petitions) {
      const next = byCalendar(p.status, p.expiresAt, now)
      if (next) {
        await prisma.visaPetition.update({
          where: { id: p.id },
          data: { status: next, events: { create: { eventType: next === 'EXPIRED' ? 'EXPIRED' : 'EXPIRING', occurredAt: now, notes: 'By the calendar.' } } },
        })
        moved++
      }
    }

    for (const p of petitions) {
      if (!p.expiresAt || p.expiresAt < now) continue

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
        moved,
        notifications: notifications.length,
        message: `Scanned ${petitions.length} petition(s), sent ${notifications.length} notification(s)`,
      },
    })
  } catch (err: any) {
    reportError('Visa watch failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Visa watch failed' } },
      { status: 500 }
    )
  }
}
