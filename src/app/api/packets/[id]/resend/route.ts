import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { askTheDesk } from '@/lib/permissions'
import { mayAskForDocuments } from '@/lib/packets'
import { notify } from '@/lib/notify'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { resendPlan } from '@/lib/document-stages/packet-resend'
import { resentSays, resendEmailLeaves } from '@/lib/notify/resend-words'

/**
 * POST /api/packets/:id/resend — send a document request again.
 *
 * The founder's tester, 2026-11-03: a request stuck at 0 of 3 could not be
 * opened or sent again from the page, so the only way to chase it was a
 * new request. Now the firm that asked sends the same link again: a link
 * that ran out is given thirty more days, the person is told again, and
 * where no email can leave the link is kept on the notice of the person
 * who pressed it, so they can pass it on themselves.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That document request was not sent by your company.' } }, { status: 404 })
  }
  const { id } = await params
  const packet = await prisma.documentPacket.findFirst({
    where: { id, companyId: caller.company.id },
    select: {
      id: true, label: true, token: true, expiresAt: true, completedAt: true, cancelledAt: true, recipientEmail: true,
      items: { select: { label: true, required: true, state: true } },
    },
  })
  if (!packet) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That document request was not sent by your company.' } }, { status: 404 })
  }
  if (!mayAskForDocuments(caller.permissions)) {
    return NextResponse.json({
      error: {
        code: 'FORBIDDEN',
        message: askTheDesk({ doing: 'Sending a document request again', needs: ['vendors.manage', 'consultants.write'], kind: caller.company.kind, companyName: caller.company.name }),
      },
    }, { status: 403 })
  }

  const now = new Date()
  const plan = resendPlan(packet, now)
  if (!plan.ok) return NextResponse.json({ error: { code: plan.code, message: plan.message } }, { status: 409 })

  if (plan.expiresAt.getTime() !== packet.expiresAt.getTime()) {
    await prisma.documentPacket.update({ where: { id: packet.id }, data: { expiresAt: plan.expiresAt } })
  }
  const link = `/packet/${packet.token}`
  const leaves = mailLeaves()
  const recipient = await prisma.person.findUnique({ where: { primaryEmail: packet.recipientEmail }, select: { id: true } })
  if (recipient) {
    void notify({
      personId: recipient.id, companyId: caller.company.id, type: 'SYSTEM', channel: 'EMAIL',
      title: `${caller.company.name} is still waiting on ${plan.waitingOn}`,
      body: `${packet.label}. Send what is asked through ${link}, open until ${plan.until}.`,
      entityId: packet.id,
    })
  }
  const facts = { leaves, address: packet.recipientEmail, hasAccount: !!recipient, waitingOn: plan.waitingOn, until: plan.until }
  if (!resendEmailLeaves(facts)) {
    // No email leaves for this address (no sender here, or a demo address
    // that never receives one), so the link stays with whoever pressed it.
    void notify({
      personId: caller.person.id, companyId: caller.company.id, type: 'SYSTEM',
      title: `Pass this link to ${packet.recipientEmail}: ${packet.label}`,
      body: `No email went to ${packet.recipientEmail}, so send it yourself: ${link}, open until ${plan.until}.`,
      entityId: packet.id,
    })
  }
  return NextResponse.json({
    data: {
      link,
      expiresAt: plan.expiresAt.toISOString().slice(0, 10),
      // "Sent again" only where an email left (release walk three):
      // conversation's one sentence for it.
      message: resentSays(facts),
    },
  })
}
