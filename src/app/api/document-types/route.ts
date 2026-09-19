import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  typesFor,
  mayDefine,
  editionToUse,
  PURPOSE_SAYS,
  SHAPE_SAYS,
  type DefinedType,
} from '@/lib/document-type'

/**
 * GET   /api/document-types           — the dictionary this company works with
 * POST  /api/document-types           — add one of its own, or change one of ours
 * POST  /api/document-types?editions  — record which edition of a form is current
 *
 * The list is the company's. Ours are the shapes a type can take.
 *
 * A firm asked for a state contractor registration, a site induction
 * certificate or a client's own security attestation has, until now, had
 * nowhere to put it — `VerificationType` is ten values somebody thought of
 * in advance. So a company adds its own here and it behaves correctly
 * from the first document filed against it, because the behavior comes
 * from three declared properties and not from a special case in code.
 *
 * A company that has added nothing has no rows and still gets the whole
 * shipped dictionary. Nobody defines an I-9 before they can hire.
 */

function dictionaryOf(rows: DefinedType[], now: Date) {
  return typesFor(rows).map((t) => ({
    ...t,
    purposeSays: PURPOSE_SAYS[t.purpose],
    shapeSays: SHAPE_SAYS[t.validityShape],
  }))
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Document types')
  if (notStaff) return notStaff

  const now = new Date()
  const rows = await prisma.documentType.findMany({
    where: { companyId: caller.company!.id },
    include: { editions: { orderBy: { effectiveFrom: 'desc' } } },
    orderBy: { key: 'asc' },
  })

  const editionsByKey = new Map(rows.map((r) => [r.key, r.editions]))

  const types = dictionaryOf(rows as unknown as DefinedType[], now).map((t) => {
    const editions = editionsByKey.get(t.key) ?? []
    return {
      ...t,
      editions: editions.map((e) => ({
        edition: e.edition,
        effectiveFrom: e.effectiveFrom.toISOString(),
        retiredAt: e.retiredAt?.toISOString() ?? null,
        source: e.source,
      })),
      // What somebody completing this form today should be using, or null
      // where this company has never said. Null rather than a guess: a
      // made-up "current edition" would mark every historical form wrong.
      editionToUse: t.reissued ? editionToUse(editions, now) : null,
    }
  })

  return NextResponse.json({ data: { types } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Document types')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  // ── Recording which edition of a form is current ──
  if (body?.edition) {
    const key = typeof body?.key === 'string' ? body.key.trim().toUpperCase() : ''
    const edition = typeof body.edition === 'string' ? body.edition.trim() : ''
    const effectiveFrom = body?.effectiveFrom ? new Date(body.effectiveFrom) : null

    if (!key) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Say which document this edition belongs to.' } },
        { status: 422 }
      )
    }
    if (!edition) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message:
              'Give the edition exactly as it is printed on the form, like 10/21/2019. ' +
              'An auditor reads it back literally, so it is not tidied up.',
          },
        },
        { status: 422 }
      )
    }
    if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime())) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message:
              'Give the day this edition became the one to use. Without it, nothing can say ' +
              'whether a form signed last year was signed on the right edition.',
          },
        },
        { status: 422 }
      )
    }

    const existing = await prisma.documentType.findMany({ where: { companyId } })
    const known = typesFor(existing as unknown as DefinedType[]).find((t) => t.key === key)
    if (!known) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_SUCH_TYPE',
            message: `There is no document type called ${key}. Add the document type first, then record its editions.`,
          },
        },
        { status: 404 }
      )
    }
    if (!known.reissued) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_REISSUED',
            message:
              `${known.label} is not marked as a form that gets reissued, so it has no editions. ` +
              `Change the document type first if the issuer does reissue it.`,
          },
        },
        { status: 409 }
      )
    }

    // A company that has never customized this type has no row to hang
    // the edition on, so one is written here. It keeps our defaults.
    const row =
      existing.find((r) => r.key === key) ??
      (await prisma.documentType.create({
        data: {
          companyId,
          key,
          label: known.label,
          hint: known.hint,
          purpose: known.purpose,
          validityShape: known.validityShape,
          validMonths: known.validMonths,
          reissued: known.reissued,
          backedByAnyOf: known.backedByAnyOf,
          requiresBacking: known.requiresBacking,
          signedBy: known.signedBy,
          suppliedBy: known.suppliedBy,
          blocks: known.blocks,
          builtIn: true,
          createdById: caller.person.id,
        },
      }))

    await prisma.documentEdition.upsert({
      where: { documentTypeId_edition: { documentTypeId: row.id, edition } },
      create: {
        documentTypeId: row.id,
        edition,
        effectiveFrom,
        retiredAt: body?.retiredAt ? new Date(body.retiredAt) : null,
        source: typeof body?.source === 'string' ? body.source : null,
        recordedById: caller.person.id,
      },
      update: {
        effectiveFrom,
        retiredAt: body?.retiredAt ? new Date(body.retiredAt) : null,
        source: typeof body?.source === 'string' ? body.source : null,
      },
    })

    return NextResponse.json({
      data: {
        says: `Edition ${edition} of the ${known.label} recorded, in force from ${effectiveFrom.toISOString().slice(0, 10)}.`,
      },
    })
  }

  // ── Adding or changing a document type ──
  const existing = (await prisma.documentType.findMany({ where: { companyId } })) as unknown as DefinedType[]

  const verdict = mayDefine(
    {
      key: typeof body?.key === 'string' ? body.key : '',
      label: typeof body?.label === 'string' ? body.label : '',
      purpose: typeof body?.purpose === 'string' ? body.purpose : '',
      validityShape: typeof body?.validityShape === 'string' ? body.validityShape : '',
      validMonths: body?.validMonths ?? null,
    },
    existing
  )

  if (!verdict.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: verdict.says } }, { status: 422 })
  }

  const key = body.key.trim().toUpperCase()
  const created = await prisma.documentType.create({
    data: {
      companyId,
      key,
      label: body.label.trim(),
      hint: typeof body?.hint === 'string' ? body.hint : null,
      purpose: body.purpose,
      validityShape: body.validityShape,
      validMonths: body?.validMonths ?? null,
      reissued: body?.reissued === true,
      backedByAnyOf: Array.isArray(body?.backedByAnyOf)
        ? body.backedByAnyOf.filter((k: unknown) => typeof k === 'string')
        : [],
      requiresBacking: body?.requiresBacking === true,
      signedBy: typeof body?.signedBy === 'string' ? body.signedBy : 'NOBODY',
      suppliedBy: typeof body?.suppliedBy === 'string' ? body.suppliedBy : null,
      blocks: body?.blocks === true,
      builtIn: false,
      createdById: caller.person.id,
    },
  })

  return NextResponse.json({ data: { id: created.id, key: created.key, says: verdict.says } })
}

/**
 * PATCH /api/document-types { key, ... } — rename one, retire one, or
 * change what it requires.
 *
 * A built-in a company has never touched has no row, so the first change
 * writes one. Retiring rather than deleting: documents already filed
 * against a type keep their meaning, and a type deleted out from under a
 * hundred certificates is a hundred rows that suddenly describe nothing.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Document types')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const key = typeof body?.key === 'string' ? body.key.trim().toUpperCase() : ''

  if (!key) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which document type you are changing.' } },
      { status: 422 }
    )
  }

  const rows = await prisma.documentType.findMany({ where: { companyId } })
  const known = typesFor(rows as unknown as DefinedType[]).find((t) => t.key === key)
  const shipped = typesFor([]).find((t) => t.key === key)

  if (!known && !shipped) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_SUCH_TYPE',
          message: `There is no document type called ${key}. Add it first, then change it.`,
        },
      },
      { status: 404 }
    )
  }

  const base = known ?? shipped!
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : base.label

  const data = {
    label,
    hint: typeof body?.hint === 'string' ? body.hint : base.hint,
    purpose: typeof body?.purpose === 'string' ? body.purpose : base.purpose,
    validityShape: typeof body?.validityShape === 'string' ? body.validityShape : base.validityShape,
    validMonths: body?.validMonths !== undefined ? body.validMonths : base.validMonths,
    reissued: typeof body?.reissued === 'boolean' ? body.reissued : base.reissued,
    backedByAnyOf: Array.isArray(body?.backedByAnyOf)
      ? body.backedByAnyOf.filter((k: unknown) => typeof k === 'string')
      : base.backedByAnyOf,
    requiresBacking:
      typeof body?.requiresBacking === 'boolean' ? body.requiresBacking : base.requiresBacking,
    signedBy: typeof body?.signedBy === 'string' ? body.signedBy : base.signedBy,
    suppliedBy: typeof body?.suppliedBy === 'string' ? body.suppliedBy : base.suppliedBy,
    blocks: typeof body?.blocks === 'boolean' ? body.blocks : base.blocks,
    archivedAt: body?.retire === true ? new Date() : body?.retire === false ? null : undefined,
  }

  const verdict = mayDefine(
    { key, label, purpose: data.purpose, validityShape: data.validityShape, validMonths: data.validMonths },
    // Its own row is not a clash with itself.
    (rows as unknown as DefinedType[]).filter((r) => r.key !== key)
  )
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: verdict.says } }, { status: 422 })
  }

  await prisma.documentType.upsert({
    where: { companyId_key: { companyId, key } },
    create: {
      companyId,
      key,
      ...data,
      archivedAt: data.archivedAt ?? null,
      builtIn: shipped != null,
      createdById: caller.person.id,
    },
    update: data,
  })

  return NextResponse.json({
    data: {
      says:
        body?.retire === true
          ? `${label} retired. Documents already filed against it keep their meaning.`
          : `${label} updated.`,
    },
  })
}
