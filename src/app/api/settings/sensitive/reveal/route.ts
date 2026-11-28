import { NextResponse, type NextRequest } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { OWNER_ROLE } from '@/lib/owner-rules'
import { spendCheck } from '@/lib/identity/second-check'
import { recordSecurityEvent } from '@/lib/identity/security-ledger'
import { SENSITIVE_FIELDS, isSensitiveField, mayReveal, openTaxId, revealSubject, type SensitiveField } from '@/lib/sensitive'

/**
 * POST /api/settings/sensitive/reveal — { field, id, proof? }
 *
 * The one reply in Etyme that carries a full tax ID (record 99). Only an
 * Owner of the company the number is on, signed in as herself, and only
 * with a proof from a fresh second check made for this field and this
 * record. Without a proof it answers SECOND_CHECK with the act and the
 * subject, and the screen opens the check (components/step-up).
 *
 * Every reveal is on the security log with who, which record and why;
 * every refusal is written there before the refusal is sent. The number
 * itself is never in a log row. The reply is never cached.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const field: SensitiveField | null = isSensitiveField(body.field) ? body.field : null
  const id = typeof body.id === 'string' ? body.id.trim().slice(0, 200) : ''
  if (!field || !id) return reply(422, { error: { code: 'VALIDATION', message: 'Say which number to show: the field and the record.' } })

  const personId = realPersonId(caller)
  const company = caller.company
  const refuse = async (status: number, code: string, message: string, why: string, extra: Record<string, unknown> = {}) => {
    // Written before the refusal is sent (CLAUDE.md, invariants).
    await recordSecurityEvent({
      event: 'SENSITIVE_REVEAL_REFUSED', surface: 'WEB',
      says: `A request to show ${SENSITIVE_FIELDS[field]} was refused.`,
      companyId: company?.id ?? null, actorPersonId: personId ?? caller.person.id, subjectCompanyId: company?.id ?? null,
      targetKind: field, targetId: id, facts: { why },
    })
    return reply(status, { error: { code, message, ...extra } })
  }

  // The record, inside the caller's own company only.
  const row = !company
    ? null
    : field === 'COMPANY_TAX_ID'
      ? id === company.id ? await prisma.company.findUnique({ where: { id }, select: { taxId: true, taxIdSealed: true } }) : null
      : await prisma.remitTo.findFirst({ where: { id, companyId: company.id }, select: { taxId: true, taxIdSealed: true } })

  const seat = caller.context.roleId ? await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null
  const verdict = mayReveal({
    isOwner: seat?.name === OWNER_ROLE,
    ownCompany: row !== null,
    asHerself: Boolean(personId) && !caller.isService && !caller.readOnly,
    companyName: company?.name ?? 'this company',
  })
  if (!verdict.ok) return refuse(403, 'FORBIDDEN', verdict.says, row === null ? 'not this company’s record' : 'not an Owner')

  const act = 'sensitive.reveal' as const
  const subjectId = revealSubject(field, id)
  if (!body.proof) {
    return refuse(403, 'SECOND_CHECK', 'Check it is you first: the full number shows only after a fresh second check.', 'no second check yet', { act, subjectId })
  }
  const spent = await spendCheck({ proof: body.proof, personId: personId!, companyId: company!.id, act, subjectId })
  if (!spent.ok) return refuse(spent.status, spent.code, spent.says, 'second check refused')

  const value = openTaxId(row!)
  if (!value) return refuse(409, 'NOT_READABLE', 'There is no full number to show: none was saved, or this deployment cannot open it.', 'nothing to open')

  const logged = await recordSecurityEvent({
    event: 'SENSITIVE_REVEALED', surface: 'WEB',
    says: `${caller.person.name} was shown ${SENSITIVE_FIELDS[field]}, as Owner, after a second check.`,
    companyId: company!.id, actorPersonId: personId!, subjectCompanyId: company!.id,
    method: spent.check.method, targetKind: field, targetId: id,
    facts: { purpose: 'OWNER_VIEW', passedEventId: spent.check.passedId },
  })
  // A reveal nobody can find on the log did not happen.
  if (!logged) return reply(503, { error: { code: 'NOT_RECORDED', message: 'The view could not be recorded, so it is not shown. Try again.' } })
  return reply(200, { data: { field, id, value } })
}
