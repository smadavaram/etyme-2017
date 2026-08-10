import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getTemplatePack, TEMPLATE_PACK_IDS } from '@/lib/template-packs'

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
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

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

  // TODO: Verify caller has settings.manage permission on this company
  // TODO: Check company exists and hasn't already had a pack applied
  // TODO: In one transaction:
  //   1. Set company.templatePack = packId
  //   2. Create ContractType records (not in schema yet — stored as company config)
  //   3. Create CycleDefinition records (template for cycle generation)
  //   4. Create DocTemplate records
  //   5. Seed skill graph
  //   6. Write AutomationLog

  return NextResponse.json({
    data: {
      companyId,
      pack: pack.id,
      applied: {
        contractTypes: pack.contractTypes.length,
        cycleDefinitions: pack.cycleDefinitions.length,
        docTemplates: pack.docTemplates.length,
        skillCategories: pack.skillSeeds.length,
        totalSkills: pack.skillSeeds.reduce((n, s) => n + s.skills.length, 0),
      },
      message: `Applied ${pack.label} template pack with ${pack.contractTypes.length} contract types, ${pack.cycleDefinitions.length} cycles, and ${pack.docTemplates.length} document templates`,
    },
  })
}
