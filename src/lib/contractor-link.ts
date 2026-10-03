import { randomBytes } from 'node:crypto'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'

/**
 * The person's own link.
 *
 * A consultant is a candidate under CLAUDE.md's two populations: a
 * consumer address, email only, and no company tenant to sign in
 * through. So the ask reaches them the way everything else does — one
 * email, one link, nothing to sign up for — and `routeFor` is told this
 * is a consultant so it never tries a Teams channel.
 */
export function newInviteToken(): string {
  return randomBytes(24).toString('base64url')
}

export function welcomeUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base}/welcome/${token}`
}

/**
 * What they read.
 *
 * Written to be answerable by somebody who has never heard of Etyme and
 * is not being sold anything: who wants them, what for, and the one
 * question that decides where it goes. It says plainly that the client
 * is not the employer, because a contractor who thinks they are being
 * hired direct will answer the wrong question.
 */
export function inviteLetter(input: {
  name: string
  clientName: string
  inviterName: string
  reason: string
  token: string
}): { subject: string; body: string } {
  const hello = input.name ? `${input.name.split(' ')[0]},` : 'Hello,'
  return {
    subject: `${input.clientName} would like to work with you again`,
    body:
      `${hello}\n\n${input.inviterName} at ${input.clientName} asked us to reach you. ` +
      `${input.reason}\n\n` +
      `${input.clientName} contracts through staffing suppliers rather than directly, so the ` +
      `next step depends on who represents you. Tell us here — it takes a minute and there is ` +
      `nothing to sign up for:\n\n${welcomeUrl(input.token)}\n\n` +
      `If you are not looking right now, say so on the same page and nobody will chase you.`,
  }
}

export async function sendInvite(input: {
  to: string
  name: string
  clientName: string
  inviterName: string
  reason: string
  token: string
}): Promise<{ state: string; note: string }> {
  const letter = inviteLetter(input)
  const out = await attemptDelivery(
    routeFor({ isConsultant: true, email: input.to, teamsWebhookUrl: null }),
    input.to,
    letter.subject,
    letter.body,
    configuredSenders(),
    new Date()
  )
  return { state: out.state, note: out.note }
}
