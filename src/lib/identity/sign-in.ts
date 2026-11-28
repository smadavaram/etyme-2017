import { prisma } from '@/lib/db'
import { effectiveMode, type Door, type EffectiveMode } from '@/lib/identity/policy'
import { policyFacts } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'

/**
 * The row a sign-in that passed writes (founder, 2026-11-11):
 * LOGIN_SUCCEEDED, naming the door and the policy that governed it.
 *
 * It no longer writes INVITE_ACCEPTED (2026-11-16). It used to, for every
 * invited seat the person held with no use date, at every firm, whichever
 * seat she opened. So a firm that invited an address whose owner signs in
 * daily elsewhere read her as having come in there, and learned she has
 * an account. An invitation is accepted when its seat is opened
 * (`markSeatOpened`, called by the caller check in lib/api-context), and
 * only that seat.
 *
 * Only where the person is on the record: somebody's very first sign-in
 * on a public address is made a person by /setup, after this, and their
 * first success is not in the ledger (KNOWN-LIMITS, "Identity, pass 1").
 */
export async function recordSignInLedger(args: { email: string | null; door: Door | null }): Promise<void> {
  const email = String(args.email ?? '').trim().toLowerCase()
  if (!email) return
  const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } })
  if (!person) return
  const facts = await policyFacts(email, null)
  const policy = effectiveMode(facts.domainCompany)

  await recordIdentityEvent({
    event: 'LOGIN_SUCCEEDED',
    companyId: facts.domainCompany?.companyId ?? null,
    actorPersonId: person.id,
    subject: { personId: person.id },
    policy,
    surface: args.door === 'DIRECTORY' ? 'DIRECTORY' : 'WEB',
    says: `${email} signed in through ${args.door ?? 'a door this build does not name'}.`,
  })
}

/** The seat the caller check resolved, as `markSeatOpened` reads it. */
export interface OpenedSeat {
  id: string
  companyId: string | null
  invitedAt: Date | null
  lastUsedAt: Date | null
}

/**
 * Whether opening this seat may be her accepting an invitation: a seat at
 * a firm, made by an invitation, with no use recorded on it. Every other
 * seat is passed over with no read. Pure, so the rule is a sentence in a
 * test.
 */
export function opensAnInvitation(seat: OpenedSeat): boolean {
  return seat.companyId !== null && seat.invitedAt !== null && seat.lastUsedAt === null
}

/**
 * The seat a session opens where she chose none (2026-11-16, walk of
 * 30f2c4d87): no seat named on the request and none chosen in the account
 * menu on this device. The newest seat she has used, never an invitation
 * she has not opened. The newest seat used to win, and a fresh invitation
 * is always the newest, so signing in on a new device opened it, accepted
 * it, and told the inviting firm she has an account, without her ever
 * choosing that firm.
 *
 * Used is a seat no invitation made (her own, or one she founded), a seat
 * with a use date, or one at a firm whose own access log holds a row of
 * hers (`usedHere`, the seats `signedInHere` found). An invitation is
 * opened by choosing it in the account menu, or by holding nothing else:
 * where every seat she may use is an invitation she has not opened, the
 * newest is opened, because signing in with nowhere else to be is coming
 * in where she was invited. `open` is newest first. Pure.
 */
export function defaultSeatOf<T extends OpenedSeat>(open: readonly T[], usedHere: ReadonlySet<string>): T | null {
  return open.find((s) => !opensAnInvitation(s) || usedHere.has(s.id)) ?? open[0] ?? null
}

/**
 * Her invitation to this firm is accepted the moment she opens its seat
 * (2026-11-16): one INVITE_ACCEPTED row, at this firm, naming this seat,
 * and never a row at any other firm she holds a seat at.
 *
 * Once per firm: a row already there is left alone, and two requests that
 * open the seat at the same moment (a first page fires several) take a
 * lock on the seat, so the second finds the first's row. Called after the
 * firm's sign-in policy let the session use the seat, so a refused session
 * never counts as coming in. Never throws: a row that could not be written
 * is never a reason to refuse the request.
 */
export async function markSeatOpened(
  seat: OpenedSeat,
  person: { id: string; primaryEmail: string },
  ctx: { companyName: string | null; policy: EffectiveMode; surface: 'WEB' | 'API' },
): Promise<boolean> {
  if (!opensAnInvitation(seat)) return false
  const companyId = seat.companyId!
  const already = { actorPersonId: person.id, actorCompanyId: companyId, action: 'INVITE_ACCEPTED' }
  try {
    if (await prisma.accessLog.findFirst({ where: already, select: { id: true } })) return false
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'invite-accepted:' + seat.id}))`
      if (await tx.accessLog.findFirst({ where: already, select: { id: true } })) return false
      await recordIdentityEvent({
        event: 'INVITE_ACCEPTED',
        companyId,
        actorPersonId: person.id,
        subject: { personId: person.id },
        policy: ctx.policy,
        surface: ctx.surface,
        says: `${person.primaryEmail} opened the seat ${ctx.companyName ?? 'the company'} invited them to (seat ${seat.id}).`,
      }, tx)
      return true
    })
  } catch {
    return false
  }
}
