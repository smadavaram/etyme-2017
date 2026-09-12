/**
 * The rolodex: people at counterparties, with no login and no seat.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * A staffing business is a rolodex with invoicing attached, and until
 * now there was nowhere to write down WHO at a client to call. Every
 * Person in the system had a login; the person you phone about an
 * unpaid invoice does not, and never will.
 *
 * The audit that found this gap put it plainly: you could record that
 * Wipro exists and not who at Wipro answers.
 *
 * ── Two rules the model is built around ──────────────────────────────
 *
 * **A rolodex is private.** My contact at a client is my commercial
 * asset. Sharing a rolodex across tenants is how a competitor learns
 * whose hiring manager picks up the phone, so every read is walled by
 * the owning company and there is no "network view" of contacts, ever.
 *
 * **A contact is not a duplicate person.** When the person you have on
 * file later joins the platform themselves, the rolodex entry links to
 * their Person rather than living on beside it — two records for one
 * human is how you email somebody at an address they left.
 */

export type ContactKind =
  | 'HIRING_MANAGER'
  | 'PROCUREMENT'
  | 'AP'
  | 'RECRUITING'
  | 'EXECUTIVE'
  | 'DELIVERY'
  | 'OTHER'

/**
 * What you would call each kind of contact about.
 *
 * Carried as data so a screen can say "who do I chase about the unpaid
 * invoice" and get an answer, rather than showing seven names and
 * letting somebody guess.
 */
export const KINDS: Record<ContactKind, { label: string; callAbout: string }> = {
  HIRING_MANAGER: { label: 'Hiring manager', callAbout: 'open roles, interview feedback, extensions' },
  PROCUREMENT: { label: 'Procurement', callAbout: 'agreements, rate cards, onboarding as a supplier' },
  AP: { label: 'Accounts payable', callAbout: 'unpaid invoices and remittance' },
  RECRUITING: { label: 'Recruiting', callAbout: 'submissions and candidate logistics' },
  EXECUTIVE: { label: 'Executive', callAbout: 'the relationship itself, and escalations' },
  DELIVERY: { label: 'Delivery', callAbout: 'the work on the ground, rolloffs, replacements' },
  OTHER: { label: 'Contact', callAbout: 'whatever they were saved for — add a note' },
}

export interface ContactInput {
  name: string
  email?: string | null
  phone?: string | null
  title?: string | null
  kind?: string | null
}

export function normalEmail(e: string | null | undefined): string | null {
  const t = (e ?? '').trim().toLowerCase()
  return t.length > 0 ? t : null
}

/** Digits only, so "(303) 555-0100" and "303.555.0100" collide. */
export function normalPhone(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/[^0-9]/g, '')
  return d.length >= 7 ? d : null
}

export interface Problem {
  field: 'name' | 'email' | 'kind'
  says: string
}

/**
 * Checked here, not left to the browser — the Add consultant form taught
 * that lesson: a native refusal inside a modal on a phone is invisible.
 */
export function problems(c: ContactInput): Problem[] {
  const out: Problem[] = []

  if ((c.name ?? '').trim().length < 2) {
    out.push({ field: 'name', says: 'A name, so somebody knows who they are calling.' })
  }

  const email = (c.email ?? '').trim()
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    out.push({
      field: 'email',
      says: `"${email}" is not an email address. It needs an @ and a domain — leave it blank if you only have a phone number.`,
    })
  }

  if (c.kind && !(c.kind in KINDS)) {
    out.push({ field: 'kind', says: `"${c.kind}" is not a kind of contact this keeps.` })
  }

  return out
}

export interface Existing {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  atCompanyId: string
}

export interface DedupVerdict {
  duplicate: boolean
  of?: Existing
  says: string
}

/**
 * Whether this is somebody already on file at the same company.
 *
 * Email first, then phone — both normalised. Never the name: two Rajesh
 * Kumars at Infosys is Tuesday, and merging them by name loses one.
 * Where neither identifier is given, it is allowed through: a rolodex
 * that refuses a name-only entry is one nobody fills in from a hallway
 * conversation.
 */
export function alreadyOnFile(
  c: ContactInput & { atCompanyId: string },
  existing: Existing[]
): DedupVerdict {
  const email = normalEmail(c.email)
  const phone = normalPhone(c.phone)

  const same = existing.filter((e) => e.atCompanyId === c.atCompanyId)

  if (email) {
    const hit = same.find((e) => normalEmail(e.email) === email)
    if (hit) {
      return {
        duplicate: true,
        of: hit,
        says: `${hit.name} is already on file at this company with that email. Update them rather than adding a twin.`,
      }
    }
  }

  if (phone) {
    const hit = same.find((e) => normalPhone(e.phone) === phone)
    if (hit) {
      return {
        duplicate: true,
        of: hit,
        says: `${hit.name} is already on file with that phone number.`,
      }
    }
  }

  return { duplicate: false, says: 'New.' }
}

export interface ClaimMatch {
  contactId: string
  says: string
}

/**
 * When somebody joins the platform, which rolodex entries are them.
 *
 * Deterministic on the email they signed in with, nothing fuzzier —
 * linking the wrong contact to a real account hands one tenant's notes
 * about a person to a different person. Matches are linked, never
 * merged: the rolodex entry keeps its owner's notes and gains an
 * identity.
 */
export function claimMatches(
  signedInEmail: string,
  contacts: { id: string; email?: string | null; personId?: string | null; name: string }[]
): ClaimMatch[] {
  const email = normalEmail(signedInEmail)
  if (!email) return []

  return contacts
    .filter((c) => c.personId == null && normalEmail(c.email) === email)
    .map((c) => ({
      contactId: c.id,
      says: `${c.name} on this rolodex is the person who just signed in. Linked, not merged — the notes stay the owner's.`,
    }))
}
