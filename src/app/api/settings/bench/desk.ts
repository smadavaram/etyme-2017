import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isConsultantSeat } from '@/lib/seat'
import type { CallerContext } from '@/lib/api-context'
import { mayChangeBenchPay } from '@/lib/bench-holiday-switch'

/**
 * The one gate both bench pay routes stand behind: the owner, the admin
 * and the finance desk of a firm that carries people between projects.
 * Returns the refusal, in a sentence, or null.
 */
export async function benchPayDesk(caller: CallerContext): Promise<NextResponse | null> {
  const role = caller.context.roleId
    ? await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } })
    : null
  const verdict = mayChangeBenchPay({
    companyName: caller.company?.name ?? 'your firm',
    companyKind: caller.company?.kind ?? null,
    roleName: role?.name ?? null,
    consultantSeat: isConsultantSeat(caller),
  })
  if (verdict.ok) return null
  return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 403 })
}
