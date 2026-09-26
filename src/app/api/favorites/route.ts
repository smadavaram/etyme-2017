import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'

/**
 * GET  /api/favorites                       — the people and firms this company would take again
 * POST /api/favorites { targetType, targetId, on }  — mark or unmark one
 *
 * The opposite of a block, and just as private: Nike's star on a person
 * is Nike's, and no supplier and no other client can read it.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Favorites')
  if (notStaff) return notStaff
  const rows = await prisma.favorite.findMany({
    where: { companyId: caller.company!.id },
    select: { targetType: true, targetId: true, createdAt: true, note: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ data: { favorites: rows } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Favorites')
  if (notStaff) return notStaff
  const body = await request.json().catch(() => ({}))
  const targetType = body?.targetType === 'COMPANY' ? 'COMPANY' : body?.targetType === 'PERSON' ? 'PERSON' : null
  const targetId = typeof body?.targetId === 'string' ? body.targetId : null
  if (!targetType || !targetId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say who: a person or a firm, by id.' } }, { status: 422 })
  }
  const companyId = caller.company!.id
  const key = { companyId_targetType_targetId: { companyId, targetType, targetId } }
  const on = body?.on !== false
  if (on) {
    await prisma.favorite.upsert({
      where: key,
      create: { companyId, targetType, targetId, byId: caller.person.id, note: typeof body?.note === 'string' ? body.note : null },
      update: {},
    })
  } else {
    await prisma.favorite.deleteMany({ where: { companyId, targetType, targetId } })
  }
  return NextResponse.json({ data: { favorite: on, says: on ? 'Marked as one to take again.' : 'Unmarked.' } })
}
