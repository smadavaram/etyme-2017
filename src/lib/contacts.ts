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

import { reservedAddress } from '@/lib/demo-session'

export type ContactKind =
  | 'HIRING_MANAGER'
  | 'PROCUREMENT'
  | 'AP'
  | 'BILLING'
  | 'RECRUITING'
  | 'EXECUTIVE'
  | 'DELIVERY'
  | 'PROGRAM'
  | 'HR'
  | 'COMPLIANCE'
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
  PROGRAM: { label: 'Program office', callAbout: 'the program itself — who may supply, which roles go out, the rules' },
  PROCUREMENT: { label: 'Procurement', callAbout: 'agreements, rate cards, onboarding as a supplier' },
  AP: { label: 'Accounts payable', callAbout: 'unpaid invoices and remittance — they pay' },
  BILLING: { label: 'Billing', callAbout: 'the invoices they send and what is still unpaid — they bill' },
  RECRUITING: { label: 'Recruiting', callAbout: 'submissions and candidate logistics' },
  EXECUTIVE: { label: 'Executive', callAbout: 'the relationship itself, and escalations' },
  DELIVERY: { label: 'Delivery', callAbout: 'the work on the ground, rolloffs, replacements' },
  HR: { label: 'HR', callAbout: 'whether a role is in the plan, and a firm’s own people’s paperwork' },
  COMPLIANCE: { label: 'Compliance', callAbout: 'insurance, work authorization, background checks, tenure' },
  OTHER: { label: 'Contact', callAbout: 'whatever they were saved for — add a note' },
}

export interface ContactInput {
  name: string
  email?: string | null
  phone?: string | null
  title?: string | null
  kind?: string | null
}

/**
 * An address only where somebody could actually write to it.
 *
 * A rolodex exists to answer "who do I call", so an address on a row is
 * a promise that mail sent there arrives. The browser walk of
 * 2026-09-21 read Contacts as Vertex Global and found
 * `world-corning-procurement@demo.etyme.local`,
 * `world-terumo-bct-hr@demo.etyme.local` and
 * `world-corning-programme@…` printed in blue as three people's email
 * addresses — with two retired company names and a British spelling
 * inside them.
 *
 * Those are sign-in handles for seeded seats, not addresses, and they
 * stay: CLAUDE.md's own precedent is that a slug is an address nobody
 * reads and `world-nike` keeps its name for that reason. What was wrong
 * is that a screen read one out. Nothing at `.local`, `.invalid` or
 * `.example` can receive mail — none of those can be registered — so a
 * row at one of them shows the name, the desk and the firm, and no
 * mailto nobody can answer.
 */
export function writableEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim()
  if (!e || !e.includes('@')) return null
  return reservedAddress(e) ? null : e
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
 * Email first, then phone — both normalized. Never the name: two Rajesh
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

/**
 * The chip a seat at the other firm gets, read off the role they hold
 * there and the kind of firm it is.
 *
 * ── Why the company kind is an argument ──────────────────────────────
 *
 * It was one set of regular expressions for every firm, and it misfiled
 * five of Cavanaugh Glassworks' six desks on the walk of 2026-09-21: the
 * **Compliance Officer** and the **HR Partner** were chipped "Delivery"
 * (the pattern that catches a delivery manager also caught "compliance"
 * and "hr"), the **Owner** was chipped "Hiring manager", and the
 * **Approver** and the **Program Manager** were both chipped
 * "Executive". CLAUDE.md already records this class of bug once — "the
 * mapping that filed an account manager under Accounts payable" — in a
 * different place.
 *
 * The same word means different desks at different firms. "HR" at a
 * client reads the role and says whether it is in the plan; "HR" at a
 * supplier keeps its own people's paperwork. "Accounts Receivable"
 * bills us and "AP Clerk" pays us, and one chip called Accounts payable
 * cannot be both. So the mapping is a table per kind of firm, named off
 * `lib/company-defaults`' own role names, and the regular expressions
 * survive only as the fallback for a title somebody typed by hand.
 */

/** The desks a client seats, from CLIENT_ROLES. */
const CLIENT_DESKS: Record<string, ContactKind> = {
  'owner': 'EXECUTIVE',
  'program manager': 'PROGRAM',
  'hiring manager': 'HIRING_MANAGER',
  // The desk that signs the money, and the one a supplier escalates to.
  'approver': 'EXECUTIVE',
  'hr partner': 'HR',
  'procurement lead': 'PROCUREMENT',
  'ap clerk': 'AP',
  'compliance officer': 'COMPLIANCE',
  'viewer': 'OTHER',
}

/** The desks a program office seats, from MSP_ROLES. */
const MSP_DESKS: Record<string, ContactKind> = {
  'owner': 'EXECUTIVE',
  'program manager': 'PROGRAM',
  'supplier manager': 'PROCUREMENT',
  'coordinator': 'RECRUITING',
  'ap clerk': 'AP',
  'compliance officer': 'COMPLIANCE',
}

/** The desks a supplier or an integrator seats, from SUPPLIER_ROLES. */
const SUPPLIER_DESKS: Record<string, ContactKind> = {
  'owner': 'EXECUTIVE',
  'admin': 'EXECUTIVE',
  // Owns the client relationship — roles, rates, submissions, what was
  // billed. The person a client calls first, which is what Executive
  // means on a rolodex. Filed under Accounts payable once; never again.
  'account manager': 'EXECUTIVE',
  'recruiter': 'RECRUITING',
  'resource manager': 'DELIVERY',
  'delivery manager': 'DELIVERY',
  'project manager': 'DELIVERY',
  'team lead': 'DELIVERY',
  'contractor desk': 'RECRUITING',
  'supplier manager': 'PROCUREMENT',
  'contract manager': 'PROCUREMENT',
  'hr': 'HR',
  // They bill us.
  'accounts receivable': 'BILLING',
  'finance': 'BILLING',
  // The old name for Finance, kept because a company formed before the
  // rename still holds the role under it (RENAMED_ROLES).
  'accountant': 'BILLING',
  // They pay us.
  'ap & payroll': 'AP',
  'compliance officer': 'COMPLIANCE',
}

function desksOf(companyKind: string | null | undefined): Record<string, ContactKind> {
  switch (companyKind) {
    case 'CLIENT': return CLIENT_DESKS
    case 'MSP': return MSP_DESKS
    // A one-person corporation seats one Owner, and an integrator seats
    // the supplier desks plus four of its own.
    default: return SUPPLIER_DESKS
  }
}

/**
 * The fallback, for a title typed into the rolodex by hand rather than
 * held as a seat. Ordered most specific first, and compliance and HR
 * come before delivery now — that ordering is what chipped a compliance
 * officer "Delivery".
 */
function kindOfTitle(title: string): ContactKind {
  const r = title
  if (/compliance|i-9|screening/.test(r)) return 'COMPLIANCE'
  if (/\bhr\b|human resources|people team/.test(r)) return 'HR'
  if (/hiring|talent acquisition/.test(r)) return 'HIRING_MANAGER'
  if (/program manager|program office|\bpmo\b/.test(r)) return 'PROGRAM'
  if (/procure|supplier manager|vendor manager|contract manager|sourcing manager/.test(r)) return 'PROCUREMENT'
  if (/receivable|billing|\bar\b/.test(r)) return 'BILLING'
  if (/payable|\bap\b|payroll|remittance/.test(r)) return 'AP'
  if (/account manager|owner|admin|\bvp\b|executive|director|chief|president|approver/.test(r)) return 'EXECUTIVE'
  if (/finance|accountant|controller/.test(r)) return 'BILLING'
  if (/deliver|resource|coordinator|practice|team lead|project manager/.test(r)) return 'DELIVERY'
  if (/recruit|sourc|contractor desk|bench/.test(r)) return 'RECRUITING'
  return 'OTHER'
}

export function kindOfRole(
  roleName: string | null | undefined,
  companyKind?: string | null
): ContactKind {
  const r = (roleName ?? '').trim().toLowerCase()
  if (!r) return 'OTHER'
  const seated = desksOf(companyKind)[r]
  if (seated) return seated
  return kindOfTitle(r)
}
