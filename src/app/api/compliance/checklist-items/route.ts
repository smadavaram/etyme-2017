import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { CONTRACT_LABELS, PROPOSED_PACK_LEAD_DAYS, valueWords } from '@/lib/agents/checklist-rules'
import { queueSeat, logRefusal, refused } from '../../decision-items/door'
import { mayKeepPapers } from './read'

/**
 * GET /api/compliance/checklist-items   each live placement's contract items: the agreed value beside the line's
 *
 * Record 112, chain 3. Read by whoever may read contracts at the firm. Only
 * the items the contracts agent has listed appear; nothing is invented for
 * a paper that is not there. A drift is said in words with both values.
 * The act that changes an agreed value is POST /api/compliance/checklist-items/:id.
 */
const LIVE = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED'] as const
const KIND_OF: Record<string, 'RATE' | 'TERMS' | 'WINDOW'> = {
  [CONTRACT_LABELS.RATE]: 'RATE', [CONTRACT_LABELS.TERMS]: 'TERMS', [CONTRACT_LABELS.WINDOW]: 'WINDOW',
}

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'assignments.read') && !seat.ownerOrAdmin) {
    await logRefusal(seat, { companyId: seat.companyId }, `Refused the read of ${request.nextUrl.pathname} to a seat that does not look after it.`)
    return refused(403, 'Contract checklists are read by whoever looks after contracts at your firm.')
  }
  const lines = await prisma.sellContract.findMany({
    where: { companyId: seat.companyId, state: { in: [...LIVE] } },
    select: {
      id: true, billCurrency: true, person: { select: { name: true } },
      clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
    },
    orderBy: { id: 'asc' }, take: 500,
  })
  const items = await prisma.checklistItem.findMany({
    where: { companyId: seat.companyId, kind: 'CONTRACT_TERM', ownerType: 'SellContract', ownerId: { in: lines.map((l) => l.id) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const placements = lines.map((l) => {
    const own = items.filter((i) => i.ownerId === l.id)
    return {
      lineId: l.id, person: l.person.name, client: l.endClientCompany?.name ?? l.clientCompany.name, currency: l.billCurrency,
      items: own.map((i) => {
        const agreed = valueWords(i.label, i.agreedValue)
        const actual = valueWords(i.label, i.actualValue)
        const kind = KIND_OF[i.label] ?? null
        return {
          id: i.id, label: i.label, kind, state: i.state, agreed, actual,
          says: i.state === 'DRIFT'
            ? (kind === 'WINDOW' ? `The line’s dates run ${actual}, outside the order’s ${agreed}.` : `The line reads ${actual}. The signed paper agreed ${agreed}.`)
            : i.state === 'WAIVED_WITH_REASON' ? 'Set aside with a reason on the record.' : (kind === 'WINDOW' ? `The line’s dates run inside the order’s ${agreed}.` : `The line and the signed paper agree: ${agreed}.`),
        }
      }),
    }
  }).filter((p) => p.items.length > 0)
  return NextResponse.json({ data: { placements, entities: seat.entities, keepsPapers: mayKeepPapers(seat), mayRecord: hasPermission(seat.caller.permissions, 'assignments.write'), rules: { packLeadDays: PROPOSED_PACK_LEAD_DAYS, confirmed: false } } })
}
