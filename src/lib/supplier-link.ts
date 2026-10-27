import { randomBytes } from 'node:crypto'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'
import { appUrl } from '@/lib/app-url'
import { formatDay } from '@/lib/format-date'

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
      `Sign in with this email address. Your jobs and hours from ${input.clientName}, and the bills you send it, will be there.`,
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

export function linkLetter(input: { contactName: string | null; firmName: string; clientName: string; token: string; papersOnly?: boolean }): { subject: string; body: string } {
  const hello = input.contactName ? `${input.contactName.split(' ')[0]},` : 'Hello,'
  // A vendor adding its own sub-vendor asks for papers only (`walkFor`).
  if (input.papersOnly) {
    return {
      subject: `${input.clientName}: the papers it needs from ${input.firmName}`,
      body:
        `${hello}\n\n${input.clientName} is adding ${input.firmName} as a supplier. ` +
        `It needs your W-9, your certificate of insurance and your certificate of good standing.\n\n` +
        `Send them here: ${applyUrl(input.token)}\n\n` +
        `Nothing to sign up for. The link is yours; it stops working once ${input.clientName} has decided.`,
    }
  }
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

export async function sendLink(input: { to: string; contactName: string | null; firmName: string; clientName: string; token: string; papersOnly?: boolean }): Promise<{ state: string; note: string }> {
  const letter = linkLetter(input)
  const out = await attemptDelivery(
    routeFor({ isConsultant: false, email: input.to, teamsWebhookUrl: null }),
    input.to, letter.subject, letter.body, configuredSenders(), new Date()
  )
  return { state: out.state, note: out.note }
}

// ── The apply form, filled once (release walk, 2026-10-27) ────────────
//
// The page asked twenty-five entries with the legal name and "what you
// supply" empty, though the firm typed its name at sign-up and the
// client typed the skills on the recommendation; and a second client's
// link was blank again. So each field is filled from the first place
// that already knows it, and a firm's papers sent to one client can be
// sent to the next in one click.
//
// ── Who may see what was sent before ──────────────────────────────────
//
// The link is a bearer credential and the client's own desk holds it
// ("Open their page"). A client that typed a firm's address could
// otherwise open its own link and read which other clients the firm
// applied to, and download its W-9. So what was sent to another client —
// papers, references, bank — is shown only to a person signed in with a
// seat at the firm itself. What is the firm's public face — its name,
// address and website — is filled from its record wherever the contact
// address is the firm's own domain, because anybody can read those.

export interface FirmRecord {
  name: string
  legalName: string | null
  address: string | null
  website: string | null
  /** Bank, account name and last four only; never more is held. */
  bank: { bankName: string; accountName: string; last4: string } | null
}

export interface EarlierApplication {
  requestId: string
  clientName: string
  /** When it was sent, ISO. */
  at: string
  docs: { key: string; fileName: string; fileUrl: string | null; at?: string | null; validFrom?: string | null; validUntil?: string | null }[]
  references: { name: string; company: string; email: string; phone: string }[]
  bank: { bankName: string; accountName: string; last4: string } | null
  /** The firm's own words on that application: every one is carried, not only papers and references. */
  legalName?: string | null
  address?: string | null
  website?: string | null
  experience?: string | null
}

export interface SentBefore {
  key: string
  fileName: string
  requestId: string
  clientName: string
  at: string
  /** The two dates the firm typed off the certificate for that client, carried with it. */
  validFrom: string | null
  validUntil: string | null
  /** "Sent before to Northbend Athletic on Oct 2, 2026." */
  says: string
}

export interface ApplyPrefill {
  legalName: string
  address: string
  website: string
  experience: string
  skills: string
  bank: { bankName: string; accountName: string; last4: string } | null
  references: { name: string; company: string; email: string; phone: string }[]
  /** Papers this firm sent another client, one per item this client asks for. Empty unless signed in at the firm. */
  sentBefore: SentBefore[]
  /** References came from another client's application, and to whom. */
  referencesSays: string | null
}

const day = (iso: string): string => formatDay(iso)

/**
 * What the apply form opens with. Pure: the route reads the rows.
 *
 * Each field is the first of: what the firm already sent on this link;
 * the firm's own record; for "what you supply", the skills the client
 * typed when it recommended the firm. Papers, references and bank come
 * from another client's application only where `signedInAtFirm`.
 */
export function applyPrefill(input: {
  application: Record<string, any> | null
  recommendedSkills: readonly string[]
  firm: FirmRecord | null
  earlier: readonly EarlierApplication[]
  signedInAtFirm: boolean
  /** The file items this client asks for (keys), so a paper is offered only where it answers one. */
  fileKeys: readonly string[]
}): ApplyPrefill {
  const a = input.application ?? {}
  const pick = (...xs: (string | null | undefined)[]): string => xs.find((x) => typeof x === 'string' && x.trim() !== '')?.trim() ?? ''
  const earlier = input.signedInAtFirm ? [...input.earlier].sort((x, y) => y.at.localeCompare(x.at)) : []

  const sentBefore: SentBefore[] = []
  for (const key of input.fileKeys) {
    for (const e of earlier) {
      const d = e.docs.find((x) => x.key === key && x.fileUrl)
      if (!d) continue
      const at = d.at ?? e.at
      sentBefore.push({
        key, fileName: d.fileName, requestId: e.requestId, clientName: e.clientName, at,
        validFrom: d.validFrom ?? null, validUntil: d.validUntil ?? null,
        says: `Sent before to ${e.clientName} on ${day(at)}.`,
      })
      break
    }
  }

  const ownRefs = Array.isArray(a.references) ? a.references.filter((r: any) => r?.name || r?.company) : []
  const refsFrom = ownRefs.length ? null : earlier.find((e) => e.references.length > 0) ?? null
  const bankFrom = a.bank?.last4 ? a.bank : input.signedInAtFirm ? input.firm?.bank ?? earlier.find((e) => e.bank?.last4)?.bank ?? null : null

  // The firm's own words to an earlier client, newest first, for every
  // field it answered there (second onboarding walk: website, address and
  // experience were dropped while bank and references carried).
  const said = (k: 'legalName' | 'address' | 'website' | 'experience') => earlier.find((e) => (e[k] ?? '').trim() !== '')?.[k]
  return {
    legalName: pick(a.legalName, input.firm?.legalName, said('legalName'), input.firm?.name),
    address: pick(a.address, input.firm?.address, said('address')),
    website: pick(a.website, input.firm?.website, said('website')),
    experience: pick(a.experience, said('experience')),
    skills: pick(Array.isArray(a.skills) ? a.skills.join(', ') : null, input.recommendedSkills.join(', ')),
    bank: bankFrom ? { bankName: bankFrom.bankName ?? '', accountName: bankFrom.accountName ?? '', last4: bankFrom.last4 ?? '' } : null,
    references: ownRefs.length ? ownRefs : refsFrom?.references ?? [],
    sentBefore,
    referencesSays: refsFrom ? `Sent before to ${refsFrom.clientName} on ${day(refsFrom.at)}.` : null,
  }
}
