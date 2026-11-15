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
 *
 * The same reading serves every money door that refuses a seat for a
 * permission it lacks (layer 2 press, 2026-11-15): the week page's bill
 * line and the placement's start, pause, resume, end, cancel and verify
 * (`whoHereMaySays`). One reader, so the Bills page and the week page say
 * the same sentence to the same seat.
 */
import { prisma } from '@/lib/db'
import { refusalFor, type CallerContext } from '@/lib/api-context'
import type { Permission } from '@/lib/permissions'
import { notYourButton } from '@/lib/refusal-words'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'

const DOING = 'Raising a bill'

/** "Raising a bill is for the Owner here. Ask them." Null where no seat holds it. Pure. */
export function raisersSays(roleNames: readonly string[]): string | null {
  return seatedSays(DOING, roleNames)
}

/** "<Doing> is for the Owner here. Ask them.", from the roles of the seats that hold it. Null where none does. Pure. */
export function seatedSays(doing: string, roleNames: readonly string[]): string | null {
  const seen = Array.from(new Set(roleNames.map((n) => n.trim()).filter(Boolean)))
  if (seen.length === 0) return null
  const lead = (n: string) => (n === 'Owner' ? 1 : n === 'Admin' ? 2 : 0)
  const names = [...seen].sort((a, b) => lead(a) - lead(b))
  return notYourButton(doing, names)
}

/** The refusal for a seat that may not raise a bill, naming who here may. */
export async function whoRaisesBillsSays(caller: Pick<CallerContext, 'publicSeat' | 'company'>): Promise<string> {
  return whoHereMaySays(caller, { doing: DOING, needs: 'invoices.issue' })
}

/**
 * The refusal for a seat that lacks `needs`, naming the roles of the live
 * seats at its own firm whose role holds it (the Owner's "*" included).
 * Falls back to the role set's names (`refusalFor`) only where no seat
 * holds it, and for a public-address seat, which is told the address is why.
 */
export async function whoHereMaySays(
  caller: Pick<CallerContext, 'publicSeat' | 'company'>,
  args: { doing: string; needs: Permission },
): Promise<string> {
  const fallback = refusalFor(caller, args)
  if (caller.publicSeat || !caller.company?.id) return fallback
  const seats = await prisma.context.findMany({
    where: {
      companyId: caller.company.id, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' },
      role: { permissions: { hasSome: [args.needs, '*'] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { role: { select: { name: true } } },
  }).catch(() => [])
  return seatedSays(args.doing, seats.map((s) => s.role?.name ?? '')) ?? fallback
}
