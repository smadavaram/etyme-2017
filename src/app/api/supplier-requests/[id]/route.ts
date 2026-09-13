import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { defaultPostureFor } from '@/lib/walls'
import { mayDecide, markItem, readiness, type ChecklistItem, type ItemState } from '@/lib/supplier-onboarding'

/**
 * PATCH /api/supplier-requests/[id]
 *   { action: 'mark', key, state: 'HELD' | 'WAIVED' | 'MISSING', note? }   — Procurement marks the paperwork
 *   { action: 'approve', note? }                                           — refused while a required item is missing
 *   { action: 'decline', note }                                            — with a reason
 *
 * Procurement only, and never the person who recommended the firm.
 * Approval writes what the paste flow used to write in one keystroke:
 * a company row (or the real firm, if it is already here under its own
 * domain), an agreement stub, a register row at APPROVED standing, a
 * contact, and an invitation.
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

  const verdict = mayDecide({ permissions: caller.permissions, callerId: caller.person.id, recommendedById: row.recommendedById, firmName: row.name })
  if (!verdict.ok) return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 403 })
  if (row.state === 'APPROVED' || row.state === 'DECLINED') {
    return NextResponse.json({ error: { code: 'DECIDED', message: `${row.name} was already ${row.state.toLowerCase()}.` } }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const note = typeof body?.note === 'string' ? body.note : null
  const now = new Date()
  const checklist = row.checklist as unknown as ChecklistItem[]

  if (action === 'mark') {
    const state = body?.state as ItemState
    if (!['HELD', 'WAIVED', 'MISSING'].includes(state)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Held, waived or missing.' } }, { status: 422 })
    }
    const marked = markItem(checklist, String(body?.key ?? ''), state, note, now)
    if (!marked.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: marked.message } }, { status: 422 })
    const updated = await prisma.supplierRequest.update({
      where: { id },
      data: { checklist: marked.checklist as unknown as object, state: 'IN_REVIEW' },
    })
    const ready = readiness(row.name, marked.checklist)
    return NextResponse.json({ data: { request: { ...updated, checklist: marked.checklist }, readiness: ready, says: ready.says } })
  }

  if (action === 'decline') {
    if (!note?.trim()) return NextResponse.json({ error: { code: 'NEEDS_REASON', message: 'Declining needs a reason the recommender can read.', field: 'note' } }, { status: 422 })
    const updated = await prisma.supplierRequest.update({
      where: { id }, data: { state: 'DECLINED', decidedById: caller.person.id, decidedAt: now, decisionNote: note.trim() },
    })
    void notify({
      personId: row.recommendedById, companyId, type: 'SYSTEM', entityId: id,
      title: `${row.name} was not approved`, body: `${caller.person.name}: ${note.trim()}`, data: { href: '/dashboard/suppliers' },
    })
    return NextResponse.json({ data: { request: updated, says: `${row.name} declined. ${nameOf(caller)} has been told why.` } })
  }

  if (action === 'approve') {
    const ready = readiness(row.name, checklist)
    if (!ready.ok) return NextResponse.json({ error: { code: 'PAPERWORK_MISSING', message: ready.says, missing: ready.missing } }, { status: 409 })

    // The real firm, if it is already here under its own proven domain;
    // otherwise a shell with no domain at all (see /api/suppliers).
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
      data: { state: 'APPROVED', decidedById: caller.person.id, decidedAt: now, decisionNote: note?.trim() || null, supplierCompanyId: supplier.id },
    })
    void notify({
      personId: row.recommendedById, companyId, type: 'SYSTEM', entityId: id,
      title: `${row.name} is approved`, body: `${caller.person.name} approved ${row.name}. You can send them a role now.`, data: { href: '/dashboard/suppliers' },
    })
    await prisma.automationLog.create({
      data: {
        companyId, action: 'SUPPLIER_APPROVED',
        summary: `${row.name} approved as a supplier by ${caller.person.name}.`,
        reason: `Recommended by ${await recommenderName(row.recommendedById)}: ${row.reason}. ${ready.says}`,
        payload: { requestId: id, supplierCompanyId: supplier.id, checklist: checklist as unknown as object },
        reversible: true,
      },
    })
    return NextResponse.json({ data: { request: updated, supplier, says: `${row.name} is a supplier now, at approved standing. Send them a role.` } })
  }

  return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mark, approve or decline.' } }, { status: 422 })
}

function nameOf(caller: { person: { name: string } }): string { return caller.person.name }

async function recommenderName(id: string): Promise<string> {
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
