/**
 * Getting one of the three messages out of the building, and knowing
 * whether it went.
 *
 * ── Why there is no SMS here ─────────────────────────────────────────
 *
 * There was. It went out through Twilio, and it is gone: candidates are
 * reached by email and business users on Teams, which is what CLAUDE.md
 * has said since before any of this was written. The text channel was
 * drift.
 *
 * It is also the one channel where being slightly wrong is expensive. A
 * mistimed email is ignored; a mistimed text to a number somebody never
 * handed over is statutory damages per message, and the exposure grows
 * with the bench, which is the thing we are trying to grow.
 *
 * ── The shape ────────────────────────────────────────────────────────
 *
 * A port with two adapters. The point is not provider independence — it
 * is that the recorded adapter makes the whole loop demonstrable,
 * testable and reviewable with no account anywhere, and marks every
 * message honestly as never having left.
 *
 * That last part matters more than it sounds. A queue that silently drops
 * messages looks exactly like a queue where nobody replies: the bench goes
 * stale, the rankings quietly rot, and the dashboard says everything is
 * fine. NOT_CONFIGURED is the status that stops that.
 *
 * Every message goes out in the vendor's name. Never ours.
 */

import { prisma } from '@/lib/db'
import { emailSender } from '@/lib/senders'
import { choicesBlock } from '@/lib/reply-link'
import type { Kind } from '@/lib/texts'

export type Status = 'SENT' | 'FAILED' | 'NOT_CONFIGURED'

export interface Outbound {
  companyId: string
  personId: string
  kind: Kind | 'PLACED' | 'LINK'
  /** Their email address. Null where we have none. */
  to: string | null
  subject: string
  body: string
  aboutType?: 'SUBMISSION' | 'LISTING' | null
  aboutId?: string | null
}

export interface Sent {
  id: string
  status: Status
  reason: string
}

/** Whether a real provider is configured. */
export function configured(): boolean {
  return emailSender() !== null
}

/**
 * Send one, and write it down either way.
 *
 * The row is written before the attempt, so a crash mid-send leaves a
 * PENDING message somebody can find rather than nothing at all — and the
 * body on the row is the body that was sent, answer links and all, so
 * "what did we actually say to them" has one answer.
 */
export async function send(m: Outbound): Promise<Sent> {
  const body = withAnswers(m)

  const row = await prisma.textMessage.create({
    data: {
      companyId: m.companyId,
      personId: m.personId,
      kind: m.kind,
      direction: 'OUT',
      body,
      to: m.to,
      status: 'PENDING',
      aboutType: m.aboutType ?? null,
      aboutId: m.aboutId ?? null,
    },
    select: { id: true },
  })

  if (!m.to) {
    return await settle(row.id, 'FAILED', 'No email address on file.')
  }

  if (!configured()) {
    // Written down, visible, and labelled as never having left. Not an
    // error — an absent integration made obvious instead of silent.
    return await settle(
      row.id,
      'NOT_CONFIGURED',
      'No email provider set up, so this was recorded and not sent.'
    )
  }

  try {
    await deliver(m.to, m.subject, body)
    return await settle(row.id, 'SENT', 'Sent.')
  } catch (err: any) {
    return await settle(row.id, 'FAILED', String(err?.message ?? err).slice(0, 200))
  }
}

/**
 * The answers, appended to anything that asks a question.
 *
 * A text message could say "reply 1". An email cannot — there is no
 * webhook on the other end of a reply, and telling somebody to do
 * something we are not listening for is a lie that costs us the answer.
 * So the answer travels outward instead, as one signed link per choice.
 */
function withAnswers(m: Outbound): string {
  if (m.kind !== 'FRESHNESS' && m.kind !== 'CONSENT') return m.body
  const links = choicesBlock(m.personId, m.kind)
  return links ? `${m.body}\n\n${links}` : m.body
}

async function settle(id: string, status: Status, reason: string): Promise<Sent> {
  await prisma.textMessage.update({
    where: { id },
    data: { status, failReason: status === 'SENT' ? null : reason },
  })
  return { id, status, reason }
}

/**
 * The one place that talks to a provider.
 *
 * Which is `lib/senders`, the same one every notification goes through.
 * There is no second email integration here: two ways to send an email
 * means two things to keep in credentials, and one of them rots.
 */
async function deliver(to: string, subject: string, body: string): Promise<void> {
  const sender = emailSender()
  if (!sender) throw new Error('No email provider configured')
  await sender.send(to, subject, body)
}

/**
 * The last message we sent this person, so a written reply knows what it
 * is answering.
 *
 * A one-click answer carries its own question, so this is not needed on
 * that path. It is needed for anybody who writes back instead of
 * clicking: their email says "yes" and nothing else, and reading it
 * against the wrong question is how a freshness ping becomes a consent to
 * be submitted.
 */
export async function lastAsked(personId: string): Promise<{
  id: string
  kind: string
  companyId: string
  aboutType: string | null
  aboutId: string | null
} | null> {
  return prisma.textMessage.findFirst({
    where: { personId, direction: 'OUT', kind: { in: ['FRESHNESS', 'CONSENT'] } },
    orderBy: { at: 'desc' },
    select: { id: true, kind: true, companyId: true, aboutType: true, aboutId: true },
  })
}

/**
 * Said on screen about a message that never left.
 *
 * Plain, and it names the fix. "NOT_CONFIGURED" on a screen is a support
 * ticket; this is an instruction.
 */
export function statusNote(status: string): string {
  switch (status) {
    case 'SENT':
      return 'Sent.'
    case 'PENDING':
      return 'Queued.'
    case 'NOT_CONFIGURED':
      return 'Written down but not sent — no email provider is set up yet.'
    case 'FAILED':
      return 'Did not send.'
    default:
      return status
  }
}
