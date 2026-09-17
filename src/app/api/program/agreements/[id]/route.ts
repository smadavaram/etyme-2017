import { NextRequest, NextResponse } from 'next/server'
import {
  STATUS_SAYS,
  daysUntilExpiry,
  isRenewalKind,
  mayAmend,
  termSays,
  whatChanged,
} from '@/lib/agreement-term'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { ensureBaseline, recordVersion, type TermSnapshot } from '../trail'
import { paymentDaysSays, marginFloorSays } from '../verdict'

/**
 * PATCH /api/program/agreements/[id]
 *
 * The terms of a master agreement: payment days, margin floor, headcount
 * cap, currency, and the date somebody actually signed it.
 *
 * ── Why only the vendor ──────────────────────────────────────────────
 *
 * The margin floor is the selling firm's own pricing policy — the number
 * below which a recruiter needs approval. It is not a term of the deal and
 * the client should never see it, let alone set it. The rest of the terms
 * are bilateral in life and unilateral here, because Phase 1 is vendor-
 * side: the vendor is recording what was agreed, not negotiating it in the
 * product. When the client portal lands this becomes a proposal both sides
 * accept, and that is a different endpoint rather than a looser check.
 *
 * ── Why the signature is not set here any more ───────────────────────
 *
 * It used to be, and it was a date somebody typed with nobody's name
 * behind it. `POST /api/program/agreements/[id]/sign` records who signed,
 * on which side, with what title, and `signedAt` is written from those
 * rows when both sides have signed. A date with no signer answers none of
 * the questions anybody asks of a signature.
 *
 * ── Why a permission ─────────────────────────────────────────────────
 *
 * Any seat at the vendor could change the payment days, the margin floor
 * and the signature date. Payment days decide when every invoice under
 * this agreement falls due and the margin floor decides what a recruiter
 * may price at, so this is the pricing desk's work: `rates.write`, which
 * the Owner, the Admin and the Contract Manager hold. `settings.manage`
 * passes too, because at a four-person firm the owner is the whole desk.
 *
 * ── Why every change writes a version row ────────────────────────────
 *
 * This route overwrote the terms in place, so "what were the payment days
 * on 3 March" had no answer. See `../trail`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You must belong to a company.' } },
      { status: 403 }
    )
  }

  const agreement = await prisma.masterAgreement.findUnique({
    where: { id },
    select: {
      id: true,
      vendorId: true,
      clientId: true,
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      // The terms as they stand, so the trail can record what they were
      // as well as what they became.
      paymentTerms: true,
      paymentTermsFrom: true,
      currency: true,
      minMarginPct: true,
      capacity: true,
      disclosesSubVendors: true,
      effectiveDate: true,
      expiresAt: true,
      renewalKind: true,
      renewalMonths: true,
      noticeDays: true,
      status: true,
      signedAt: true,
      executedFileName: true,
      createdAt: true,
    },
  })

  if (!agreement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such agreement.' } },
      { status: 404 }
    )
  }

  if (agreement.vendorId !== companyId) {
    const asClient = agreement.clientId === companyId
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message: asClient
            ? `These are ${agreement.vendor.name}'s terms to record. You can read them here and they change them.`
            : 'You are not a party to this agreement.',
        },
      },
      { status: 403 }
    )
  }

  // The pricing desk's work, not everybody's. Said as a sentence: a
  // disabled button with no words is how somebody concludes the product
  // is broken.
  if (
    !hasPermission(caller.permissions, 'rates.write') &&
    !hasPermission(caller.permissions, 'settings.manage')
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_ALLOWED',
          message:
            'Changing the terms of an agreement is the contracting desk’s work — payment ' +
            'days decide when every invoice under it falls due, and the margin floor decides ' +
            'what anybody may price at. Ask an owner to give you rate permissions, or ask ' +
            'your contract manager to make the change.',
        },
      },
      { status: 403 }
    )
  }

  // An ended agreement is a historical document. Amending one would
  // rewrite what a closed engagement was billed under.
  const amendable = mayAmend(agreement.status)
  if (!amendable.ok) {
    return NextResponse.json(
      { error: { code: 'AGREEMENT_ENDED', message: amendable.says } },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if ('paymentTerms' in body) {
    const days = body.paymentTerms
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 365) {
      return bad('Payment terms are whole days between 0 and 365.', 'paymentTerms')
    }
    data.paymentTerms = days
  }

  if ('minMarginPct' in body) {
    const pct = body.minMarginPct
    if (pct !== null) {
      if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 0 || pct > 99) {
        // 100% would mean paying nothing, which is not a floor, it is a
        // typo that would flag every placement on the agreement.
        return bad('A margin floor is a whole percentage between 0 and 99, or nothing at all.', 'minMarginPct')
      }
    }
    data.minMarginPct = pct
  }

  if ('capacity' in body) {
    const cap = body.capacity
    if (cap !== null) {
      if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1) {
        // Null is uncapped. Zero would read as an agreement that permits
        // nobody, which nobody would ever sign.
        return bad('Capacity is at least one person, or nothing at all for uncapped.', 'capacity')
      }
    }
    data.capacity = cap
  }

  // ── Whose name the client may read ──────────────────────────────────
  //
  // (etyme-architect, 2026-09-17. A cross-domain line in etyme-demand's
  // file, on the precedent of c126c1c4 and f901e914: the rule that a
  // sub-vendor's name is the prime's to keep is one sentence, and the
  // only place the term can be recorded is the route that already
  // versions every other term. Nothing else in this file was touched.)
  //
  // Recorded here by the supplier, the way every other term on this
  // endpoint is, because Phase 1 is vendor-side and the vendor is writing
  // down what was agreed. Recording is not granting: a client that did
  // not demand this at signing does not get it because somebody ticked a
  // box, and the version trail is what makes that auditable.
  if ('disclosesSubVendors' in body) {
    const discloses = body.disclosesSubVendors
    if (typeof discloses !== 'boolean') {
      return bad(
        'Say yes or no: does this agreement require the sub-vendors behind a placement ' +
          'to be named to the client?',
        'disclosesSubVendors'
      )
    }
    data.disclosesSubVendors = discloses
  }

  if ('currency' in body) {
    const cur = body.currency
    if (typeof cur !== 'string' || !/^[A-Z]{3}$/.test(cur)) {
      return bad('Currency is a three-letter code.', 'currency')
    }
    data.currency = cur
  }

  // ── The term ────────────────────────────────────────────────────────

  if ('effectiveDate' in body) {
    const d = readDate(body.effectiveDate)
    if (d === 'BAD') return bad('That is not a date. Give the day the agreement starts.', 'effectiveDate')
    data.effectiveDate = d
  }

  if ('expiresAt' in body) {
    const d = readDate(body.expiresAt)
    if (d === 'BAD') return bad('That is not a date. Give the day the agreement runs out.', 'expiresAt')
    data.expiresAt = d
  }

  if ('renewalKind' in body) {
    const kind = body.renewalKind
    if (typeof kind !== 'string' || !isRenewalKind(kind)) {
      return bad(
        'Say how this agreement renews: it runs to a fixed date, it rolls on with no end ' +
          'date, or it renews itself for a further term.',
        'renewalKind'
      )
    }
    data.renewalKind = kind
  }

  if ('renewalMonths' in body) {
    const months = body.renewalMonths
    if (months !== null) {
      if (typeof months !== 'number' || !Number.isInteger(months) || months < 1 || months > 120) {
        return bad('A renewal term is a whole number of months between 1 and 120.', 'renewalMonths')
      }
    }
    data.renewalMonths = months
  }

  if ('noticeDays' in body) {
    const days = body.noticeDays
    if (days !== null) {
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 365) {
        return bad('A notice period is whole days between 0 and 365, or nothing at all.', 'noticeDays')
      }
    }
    data.noticeDays = days
  }

  // ── The executed document ───────────────────────────────────────────

  if ('executedFileName' in body || 'executedFileUrl' in body) {
    const name = body.executedFileName
    const url = body.executedFileUrl
    if (name === null || url === null) {
      data.executedFileName = null
      data.executedFileUrl = null
      data.executedFileHash = null
    } else {
      if (typeof name !== 'string' || !name.trim()) {
        return bad('Name the file, so somebody opening this later knows what they are looking at.', 'executedFileName')
      }
      if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
        return bad('Give a link to the executed copy, starting http:// or https://.', 'executedFileUrl')
      }
      data.executedFileName = name.trim()
      data.executedFileUrl = url.trim()
      if ('executedFileHash' in body && typeof body.executedFileHash === 'string') {
        data.executedFileHash = body.executedFileHash.trim() || null
      }
    }
  }

  // The signature is no longer a date somebody types. It is two named
  // people on /sign, and `signedAt` is written from them.
  if ('signedAt' in body) {
    return bad(
      'A signature is who signed, on which side, with what title. Record it on the ' +
        'agreement’s Signing panel — the date on its own says nothing about authority.',
      'signedAt'
    )
  }

  if (Object.keys(data).length === 0) {
    return bad('Nothing to change.', null)
  }

  // What actually moved, in the trade's words. A form re-saved without a
  // change is not an amendment, and a trail that records one is a trail
  // nobody can read.
  const before: TermSnapshot = {
    paymentTerms: agreement.paymentTerms,
    paymentTermsFrom: agreement.paymentTermsFrom,
    currency: agreement.currency,
    minMarginPct: agreement.minMarginPct,
    capacity: agreement.capacity,
    disclosesSubVendors: agreement.disclosesSubVendors,
    effectiveDate: agreement.effectiveDate,
    expiresAt: agreement.expiresAt,
    renewalKind: agreement.renewalKind,
    renewalMonths: agreement.renewalMonths,
    noticeDays: agreement.noticeDays,
    status: agreement.status,
    signedAt: agreement.signedAt,
    executedFileName: agreement.executedFileName,
  }

  const changed = whatChanged(before as unknown as Record<string, unknown>, data)
  if (changed.length === 0) {
    return bad('Nothing to change — those are already the terms on file.', null)
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  // The trail has to start before the change, or it answers "what did it
  // become" and never "what was it".
  // Dated when the agreement was recorded, because that is when those
  // terms came into being. Dating it now would make every amendment look
  // like it happened on the same day as the agreement itself, and
  // `termsOn` would answer "nothing" for every day before today.
  await ensureBaseline(id, before, agreement.createdAt)

  const updated = await prisma.masterAgreement.update({
    where: { id },
    data,
    select: {
      id: true,
      paymentTerms: true,
      minMarginPct: true,
      capacity: true,
      currency: true,
      disclosesSubVendors: true,
      signedAt: true,
      effectiveDate: true,
      expiresAt: true,
      renewalKind: true,
      renewalMonths: true,
      noticeDays: true,
      status: true,
      endedAt: true,
      executedFileName: true,
      executedFileUrl: true,
    },
  })

  const changedById = realPersonId(caller)

  const written = await recordVersion({
    agreementId: id,
    action: data.executedFileName !== undefined && changed.length === 1 ? 'DOCUMENT_ATTACHED' : 'AMENDED',
    changed,
    changedById,
    reason: reason || null,
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'AGREEMENT_AMENDED',
      summary:
        `${caller.person.name} changed ${changed.join(', ')} on the agreement with ` +
        `${agreement.client.name}${written ? ` — amendment ${written.version}` : ''}.`,
      reason: reason || 'Amended on the agreements screen. No reason was given.',
      payload: {
        agreementId: id,
        counterparty: agreement.client.name,
        changed,
        version: written?.version ?? null,
      },
      // The prior terms are on the version row, so the change can be put
      // back by hand. Nothing here reverses it automatically.
      reversible: true,
    },
  })

  const now = new Date()
  const term = {
    status: updated.status,
    effectiveDate: updated.effectiveDate,
    expiresAt: updated.expiresAt,
    renewalKind: updated.renewalKind,
    renewalMonths: updated.renewalMonths,
    noticeDays: updated.noticeDays,
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      terms: {
        paymentTermsDays: updated.paymentTerms,
        paymentTermsSays: paymentDaysSays(updated.paymentTerms),
        minMarginPct: updated.minMarginPct,
        marginFloorSays: marginFloorSays(updated.minMarginPct),
        capacity: updated.capacity,
        currency: updated.currency,
        disclosesSubVendors: updated.disclosesSubVendors,
        disclosureSays: updated.disclosesSubVendors
          ? 'Sub-vendors are named to the client.'
          : 'Sub-vendors are the supplier\u2019s own; the client sees their standing, not their names.',
        signedAt: updated.signedAt?.toISOString() ?? null,
        effectiveDate: updated.effectiveDate?.toISOString() ?? null,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        renewalKind: updated.renewalKind,
        renewalMonths: updated.renewalMonths,
        noticeDays: updated.noticeDays,
      },
      status: updated.status,
      statusSays: STATUS_SAYS[updated.status as keyof typeof STATUS_SAYS] ?? updated.status,
      termSays: termSays(term, now, updated.endedAt),
      daysToExpiry: daysUntilExpiry(updated.expiresAt, now),
      executedDocument: updated.executedFileName
        ? { fileName: updated.executedFileName, fileUrl: updated.executedFileUrl }
        : null,
      amendment: written?.version ?? null,
      changed,
      changedBy: changedById,
      says:
        `Amendment ${written?.version ?? ''} against ${agreement.client.name}: ` +
        `${changed.join(', ')} changed.`.replace('  ', ' '),
    },
  })
}

/** A date, null to clear it, or 'BAD' where it is neither. */
function readDate(value: unknown): Date | null | 'BAD' {
  if (value === null || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') return 'BAD'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'BAD' : d
}

function bad(message: string, field: string | null) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 400 }
  )
}
