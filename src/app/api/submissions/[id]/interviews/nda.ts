/**
 * The client's non-disclosure agreement, asked of the candidate when an
 * interview is booked.
 *
 * Found by the screen walk of 2026-10-22: there was no NDA step at
 * interview. A client whose orders ask for an NDA tells a candidate about
 * its projects in the first round, and the paper that was meant to cover
 * that conversation was asked for at the start, weeks later, if at all.
 *
 * ── When the job's set asks for one ──────────────────────────────────
 *
 * A job request carries no document set; the client's orders do, and
 * the line the award writes will inherit them. So the set is read off
 * the orders this client issued: a required, unwaived NDA row owed by
 * the worker, or owed by the supplier. The second counts because a
 * firm's NDA with the client does not bind a person the firm does not
 * employ — a corp-to-corp worker or a sub-vendor's person — and the
 * candidate is the one who hears the client's business at interview.
 * Where this supplier already has an order from the client, only that
 * order's rows count; where it has none yet, the client's orders to
 * anybody stand in — the same rule the license at submission reads.
 *
 * An NDA is a question an employer may ask before an offer: the rule
 * table puts it at application (`lib/document-stages`). It is asked, not
 * insisted on — the round is booked either way, and the client reads
 * whether it came back before the meeting.
 */
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { askNotice, typeKeyForTemplate } from '@/lib/document-request'
import { builtInType } from '@/lib/document-type'

export interface NdaRow {
  owedBy: string
  required: boolean
  waivedReason: string | null
  /** The firm the order was issued to. */
  issuedToId: string
}

/** A paper already asked of this person for this client. */
export interface NdaAsked {
  status: string
  sentAt: Date | null
  signedAt: Date | null
}

export type NdaVerdict =
  | { ask: false; why: 'NOT_ASKED_BY_THE_JOB' | 'WAIVED_ON_THE_ORDER' }
  | { ask: false; why: 'ALREADY_ASKED' | 'ALREADY_SIGNED'; says: string }
  | { ask: true; says: string }

const PARTIES = ['WORKER', 'SUPPLIER']

/**
 * Whether booking this round asks the candidate for the client's NDA.
 * Pure: the caller reads the rows.
 */
export function ndaAtInterview(input: {
  personName: string
  clientName: string
  supplierCompanyId: string
  /** Whether the client has issued this supplier an order at all. */
  supplierHasOrder: boolean
  rows: NdaRow[]
  asked: NdaAsked[]
}): NdaVerdict {
  const rows = input.rows
    .filter((r) => PARTIES.includes(r.owedBy))
    .filter((r) => !input.supplierHasOrder || r.issuedToId === input.supplierCompanyId)
  const first = rows.find((r) => r.required && !r.waivedReason) ?? rows[0]
  if (!first) return { ask: false, why: 'NOT_ASKED_BY_THE_JOB' }
  if (first.waivedReason || !first.required) return { ask: false, why: 'WAIVED_ON_THE_ORDER' }

  const signed = input.asked.find((a) => a.status === 'SIGNED' || a.status === 'UPLOADED')
  if (signed) {
    return {
      ask: false,
      why: 'ALREADY_SIGNED',
      says: `${input.personName} has already signed ${input.clientName}'s non-disclosure agreement.`,
    }
  }
  const open = input.asked.find((a) => a.status === 'SENT' || a.status === 'PENDING')
  if (open) {
    return {
      ask: false,
      why: 'ALREADY_ASKED',
      says: `${input.personName} has been asked for ${input.clientName}'s non-disclosure agreement and has not signed it yet.`,
    }
  }
  return {
    ask: true,
    says: `${input.personName} has been asked to sign ${input.clientName}'s non-disclosure agreement before the interview, because ${input.clientName}'s orders require one.`,
  }
}

const NDA_LABEL = builtInType('NDA')?.label ?? 'Non-disclosure agreement'

/**
 * Read the set, and ask where it says to. Returns the sentence the
 * booking says, or null where the job asks for no NDA.
 *
 * Never throws into the booking: the round stands whatever happens to
 * the paper, and a failure here is said rather than swallowed.
 */
export async function askForNdaAtInterview(input: {
  clientCompanyId: string
  clientName: string
  supplierCompanyId: string
  personId: string
  personName: string
}): Promise<string | null> {
  const rows = await prisma.documentRequirement.findMany({
    where: { documentTypeKey: 'NDA', workOrder: { issuedById: input.clientCompanyId } },
    select: { owedBy: true, required: true, waivedReason: true, workOrder: { select: { issuedToId: true } } },
  })
  if (rows.length === 0) return null
  const ownOrders = await prisma.workOrder.count({
    where: { issuedById: input.clientCompanyId, issuedToId: input.supplierCompanyId },
  })

  // The client's own papers that are its NDA, read by exact name only: a
  // paper nobody can identify never counts as the one the order asked for.
  const templates = await prisma.docTemplate.findMany({
    where: { companyId: input.clientCompanyId },
    select: { id: true, name: true },
  })
  const ndaTemplates = templates.filter(
    (t) => typeKeyForTemplate(t.name, [{ key: 'NDA', label: NDA_LABEL }], { guess: false }) === 'NDA'
  )
  const asked = ndaTemplates.length
    ? await prisma.docInstance.findMany({
        where: { templateId: { in: ndaTemplates.map((t) => t.id) }, subjectType: 'PERSON', subjectId: input.personId },
        select: { status: true, sentAt: true, signedAt: true },
      })
    : []

  const verdict = ndaAtInterview({
    personName: input.personName,
    clientName: input.clientName,
    supplierCompanyId: input.supplierCompanyId,
    supplierHasOrder: ownOrders > 0,
    rows: rows.map((r) => ({
      owedBy: r.owedBy, required: r.required, waivedReason: r.waivedReason, issuedToId: r.workOrder?.issuedToId ?? '',
    })),
    asked,
  })
  if (!verdict.ask) return 'says' in verdict ? verdict.says : null

  const template =
    ndaTemplates[0] ??
    (await prisma.docTemplate.create({
      data: { companyId: input.clientCompanyId, name: NDA_LABEL, audience: 'CANDIDATE', needsSignature: true },
      select: { id: true, name: true },
    }))
  const now = new Date()
  const paper = await prisma.docInstance.create({
    data: { templateId: template.id, subjectType: 'PERSON', subjectId: input.personId, status: 'SENT', sentAt: now },
    select: { id: true },
  })

  // Told on their own channel, in the words every other ask uses: a
  // candidate with no seat by email, a person with one in the app.
  const notice = askNotice({
    status: 'SENT', templateName: template.name, needsSignature: true,
    subjectPersonId: input.personId, issuerName: input.clientName,
  })
  const seat = await prisma.context.findFirst({
    where: { personId: input.personId, revokedAt: null, type: { not: 'CONSULTANT' } },
    select: { id: true },
  })
  void notify({
    personId: input.personId,
    companyId: input.clientCompanyId,
    type: 'SYSTEM',
    title: notice.title,
    body: notice.body,
    entityId: paper.id,
    channel: seat ? 'IN_APP' : 'EMAIL',
  })
  return verdict.says
}
