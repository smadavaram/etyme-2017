import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { possessive } from '@/lib/requisition-approval'
import { prisma } from '@/lib/db'
import { send } from '@/lib/messages'
import { inviteUrl } from '@/lib/bench-invite'
import { endedSays, reminderDue, reminderText, reminderLeadDays } from '@/lib/bench-stay'
import { tellFirm } from '@/lib/bench-stay-record'

/**
 * GET /api/cron/bench-stays
 *
 * A person chooses how long they stay on a bench (2026-09-30): 5, 7, 15,
 * 25, 50, 60 or 500 days, or until they cancel. Every night this:
 *
 *   reminds them before it ends — two days ahead, one for the five- and
 *   seven-day choices — with a link that renews in one tap, once per
 *   stay; and
 *
 *   ends the stays that have run out: the listing is written down as
 *   ended by the clock (`revokedAt` with `lapsedAt` beside it), so every
 *   read of a bench leaves them out, and the firm is told. A submission
 *   already made stands. Renewing brings it back, which is why every
 *   ending is written reversible.
 *
 * Matching and the submit door do not wait for this job: they read the
 * end date themselves (`lib/bench-stay`), so the hours between the stay
 * running out and tonight's run are not a gap.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  try {
    // ── Ending the stays that ran out ───────────────────────────────
    const due = await prisma.benchListing.findMany({
      where: { state: 'GRANTED', revokedAt: null, staysUntil: { lte: now } },
      select: {
        id: true, companyId: true, staysUntil: true, stayDays: true,
        company: { select: { name: true } },
        consultant: { select: { person: { select: { id: true, name: true } } } },
      },
    })
    const ended: { person: string; firm: string }[] = []
    for (const l of due) {
      const on = l.staysUntil!
      await prisma.$transaction([
        prisma.benchListing.update({ where: { id: l.id }, data: { revokedAt: on, lapsedAt: now } }),
        prisma.automationLog.create({
          data: {
            companyId: l.companyId,
            action: 'BENCH_STAY_ENDED',
            summary: `${possessive(l.consultant.person.name)} chosen stay of ${l.stayDays} days on ${possessive(l.company.name)} bench ended.`,
            reason:
              'They chose how long to stay, and that time has run out. They are out of every match and cannot be put ' +
              'forward through this listing; submissions already made stand. Renewing brings it back.',
            payload: { listingId: l.id, personId: l.consultant.person.id, staysUntil: on.toISOString(), stayDays: l.stayDays },
            reversible: true,
          },
        }),
      ])
      await tellFirm(
        l.companyId,
        `${l.consultant.person.name} is off your bench`,
        endedSays(l.consultant.person.name, l.company.name, on),
        l.id
      )
      ended.push({ person: l.consultant.person.name, firm: l.company.name })
    }

    // ── Reminding the ones about to end ─────────────────────────────
    const soon = new Date(now.getTime() + 2 * 86_400_000)
    const ending = await prisma.benchListing.findMany({
      where: { state: 'GRANTED', revokedAt: null, stayRemindedAt: null, staysUntil: { gt: now, lte: soon } },
      select: {
        id: true, companyId: true, stayDays: true, staysUntil: true, stayRemindedAt: true, revokedAt: true,
        company: { select: { name: true } },
        consultant: { select: { person: { select: { id: true, name: true, primaryEmail: true } } } },
      },
    })
    const reminded: { person: string; firm: string; daysAhead: number }[] = []
    for (const l of ending) {
      if (!reminderDue(l, now)) continue
      const person = l.consultant.person
      const letter = reminderText({
        personName: person.name,
        firm: l.company.name,
        until: l.staysUntil!,
        days: l.stayDays!,
        url: inviteUrl(l.id),
      })
      await send({
        companyId: l.companyId,
        personId: person.id,
        kind: 'LINK',
        to: person.primaryEmail,
        subject: letter.subject,
        body: letter.body,
        aboutType: 'LISTING',
        aboutId: l.id,
      })
      await prisma.$transaction([
        prisma.benchListing.update({ where: { id: l.id }, data: { stayRemindedAt: now } }),
        prisma.automationLog.create({
          data: {
            companyId: l.companyId,
            action: 'BENCH_STAY_REMINDED',
            summary: `${person.name} was reminded that their stay on ${possessive(l.company.name)} bench ends soon.`,
            reason: `Their chosen stay of ${l.stayDays} days ends within ${reminderLeadDays(l.stayDays)} day(s); the letter carries a one-tap renew.`,
            payload: { listingId: l.id, staysUntil: l.staysUntil!.toISOString() },
            reversible: false,
          },
        }),
      ])
      reminded.push({ person: person.name, firm: l.company.name, daysAhead: reminderLeadDays(l.stayDays) })
    }

    return NextResponse.json({
      data: {
        ended: ended.length,
        reminded: reminded.length,
        endedList: ended,
        remindedList: reminded,
        message: `${ended.length} bench stay(s) ended; ${reminded.length} reminder(s) sent.`,
      },
    })
  } catch (err: any) {
    reportError('Bench stays job failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Bench stays job failed' } }, { status: 500 })
  }
}
