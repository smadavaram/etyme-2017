import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionEmail } from '@/lib/api-context'
import {
  decideEntry, typeByKey, slugFromDomain, guessCompanyName,
  domainOf, COMPANY_TYPES,
} from '@/lib/onboarding'

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
    return NextResponse.json({
      data: { action: 'CONSULTANT', message: 'You are set up. Add your skills and availability next.' },
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

    return NextResponse.json({
      data: {
        action: 'JOIN',
        companyId: decision.company.id,
        companyName: decision.company.name,
        message: `You are in ${decision.company.name}. An administrator there decides what you can see.`,
        needsRole: true,
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
