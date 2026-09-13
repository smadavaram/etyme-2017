import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'

/**
 * The firm's own link. Sent to the contact the client named; the firm
 * applies and uploads against it with nothing to sign up for. In time
 * this is the supplier's door into the client portal.
 */
export function applyUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base}/apply/${token}`
}

export function linkLetter(input: { contactName: string | null; firmName: string; clientName: string; token: string }): { subject: string; body: string } {
  const hello = input.contactName ? `${input.contactName.split(' ')[0]},` : 'Hello,'
  return {
    subject: `${input.clientName}: what Procurement needs from ${input.firmName}`,
    body:
      `${hello}\n\n${input.clientName} is considering ${input.firmName} as a supplier. ` +
      `To take it forward, Procurement needs a few things from you — a W-9, a certificate of insurance, bank details for payment, ` +
      `your past experience, two references, and if you have them, revenue proof and a proposal or rate card.\n\n` +
      `Supply them here, in one sitting or several: ${applyUrl(input.token)}\n\n` +
      `Nothing to sign up for. The link is yours; it stops working once ${input.clientName} has decided.`,
  }
}

export async function sendLink(input: { to: string; contactName: string | null; firmName: string; clientName: string; token: string }): Promise<{ state: string; note: string }> {
  const letter = linkLetter(input)
  const out = await attemptDelivery(
    routeFor({ isConsultant: false, email: input.to, teamsWebhookUrl: null }),
    input.to, letter.subject, letter.body, configuredSenders(), new Date()
  )
  return { state: out.state, note: out.note }
}
