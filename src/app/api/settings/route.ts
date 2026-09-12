import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { getTemplatePack, TEMPLATE_PACKS } from '@/lib/template-packs'

/**
 * GET  /api/settings — everything about how this company is set up
 * PATCH /api/settings — change the company's own details
 *
 * One call rather than six, because the settings screen shows all of it at
 * once and six round trips to render one page is how a settings section
 * ends up feeling slow enough that nobody opens it.
 *
 * Reading is open to anyone in the company: knowing your own company's
 * holiday calendar is not privileged. Writing needs settings.manage.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Company settings')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'These are a company’s settings' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const thisYear = new Date().getFullYear()

  const [company, roles, locations, holidays, costCenters, memberCounts] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, name: true, slug: true, domain: true, domainVerified: true,
        kind: true, supplierPosture: true, currency: true, templatePack: true,
        teamsWebhookUrl: true, networkVerifiedAt: true, siteLiveAt: true,
        outsideAccess: true, accountWalls: true,
      },
    }),
    prisma.role.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, permissions: true, isDefault: true },
    }),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, address: true, city: true, state: true, country: true, isRemote: true, isPrimary: true },
    }),
    prisma.holiday.findMany({
      // This year and next. A calendar showing 2019 is noise, and cycles
      // are only ever generated forwards.
      where: { companyId, date: { gte: new Date(`${thisYear}-01-01T00:00:00Z`) } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, name: true, isRecurring: true },
    }),
    prisma.costCenter.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, glAccount: true },
    }),
    prisma.context.groupBy({
      by: ['roleId'],
      where: { companyId, revokedAt: null },
      _count: { _all: true },
    }),
  ])

  const heldBy = new Map(memberCounts.map((m) => [m.roleId, m._count._all]))
  const pack = company?.templatePack ? getTemplatePack(company.templatePack) : null

  return NextResponse.json({
    data: {
      company: company && {
        ...company,
        networkVerifiedAt: company.networkVerifiedAt?.toISOString() ?? null,
        siteLiveAt: company.siteLiveAt?.toISOString() ?? null,
        // Named separately from the raw value so the screen can say
        // "nobody has a Teams channel yet" rather than showing a blank.
        teamsConfigured: Boolean(company.teamsWebhookUrl),
      },
      // The wall, said as who is actually behind it rather than as a
      // setting. An owner asking "who here can see the outside market"
      // wants names, and a permission list is not an answer.
      wall: company && {
        outsideAccess: company.outsideAccess,
        accountWalls: company.accountWalls,
        explanation:
          company.outsideAccess === 'CLOSED'
            ? 'Nobody here can see the outside market, whatever their role.'
            : company.outsideAccess === 'ALLOWED'
              ? 'Anybody here who can read consultants can also see the outside market.'
              : 'Only the roles below can see people and suppliers outside this company.',
        // Roles rather than headcount alone, because the fix for a wrong
        // answer is editing a role.
        canSeeOutside: roles
          .filter((r) => r.permissions.includes('network.read') || r.permissions.includes('*'))
          .map((r) => ({ role: r.name, heldBy: heldBy.get(r.id) ?? 0 })),
      },
      roles: roles.map((r) => ({
        ...r,
        // How many people hold it. A role nobody holds is either new or
        // dead, and the difference matters before deleting one.
        heldBy: heldBy.get(r.id) ?? 0,
      })),
      locations,
      holidays: holidays.map((h) => ({ ...h, date: h.date.toISOString().slice(0, 10) })),
      costCenters,
      templatePack: pack && {
        id: pack.id,
        label: pack.label,
        cycleCount: pack.cycleDefinitions.length,
        // What the pack actually decided, so the calendar is not a mystery.
        cycles: pack.cycleDefinitions.map((c) => ({
          kind: c.kind,
          label: c.label,
          frequency: c.frequency,
        })),
        contractTypes: pack.contractTypes?.map((t) => ({ code: t.code, label: t.label })) ?? [],
      },
      availablePacks: Object.values(TEMPLATE_PACKS).map((p) => ({ id: p.id, label: p.label })),
      // What this caller may change here, so the screen can show fields as
      // read-only rather than failing on save.
      canEdit: hasPermission(caller.permissions, 'settings.manage'),
      canEditGovernance: hasPermission(caller.permissions, 'governance.write'),
    },
  })
}

/**
 * PATCH /api/settings
 *
 * The company's own details. Name, currency, and the Teams channel that
 * notifications post to.
 *
 * The domain is not editable. It came from the identity provider and it is
 * what decides who joins this company automatically — letting somebody
 * type a new one is letting them claim another company's colleagues.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'These are a company’s settings' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Changing company settings needs settings.manage' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  const changed: string[] = []

  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim()
    changed.push('name')
  }

  // ── The wall ───────────────────────────────────────────────────────
  if (typeof body.outsideAccess === 'string') {
    const v = body.outsideAccess.trim().toUpperCase()
    if (!['ALLOWED', 'NAMED_ONLY', 'CLOSED'].includes(v)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Outside access is one of: ALLOWED, NAMED_ONLY, CLOSED',
            field: 'outsideAccess',
          },
        },
        { status: 422 }
      )
    }
    data.outsideAccess = v
    changed.push('outsideAccess')
  }

  if (typeof body.accountWalls === 'boolean') {
    data.accountWalls = body.accountWalls
    changed.push('accountWalls')
  }

  if (typeof body.currency === 'string') {
    const c = body.currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(c)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'A currency is three letters, like USD or GBP', field: 'currency' } },
        { status: 422 }
      )
    }
    data.currency = c
    changed.push('currency')
  }

  if ('teamsWebhookUrl' in body) {
    const raw = body.teamsWebhookUrl
    if (raw === null || raw === '') {
      data.teamsWebhookUrl = null
      changed.push('teamsWebhookUrl')
    } else if (typeof raw === 'string') {
      // Checked here rather than at send time. A malformed webhook that is
      // only discovered when a notification fails means the failure is
      // discovered by somebody not being told something.
      if (!/^https:\/\//i.test(raw.trim())) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A Teams channel URL starts with https://', field: 'teamsWebhookUrl' } },
          { status: 422 }
        )
      }
      data.teamsWebhookUrl = raw.trim()
      changed.push('teamsWebhookUrl')
    }
  }

  if (changed.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Nothing to change' } },
      { status: 422 }
    )
  }

  const updated = await prisma.company.update({
    where: { id: caller.company.id },
    data,
    select: {
      id: true, name: true, currency: true, teamsWebhookUrl: true,
      outsideAccess: true, accountWalls: true,
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'COMPANY_SETTINGS_CHANGED',
      summary: `${caller.person.name} changed ${changed.join(', ')}`,
      reason: 'Edited in settings',
      payload: { changed },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      company: { ...updated, teamsConfigured: Boolean(updated.teamsWebhookUrl) },
      changed,
      message:
        changed.includes('teamsWebhookUrl') && updated.teamsWebhookUrl
          ? 'Saved. Notifications for this company will now post to Teams.'
          : 'Saved.',
    },
  })
}
