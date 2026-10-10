import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { getTemplatePack, TEMPLATE_PACK_IDS } from '@/lib/template-packs'
import { templatePackRefusal } from './refusal'

/**
 * POST /api/companies/:id/template-pack
 *
 * Applies a template pack to a company. BUILD.md §4.A:
 *   → contract types, Cycle definitions, DocTemplates, skill graph seeds
 *
 * This is step 3 of company onboarding, after company creation and
 * before data import. Each pack is country/vertical-specific.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // One door (sign-up walk, round five): the seat this request is made
  // from, and its permissions, rather than a lookup by session email.
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id: companyId } = await params
  const body = await request.json()
  const { pack: packId } = body

  if (!packId || typeof packId !== 'string') {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: `pack is required. Valid packs: ${TEMPLATE_PACK_IDS.join(', ')}`,
          field: 'pack',
        },
      },
      { status: 422 }
    )
  }

  const pack = getTemplatePack(packId)

  if (!pack) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PACK',
          message: `Unknown template pack "${packId}". Valid packs: ${TEMPLATE_PACK_IDS.join(', ')}`,
          field: 'pack',
        },
      },
      { status: 422 }
    )
  }

  // Verify company exists
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, kind: true, templatePack: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  // Guard: template pack already applied
  if (company.templatePack) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_APPLIED',
          message: `Template pack "${company.templatePack}" has already been applied to this company. Packs can only be applied once.`,
        },
      },
      { status: 409 }
    )
  }

  // The caller's seat must be at this company: a pack is set by the
  // company it is for, from a seat there that holds the setup desk.
  const refusal = templatePackRefusal({
    seated: caller.company?.id === companyId,
    permissions: caller.company?.id === companyId ? caller.permissions : [],
    companyName: company.name,
    companyKind: company.kind,
  })
  if (refusal) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: refusal } }, { status: 403 })
  }

  try {
    // One transaction: set templatePack + create DocTemplates + write AutomationLog
    const result = await prisma.$transaction(async (tx) => {
      // 1. Set company.templatePack
      await tx.company.update({
        where: { id: companyId },
        data: { templatePack: pack.id },
      })

      // 2. Create DocTemplate records
      const docTemplates = await Promise.all(
        pack.docTemplates.map((dt) =>
          tx.docTemplate.create({
            data: {
              companyId,
              name: dt.name,
              audience: dt.audience,
              needsSignature: dt.needsSignature,
            },
          })
        )
      )

      // 3. Write AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'TEMPLATE_PACK_APPLIED',
          summary: `Applied ${pack.label} template pack: ${pack.contractTypes.length} contract types, ${pack.cycleDefinitions.length} cycles, ${pack.docTemplates.length} document templates, ${pack.skillSeeds.reduce((n, s) => n + s.skills.length, 0)} skills`,
          reason: 'Template pack selected during company onboarding',
          payload: {
            packId: pack.id,
            contractTypes: pack.contractTypes.map((c) => c.code),
            cycleKinds: pack.cycleDefinitions.map((c) => c.kind),
            docTemplateIds: docTemplates.map((d) => d.id),
            skillCategories: pack.skillSeeds.map((s) => s.category),
          },
          reversible: false,
        },
      })

      return { docTemplates }
    })

    return NextResponse.json({
      data: {
        companyId,
        pack: pack.id,
        applied: {
          contractTypes: pack.contractTypes.length,
          cycleDefinitions: pack.cycleDefinitions.length,
          docTemplates: result.docTemplates.length,
          skillCategories: pack.skillSeeds.length,
          totalSkills: pack.skillSeeds.reduce((n, s) => n + s.skills.length, 0),
        },
        message: `Applied ${pack.label} template pack with ${pack.contractTypes.length} contract types, ${pack.cycleDefinitions.length} cycles, and ${result.docTemplates.length} document templates`,
      },
    })
  } catch (err: any) {
    reportError('Template pack application failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to apply template pack. Please try again.' } },
      { status: 500 }
    )
  }
}
