import { NextRequest, NextResponse } from 'next/server'
import {
  byCalendar,
  milestoneNow,
  milestoneSays,
  renewedExpiry,
} from '@/lib/agreement-term'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { hasPermission } from '@/lib/permissions'

/**
 * GET /api/cron/agreement-terms
 *
 * Nightly. Three things, in this order:
 *
 *   1. An auto-renewing agreement that has reached its date rolls forward
 *      for another term, because that is what its own paper says it does.
 *   2. An agreement inside three months of its end reads EXPIRING, and
 *      one past it reads EXPIRED. Never backwards, and never over a
 *      termination — ending an agreement was a person's act and the
 *      calendar does not get to reverse one.
 *   3. Somebody is told at ninety, sixty and thirty days, and once on the
 *      day it lapsed.
 *
 * ── Why this job had to exist ────────────────────────────────────────
 *
 * `Verification.expiresAt` has been watched since the beginning and
 * `MasterAgreement` had no expiry to watch at all. So the agreement above
 * every contract could lapse and the first anybody knew was a client
 * refusing an invoice.
 *
 * ── Why it warns and never blocks ────────────────────────────────────
 *
 * Addendum E reserves a block for tenure, break in service, work
 * authorization, lapsed supplier insurance and segregation of duties. A
 * lapsed master agreement is a commercial fact, and refusing to let a firm
 * trade on it produces the deal done in email. The reasoning is at the top
 * of `lib/agreement-term`; if the founder decides otherwise, the change is
 * a gate at award, not here.
 *
 * ── Who is told ──────────────────────────────────────────────────────
 *
 * Whoever may act on it: the seats at the vendor holding `rates.write`,
 * which is the contracting desk. Not the account owner by default —
 * "the desk that acts is the desk that hears".
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  try {
    const agreements = await prisma.masterAgreement.findMany({
      where: {
        expiresAt: { not: null },
        status: { not: 'TERMINATED' },
      },
      select: {
        id: true,
        vendorId: true,
        status: true,
        effectiveDate: true,
        expiresAt: true,
        renewalKind: true,
        renewalMonths: true,
        noticeDays: true,
        client: { select: { name: true } },
      },
      take: 2000,
    })

    let renewed = 0
    let moved = 0
    const told: { agreementId: string; counterparty: string; milestone: number }[] = []

    // ── 1. Roll the ones that renew themselves ──
    for (const a of agreements) {
      const next = renewedExpiry(a, now)
      if (!next) continue
      await prisma.masterAgreement.update({
        where: { id: a.id },
        data: { expiresAt: next, status: a.status === 'EXPIRING' ? 'ACTIVE' : a.status },
      })
      const last = await prisma.masterAgreementVersion.findFirst({
        where: { agreementId: a.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      // Only where a trail already exists. Opening one with a row nobody
      // wrote would claim a baseline that was never observed; the first
      // human amendment backfills it honestly.
      if (last) {
        const after = await prisma.masterAgreement.findUnique({
          where: { id: a.id },
          select: {
            paymentTerms: true, paymentTermsFrom: true, currency: true, minMarginPct: true,
            capacity: true, effectiveDate: true, expiresAt: true, renewalKind: true,
            renewalMonths: true, noticeDays: true, status: true, signedAt: true,
            executedFileName: true,
          },
        })
        if (after) {
          await prisma.masterAgreementVersion.create({
            data: {
              agreementId: a.id,
              version: last.version + 1,
              ...after,
              action: 'RENEWED',
              changed: ['the day it runs out'],
              changedById: null,
              reason: 'It renewed itself for a further term, as the agreement says it does.',
            },
          })
        }
      }
      a.expiresAt = next
      a.status = a.status === 'EXPIRING' ? 'ACTIVE' : a.status
      renewed++
    }

    // ── 2. Move the standing to what the calendar says ──
    for (const a of agreements) {
      const next = byCalendar(a, now)
      if (!next) continue
      await prisma.masterAgreement.update({ where: { id: a.id }, data: { status: next } })
      a.status = next
      moved++
    }

    // ── 3. Tell the desk that can do something about it ──
    //
    // Read back what has already been said so a milestone is announced
    // once. Nothing dedupes these rows in the database, so the ledger is
    // the notices themselves — the same shape, and the same bug already
    // fixed once, as the visa watch.
    const said = await prisma.notification.findMany({
      where: { type: 'CONTRACT', entityId: { in: agreements.map((a) => a.id) } },
      select: { entityId: true, data: true },
    })
    const alreadySaid = new Set(
      said
        .map((n) => n.data as { agreementId?: string; milestone?: number } | null)
        .filter((d): d is { agreementId: string; milestone: number } =>
          Boolean(d?.agreementId && typeof d?.milestone === 'number')
        )
        .map((d) => `${d.agreementId}:${d.milestone}`)
    )

    // The contracting desk at each vendor, resolved once per company
    // rather than once per agreement.
    const deskByCompany = new Map<string, string[]>()
    async function deskAt(companyId: string): Promise<string[]> {
      const cached = deskByCompany.get(companyId)
      if (cached) return cached
      const seats = await prisma.context.findMany({
        where: { companyId, revokedAt: null },
        select: { personId: true, role: { select: { permissions: true } } },
      })
      // Through `hasPermission`, never a raw includes: an owner's role is
      // stored as the wildcard `*`, and a direct string comparison would
      // quietly tell nobody at all at every firm run by its founder.
      const desk = seats
        .filter((s) => {
          const perms = (s.role?.permissions ?? []) as string[]
          return hasPermission(perms, 'rates.write') || hasPermission(perms, 'settings.manage')
        })
        .map((s) => s.personId)
      const unique = [...new Set(desk)]
      deskByCompany.set(companyId, unique)
      return unique
    }

    for (const a of agreements) {
      const milestone = milestoneNow(a, now)
      if (milestone == null) continue
      if (alreadySaid.has(`${a.id}:${milestone}`)) continue

      const line = milestoneSays(a.client.name, a, now)
      if (!line) continue

      const desk = await deskAt(a.vendorId)
      if (desk.length === 0) continue

      // Awaited, unlike most callers of notify. This job's entire output
      // is that somebody was told, and the count in the response would be
      // a claim rather than a fact if the writes were still in flight.
      for (const personId of desk) {
        await notify({
          personId,
          companyId: a.vendorId,
          type: 'CONTRACT',
          title: line.title,
          body: line.body,
          entityId: a.id,
          channel: 'EMAIL',
          data: { agreementId: a.id, milestone, counterparty: a.client.name },
        })
      }

      alreadySaid.add(`${a.id}:${milestone}`)
      told.push({ agreementId: a.id, counterparty: a.client.name, milestone })
    }

    // One row per company, carrying only that company's own agreements.
    // An automation log is company-scoped and read by that company; a
    // single row naming every client's paper would be a leak rather than
    // an untidiness.
    const byCompany = new Map<string, typeof told>()
    for (const t of told) {
      const a = agreements.find((x) => x.id === t.agreementId)!
      byCompany.set(a.vendorId, [...(byCompany.get(a.vendorId) ?? []), t])
    }
    for (const [companyId, theirs] of byCompany) {
      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'AGREEMENT_TERM_WATCH',
          summary: `Told the contracting desk about ${theirs.length} agreement${theirs.length === 1 ? '' : 's'} running out.`,
          reason: 'Nightly scan of agreement end dates.',
          payload: {
            agreements: theirs.map((t) => ({ counterparty: t.counterparty, milestone: t.milestone })),
          },
          reversible: false,
        },
      })
    }

    const says =
      told.length === 0 && moved === 0 && renewed === 0
        ? `Read ${agreements.length} agreement term${agreements.length === 1 ? '' : 's'}. None had reached a date.`
        : `Read ${agreements.length}, renewed ${renewed}, moved ${moved}, told ${told.length}.`

    return NextResponse.json({
      data: { scanned: agreements.length, renewed, moved, told: told.length, says },
    })
  } catch (err: any) {
    reportError('agreement-terms', err)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL',
          message: 'The nightly agreement term watch did not finish. Staff have been told.',
        },
      },
      { status: 500 }
    )
  }
}
