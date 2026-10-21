import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { emit } from '@/lib/events'
import { logAccess, recordRefusal, accessActor } from '@/lib/access-log'
import { adverseStep, adverseWaitFor, type AdverseRecord } from '@/lib/attestation'

/**
 * POST /api/compliance/adverse-action
 *
 *   { verificationId, contractId, step: 'PRE_NOTICE', noticeDocumentId }
 *   { verificationId, contractId, step: 'FINAL', noticeDocumentId, reason }
 *   { verificationId, contractId, step: 'NOT_TAKEN', reason }
 *
 * The steps that stay with the firm after a screening company reports
 * something unfavorable. The rule and the waiting periods are
 * `adverseStep` and `ADVERSE_ACTION_WAIT` in lib/attestation; this loads
 * the report, the placement's site and the notice paper, and writes each
 * step beside the report — never over it, so the provider's words stay
 * as they wrote them.
 *
 * The notices themselves are papers like any other: raised by HR from
 * the firm's own template, the copy of the report attached as a file,
 * and sent (`/api/documents`), which is what tells the person. This
 * route refuses to call a notice given until all three are true.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return refuse(403, 'NO_COMPANY', 'The notices after a background check are given by the firm that ordered it. Sign in at that firm.')

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const verificationId = typeof body.verificationId === 'string' ? body.verificationId : ''
  const contractId = typeof body.contractId === 'string' ? body.contractId : ''
  if (!verificationId) return refuse(422, 'VALIDATION', 'Say which report this is about.', 'verificationId')
  if (!contractId) return refuse(422, 'VALIDATION', 'Say which placement this is about.', 'contractId')

  const [check, line] = await Promise.all([
    prisma.verification.findUnique({
      where: { id: verificationId },
      select: {
        id: true, personId: true, type: true, status: true, provider: true, referenceId: true, result: true,
        orderedByCompanyId: true, orderedByCompany: { select: { name: true } },
        person: { select: { name: true } },
      },
    }),
    prisma.sellContract.findUnique({
      where: { id: contractId },
      select: { id: true, personId: true, companyId: true, workLocation: { select: { country: true, state: true, city: true } } },
    }),
  ])
  if (!check || !check.personId || !line || line.personId !== check.personId) {
    return refuse(404, 'NOT_FOUND', 'That report is not on that placement. Open it from the placement’s papers.')
  }
  const personId = check.personId

  if (!['consultants.write', 'privacy.manage'].some((p) => hasPermission(caller.permissions ?? [], p as never))) {
    await recordRefusal([personId], { ...accessActor(caller), action: 'COMPLIANCE_CHECK', reason: 'Refused a step after a background check: the seat does not work the firm’s papers' })
    return refuse(403, 'FORBIDDEN', `The notices after a background check are HR’s or the compliance officer’s work at ${caller.company.name}. Ask whoever runs Users & permissions for one of those seats.`)
  }

  const noticeId = typeof body.noticeDocumentId === 'string' ? body.noticeDocumentId : ''
  const notice = noticeId
    ? await prisma.docInstance.findUnique({
        where: { id: noticeId },
        select: { status: true, subjectType: true, subjectId: true, template: { select: { companyId: true } }, file: { select: { id: true } } },
      })
    : null

  const result = (check.result ?? {}) as Record<string, unknown>
  const record = (result.adverse ?? {}) as AdverseRecord
  const now = new Date()
  const verdict = adverseStep(
    {
      step: String(body.step ?? ''),
      check: {
        type: check.type, status: check.status, provider: check.provider, reference: check.referenceId,
        orderedByFirm: check.orderedByCompany?.name ?? null,
      },
      callerFirm: caller.company.name,
      callerOrdered: check.orderedByCompanyId === caller.company.id,
      subjectName: check.person?.name ?? 'this person',
      record,
      notice: notice
        ? {
            aboutThisPerson: notice.subjectType === 'PERSON' && notice.subjectId === personId,
            fromThisFirm: notice.template.companyId === caller.company.id,
            hasFile: !!notice.file,
            sent: notice.status !== 'PENDING',
          }
        : null,
      reason: typeof body.reason === 'string' ? body.reason : null,
      wait: adverseWaitFor(line.workLocation ?? {}),
      by: caller.person.name,
    },
    now
  )
  if (!verdict.ok) {
    if (verdict.status === 403) {
      await recordRefusal([personId], { ...accessActor(caller), action: 'COMPLIANCE_CHECK', reason: `Refused a step after a background check: ${verdict.message}` })
    }
    return refuse(verdict.status, verdict.code, verdict.message, verdict.field)
  }

  const step = String(body.step).toUpperCase()
  const next: AdverseRecord = {
    ...verdict.record,
    ...(step === 'PRE_NOTICE' ? { preNoticeDocumentId: noticeId } : {}),
    ...(step === 'FINAL' ? { finalDocumentId: noticeId } : {}),
  }
  await prisma.verification.update({ where: { id: check.id }, data: { result: { ...result, adverse: next } as never } })

  logAccess({
    subjectId: personId,
    ...accessActor(caller),
    action: 'COMPLIANCE_CHECK',
    reason: `${step === 'PRE_NOTICE' ? 'Gave the pre-adverse action notice' : step === 'FINAL' ? 'Gave the final adverse action notice' : 'Decided not to act on'} on the ${check.provider ?? 'screening'} report`,
  })
  void emit({
    type: 'verification.recorded',
    companyId: caller.company.id,
    subjectType: 'Verification',
    subjectId: check.id,
    actorPersonId: caller.person.id,
    payload: { adverse: step, waitUntil: next.waitUntil ?? null, contractId },
  })
  if (step === 'NOT_TAKEN') {
    void notify({
      personId, companyId: caller.company.id, type: 'SYSTEM',
      title: `${caller.company.name} is going ahead with your placement`,
      body: `${caller.company.name} reviewed the background check and it does not change the decision.`,
      entityId: check.id,
    })
  }

  return NextResponse.json({ data: { verificationId: check.id, step, waitUntil: next.waitUntil ?? null, says: verdict.says } })
}

function refuse(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}
