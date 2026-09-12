/**
 * Which way a notification should travel, and whether it actually left.
 *
 * Two populations, two channels. CLAUDE.md:
 *
 *   Business users (vendors, clients, MSPs, GSIs) → Microsoft Teams
 *   webhook on the company's channel, with email as the fallback.
 *
 *   Candidates → email only. They have no company channel to post into,
 *   and a consultant is not in anybody's Teams tenant.
 *
 * The other half of this file exists because of a quieter problem. A
 * notification was being written with channel "EMAIL" and nothing ever
 * sent it. Its status said UNREAD, which is indistinguishable from a
 * message that was delivered and ignored — so the system looked like it had
 * told somebody when it had not, and the only way to find out was to ask
 * the person whether they got it.
 *
 * So delivery is tracked apart from reading, and a channel with nowhere to
 * send is recorded as NOT_CONFIGURED rather than left looking sent.
 */

export type Channel = 'IN_APP' | 'EMAIL' | 'TEAMS'
export type DeliveryState = 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED'

export interface Recipient {
  /** A consultant has no company channel, whoever their bench is with. */
  isConsultant: boolean
  email: string | null
  /** The company's Teams webhook, when one has been set up. */
  teamsWebhookUrl: string | null
}

export interface Route {
  channel: Channel
  /** Why this way rather than another, for the delivery log. */
  reason: string
  /** Set when this route cannot actually carry anything. */
  blocked: string | null
}

/**
 * Where this notification should go.
 *
 * In-app is always written; this decides what else happens. Teams first for
 * business users because that is where they already are, email when there
 * is no channel, and nothing beyond in-app when there is no address either
 * — said out loud rather than silently dropped.
 */
export function routeFor(recipient: Recipient): Route {
  if (recipient.isConsultant) {
    return recipient.email
      ? { channel: 'EMAIL', reason: 'Consultants are reached by email', blocked: null }
      : {
          channel: 'IN_APP',
          reason: 'No email address on file',
          blocked: 'This person has no email address, so nothing can be sent to them.',
        }
  }

  if (recipient.teamsWebhookUrl) {
    return { channel: 'TEAMS', reason: 'Posted to the company channel', blocked: null }
  }

  if (recipient.email) {
    return { channel: 'EMAIL', reason: 'No Teams channel set up, so email instead', blocked: null }
  }

  return {
    channel: 'IN_APP',
    reason: 'No Teams channel and no email address',
    blocked: 'Nowhere to send this. Add a Teams channel or an email address.',
  }
}

/** What a sender can be asked to do. */
export interface Sender {
  channel: Channel
  send(to: string, title: string, body: string): Promise<void>
}

export interface DeliveryOutcome {
  state: DeliveryState
  note: string
  deliveredAt: Date | null
}

/**
 * Attempt delivery and report honestly what happened.
 *
 * With no sender configured for a channel the answer is NOT_CONFIGURED, not
 * SENT and not FAILED. Those three mean different things to whoever is
 * looking at why a manager never heard about a requisition:
 *
 *   FAILED          somebody tried; the address bounced or the hook is dead
 *   NOT_CONFIGURED  nobody has ever set this up
 *
 * Collapsing them loses the only fact that says what to do next.
 */
export async function attemptDelivery(
  route: Route,
  destination: string | null,
  title: string,
  body: string,
  senders: Sender[],
  now: Date
): Promise<DeliveryOutcome> {
  // In-app is not sent anywhere. It is already written, and the person sees
  // it the moment they look.
  if (route.channel === 'IN_APP') {
    return {
      state: route.blocked ? 'NOT_CONFIGURED' : 'SENT',
      note: route.blocked ?? 'Shown in the app',
      deliveredAt: route.blocked ? null : now,
    }
  }

  if (!destination) {
    return { state: 'NOT_CONFIGURED', note: 'No address to send to', deliveredAt: null }
  }

  const sender = senders.find(s => s.channel === route.channel)
  if (!sender) {
    return {
      state: 'NOT_CONFIGURED',
      note: `Nothing is set up to send ${route.channel.toLowerCase()}. It is waiting in the app only.`,
      deliveredAt: null,
    }
  }

  try {
    await sender.send(destination, title, body)
    return { state: 'SENT', note: route.reason, deliveredAt: now }
  } catch (err) {
    return {
      state: 'FAILED',
      note: err instanceof Error ? err.message.slice(0, 200) : 'Sending failed',
      deliveredAt: null,
    }
  }
}

/**
 * What is stuck, for whoever has to notice.
 *
 * A pile of NOT_CONFIGURED is a setup job — one Teams channel fixes all of
 * them. A pile of FAILED is a broken address or a dead webhook and needs
 * somebody to look. They are counted apart because they lead to different
 * work.
 */
export function deliverySummary(
  rows: { deliveryState: string }[]
): { sent: number; failed: number; notConfigured: number; pending: number; healthy: boolean } {
  const count = (s: string) => rows.filter(r => r.deliveryState === s).length
  const failed = count('FAILED')
  const notConfigured = count('NOT_CONFIGURED')
  return {
    sent: count('SENT'),
    failed,
    notConfigured,
    pending: count('PENDING'),
    healthy: failed === 0 && notConfigured === 0,
  }
}
