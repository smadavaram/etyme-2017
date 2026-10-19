import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { claimSignedUpFirms } from '@/lib/company-create'

/**
 * POST /api/staff/backfill-claimed-at — staff only, behind the CRON_SECRET
 * bearer.
 *   {}               how many signed-up firms still read as not on Etyme
 *   { "write": true } mark them as on Etyme
 *
 * The same one-off as `scripts/backfill-claimed-at.ts`, for a deployment
 * nobody holds DATABASE_URL for. Until 2026-10-19 `createCompany` never
 * set `claimedAt`, so every firm that signed up read as a shell. A company
 * where somebody holds a seat with a role is marked as on Etyme from the
 * day it was made; a shell nobody has joined is left alone. The rule is
 * `claimSignedUpFirms` in lib/company-create, so the script, this route
 * and the integration test run the same SQL.
 *
 * Counts by default and changes nothing. With `write: true` it marks them
 * and writes one automation-log row with the count and who ran it, in the
 * same transaction. Safe to run twice: the second run finds nothing and
 * writes nothing.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const write = !!body && typeof body === 'object' && (body as { write?: unknown }).write === true

  try {
    if (!write) {
      const r = await claimSignedUpFirms(prisma, { write: false })
      return NextResponse.json({
        data: {
          write: false,
          found: r.found,
          claimed: 0,
          says: r.found === 0
            ? 'Every firm somebody has a seat at already reads as on Etyme. Nothing to do.'
            : `${r.found} signed-up firm${r.found === 1 ? '' : 's'} read as not on Etyme. Send {"write": true} to put ${r.found === 1 ? 'it' : 'them'} right.`,
        },
      })
    }

    const r = await prisma.$transaction(async (tx) => {
      const out = await claimSignedUpFirms(tx, { write: true })
      if (out.claimed > 0) {
        await tx.automationLog.create({
          data: {
            companyId: null,
            action: 'SIGNED_UP_FIRMS_CLAIMED',
            summary: `${out.claimed} signed-up firm${out.claimed === 1 ? '' : 's'} marked as on Etyme, each from the day it was made`,
            reason: 'Staff ran the one-off with the CRON_SECRET: a firm where somebody holds a seat took possession of itself when it was made, and until 2026-10-19 nothing wrote that down',
            payload: { found: out.found, claimed: out.claimed, by: 'STAFF', via: 'CRON_SECRET', route: '/api/staff/backfill-claimed-at' },
            // Nothing un-marks a firm, and the row does not list which
            // firms were marked, so it cannot be undone from here.
            reversible: false,
          },
        })
      }
      return out
    }, { timeout: 30_000 })

    return NextResponse.json({
      data: {
        write: true,
        found: r.found,
        claimed: r.claimed,
        says: r.claimed === 0
          ? 'Nothing to mark: every firm somebody has a seat at already reads as on Etyme.'
          : `${r.claimed} of ${r.found} signed-up firm${r.found === 1 ? '' : 's'} marked as on Etyme.`,
      },
    })
  } catch (err) {
    await reportError('staff/backfill-claimed-at', err).catch(() => undefined)
    return NextResponse.json({ error: { code: 'FAILED', message: 'The firms could not be marked. Staff have been told. Run it again: it only touches firms still unmarked.' } }, { status: 500 })
  }
}
