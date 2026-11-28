import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { tellStaff } from '@/lib/alerts'
import { AGREEMENT_VERSION, agreementSays, day, mayAgree, uploadExpiresFrom, type Option } from '@/lib/census'
import { censusAgreedNotice } from '@/lib/notify/census'
import { censusUploadUrl, sendCensusLetter } from '@/lib/data-request'

/**
 * POST /api/census/agree — somebody at the client accepts the one-page
 * census agreement, by name, and only then does a link to send files
 * through exist.
 *
 * ── Why the token is minted here and nowhere else ────────────────────
 *
 * A token that exists before the agreement is a way around the
 * agreement. `CensusRequest.uploadToken` is null until this route runs,
 * so there is nowhere to send a file to until somebody has accepted —
 * which is what "nothing moves until somebody at the client has accepted
 * by name" means in the database rather than on a screen.
 *
 * The expiry is on the row rather than inside a signature, copying the
 * `DocumentPacket` pattern and not the stateless signed link: a census
 * upload has to be revocable the moment legal changes its mind, and a
 * signature cannot be taken back.
 *
 * ── Accepting twice ──────────────────────────────────────────────────
 *
 * Not an error. Legal re-reads the page and presses the button again,
 * and somebody who has lost the email comes back for the link. It does
 * not mint a second token and does not restart the fortnight — the
 * existing link is handed back — because two live links to one census is
 * one more than anybody can revoke.
 *
 * ── Who is allowed to do this ────────────────────────────────────────
 *
 * Nobody signs in, so the credential is the census id, which is a cuid
 * nobody can guess, exactly as a packet link is. Where the caller also
 * sends the work address it has to match the one on the row: it costs
 * nothing and it means a forwarded id alone is not enough.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const acceptedBy = typeof body?.acceptedBy === 'string' ? body.acceptedBy.trim() : ''
  const workEmail = typeof body?.workEmail === 'string' ? body.workEmail.trim().toLowerCase() : ''

  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Open the link in your confirmation — it names the census this is for.' } },
      { status: 422 }
    )
  }

  const row = await prisma.censusRequest.findUnique({
    where: { id },
    select: {
      id: true, companyName: true, contactName: true, workEmail: true, status: true,
      assignedStaffEmail: true, option: true,
      agreementAcceptedBy: true, agreementAcceptedAt: true, agreementVersion: true,
      uploadToken: true, uploadExpires: true,
    },
  })
  if (!row) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That is not a census we have. Ask for one and the link comes back by email.' } },
      { status: 404 }
    )
  }
  if (workEmail && workEmail !== row.workEmail) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'That address is not the one this census was asked for from. Use the link in the confirmation that was sent to it.',
        },
      },
      { status: 403 }
    )
  }

  const verdict = mayAgree({ acceptedBy, status: row.status as never })
  if (!verdict.ok) {
    const validation = acceptedBy.length < 2
    return NextResponse.json(
      { error: { code: validation ? 'VALIDATION' : 'CONFLICT', message: verdict.says } },
      { status: validation ? 422 : 409 }
    )
  }

  // Already accepted: hand back the link that exists rather than making
  // a second one nobody can revoke.
  if (row.uploadToken && row.uploadExpires && row.agreementAcceptedBy) {
    // And write again, with the same link.
    //
    // This is the hole in the funnel, not a duplicate: the four steps
    // live in one page's own state, so somebody who closes the tab
    // between accepting and uploading has no way back in. Pressing
    // accept a second time is a client's act — legal re-reads it, or the
    // program manager who actually holds the files goes looking for the
    // link — and answering an act with a letter is not a sequence. It is
    // the same token and the same expiry, because two live links to one
    // census is one more than anybody can revoke.
    const again = await sendCensusLetter(censusAgreedNotice({
      contact: { name: row.contactName, workEmail: row.workEmail },
      companyName: row.companyName,
      assignedTo: row.assignedStaffEmail,
      acceptedBy: row.agreementAcceptedBy,
      agreementVersion: row.agreementVersion ?? AGREEMENT_VERSION,
      uploadExpires: row.uploadExpires,
      uploadUrl: censusUploadUrl(row.uploadToken),
      option: row.option as Option,
      templateUrl: null,
    }))

    return NextResponse.json({
      data: {
        id: row.id,
        acceptedBy: row.agreementAcceptedBy,
        version: row.agreementVersion,
        uploadToken: row.uploadToken,
        uploadExpires: row.uploadExpires,
        wrote: { to: again.to, subject: again.subject, sent: again.sent },
        says:
          `${row.agreementAcceptedBy} accepted this on behalf of ${row.companyName} already. ` +
          `The same link stands until ${day(row.uploadExpires)}; accepting again does not make a second one, ` +
          `and it has been emailed to ${row.workEmail} again.`,
      },
    })
  }

  const now = new Date()
  // Long and random, and the only credential on the upload. 32 bytes of
  // hex rather than a cuid: this one is handed to somebody outside.
  const token = randomBytes(32).toString('hex')
  const expires = uploadExpiresFrom(now)

  await prisma.censusRequest.update({
    where: { id: row.id },
    data: {
      status: 'AGREED',
      agreementAcceptedBy: acceptedBy,
      agreementAcceptedAt: now,
      agreementVersion: AGREEMENT_VERSION,
      uploadToken: token,
      uploadExpires: expires,
    },
  })

  // The automation row goes the way `CENSUS_REQUESTED` does and against
  // no company, for the reason set out at length in
  // `app/api/census/request/route.ts`: this census has no tenant yet.
  // The acceptance itself is on the row — who, when, which edition —
  // and this is the sentence beside it.
  await prisma.automationLog.create({
    data: {
      companyId: null,
      action: 'CENSUS_AGREED',
      summary:
        `${acceptedBy} at ${row.companyName} accepted the ${AGREEMENT_VERSION} edition of the ` +
        `census agreement, and the upload link was created at that moment. It runs out on ${day(expires)}.`,
      reason:
        'Nothing moves until somebody at the client has accepted by name. The token is minted here ' +
        'and nowhere else, so there is nowhere to send a file to until they have — which is what that ' +
        'promise means in the database rather than on a screen.',
      payload: {
        requestId: row.id,
        acceptedBy,
        version: AGREEMENT_VERSION,
        uploadExpires: expires.toISOString(),
      },
      // The link can be revoked and the acceptance withdrawn; nothing
      // has been sent to us yet.
      reversible: true,
    },
  })

  void tellStaff(
    `Census agreement accepted: ${row.companyName}`,
    [
      `${acceptedBy} at ${row.companyName} has accepted the ${AGREEMENT_VERSION} edition of the census agreement.`,
      `The upload link is open until ${day(expires)}. Nothing has arrived yet.`,
      row.assignedStaffEmail
        ? `${row.assignedStaffEmail} runs this one.`
        : 'Nobody is assigned to this census, which is the first thing to fix.',
    ].join('\n\n')
  )

  // The link, to the address the census was asked for from.
  //
  // Legal accepts and the program manager uploads, often two different
  // people; the token came back in JSON to whoever posted the form and
  // reached nobody else. This is how it gets to the person holding the
  // files, and it is the only letter in the census that carries a
  // credential.
  const wrote = await sendCensusLetter(censusAgreedNotice({
    contact: { name: row.contactName, workEmail: row.workEmail },
    companyName: row.companyName,
    assignedTo: row.assignedStaffEmail,
    acceptedBy,
    agreementVersion: AGREEMENT_VERSION,
    uploadExpires: expires,
    uploadUrl: censusUploadUrl(token),
    option: row.option as Option,
    // No template file is served anywhere yet — `TEMPLATE_CSV` is a
    // constant the importer reads and no route hands it out. A link to
    // it would be a link to nothing, so the letter describes the columns
    // instead, which it does anyway.
    templateUrl: null,
  }))

  return NextResponse.json({
    data: {
      id: row.id,
      acceptedBy,
      version: AGREEMENT_VERSION,
      uploadToken: token,
      uploadExpires: expires,
      wrote: { to: wrote.to, subject: wrote.subject, sent: wrote.sent },
      says: agreementSays(acceptedBy, AGREEMENT_VERSION, expires),
    },
  })
}
