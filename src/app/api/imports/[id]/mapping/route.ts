import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { parseRow } from '@/lib/import-mapper'
import type { ColumnMapping } from '@/lib/import-mapper'

/**
 * PATCH /api/imports/:id/mapping
 *
 * Human corrects the AI column mapping.
 * After the mapping is updated, all rows are re-parsed with the new mapping.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params
  const body = await request.json()
  const { mappings } = body

  if (!Array.isArray(mappings)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'mappings must be an array', field: 'mappings' } },
      { status: 422 }
    )
  }

  const importRecord = await prisma.import.findUnique({
    where: { id },
    select: { id: true, committedAt: true },
  })

  if (!importRecord) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Import not found' } },
      { status: 404 }
    )
  }

  if (importRecord.committedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_COMMITTED', message: 'This import has already been committed. Mapping cannot be changed.' } },
      { status: 409 }
    )
  }

  // Update the mapping — human corrections override AI confidence
  const correctedMappings: ColumnMapping[] = mappings.map((m: any) => ({
    sourceColumn: m.sourceColumn,
    targetField: m.targetField ?? null,
    confidence: m.targetField ? 1.0 : 0,
    flagged: false, // human-corrected = not flagged
  }))

  const newMapping = {
    mappings: correctedMappings,
    unmapped: correctedMappings.filter((m) => !m.targetField).map((m) => m.sourceColumn),
    warnings: [],
  }

  // Re-parse all rows with the corrected mapping
  const rows = await prisma.importRow.findMany({
    where: { importId: id },
    select: { id: true, raw: true },
  })

  let issueCount = 0
  await prisma.$transaction(async (tx) => {
    // Update the mapping on the import
    await tx.import.update({
      where: { id },
      data: { mapping: newMapping as any },
    })

    // Re-parse each row
    for (const row of rows) {
      const { parsed, issues } = parseRow(row.raw as Record<string, string>, correctedMappings)
      if (issues.length > 0) issueCount++
      await tx.importRow.update({
        where: { id: row.id },
        data: { parsed: parsed as any, issues },
      })
    }

    // Update issue count
    await tx.import.update({
      where: { id },
      data: { issueCount },
    })
  })

  return NextResponse.json({
    data: {
      importId: id,
      mapping: newMapping,
      issueCount,
      message: `Mapping updated. ${issueCount} rows have issues.`,
    },
  })
}
