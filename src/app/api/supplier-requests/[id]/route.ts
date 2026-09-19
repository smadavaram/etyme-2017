import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { defaultPostureFor } from '@/lib/walls'
import { desksFor, deskPeople } from '@/lib/supplier-desks'
import { sendLink } from '@/lib/supplier-link'
import {
  mayActAt, markItem, readiness, nextStage, STAGE_WORD,
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
  const checklist = row.checklist as unknown as ChecklistItem[]
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
    const marked = markItem(checklist, key, state, note || null, now)
    if (!marked.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: marked.message } }, { status: 422 })
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
    return NextResponse.json({ data: { request: { ...updated, checklist: marked.checklist }, readiness: ready, says: ready.says } })
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
    return NextResponse.json({ data: { request: updated, supplier, says: `${row.name} is a supplier now, at approved standing. Send them a role.` } })
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
