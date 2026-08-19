import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionEmail } from '@/lib/api-context'
import {
  decideEntry, typeByKey, slugFromDomain, guessCompanyName,
  domainOf, COMPANY_TYPES,
} from '@/lib/onboarding'
import { notifyBulk } from '@/lib/notify'

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
      // BUILD.md §4A: the ninety second promise is satisfied here.
      siteLiveAt: new Date(),
      // The network stays closed until somebody vouches. Public site,
      // private network.
      networkVerifiedAt: null,
    },
  })

  // The person who sets it up owns it. Everyone after them waits for a role.
  const owner = await prisma.role.create({
    data: { companyId: company.id, name: 'Owner', permissions: ['*'], isDefault: false },
  })

  await prisma.context.create({
    data: { personId: person.id, type: 'EMPLOYEE', companyId: company.id, roleId: owner.id },
  })

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

  return NextResponse.json(
    {
      data: {
        action: 'CREATE',
        companyId: company.id,
        companyName: company.name,
        slug: company.slug,
        kind: company.kind,
        posture: company.supplierPosture,
        // Everything after this is enrichment and skippable (BUILD.md §4A).
        message: `${company.name} is live at ${company.slug}.etyme.com. Anyone else from ${decision.domain} who signs in will join you.`,
      },
    },
    { status: 201 }
  )
}
