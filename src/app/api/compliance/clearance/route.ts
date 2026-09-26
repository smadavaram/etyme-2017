import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logAccess } from '@/lib/access-log'
import { askForClearance, clearanceQueue } from './ask'

/**
 * GET  /api/compliance/clearance — the placements HR has to clear
 * POST /api/compliance/clearance — ask for the papers on one of them
 *
 * HR's own desk, which did not exist. The contract manager papers a
 * placement and HR clears the person, and until now the only moment
 * anybody ran the clearance was when somebody pressed activate — so the
 * desk that must clear a start was never told a start was coming.
 *
 * The verdict here is the one activation refuses with, run early. Not a
 * second opinion written for a screen: `says` and `fix` are the
 * clearance's own strings, so the preview and the refusal cannot drift.
 */

const NEEDS =
  'Clearing somebody to start is HR’s work here. Ask whoever runs Users & permissions for the HR seat, ' +
  'or have them raise it.'

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Clearance belongs to a company. Sign in at the firm that places the person.' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: NEEDS } }, { status: 403 })
  }

  const rows = await clearanceQueue(caller.company.id)

  return NextResponse.json({
    data: {
      rows,
      blocked: rows.filter((r) => r.outcome === 'BLOCK').length,
      chasing: rows.filter((r) => r.outcome === 'WARN').length,
      says:
        rows.length === 0
          ? 'Nothing is waiting on you. Every placement that has not started yet has its paperwork in order.'
          : rows.filter((r) => r.outcome === 'BLOCK').length > 0
            ? `${rows.filter((r) => r.outcome === 'BLOCK').length} of ${rows.length} cannot start until something is on file.`
            : `${rows.length} placement(s) are still waiting on paperwork.`,
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Clearance belongs to a company. Sign in at the firm that places the person.' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: NEEDS } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const contractId = String(body.contractId ?? '').trim()
  if (!contractId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which placement to ask for the papers on.', field: 'contractId' } },
      { status: 422 }
    )
  }

  // A stranger to the placement cannot ask its worker for anything, and
  // the refusal says whose it is rather than pretending it is missing.
  const contract = await prisma.sellContract.findUnique({
    where: { id: contractId },
    select: { id: true, companyId: true, company: { select: { name: true } }, personId: true },
  })
  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'There is no placement with that id.' } },
      { status: 404 }
    )
  }
  if (contract.companyId !== caller.company.id) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `That placement belongs to ${contract.company?.name ?? 'another firm'}. ` +
            `Only the firm that employs or places somebody asks them for their start paperwork.`,
        },
      },
      { status: 403 }
    )
  }

  // Reading another person's compliance standing leaves a trail, refusals
  // included — the same rule every other read of a person obeys.
  void logAccess({
    subjectId: contract.personId,
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company.id,
    action: 'COMPLIANCE_CHECK',
    allowed: true,
    reason: 'Clearing a placement before the start date',
  })

  const result = await askForClearance({ contractId, actorPersonId: caller.person.id })

  if (!('preview' in result) || result.preview === null) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: result.says } }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      contractId: result.contractId,
      packetId: result.packetId,
      alreadyAsked: result.alreadyAsked,
      told: result.told.length,
      outcome: result.preview.outcome,
      headline: result.preview.headline,
      // The clearance's own words, so this page and the activate refusal
      // say the same thing about the same person on the same day.
      says: result.preview.says,
      fix: result.preview.fix,
      outstanding: result.preview.outstanding,
      askedOfPerson: result.preview.askOfPerson.map((a) => ({ label: a.label, weight: a.weight })),
      oursToProduce: result.preview.askOfFirm.map((a) => ({ label: a.label, weight: a.weight })),
      ourCover: result.preview.coverOutstanding.map((c) => ({ label: c.label, says: c.says })),
      message: result.says,
    },
  })
}
