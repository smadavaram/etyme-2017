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
import { hasPermission, type Permission } from '@/lib/permissions'
import { notYourButton } from '@/lib/refusal-words'
import { readCompanySeats, type CompanySeat } from '@/lib/company-seats'

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
 * The roles to name as the ones to ask, from the company's live seats
 * (`readCompanySeats`): a person at the firm, not the sample seat, not
 * paused, whose role holds `needs` (the Owner's "*" included). A seat past
 * its end date is not in `seats` at all (2026-11-15, `seatByDate`), so its
 * role is never named; an Owner, or the last seat that may manage access,
 * kept open past its date is still there and still named. Pure.
 */
export function rolesThatMay(
  seats: readonly Pick<CompanySeat, 'roleId' | 'roleName' | 'state' | 'isPerson' | 'isSample'>[],
  permissionsOf: ReadonlyMap<string, readonly string[]>,
  needs: Permission,
): string[] {
  return seats
    .filter((s) => s.isPerson && !s.isSample && s.state !== 'PAUSED' && s.roleId && s.roleName)
    .filter((s) => hasPermission(permissionsOf.get(s.roleId as string) ?? [], needs))
    .map((s) => s.roleName as string)
}

/**
 * The refusal for a seat that lacks `needs`, naming the roles of the live
 * seats at its own firm whose role holds it (the Owner's "*" included).
 * Falls back to the role set's names (`refusalFor`) only where no seat
 * holds it, and for a public-address seat, which is told the address is why.
 * The seats are the one seat reader's, so a seat whose access has ended by
 * its date is never named as somebody to ask.
 */
export async function whoHereMaySays(
  caller: Pick<CallerContext, 'publicSeat' | 'company'>,
  args: { doing: string; needs: Permission },
): Promise<string> {
  const fallback = refusalFor(caller, args)
  if (caller.publicSeat || !caller.company?.id) return fallback
  const roles = await readCompanySeats(caller.company.id)
    .then(async (seats) => {
      const ids = Array.from(new Set(seats.map((s) => s.roleId).filter((id): id is string => Boolean(id))))
      if (ids.length === 0) return []
      const held = await prisma.role.findMany({ where: { id: { in: ids } }, select: { id: true, permissions: true } })
      return rolesThatMay(seats, new Map(held.map((r) => [r.id, r.permissions])), args.needs)
    })
    .catch(() => [] as string[])
  return seatedSays(args.doing, roles) ?? fallback
}
