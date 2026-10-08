import { randomBytes } from 'node:crypto'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'
import { appUrl } from '@/lib/app-url'

/**
 * The firm's own link. Sent to the contact the client named; the firm
 * applies and uploads against it with nothing to sign up for. In time
 * this is the supplier's door into the client portal.
 */
/**
 * A new link for a firm. Twenty-four random bytes, the same as every
 * other bearer token in this codebase — the apply page accepts whoever
 * holds it, so it has to be unguessable from another one.
 */
export function newApplyToken(): string {
  return randomBytes(24).toString('base64url')
}

/** The one base address, kept in lib/app-url so a screen may read it too. */
export { appUrl }

export function applyUrl(token: string): string {
  return `${appUrl()}/apply/${token}`
}

/** Where an approved firm takes its account. */
export function claimUrl(token: string): string {
  return `${appUrl()}/claim/${token}`
}

/**
 * The one sentence an approved firm reads, in the email and on its
 * apply page alike, so the two never say different things.
 */
export function approvedSays(input: { clientName: string; firmName: string }): string {
  return `${input.clientName} approved ${input.firmName} as a supplier. Take your account:`
}

/** What a firm reads after it sends its side from the apply page. */
export function sentSays(clientName: string): string {
  return `Sent to ${clientName}. They will be in touch.`
}

export function claimLetter(input: { contactName: string | null; firmName: string; clientName: string; token: string }): { subject: string; body: string } {
  const hello = input.contactName ? `${input.contactName.split(' ')[0]},` : 'Hello,'
  return {
    subject: `${input.clientName} approved ${input.firmName} as a supplier`,
    body:
      `${hello}\n\n${approvedSays(input)} ${claimUrl(input.token)}\n\n` +
      `Sign in with this email address. Your jobs, hours and bills from ${input.clientName} will be there.`,
  }
}

export async function sendClaim(input: { to: string; contactName: string | null; firmName: string; clientName: string; token: string }): Promise<{ state: string; note: string }> {
  const letter = claimLetter(input)
  const out = await attemptDelivery(
    routeFor({ isConsultant: false, email: input.to, teamsWebhookUrl: null }),
    input.to, letter.subject, letter.body, configuredSenders(), new Date()
  )
  return { state: out.state, note: out.note }
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
