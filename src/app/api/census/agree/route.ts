import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { tellStaff } from '@/lib/alerts'
import { AGREEMENT_VERSION, agreementSays, day, mayAgree, uploadExpiresFrom } from '@/lib/census'

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
      assignedStaffEmail: true,
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
    return NextResponse.json({
      data: {
        id: row.id,
        acceptedBy: row.agreementAcceptedBy,
        version: row.agreementVersion,
        uploadToken: row.uploadToken,
        uploadExpires: row.uploadExpires,
        says:
          `${row.agreementAcceptedBy} accepted this on behalf of ${row.companyName} already. ` +
          `The same link stands until ${day(row.uploadExpires)}; accepting again does not make a second one.`,
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

  // The automation row this act is owed goes the way `CENSUS_REQUESTED`
  // does, and for the same reason: `AutomationLog.companyId` is required
  // and this census has no company yet. The acceptance itself is on the
  // row — who, when, and which edition — which is what an audit asks
  // for. See the long note in `app/api/census/request/route.ts`.

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

  return NextResponse.json({
    data: {
      id: row.id,
      acceptedBy,
      version: AGREEMENT_VERSION,
      uploadToken: token,
      uploadExpires: expires,
      says: agreementSays(acceptedBy, AGREEMENT_VERSION, expires),
    },
  })
}
