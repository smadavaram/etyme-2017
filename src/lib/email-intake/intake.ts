/**
 * One delivery from the mail provider, from signature to row.
 *
 * In order, and each step stops the next:
 *
 *   1. The provider's signature over the raw bytes, before anything is
 *      parsed. Unsigned, stale or wrong is refused.
 *   2. The address: exactly one company, by the hash of its token, with
 *      the intake turned on. None, two, or off is dropped.
 *   3. The sender: SPF and DKIM passed and aligned, as the receiving
 *      server found them. Then the sender must be seated at that company.
 *   4. The files: allowed types only, read from their bytes, under the
 *      caps. A disguise drops the message; anything else not allowed is
 *      refused on its own.
 *   5. The body as plain text, and the sort, by rules only.
 *
 * Every delivery writes its row, accepted or dropped, before the answer
 * goes back (the refusal-logged-first rule): `receiveDelivery` returns
 * only after the write, and a write that fails answers 500 so the
 * provider tries again rather than the message passing unrecorded.
 *
 * Nothing here acts on what an email says. The most an email becomes is
 * a draft a person says yes or no to, drawn by whoever owns its kind.
 */
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { intakeAddressesIn, type ParsedAddress } from './address'
import { verifyDelivery, INTAKE_SECRET_ENV } from './signature'
import { bareAddress, checkSender } from './sender'
import { plainBody, plainSubject } from './plain-text'
import {
  FILE_CAP_BYTES, MAX_ATTACHMENTS, MESSAGE_CAP_BYTES, judgeAttachment, judgeDeclared, type AllowedType,
} from './attachments'
import { downloadAttachment, readReceived, ProviderError, type ReceivedEmail } from './provider'
import { applyModelFill, originalSenderIn, sortEmail, splitForward, type ModelStep, type OwnNumbers, type RegisterEntry, type RegisterRelationship } from './sort'

/** A delivery's raw body may not exceed this; the webhook carries only an envelope. */
export const DELIVERY_CAP_BYTES = 256 * 1024

/**
 * The masked model step. Empty in this build, on purpose: no model reads
 * a forwarded email until the masking at the edge exists and the company
 * has turned the model on. When it is filled it may only fill the fixed
 * fields the rules left empty (`applyModelFill`).
 */
export const MODEL_STEP: ModelStep | null = null

export interface Delivery {
  raw: string
  id: string | null
  timestamp: string | null
  signature: string | null
  now: Date
}

export interface DeliveryOutcome {
  status: number
  verdict: 'ACCEPTED' | 'DROPPED' | 'ALREADY' | 'NOT_RECORDED'
  code: string
  says: string
  inboundEmailId: string | null
}

interface DropRow {
  companyId?: string | null
  providerEmailId?: string | null
  recipientHint?: string | null
  forwarderAddress?: string | null
  forwarderPersonId?: string | null
  forwarderContextId?: string | null
  spf?: string | null
  dkim?: string | null
  dmarc?: string | null
  attachmentLog?: unknown
  code: string
  says: string
}

function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/** Write a dropped message's row, and its automation row where it reached a company. Awaited. */
async function drop(row: DropRow, status: number): Promise<DeliveryOutcome> {
  try {
    const written = await prisma.$transaction(async (tx) => {
      const r = await tx.inboundEmail.create({
        data: {
          companyId: row.companyId ?? null,
          providerEmailId: row.providerEmailId ?? null,
          recipientHint: row.recipientHint ?? null,
          forwarderAddress: row.forwarderAddress ?? null,
          forwarderPersonId: row.forwarderPersonId ?? null,
          forwarderContextId: row.forwarderContextId ?? null,
          verdict: 'DROPPED',
          reasonCode: row.code,
          reason: row.says,
          spf: row.spf ?? null,
          dkim: row.dkim ?? null,
          dmarc: row.dmarc ?? null,
          attachmentLog: (row.attachmentLog ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        select: { id: true },
      })
      if (row.companyId) {
        await tx.automationLog.create({
          data: {
            companyId: row.companyId,
            action: 'EMAIL_INTAKE_DROPPED',
            summary: 'A message sent to the company’s forwarding address was dropped and never shown.',
            reason: row.says,
            payload: { inboundEmailId: r.id, reasonCode: row.code },
            // Nothing was made; there is nothing to put back.
            reversible: false,
          },
        })
      }
      return r
    })
    return { status, verdict: 'DROPPED', code: row.code, says: row.says, inboundEmailId: written.id }
  } catch (err) {
    if (isUnique(err)) {
      return { status: 200, verdict: 'ALREADY', code: 'ALREADY', says: 'This email was already recorded.', inboundEmailId: null }
    }
    await reportError('email-intake', err).catch(() => undefined)
    return { status: 500, verdict: 'NOT_RECORDED', code: 'NOT_RECORDED', says: 'The message could not be recorded, so it was not accepted. The provider will send it again.', inboundEmailId: null }
  }
}

/** The register and the numbers the sort reads, for one company. */
async function sortContext(companyId: string): Promise<{ register: RegisterEntry[]; numbers: OwnNumbers }> {
  const [cps, orders, bills, receipts] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { otherCompanyId: true, relationship: true, otherCompany: { select: { domain: true } } },
      take: 2000,
    }),
    prisma.workOrder.findMany({
      where: { OR: [{ issuedById: companyId }, { issuedToId: companyId }] },
      select: { number: true, sellerNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    }),
    prisma.invoice.findMany({ where: invoicesRaisedBy(companyId) as Prisma.InvoiceWhereInput, select: { number: true }, orderBy: { dueAt: 'desc' }, take: 5000 }),
    prisma.vendorBill.findMany({ where: { companyId }, select: { number: true }, orderBy: { createdAt: 'desc' }, take: 5000 }),
  ])
  const register: RegisterEntry[] = []
  for (const c of cps) {
    const domain = c.otherCompany.domain?.toLowerCase()
    if (!domain || !['CLIENT', 'SUPPLIER', 'PRIME', 'MSP'].includes(c.relationship)) continue
    register.push({ domain, companyId: c.otherCompanyId, relationship: c.relationship as RegisterRelationship })
  }
  return {
    register,
    numbers: {
      orders: orders.flatMap((o) => [o.number, o.sellerNumber].filter((n): n is string => !!n)),
      bills: bills.map((b) => b.number),
      receipts: receipts.map((r) => r.number),
    },
  }
}

interface AttachmentLogEntry {
  fileName: string
  declaredType: string | null
  realType: string | null
  sizeBytes: number | null
  kept: boolean
  code?: string
  says?: string
  activeContent?: boolean
}

export async function receiveDelivery(d: Delivery): Promise<DeliveryOutcome> {
  // 1 ── The signature, before a byte of the body is read as anything.
  if (Buffer.byteLength(d.raw, 'utf8') > DELIVERY_CAP_BYTES) {
    return drop({ code: 'DELIVERY_TOO_LARGE', says: 'This delivery was larger than the mail provider ever sends, so nothing in it was read.' }, 413)
  }
  const signed = verifyDelivery({ secret: process.env[INTAKE_SECRET_ENV], id: d.id, timestamp: d.timestamp, signature: d.signature, body: d.raw, now: d.now })
  if (!signed.ok) return drop({ code: signed.code, says: signed.says }, signed.status)

  // Signed, so now it is read.
  let event: any
  try {
    event = JSON.parse(d.raw)
  } catch {
    return drop({ code: 'NOT_JSON', says: 'This delivery was signed but could not be read, so it was dropped.' }, 400)
  }
  if (event?.type !== 'email.received' || typeof event?.data?.email_id !== 'string') {
    return drop({ code: 'NOT_AN_EMAIL', says: 'This delivery was not a received email, so nothing was kept.' }, 200)
  }
  const data = event.data
  const emailId: string = data.email_id

  const already = await prisma.inboundEmail.findUnique({ where: { providerEmailId: emailId }, select: { id: true } })
  if (already) return { status: 200, verdict: 'ALREADY', code: 'ALREADY', says: 'This email was already recorded.', inboundEmailId: already.id }

  // 2 ── The address: one company, by its token, turned on.
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const addressed = intakeAddressesIn([...strings(data.to), ...strings(data.cc), ...strings(data.bcc), ...strings(data.received_for)])
  if (addressed.length === 0) {
    return drop({ providerEmailId: emailId, code: 'NOT_AN_INTAKE_ADDRESS', says: 'This message was not sent to a forwarding address, so it reached no company.' }, 200)
  }
  const intakes = await prisma.emailIntake.findMany({
    where: { tokenHash: { in: addressed.map((a) => a.tokenHash) } },
    select: { companyId: true, enabled: true, addressLabel: true, tokenHash: true },
  })
  const matched: { intake: (typeof intakes)[number]; address: ParsedAddress }[] = []
  for (const i of intakes) {
    const a = addressed.find((x) => x.tokenHash === i.tokenHash)
    // The readable half must be the company's own as well; a token under somebody else's label is not this address.
    if (a && a.label === i.addressLabel) matched.push({ intake: i, address: a })
  }
  const companies = [...new Set(matched.map((m) => m.intake.companyId))]
  if (companies.length === 0) {
    return drop({ providerEmailId: emailId, recipientHint: addressed[0].hint, code: 'NO_COMPANY', says: 'This address belongs to no company, or was replaced, so the message reached nobody.' }, 200)
  }
  if (companies.length > 1) {
    return drop({ providerEmailId: emailId, code: 'TWO_COMPANIES', says: 'This message was sent to the forwarding addresses of two companies, so it reached neither.' }, 200)
  }
  const { intake, address } = matched[0]
  const companyId = intake.companyId
  if (!intake.enabled) {
    return drop({ companyId, providerEmailId: emailId, recipientHint: address.hint, code: 'INTAKE_OFF', says: 'Forwarded email is turned off for this company, so the message was dropped.' }, 200)
  }

  // 3 ── The sender, as the receiving server checked it, then the seat.
  let email: ReceivedEmail
  try {
    email = await readReceived(emailId)
  } catch (err) {
    const retry = err instanceof ProviderError ? err.retry : true
    // No provider id on this row, so the provider's next attempt is read afresh.
    return drop({
      companyId,
      recipientHint: address.hint,
      code: 'PROVIDER_UNREADABLE',
      says: `The message could not be read from the mail provider${retry ? ', so it was not kept and the provider will send it again' : ', so it was dropped'}.`,
    }, retry ? 503 : 200)
  }
  const auth = email.authentication
  const from = bareAddress(email.from ?? (typeof data.from === 'string' ? data.from : null))
  const authCols = { spf: auth?.spf ?? null, dkim: auth?.dkim ?? null, dmarc: auth?.dmarc ?? null }
  const sender = checkSender({ from, returnPath: email.headers['return-path'] ?? null, auth })
  if (!sender.ok) {
    return drop({ companyId, providerEmailId: emailId, recipientHint: address.hint, forwarderAddress: from, ...authCols, code: sender.code, says: sender.says }, 200)
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } })
  const seat = await prisma.context.findFirst({
    where: { companyId, type: 'EMPLOYEE', revokedAt: null, person: { primaryEmail: from! } },
    select: { id: true, personId: true },
    orderBy: { id: 'asc' },
  })
  if (!seat) {
    return drop({
      companyId, providerEmailId: emailId, recipientHint: address.hint, forwarderAddress: from, ...authCols,
      code: 'NOT_SEATED',
      says: `${from} holds no seat at ${company.name}, so the message was dropped. Only the company’s own people may forward to this address.`,
    }, 200)
  }
  const who = { companyId, providerEmailId: emailId, recipientHint: address.hint, forwarderAddress: from, forwarderPersonId: seat.personId, forwarderContextId: seat.id, ...authCols }

  // 4 ── The files.
  const log: AttachmentLogEntry[] = []
  const kept: { fileName: string; contentType: AllowedType; bytes: Uint8Array; sha256: string }[] = []
  if (email.attachments.length > MAX_ATTACHMENTS) {
    return drop({ ...who, code: 'TOO_MANY_FILES', says: `The message carried ${email.attachments.length} files, more than the ${MAX_ATTACHMENTS} one message may, so it was dropped.` }, 200)
  }
  const declaredTotal = email.attachments.reduce((n, a) => n + (a.sizeBytes ?? 0), 0)
  if (declaredTotal > MESSAGE_CAP_BYTES) {
    return drop({ ...who, code: 'MESSAGE_TOO_LARGE', says: 'The message’s files come to more than 25 MB, so it was dropped.' }, 200)
  }
  let total = 0
  for (const a of email.attachments) {
    const early = judgeDeclared({ fileName: a.fileName, sizeBytes: a.sizeBytes, disposition: a.disposition })
    if (early && !early.keep) {
      log.push({ fileName: a.fileName, declaredType: a.contentType, realType: null, sizeBytes: a.sizeBytes, kept: false, code: early.code, says: early.says })
      if (early.severity === 'DISGUISED') return drop({ ...who, attachmentLog: log, code: 'ATTACHMENT_DISGUISED', says: early.says }, 200)
      continue
    }
    if (!a.downloadUrl) {
      log.push({ fileName: a.fileName, declaredType: a.contentType, realType: null, sizeBytes: a.sizeBytes, kept: false, code: 'NOT_READABLE', says: `${a.fileName} could not be read from the provider, so it was not kept.` })
      continue
    }
    let bytes: Uint8Array | 'TOO_LARGE'
    try {
      bytes = await downloadAttachment(a.downloadUrl, FILE_CAP_BYTES)
    } catch (err) {
      const retry = err instanceof ProviderError ? err.retry : true
      return drop({ ...who, providerEmailId: retry ? null : emailId, attachmentLog: log, code: 'PROVIDER_UNREADABLE', says: `${a.fileName} could not be read from the mail provider, so the message was not kept${retry ? ' and the provider will send it again' : ''}.` }, retry ? 503 : 200)
    }
    if (bytes === 'TOO_LARGE') {
      log.push({ fileName: a.fileName, declaredType: a.contentType, realType: null, sizeBytes: null, kept: false, code: 'TOO_LARGE', says: `${a.fileName} is larger than 10 MB, so it was not kept.` })
      continue
    }
    const v = judgeAttachment(a.fileName, bytes)
    if (!v.keep) {
      log.push({ fileName: a.fileName, declaredType: a.contentType, realType: null, sizeBytes: bytes.byteLength, kept: false, code: v.code, says: v.says })
      if (v.severity === 'DISGUISED') return drop({ ...who, attachmentLog: log, code: 'ATTACHMENT_DISGUISED', says: v.says }, 200)
      continue
    }
    total += bytes.byteLength
    if (total > MESSAGE_CAP_BYTES) {
      return drop({ ...who, attachmentLog: log, code: 'MESSAGE_TOO_LARGE', says: 'The message’s files come to more than 25 MB, so it was dropped.' }, 200)
    }
    log.push({ fileName: a.fileName, declaredType: a.contentType, realType: v.contentType, sizeBytes: bytes.byteLength, kept: true, activeContent: v.activeContent || undefined })
    kept.push({ fileName: a.fileName.slice(0, 255), contentType: v.contentType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
  }

  // 5 ── Plain text, then the sort, by rules only.
  const subject = plainSubject(email.subject)
  const body = plainBody({ text: email.text, html: email.html })
  const ctx = await sortContext(companyId)
  const sorted = sortEmail({
    subject,
    body,
    originalSender: null,
    register: ctx.register,
    numbers: ctx.numbers,
    attachments: kept.map((k) => ({ fileName: k.fileName, contentType: k.contentType })),
  })
  // The slot for the masked model step; empty in this build, so the rules' fields stand.
  const fields = applyModelFill(sorted.fields, null, false)
  const originalSender = originalSenderIn(splitForward(body).forwarded)

  try {
    const row = await prisma.$transaction(async (tx) => {
      const r = await tx.inboundEmail.create({
        data: {
          ...who,
          originalSender,
          verdict: 'ACCEPTED',
          reasonCode: 'ACCEPTED',
          reason: `Forwarded by ${from}, who is seated at ${company.name}; SPF and DKIM passed for ${from!.slice(from!.indexOf('@') + 1)}.`,
          subject,
          body,
          kind: sorted.kind,
          sortReasons: sorted.reasons,
          fields: fields as unknown as Prisma.InputJsonValue,
          attachmentLog: log as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      if (kept.length) {
        await tx.inboundEmailAttachment.createMany({
          data: kept.map((k) => ({
            inboundEmailId: r.id,
            fileName: k.fileName,
            contentType: k.contentType,
            sizeBytes: k.bytes.byteLength,
            bytes: Buffer.from(k.bytes),
            sha256: k.sha256,
          })),
        })
      }
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'EMAIL_INTAKE_SORTED',
          summary: sorted.kind === 'UNSORTED'
            ? 'A forwarded email was checked and kept as a draft for a person to sort.'
            : `A forwarded email was checked and sorted, by rules, as ${sorted.kind.toLowerCase().replace(/_/g, ' ')}, a draft for a person to say yes or no to.`,
          reason: sorted.reasons.join(' ') || 'Sorted by rules.',
          payload: { inboundEmailId: r.id, kind: sorted.kind, forwarderPersonId: seat.personId, files: kept.length },
          // A draft only: nothing became a record, and a person can set it aside.
          reversible: true,
        },
      })
      return r
    })
    return { status: 200, verdict: 'ACCEPTED', code: 'ACCEPTED', says: 'Accepted and sorted for a person to decide.', inboundEmailId: row.id }
  } catch (err) {
    if (isUnique(err)) return { status: 200, verdict: 'ALREADY', code: 'ALREADY', says: 'This email was already recorded.', inboundEmailId: null }
    await reportError('email-intake', err).catch(() => undefined)
    return { status: 500, verdict: 'NOT_RECORDED', code: 'NOT_RECORDED', says: 'The message could not be recorded, so it was not accepted. The provider will send it again.', inboundEmailId: null }
  }
}
