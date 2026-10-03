import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat, staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'

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
      { error: { code: 'NO_COMPANY', message: 'Company context required' } },
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
      i.subjectType === 'PERSON'
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
      { error: { code: 'NO_COMPANY', message: 'Company context required' } },
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
