import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'
import { accessActor, recordAccess, recordRefusal, type AccessAction, type AccessSubject } from '@/lib/access-log'
import { notify } from '@/lib/notify'
import { formatDay } from '@/lib/format-date'
import { waitsForVerifiedOwner } from '@/lib/owner-proof'
import { becomeOwner } from '@/app/api/settings/owner-proof/become'

/**
 * POST /api/superadmin/owner-proof
 *   { company, email, provider, reference, checkedOn, result, confirmed }
 *
 * A Superadmin records an identity-verification provider's result for a
 * named person at a named company (founder, 2026-11-11; coordinator's
 * call, reversible in a sentence, because no provider is chosen yet). The
 * result is the provider's, word for word, with its name, its reference
 * and its date; `confirmed` is the provider's own yes or no, never a
 * verdict of Etyme's. Etyme keeps no copy of an identity paper, so there
 * is no file here.
 *
 * Nothing about the company is read beyond the one seat named. A
 * one-person firm's person who holds the Admin seat under the proof rule
 * is seated its Owner on a confirmed result, because a one-person firm
 * has no domain to prove.
 */

/** The access-log name for recording a provider's result. */
const RECORD_PROOF: AccessAction = 'OWNER_PROOF_RECORD'

const REFUSED = "Recording an identity check is for Etyme's Superadmin only."

async function refuse(caller: CallerContext): Promise<NextResponse> {
  const subject: AccessSubject | null = caller.isService ? (caller.company ? { companyId: caller.company.id } : null) : caller.person.id
  if (subject) {
    await recordRefusal([subject], { ...accessActor(caller), action: RECORD_PROOF, reason: 'Refused recording an identity check on the Superadmin screen: not on Etyme’s staff list.' })
  }
  return NextResponse.json({ error: { code: 'FORBIDDEN', message: REFUSED } }, { status: 403 })
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const bad = (field: string, message: string) => NextResponse.json({ error: { code: 'VALIDATION', field, message } }, { status: 422 })

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.staff || caller.isService) return refuse(caller)
  const staffId = realPersonId(caller)
  if (!staffId) return refuse(caller)

  const body = await request.json().catch(() => ({}))
  const companyWord = text(body.company, 200).toLowerCase()
  const email = text(body.email, 320).toLowerCase()
  const provider = text(body.provider, 120)
  const reference = text(body.reference, 200)
  const result = text(body.result, 1000)
  const checkedOn = /^\d{4}-\d{2}-\d{2}$/.test(text(body.checkedOn, 10)) ? new Date(`${text(body.checkedOn, 10)}T00:00:00Z`) : null
  if (!companyWord) return bad('company', 'Name the company by its Etyme address, the part before .etyme.com.')
  if (!email) return bad('email', 'Name the person by the email they sign in with.')
  if (!provider) return bad('provider', 'Name the provider that checked the person, as it names itself.')
  if (!reference) return bad('reference', 'Type the provider’s reference for the check.')
  if (!checkedOn || Number.isNaN(checkedOn.getTime())) return bad('checkedOn', 'Type the date on the provider’s result, as YYYY-MM-DD.')
  if (!result) return bad('result', 'Copy the provider’s result, word for word.')
  if (typeof body.confirmed !== 'boolean') return bad('confirmed', 'Say whether the provider confirmed the person is who they say.')

  const company = await prisma.company.findUnique({ where: { slug: companyWord }, select: { id: true, name: true, kind: true, ownerProofRequiredAt: true, ownerVerifiedAt: true } })
  if (!company) return bad('company', `No company is at ${companyWord}.etyme.com.`)
  const seat = await prisma.context.findFirst({
    where: { companyId: company.id, revokedAt: null, person: { primaryEmail: email } },
    select: { id: true, personId: true, person: { select: { name: true } }, role: { select: { name: true } } },
  })
  if (!seat) return bad('email', `${email} holds no seat at ${company.name}.`)

  await prisma.$transaction(async (tx) => {
    await tx.ownerProof.create({
      data: {
        companyId: company.id, personId: seat.personId, kind: 'PERSON', source: provider, reference,
        result, checkedOn, confirmed: body.confirmed, recordedById: staffId,
      },
    })
    await tx.automationLog.create({
      data: {
        companyId: company.id,
        action: 'OWNER_PROOF_RECORDED',
        summary: `Etyme recorded ${provider}’s identity check of ${seat.person.name} at ${company.name}`,
        reason: `${provider}, reference ${reference}, ${formatDay(checkedOn)}: “${result}”`,
        payload: { personId: seat.personId, provider, reference, checkedOn: checkedOn.toISOString(), confirmed: body.confirmed, byPersonId: staffId },
        reversible: false,
      },
    })
    await recordAccess([seat.personId], {
      ...accessActor(caller), action: RECORD_PROOF,
      reason: `A Superadmin recorded ${provider}’s identity check for ${seat.person.name} at ${company.name}.`,
    }, tx)
  })

  // A one-person firm's own person is its Owner on the person proof alone.
  let seated = false
  if (body.confirmed && company.kind === 'CONSULTANT_CORP' && waitsForVerifiedOwner(company)) {
    const done = await becomeOwner({ companyId: company.id, contextId: seat.id, personId: seat.personId, personName: seat.person.name, byPersonId: staffId })
    seated = done.ok
  }

  void notify({
    personId: seat.personId, companyId: company.id, type: 'SYSTEM',
    title: `Your identity check is recorded at ${company.name}`,
    body: seated
      ? `${provider} checked you, and you are now the Owner of ${company.name}.`
      : body.confirmed
        ? `${provider} checked you. Open Setup → Prove ownership to finish.`
        : `${provider} could not confirm the check. Its words: “${result}”. Write to support@etyme.com to ask again.`,
    channel: 'EMAIL',
    data: { href: '/dashboard/settings/setup/ownership' },
  })

  return NextResponse.json({
    data: {
      message: seated
        ? `Recorded. ${seat.person.name} is now the Owner of ${company.name}.`
        : `Recorded for ${seat.person.name} at ${company.name}.`,
    },
  }, { status: 201 })
}
