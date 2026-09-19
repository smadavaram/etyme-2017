import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { readBreach, mayWorkBreach, mayClose, type ClockState } from '@/lib/breach'
import { referenceOfBreach } from '@/lib/data-request'
import { staffAddresses, tellStaff } from '@/lib/alerts'
import { breachStaffAlert } from '@/lib/notify/breach'
import { POPULATIONS } from '@/lib/legal'
import type { Audience } from '@/lib/notify/letters'

/**
 * Personal data went somewhere it should not have.
 *
 * Etyme staff open and run one. A customer whose records were in it sees
 * its own row and records that it was told, through its compliance desk.
 * Nobody else sees one at all — a breach list is the most sensitive list
 * in the product, and a company reading somebody else's incident is
 * itself the thing this page exists to record.
 *
 * ── No severity scale ────────────────────────────────────────────────
 *
 * Deliberate, and the DPA says so. What decides the clocks is whether
 * personal data was involved, whose, and what counsel says about it. A
 * four-point scale invented here would make the DPA false without making
 * anybody safer.
 *
 * ── Two gates, and one of them is not a permission ───────────────────
 *
 * Reading asks for the governance read a compliance desk already holds,
 * and the customer still has to have been in the incident to see a row
 * at all. Acting on a customer's own line — recording that the company
 * was told, and when — asks for the privacy permission, because it is a
 * write on a record two firms answer for afterwards.
 *
 * Opening an incident, setting its clocks and closing it are Etyme's,
 * and the gate on them is being Etyme staff rather than holding a
 * permission: staff is read off `ETYME_STAFF_EMAILS` and no customer
 * role can grant it. That is deliberate and it is not the privacy
 * permission's job — a customer holding the privacy permission must not
 * be able to move a deadline Etyme owns.
 */
const TO_READ = 'governance.read'
const TO_ACT = 'privacy.manage'

function isStaff(email: string): boolean {
  return staffAddresses().includes(email.toLowerCase())
}

function clocksOf(b: {
  notifyAuthorityBy: Date | null; authorityNotifiedAt: Date | null
  notifySubjectsBy: Date | null; subjectsNotifiedAt: Date | null
  openedBy: { name: string } | null
  companies: { notifyBy: Date | null; notifiedAt: Date | null; company: { name: string } }[]
}): ClockState[] {
  const owner = b.openedBy?.name ?? null
  return [
    { who: 'AUTHORITY', dueAt: b.notifyAuthorityBy, notifiedAt: b.authorityNotifiedAt, owner },
    { who: 'PEOPLE', dueAt: b.notifySubjectsBy, notifiedAt: b.subjectsNotifiedAt, owner },
    ...b.companies.map((c) => ({
      who: 'CUSTOMER' as const, companyName: c.company.name,
      dueAt: c.notifyBy, notifiedAt: c.notifiedAt, owner,
    })),
  ]
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const staff = isStaff(caller.person.primaryEmail)
  const companyId = caller.company?.id ?? null
  const mayRead = mayWorkBreach({
    isStaff: staff,
    hasCompliancePermission: hasPermission(caller.permissions, TO_READ),
    companyIsAffected: companyId
      ? (await prisma.breachCompany.count({ where: { companyId } })) > 0
      : false,
  })
  if (!mayRead.ok) return NextResponse.json({ error: mayRead.says }, { status: 403 })

  const rows = await prisma.breach.findMany({
    where: staff ? {} : { companies: { some: { companyId: companyId! } } },
    orderBy: [{ closedAt: 'asc' }, { discoveredAt: 'desc' }],
    select: {
      id: true, discoveredAt: true, occurredAt: true, personalData: true,
      populations: true, categories: true, summary: true,
      notifyAuthorityBy: true, authorityNotifiedAt: true, authorityNotice: true,
      notifySubjectsBy: true, subjectsNotifiedAt: true, subjectsNotice: true,
      closedAt: true, closedBecause: true, lastWarnedAt: true,
      openedBy: { select: { name: true } },
      companies: {
        // A customer sees its own line and nobody else's: which other
        // customers were in an incident is not this customer's business.
        where: staff ? {} : { companyId: companyId! },
        select: { id: true, notifyBy: true, notifiedAt: true, notifiedTo: true, company: { select: { id: true, name: true } } },
      },
    },
  })

  const now = new Date()
  return NextResponse.json({
    breaches: rows.map((b) => {
      const clocks = clocksOf(b)
      const reading = readBreach(clocks, now, b.closedAt)
      return {
        id: b.id,
        reference: referenceOfBreach(b.id),
        summary: b.summary,
        discoveredAt: b.discoveredAt,
        occurredAt: b.occurredAt,
        personalData: b.personalData,
        populations: b.populations,
        categories: b.categories,
        closedAt: b.closedAt,
        closedBecause: b.closedBecause,
        openedBy: b.openedBy?.name ?? null,
        says: reading.says,
        nobodyHasDecided: reading.nobodyHasDecided,
        clocks: reading.clocks,
        companies: b.companies.map((c) => ({
          id: c.id, name: c.company.name, notifyBy: c.notifyBy, notifiedAt: c.notifiedAt, notifiedTo: c.notifiedTo,
        })),
      }
    }),
    youAre: staff ? 'staff' : 'a customer whose records were in one of these',
    populations: POPULATIONS.map((p) => ({ id: p.id, name: p.name })),
  })
}

/**
 * Open one, set a clock, record a notice, or close it.
 *
 * `{ discoveredAt, personalData, summary, populations, categories, companyIds }` opens.
 * `{ breachId, clocks: { authorityBy?, subjectsBy?, company: { id, notifyBy } } }` sets.
 * `{ breachId, told: 'AUTHORITY' | 'PEOPLE' | <breachCompanyId>, how }` records.
 * `{ breachId, close: true, because }` closes.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const staff = isStaff(caller.person.primaryEmail)
  const body = await request.json().catch(() => ({}))

  // Only Etyme staff open, set and close one. A customer records that it
  // was told and nothing else: the clocks are Etyme's obligation and a
  // customer moving them would be a customer editing somebody else's
  // deadline.
  if (!staff && !body.told) {
    return NextResponse.json(
      {
        error:
          'Opening an incident, setting its deadlines and closing it are Etyme’s to do. ' +
          'What you can record here is the hour your company was told, on your own line.',
      },
      { status: 403 }
    )
  }

  // Recording that a company was told is a write on a record two firms
  // answer for afterwards, so it asks for the privacy permission the
  // compliance desk holds. Etyme's own staff are gated by being staff.
  if (!staff && !hasPermission(caller.permissions, TO_ACT)) {
    return NextResponse.json(
      {
        error:
          'Recording that your company was told about an incident needs the privacy ' +
          'permission, and this seat does not hold it. The compliance officer at your ' +
          'company holds it, and an owner or administrator can add it to another seat ' +
          'under Users and permissions.',
      },
      { status: 403 }
    )
  }

  if (body.told) {
    const b = await prisma.breach.findUnique({
      where: { id: String(body.breachId ?? '') },
      select: {
        id: true, summary: true, discoveredAt: true, populations: true, categories: true,
        notifyAuthorityBy: true, authorityNotifiedAt: true,
        notifySubjectsBy: true, subjectsNotifiedAt: true,
        openedBy: { select: { name: true } },
        companies: { select: { id: true, companyId: true, notifyBy: true, notifiedAt: true, company: { select: { name: true } } } },
      },
    })
    if (!b) return NextResponse.json({ error: 'There is no incident with that reference.' }, { status: 404 })

    const how = String(body.how ?? '').trim()
    if (how.length < 5) {
      return NextResponse.json(
        { error: 'Say how and to whom it went. A notice recorded with nobody on it is a notice nobody can prove.' },
        { status: 400 }
      )
    }
    const at = body.at ? new Date(body.at) : new Date()

    if (body.told === 'AUTHORITY' || body.told === 'PEOPLE') {
      if (!staff) return NextResponse.json({ error: 'Those two notices are Etyme’s to send and to record.' }, { status: 403 })
      await prisma.breach.update({
        where: { id: b.id },
        data: body.told === 'AUTHORITY'
          ? { authorityNotifiedAt: at, authorityNotice: how }
          : { subjectsNotifiedAt: at, subjectsNotice: how },
      })
    } else {
      const line = b.companies.find((c) => c.id === body.told)
      if (!line) return NextResponse.json({ error: 'There is no customer line with that reference on this incident.' }, { status: 404 })
      if (!staff && line.companyId !== caller.company?.id) {
        return NextResponse.json({ error: 'That is another customer’s line.' }, { status: 403 })
      }
      await prisma.breachCompany.update({ where: { id: line.id }, data: { notifiedAt: at, notifiedTo: how } })
    }

    for (const c of b.companies) {
      await prisma.automationLog.create({
        data: {
          companyId: c.companyId,
          action: 'BREACH_NOTICE_SENT',
          summary: `A notice about incident ${referenceOfBreach(b.id)} went out: ${how}`,
          reason: 'A notice about a breach went to an authority, a customer or the people whose data it was.',
          payload: { breachId: b.id, told: body.told },
          reversible: false,
        },
      })
    }
    return NextResponse.json({ ok: true, says: 'Recorded, with the hour it went. That clock stops chasing now.' })
  }

  if (body.close) {
    const b = await prisma.breach.findUnique({
      where: { id: String(body.breachId ?? '') },
      select: {
        id: true, closedAt: true,
        notifyAuthorityBy: true, authorityNotifiedAt: true,
        notifySubjectsBy: true, subjectsNotifiedAt: true,
        openedBy: { select: { name: true } },
        companies: { select: { companyId: true, notifyBy: true, notifiedAt: true, company: { select: { name: true } } } },
      },
    })
    if (!b) return NextResponse.json({ error: 'There is no incident with that reference.' }, { status: 404 })
    const because = String(body.because ?? '').trim()
    if (because.length < 10) {
      return NextResponse.json({ error: 'Say on what basis it is closed. A breach closed with no basis is one nobody can answer for.' }, { status: 400 })
    }
    const verdict = mayClose(clocksOf(b), new Date())
    if (!verdict.ok) return NextResponse.json({ error: verdict.says }, { status: 409 })

    await prisma.breach.update({ where: { id: b.id }, data: { closedAt: new Date(), closedBecause: because } })
    for (const c of b.companies) {
      await prisma.automationLog.create({
        data: {
          companyId: c.companyId,
          action: 'BREACH_CLOSED',
          summary: `Incident ${referenceOfBreach(b.id)} was closed: ${because}`,
          reason: 'A breach was closed out, on a stated basis, by somebody who put their name to it.',
          payload: { breachId: b.id },
          reversible: true,
        },
      })
    }
    return NextResponse.json({ ok: true, says: `${verdict.says} Closed.` })
  }

  if (body.breachId) {
    const b = await prisma.breach.findUnique({ where: { id: String(body.breachId) }, select: { id: true } })
    if (!b) return NextResponse.json({ error: 'There is no incident with that reference.' }, { status: 404 })

    const authorityBy = body.authorityBy ? new Date(body.authorityBy) : undefined
    const subjectsBy = body.subjectsBy ? new Date(body.subjectsBy) : undefined
    for (const d of [authorityBy, subjectsBy]) {
      if (d && Number.isNaN(d.getTime())) return NextResponse.json({ error: 'That is not a date we can read.' }, { status: 400 })
    }

    await prisma.breach.update({
      where: { id: b.id },
      data: {
        ...(authorityBy ? { notifyAuthorityBy: authorityBy } : {}),
        ...(subjectsBy ? { notifySubjectsBy: subjectsBy } : {}),
      },
    })
    if (body.company?.id && body.company?.notifyBy) {
      const when = new Date(body.company.notifyBy)
      if (Number.isNaN(when.getTime())) return NextResponse.json({ error: 'That is not a date we can read.' }, { status: 400 })
      await prisma.breachCompany.update({ where: { id: String(body.company.id) }, data: { notifyBy: when } })
    }
    return NextResponse.json({ ok: true, says: 'The deadline is set, and the nightly sweep counts it from tonight.' })
  }

  // ── Opening one ────────────────────────────────────────────────────

  const summary = String(body.summary ?? '').trim()
  if (summary.length < 15) {
    return NextResponse.json(
      { error: 'Say what happened, in plain words. A breach with no summary is a row nobody can act on at three in the morning.' },
      { status: 400 }
    )
  }
  if (typeof body.personalData !== 'boolean') {
    return NextResponse.json(
      {
        error:
          'Say whether personal data was involved. There is no default here on purpose: it ' +
          'is the fact every deadline hangs off, and a default would answer it by accident.',
      },
      { status: 400 }
    )
  }
  const discoveredAt = body.discoveredAt ? new Date(body.discoveredAt) : new Date()
  if (Number.isNaN(discoveredAt.getTime())) {
    return NextResponse.json({ error: 'That is not a date we can read. Every clock counts from when somebody here became aware.' }, { status: 400 })
  }

  const companyIds: string[] = Array.isArray(body.companyIds) ? body.companyIds.map(String) : []

  const created = await prisma.breach.create({
    data: {
      discoveredAt,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
      personalData: body.personalData,
      populations: Array.isArray(body.populations) ? body.populations.map(String) : [],
      categories: Array.isArray(body.categories) ? body.categories.map(String) : [],
      summary,
      incidentId: body.incidentId ? String(body.incidentId) : null,
      openedById: caller.person.id,
      companies: { create: companyIds.map((companyId) => ({ companyId })) },
    },
    select: {
      id: true, summary: true, discoveredAt: true, populations: true, categories: true,
      companies: { select: { company: { select: { name: true } } } },
    },
  })

  for (const companyId of companyIds) {
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'BREACH_OPENED',
        summary: `An incident touching your records was opened: ${summary}`,
        reason: 'The clocks count from when somebody here became aware, not from when it happened.',
        payload: { breachId: created.id },
        reversible: true,
      },
    })
  }

  const alert = breachStaffAlert({
    breach: {
      reference: referenceOfBreach(created.id),
      what: summary,
      discoveredAt,
      discoveredBy: caller.person.name,
      populations: created.populations as Audience[],
      peopleAffected: null,
      companiesAffected: created.companies.map((c) => c.company.name),
      categories: created.categories,
      // No clock yet, deliberately, and the letter says so rather than
      // counting down to a date nobody decided.
      clocks: [],
    },
    now: new Date(),
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/dashboard/privacy`,
  })
  await tellStaff(alert.subject, alert.body)

  return NextResponse.json({
    ok: true,
    id: created.id,
    reference: referenceOfBreach(created.id),
    says:
      'Opened, and staff were told. No deadline is set on it yet — nobody has decided ' +
      'whether one applies, and that is a different thing from nothing being owed.',
  })
}
