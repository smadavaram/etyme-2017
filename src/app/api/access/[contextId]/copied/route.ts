import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { waitingSeatFor } from '../waiting-seat'

/**
 * POST /api/access/:contextId/copied
 *
 * Copy invitation happens in the browser, so the record of who copied
 * which seat's invitation, and when, is written here (founder, 2026-11-12).
 * Nothing is returned but a word: the copied text holds no link that takes
 * the seat, and nothing secret is ever written here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ contextId: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { contextId } = await params

  const { seat, refused } = await waitingSeatFor(caller, contextId, 'Copying an invitation')
  if (refused) return refused

  await prisma.automationLog.create({
    data: {
      companyId: seat.company.id,
      action: 'INVITATION_COPIED',
      summary: `${caller.person.name} copied the invitation for ${seat.person.primaryEmail}`,
      reason: 'Copied from Users & permissions, to send it by hand. The copy holds no one-time link.',
      payload: { contextId: seat.id, email: seat.person.primaryEmail, act: 'COPIED' },
      reversible: false,
    },
  })
  return NextResponse.json({ data: { says: 'Copied.' } })
}
