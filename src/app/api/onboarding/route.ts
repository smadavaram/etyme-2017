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
import { MEMBER_ROLE } from '@/lib/company-defaults'
import { seatAsMember } from '@/lib/seat-member'
import { createCompany } from '@/lib/company-create'
import { packSentence, countryGuessSentence, currencyFor, COUNTRIES, CURRENCIES } from '@/lib/setup-steps'
import { countryFromDomain, packFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'
import { setupStateFor } from '@/lib/setup-state'

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
    // The seat they hold, so /start can open their own desk rather than an
    // empty dashboard, and whether the company's setup is theirs to finish.
    const role = c.roleId
      ? await prisma.role.findUnique({ where: { id: c.roleId }, select: { name: true, permissions: true } })
      : null
    const permissions = role?.permissions ?? []
    const setup = await setupStateFor(c.companyId!, {
      mayRun: hasPermission(permissions, 'settings.manage'),
      followedLinkBack: request.nextUrl.searchParams.get('finish') === '1',
    })
    return NextResponse.json({
      data: {
        action: 'ALREADY_IN',
        company: c.company,
        message: `You are already in ${c.company?.name}.`,
        seat: { type: c.type, role: role?.name ?? null, permissions },
        setup,
      },
    })
  }

  // A consultant holds a seat with no company. Asking them again would
  // offer "Continue" and write a second consultant seat — or, for a
  // candidate on a work address, offer to found a company. Their own page
  // is the desk (found 2026-10-08, building the password door).
  const own = person?.contexts.find((c) => c.type === 'CONSULTANT' && !c.companyId)
  if (own) {
    return NextResponse.json({
      data: {
        action: 'ALREADY_IN',
        company: null,
        message: 'You are already in, on your own page.',
        seat: { type: 'CONSULTANT', role: null, permissions: [] },
        setup: null,
      },
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
      // Step 2's guesses, each said as a guess. The page recomputes the
      // pack line as the answers change, from the same functions.
      ...(decision.action === 'CREATE' || decision.action === 'SUGGEST'
        ? (() => {
            const country = countryFromDomain(decision.domain)
            return {
              suggestedCountry: country,
              suggestedCurrency: currencyFor(country),
              countrySays: countryGuessSentence(country, decision.domain),
              packSays: packSentence(packFor('VENDOR', country)),
              countries: COUNTRIES,
              currencies: CURRENCIES,
            }
          })()
        : {}),
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
      if (!already) await seatAsMember(person.id, decision.companyId)

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
          message: `You are in ${decision.companyName} as ${MEMBER_ROLE}, and ${decision.domain} is now theirs so nobody else has to answer that.`,
          role: MEMBER_ROLE,
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

    // Joining grants the Member role and nothing more: their own work,
    // never the firm's. Somebody at the company gives them a desk.
    await seatAsMember(person.id, decision.companyId)

    await prisma.automationLog.create({
      data: {
        companyId: decision.companyId,
        action: 'COLLEAGUE_JOINED',
        summary: `${person.name} joined from ${domain} as ${MEMBER_ROLE}`,
        reason: 'Verified work email on a domain this company already owns',
        payload: { personId: person.id, email, role: MEMBER_ROLE },
        reversible: true,
      },
    })

    void emit({
      type: 'company.member_joined',
      companyId: decision.companyId,
      subjectType: 'Person',
      subjectId: person.id,
      actorPersonId: person.id,
      payload: { email, domain, companyName: decision.companyName, hasRole: true, role: MEMBER_ROLE },
    })

    return NextResponse.json({
      data: {
        action: 'JOIN',
        companyId: decision.companyId,
        companyName: decision.companyName,
        message: `You are in ${decision.companyName} as ${MEMBER_ROLE}. You can see your own work now. An owner there gives you a desk.`,
        role: MEMBER_ROLE,
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

  // One way to make a company (lib/company-create): the same pack, roles,
  // head office and holidays as "Add company". Country and currency are
  // step 2's answers; left out, they are guessed from the domain.
  const made = await createCompany({
    name,
    kind: type.kind as any,
    slug,
    domain: newCompanyDomain,
    country: body.country ?? null,
    currency: body.currency ?? null,
    posture: type.posture,
    byPersonId: person.id,
    seatAsOwner: true,
    claimDomain: true,
    startsSetup: true,
  })
  const company = made.company

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
          templatePack: made.templatePack,
          roles: made.roles.map((r) => r.name),
          country: made.country,
          currency: made.currency,
          holidaysSeeded: made.holidaysSeeded > 0,
          // What their page says on day one, so they can see it rather
          // than discover it.
          siteTagline: made.siteTagline,
        },
        packSays: packSentence(made.templatePack),
        // Everything after this is enrichment and skippable (BUILD.md §4A).
        message: `${company.name} is live at ${company.slug}.etyme.com. Anyone else from ${decision.domain} who signs in will join you.`,
      },
    },
    { status: 201 }
  )
}
