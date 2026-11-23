import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { PROPOSED_ACCESS_FILE_WORKING_DAYS } from '@/lib/agents/checklist-rules'
import { queueSeat, logRefusal, refused } from '../../decision-items/door'

/**
 * GET /api/compliance/access-files   the firm's public access files: the day each is due and whether a person approved it
 *
 * Record 112, chain 6. Read by whoever looks after paperwork. A file is
 * tracked by the compliance watch from a petition's filing day; approving
 * it is PATCH /api/compliance/access-files/:id. Etyme publishes nothing.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'consultants.write') && !seat.ownerOrAdmin) {
    await logRefusal(seat, { companyId: seat.companyId }, `Refused the read of ${request.nextUrl.pathname} to a seat that does not look after it.`)
    return refused(403, 'Public access files are read by whoever looks after paperwork at your firm.')
  }
  const files = await prisma.publicAccessFile.findMany({ where: { companyId: seat.companyId }, include: { petition: { select: { personId: true, kind: true, filedOn: true } } }, orderBy: { readyBy: 'desc' }, take: 200 })
  const people = await prisma.person.findMany({ where: { id: { in: files.map((f) => f.petition.personId) } }, select: { id: true, name: true } })
  const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null
  return NextResponse.json({
    data: {
      files: files.map((f) => ({
        id: f.id, person: people.find((p) => p.id === f.petition.personId)?.name ?? null, kind: f.petition.kind, filedOn: day(f.petition.filedOn),
        readyBy: day(f.readyBy), readyOn: day(f.readyOn), approved: f.approvedById !== null,
      })),
      entities: seat.entities,
      rules: { accessFileWorkingDays: PROPOSED_ACCESS_FILE_WORKING_DAYS, confirmed: false },
      mayApprove: hasPermission(seat.caller.permissions, 'consultants.write'),
    },
  })
}
