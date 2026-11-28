import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { importRefusal } from './door'
import { prisma } from '@/lib/db'
import { mapColumns, parseRow } from '@/lib/import-mapper'

/**
 * GET  /api/imports — whether this seat may import, said in a sentence where it may not
 * POST /api/imports
 *
 * Upload a CSV/JSON file for import. Returns an Import record with
 * an AI-proposed column mapping.
 *
 * BUILD.md: "multipart. Returns Import with proposed mapping."
 *
 * Accepts:
 *   - multipart/form-data with a "file" field (CSV)
 *   - application/json with { kind, rows: [...] } for programmatic use
 *
 * The import is always the caller's own company's (./door).
 *
 * The import flow:
 *   POST /imports → returns Import with proposed mapping
 *   PATCH /imports/:id/mapping → human corrects the mapping
 *   GET /imports/:id/rows → review rows, filter by issue
 *   PATCH /imports/:id/rows/:rowId → fix a row inline
 *   POST /imports/:id/commit → creates real records
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = importRefusal(caller)
  if (refused) return refused
  return NextResponse.json({ data: { mayImport: true, company: { id: caller.company!.id, name: caller.company!.name } } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const refused = importRefusal(caller)
  if (refused) return refused

  // The caller's own company, always. A companyId in the request is not
  // read: round five imported into another company by naming it.
  const companyId = caller.company!.id

  const contentType = request.headers.get('content-type') ?? ''

  let kind: string
  let rows: Record<string, string>[]
  let fileName: string | null = null

  if (contentType.includes('application/json')) {
    const body = await request.json()
    kind = body.kind ?? 'PEOPLE'
    rows = body.rows

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'rows must be a non-empty array', field: 'rows' } },
        { status: 422 }
      )
    }
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    kind = (formData.get('kind') as string) ?? 'PEOPLE'

    if (!file) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'file is required', field: 'file' } },
        { status: 422 }
      )
    }

    fileName = file.name
    const text = await file.text()

    // Parse CSV — simple parser for standard CSVs
    rows = parseCSV(text)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'EMPTY_FILE', message: 'File contains no data rows' } },
        { status: 422 }
      )
    }
  } else {
    return NextResponse.json(
      { error: { code: 'UNSUPPORTED', message: 'Send application/json or multipart/form-data' } },
      { status: 415 }
    )
  }

  const validKinds = ['PEOPLE', 'ASSIGNMENTS', 'CONTACTS']
  if (!validKinds.includes(kind)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Invalid kind. Must be one of: ${validKinds.join(', ')}`, field: 'kind' } },
      { status: 422 }
    )
  }

  // Get column headers from the first row
  const headers = Object.keys(rows[0])

  // AI column mapping (deterministic heuristic for now, Claude API later)
  const mappingResult = mapColumns(headers)

  // Parse each row using the mapping
  const parsedRows = rows.map((row) => {
    const { parsed, issues } = parseRow(row, mappingResult.mappings)
    return { raw: row, parsed, issues }
  })

  const issueCount = parsedRows.filter((r) => r.issues.length > 0).length

  try {
    // Create Import + ImportRows in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const importRecord = await tx.import.create({
        data: {
          companyId,
          kind,
          fileName,
          mapping: mappingResult as any,
          rowCount: rows.length,
          issueCount,
        },
      })

      // Create ImportRow records in batches
      const BATCH = 100
      for (let i = 0; i < parsedRows.length; i += BATCH) {
        const batch = parsedRows.slice(i, i + BATCH)
        await tx.importRow.createMany({
          data: batch.map((r) => ({
            importId: importRecord.id,
            raw: r.raw as any,
            parsed: r.parsed as any,
            issues: r.issues,
          })),
        })
      }

      return importRecord
    })

    return NextResponse.json({
      data: {
        import: {
          id: result.id,
          companyId,
          kind,
          fileName,
          rowCount: rows.length,
          issueCount,
          mapping: mappingResult,
          createdAt: result.createdAt.toISOString(),
        },
        message: `Imported ${rows.length} rows with ${issueCount} issues. Review the mapping and rows before committing.`,
      },
    })
  } catch (err: any) {
    reportError('Import creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Import failed. Please try again.' } },
      { status: 500 }
    )
  }
}

/**
 * Simple CSV parser that handles quoted fields and newlines.
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = splitCSVLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ''
    }
    rows.push(row)
  }

  return rows
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }

  result.push(current.trim())
  return result
}
