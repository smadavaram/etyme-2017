import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/cron/end-contracts
 *
 * A contract whose last day has passed is over. Nothing said so: a
 * contract went IN_PROGRESS on activation and stayed there for ever,
 * because the only writers of ENDED were the seed files. So the
 * break-in-service rule, which looks for the most recent ended contract,
 * could never fire for a real person; the tenure ledger counted days
 * past the end date; and the rolloff board found contracts "ending soon"
 * that had ended.
 *
 * Runs in the daily job. Both sides of the trade, because a buy contract
 * ends with the sell contract it supplies. One automation-log line per
 * company, naming the people, so the vendor's morning reads "Tariq's
 * contract at Nike ended yesterday" rather than nothing.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  try {
    const [sells, buys] = await Promise.all([
      prisma.sellContract.findMany({
        where: { state: 'IN_PROGRESS', endDate: { lt: today } },
        select: {
          id: true, companyId: true, endDate: true,
          person: { select: { name: true } },
          clientCompany: { select: { name: true } },
        },
      }),
      prisma.buyContract.findMany({
        where: { state: 'IN_PROGRESS', endDate: { lt: today } },
        select: { id: true, companyId: true, endDate: true },
      }),
    ])

    if (sells.length === 0 && buys.length === 0) {
      return NextResponse.json({ data: { ended: 0, says: 'No contract reached its last day.' } })
    }

    await prisma.$transaction(async (tx) => {
      if (sells.length) {
        await tx.sellContract.updateMany({
          where: { id: { in: sells.map((c) => c.id) } },
          data: { state: 'ENDED' },
        })
      }
      if (buys.length) {
        await tx.buyContract.updateMany({
          where: { id: { in: buys.map((c) => c.id) } },
          data: { state: 'ENDED' },
        })
      }

      // One line per vendor, in the vendor's words.
      const byCompany = new Map<string, string[]>()
      for (const c of sells) {
        const line = `${c.person.name} at ${c.clientCompany.name}, last day ${c.endDate!.toISOString().slice(0, 10)}`
        byCompany.set(c.companyId, [...(byCompany.get(c.companyId) ?? []), line])
      }
      for (const [companyId, lines] of byCompany) {
        await tx.automationLog.create({
          data: {
            companyId,
            action: 'CONTRACTS_ENDED',
            summary: lines.length === 1 ? `${lines[0]} — contract ended.` : `${lines.length} contracts ended: ${lines.join('; ')}.`,
            reason: 'The last day on the contract has passed. A contract that is over is marked over, so tenure, breaks in service and the rolloff board read the truth.',
            payload: { sellContractIds: sells.filter((c) => c.companyId === companyId).map((c) => c.id) },
            reversible: true,
          },
        })
      }
    })

    return NextResponse.json({
      data: {
        ended: sells.length + buys.length,
        sell: sells.length,
        buy: buys.length,
        says: `${sells.length} sell contract${sells.length === 1 ? '' : 's'} and ${buys.length} buy contract${buys.length === 1 ? '' : 's'} reached their last day and are ended.`,
      },
    })
  } catch (err) {
    void reportError('cron/end-contracts', err)
    return NextResponse.json(
      { error: { code: 'FAILED', message: 'Ending contracts failed; the failure has been recorded.' } },
      { status: 500 }
    )
  }
}
