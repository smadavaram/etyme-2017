import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { importRefusal, ownImport } from '../../../door'
import { prisma } from '@/lib/db'
import { parseValue } from '@/lib/import-mapper'

/**
 * PATCH /api/imports/:id/rows/:rowId
 *
 * Fix one row inline. The human can correct individual cells
 * in the review table. Re-parses and re-validates the row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  // One door, then the caller's own company's import only (./door).
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = importRefusal(caller)
  if (refused) return refused

  const { id, rowId } = await params
  const body = await request.json()
  const { updates } = body // { fieldName: newValue, ... }

  if (!updates || typeof updates !== 'object') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'updates object is required', field: 'updates' } },
      { status: 422 }
    )
  }

  // Verify import exists and isn't committed
  const { import: importRecord, error: notOurs } = await ownImport(caller, id)
  if (notOurs) return notOurs

  if (importRecord.committedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_COMMITTED', message: 'This import has been committed and cannot be edited.' } },
      { status: 409 }
    )
  }

  const row = await prisma.importRow.findFirst({
    where: { id: rowId, importId: id },
  })

  if (!row) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Row not found in this import' } },
      { status: 404 }
    )
  }

  // Apply updates to parsed data
  const parsed = { ...(row.parsed as Record<string, any>) }
  const issues: string[] = []

  for (const [field, value] of Object.entries(updates)) {
    const { value: parsedValue, issue } = parseValue(field, String(value))
    if (parsedValue !== null) {
      parsed[field] = parsedValue
    } else {
      delete parsed[field]
    }
    if (issue) {
      issues.push(issue)
    }
  }

  // Re-check required fields
  if (!parsed.name && !parsed.firstName) {
    issues.push('Missing required field: name')
  }
  if (!parsed.email) {
    issues.push('Missing required field: email')
  }

  const hadIssues = (row.issues as string[]).length > 0
  const hasIssues = issues.length > 0

  await prisma.$transaction(async (tx) => {
    await tx.importRow.update({
      where: { id: rowId },
      data: { parsed: parsed as any, issues },
    })

    // Update issue count on the import if status changed
    if (hadIssues !== hasIssues) {
      await tx.import.update({
        where: { id },
        data: {
          issueCount: { increment: hasIssues ? 1 : -1 },
        },
      })
    }
  })

  return NextResponse.json({
    data: {
      row: {
        id: rowId,
        raw: row.raw,
        parsed,
        issues,
      },
      message: issues.length > 0
        ? `Row updated with ${issues.length} remaining issue(s)`
        : 'Row updated — no issues',
    },
  })
}
