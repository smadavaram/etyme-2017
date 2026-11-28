import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { sendEmailNow } from '@/lib/notify/send-now'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import {
  COURSE_DOOR_SOURCE,
  CONSENT_WORDS,
  LEDGER,
  checkCourseDoorAsk,
  confirmationLetter,
  thanksSays,
  unsubscribeToken,
} from '@/lib/public-site/course-door'

/**
 * The free course door's lead capture. Called by Etyme's own /learnai page.
 *
 * Open to the public, shaped like `/api/market/leads` (a hidden field, a
 * clock, one row per address) and for the same reason: no account before
 * a question. Contract for the page: docs/course-door-lead-contract.md.
 *
 * No yes, no row. The one confirmation is claimed on the ledger before it
 * is sent, so two requests at once cannot send two. An unsubscribe is
 * read from the ledger too, so the lead row needs no column for it.
 */

const PATH = '/api/market/course-door'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: { code: 'BAD_BODY', message: 'Nothing readable arrived.' } }, { status: 400 })
  }

  const verdict = checkCourseDoorAsk(body && typeof body === 'object' ? body : {})
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status: 400 })
  }
  const { email, leadType, track, guardian, worksInIT } = verdict.value
  const now = new Date()

  const asked =
    `Free course · ${leadType} · ${track} · works in IT: ${worksInIT ? 'yes' : 'no'}` +
    (guardian ? ' · parent or guardian address' : '')

  // A person already on file from another door keeps that row as it was.
  let lead = await prisma.marketingLead.findUnique({ where: { email }, select: { id: true } })
  if (!lead) {
    lead = await prisma.marketingLead.create({
      data: { email, source: COURSE_DOOR_SOURCE, asked, consentAt: now },
      select: { id: true },
    })
  }

  await prisma.automationLog.create({
    data: {
      action: 'COURSE_DOOR_LEAD',
      summary: `A ${leadType} asked at the free course door and was routed to ${track}`,
      reason: 'The visitor ticked the yes and sent the form; the track follows the one table in lib/public-site/course-door',
      payload: { leadId: lead.id, leadType, track, worksInIT, guardian, consentAt: now.toISOString(), consentWords: CONSENT_WORDS },
      reversible: false,
    },
  })

  await confirmOnce(lead.id, email, leadType)

  return NextResponse.json({ data: { says: thanksSays(mailLeaves()) } })
}

async function confirmOnce(leadId: string, email: string, leadType: Parameters<typeof confirmationLetter>[0]['leadType']) {
  const secret = process.env.NEXTAUTH_SECRET ?? ''
  if (!mailLeaves() || !secret) return

  const logs = await prisma.automationLog.findMany({
    where: { action: { in: [LEDGER.confirmation, LEDGER.confirmationFailed, LEDGER.unsubscribed] } },
    select: { payload: true },
  })
  if (logs.some((r: any) => r.payload?.leadId === leadId)) return

  // Claimed first, so a second request that arrives now finds it.
  await prisma.automationLog.create({
    data: {
      action: 'COURSE_DOOR_CONFIRMATION',
      summary: 'The one confirmation email for the free course door was sent',
      reason: 'One confirmation per address, ever; it carries the link that ends it',
      payload: { leadId },
      reversible: false,
    },
  })

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const url = `${origin.replace(/\/$/, '')}${PATH}/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken(email, secret)}`
  const letter = confirmationLetter({ leadType, unsubscribeUrl: url })
  // One attempt only, through the one mail door; it never throws.
  const sent = await sendEmailNow({
    to: email,
    subject: letter.subject,
    body: letter.body,
    about: { template: 'course-door-confirmation', recordType: 'MarketingLead', recordId: leadId },
  })
  if (sent.left) return
  await prisma.automationLog.create({
    data: {
      action: 'COURSE_DOOR_CONFIRMATION_FAILED',
      summary: 'The free course door confirmation could not be sent, and is not tried again',
      reason: 'One attempt only, so a failing sender cannot send twice',
      payload: { leadId },
      reversible: false,
    },
  })
  // A made-up address is skipped by the door on purpose and is no fault; only a real failure alerts staff.
  if (sent.state === 'FAILED') await reportError('A course door confirmation did not leave', new Error(sent.note), { path: PATH })
}
