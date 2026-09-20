import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tellStaff } from '@/lib/alerts'
import {
  MAX_CENSUS_BYTES, MAX_FILES, MAX_FILE_BYTES,
  checkBatch, day, deleteByFrom, mayResetDeleteBy, mayUpload, mb, receiptSentence,
  type CensusStatus, type IncomingFile,
} from '@/lib/census'

/**
 * POST /api/census/upload?token=… — the client sends their files.
 *
 * `docs/census-brief.md`, step 4: "Client uploads the template or the
 * files through a signed link that expires", and what they see back is
 * "Received, 4 files, 2.1 MB. Deleted on 20 October unless you start a
 * program."
 *
 * ── The token is the whole credential, and it is on the row ──────────
 *
 * Nobody signs in. The token was minted by `POST /api/census/agree` and
 * not one second earlier, so there is nowhere to send a file to until
 * somebody at the client has accepted the agreement by name — which is
 * what "nothing moves until the agreement is accepted" means in the
 * database rather than on a screen.
 *
 * The expiry lives on the row and not inside a signature, copying the
 * `DocumentPacket` pattern: a census upload has to be revocable the
 * moment legal changes its mind, and a stateless signed link cannot be
 * taken back.
 *
 * ── The limits are stated before somebody spends twenty minutes ──────
 *
 * Five megabytes a file, fifty for the whole census, twenty files, and a
 * CSV, PDF, Excel or Word file — the brief's own list. Every one of
 * those numbers is in `lib/census` beside the reasoning and is repeated
 * on the refusal, because "too large" without the figure is a sentence
 * that makes somebody guess.
 *
 * Per-item collection, not the first failure: somebody dragging in eight
 * files is told which three we cannot open rather than told about one
 * and left to find the rest by trying again. A mixed upload where some
 * files are good is taken — the good ones land and the refusals are
 * listed — because making a client redo the lot to drop one zip is how a
 * census does not arrive at all.
 *
 * ── The day the data goes, set here and never again ──────────────────
 *
 * This is the moment `deleteBy` is decided, because this is the moment
 * the client is told a date. `deleteByFrom` is forty-five days from now
 * and the long reasoning is at the top of `lib/census`. A second upload
 * onto the same census does **not** move it: `mayResetDeleteBy` refuses,
 * in words, and the first date stands. Otherwise a client who sent one
 * more file in week three would have quietly bought themselves three
 * more weeks of us holding their data, which is the opposite of a
 * promise.
 *
 * ── The automation row this act is owed, and does not get ────────────
 *
 * `CENSUS_FILES_RECEIVED` stays in `PLANNED` in `lib/autonomy` for the
 * reason the request route sets out at length: `AutomationLog.companyId`
 * is a required foreign key and a census has no company until its rows
 * are imported, which happens after this. The record of this act is the
 * `CensusRequest` row — the count, the bytes, the hour they arrived and
 * the day they go — and the `CensusFile` rows themselves.
 */

/** Only a census that is still somebody's work may be added to. */
const OPEN: CensusStatus[] = ['REQUESTED', 'AGREED', 'RECEIVED', 'IN_REVIEW']

function refuse(status: number, code: string, says: string) {
  return NextResponse.json({ error: { code, message: says } }, { status })
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)

  // The link carries it; a form field is accepted too, because a client
  // posting from a page that already has the token should not have to
  // put a credential back into a query string.
  const presented =
    request.nextUrl.searchParams.get('token') ??
    (typeof form?.get('token') === 'string' ? (form.get('token') as string) : '') ??
    ''

  if (!presented.trim()) {
    return refuse(401, 'NO_TOKEN',
      'Open the link we emailed when your agreement was accepted. It is the only way in here, ' +
      'on purpose: nobody signs in to send a census.')
  }

  const census = await prisma.censusRequest.findUnique({
    where: { uploadToken: presented.trim() },
    select: {
      id: true, companyName: true, contactName: true, workEmail: true,
      status: true, uploadToken: true, uploadExpires: true,
      agreementAcceptedAt: true, agreementAcceptedBy: true,
      assignedStaffEmail: true,
      filesReceivedAt: true, receivedFileCount: true, receivedBytes: true, deleteBy: true,
    },
  })

  // A token nobody holds and a token that is wrong are the same refusal.
  // Naming which would tell somebody guessing that they were close.
  if (!census) {
    return refuse(403, 'BAD_TOKEN',
      'That link is not one we sent. Use the link in the email your agreement acceptance produced, ' +
      'or ask the person running your census for another.')
  }

  const gate = mayUpload({
    status: census.status as CensusStatus,
    uploadToken: census.uploadToken,
    uploadExpires: census.uploadExpires,
    agreementAcceptedAt: census.agreementAcceptedAt,
    presented: presented.trim(),
    now: new Date(),
  })
  if (!gate.ok) {
    return refuse(census.uploadExpires && new Date() > census.uploadExpires ? 410 : 403, 'CLOSED', gate.says)
  }

  if (!OPEN.includes(census.status as CensusStatus)) {
    return refuse(409, 'CLOSED',
      `${census.companyName}'s census is past the point where anything more can be added to it. ` +
      'Reply to the person running it and they will say what to do.')
  }

  if (!form) {
    return refuse(422, 'NO_FILES',
      'Nothing arrived. Choose the files to send — the filled template, or your own invoices and timesheets.')
  }

  const files = form.getAll('files').concat(form.getAll('file')).filter((f): f is File => f instanceof File)

  const incoming: IncomingFile[] = files.map((f) => ({ name: f.name, type: f.type, size: f.size }))
  const batch = checkBatch(incoming, { count: census.receivedFileCount, bytes: census.receivedBytes })

  if (!batch.ok) {
    return NextResponse.json(
      {
        error: {
          code: 'REFUSED',
          message: batch.says,
          // Every file that could not be taken, with its own sentence.
          refused: batch.refused,
          limits: {
            perFile: mb(MAX_FILE_BYTES),
            perCensus: mb(MAX_CENSUS_BYTES),
            files: MAX_FILES,
          },
        },
      },
      { status: 422 }
    )
  }

  const now = new Date()

  for (const accepted of batch.accepted) {
    const file = files.find((f) => f.name === accepted.name && f.size === accepted.size)!
    const bytes = Buffer.from(await file.arrayBuffer())
    await prisma.censusFile.create({
      data: {
        requestId: census.id,
        fileName: accepted.name,
        contentType: accepted.type || 'application/octet-stream',
        sizeBytes: bytes.byteLength,
        bytes,
      },
    })
  }

  // ── The date, set once ─────────────────────────────────────────────
  //
  // `mayResetDeleteBy` is the guard rather than a bare `if (!deleteBy)`,
  // so the reason a date does not move is written down where somebody
  // changing this reads it, and the same sentence is what a screen says.
  const keep = mayResetDeleteBy(census.deleteBy)
  const deleteBy = keep.ok ? deleteByFrom(now) : census.deleteBy!

  const count = census.receivedFileCount + batch.accepted.length
  const bytes = census.receivedBytes + batch.totalBytes

  await prisma.censusRequest.update({
    where: { id: census.id },
    data: {
      status: 'RECEIVED',
      // The hour the first file landed, kept. A second upload adds to
      // the count and does not restate when the census arrived — the
      // confirmation the client already has counts from the first.
      filesReceivedAt: census.filesReceivedAt ?? now,
      receivedFileCount: count,
      receivedBytes: bytes,
      deleteBy,
    },
  })

  const says = receiptSentence({ count: batch.accepted.length, bytes: batch.totalBytes, deleteBy })

  void tellStaff(
    `Census files received: ${census.companyName}`,
    [
      `${census.contactName} (${census.workEmail}) at ${census.companyName} has sent ` +
        `${batch.accepted.length} file${batch.accepted.length === 1 ? '' : 's'}, ${mb(batch.totalBytes)}.`,
      batch.refused.length > 0
        ? `They were told we could not take ${batch.refused.length}: ${batch.refused.map((r) => r.says).join(' ')}`
        : 'Everything they sent was taken.',
      `On the census now: ${count} file${count === 1 ? '' : 's'}, ${mb(bytes)}.`,
      `The whole lot is deleted on ${day(deleteBy)}, which is the date they have now been given in ` +
        'writing. It does not move, so the page has to go before it.',
      census.assignedStaffEmail
        ? `${census.assignedStaffEmail} runs this one.`
        : 'Nobody is assigned to this census, which is the first thing to fix.',
    ].join('\n\n')
  )

  return NextResponse.json({
    data: {
      id: census.id,
      received: batch.accepted.map((f) => ({ name: f.name, size: f.size })),
      refused: batch.refused,
      fileCount: count,
      bytes,
      deleteBy,
      // The client's own sentence, and the same date the nightly sweep
      // reads, because there is nowhere else to read it from.
      says,
      keptBecause: keep.ok ? null : keep.says,
    },
  })
}
