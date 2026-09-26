import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { defaultPostureFor } from '@/lib/walls'
import { desksFor, deskPeople, orderedOfSuppliers } from '@/lib/supplier-desks'
import { verificationFromChecklistItem, verificationsFromChecklist, type VerificationToWrite } from '@/lib/onboarding-evidence'
import { sendLink } from '@/lib/supplier-link'
import {
  mayActAt, markItem, readiness, nextStage, withOrderedItems, evidenceNoteFor, whoRendersItem, STAGE_WORD,
  type ChecklistItem, type ItemState, type Decision, type Stage,
} from '@/lib/supplier-onboarding'

/**
 * PATCH /api/supplier-requests/[id]
 *   { action: 'approve', note? }     — the desk it is on says yes; it moves to the next desk, or becomes a supplier
 *   { action: 'decline', note }      — with a reason the recommender reads
 *   { action: 'mark', key, state, note? }   — Procurement verifies (HELD), waives with a reason, or unmarks
 *   { action: 'resend' }             — send the firm its link again
 *
 * The department lead, then Procurement, then HR, then Finance, in that
 * order. Never the recommender, never somebody who decided an earlier
 * desk. Each desk verifies its own items and no other's. Finance's yes
 * writes what the paste flow used to write in one keystroke: a
 * company row (or the real firm, if it is already here under its own
 * domain), an agreement stub, a register row at approved standing, a
 * contact, and an invitation to sign in.
 */
/**
 * Write what a desk verified onto the firm's own compliance record.
 *
 * `documentTypeKey` is resolved to the client's own `DocumentType` row
 * where the client invented the type, so a hot floor induction verified
 * here carries the client's key and not only the closest built-in enum
 * value. A key nobody defined leaves `documentTypeId` null, which is the
 * shipped-type case and is correct.
 *
 * Idempotent on the pair (company, type, the day it runs out): a desk
 * that unmarks an item and marks it again does not leave two rows for
 * one certificate, and two rows for one certificate is how a lapse hides
 * behind its own renewal.
 */
async function recordEvidence(rows: VerificationToWrite[], definedBy: string): Promise<number> {
  if (rows.length === 0) return 0
  const defined = await prisma.documentType.findMany({
    where: { companyId: definedBy, key: { in: [...new Set(rows.map((r) => r.documentTypeKey))] } },
    select: { id: true, key: true },
  })
  const typeId = new Map(defined.map((d) => [d.key, d.id]))

  let written = 0
  for (const r of rows) {
    const already = await prisma.verification.findFirst({
      where: { companyId: r.companyId, type: r.type as never, expiresAt: r.expiresAt },
      select: { id: true },
    })
    if (already) continue
    const { documentTypeKey, ...row } = r
    await prisma.verification.create({
      data: {
        ...row,
        type: row.type as never,
        documentTypeId: typeId.get(documentTypeKey) ?? null,
        // The column is not nullable and a desk verifying a certificate
        // is the person who put it on the record.
        uploadedById: row.uploadedById ?? row.verifiedById ?? '',
      },
    })
    written++
  }
  return written
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Supplier requests')
  if (notStaff) return notStaff
  const companyId = caller.company!.id
  const row = await prisma.supplierRequest.findFirst({ where: { id, companyId } })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That recommendation is not here.' } }, { status: 404 })
  if (row.state === 'APPROVED' || row.state === 'DECLINED') {
    return NextResponse.json({ error: { code: 'DECIDED', message: `${row.name} was already ${row.state.toLowerCase()}.` } }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const now = new Date()
  const stage = row.stage as Stage
  // Merged before anything reads it, so a desk can verify an item this
  // client's orders require that was written after the firm came in. The
  // merge keeps every state already recorded and is saved with the next
  // mark, so it happens once and then stays on the row.
  const checklist = withOrderedItems(
    row.checklist as unknown as ChecklistItem[],
    await orderedOfSuppliers(companyId),
    caller.company!.name
  )
  const decisions = ((row.decisions as unknown as Decision[]) ?? [])
  const desks = await desksFor(companyId, row.recommendedById)

  // Who cannot take this desk, whoever they are: the recommender, and
  // anybody who decided an earlier one.
  const barred = [row.recommendedById, ...decisions.map((d) => d.byId)]

  // Every action here, resending the firm's link included, belongs to
  // the desk the request is on. Resending used to return before this
  // gate, so anybody seated could make the app send a credential.
  const verdict = mayActAt({
    stage, permissions: caller.permissions, callerId: caller.person.id,
    recommendedById: row.recommendedById, decisions, desks, firmName: row.name,
    deskHolders: stage === 'DONE' ? undefined : await deskPeople(companyId, stage, desks),
    companyName: caller.company!.name,
  })
  if (!verdict.ok) return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 403 })

  if (action === 'resend') {
    if (!row.contactEmail) return NextResponse.json({ error: { code: 'NO_CONTACT', message: `${row.name} has no contact email on the recommendation.` } }, { status: 422 })
    const delivery = await sendLink({ to: row.contactEmail, contactName: row.contactName, firmName: row.name, clientName: caller.company!.name, token: row.token })
    await prisma.supplierRequest.update({ where: { id }, data: { linkSentAt: now } })
    return NextResponse.json({ data: { delivery, says: `${row.name} has been sent its link again.` } })
  }

  if (action === 'mark') {
    const key = String(body?.key ?? '')
    const item = checklist.find((i) => i.key === key)
    if (!item) return NextResponse.json({ error: { code: 'VALIDATION', message: 'That is not on the checklist.' } }, { status: 422 })
    if (item.desk !== stage) {
      return NextResponse.json({ error: { code: 'NOT_YOUR_ITEM', message: `${item.label} is ${STAGE_WORD[item.desk]}’s to verify, not this desk’s.` } }, { status: 409 })
    }
    const state = body?.state as ItemState
    if (!['HELD', 'WAIVED', 'MISSING'].includes(state)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Verified, waived or missing.' } }, { status: 422 })
    }
    const dates = {
      validFrom: typeof body?.validFrom === 'string' && body.validFrom.trim() ? body.validFrom.trim() : null,
      validUntil: typeof body?.validUntil === 'string' && body.validUntil.trim() ? body.validUntil.trim() : null,
    }
    const marked = markItem(checklist, key, state, note || null, now, dates)
    if (!marked.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: marked.message } }, { status: 422 })

    // ── What a desk verified becomes cover the product can read ───────
    //
    // HR clears a certificate of insurance here and `/api/compliance`
    // goes on saying the firm has no cover: two records, and only one of
    // them is what every gate actually reads. The translation needs the
    // two dates printed on the certificate, and this is the one moment
    // somebody has it open in front of them — so the desk is asked here
    // rather than the row going green with no expiry, which passes every
    // check until the day somebody audits it.
    //
    // The firm may not be a company on the register yet: the four desks
    // run before Finance writes the supplier row. So the dates are kept
    // on the item whatever happens, and the approval replays them into
    // the record at the first moment an id exists.
    const markedItem = marked.checklist.find((i) => i.key === key)!
    let recorded: { written: number; onRecord: boolean; says: string } | null = null
    if (state === 'HELD') {
      const verdict = verificationFromChecklistItem(
        markedItem,
        // Where the supplier is not on the register yet, the request's
        // own id stands in so the dates are still checked. Nothing is
        // ever written against it — the write below is guarded on the
        // real company id.
        row.supplierCompanyId ?? row.id,
        { personId: caller.person.id, at: now }
      )
      if (!verdict.ok && verdict.needsDates) {
        return NextResponse.json(
          { error: { code: 'NEEDS_DATES', message: verdict.says, field: dates.validFrom ? 'validUntil' : 'validFrom' } },
          { status: 422 }
        )
      }
      if (verdict.ok && row.supplierCompanyId) {
        const written = await recordEvidence(verdict.rows, companyId)
        recorded = { written, onRecord: true, says: verdict.says }
      } else if (verdict.ok) {
        recorded = {
          written: 0,
          onRecord: true,
          says:
            `${markedItem.label} is verified, and its dates are held with the recommendation. ` +
            `They go on ${row.name}'s compliance record the moment Finance approves the firm.`,
        }
      } else {
        // ── The refusal that used to be silent ────────────────────────
        //
        // Neither `ok` nor `needsDates`: a verdict no desk in Etyme
        // renders. A background check is a screening company's opinion
        // and an I-9 is the employer of record's own, so
        // `lib/onboarding-evidence` writes nothing — correctly — and
        // until now said nothing either. The desk watched the tick go
        // green and walked away believing a compliance record existed.
        //
        // It is not an error and the mark is not refused: the item stays
        // verified as this desk's own note, the file the firm sent stays
        // attached, and that is the honest record of what the firm sent.
        // What is said out loud is that nothing went on the compliance
        // record, and whose opinion would have to.
        const note = evidenceNoteFor(markedItem, row.supplierCompanyId ?? row.id, now)
        if (note) recorded = { written: 0, onRecord: note.onRecord, says: note.says }
      }
    }

    const updated = await prisma.supplierRequest.update({ where: { id }, data: { checklist: marked.checklist as unknown as object, state: 'IN_REVIEW' } })

    // Who verified it, and who waived it. The checklist carries the state,
    // the reason and the hour, but not the name — so a waived certificate
    // of insurance read as waived by nobody. A waiver is a desk taking a
    // compliance item on itself, and it is answerable to a person.
    const WORD: Record<ItemState, string> = { HELD: 'verified', WAIVED: 'waived', MISSING: 'unmarked', PROVIDED: 'recorded' } as Record<ItemState, string>
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'SUPPLIER_ITEM_MARKED',
        summary: `${caller.person.name} (${STAGE_WORD[stage]}) ${WORD[state] ?? String(state).toLowerCase()} ${item.label} for ${row.name}`,
        reason: note || (state === 'HELD' ? 'Verified against what the firm supplied.' : 'No reason given.'),
        payload: { supplierRequestId: id, firm: row.name, key, state, desk: stage, byId: caller.person.id },
        // An item can be marked again; a waiver can be taken back.
        reversible: true,
      },
    })

    const ready = readiness(row.name, marked.checklist, stage)
    return NextResponse.json({
      data: {
        request: { ...updated, checklist: marked.checklist },
        readiness: ready,
        recorded,
        says: recorded ? `${recorded.says} ${ready.says}` : ready.says,
      },
    })
  }

  if (action === 'decline') {
    if (!note) return NextResponse.json({ error: { code: 'NEEDS_REASON', message: 'Declining needs a reason the recommender can read.', field: 'note' } }, { status: 422 })
    const decision: Decision = { stage, outcome: 'DECLINED', byId: caller.person.id, byName: caller.person.name, at: now.toISOString(), note }
    const updated = await prisma.supplierRequest.update({
      where: { id },
      data: { state: 'DECLINED', decidedById: caller.person.id, decidedAt: now, decisionNote: note, decisions: [...decisions, decision] as unknown as object },
    })
    // A firm refused is the end of the walk, and the only record of it
    // was the decision array on the row itself. It belongs in the
    // company's own log beside the approval it did not become.
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'SUPPLIER_DECLINED',
        summary: `${row.name} was not approved — declined by ${caller.person.name} at ${STAGE_WORD[stage]}`,
        reason: note,
        payload: { supplierRequestId: id, firm: row.name, desk: stage, byId: caller.person.id },
        // The walk is over. Recommending the firm again starts a new one.
        reversible: false,
      },
    })

    void notify({
      personId: row.recommendedById, companyId, type: 'SYSTEM', entityId: id,
      title: `${row.name} was not approved`, body: `${caller.person.name} (${STAGE_WORD[stage]}): ${note}`, data: { href: '/dashboard/suppliers' },
    })
    return NextResponse.json({ data: { request: updated, says: `${row.name} declined at ${STAGE_WORD[stage]}. The recommender has been told why.` } })
  }

  if (action === 'approve') {
    // A desk with paperwork of its own says yes only when its own items
    // are verified or waived — the lead has none; the rest each have theirs.
    const ready = readiness(row.name, checklist, stage)
    if (!ready.ok) return NextResponse.json({ error: { code: 'PAPERWORK_MISSING', message: ready.says, missing: ready.missing, toVerify: ready.toVerify } }, { status: 409 })
    const decision: Decision = { stage, outcome: 'APPROVED', byId: caller.person.id, byName: caller.person.name, at: now.toISOString(), note: note || null }
    const next = nextStage(stage)

    if (next !== 'DONE') {
      const updated = await prisma.supplierRequest.update({
        where: { id },
        data: { stage: next, state: 'IN_REVIEW', decisions: [...decisions, decision] as unknown as object },
      })
      for (const personId of (await deskPeople(companyId, next, desks, [...barred, caller.person.id])).filter((p) => p !== caller.person.id)) {
        void notify({
          personId, companyId, type: 'SYSTEM', entityId: id, channel: 'EMAIL',
          title: `Supplier to review — ${row.name}`,
          body: `${caller.person.name} (${STAGE_WORD[stage]}) cleared ${row.name}${note ? `: ${note}` : ''}. It is on your desk now.`,
          data: { href: '/dashboard/suppliers' },
        })
      }
      void notify({
        personId: row.recommendedById, companyId, type: 'SYSTEM', entityId: id,
        title: `${row.name} cleared ${STAGE_WORD[stage]}`, body: `${caller.person.name} said yes${note ? `: ${note}` : ''}. Now with ${STAGE_WORD[next]}.`, data: { href: '/dashboard/suppliers' },
      })
      return NextResponse.json({ data: { request: updated, says: `${row.name} cleared ${STAGE_WORD[stage]} and is with ${STAGE_WORD[next]} now.` } })
    }

    // Finance's yes: the last desk, and the one that writes the supplier.
    const claimed = row.domain
      ? await prisma.company.findFirst({ where: { domain: row.domain, claimedAt: { not: null }, isDemo: caller.company!.isDemo }, select: { id: true, name: true } })
      : null
    const supplier = claimed ?? (await prisma.company.create({
      data: {
        name: row.name, slug: await freeSlug(row.name), domain: null, domainVerified: false, kind: 'VENDOR', currency: 'USD',
        outsideAccess: defaultPostureFor('VENDOR'), listedById: companyId, isDemo: caller.company!.isDemo,
      },
      select: { id: true, name: true },
    }))
    const agreementHeld = checklist.find((i) => i.key === 'AGREEMENT')?.state === 'HELD'
    if (!(await prisma.masterAgreement.findFirst({ where: { vendorId: supplier.id, clientId: companyId }, select: { id: true } }))) {
      await prisma.masterAgreement.create({ data: { vendorId: supplier.id, clientId: companyId, paymentTerms: 30, ...(agreementHeld ? { signedAt: now } : {}) } })
    }
    await prisma.counterparty.upsert({
      where: { companyId_otherCompanyId_relationship: { companyId, otherCompanyId: supplier.id, relationship: 'SUPPLIER' } },
      update: { tier: 'APPROVED', status: 'ACTIVE' },
      create: { companyId, otherCompanyId: supplier.id, relationship: 'SUPPLIER', status: 'ACTIVE', tier: 'APPROVED', createdById: caller.person.id },
    })
    if (row.contactEmail) {
      const exists = await prisma.companyContact.findFirst({ where: { companyId, atCompanyId: supplier.id, email: row.contactEmail }, select: { id: true } })
      if (!exists) {
        await prisma.companyContact.create({
          data: { companyId, atCompanyId: supplier.id, name: row.contactName ?? row.contactEmail.split('@')[0], email: row.contactEmail, kind: 'RECRUITING', createdById: caller.person.id },
        })
      }
      await prisma.supplierInvite.upsert({
        where: { byId_email: { byId: companyId, email: row.contactEmail } },
        create: { companyId: supplier.id, byId: companyId, email: row.contactEmail, contactName: row.contactName, domain: row.domain, line: null, token: randomBytes(24).toString('base64url') },
        update: {},
      })
    }
    // ── The firm is on the register, so what four desks verified goes
    //    on its compliance record ───────────────────────────────────
    //
    // The first moment a company id exists. Until now everything the
    // desks verified lived in a JSON blob nobody downstream reads, so a
    // firm HR personally cleared on Tuesday was refused a start on
    // Wednesday for having no cover on file, and the refusal named a
    // certificate sitting in the onboarding record. Only the items with
    // the two dates on them become rows; anything a desk verified
    // without them is reported rather than written, because a
    // certificate with no expiry passes every check until somebody
    // audits it.
    const evidence = verificationsFromChecklist(checklist, supplier.id, { personId: caller.person.id, at: now })
    const recorded = await recordEvidence(evidence.rows, companyId)
    const undated = evidence.skipped.filter((sk) => sk.needsDates)
    // And the ones nothing was written for because no desk here renders
    // them. The approval is the last moment anybody reads this walk, so
    // it says what it did not record and whose opinion each one is —
    // otherwise a firm arrives on the register with a background check
    // ticked by HR and nothing behind it anywhere.
    const labelOf = new Map(checklist.map((i) => [i.key, i.label]))
    const notOurs = evidence.skipped
      .filter((sk) => !sk.needsDates)
      .filter((sk) => whoRendersItem(checklist.find((i) => i.key === sk.key) ?? {}) != null)
      .map((sk) => ({ key: sk.key, label: labelOf.get(sk.key) ?? sk.key, says: sk.says }))

    const updated = await prisma.supplierRequest.update({
      where: { id },
      data: { state: 'APPROVED', stage: 'DONE', decidedById: caller.person.id, decidedAt: now, decisionNote: note || null, supplierCompanyId: supplier.id, decisions: [...decisions, decision] as unknown as object },
    })
    void notify({
      personId: row.recommendedById, companyId, type: 'SYSTEM', entityId: id,
      title: `${row.name} is approved`, body: `${caller.person.name} (Finance) approved ${row.name}, after your lead, Procurement and HR. You can send them a role now.`, data: { href: '/dashboard/suppliers' },
    })
    await prisma.automationLog.create({
      data: {
        companyId, action: 'SUPPLIER_APPROVED',
        summary: `${row.name} approved as a supplier by ${caller.person.name} (Finance), after the department lead, Procurement and HR.`,
        reason: `Recommended by ${await nameOf(row.recommendedById)}: ${row.reason}. ${ready.says}`,
        payload: { requestId: id, supplierCompanyId: supplier.id, checklist: checklist as unknown as object, decisions: [...decisions, decision] as unknown as object },
        reversible: true,
      },
    })
    return NextResponse.json({
      data: {
        request: updated,
        supplier,
        evidence: {
          recorded,
          undated: undated.map((sk) => sk.says),
          notRecorded: notOurs,
        },
        says:
          `${row.name} is a supplier now, at approved standing. Send them a role.` +
          (recorded > 0
            ? ` ${recorded === 1 ? 'The certificate' : `All ${recorded} certificates`} your desks verified ` +
              `${recorded === 1 ? 'is' : 'are'} on their compliance record, and the nightly watch will chase ` +
              `${recorded === 1 ? 'its renewal' : 'the renewals'} before ${recorded === 1 ? 'it runs' : 'they run'} out.`
            : '') +
          (undated.length > 0
            ? ` ${undated.length} verified ${undated.length === 1 ? 'item has' : 'items have'} no dates on ` +
              `${undated.length === 1 ? 'it' : 'them'}, so ${undated.length === 1 ? 'it is' : 'they are'} not on the ` +
              `compliance record yet — open the firm's compliance page and add them.`
            : '') +
          // Said in full, not counted: the sentence names the party
          // whose verdict it is, and a desk that reads "1 item was not
          // recorded" and nothing else is no better off than a desk
          // that read nothing.
          (notOurs.length > 0
            ? ` ${notOurs.map((n) => n.label).join(', ')} ${notOurs.length === 1 ? 'is' : 'are'} not on the ` +
              `compliance record, because ${notOurs.length === 1 ? 'it is' : 'they are'} not this client's to ` +
              `render. ${notOurs.map((n) => n.says).join(' ')}`
            : ''),
      },
    })
  }

  return NextResponse.json({ error: { code: 'VALIDATION', message: 'Approve, decline, mark or resend.' } }, { status: 422 })
}

async function nameOf(id: string): Promise<string> {
  return (await prisma.person.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'somebody'
}

async function freeSlug(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'supplier'
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    if (!(await prisma.company.findUnique({ where: { slug }, select: { id: true } }))) return slug
  }
  return `${base}-${randomBytes(3).toString('hex')}`
}
