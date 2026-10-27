import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat, staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { BUILT_IN, builtInType } from '@/lib/document-type'
import { licenseFactsFrom, mayAskOnTies, typeKeyForTemplate } from '@/lib/document-request'
import { jurisdictionOf, mayAskOfACandidate } from '@/lib/document-stages'

/**
 * GET /api/documents
 *
 * Document library — templates and instances.
 *
 * Query params:
 *   view      — "templates" | "instances" (default: templates)
 *   audience  — filter templates by audience
 *   subjectId — filter instances by subject (contract, person, company)
 *   status    — filter instances by status
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const view = url.searchParams.get('view') ?? 'templates'
  const companyId = caller.company?.id

  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A company’s paperwork is read at the company, and you are not signed in at one. Your own papers are under Your paperwork.' } },
      { status: 403 }
    )
  }

  if (view !== 'instances') {
    // The template library is a company's own paperwork, and its contents
    // name the clients it was drafted for.
    const notStaff = staffOnly(caller, 'The document library')
    if (notStaff) return notStaff
  }

  if (view === 'instances') {
    const subjectId = url.searchParams.get('subjectId')
    const status = url.searchParams.get('status')

    // Somebody on the bench sees the papers that are about them — their
    // signed contract, their W-9 — and none of the agency's other files.
    const where: any = isConsultantSeat(caller)
      ? {
          template: { companyId },
          OR: [
            { subjectType: 'PERSON', subjectId: caller.person.id },
            { sellContract: { personId: caller.person.id } },
            { buyContract: { candidates: { some: { personId: caller.person.id } } } },
          ],
        }
      : { template: { companyId } }
    if (subjectId) where.subjectId = subjectId
    if (status) where.status = status.toUpperCase()

    const instances = await prisma.docInstance.findMany({
      where,
      include: {
        template: { select: { id: true, name: true, audience: true, needsSignature: true } },
        sellContract: { select: { person: { select: { name: true } }, clientCompany: { select: { name: true } } } },
        buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, take: 1, select: { person: { select: { name: true } } } } } },
      },
      orderBy: [{ sentAt: { sort: 'desc', nulls: 'last' } }, { signedAt: { sort: 'desc', nulls: 'last' } }],
    })

    // Who each request is about, by name. A row that says "PERSON
    // cmt…" is a row nobody can act on.
    const personIds = instances.filter((i) => i.subjectType === 'PERSON').map((i) => i.subjectId)
    const companyIds = instances.filter((i) => i.subjectType === 'COMPANY').map((i) => i.subjectId)
    const [people, companies] = await Promise.all([
      personIds.length ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } }) : [],
      companyIds.length ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    ])
    const personName = new Map(people.map((p) => [p.id, p.name]))
    const companyName = new Map(companies.map((c) => [c.id, c.name]))
    const subjectOf = (i: (typeof instances)[number]): string =>
      i.subjectType === 'PACKET_ITEM'
        ? 'Sent through a document request'
        : i.subjectType === 'PERSON'
        ? personName.get(i.subjectId) ?? 'Somebody'
        : i.subjectType === 'COMPANY'
          ? companyName.get(i.subjectId) ?? 'A company'
          : i.subjectType === 'SELL_CONTRACT'
            ? `${i.sellContract?.person.name ?? 'Somebody'} at ${i.sellContract?.clientCompany.name ?? 'a client'}`
            : i.buyContract?.candidates[0]?.person.name ?? 'Somebody'

    return NextResponse.json({
      data: {
        instances: instances.map((i) => ({
          id: i.id,
          template: i.template,
          subjectType: i.subjectType,
          subjectId: i.subjectId,
          subject: subjectOf(i),
          status: i.status,
          envelopeId: i.envelopeId,
          sentAt: i.sentAt?.toISOString() ?? null,
          signedAt: i.signedAt?.toISOString() ?? null,
          hasSignedFile: !!i.signedFileUrl,
          fileName: i.fileName,
          note: i.note,
          // Whether the firm that asked has looked at it, and what the
          // look needs: the two dates printed on a certificate, the day a
          // passport runs out, the edition of a W-9. The examine screen
          // asks for exactly these and no more.
          examinedAt: i.examinedAt?.toISOString() ?? null,
          validFrom: i.validFrom?.toISOString().slice(0, 10) ?? null,
          expiresAt: i.expiresAt?.toISOString().slice(0, 10) ?? null,
          edition: i.edition ?? null,
          countersignedAt: i.countersignedAt?.toISOString() ?? null,
          examineNeeds: examineNeedsFor(i.template.name),
          // A license's number, issuer and expiry as the sender gave them,
          // so the examine step opens with them filled in.
          licenseFacts: licenseFactsFrom(i.note),
        })),
        total: instances.length,
      },
    })
  }

  // Templates view (default)
  const audience = url.searchParams.get('audience')
  const where: any = { companyId }
  if (audience) where.audience = audience.toUpperCase()

  const templates = await prisma.docTemplate.findMany({
    where,
    include: {
      _count: { select: { instances: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    data: {
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        audience: t.audience,
        needsSignature: t.needsSignature,
        hasFile: !!t.fileUrl,
        instanceCount: t._count.instances,
      })),
      total: templates.length,
    },
  })
}

/**
 * POST /api/documents
 *
 * Create a document template or instance.
 * Body: { type: "template" | "instance", ... }
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A company’s paperwork is read at the company, and you are not signed in at one. Your own papers are under Your paperwork.' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { type } = body

  if (type === 'instance') {
    const { templateId, subjectType, subjectId } = body

    if (!templateId || !subjectType || !subjectId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'templateId, subjectType, and subjectId are required' } },
        { status: 422 }
      )
    }

    const validSubjectTypes = ['SELL_CONTRACT', 'BUY_CONTRACT', 'PERSON', 'COMPANY']
    if (!validSubjectTypes.includes(subjectType)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `subjectType must be one of: ${validSubjectTypes.join(', ')}` } },
        { status: 422 }
      )
    }

    // Nobody asks herself for a document. A one-person firm's owner is on
    // her own payroll, and the picker offered her to herself (release
    // walk, 2026-10-27). Her own papers go on file from her own page.
    if (subjectType === 'PERSON' && subjectId === caller.person.id) {
      return NextResponse.json(
        { error: { code: 'ASKING_YOURSELF', message: 'You cannot ask yourself for a document. Put your own papers on file from Paperwork instead.' } },
        { status: 409 }
      )
    }

    // Verify template exists and belongs to caller's company
    const template = await prisma.docTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, companyId: true, name: true },
    })

    if (!template || template.companyId !== companyId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Template not found' } },
        { status: 404 }
      )
    }

    // ── Questions at application, documents at award ──────────────────
    //
    // A firm that has not offered somebody work may not ask them for a
    // paper the rule table puts after the offer: an ID, a visa, the I-9,
    // a background check, a drug screen. Refused here, at the one door a
    // request about a person is made through, in a sentence that names
    // the question to ask instead (`mayAskOfACandidate`, lib/document-stages).
    if (subjectType === 'PERSON') {
      // Somebody only invited to the bench has not said yes: no papers yet.
      const ties = await tiesTo(subjectId, companyId)
      if (ties.listing !== null && ties.listing !== 'GRANTED') {
        const [who, firm] = await Promise.all([
          prisma.person.findUnique({ where: { id: subjectId }, select: { name: true } }),
          prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
        ])
        const may = mayAskOnTies({ personName: who?.name ?? 'This person', firmName: firm?.name ?? 'Your company', listing: ties.listing, otherTie: ties.other })
        if (!may.ok) return NextResponse.json({ error: { code: may.code, message: may.message } }, { status: 409 })
      }
    }
    if (subjectType === 'PERSON') {
      const typeKey = typeKeyForTemplate(template.name, BUILT_IN.map((t) => ({ key: t.key, label: t.label })), { guess: false })
      if (typeKey) {
        const [person, firm, offered] = await Promise.all([
          prisma.person.findUnique({ where: { id: subjectId }, select: { name: true } }),
          prisma.company.findUnique({ where: { id: companyId }, select: { country: true } }),
          offeredWork(subjectId, companyId),
        ])
        const may = mayAskOfACandidate({
          typeKey,
          label: template.name,
          personName: person?.name ?? 'this person',
          offered,
          jurisdiction: jurisdictionOf(firm?.country ?? 'US'),
        })
        if (!may.ok) {
          return NextResponse.json(
            { error: { code: may.code, message: may.message, insteadAsk: may.insteadAsk } },
            { status: 409 }
          )
        }
      }
    }

    const instance = await prisma.docInstance.create({
      data: {
        templateId,
        subjectType,
        subjectId,
        status: 'PENDING',
        // Link to contract if applicable
        ...(subjectType === 'SELL_CONTRACT' ? { sellContractId: subjectId } : {}),
        ...(subjectType === 'BUY_CONTRACT' ? { buyContractId: subjectId } : {}),
      },
    })

    return NextResponse.json({
      data: {
        instance: {
          id: instance.id,
          templateName: template.name,
          subjectType: instance.subjectType,
          subjectId: instance.subjectId,
          status: instance.status,
        },
      },
    }, { status: 201 })
  }

  // Create template (default)
  const { name, audience, needsSignature } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'name is required', field: 'name' } },
      { status: 422 }
    )
  }

  const validAudiences = ['CANDIDATE', 'VENDOR', 'CLIENT', 'EMPLOYEE', 'GENERAL']
  if (!audience || !validAudiences.includes(audience.toUpperCase())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `audience must be one of: ${validAudiences.join(', ')}`, field: 'audience' } },
      { status: 422 }
    )
  }

  const template = await prisma.docTemplate.create({
    data: {
      companyId,
      name: name.trim(),
      audience: audience.toUpperCase(),
      needsSignature: needsSignature ?? false,
    },
  })

  return NextResponse.json({
    data: {
      template: {
        id: template.id,
        name: template.name,
        audience: template.audience,
        needsSignature: template.needsSignature,
      },
    },
  }, { status: 201 })
}

/**
 * Whether this firm has offered the person work: a line between them (as
 * the firm that places, the client, or the firm that pays), or the person
 * is the firm's own employee. An award writes the lines, so a line is the
 * offer on the record.
 */
async function offeredWork(personId: string, companyId: string): Promise<boolean> {
  const [sell, buy, employed] = await Promise.all([
    prisma.sellContract.findFirst({
      where: {
        personId,
        state: { not: 'CANCELLED' },
        OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }],
      },
      select: { id: true },
    }),
    prisma.buyContract.findFirst({
      where: {
        state: { not: 'CANCELLED' },
        candidates: { some: { personId } },
        OR: [{ companyId }, { vendorCompanyId: companyId }],
      },
      select: { id: true },
    }),
    prisma.context.findFirst({
      where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null },
      select: { id: true },
    }),
  ])
  return !!(sell || buy || employed)
}

/**
 * What accepting a paper of this name asks for, read from its type: a
 * start and an end where the paper prints both, an end where it prints
 * one, an edition where the form is reissued. Nothing for a paper whose
 * type is not known, because nothing is required of it.
 */
function examineNeedsFor(templateName: string): { start: boolean; end: boolean; edition: boolean } {
  const key = typeKeyForTemplate(templateName, BUILT_IN.map((t) => ({ key: t.key, label: t.label })), { guess: false })
  const spec = key ? builtInType(key) : null
  return {
    start: spec?.validityShape === 'START_AND_END',
    end: spec?.validityShape === 'START_AND_END' || spec?.validityShape === 'END_ONLY',
    edition: spec?.reissued === true,
  }
}

/** This firm's listing for the person, and whether anything else ties them. */
async function tiesTo(personId: string, companyId: string): Promise<{ listing: string | null; other: boolean }> {
  const [listing, submission, offered] = await Promise.all([
    prisma.benchListing.findMany({
      where: { companyId, revokedAt: null, consultant: { personId } },
      select: { state: true },
    }),
    prisma.submission.findFirst({ where: { personId, OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }] }, select: { id: true } }),
    offeredWork(personId, companyId),
  ])
  const states = listing.map((l) => l.state)
  return {
    listing: states.length === 0 ? null : states.includes('GRANTED') ? 'GRANTED' : states[0],
    other: !!submission || offered,
  }
}
