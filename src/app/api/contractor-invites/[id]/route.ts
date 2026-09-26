import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { newChecklist } from '@/lib/supplier-onboarding'
import { newApplyToken, applyUrl, sendLink } from '@/lib/supplier-link'
import { desksFor, deskPeople } from '@/lib/supplier-desks'
import { says, type Answer, type InviteState } from '@/lib/contractor-invite'

/**
 * PATCH /api/contractor-invites/[id]
 *
 * The client's side of an answer it has to act on:
 *
 *   pick     name one of our own approved suppliers to take them on
 *   sponsor  start the four desks on the firm they named
 *   withdraw stop asking
 *
 * Both of the first two end with a supplier holding the paper, which is
 * the whole point: the client never becomes the employer, and Etyme
 * never places anybody.
 */

const WHO = 'Acting on an ask is for whoever raises requirements here.'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Acting on an ask')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: WHO } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const now = new Date()

  const row = await prisma.contractorInvitation.findFirst({ where: { id, companyId } })
  if (!row) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That ask is not yours.' } }, { status: 404 })
  }
  const state = row.state as InviteState
  const answer = row.answer as unknown as Answer | null
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action ?? '')

  if (action === 'withdraw') {
    await prisma.contractorInvitation.update({ where: { id }, data: { state: 'WITHDRAWN' } })
    return NextResponse.json({ data: { state: 'WITHDRAWN', says: `${row.name} will not be chased, and their link no longer works.` } })
  }

  if (state === 'JOINED' || state === 'WITHDRAWN' || state === 'DECLINED') {
    return NextResponse.json(
      { error: { code: 'SETTLED', message: `${row.name} is already ${says({ state, name: row.name, answer, supplierName: null }).now.replace(/^.*? /, '')}` } },
      { status: 409 }
    )
  }
  if (state === 'ASKED') {
    return NextResponse.json(
      { error: { code: 'NOT_ANSWERED', message: `${row.name.split(' ')[0]} has not answered yet. There is nothing to decide until they do.` } },
      { status: 409 }
    )
  }

  // ── Pick one of our own suppliers to take them on ──────────────────
  if (action === 'pick') {
    const supplierId = typeof body?.supplierCompanyId === 'string' ? body.supplierCompanyId : ''
    const approved = await prisma.counterparty.findFirst({
      where: { companyId, otherCompanyId: supplierId, relationship: 'SUPPLIER', tier: { in: ['APPROVED', 'PREFERRED'] } },
      select: { otherCompany: { select: { id: true, name: true } } },
    })
    if (!approved) {
      return NextResponse.json(
        { error: { code: 'NOT_A_SUPPLIER', message: 'Pick a supplier you have approved. A firm on probation cannot be handed somebody.' } },
        { status: 409 }
      )
    }
    await prisma.contractorInvitation.update({
      where: { id },
      data: { state: 'REPRESENTED', supplierCompanyId: approved.otherCompany.id },
    })
    await tellSupplier(approved.otherCompany.id, approved.otherCompany.name)
    return NextResponse.json({
      data: {
        state: 'REPRESENTED',
        says:
          `${approved.otherCompany.name} has been asked to take ${row.name} on. They will contact ` +
          `${row.name.split(' ')[0]} and put them forward; ${row.name.split(' ')[0]} joins your network when they do.`,
      },
    })
  }

  // ── Start the four desks on the firm they named ────────────────────
  if (action === 'sponsor') {
    const firmName = answer?.firmName ?? null
    if (!firmName) {
      return NextResponse.json(
        { error: { code: 'NO_FIRM', message: `${row.name.split(' ')[0]} did not name a firm, so there is none to recommend. Pick one of your own instead.` } },
        { status: 409 }
      )
    }
    const already = await prisma.supplierRequest.findFirst({
      where: { companyId, name: firmName, state: { in: ['RECOMMENDED', 'IN_REVIEW'] } },
      select: { id: true },
    })
    const req = already
      ? already
      : await prisma.supplierRequest.create({
          data: {
            companyId, name: firmName, skills: row.skills,
            reason: `Represents ${row.name}, who ${caller.person.name} asked onto the network. ${row.reason}`,
            recommendedById: caller.person.id,
            checklist: newChecklist() as unknown as object,
            stage: 'LEAD', decisions: [], token: newApplyToken(),
            contactEmail: null, contactName: null,
          },
        })
    await prisma.contractorInvitation.update({ where: { id }, data: { supplierRequestId: req.id } })

    // The recommender's own lead hears, the same way a supplier
    // recommended from the Suppliers page reaches them.
    const desks = await desksFor(companyId, caller.person.id)
    for (const personId of (await deskPeople(companyId, 'LEAD', desks, [caller.person.id])).filter((p) => p !== caller.person.id)) {
      void notify({
        personId, companyId, type: 'SYSTEM', entityId: req.id, channel: 'EMAIL',
        title: `Supplier recommended — ${firmName}`,
        body: `${caller.person.name} asked ${row.name} onto the network and ${firmName} represents them. It is on your desk to confirm the need, then Procurement, HR and Finance take it in turn.`,
        data: { href: '/dashboard/suppliers' },
      })
    }
    return NextResponse.json({
      data: {
        state: row.state,
        says:
          `${firmName} is with your department lead and walks four desks — lead, Procurement, HR, Finance. ` +
          `${row.name.split(' ')[0]} joins your network when it clears and puts them forward.`,
        supplierRequestId: req.id,
        link: applyUrl((await prisma.supplierRequest.findUniqueOrThrow({ where: { id: req.id }, select: { token: true } })).token),
      },
    })
  }

  return NextResponse.json({ error: { code: 'UNKNOWN_ACTION', message: 'Pick a supplier, recommend the firm they named, or withdraw the ask.' } }, { status: 422 })

  /** Tell the firm's own people, by email as well as in the app. */
  async function tellSupplier(supplierCompanyId: string, supplierName: string) {
    const seats = await prisma.context.findMany({
      where: { companyId: supplierCompanyId, revokedAt: null, role: { permissions: { has: 'submissions.write' } } },
      select: { personId: true },
    })
    for (const s of seats) {
      void notify({
        personId: s.personId, companyId: supplierCompanyId, type: 'SYSTEM', entityId: row!.id, channel: 'EMAIL',
        title: `${caller!.company!.name} asked for ${row!.name}`,
        body:
          `${caller!.company!.name} would like ${row!.name}${row!.skills.length ? ` (${row!.skills.join(', ')})` : ''} on site, ` +
          `and asked ${supplierName} to represent them. ${row!.reason} Their email is ${row!.email}. ` +
          `Take them onto your bench and put them forward.`,
        data: { href: '/dashboard/bench' },
      })
    }
    void prisma.contractorInvitation.update({ where: { id }, data: { linkSentAt: row!.linkSentAt ?? now } }).catch(() => {})
  }
}
