import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'

/**
 * GET /api/cron/rolloff-scan
 *
 * BUILD.md §5: "rolloffScan — scan for contracts ending within window"
 *
 * Runs nightly via Vercel cron. Finds contracts ending within 56 days
 * (8 weeks, BRD §16) that don't already have a RolloffEvent, and
 * creates one for each.
 *
 * Writes AutomationLog with plain-English reason and reversible: true.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 56 * 24 * 60 * 60 * 1000) // 56 days

  try {
    // Find active contracts ending within the window that have no RolloffEvent yet
    const contracts = await prisma.sellContract.findMany({
      where: {
        state: 'IN_PROGRESS',
        endDate: {
          gte: now,
          lte: windowEnd,
        },
        rolloff: null,
      },
      select: {
        id: true,
        personId: true,
        endDate: true,
        person: { select: { name: true } },
        clientCompany: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
    })

    if (contracts.length === 0) {
      return NextResponse.json({
        data: { scanned: true, created: 0, message: 'No new rolloff events needed' },
      })
    }

    // Create RolloffEvents in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const events = []

      for (const c of contracts) {
        const daysUntilEnd = Math.ceil(
          (c.endDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        )

        const event = await tx.rolloffEvent.create({
          data: {
            sellContractId: c.id,
            endDate: c.endDate!,
            notified: {
              vendor: { companyId: c.company.id, name: c.company.name, at: now.toISOString() },
              client: { companyId: c.clientCompany.id, name: c.clientCompany.name, at: null },
              consultant: { personId: c.personId, name: c.person.name, at: null },
            },
            checklist: {
              knowledgeTransfer: false,
              accessRevoked: false,
              equipmentReturned: false,
              exitInterview: false,
              finalTimesheet: false,
            },
          },
        })

        events.push({
          id: event.id,
          personName: c.person.name,
          clientName: c.clientCompany.name,
          daysUntilEnd,
        })
      }

      // One AutomationLog for the whole batch
      await tx.automationLog.create({
        data: {
          companyId: contracts[0].company.id,
          action: 'ROLLOFF_SCAN',
          summary: `Detected ${events.length} contract(s) ending within 8 weeks`,
          reason: `Nightly rolloff scan found ${events.length} contracts approaching end date`,
          payload: {
            contractIds: contracts.map((c) => c.id),
            events: events.map((e) => ({
              eventId: e.id,
              person: e.personName,
              client: e.clientName,
              daysLeft: e.daysUntilEnd,
            })),
          },
          reversible: true,
        },
      })

      return events
    })

    // Notify vendor admins about new rolloff events (fire-and-forget)
    // BRD §16: vendor must be notified first in the fan-out sequence
    const notifications: NotifyParams[] = []
    for (const c of contracts) {
      const matched = result.find((e) => e.personName === c.person.name)
      if (!matched) continue

      // Find admin persons at the vendor company to notify
      const vendorContexts = await prisma.context.findMany({
        where: {
          companyId: c.company.id,
          role: { permissions: { hasSome: ['assignments.write'] } },
        },
        select: { personId: true },
        take: 5, // cap at 5 admins per vendor
      })

      for (const ctx of vendorContexts) {
        notifications.push({
          personId: ctx.personId,
          companyId: c.company.id,
          type: 'ROLLOFF',
          title: `Contract ending: ${c.person.name} at ${c.clientCompany.name}`,
          body: `${c.person.name}'s contract at ${c.clientCompany.name} ends in ${matched.daysUntilEnd} days. Claim this rolloff to manage the offboarding.`,
          entityId: matched.id,
          data: {
            rolloffEventId: matched.id,
            contractId: c.id,
            daysLeft: matched.daysUntilEnd,
          },
        })
      }
    }

    if (notifications.length > 0) {
      notifyBulk(notifications)
    }

    return NextResponse.json({
      data: {
        scanned: true,
        created: result.length,
        events: result,
        message: `Created ${result.length} rolloff event(s)`,
      },
    })
  } catch (err: any) {
    console.error('Rolloff scan failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Rolloff scan failed' } },
      { status: 500 }
    )
  }
}
