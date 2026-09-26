import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { promises as dns } from 'dns'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import {
  checkSubdomain,
  checkCustomDomain,
  verificationRecord,
  servingRecord,
  assessSubdomainChange,
} from '@/lib/domains-owned'

/**
 * GET    /api/settings/address        — where this company lives
 * PATCH  /api/settings/address        — change the Etyme address
 * POST   /api/settings/address        — map a domain you own, or check it
 * DELETE /api/settings/address?id=    — stop using a mapped domain
 *
 * Sign-up guesses an address from the email domain and nothing could
 * change it. Fine for ninety seconds and wrong forever after — companies
 * rebrand, the guess is sometimes ugly, and a firm with its own domain
 * wants its own address rather than a subdomain of ours.
 *
 * Changing the address needs settings.manage. It is not a destructive act
 * because the old one is kept and redirects, which is the only reason it
 * can be offered without a confirmation dialogue nobody reads.
 */

async function guard(request: NextRequest, write: boolean) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'An address belongs to a company' } },
        { status: 403 }
      ),
    }
  }
  if (write && !hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Changing your address needs settings.manage' } },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, false)
  if (error) return error
  const companyId = caller!.company!.id

  const [company, aliases, customs] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { slug: true, name: true } }),
    prisma.subdomainAlias.findMany({
      where: { companyId },
      orderBy: { releasedAt: 'desc' },
      select: { id: true, subdomain: true, reason: true, releasedAt: true },
    }),
    prisma.customDomain.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, domain: true, state: true, verificationToken: true,
        verifiedAt: true, lastCheckedAt: true, lastCheckNote: true, isPrimary: true,
        addedBy: { select: { name: true } },
      },
    }),
  ])

  return NextResponse.json({
    data: {
      subdomain: company?.slug ?? null,
      url: `https://${company?.slug}.etyme.com`,
      // Old addresses, still resolving. Shown so nobody wonders whether
      // the link they sent last year still works.
      previousAddresses: aliases.map((a) => ({
        id: a.id,
        subdomain: a.subdomain,
        url: `https://${a.subdomain}.etyme.com`,
        reason: a.reason,
        releasedAt: a.releasedAt.toISOString().slice(0, 10),
        note: 'Still works — sends people to your current address.',
      })),
      customDomains: customs.map((c) => ({
        id: c.id,
        domain: c.domain,
        state: c.state,
        isPrimary: c.isPrimary,
        addedBy: c.addedBy.name,
        verifiedAt: c.verifiedAt?.toISOString().slice(0, 10) ?? null,
        lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
        lastCheckNote: c.lastCheckNote,
        // Both records, always. Somebody halfway through setup needs to see
        // what they have already added as well as what is next.
        records:
          c.state === 'VERIFIED'
            ? [servingRecord(c.domain)]
            : [verificationRecord(c.domain, c.verificationToken), servingRecord(c.domain)],
      })),
      canEdit: hasPermission(caller!.permissions, 'settings.manage'),
    },
  })
}

/**
 * PATCH — change the Etyme address.
 *
 * The old subdomain becomes an alias rather than being released. Every
 * link anybody saved keeps working, and the name is never handed to
 * another company: a subdomain that used to be one firm's address, given
 * to somebody else, means old links land on a stranger's data.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const asked = String(body.subdomain ?? '')

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { slug: true, name: true },
  })
  if (!company) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Company not found' } }, { status: 404 })
  }

  // Live subdomains and every alias ever released. Both are taken —
  // except this company's own, which it may take back.
  const [companies, aliases] = await Promise.all([
    prisma.company.findMany({ select: { slug: true } }),
    prisma.subdomainAlias.findMany({ select: { id: true, subdomain: true, companyId: true } }),
  ])

  const ownAliases = new Map(
    aliases.filter((a) => a.companyId === companyId).map((a) => [a.subdomain, a.id])
  )

  const taken = new Set<string>([
    ...companies.map((c) => c.slug),
    ...aliases.filter((a) => a.companyId !== companyId).map((a) => a.subdomain),
  ])
  // Their own current address is not a collision with themselves.
  taken.delete(company.slug)

  const verdict = checkSubdomain(asked, taken)
  if (!verdict.ok || !verdict.value) {
    return NextResponse.json(
      { error: { code: 'BAD_SUBDOMAIN', message: verdict.reason, field: 'subdomain' } },
      { status: 422 }
    )
  }

  const aliasCount = await prisma.subdomainAlias.count({ where: { companyId } })
  const assessment = assessSubdomainChange(company.slug, verdict.value, aliasCount)
  if (!assessment.allowed) {
    return NextResponse.json(
      { error: { code: 'NO_CHANGE', message: assessment.reason } },
      { status: 422 }
    )
  }

  const previous = company.slug

  // Taking back one of your own old addresses is an undo, so the alias
  // that was redirecting to you is removed rather than left pointing at
  // itself.
  const reclaimingAliasId = ownAliases.get(verdict.value) ?? null

  await prisma.$transaction([
    prisma.subdomainAlias.create({
      data: {
        companyId,
        subdomain: previous,
        reason: body.reason ? String(body.reason).trim() : null,
        releasedById: realPersonId(caller!),
      },
    }),
    ...(reclaimingAliasId
      ? [prisma.subdomainAlias.delete({ where: { id: reclaimingAliasId } })]
      : []),
    prisma.company.update({ where: { id: companyId }, data: { slug: verdict.value } }),
  ])

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'ADDRESS_CHANGED',
      summary: `${caller!.person.name} changed the address from ${previous}.etyme.com to ${verdict.value}.etyme.com`,
      reason: body.reason ? String(body.reason).trim() : 'Changed in settings',
      payload: { from: previous, to: verdict.value },
      // The old address is kept, so this can be undone by changing back.
      reversible: true,
    },
  })

  void emit({
    type: 'company.created',
    companyId,
    subjectType: 'Company',
    subjectId: companyId,
    actorPersonId: realPersonId(caller!),
    payload: { action: 'address_changed', from: previous, to: verdict.value },
  })

  return NextResponse.json({
    data: {
      subdomain: verdict.value,
      url: `https://${verdict.value}.etyme.com`,
      previousAddress: `${previous}.etyme.com`,
      consequences: assessment.consequences,
      reclaimed: reclaimingAliasId !== null,
      message: reclaimingAliasId
        ? `You are back at ${verdict.value}.etyme.com. ${previous}.etyme.com now redirects here instead.`
        : `You are now at ${verdict.value}.etyme.com. ${previous}.etyme.com still works and sends people here.`,
    },
  })
}

/**
 * POST — map a domain, or check whether it has verified yet.
 *
 * Two actions on one route because they are the same conversation: add it,
 * then keep asking whether DNS has caught up.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))

  // ── Check an existing one ───────────────────────────────────────────
  if (body.checkId) {
    const existing = await prisma.customDomain.findFirst({
      where: { id: String(body.checkId), companyId },
      select: { id: true, domain: true, verificationToken: true, state: true },
    })
    if (!existing) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such domain here' } }, { status: 404 })
    }

    const record = verificationRecord(existing.domain, existing.verificationToken)
    let found = false
    let note: string

    try {
      const records = await dns.resolveTxt(record.name)
      const flat = records.map((chunks) => chunks.join(''))
      found = flat.includes(record.value)
      note = found
        ? 'The record is there and matches.'
        : flat.length === 0
          ? 'Nothing published at that name yet. DNS usually takes a few minutes and sometimes an hour.'
          : `Found a record but not ours. It says "${flat[0].slice(0, 60)}". Check for a typo, or that it was added to the right zone.`
    } catch (err: any) {
      note =
        err?.code === 'ENOTFOUND' || err?.code === 'ENODATA'
          ? 'Nothing published at that name yet. DNS usually takes a few minutes and sometimes an hour.'
          : `Could not look it up: ${String(err?.code ?? err).slice(0, 60)}`
    }

    const isFirstVerified =
      found && (await prisma.customDomain.count({ where: { companyId, state: 'VERIFIED' } })) === 0

    await prisma.customDomain.update({
      where: { id: existing.id },
      data: {
        state: found ? 'VERIFIED' : existing.state === 'VERIFIED' ? 'VERIFIED' : 'PENDING',
        verifiedAt: found ? new Date() : undefined,
        lastCheckedAt: new Date(),
        lastCheckNote: note,
        // The first verified domain becomes the one that serves. Anything
        // else would leave somebody verified and still not working.
        isPrimary: isFirstVerified ? true : undefined,
      },
    })

    return NextResponse.json({
      data: {
        id: existing.id,
        domain: existing.domain,
        verified: found,
        note,
        nextStep: found
          ? servingRecord(existing.domain)
          : verificationRecord(existing.domain, existing.verificationToken),
        message: found
          ? `${existing.domain} is verified. Point it at us with the record below and it will start serving.`
          : `Not yet. ${note}`,
      },
    })
  }

  // ── Add one ─────────────────────────────────────────────────────────
  const taken = new Set(
    (await prisma.customDomain.findMany({ select: { domain: true } })).map((d) => d.domain)
  )
  const verdict = checkCustomDomain(String(body.domain ?? ''), taken)
  if (!verdict.ok || !verdict.value) {
    return NextResponse.json(
      { error: { code: 'BAD_DOMAIN', message: verdict.reason, field: 'domain' } },
      { status: 422 }
    )
  }

  const adder = realPersonId(caller!)
  if (!adder) {
    return NextResponse.json(
      { error: { code: 'PERSON_REQUIRED', message: 'An integration cannot map a domain. A person has to decide this.' } },
      { status: 403 }
    )
  }

  const token = `tok_${randomBytes(16).toString('hex')}`

  const created = await prisma.customDomain.create({
    data: {
      companyId,
      domain: verdict.value,
      verificationToken: token,
      state: 'PENDING',
      addedById: adder,
    },
    select: { id: true, domain: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'CUSTOM_DOMAIN_ADDED',
      summary: `${caller!.person.name} started mapping ${verdict.value}`,
      reason: 'Waiting on a DNS record to prove ownership',
      payload: { customDomainId: created.id, domain: verdict.value },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        id: created.id,
        domain: created.domain,
        state: 'PENDING',
        // Both records at once. Somebody with access to their DNS panel
        // right now should be able to add everything in one visit rather
        // than coming back after verification for the second record.
        records: [verificationRecord(verdict.value, token), servingRecord(verdict.value)],
        message: `Add both records to your DNS, then check back. Nothing serves at ${verdict.value} until the first one is visible — anybody can type a domain into a form, so we have to see it.`,
      },
    },
    { status: 201 }
  )
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.customDomain.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, domain: true, isPrimary: true, state: true },
  })
  if (!existing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such domain here' } }, { status: 404 })
  }

  await prisma.customDomain.delete({ where: { id } })

  await prisma.automationLog.create({
    data: {
      companyId: caller!.company!.id,
      action: 'CUSTOM_DOMAIN_REMOVED',
      summary: `${caller!.person.name} stopped using ${existing.domain}`,
      reason: request.nextUrl.searchParams.get('reason') ?? 'Removed in settings',
      payload: { domain: existing.domain, wasPrimary: existing.isPrimary },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      removed: existing.domain,
      message: existing.isPrimary
        ? `${existing.domain} no longer reaches you. Anybody with that link now needs your etyme.com address — you may want to leave the DNS record in place until they have it.`
        : `${existing.domain} removed.`,
    },
  })
}
