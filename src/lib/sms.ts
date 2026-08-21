/**
 * Getting a text out of the building, and knowing whether it went.
 *
 * A port with two adapters. The point of the port is not provider
 * independence — it is that the recorded adapter makes the whole loop
 * demonstrable, testable and reviewable with no account anywhere, and
 * marks every message honestly as never having left.
 *
 * That last part matters more than it sounds. A queue that silently drops
 * messages looks exactly like a queue where nobody replies: the bench goes
 * stale, the rankings quietly rot, and the dashboard says everything is
 * fine. NOT_CONFIGURED is the status that stops that.
 *
 * Every message goes out in the vendor's name. Never ours.
 */

import { prisma } from '@/lib/db'
import type { Kind } from '@/lib/texts'

export type Status = 'SENT' | 'FAILED' | 'NOT_CONFIGURED'

export interface Outbound {
  companyId: string
  personId: string
  kind: Kind | 'PLACED' | 'LINK'
  to: string | null
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
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM
  )
}

/**
 * Send one, and write it down either way.
 *
 * The row is written before the attempt, so a crash mid-send leaves a
 * PENDING message somebody can find rather than nothing at all.
 */
export async function send(m: Outbound): Promise<Sent> {
  const row = await prisma.textMessage.create({
    data: {
      companyId: m.companyId,
      personId: m.personId,
      kind: m.kind,
      direction: 'OUT',
      body: m.body,
      to: m.to,
      status: 'PENDING',
      aboutType: m.aboutType ?? null,
      aboutId: m.aboutId ?? null,
    },
    select: { id: true },
  })

  if (!m.to) {
    return await settle(row.id, 'FAILED', 'No mobile number on file.')
  }

  if (!configured()) {
    // Written down, visible, and labelled as never having left. Not an
    // error — an absent integration made obvious instead of silent.
    return await settle(
      row.id,
      'NOT_CONFIGURED',
      'No SMS provider set up, so this was recorded and not sent.'
    )
  }

  try {
    await deliver(m.to, m.body)
    return await settle(row.id, 'SENT', 'Sent.')
  } catch (err: any) {
    return await settle(row.id, 'FAILED', String(err?.message ?? err).slice(0, 200))
  }
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
 * Plain form-encoded HTTP rather than a client library: one endpoint, two
 * fields, and one less dependency to keep current.
 */
async function deliver(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_FROM!

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`provider said ${res.status}: ${text.slice(0, 160)}`)
  }
}

/**
 * The last message we sent this person, so an inbound reply knows what it
 * is answering.
 *
 * A phone number carries no context. Somebody replying "yes" three days
 * later is answering whatever we asked last, and reading it against the
 * wrong question is how a freshness ping becomes a consent to be
 * submitted.
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
      return 'Written down but not sent — no SMS provider is set up yet.'
    case 'FAILED':
      return 'Did not send.'
    default:
      return status
  }
}
