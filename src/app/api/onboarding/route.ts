import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { getSessionEmail } from '@/lib/api-context'
import {
  decideEntry, typeByKey, slugFromDomain, guessCompanyName,
  domainOf, COMPANY_TYPES,
} from '@/lib/onboarding'
import { notifyBulk } from '@/lib/notify'
import { defaultsFor } from '@/lib/company-defaults'
import { usFederalHolidays } from '@/lib/holidays'

/**
 * GET  /api/onboarding — what happens when this person signs in
 * POST /api/onboarding — do it
 *
 * The rule this exists to hold: the verified work-email domain IS the
 * company. The first person from terumobct.com sets Terumo BCT up and
 * everybody after them joins it, with no search box and no invite code —
 * both are ways of getting the answer wrong, and the duplicate company is
 * the failure that costs support conversations for months.
 */

export async function GET(request: NextRequest) {
  const email = await getSessionEmail()
  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in first' } },
      { status: 401 }
    )
  }

  // Already placed? Then there is nothing to onboard.
  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    include: {
      contexts: {
        where: { revokedAt: null },
        include: { company: { select: { id: true, name: true, slug: true, kind: true } } },
      },
    },
  })

  if (person && person.contexts.some(c => c.companyId)) {
    const c = person.contexts.find(x => x.companyId)!
    return NextResponse.json({
      data: { action: 'ALREADY_IN', company: c.company, message: `You are already in ${c.company?.name}.` },
    })
  }

  const domain = domainOf(email)
  const existing = domain
    ? await prisma.company.findFirst({
        where: { domain, domainVerified: true },
        select: {
          id: true, name: true, kind: true,
          _count: { select: { contexts: true } },
        },
      })
    : null

  const decision = decideEntry(
    email,
    existing
      ? { id: existing.id, name: existing.name, kind: existing.kind, memberCount: existing._count.contexts }
      : null
  )

  return NextResponse.json({
    data: {
      email,
      ...decision,
      // Only asked when a company is actually being created.
      companyTypes: decision.action === 'CREATE' ? COMPANY_TYPES : undefined,
      suggestedName: decision.action === 'CREATE' ? guessCompanyName(decision.domain) : undefined,
    },
  })
}

export async function POST(request: NextRequest) {
  const email = await getSessionEmail()
  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in first' } },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const domain = domainOf(email)

  const existing = domain
    ? await prisma.company.findFirst({
        where: { domain, domainVerified: true },
        select: { id: true, name: true, kind: true, _count: { select: { contexts: true } } },
      })
    : null

  const decision = decideEntry(
    email,
    existing
      ? { id: existing.id, name: existing.name, kind: existing.kind, memberCount: existing._count.contexts }
      : null
  )

  if (decision.action === 'REFUSE') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: decision.message } },
      { status: 422 }
    )
  }

  // The person exists either way — they signed in.
  const person = await prisma.person.upsert({
    where: { primaryEmail: email },
    update: {},
    create: { primaryEmail: email, name: body.name?.trim() || email.split('@')[0] },
  })

  // ── A consultant. No company, and that is not a lesser outcome. ──
  if (decision.action === 'CONSULTANT') {
    await prisma.context.create({
      data: { personId: person.id, type: 'CONSULTANT' },
    })

    // The profile is created empty rather than waiting for the first edit.
    // Without a row there is nothing for the consultant portal to open, and
    // "add your skills next" leads to a screen that cannot save.
    await prisma.consultantProfile.upsert({
      where: { personId: person.id },
      update: {},
      create: { personId: person.id, skills: [], visibility: 'INTERNAL' },
    })

    return NextResponse.json({
      data: {
        action: 'CONSULTANT',
        message: 'You are set up. Add your skills and availability next.',
      },
    })
  }

  // ── Joining a company that is already here. ──
  if (decision.action === 'JOIN') {
    const already = await prisma.context.findFirst({
      where: { personId: person.id, companyId: decision.company.id, revokedAt: null },
    })
    if (already) {
      return NextResponse.json({
        data: { action: 'JOIN', companyId: decision.company.id, message: `You are already in ${decision.company.name}.` },
      })
    }

    // Joining does not grant a role. Somebody at the company decides what
    // this person may do — an unrecognised colleague getting Owner because
    // they share a domain is how a tenant is lost.
    await prisma.context.create({
      data: { personId: person.id, type: 'EMPLOYEE', companyId: decision.company.id },
    })

    await prisma.automationLog.create({
      data: {
        companyId: decision.company.id,
        action: 'COLLEAGUE_JOINED',
        summary: `${person.name} joined from ${domain}`,
        reason: 'Verified work email on a domain this company already owns',
        payload: { personId: person.id, email },
        reversible: true,
      },
    })

    void emit({
      type: 'company.member_joined',
      companyId: decision.company.id,
      subjectType: 'Person',
      subjectId: person.id,
      actorPersonId: person.id,
      payload: { email, domain, companyName: decision.company.name, hasRole: false },
    })

    // Somebody has to be told, or the new colleague sits with no role and
    // no way to say so — waiting on a decision nobody knows they owe. The
    // people who can grant a role are the ones who get the message.
    const admins = await prisma.context.findMany({
      where: {
        companyId: decision.company.id,
        revokedAt: null,
        personId: { not: person.id },
        role: { permissions: { hasSome: ['*', 'roles.write', 'company.write'] } },
      },
      select: { personId: true },
    })
    if (admins.length > 0) {
      void notifyBulk(
        admins.map(a => ({
          personId: a.personId,
          companyId: decision.company.id,
          type: 'SYSTEM' as const,
          title: `${person.name} is waiting for access`,
          body: `${person.name} (${email}) signed in from ${domain} and joined ${decision.company.name}. They cannot see anything until somebody gives them a role.`,
          entityId: person.id,
        }))
      )
    }

    return NextResponse.json({
      data: {
        action: 'JOIN',
        companyId: decision.company.id,
        companyName: decision.company.name,
        message: `You are in ${decision.company.name}. An administrator there decides what you can see.`,
        needsRole: true,
        // Said plainly, because "waiting for approval" with nobody named is
        // the moment a new user gives up.
        waitingOn: admins.length,
      },
    })
  }

  // ── Setting the company up. ──
  const type = typeByKey(String(body.type ?? ''))
  if (!type) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say what this company does here',
          field: 'type',
          options: COMPANY_TYPES.map(t => ({ key: t.key, label: t.label })),
        },
      },
      { status: 422 }
    )
  }

  const takenSlugs = new Set(
    (await prisma.company.findMany({ select: { slug: true } })).map(c => c.slug)
  )
  const slug = slugFromDomain(decision.domain, takenSlugs)
  const name = String(body.name ?? '').trim() || guessCompanyName(decision.domain)

  // Everything the company starts with, decided from what it is and where
  // it is. A default is a starting point, never a decision taken away —
  // all of this is editable in settings. What it must not do is leave the
  // company unable to start, which is what an empty setup produced.
  const kit = defaultsFor(type.kind as any, name, decision.domain)

  const company = await prisma.company.create({
    data: {
      name,
      slug,
      domain: decision.domain,
      // It came from the OAuth tenant. Asking them to confirm an address
      // the identity provider already proved is theatre that costs a step.
      domainVerified: true,
      kind: type.kind as any,
      supplierPosture: type.posture,
      // The cycle calendar. Without a pack a contract generates no due
      // dates at all, so nothing is ever owed and nothing is ever chased.
      templatePack: kit.templatePack,
      // BUILD.md §4A: the ninety second promise is satisfied here.
      siteLiveAt: new Date(),
      // The network stays closed until somebody vouches. Public site,
      // private network.
      networkVerifiedAt: null,
    },
  })

  // Roles for what this company actually is. A client gets Hiring Manager
  // and no Recruiter; a supplier gets the reverse. One role called Owner
  // meant the access screen could offer a new colleague total control or
  // nothing, which is not a choice anybody should have to make.
  const createdRoles = await Promise.all(
    kit.roles.map((r) =>
      prisma.role.create({
        data: {
          companyId: company.id,
          name: r.name,
          permissions: [...r.permissions],
          isDefault: true,
        },
        select: { id: true, name: true },
      })
    )
  )
  const owner = createdRoles.find((r) => r.name === 'Owner')!

  await prisma.context.create({
    data: { personId: person.id, type: 'EMPLOYEE', companyId: company.id, roleId: owner.id },
  })

  // Somewhere to work. A location picker with nothing in it reads as
  // broken, and an assignment with no location cannot be reasoned about
  // for tenure or for tax.
  await prisma.companyLocation.create({
    data: {
      companyId: company.id,
      name: kit.primaryLocationName,
      country: kit.country,
      isPrimary: true,
    },
  })

  // Public holidays, so business-day shifting has something real to shift
  // against. An empty calendar silently computes every cycle date against
  // weekends only — and cycle arithmetic is one of the three things
  // CLAUDE.md names as hardest to get right.
  if (kit.seedHolidays) {
    const thisYear = new Date().getFullYear()
    const dates = [thisYear, thisYear + 1].flatMap((y) => usFederalHolidays(y))
    await prisma.holiday.createMany({
      data: dates.map((h) => ({
        companyId: company.id,
        date: new Date(h.date + 'T00:00:00Z'),
        name: h.name,
        country: kit.country,
      })),
      skipDuplicates: true,
    })
  }

  await prisma.automationLog.create({
    data: {
      companyId: company.id,
      action: 'COMPANY_CREATED',
      summary: `${name} joined Etyme as ${type.label.toLowerCase()}`,
      reason: `First sign-in from ${decision.domain}`,
      payload: { companyId: company.id, kind: type.kind, posture: type.posture, slug },
      reversible: false,
    },
  })

  void emit({
    type: 'company.created',
    companyId: company.id,
    subjectType: 'Company',
    subjectId: company.id,
    actorPersonId: person.id,
    payload: {
      name: company.name,
      slug: company.slug,
      kind: company.kind,
      posture: company.supplierPosture,
      domain: decision.domain,
    },
  })

  return NextResponse.json(
    {
      data: {
        action: 'CREATE',
        companyId: company.id,
        companyName: company.name,
        slug: company.slug,
        kind: company.kind,
        posture: company.supplierPosture,
        // Said out loud, because a default nobody knows about is a
        // surprise later rather than a head start now.
        setUpForYou: {
          templatePack: kit.templatePack,
          roles: createdRoles.map((r) => r.name),
          country: kit.country,
          holidaysSeeded: kit.seedHolidays,
        },
        // Everything after this is enrichment and skippable (BUILD.md §4A).
        message: `${company.name} is live at ${company.slug}.etyme.com. Anyone else from ${decision.domain} who signs in will join you.`,
      },
    },
    { status: 201 }
  )
}
