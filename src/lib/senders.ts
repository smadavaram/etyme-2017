import { demoAddress, DEMO_ADDRESS_NOTE, type Sender } from '@/lib/notification-delivery'
import {
  teamsCard, teamsLinkKind, teamsEdge, TEAMS_LINK_RETIRED_SENTENCE, type TeamsFacts,
} from '@/lib/notify/teams-link'

/**
 * The senders that actually exist right now.
 *
 * This is deliberately allowed to be empty. Nothing here is stubbed with a
 * console.log that returns success, because a fake send is worse than no
 * send: it writes SENT into the database and the failure surfaces weeks
 * later as "he says he never got it".
 *
 * A sender appears the moment its credentials do. Until then delivery is
 * recorded as NOT_CONFIGURED, which is true and points at the fix.
 *
 * To turn email on, set RESEND_API_KEY (or SENDGRID_API_KEY) and
 * NOTIFY_FROM_EMAIL. Teams needs no key — it needs a Workflows link on the
 * company, which is per-company rather than per-deployment.
 */

export function emailSender(): Sender | null {
  const resend = process.env.RESEND_API_KEY
  const sendgrid = process.env.SENDGRID_API_KEY
  const from = process.env.NOTIFY_FROM_EMAIL
  if (!from) return null
  if (!resend && !sendgrid) return null

  return {
    channel: 'EMAIL',
    async send(to, title, body) {
      // The last guard, for callers that send directly rather than through
      // attemptDelivery: a reserved demo address is never handed to the
      // provider. The error carries the reason, so whoever records the
      // send writes "demo address, nothing sent".
      if (demoAddress(to)) throw new Error(DEMO_ADDRESS_NOTE)
      if (resend) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resend}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to, subject: title, text: body }),
        })
        if (!res.ok) throw new Error(`Resend returned ${res.status}`)
        return
      }
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgrid}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject: title,
          content: [{ type: 'text/plain', value: body }],
        }),
      })
      if (!res.ok) throw new Error(`SendGrid returned ${res.status}`)
    },
  }
}

/**
 * Teams needs no deployment-level credential — the Workflows link is the
 * credential, and it belongs to the company, so this sender is always
 * available and routing decides whether there is anywhere to post.
 *
 * It posts an Adaptive Card, which is what a Workflows link ("When a
 * Teams webhook request is received") accepts. Until 2026-10-03 it posted
 * a legacy MessageCard to an Office 365 Connector link; Microsoft switched
 * those off in Teams in May 2026 and nothing here noticed. A retired link
 * is refused here as well as in routing, so a caller that skips routing
 * still cannot post into the void and call it sent.
 */
function teamsSender(): Sender {
  return {
    channel: 'TEAMS',
    async send(webhookUrl, title, body, link) {
      if (teamsLinkKind(webhookUrl) === 'RETIRED') throw new Error(TEAMS_LINK_RETIRED_SENTENCE)
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamsCard(title, body, link)),
      })
      if (!res.ok) throw new Error(`The Teams Workflows link returned ${res.status}`)
    },
  }
}

/** Every sender with somewhere real to send. Order does not matter. */
export function configuredSenders(): Sender[] {
  const senders: Sender[] = [teamsSender()]
  const email = emailSender()
  if (email) senders.push(email)
  return senders
}

/**
 * What is switched on, for the settings screen and for support questions.
 *
 * Email is a deployment setting and is answered here. Teams is not: it is
 * set up only where a company has saved a Workflows link, and proven only
 * once one has posted, which takes the database to know. So without the
 * facts Teams is reported as not known to be set up, never as configured
 * — the old answer here was "configured: true" for every deployment,
 * including the ones whose only links Microsoft had switched off. Pass
 * the facts (`countTeamsLinks` and the Workflows sends) to get the real
 * answer.
 */
export function senderStatus(
  teams?: TeamsFacts
): { channel: string; configured: boolean; note: string }[] {
  const email = emailSender()
  const edge = teams ? teamsEdge(teams) : null
  return [
    {
      channel: 'EMAIL',
      configured: email !== null,
      note: email
        ? 'Email is set up and sending'
        : 'Set NOTIFY_FROM_EMAIL and RESEND_API_KEY to turn email on',
    },
    {
      channel: 'TEAMS',
      configured: edge !== null && edge.state !== 'MISSING',
      note: edge
        ? edge.says
        : 'Teams posts only where a company has saved a Teams Workflows link. /ready counts how many have, and whether one has posted.',
    },
  ]
}
