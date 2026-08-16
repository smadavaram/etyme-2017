import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/cron/expire-invitations
 *
 * BUILD.md §5: "expireInvitations — expire old unanswered invitations"
 *
 * Runs nightly via Vercel cron. Finds RequirementInvitations with
 * expiresAt in the past that are still SENT, and marks them EXPIRED.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  try {
    // Find expired invitations still in SENT status
    const expired = await prisma.requirementInvitation.findMany({
      where: {
        status: 'SENT',
        expiresAt: { lte: now },
      },
      include: {
        requirement: { select: { id: true, title: true, companyId: true } },
        toCompany: { select: { id: true, name: true } },
      },
    })

    if (expired.length === 0) {
      return NextResponse.json({
        data: { scanned: true, expired: 0, message: 'No invitations to expire' },
      })
    }

    // Batch update
    const result = await prisma.$transaction(async (tx) => {
      await tx.requirementInvitation.updateMany({
        where: {
          id: { in: expired.map((i) => i.id) },
        },
        data: { status: 'EXPIRED' },
      })

      // Group by requirement for a cleaner log
      const byReq = new Map<string, { title: string; vendors: string[]; companyId: string }>()
      for (const inv of expired) {
        const existing = byReq.get(inv.requirementId)
        if (existing) {
          existing.vendors.push(inv.toCompany.name)
        } else {
          byReq.set(inv.requirementId, {
            title: inv.requirement.title,
            vendors: [inv.toCompany.name],
            companyId: inv.requirement.companyId,
          })
        }
      }

      // One AutomationLog per source company
      for (const [reqId, data] of byReq) {
        await tx.automationLog.create({
          data: {
            companyId: data.companyId,
            action: 'INVITATIONS_EXPIRED',
            summary: `Expired ${data.vendors.length} invitation(s) for "${data.title}"`,
            reason: `Invitations past their expiry date were automatically expired`,
            payload: {
              requirementId: reqId,
              requirementTitle: data.title,
              expiredVendors: data.vendors,
            },
            reversible: true,
          },
        })
      }

      return { count: expired.length, requirements: byReq.size }
    })

    return NextResponse.json({
      data: {
        scanned: true,
        expired: result.count,
        requirements: result.requirements,
        message: `Expired ${result.count} invitation(s) across ${result.requirements} requirement(s)`,
      },
    })
  } catch (err: any) {
    console.error('Expire invitations failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Expire invitations failed' } },
      { status: 500 }
    )
  }
}
