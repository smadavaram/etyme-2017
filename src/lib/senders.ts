import type { Sender } from '@/lib/notification-delivery'

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
 * NOTIFY_FROM_EMAIL. Teams needs no key — it needs a webhook URL on the
 * company, which is per-company rather than per-deployment.
 */

function emailSender(): Sender | null {
  const resend = process.env.RESEND_API_KEY
  const sendgrid = process.env.SENDGRID_API_KEY
  const from = process.env.NOTIFY_FROM_EMAIL
  if (!from) return null
  if (!resend && !sendgrid) return null

  return {
    channel: 'EMAIL',
    async send(to, title, body) {
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
 * Teams needs no deployment-level credential — the webhook URL is the
 * credential, and it belongs to the company, so this sender is always
 * available and routing decides whether there is anywhere to post.
 */
function teamsSender(): Sender {
  return {
    channel: 'TEAMS',
    async send(webhookUrl, title, body) {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          '@type': 'MessageCard',
          '@context': 'https://schema.org/extensions',
          summary: title,
          title,
          text: body,
        }),
      })
      if (!res.ok) throw new Error(`Teams webhook returned ${res.status}`)
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

/** What is switched on, for the settings screen and for support questions. */
export function senderStatus(): { channel: string; configured: boolean; note: string }[] {
  const email = emailSender()
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
      configured: true,
      note: 'Teams posts to whichever company has a channel URL saved',
    },
  ]
}
