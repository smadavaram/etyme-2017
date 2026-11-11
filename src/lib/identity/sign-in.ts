import { prisma } from '@/lib/db'
import type { AccessAction } from '@/lib/access-log'
import { effectiveMode, type Door } from '@/lib/identity/policy'
import { policyFacts } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'

/**
 * The two rows a sign-in that passed writes (founder, 2026-11-11):
 * LOGIN_SUCCEEDED, naming the door and the policy that governed it; and
 * INVITE_ACCEPTED for each invitation this is the first sign-in on.
 *
 * Only where the person is on the record: somebody's very first sign-in
 * on a public address is made a person by /start, after this, and their
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

  // An invited seat nobody has used yet, at a company this person has no
  // INVITE_ACCEPTED row for: this sign-in accepts it.
  const invited = await prisma.context.findMany({
    where: { personId: person.id, revokedAt: null, invitedAt: { not: null }, lastUsedAt: null, companyId: { not: null } },
    select: { id: true, companyId: true, company: { select: { name: true } } },
  })
  for (const seat of invited) {
    const already = await prisma.accessLog.findFirst({
      where: { subjectId: person.id, actorCompanyId: seat.companyId, action: 'INVITE_ACCEPTED' as unknown as AccessAction },
      select: { id: true },
    })
    if (already) continue
    const at = await policyFacts(email, seat.companyId)
    await recordIdentityEvent({
      event: 'INVITE_ACCEPTED',
      companyId: seat.companyId,
      actorPersonId: person.id,
      subject: { personId: person.id },
      policy: effectiveMode(at.target),
      surface: 'WEB',
      says: `${email} signed in for the first time on the invitation to ${seat.company?.name ?? 'the company'} (seat ${seat.id}).`,
    })
  }
}
