import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logBulkAccess } from '@/lib/access-log'
import { importCensusCsv, looksLikeCsv, type CensusGap, type CensusImportResult } from '@/lib/census-import'

/**
 * POST /api/census/import — load a client's own file into their sandbox.
 *
 * `docs/census-brief.md`, step 5: "Etyme staff creates a private client
 * sandbox for them, imports the rows as contracts and placements, runs
 * the four numbers. What the client sees: nothing yet."
 *
 * ── Who may press it ─────────────────────────────────────────────────
 *
 * Etyme staff, and nobody else. Not a permission — `caller.staff` is
 * read off `ETYME_STAFF_EMAILS` and no customer role can grant it, which
 * is the point: a customer who could grant themselves this could read
 * another customer's census. A signed-in customer with every permission
 * their company has is refused here in a sentence.
 *
 * ── Every read is logged ─────────────────────────────────────────────
 *
 * The census agreement tells the client that a named person reads their
 * file and that every read is recorded. One `AccessLog` row per
 * contractor the file described, naming the file and the request.
 *
 * The action is `CONTRACT_VIEW` — "viewed a person's contract details",
 * which is exactly what was read — because `AccessAction` is a closed
 * union in `lib/access-log`, which is regulatory's file. `CENSUS_READ`
 * is a one-line addition there and is asked for with this work; the
 * moment it exists this constant changes and nothing else does.
 */
const CENSUS_READ = 'CONTRACT_VIEW' as const

function refuse(status: number, code: string, says: string) {
  return NextResponse.json({ error: { code, message: says } }, { status })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.staff) {
    return refuse(403, 'STAFF_ONLY',
      'A contractor census is read by a named person at Etyme and by nobody else. That is what the client ' +
      'was promised in writing when they sent their file, so this is not something a seat at a company can open.')
  }

  const body = await request.json().catch(() => null) as { requestId?: string; fileId?: string } | null
  const requestId = body?.requestId
  if (!requestId) {
    return refuse(400, 'NO_REQUEST',
      'Name the census request to import — send { "requestId": "..." }. There is nothing to load without one.')
  }

  const census = await prisma.censusRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, companyName: true, contactName: true, agreementAcceptedAt: true,
      assignedStaffEmail: true, sandboxCompanyId: true,
      files: {
        where: body?.fileId ? { id: body.fileId } : undefined,
        select: { id: true, fileName: true, contentType: true, sizeBytes: true, bytes: true },
        orderBy: { uploadedAt: 'asc' },
      },
    },
  })
  if (!census) {
    return refuse(404, 'NO_CENSUS', `There is no census request ${requestId}.`)
  }

  // Nothing moves until somebody at the client has accepted the
  // agreement by name. The upload link is not minted before that, so a
  // file should not exist here at all — and if one does, reading it is
  // the exact thing the agreement exists to prevent.
  if (!census.agreementAcceptedAt) {
    return refuse(409, 'NO_AGREEMENT',
      `Nobody at ${census.companyName} has accepted the census agreement yet, so their file may not be opened. ` +
      'The agreement is what says who at Etyme can see it and the day it is deleted.')
  }

  if (census.files.length === 0) {
    return refuse(409, 'NOTHING_RECEIVED',
      `${census.companyName} has sent nothing yet, so there is nothing to import.`)
  }

  const results: CensusImportResult[] = []
  const notImported: { fileName: string; says: string }[] = []
  const gaps: CensusGap[] = []

  for (const file of census.files) {
    if (!looksLikeCsv(file.fileName, file.contentType)) {
      const says =
        `${file.fileName} was received and is read by a person, not imported. Nothing here reads anything but a ` +
        'filled CSV template, so whatever it shows belongs in the notes on the page rather than in the numbers.'
      notImported.push({ fileName: file.fileName, says })
      gaps.push({ line: 0, reference: null, kind: 'NOT_A_SPREADSHEET', stopsTheRow: true, says })
      continue
    }

    const text = Buffer.from(file.bytes).toString('utf8')
    const result = await importCensusCsv({ requestId: census.id, fileName: file.fileName, text })
    results.push(result)
    gaps.push(...result.gaps)

    await prisma.censusFile.update({
      where: { id: file.id },
      data: { readCount: { increment: 1 } },
    })
  }

  const sandboxCompanyId = results[results.length - 1]?.sandboxCompanyId ?? census.sandboxCompanyId

  // One row per contractor whose details were read out of the file.
  if (sandboxCompanyId) {
    const people = await prisma.sellContract.findMany({
      where: { clientCompanyId: sandboxCompanyId },
      select: { personId: true },
      distinct: ['personId'],
    })
    logBulkAccess(people.map((p) => p.personId), {
      actorPersonId: realPersonId(caller) ?? undefined,
      action: CENSUS_READ,
      reason:
        `Contractor census for ${census.companyName} — ` +
        `${census.files.map((f) => f.fileName).join(', ')}`,
    })
  }

  const imported = results.reduce((n, r) => n + r.imported, 0)
  const lines = results.reduce((n, r) => n + r.lines, 0)

  return NextResponse.json({
    data: {
      requestId: census.id,
      sandboxCompanyId,
      imported,
      lines,
      suppliers: results.flatMap((r) => r.suppliers),
      files: results.map((r) => ({ fileName: r.fileName, imported: r.imported, lines: r.lines, says: r.says })),
      notImported,
      // Per row, in the file's own line numbers, so the staff person can
      // read the page against the spreadsheet in front of them.
      rows: results.flatMap((r) => r.rows.map((row) => ({ file: r.fileName, ...row }))),
      gaps,
      says:
        imported === 0 && lines === 0
          ? `Nothing in ${census.companyName}'s file could be imported. Every reason is in the gaps.`
          : `${imported} of ${lines} rows loaded for ${census.companyName}` +
            (gaps.length > 0 ? `, with ${gaps.length} gaps to put on the page.` : ', with no gaps at all.'),
    },
  })
}
