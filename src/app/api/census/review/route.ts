import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { recordAccess } from '@/lib/access-log'
import { reportError, tellStaff } from '@/lib/alerts'
import { censusPage } from '@/lib/census-page'
import {
  assignmentSays, day, deletionSentence, mayOpenFile, mayReviewCensus, mb,
  type CensusStatus,
} from '@/lib/census'

/**
 * GET/POST /api/census/review — the desk the named person at Etyme works
 * a census from.
 *
 * `docs/census-brief.md`, steps 5 and 6. What is here is the lifecycle:
 * who is in the queue, opening a file, taking it into review, marking it
 * delivered, and recording that a program started. The numbers and the
 * page itself are `etyme-money`'s (`lib/census-page`) and this calls
 * them; the import is `POST /api/census/import`.
 *
 * ── Two gates, not one ───────────────────────────────────────────────
 *
 * Being Etyme staff — an address on `ETYME_STAFF_EMAILS`, which no
 * customer role can grant and no company can revoke — opens the queue
 * and the state of a census. Opening the **bytes of a client's file** is
 * narrower: only the person the census is assigned to, because what the
 * client was told is a name, and "our staff" is not a name.
 *
 * A staff member who should hold it reassigns it to themselves first.
 * That is one more click and it is the click that makes the record true.
 *
 * ── Every read is recorded, including the refusals ───────────────────
 *
 * `recordAccess` rather than the fire-and-forget helper, and awaited
 * before the bytes go out: a route that cannot record a read of a
 * client's file does not hand over the file. The counter on the file
 * moves too, but the counter is for the screen — the record is the
 * `AccessLog` rows.
 *
 * **What is honestly missing.** `AccessLog.subjectId` is a required
 * foreign key to `Person`, and a census has no people in the database
 * until its rows are imported — before that the contractors are lines in
 * a file nobody has parsed, and the client's own contact has no account
 * by design. So a file opened before the import is recorded by the
 * counter and by the staff channel, and not by an `AccessLog` row. After
 * the import, one row per contractor is written on every open and on
 * every refusal. The fix is `subjectId String?` with the census request
 * named instead, and it is a schema request for the architect, written
 * up with this work rather than worked around here.
 *
 * ── The automation rows, and the one that can be written ─────────────
 *
 * Five of the seven census acts cannot write an `AutomationLog` row:
 * `companyId` is a required foreign key and a census has no company
 * until the import creates its sandbox — and the deletion destroys that
 * sandbox, so a row written there would cascade away at exactly the
 * moment somebody audits it. The long note is in
 * `app/api/census/request/route.ts`.
 *
 * `CENSUS_DELETION_CANCELLED` is the exception and is written for real,
 * because a program starting is the one act where the sandbox both
 * exists and survives. It is the one that most needs saying out loud: a
 * deletion promised in writing was called off.
 */

function refuse(status: number, code: string, says: string) {
  return NextResponse.json({ error: { code, message: says } }, { status })
}

const NOT_STAFF =
  'A contractor census is read by the person at Etyme running it. Your seat at your own company ' +
  'does not reach it, and that is the promise made to the client whose file it is.'

/** The people whose details this census describes, once it is imported. */
async function subjectsOf(sandboxCompanyId: string | null): Promise<string[]> {
  if (!sandboxCompanyId) return []
  const rows = await prisma.sellContract.findMany({
    where: { clientCompanyId: sandboxCompanyId },
    select: { personId: true },
    distinct: ['personId'],
  })
  return rows.map((r) => r.personId)
}

// ─────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const reader = { staff: !!caller.staff, email: caller.person.primaryEmail }
  const staff = mayReviewCensus(reader)
  if (!staff.ok) return refuse(403, 'STAFF_ONLY', NOT_STAFF)

  const id = request.nextUrl.searchParams.get('id')
  const fileId = request.nextUrl.searchParams.get('fileId')

  // ── The queue ──────────────────────────────────────────────────────
  if (!id && !fileId) {
    const rows = await prisma.censusRequest.findMany({
      select: {
        id: true, companyName: true, contactName: true, workEmail: true, desk: true,
        option: true, status: true, queuePosition: true, assignedStaffEmail: true,
        agreementAcceptedBy: true, agreementAcceptedAt: true, agreementVersion: true,
        filesReceivedAt: true, receivedFileCount: true, receivedBytes: true,
        sandboxCompanyId: true, deliveredAt: true, deleteBy: true, deletedAt: true,
        deletionCancelledBecause: true, createdAt: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    })
    // No file bytes are read here, so there is nothing to log: the queue
    // says which firms asked, not what is in anybody's file.
    return NextResponse.json({
      data: {
        censuses: rows.map((r) => ({
          ...r,
          yours: (r.assignedStaffEmail ?? '').toLowerCase() === reader.email.toLowerCase(),
          deletionSays: deletionSentence(r.deleteBy),
          sizeSays: r.receivedFileCount === 0 ? 'Nothing sent yet.' : `${r.receivedFileCount} files, ${mb(r.receivedBytes)}.`,
        })),
        says:
          rows.length === 0
            ? 'No client has asked for a census yet.'
            : `${rows.length} census${rows.length === 1 ? '' : 'es'}, oldest first.`,
      },
    })
  }

  // ── One census, or one file out of it ──────────────────────────────
  const where = fileId ? { files: { some: { id: fileId } } } : { id: id! }
  const census = await prisma.censusRequest.findFirst({
    where,
    select: {
      id: true, companyName: true, contactName: true, workEmail: true, desk: true,
      option: true, status: true, queuePosition: true, assignedStaffEmail: true,
      agreementAcceptedBy: true, agreementAcceptedAt: true, agreementVersion: true,
      uploadExpires: true,
      filesReceivedAt: true, receivedFileCount: true, receivedBytes: true,
      sandboxCompanyId: true, deliveredAt: true, gapsNote: true,
      deleteBy: true, deletedAt: true, deletionCancelledBecause: true,
      files: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, uploadedAt: true, readCount: true }, orderBy: { uploadedAt: 'asc' } },
    },
  })
  if (!census) {
    return refuse(404, 'NO_CENSUS', `There is no census here${id ? ` for ${id}` : ''}.`)
  }

  if (!fileId) {
    return NextResponse.json({
      data: {
        ...census,
        yours: (census.assignedStaffEmail ?? '').toLowerCase() === reader.email.toLowerCase(),
        assignedSays: assignmentSays(census.assignedStaffEmail),
        deletionSays: deletionSentence(census.deleteBy),
      },
    })
  }

  // ── The bytes of somebody's file ───────────────────────────────────
  const open = mayOpenFile(reader, {
    assignedStaffEmail: census.assignedStaffEmail,
    status: census.status as CensusStatus,
  })

  const subjects = await subjectsOf(census.sandboxCompanyId)
  const meta = census.files.find((f) => f.id === fileId)!

  if (!open.ok) {
    // A refusal is the interesting one, and the agreement says it is
    // recorded the same way. Where the rows are not imported yet there
    // is no Person to be the subject of it — see the note at the top.
    try {
      await recordAccess(subjects, {
        actorPersonId: realPersonId(caller) ?? undefined,
        action: 'CENSUS_READ',
        allowed: false,
        reason: `Refused ${meta.fileName} on ${census.companyName}'s census: ${open.says}`,
      })
    } catch (err) {
      void reportError('census/review', err)
    }
    return refuse(403, 'NOT_YOURS', open.says)
  }

  const file = await prisma.censusFile.findUniqueOrThrow({
    where: { id: fileId },
    select: { fileName: true, contentType: true, sizeBytes: true, bytes: true },
  })

  // Recorded before it is handed over, not after. If this throws, the
  // file does not go out: an unrecorded read of a client's census is the
  // exact thing the agreement they accepted says cannot happen.
  try {
    await recordAccess(subjects, {
      actorPersonId: realPersonId(caller) ?? undefined,
      action: 'CENSUS_READ',
      reason: `${reader.email} opened ${file.fileName} on ${census.companyName}'s census`,
    })
  } catch (err) {
    void reportError('census/review', err)
    return refuse(500, 'NOT_RECORDED',
      'The read of this file could not be recorded, so the file is not being opened. The client was ' +
      'promised in writing that every open is on the record, and a file opened off the record is ' +
      'worse than a file not opened.')
  }

  await prisma.censusFile.update({ where: { id: fileId }, data: { readCount: { increment: 1 } } })

  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      'content-type': file.contentType || 'application/octet-stream',
      'content-disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
      'cache-control': 'no-store',
      // What the reader has just had recorded against them, said out
      // loud rather than left in a table they would have to go and find.
      'x-etyme-recorded': `${subjects.length} read${subjects.length === 1 ? '' : 's'} logged`,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────
// Acting
// ─────────────────────────────────────────────────────────────────────

const ACTS = ['ASSIGN', 'REVIEW', 'DELIVER', 'PROGRAM_STARTED'] as const
type Act = (typeof ACTS)[number]

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const reader = { staff: !!caller.staff, email: caller.person.primaryEmail }
  if (!mayReviewCensus(reader).ok) return refuse(403, 'STAFF_ONLY', NOT_STAFF)

  const body = await request.json().catch(() => ({})) as {
    id?: string; act?: string; to?: string; because?: string; gapsNote?: string
  }
  const id = (body.id ?? '').trim()
  const act = (body.act ?? '').toUpperCase() as Act

  if (!id) return refuse(422, 'NO_CENSUS', 'Name the census — send { "id": "..." }.')
  if (!(ACTS as readonly string[]).includes(act)) {
    return refuse(422, 'NO_ACT',
      'Say what is being done: ASSIGN it to somebody, take it into REVIEW, mark it DELIVERED, or record ' +
      'that a PROGRAM_STARTED and the deletion is called off.')
  }

  const census = await prisma.censusRequest.findUnique({
    where: { id },
    select: {
      id: true, companyName: true, contactName: true, workEmail: true, status: true,
      assignedStaffEmail: true, agreementAcceptedAt: true, sandboxCompanyId: true,
      deleteBy: true, deletedAt: true, deliveredAt: true,
      receivedFileCount: true, receivedBytes: true,
    },
  })
  if (!census) return refuse(404, 'NO_CENSUS', `There is no census request ${id}.`)

  if (census.status === 'DELETED') {
    return refuse(409, 'DELETED',
      `${census.companyName}'s census was deleted on the day the agreement said it would be. ` +
      'Nothing more happens to it; ask them for a new one and nothing of the old is reused.')
  }

  // ── Assign ─────────────────────────────────────────────────────────
  if (act === 'ASSIGN') {
    const to = (body.to ?? reader.email).trim().toLowerCase()
    if (!to.includes('@')) {
      return refuse(422, 'NO_NAME',
        'Assign it to an address. The client was told a name, so a census with nobody on it is a promise ' +
        'nobody is keeping.')
    }
    await prisma.censusRequest.update({ where: { id }, data: { assignedStaffEmail: to } })
    return NextResponse.json({
      data: { id, assignedStaffEmail: to, says: assignmentSays(to) },
    })
  }

  // ── Into review ────────────────────────────────────────────────────
  if (act === 'REVIEW') {
    if (!census.agreementAcceptedAt) {
      return refuse(409, 'NO_AGREEMENT',
        `Nobody at ${census.companyName} has accepted the census agreement, so their file may not be read. ` +
        'The agreement is what says who at Etyme can see it and the day it is deleted.')
    }
    if (census.receivedFileCount === 0) {
      return refuse(409, 'NOTHING_RECEIVED', `${census.companyName} has sent nothing yet.`)
    }
    await prisma.censusRequest.update({ where: { id }, data: { status: 'IN_REVIEW' } })
    return NextResponse.json({
      data: {
        id, status: 'IN_REVIEW',
        says:
          `In review. ${deletionSentence(census.deleteBy)} That date does not move, so the page goes before it.`,
      },
    })
  }

  // ── Delivered ──────────────────────────────────────────────────────
  if (act === 'DELIVER') {
    const open = mayOpenFile(reader, {
      assignedStaffEmail: census.assignedStaffEmail,
      status: census.status as CensusStatus,
    })
    if (!open.ok) return refuse(403, 'NOT_YOURS', open.says)

    if (!census.sandboxCompanyId) {
      return refuse(409, 'NOT_IMPORTED',
        `${census.companyName}'s rows have not been loaded, so there are no numbers to send. Import their ` +
        'file first.')
    }

    let page
    try {
      page = await censusPage({ requestId: census.id })
    } catch (err) {
      return refuse(409, 'CANNOT_COMPUTE', err instanceof Error ? err.message : String(err))
    }

    // The gaps as the staff person wrote them, or as the generator found
    // them. Never blank: the brief says "what we could not see" is never
    // empty and never hidden, and it is what makes the other four
    // numbers believable.
    const written = (body.gapsNote ?? '').trim()
    const generated = page.gaps.length === 0
      ? 'Every row in the file was complete. There was nothing we could not see.'
      : page.gaps.map((g) => (g.line > 0 ? `Line ${g.line}: ${g.says}` : g.says)).join('\n')
    const gapsNote = written.length > 0 ? `${written}\n\n${generated}` : generated

    const now = new Date()
    await prisma.censusRequest.update({
      where: { id },
      data: { status: 'DELIVERED', deliveredAt: now, pageHtml: page.html, gapsNote },
    })

    // Every contractor whose details went onto a page that left the
    // building. The page is the output; the read is still a read.
    try {
      await recordAccess(await subjectsOf(census.sandboxCompanyId), {
        actorPersonId: realPersonId(caller) ?? undefined,
        action: 'CENSUS_READ',
        reason: `${reader.email} delivered the census page for ${census.companyName}`,
      })
    } catch (err) {
      void reportError('census/review', err)
    }

    return NextResponse.json({
      data: {
        id, status: 'DELIVERED', deliveredAt: now,
        gaps: page.gaps.length,
        gapsNote,
        says:
          `Delivered. ${deletionSentence(census.deleteBy)} ` +
          (census.deleteBy
            ? `The page is stored as it was sent, so on ${day(census.deleteBy)} the numbers go and what ` +
              'they were told stays.'
            : ''),
      },
    })
  }

  // ── A program started, so the deletion is called off ───────────────
  const because = (body.because ?? '').trim()
  if (because.length < 5) {
    return refuse(422, 'NO_REASON',
      'Say why the deletion is being called off, in a sentence. A date given to a client in writing is not ' +
      'moved by a button with nothing behind it.')
  }
  if (!census.deleteBy) {
    return refuse(409, 'NO_DATE',
      `${census.companyName} has sent nothing, so there is no deletion to call off.`)
  }

  const now = new Date()
  await prisma.censusRequest.update({
    where: { id },
    data: { status: 'PROGRAM_STARTED', deletionCancelledBecause: because },
  })

  const summary =
    `${census.companyName} started a program, so the deletion of their census data due on ` +
    `${day(census.deleteBy)} was called off. ${because}`

  // The one census act with a company to write against that survives the
  // act: the sandbox stays precisely because the deletion did not run.
  if (census.sandboxCompanyId) {
    await prisma.automationLog.create({
      data: {
        companyId: census.sandboxCompanyId,
        action: 'CENSUS_DELETION_CANCELLED',
        summary,
        reason:
          'A census that becomes a program keeps its data: the rows are the opening balance of the ' +
          'program rather than something thrown away and asked for again. The census agreement names ' +
          'this as the only thing that changes the deletion date.',
        payload: { requestId: census.id, wasDueOn: census.deleteBy.toISOString(), because, by: reader.email },
        reversible: true,
      },
    })
  }

  void tellStaff(`Census deletion called off: ${census.companyName}`, [
    summary,
    `Called off by ${reader.email}. Their ${census.receivedFileCount} file` +
      `${census.receivedFileCount === 1 ? '' : 's'}, ${mb(census.receivedBytes)}, stay.`,
    'Putting the date back on is one change, and it is the only thing that moves it.',
  ].join('\n\n'))

  return NextResponse.json({
    data: {
      id, status: 'PROGRAM_STARTED', because,
      wasDueOn: census.deleteBy,
      says: summary,
    },
  })
}
