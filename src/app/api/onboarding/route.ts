import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { getSessionEmail } from '@/lib/api-context'
import {
  typeByKey, slugFromDomain, guessCompanyName, COMPANY_TYPES,
} from '@/lib/onboarding'
import {
  decideEntry, domainOfEmail, type ClaimedDomain,
} from '@/lib/company-domains'
import { notifyBulk } from '@/lib/notify'
import { defaultPostureFor } from '@/lib/walls'
import { defaultsFor } from '@/lib/company-defaults'
import { holidaysFor } from '@/lib/holidays'
import { writeFromRules } from '@/lib/site-voice'

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

/**
 * Every domain any company has claimed.
 *
 * Loaded whole because the decision needs to consider near matches as well
 * as exact ones, and there are far fewer claimed domains than companies.
 */
async function allClaims(): Promise<ClaimedDomain[]> {
  const rows = await prisma.companyDomain.findMany({
    select: {
      domain: true, companyId: true, verifiedAt: true, joinPolicy: true,
      company: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    domain: r.domain,
    companyId: r.companyId,
    companyName: r.company.name,
    verified: r.verifiedAt !== null,
    joinPolicy: r.joinPolicy as ClaimedDomain['joinPolicy'],
  }))
}

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

  const decision = decideEntry(email, await allClaims())

  return NextResponse.json({
    data: {
      email,
      ...decision,
      // Only asked when a company is actually being created — including
      // after somebody answers a SUGGEST by saying they are separate.
      companyTypes: decision.action === 'CREATE' || decision.action === 'SUGGEST' ? COMPANY_TYPES : undefined,
      suggestedName:
        decision.action === 'CREATE' ? guessCompanyName(decision.domain)
          : decision.action === 'SUGGEST' ? guessCompanyName(decision.domain)
            : undefined,
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
  const domain = domainOfEmail(email)
  const decision = decideEntry(email, await allClaims())

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
  // ── A near match. Answered, never assumed. ──────────────────────────
  //
  // Somebody on us.infosys.com may be part of Infosys or a separate entity
  // that shares the name, and DNS cannot tell you which. So the question
  // is put to them, and their answer arrives here as joinExisting.
  if (decision.action === 'SUGGEST') {
    if (body.joinExisting === true) {
      // They said they are part of it. Their domain is claimed for that
      // company so nobody has to answer this again.
      await prisma.companyDomain.create({
        data: {
          companyId: decision.companyId,
          domain: decision.domain,
          verifiedAt: new Date(),
          verifiedVia: 'OAUTH_TENANT',
          joinPolicy: 'REQUEST',
        },
      })

      const already = await prisma.context.findFirst({
        where: { personId: person.id, companyId: decision.companyId, revokedAt: null },
      })
      if (!already) {
        await prisma.context.create({
          data: { personId: person.id, type: 'EMPLOYEE', companyId: decision.companyId },
        })
      }

      await prisma.automationLog.create({
        data: {
          companyId: decision.companyId,
          action: 'DOMAIN_CLAIMED',
          summary: `${decision.domain} was claimed for ${decision.companyName} by ${person.name}`,
          reason: 'They signed in on a subdomain and confirmed they are part of the company',
          payload: { domain: decision.domain, personId: person.id },
          reversible: true,
        },
      })

      return NextResponse.json({
        data: {
          action: 'JOIN',
          companyId: decision.companyId,
          companyName: decision.companyName,
          message: `You are in ${decision.companyName}, and ${decision.domain} is now theirs so nobody else has to answer that.`,
          needsRole: true,
        },
      })
    }

    if (body.joinExisting !== false) {
      // Unanswered. Returning the question rather than picking for them.
      return NextResponse.json(
        {
          error: {
            code: 'ANSWER_NEEDED',
            message: decision.message,
            field: 'joinExisting',
            suggested: { companyId: decision.companyId, companyName: decision.companyName },
          },
        },
        { status: 409 }
      )
    }
    // Said no. Falls through to creating their own company below.
  }

  if (decision.action === 'JOIN' || decision.action === 'REQUEST') {
    const already = await prisma.context.findFirst({
      where: { personId: person.id, companyId: decision.companyId, revokedAt: null },
    })
    if (already) {
      return NextResponse.json({
        data: { action: 'JOIN', companyId: decision.companyId, message: `You are already in ${decision.companyName}.` },
      })
    }

    // Joining does not grant a role. Somebody at the company decides what
    // this person may do — an unrecognised colleague getting Owner because
    // they share a domain is how a tenant is lost.
    await prisma.context.create({
      data: { personId: person.id, type: 'EMPLOYEE', companyId: decision.companyId },
    })

    await prisma.automationLog.create({
      data: {
        companyId: decision.companyId,
        action: 'COLLEAGUE_JOINED',
        summary: `${person.name} joined from ${domain}`,
        reason: 'Verified work email on a domain this company already owns',
        payload: { personId: person.id, email },
        reversible: true,
      },
    })

    void emit({
      type: 'company.member_joined',
      companyId: decision.companyId,
      subjectType: 'Person',
      subjectId: person.id,
      actorPersonId: person.id,
      payload: { email, domain, companyName: decision.companyName, hasRole: false },
    })

    // Somebody has to be told, or the new colleague sits with no role and
    // no way to say so — waiting on a decision nobody knows they owe. The
    // people who can grant a role are the ones who get the message.
    const admins = await prisma.context.findMany({
      where: {
        companyId: decision.companyId,
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
          companyId: decision.companyId,
          type: 'SYSTEM' as const,
          title: `${person.name} is waiting for access`,
          body: `${person.name} (${email}) signed in from ${domain} and joined ${decision.companyName}. They cannot see anything until somebody gives them a role.`,
          entityId: person.id,
        }))
      )
    }

    return NextResponse.json({
      data: {
        action: 'JOIN',
        companyId: decision.companyId,
        companyName: decision.companyName,
        message: `You are in ${decision.companyName}. An administrator there decides what you can see.`,
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

  // Both CREATE and a SUGGEST answered "we are separate" land here.
  const newCompanyDomain =
    decision.action === 'CREATE' || decision.action === 'SUGGEST' ? decision.domain : domain!

  const takenSlugs = new Set(
    (await prisma.company.findMany({ select: { slug: true } })).map(c => c.slug)
  )
  const slug = slugFromDomain(newCompanyDomain, takenSlugs)
  const name = String(body.name ?? '').trim() || guessCompanyName(newCompanyDomain)

  // Everything the company starts with, decided from what it is and where
  // it is. A default is a starting point, never a decision taken away —
  // all of this is editable in settings. What it must not do is leave the
  // company unable to start, which is what an empty setup produced.
  const kit = defaultsFor(type.kind as any, name, newCompanyDomain)

  const company = await prisma.company.create({
    data: {
      name,
      slug,
      // Kept for display. The company's identity is its id, and the
      // domains it admits people through live in CompanyDomain — a
      // conglomerate holds several and a subsidiary holds its own.
      domain: newCompanyDomain,
      domainVerified: true,
      kind: type.kind as any,
      supplierPosture: type.posture,
      // Who here may look at the market outside. Open for a staffing firm,
      // whose business is outside; named people only for a delivery firm or
      // an enterprise, where a handful hire contractors and the rest have
      // no reason to see the market at all. Changeable in settings, and
      // the default is the safe direction rather than the convenient one.
      outsideAccess: defaultPostureFor(type.kind),
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

  // Words for their page, written from what they just told us. A company
  // with a live address and no words on it is the ninety-second promise
  // half kept.
  //
  // Written by rule at sign-up rather than by model, because sign-up must
  // not wait on a third party — and because on day one there is almost
  // nothing to say beyond what they are and where. They can have it
  // written properly from settings once there is something to write about.
  const voice = writeFromRules({
    name: company.name,
    kind: company.kind,
    posture: company.supplierPosture,
    skills: [],
    locations: [],
    placements: 0, activeNow: 0, clients: 0,
    openPositions: 0, comingFree: 0, trainingCourses: 0,
  })

  await prisma.company.update({
    where: { id: company.id },
    data: {
      siteTagline: voice.tagline,
      siteIntro: voice.intro,
      siteHeadings: voice.headings as any,
      siteWrittenBy: 'RULES',
      siteWrittenAt: new Date(),
    },
  })

  // The domain becomes a claim rather than the company's identity. AUTO,
  // because the person creating a company from their work address is
  // saying everybody on it works there — and that is exactly the case the
  // policy exists for.
  await prisma.companyDomain.create({
    data: {
      companyId: company.id,
      domain: newCompanyDomain,
      // The identity provider already proved it. Asking them to confirm an
      // address it asserted is theatre that costs a step.
      verifiedAt: new Date(),
      verifiedVia: 'OAUTH_TENANT',
      joinPolicy: 'AUTO',
      isPrimary: true,
      addedById: person.id,
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
    const dates = [thisYear, thisYear + 1].flatMap((y) => holidaysFor(kit.country, y) ?? [])
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
          // What their page says on day one, so they can see it rather
          // than discover it.
          siteTagline: voice.tagline,
        },
        // Everything after this is enrichment and skippable (BUILD.md §4A).
        message: `${company.name} is live at ${company.slug}.etyme.com. Anyone else from ${decision.domain} who signs in will join you.`,
      },
    },
    { status: 201 }
  )
}
