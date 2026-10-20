import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { contractSide } from '@/lib/resolve-client-company'
import { logAccess, recordRefusal, accessActor } from '@/lib/access-log'
import { emit } from '@/lib/events'
import { writeCheck } from './record'
import {
  checkToRecord,
  mayRecordCheck,
  recordLabel,
  withArticle,
  type ExaminedEvidence,
  type RecordingSide,
} from '@/lib/attestation'

/**
 * POST /api/compliance/verifications — put a check on file for a placement.
 *
 *   { contractId, about: 'PERSON', type: 'I9_EVERIFY', formEdition, evidence: [{ type, expiresAt }] }
 *   { contractId, about: 'PERSON', type: 'BACKGROUND_CHECK', provider, reference, renderedOn, outcome, providerSays, consentDocumentId? }
 *   { contractId, about: 'PERSON', type: 'PROFESSIONAL_LICENSE', issuer, licenseNumber, licenseState, expiresAt }
 *   { contractId, about: 'FIRM',   type: 'GOOD_STANDING', issuer, validFrom, expiresAt }
 *
 * The door that did not exist. Activation has refused a start on a
 * missing I-9 since September, and nothing a person at a placing firm
 * could press ever put one on file: `Verification` was written by the
 * seeds and by supplier onboarding and by nothing else, so a placement
 * whose person had no seeded I-9 could never start. The simulation found
 * it on 2026-10-20, walking a placement from award to the first day.
 *
 * It writes the row activation reads, and nothing else. The rule is
 * `checkToRecord` and `mayRecordCheck` in lib/attestation: an examined
 * document is a fact about an examination, a provider's verdict is
 * recorded in their words with their name and reference, and nothing
 * here is a judgment about a person.
 *
 * About a person: the firm that employs or places them, HR or the
 * compliance officer. About a supplier: the firm that buys from it,
 * procurement or the compliance officer. Every read of the person is
 * logged, the refusals before they are sent.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return refuse(403, 'NO_COMPANY', 'A check is put on file by a company. Sign in at the firm that places the person, or the firm that buys from the supplier.')
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const contractId = typeof body.contractId === 'string' ? body.contractId.trim() : ''
  if (!contractId) return refuse(422, 'VALIDATION', 'Say which placement this check is for.', 'contractId')
  const about = body.about === 'FIRM' ? 'FIRM' : body.about === 'PERSON' ? 'PERSON' : null
  if (!about) return refuse(422, 'VALIDATION', 'Say whether the check is about the person or about the supplier.', 'about')
  const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''
  if (!type) return refuse(422, 'VALIDATION', 'Say which check this is.', 'type')

  const contract = await prisma.sellContract.findUnique({
    where: { id: contractId },
    select: {
      id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true, personId: true, state: true,
      person: { select: { name: true } },
      company: { select: { name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
    },
  })
  if (!contract) return refuse(404, 'NOT_FOUND', 'That placement could not be found. Open it from its own page and record the check there.')

  const raw = contractSide(caller, contract)
  const side: RecordingSide = raw === 'SUPPLIER' ? 'EMPLOYER' : raw === 'PAYER' || raw === 'END_CLIENT' ? 'BUYER' : null
  const subjectName = about === 'PERSON' ? contract.person.name : contract.company.name
  const buyerName = contract.endClientCompany?.name ?? contract.clientCompany.name

  const may = mayRecordCheck({
    about, side, type,
    holds: (p) => hasPermission(caller.permissions ?? [], p as never),
    callerFirm: caller.company.name,
    subjectName,
    employerName: contract.company.name,
    buyerName,
  })
  if (!may.ok) {
    if (about === 'PERSON') {
      await recordRefusal([contract.personId], {
        ...accessActor(caller),
        action: 'COMPLIANCE_CHECK',
        // The log is read by people: the refusal in words, never its code.
        reason: `Refused recording ${withArticle(recordLabel(type))}: ${REFUSED_BECAUSE[may.code]}`,
      })
    }
    return refuse(403, may.code, may.message)
  }

  // ── Dates, as the paper prints them ──
  const dateOf = (field: string): Date | null | 'BAD' => {
    const v = body[field]
    if (v == null || v === '') return null
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? 'BAD' : d
  }
  const dates: Record<string, Date | null> = {}
  for (const f of ['renderedOn', 'issuedOn', 'validFrom', 'expiresAt']) {
    const d = dateOf(f)
    if (d === 'BAD') return refuse(422, 'VALIDATION', `Give ${DATE_WORDS[f]} as a date, like 2027-06-30.`, f)
    dates[f] = d
  }
  const evidence: ExaminedEvidence[] = []
  if (Array.isArray(body.evidence)) {
    for (const e of body.evidence as Record<string, unknown>[]) {
      const at = e?.expiresAt ? new Date(String(e.expiresAt)) : null
      if (at && Number.isNaN(at.getTime())) {
        return refuse(422, 'VALIDATION', 'Give each document’s expiry as a date, like 2031-04-30.', 'evidence')
      }
      evidence.push({
        type: String(e?.type ?? '').toUpperCase(),
        issuer: typeof e?.issuer === 'string' ? e.issuer : null,
        reference: typeof e?.reference === 'string' ? e.reference : null,
        expiresAt: at,
      })
    }
  }

  // ── The person's authorization, where one is named ──
  //
  // A signed paper about this person, and nothing else. A consent that
  // is somebody else's, or not yet signed, is refused rather than read
  // as given.
  let consentOn: Date | null = null
  const consentId = typeof body.consentDocumentId === 'string' ? body.consentDocumentId.trim() : ''
  if (about === 'PERSON' && consentId) {
    const consent = await prisma.docInstance.findUnique({
      where: { id: consentId },
      select: { status: true, subjectType: true, subjectId: true, signedAt: true },
    })
    if (!consent || consent.subjectType !== 'PERSON' || consent.subjectId !== contract.personId) {
      return refuse(422, 'NOT_THEIR_CONSENT', `That authorization is not a paper about ${contract.person.name}.`, 'consentDocumentId')
    }
    if (consent.status !== 'SIGNED' || !consent.signedAt) {
      return refuse(422, 'NOT_SIGNED', `${contract.person.name} has not signed that authorization yet, so it cannot be named as consent.`, 'consentDocumentId')
    }
    consentOn = consent.signedAt
  }

  const str = (k: string): string | null => (typeof body[k] === 'string' ? (body[k] as string) : null)
  const now = new Date()
  const verdict = checkToRecord(
    {
      about, type, subjectName, recordedBy: caller.person.name,
      provider: str('provider'), reference: str('reference'), renderedOn: dates.renderedOn,
      outcome: str('outcome'), providerSays: str('providerSays'), consentOn,
      issuer: str('issuer'), issuedOn: dates.issuedOn, validFrom: dates.validFrom, expiresAt: dates.expiresAt,
      formEdition: str('formEdition'), evidence, licenseNumber: str('licenseNumber'), licenseState: str('licenseState'),
    },
    now
  )
  if (!verdict.ok) {
    return refuse(422, verdict.code, verdict.message, verdict.field)
  }
  const row = verdict.row
  const subject = about === 'PERSON' ? { personId: contract.personId } : { companyId: contract.companyId }

  const written = await writeCheck({
    row,
    subject,
    personId: contract.personId,
    recordedById: caller.person.id,
    recordingCompanyId: caller.company.id,
    now,
  })
  const id = written.id
  const already = written.already ? written : null

  if (about === 'PERSON') {
    logAccess({
      subjectId: contract.personId,
      ...accessActor(caller),
      action: 'COMPLIANCE_CHECK',
      reason: `Recorded ${withArticle(recordLabel(type))} for the placement at ${buyerName}`,
    })
  }
  if (!already) {
    void emit({
      type: 'verification.recorded',
      companyId: caller.company.id,
      subjectType: 'Verification',
      subjectId: id,
      actorPersonId: caller.person.id,
      payload: { contractId, about, type: row.type, status: row.status, expiresAt: row.expiresAt?.toISOString() ?? null },
    })
  }

  return NextResponse.json(
    {
      data: {
        id,
        type: row.type,
        status: row.status,
        expiresAt: row.expiresAt?.toISOString().slice(0, 10) ?? null,
        alreadyOnFile: !!already,
        says: already ? `That ${recordLabel(type)} is already on file, exactly as given. Nothing new was written.` : verdict.says,
      },
    },
    { status: already ? 200 : 201 }
  )
}

/** A refusal's reason on the access log, in words. */
const REFUSED_BECAUSE: Record<'NOT_A_PARTY' | 'NOT_YOURS_TO_RECORD' | 'FORBIDDEN', string> = {
  NOT_A_PARTY: 'the firm is not a party to the placement',
  NOT_YOURS_TO_RECORD: 'it is the other firm’s to record',
  FORBIDDEN: 'the seat does not record checks',
}

/** Each date field, as the paper names it. */
const DATE_WORDS: Record<string, string> = {
  renderedOn: 'the day the provider reported',
  issuedOn: 'the day it was issued',
  validFrom: 'the day it starts',
  expiresAt: 'the day it runs out',
}

function refuse(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}
