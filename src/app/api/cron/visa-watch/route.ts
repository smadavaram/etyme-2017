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
      personId: string
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

    // What has already been said, so a milestone is announced once.
    //
    // The boundary used to be `days <= m && days > m - 1`, which is true
    // on exactly one day per milestone. A job that did not run that night
    // — or a petition filed with sixty-one days left — never produced the
    // warning at all, and a missed visa warning is the whole point of the
    // watch. Widening it to `days <= m` alone would instead send the same
    // warning every night, so what was sent is read back first. Nothing
    // dedupes these rows in the database, so the ledger is the notices
    // themselves.
    const said = await prisma.notification.findMany({
      where: { type: 'VISA_EXPIRY', personId: { in: petitions.map((p) => p.personId) } },
      select: { data: true },
    })
    const alreadySaid = new Set(
      said
        .map((n) => n.data as { petitionId?: string; milestone?: number } | null)
        .filter((d): d is { petitionId: string; milestone: number } =>
          Boolean(d?.petitionId && typeof d?.milestone === 'number')
        )
        .map((d) => `${d.petitionId}:${d.milestone}`)
    )

    for (const p of petitions) {
      if (!p.expiresAt || p.expiresAt < now) continue

      const daysUntilExpiry = Math.ceil(
        (p.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )

      // Every milestone this petition is now inside, tightest first. The
      // tightest is the honest one: with forty-five days left, the ninety
      // day warning is stale and the sixty is the news. Once sixty has
      // been said, ninety can never come up again, because the days only
      // fall.
      const crossed = MILESTONES.filter((m) => daysUntilExpiry <= m)
      if (crossed.length === 0) continue
      const milestone = Math.min(...crossed)

      if (alreadySaid.has(`${p.id}:${milestone}`)) continue

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
      alreadySaid.add(`${p.id}:${milestone}`)
      notifications.push({
        personId: p.personId,
        personName: p.person.name,
        petitionType: p.type,
        daysUntilExpiry,
        milestone,
      })
    }

    // One line per company, carrying only that company's own people.
    //
    // This used to find the first petition's company and write every
    // notification into its log — so one client's automation log named
    // another client's consultants and their visa types. An automation
    // log is company-scoped and read by that company, which made it a
    // leak rather than an untidiness.
    if (notifications.length > 0) {
      const contexts = await prisma.context.findMany({
        where: {
          personId: { in: notifications.map((n) => n.personId) },
          revokedAt: null,
          companyId: { not: null },
        },
        select: { personId: true, companyId: true },
      })
      const companyOf = new Map(contexts.map((c) => [c.personId, c.companyId!]))

      const byCompany = new Map<string, typeof notifications>()
      for (const n of notifications) {
        const companyId = companyOf.get(n.personId)
        if (!companyId) continue
        byCompany.set(companyId, [...(byCompany.get(companyId) ?? []), n])
      }

      for (const [companyId, theirs] of byCompany) {
        await prisma.automationLog.create({
          data: {
            companyId,
            action: 'VISA_WATCH',
            summary: `Sent ${theirs.length} visa expiry notification(s)`,
            reason: 'Nightly visa petition milestone scan',
            payload: {
              notifications: theirs.map(({ personName, petitionType, daysUntilExpiry, milestone }) => ({
                personName, petitionType, daysUntilExpiry, milestone,
              })),
            },
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
