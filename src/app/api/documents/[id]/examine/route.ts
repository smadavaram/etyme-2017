import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify, notifyBulk } from '@/lib/notify'
import { emit } from '@/lib/events'
import { logAccess, recordRefusal, accessActor } from '@/lib/access-log'
import { hasPermission } from '@/lib/permissions'
import { mayExamine, standingOn, typeKeyForTemplate } from '@/lib/document-request'
import { BUILT_IN, typeByKey } from '@/lib/document-type'
import { RECORDABLE_ABOUT_A_FIRM, checkToRecord, mayRecordCheck } from '@/lib/attestation'
import { writeCheck } from '@/app/api/compliance/verifications/record'

/**
 * POST /api/documents/:id/examine
 *
 *   { verdict: 'ACCEPT', validFrom?, expiresAt?, edition?, issuer?, reference? }
 *   { verdict: 'SEND_BACK', reason }
 *
 * The firm that asked for a paper looks at what arrived. The rule is
 * `mayExamine` in lib/document-request; this loads the facts, writes the
 * examination on the paper, and tells whoever sent it.
 *
 * Accepted: the dates and the edition printed on it go on the paper, and
 * a paper both sides sign is countersigned for the firm that asked. A
 * supplier's certificate of insurance or of good standing, examined by
 * a firm that buys from it, also becomes the recorded check the start
 * reads (`checkToRecord`, `writeCheck` — the same writer as Record a
 * check), so the supplier's standing and the paper cannot disagree.
 *
 * Sent back: the paper is asked for again with the reason on it, the
 * file that was refused is not kept as an answer, and the sender is told
 * why. Every look at a person's paper writes an access log row, the
 * refusals before they are sent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const doc = await prisma.docInstance.findUnique({
    where: { id },
    select: {
      id: true, status: true, subjectType: true, subjectId: true, note: true,
      template: { select: { name: true, needsSignature: true, company: { select: { id: true, name: true } } } },
      sellContract: { select: { personId: true } },
      buyContract: { select: { candidates: { where: { state: 'ACTIVE' }, select: { personId: true }, take: 1 } } },
      file: { select: { id: true } },
    },
  })
  if (!doc) return refuse(404, 'NOT_FOUND', 'That document is not here.')

  const subjectPersonId =
    doc.subjectType === 'PERSON'
      ? doc.subjectId
      : doc.subjectType === 'SELL_CONTRACT'
        ? doc.sellContract?.personId ?? null
        : doc.subjectType === 'BUY_CONTRACT'
          ? doc.buyContract?.candidates[0]?.personId ?? null
          : null
  const issuer = doc.template.company
  const atSubjectCompany = doc.subjectType === 'COMPANY' && caller.company?.id === doc.subjectId

  // Whose hands it is in: the same rule as opening the file. Examining a
  // paper is reading it, and reading it is the paperwork team's work.
  const standing = standingOn('open', { templateName: doc.template.name, subjectPersonId }, {
    personId: caller.person.id,
    atIssuer: caller.company?.id === issuer.id && caller.context.type !== 'CONSULTANT',
    atSubjectCompany,
    permissions: caller.permissions ?? [],
    companyName: caller.company?.name ?? null,
  })
  if (!standing.ok) {
    if (subjectPersonId && caller.person.id !== subjectPersonId) {
      await recordRefusal([subjectPersonId], {
        ...accessActor(caller),
        action: 'COMPLIANCE_CHECK',
        reason: `Refused examining ${doc.template.name}: the seat does not work this firm’s paperwork`,
      })
    }
    return refuse(standing.status, standing.code, standing.message)
  }

  const [person, company] = await Promise.all([
    subjectPersonId ? prisma.person.findUnique({ where: { id: subjectPersonId }, select: { name: true } }) : null,
    doc.subjectType === 'COMPANY' ? prisma.company.findUnique({ where: { id: doc.subjectId }, select: { name: true } }) : null,
  ])
  const senderName = person?.name ?? company?.name ?? 'whoever it was asked of'
  const key = typeKeyForTemplate(doc.template.name, BUILT_IN.map((t) => ({ key: t.key, label: t.label })), { guess: false })
  const spec = key ? typeByKey(key) : null

  const dateOf = (field: string): Date | null | 'BAD' => {
    const v = body[field]
    if (v == null || v === '') return null
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? 'BAD' : d
  }
  const validFrom = dateOf('validFrom')
  const expiresAt = dateOf('expiresAt')
  if (validFrom === 'BAD') return refuse(422, 'VALIDATION', 'Give the day it starts as a date, like 2026-11-01.', 'validFrom')
  if (expiresAt === 'BAD') return refuse(422, 'VALIDATION', 'Give the day it runs out as a date, like 2027-10-31.', 'expiresAt')

  const now = new Date()
  const verdict = mayExamine(
    {
      status: doc.status,
      templateName: doc.template.name,
      needsSignature: doc.template.needsSignature,
      issuerName: issuer.name,
      senderName,
      type: spec ? { key: spec.key, label: spec.label, validityShape: spec.validityShape, signedBy: spec.signedBy, reissued: spec.reissued } : null,
    },
    {
      staffOfIssuer: standing.staffOfIssuer,
      isSender: caller.person.id === subjectPersonId || atSubjectCompany,
      examinerName: caller.person.name,
    },
    {
      verdict: String(body.verdict ?? '').toUpperCase(),
      reason: typeof body.reason === 'string' ? body.reason : null,
      validFrom, expiresAt,
      edition: typeof body.edition === 'string' ? body.edition : null,
    },
    now
  )
  if (!verdict.ok) {
    return refuse(verdict.code === 'NOT_YOURS' ? 403 : verdict.code === 'NOTHING_ARRIVED' ? 409 : 422, verdict.code, verdict.message, verdict.field)
  }

  // ── A supplier's certificate becomes the recorded check ──
  let verificationId: string | null = null
  let checkSays: string | null = null
  if (verdict.verdict === 'ACCEPT' && doc.subjectType === 'COMPANY' && key && (RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(key) && caller.company) {
    const buys = await buysFrom(issuer.id, doc.subjectId)
    const may = mayRecordCheck({
      about: 'FIRM', side: buys ? 'BUYER' : null, type: key,
      holds: (p) => hasPermission(caller.permissions ?? [], p as never),
      callerFirm: caller.company.name, subjectName: senderName, employerName: senderName, buyerName: issuer.name,
    })
    if (may.ok) {
      const check = checkToRecord(
        {
          about: 'FIRM', type: key, subjectName: senderName, recordedBy: caller.person.name,
          issuer: typeof body.issuer === 'string' ? body.issuer : null,
          reference: typeof body.reference === 'string' ? body.reference : null,
          validFrom: verdict.validFrom, expiresAt: verdict.expiresAt,
        },
        now
      )
      if (!check.ok) return refuse(422, check.code, check.message, check.field)
      const written = await writeCheck({
        row: check.row, subject: { companyId: doc.subjectId }, personId: null,
        recordedById: caller.person.id, recordingCompanyId: caller.company.id, now,
      })
      verificationId = written.id
      checkSays = check.says
    } else {
      // Examined, and said why it is not on the supplier's standing.
      checkSays = `It is not recorded on ${senderName}’s standing: ${may.message}`
    }
  }

  const note = [doc.note, verdict.note].filter(Boolean).join('\n').slice(-2000)
  await prisma.$transaction(async (tx) => {
    if (verdict.verdict === 'ACCEPT') {
      await tx.docInstance.update({
        where: { id },
        data: {
          note,
          // Who looked at it and when: the paper reads as examined from this, not from a note.
          examinedById: caller.person.id, examinedAt: now,
          ...(verdict.validFrom ? { validFrom: verdict.validFrom } : {}),
          ...(verdict.expiresAt ? { expiresAt: verdict.expiresAt } : {}),
          ...(verdict.edition ? { edition: verdict.edition } : {}),
          ...(verdict.countersign ? { countersignedAt: now, countersignedById: caller.person.id } : {}),
        },
      })
    } else {
      // A paper sent back is not held. The refused file goes with it, the
      // same as a packet item sent back, so nothing reads it as an answer.
      await tx.docInstance.update({
        where: { id },
        data: {
          status: 'SENT', sentAt: now, note,
          signedAt: null, signedById: null, signedFileUrl: null, fileName: null,
          countersignedAt: null, countersignedById: null,
          examinedById: null, examinedAt: null,
        },
      })
      if (doc.file) await tx.docFile.delete({ where: { docInstanceId: id } })
    }
  })

  if (subjectPersonId) {
    logAccess({
      subjectId: subjectPersonId,
      ...accessActor(caller),
      action: 'COMPLIANCE_CHECK',
      reason: `${verdict.verdict === 'ACCEPT' ? 'Examined' : 'Sent back'} ${doc.template.name} for ${issuer.name}`,
    })
  }
  void emit({
    type: 'verification.recorded',
    companyId: issuer.id,
    subjectType: 'DocInstance',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: { action: verdict.verdict === 'ACCEPT' ? 'examined' : 'sent_back', typeKey: key, verificationId, note: verdict.note },
  })

  // The sender hears either way: a paper accepted is one they need not
  // chase, and a paper sent back is one they must answer again.
  const title = verdict.verdict === 'ACCEPT'
    ? `${issuer.name} accepted ${doc.template.name}`
    : `${issuer.name} sent back ${doc.template.name}`
  const noticeBody = verdict.verdict === 'ACCEPT' ? verdict.says : `${verdict.note}. Send the right one from your paperwork page.`
  if (subjectPersonId) {
    void notify({ personId: subjectPersonId, companyId: issuer.id, type: 'SYSTEM', title, body: noticeBody, entityId: id })
  } else if (doc.subjectType === 'COMPANY') {
    const staff = await prisma.context.findMany({
      where: { companyId: doc.subjectId, revokedAt: null, NOT: { roleId: null }, type: { not: 'CONSULTANT' } },
      select: { personId: true },
      take: 10,
    })
    void notifyBulk(staff.map((s) => ({ personId: s.personId, companyId: doc.subjectId, type: 'SYSTEM' as const, title, body: noticeBody, entityId: id })))
  }

  return NextResponse.json({
    data: {
      id,
      verdict: verdict.verdict,
      status: verdict.next,
      countersigned: verdict.countersign,
      verificationId,
      says: checkSays ? `${verdict.says} ${checkSays}` : verdict.says,
    },
  })
}

/**
 * Whether the firm that asked buys from the firm the paper is about:
 * it sent it a job, received a candidate from it, or pays it on a line.
 */
async function buysFrom(buyerId: string, supplierId: string): Promise<boolean> {
  const [invited, submitted, line] = await Promise.all([
    prisma.requirementInvitation.findFirst({ where: { fromCompanyId: buyerId, toCompanyId: supplierId }, select: { id: true } }),
    prisma.submission.findFirst({ where: { fromCompanyId: supplierId, toCompanyId: buyerId }, select: { id: true } }),
    prisma.sellContract.findFirst({
      where: { companyId: supplierId, OR: [{ clientCompanyId: buyerId }, { endClientCompanyId: buyerId }] },
      select: { id: true },
    }),
  ])
  return Boolean(invited || submitted || line)
}

function refuse(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}
