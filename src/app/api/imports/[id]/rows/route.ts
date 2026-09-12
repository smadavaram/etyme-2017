import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/imports/:id/rows
 *
 * Paginated, searchable, filter by issue. The dense review table
 * that lets a human scan hundreds of rows quickly.
 */
export async function GET(
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
  const url = request.nextUrl
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
  const filter = url.searchParams.get('filter') // "issues" | "clean" | null
  const q = url.searchParams.get('q')?.toLowerCase()

  const importRecord = await prisma.import.findUnique({
    where: { id },
    select: { id: true, rowCount: true, issueCount: true, committedAt: true, mapping: true },
  })

  if (!importRecord) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Import not found' } },
      { status: 404 }
    )
  }

  // Build where clause
  const where: any = { importId: id }

  // We can't easily filter on array length with Prisma,
  // so we fetch and filter in memory for the issues filter.
  // For large datasets this would move to raw SQL.

  const allRows = await prisma.importRow.findMany({
    where,
    orderBy: { id: 'asc' },
  })

  let filtered = allRows

  // Filter by issue status
  if (filter === 'issues') {
    filtered = filtered.filter((r) => (r.issues as string[]).length > 0)
  } else if (filter === 'clean') {
    filtered = filtered.filter((r) => (r.issues as string[]).length === 0)
  }

  // Search across raw values
  if (q) {
    filtered = filtered.filter((r) => {
      const raw = r.raw as Record<string, any>
      return Object.values(raw).some((v) => String(v).toLowerCase().includes(q))
    })
  }

  const total = filtered.length
  const start = (page - 1) * limit
  const pageRows = filtered.slice(start, start + limit)

  return NextResponse.json({
    data: {
      rows: pageRows.map((r) => ({
        id: r.id,
        raw: r.raw,
        parsed: r.parsed,
        issues: r.issues,
        createdId: r.createdId,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalRows: importRecord.rowCount,
        issueCount: importRecord.issueCount,
        committed: !!importRecord.committedAt,
      },
    },
  })
}
