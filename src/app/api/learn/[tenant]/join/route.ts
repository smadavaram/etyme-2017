import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { learnTenant } from '@/lib/training/learn-read'

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }

/**
 * POST /api/learn/:tenant/join
 *
 * The join path at completion: a worker who finished a track says she
 * would like the firm to ask her onto its bench. This is her yes to being
 * asked and nothing more. It writes a line on the firm's ledger; it never
 * creates a bench listing, a seat or a second record. The firm then asks
 * her the usual way (record 120) and her own yes there is the consent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json(NOT_FOUND, { status: 404 })
  const done = await prisma.enrollment.findFirst({ where: { personId: caller.person.id, companyId: t.id, status: 'COMPLETED' }, select: { id: true } })
  if (!done) return NextResponse.json({ error: { code: 'NOT_FINISHED', message: 'Finish a track first, then you can ask to join.' } }, { status: 409 })
  const already = await prisma.automationLog.findFirst({ where: { companyId: t.id, action: 'LEARNER_ASKED_TO_JOIN', payload: { path: ['personId'], equals: caller.person.id } }, select: { id: true } })
  if (!already) {
    await prisma.automationLog.create({
      data: {
        companyId: t.id, action: 'LEARNER_ASKED_TO_JOIN',
        summary: `${caller.person.name} finished a track and asked ${t.name} to ask her onto its bench.`,
        reason: 'Her own yes to being asked. No listing, seat or record is made until she answers the bench ask itself.',
        payload: { personId: caller.person.id, enrollmentId: done.id }, reversible: false,
      },
    })
  }
  return NextResponse.json({ data: { says: `${t.name} has your note. Nothing changes until you answer its ask yourself.` } }, { status: already ? 200 : 201 })
}
