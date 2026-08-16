import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/cron/due-cycles
 *
 * BUILD.md §5: "dueCycles — scan for cycles due within N days"
 *
 * Runs nightly via Vercel cron. Finds cycles with a due date within 7 days
 * that are still in OPEN state, and sends notifications/updates status.
 *
 * This enables the timesheet → invoice → payroll pipeline to flow
 * automatically without manual intervention.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  try {
    // Find cycles due within the window
    const dueCycles = await prisma.cycle.findMany({
      where: {
        periodEnd: { lte: windowEnd },
        status: 'OPEN',
      },
      include: {
        engagement: {
          include: {
            sellContract: {
              select: {
                id: true,
                personId: true,
                person: { select: { name: true } },
                company: { select: { id: true, name: true } },
                clientCompany: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { periodEnd: 'asc' },
    })

    if (dueCycles.length === 0) {
      return NextResponse.json({
        data: { scanned: true, due: 0, message: 'No cycles due within 7 days' },
      })
    }

    // Group by kind for the summary
    const byKind = new Map<string, number>()
    for (const c of dueCycles) {
      byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1)
    }

    // Mark past-due cycles
    const pastDue = dueCycles.filter((c) => c.periodEnd <= now)
    if (pastDue.length > 0) {
      await prisma.cycle.updateMany({
        where: { id: { in: pastDue.map((c) => c.id) } },
        data: { status: 'DUE' },
      })
    }

    // Create notifications for upcoming cycles (due in 1-7 days)
    const upcoming = dueCycles.filter((c) => c.periodEnd > now)
    const notificationsCreated = []

    for (const cycle of upcoming) {
      const contract = cycle.engagement.sellContract
      if (!contract) continue

      const daysUntilDue = Math.ceil(
        (cycle.periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )

      // Only notify at 7, 3, and 1 day marks
      if (![1, 3, 7].includes(daysUntilDue)) continue

      try {
        await prisma.notification.create({
          data: {
            personId: contract.personId,
            companyId: contract.company.id,
            type: 'CYCLE_DUE',
            title: `${cycle.kind} cycle due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`,
            body: `${contract.person.name} at ${contract.clientCompany.name} — period ending ${cycle.periodEnd.toLocaleDateString()}`,
            data: {
              cycleId: cycle.id,
              kind: cycle.kind,
              periodEnd: cycle.periodEnd.toISOString(),
              contractId: contract.id,
            },
          },
        })
        notificationsCreated.push(cycle.id)
      } catch {
        // Skip duplicate notifications
      }
    }

    // AutomationLog
    if (dueCycles.length > 0) {
      const firstContract = dueCycles.find((c) => c.engagement.sellContract)?.engagement.sellContract
      if (firstContract) {
        await prisma.automationLog.create({
          data: {
            companyId: firstContract.company.id,
            action: 'DUE_CYCLES_SCAN',
            summary: `Found ${dueCycles.length} cycle(s) due within 7 days (${pastDue.length} past due)`,
            reason: 'Nightly due-cycles scan',
            payload: {
              total: dueCycles.length,
              pastDue: pastDue.length,
              notified: notificationsCreated.length,
              byKind: Object.fromEntries(byKind),
            },
            reversible: false,
          },
        })
      }
    }

    return NextResponse.json({
      data: {
        scanned: true,
        due: dueCycles.length,
        pastDue: pastDue.length,
        notified: notificationsCreated.length,
        byKind: Object.fromEntries(byKind),
        message: `${dueCycles.length} cycles due, ${pastDue.length} past due, ${notificationsCreated.length} notifications sent`,
      },
    })
  } catch (err: any) {
    console.error('Due-cycles scan failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Due-cycles scan failed' } },
      { status: 500 }
    )
  }
}
