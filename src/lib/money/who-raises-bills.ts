/**
 * Who at this firm may raise a bill, named from the seats it has filled.
 *
 * The founder's walk, 2026-11-15 (layer 2, stop 5): at a firm seated
 * with an Owner, HR, an Account Manager and AP & Payroll, two of them
 * were told "Raising a bill is done by Accounts Receivable or Finance".
 * Nobody there holds either role; only the Owner raises bills. So the
 * sentence names the roles of the live seats whose role holds
 * `invoices.issue`, and falls back to the role set's names (`refusalFor`)
 * only where no seat holds it.
 *
 * Who may raise a bill is not changed here: only whom the sentence names.
 */
import { prisma } from '@/lib/db'
import { refusalFor, type CallerContext } from '@/lib/api-context'
import { notYourButton } from '@/lib/refusal-words'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'

const DOING = 'Raising a bill'

/** "Raising a bill is for the Owner here. Ask them." Null where no seat holds it. Pure. */
export function raisersSays(roleNames: readonly string[]): string | null {
  const seen = Array.from(new Set(roleNames.map((n) => n.trim()).filter(Boolean)))
  if (seen.length === 0) return null
  const lead = (n: string) => (n === 'Owner' ? 1 : n === 'Admin' ? 2 : 0)
  const names = [...seen].sort((a, b) => lead(a) - lead(b))
  return notYourButton(DOING, names)
}

/** The refusal for a seat that may not raise a bill, naming who here may. */
export async function whoRaisesBillsSays(caller: Pick<CallerContext, 'publicSeat' | 'company'>): Promise<string> {
  const fallback = refusalFor(caller, { doing: DOING, needs: 'invoices.issue' })
  // A public-address seat is told the address is why, as before.
  if (caller.publicSeat || !caller.company?.id) return fallback
  const seats = await prisma.context.findMany({
    where: {
      companyId: caller.company.id, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' },
      role: { permissions: { hasSome: ['invoices.issue', '*'] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { role: { select: { name: true } } },
  }).catch(() => [])
  return raisersSays(seats.map((s) => s.role?.name ?? '')) ?? fallback
}
