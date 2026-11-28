import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { writeRecordAction } from '@/lib/record-ledger'
import { maySetHomePage, readHomeAsk } from '@/lib/decision-queue'
import { queueSeat, refused, refusalOf } from '../../decision-items/door'

/**
 * GET   /api/settings/home-page — the first screen after sign-in for this firm's seats
 * PATCH /api/settings/home-page — { homePage: 'USUAL' | 'DECISIONS', actingEntityId }; the Owner only
 *
 * Record 107, A1. `Company.homePage` is read by every door that lands a
 * seat (lib/console-home). Each change is a row on the record ledger.
 */

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const company = await prisma.company.findUniqueOrThrow({ where: { id: seat.companyId }, select: { homePage: true } })
  return NextResponse.json({ data: { homePage: company.homePage === 'DECISIONS' ? 'DECISIONS' : 'USUAL', canEdit: maySetHomePage(seat.roleName) === null, entities: seat.entities } })
}

export async function PATCH(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const who = maySetHomePage(seat.roleName)
  if (who) return refused(403, who)
  const read = readHomeAsk(await request.json().catch(() => ({})), seat.entities.length > 1)
  if (!read.ok) return refused(422, read.says)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: seat.companyId }, data: { homePage: read.homePage } })
      await writeRecordAction(tx, {
        companyId: seat.companyId, recordType: 'Company', recordId: seat.companyId, action: 'SETTING_CHANGED',
        summary: read.homePage === 'DECISIONS' ? 'Set the first screen after sign-in to the decision queue.' : 'Set the first screen after sign-in to the usual one.',
        personId: seat.personId, heldAs: seat.heldAs, actingEntityId: read.actingEntityId,
      })
    })
  } catch (e) {
    return refusalOf(e)
  }
  return NextResponse.json({ data: { homePage: read.homePage ?? 'USUAL', message: 'Saved. Everyone at the firm lands there the next time they sign in.' } })
}
