import { ownerOnlyLine } from '@/lib/owner-gate'
import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { askTheDesk, hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { getTemplatePack, TEMPLATE_PACKS } from '@/lib/template-packs'
import { SHIFT_CATEGORIES, SHIFT_WORDS, isShiftDirection, policyFrom } from '@/lib/cycle-shift'
import { checkTeamsLink, teamsLinkStanding } from '@/lib/notify/teams-link'
import { changeCompanyKind, isOwnerSeat } from './kind'
import { readCompanySeats, countsByRole, countSeats, peopleOf, roleHeldWords, peopleWords, NO_SEATS, type SeatCounts } from '@/lib/company-seats'
import { joinSentenceFor } from '@/lib/join-words'
import { roleCanDo } from '@/lib/company-roles'

/**
 * GET  /api/settings — everything about how this company is set up
 * PATCH /api/settings — change the company's own details
 *
 * One call rather than six, because the settings screen shows all of it at
 * once and six round trips to render one page is how a settings section
 * ends up feeling slow enough that nobody opens it.
 *
 * Both need `settings.manage`.
 *
 * Reading used to be open to anybody in the company, on the reasoning
 * that a holiday calendar is not privileged — and that was true of the
 * calendar and false of the page it sits on. The browser walk of
 * 2026-09-21 signed in as a Validation Engineer holding
 * `assignments.read` and `timesheets.read`, and this route answered him
 * 200 with every role at his employer and the permission list attached
 * to each, who can see the outside market, the cost centers and whether
 * a Teams channel is configured. That is the company's access
 * architecture, which is exactly the thing an engineer should have to
 * ask an owner for.
 *
 * So the gate is the desk the page is named for, and the Settings link
 * carries the same permission in the menu (`components/shell/sidebar`) —
 * a seat that cannot open it is not shown it.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Company settings')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Settings are a company’s, and you are not signed in at a company.' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `How ${caller.company.name} is set up — its roles, who may see outside it, its ` +
            `calendar and its cost centers — is not something your role reads. ` +
            askTheDesk({
              doing: 'Reading a company’s own setup',
              needs: 'settings.manage',
              kind: caller.company.kind,
              companyName: caller.company.name,
            }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const thisYear = new Date().getFullYear()

  const [company, roles, locations, holidays, costCenters, seats, joins] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, name: true, slug: true, domain: true, domainVerified: true,
        kind: true, supplierPosture: true, currency: true, templatePack: true,
        teamsWebhookUrl: true, networkVerifiedAt: true, siteLiveAt: true,
        outsideAccess: true, accountWalls: true,
        cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true, daysOff: true,
        kindSetById: true, kindSetAt: true, ownerProofRequiredAt: true, ownerVerifiedAt: true,
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
    // One reader of the company's seats (lib/company-seats), so a role's
    // count here is the one every other screen gives.
    readCompanySeats(companyId),
    joinSentenceFor(companyId),
  ])

  // Every seat not ended, invited and paused included: what the role
  // editor's delete guard counts, so a role with only an invited person
  // never reads as held by nobody.
  const heldBy = new Map<string | null, number>()
  for (const s of seats) heldBy.set(s.roleId, (heldBy.get(s.roleId) ?? 0) + 1)
  // The company's own people per role, by state: what a person reads.
  const byRole = countsByRole(seats)
  const none: SeatCounts = NO_SEATS
  // Who last changed the type, by name, and whether this seat may: the
  // Owner alone (lib/company-kind).
  const [typeSetBy, mayChangeType] = await Promise.all([
    company?.kindSetById
      ? prisma.person.findUnique({ where: { id: company.kindSetById }, select: { name: true } })
      : Promise.resolve(null),
    isOwnerSeat(caller.context.id, companyId),
  ])
  const pack = company?.templatePack ? getTemplatePack(company.templatePack) : null

  return NextResponse.json({
    data: {
      company: company && {
        ...company,
        kindSetAt: company.kindSetAt?.toISOString() ?? null,
        typeSet: company.kindSetAt ? { by: typeSetBy?.name ?? null, at: company.kindSetAt.toISOString() } : null,
        networkVerifiedAt: company.networkVerifiedAt?.toISOString() ?? null,
        siteLiveAt: company.siteLiveAt?.toISOString() ?? null,
        // Configured only where the saved link is a Workflows link that
        // works. A link of the kind Microsoft switched off in May 2026 is
        // saved and is not configured, and `teams.says` tells the screen
        // what to do about it (lib/notify/teams-link).
        teamsConfigured: teamsLinkStanding(company.teamsWebhookUrl).state === 'WORKS',
        teams: teamsLinkStanding(company.teamsWebhookUrl),
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
          .filter((r) => hasPermission(r.permissions, 'network.read'))
          // Only people who have access can see anything: an invited
          // person who never signed in sees nothing yet.
          .map((r) => ({ role: r.name, heldBy: (byRole.get(r.id) ?? none).withAccess })),
      },
      roles: roles.map((r) => {
        const c = byRole.get(r.id) ?? none
        const can = roleCanDo(r)
        return {
          ...r,
          // Every seat not ended that holds it. A role nobody holds is
          // either new or dead, and the difference matters before deleting one.
          heldBy: heldBy.get(r.id) ?? 0,
          // The company's own people holding it, by state, and in words:
          // "2 with access · 3 invited", "nobody holds this yet".
          withAccess: c.withAccess,
          invited: c.invited,
          paused: c.paused,
          heldWords: roleHeldWords(c),
          // What it can do, against the whole catalog (lib/company-roles).
          canDo: { everything: can.everything, count: can.count, of: can.of, words: can.words, list: can.list },
        }
      }),
      // The company's people, counted once, in words.
      people: peopleWords(countSeats(peopleOf(seats))),
      // How people join this company, from what the code does (lib/join-words).
      joins,
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
      // Which way this company's dates move off a weekend or a holiday.
      // Sent with the words beside it so the screen does not have to know
      // what BEFORE means — the code is for the machine, the sentence is
      // the product.
      cycleShift: {
        policy: policyFrom(company),
        categories: SHIFT_CATEGORIES,
        directions: Object.entries(SHIFT_WORDS).map(([value, w]) => ({ value, ...w })),
      },
      // What this caller may change here, so the screen can show fields as
      // read-only rather than failing on save.
      canEdit: hasPermission(caller.permissions, 'settings.manage'),
      canEditGovernance: hasPermission(caller.permissions, 'governance.write'),
      // The type is the Owner's to change, and nobody else's.
      canChangeType: mayChangeType,
      // What a reader who may not change it is told: the gate's sentence
      // with the link to Prove ownership where there is no verified Owner
      // to ask, the Owner-only sentence otherwise (lib/owner-gate).
      typeLine: mayChangeType || !company ? null : ownerOnlyLine(company, 'COMPANY_TYPE'),
    },
  })
}

/**
 * PATCH /api/settings
 *
 * The company's own details. Name, currency, and the Teams channel that
 * notifications post to. And `{ type }` on its own: what kind of company
 * this is, the Owner's alone (./kind, lib/company-kind).
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
      { error: { code: 'NO_COMPANY', message: 'Settings are a company’s, and you are not signed in at a company.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))

  // ── What kind of company this is ───────────────────────────────────
  //
  // The Owner's alone, and asked before the settings gate so that anybody
  // else, an Admin included, is told whose it is rather than that they
  // lack a permission (the founder's Tapin, 2026-11-02; lib/company-kind).
  if (body && typeof body === 'object' && 'type' in body) {
    const others = Object.keys(body).filter((k) => k !== 'type')
    if (others.length > 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Change the type of company on its own, then the rest.', field: 'type' } },
        { status: 422 }
      )
    }
    const result = await changeCompanyKind({
      companyId: caller.company.id,
      contextId: caller.context.id,
      person: { id: caller.person.id, name: caller.person.name },
      type: body.type,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.status === 403 ? 'FORBIDDEN' : result.status === 409 ? 'CONFLICT' : 'VALIDATION', message: result.message, field: result.field } },
        { status: result.status }
      )
    }
    return NextResponse.json({
      data: { kind: result.kind, supplierPosture: result.supplierPosture, rolesAdded: result.rolesAdded, changed: ['type'], message: result.message },
    })
  }

  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          // The desk, not the key. A person reading "needs
          // settings.manage" has been handed the machine's word for
          // the thing they are not allowed to do.
          message: askTheDesk({
            doing: 'Changing how this company is set up',
            needs: 'settings.manage',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

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

  // ── Which way a date moves off a weekend or a holiday ──────────────
  //
  // Three questions, on the three words a person reads a cycle in. A
  // direction nobody recognizes is refused rather than written: this is
  // the day somebody is paid, and a column holding a word the generator
  // cannot read would quietly fall back to a default nobody chose.
  for (const { key, label } of SHIFT_CATEGORIES) {
    const field = `cycleShift${key.charAt(0).toUpperCase()}${key.slice(1)}`
    if (!(field in body)) continue
    const value = typeof body[field] === 'string' ? body[field].trim().toUpperCase() : body[field]
    if (!isShiftDirection(value)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `${label} dates move to the working day BEFORE, the working day AFTER, or NONE to leave them where they fall`,
            field,
          },
        },
        { status: 422 }
      )
    }
    data[field] = value
    changed.push(field)
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
    // Checked here rather than at send time. A link that is only found
    // wrong when a notification fails is found wrong by somebody not
    // being told something — and since May 2026 the old connector kind
    // starts with https:// and still goes nowhere, so the check is the
    // kind of link, not its scheme. Empty clears it, back to email.
    const check = checkTeamsLink(body.teamsWebhookUrl)
    if (!check.ok) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: check.message, field: 'teamsWebhookUrl' } },
        { status: 422 }
      )
    }
    data.teamsWebhookUrl = check.url
    changed.push('teamsWebhookUrl')
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
      cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true,
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
      company: {
        ...updated,
        teamsConfigured: teamsLinkStanding(updated.teamsWebhookUrl).state === 'WORKS',
        teams: teamsLinkStanding(updated.teamsWebhookUrl),
      },
      changed,
      message:
        changed.includes('teamsWebhookUrl') && updated.teamsWebhookUrl
          ? 'Saved. Notifications for this company will now post to Teams.'
          : changed.some((c) => c.startsWith('cycleShift'))
            ? 'Saved. Cycle dates already generated keep their dates; this applies from the next contract.'
            : 'Saved.',
    },
  })
}
