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

import { reservedAddress } from '@/lib/reserved-address'
import { NO_WAY_TO_REACH, reachable } from '@/lib/contact-reach'
import { identityDomain } from '@/lib/counterparty'
import { isPlatformDomain } from '@/lib/company-domains'
import { registrableDomain, sameOrganisation } from '@/lib/registrable-domain'
import { nameFromDomain } from '@/lib/supplier-list'

export { NO_WAY_TO_REACH } from '@/lib/contact-reach'

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
  | 'MEMBER'
  | 'OTHER'

/**
 * What you would call each kind of contact about.
 *
 * Carried as data so a screen can say "who do I chase about the unpaid
 * invoice" and get an answer, rather than showing seven names and
 * letting somebody guess.
 */
export const KINDS: Record<ContactKind, { label: string; callAbout: string }> = {
  HIRING_MANAGER: { label: 'Hiring manager', callAbout: 'open jobs, interview feedback, extensions' },
  PROGRAM: { label: 'Program manager', callAbout: 'the program itself — who may supply, which jobs go out, the rules' },
  PROCUREMENT: { label: 'Procurement', callAbout: 'agreements, rate cards, onboarding as a supplier' },
  AP: { label: 'Accounts payable', callAbout: 'unpaid bills and remittance — they pay' },
  BILLING: { label: 'Billing', callAbout: 'the invoices they send and what is still unpaid — they bill' },
  RECRUITING: { label: 'Recruiting', callAbout: 'submissions and candidate logistics' },
  EXECUTIVE: { label: 'Executive', callAbout: 'the relationship itself, and escalations' },
  DELIVERY: { label: 'Delivery', callAbout: 'the work on the ground, rolloffs, replacements' },
  HR: { label: 'HR', callAbout: 'whether a job is in the plan, and a firm’s own people’s paperwork' },
  COMPLIANCE: { label: 'Compliance', callAbout: 'insurance, work authorization, background checks, tenure' },
  // A colleague seated on arrival with the Member role: they read their
  // own work and nothing else, so they are somebody you know, not a desk
  // you call about anything (lib/company-defaults MEMBER_ROLE).
  MEMBER: { label: 'Team member', callAbout: 'the work they do at your firm' },
  OTHER: { label: 'Other', callAbout: 'whatever you saved them for' },
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
 * `world-cavanaugh-procurement@demo.etyme.local`,
 * `world-talvern-hr@demo.etyme.local` and
 * `world-cavanaugh-programme@…` printed in blue as three people's email
 * addresses — with two retired company names and a British spelling
 * inside them.
 *
 * Those are sign-in handles for seeded seats, not addresses, and they
 * stay: CLAUDE.md's own precedent is that a slug is an address nobody
 * reads and `world-northbend` keeps its name for that reason. What was wrong
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
  // A rolodex row answers "who do I call", so a row with neither an
  // address nor a number answers nothing. Either one is enough.
  if (!reachable(c)) {
    out.push({ field: 'email', says: NO_WAY_TO_REACH })
  }
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    out.push({
      field: 'email',
      says: `"${email}" is not an email address. It needs an @ and a domain — leave it blank if you only have a phone number.`,
    })
  }

  // A role made only of spaces is no role, saved as Other like an empty one.
  const kind = contactKindOf(c.kind)
  if (kind && !Object.hasOwn(KINDS, kind)) {
    out.push({ field: 'kind', says: `"${kind}" is not a kind of contact this keeps.` })
  }

  return out
}

/** The role as sent, trimmed; null where it is empty or only spaces. */
export function contactKindOf(kind: unknown): string | null {
  const k = typeof kind === 'string' ? kind.trim() : ''
  return k.length > 0 ? k : null
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
        says: duplicateSays(hit.name, 'email'),
      }
    }
  }

  if (phone) {
    const hit = same.find((e) => normalPhone(e.phone) === phone)
    if (hit) {
      return {
        duplicate: true,
        of: hit,
        says: duplicateSays(hit.name, 'phone number'),
      }
    }
  }

  return { duplicate: false, says: 'New.' }
}

/**
 * The refusal for the same email or phone at the same company. It says
 * only what is true and what she can do: no contact can be edited yet,
 * so it never tells her to update one (walk of 2026-11-15).
 */
export function duplicateSays(name: string, by: 'email' | 'phone number'): string {
  return `${name} is already in your Contacts at this company with that ${by}, so nothing was saved. If this is somebody else, give their own ${by}.`
}

/** A name compared without case or extra spaces. */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return n(a) !== '' && n(a) === n(b)
}

/**
 * Somebody of the same name already on file at the same company, where no
 * email or phone matched (walk of 2026-11-15: one person saved twice, once
 * with an email and once with a phone). Never a refusal and never a merge:
 * two people can share a name, so the screen asks, and one press adds anyway.
 */
export function sameNameOnFile(
  c: { name: string; atCompanyId: string },
  existing: Existing[]
): { of: Existing; says: string } | null {
  const hit = existing.find((e) => e.atCompanyId === c.atCompanyId && sameName(e.name, c.name))
  if (!hit) return null
  // Reads with any name: never "A Imogen …" (press of 2026-11-15).
  return { of: hit, says: `Somebody named ${hit.name.trim()} is already in your Contacts at this company. Is this the same person?` }
}

/** The one press that saves anyway, where two people share a name. */
export const ADD_ANYWAY = 'Add anyway, this is somebody else'

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
  'member': 'MEMBER',
}

/** The desks a program office seats, from MSP_ROLES. */
const MSP_DESKS: Record<string, ContactKind> = {
  'owner': 'EXECUTIVE',
  'program manager': 'PROGRAM',
  'supplier manager': 'PROCUREMENT',
  'coordinator': 'RECRUITING',
  'ap clerk': 'AP',
  'compliance officer': 'COMPLIANCE',
  'member': 'MEMBER',
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
  'member': 'MEMBER',
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

/**
 * Where a contact may work, as the route reads it (`api/contacts/works-at`):
 * the caller's own firm, and every company on its Companies list.
 */
export interface WorksAtBook {
  /** The firm itself, and the domain its own people sign in from, where it has one. */
  own: { id: string; name: string; domain?: string | null }
  companies: { id: string; name: string; domain: string | null }[]
  /**
   * Whether this seat may add a company to the list in the same save, and
   * where it may not, the sentence naming who may (fix list A2).
   */
  mayRecord?: boolean
  whoRecords?: string | null
}

export interface WorksAtChoice {
  id: string
  name: string
  /** The caller's own firm: its own people are contacts too (fix list, 2026-11-14, H1). */
  own: boolean
}

/** How the firm's own name reads at the top of Works for. */
export function ownFirmChoice(name: string): string {
  return `${name} (your own firm)`
}

/**
 * The choices under Works for: the firm's own name first, marked as its own
 * firm, then every company on its Companies list once, sorted by name.
 * Two companies of one name (a company is known by its domain) are told
 * apart by their domain, or by saying they have none yet.
 */
export function worksAtChoices(book: WorksAtBook | null | undefined): WorksAtChoice[] {
  if (!book) return []
  const seen = new Map<string, { id: string; name: string; domain: string | null }>()
  for (const c of book.companies) if (c.id !== book.own.id && !seen.has(c.id)) seen.set(c.id, c)
  const rest = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.domain ?? '\uffff').localeCompare(b.domain ?? '\uffff'))
  const named = new Map<string, number>()
  for (const c of rest) named.set(c.name.trim().toLowerCase(), (named.get(c.name.trim().toLowerCase()) ?? 0) + 1)
  return [
    { id: book.own.id, name: ownFirmChoice(book.own.name), own: true },
    ...rest.map((c) => ({
      id: c.id,
      name: (named.get(c.name.trim().toLowerCase()) ?? 0) > 1 ? `${c.name} (${c.domain ?? 'no domain yet'})` : c.name,
      own: false,
    })),
  ]
}

/** Whether the route takes a contact at this company: the own firm, or one on the list. */
export function mayWorkAt(book: WorksAtBook, atCompanyId: string): boolean {
  return atCompanyId === book.own.id || book.companies.some((c) => c.id === atCompanyId)
}

/** The role a contact at the firm's own firm starts on. */
export const OWN_FIRM_KIND: ContactKind = 'MEMBER'

/**
 * The roles Add contact offers. "Team member" is a colleague at the
 * firm's own firm, so it is offered only when the own firm is chosen;
 * a person at another company is called about something, and "Other"
 * is always there for whoever is not sure.
 */
export function rolesOffered(atOwnFirm: boolean): { key: ContactKind; label: string; callAbout: string }[] {
  return (Object.entries(KINDS) as [ContactKind, (typeof KINDS)[ContactKind]][])
    .filter(([key]) => atOwnFirm || key !== 'MEMBER')
    .map(([key, v]) => ({ key, ...v }))
}

/** The route's sentence for "Team member" at another company. */
export function memberElsewhereSays(atName: string): string {
  return `Team member is for somebody at your own firm. Pick their role at ${atName}, or leave it on Other.`
}

/**
 * The roles the filter on Contacts offers: only roles somebody on the
 * list holds, in the table's own order, so no chip opens an empty list.
 */
export function kindsHeld(rows: readonly { kind: string }[]): { key: ContactKind; label: string; callAbout: string }[] {
  const held = new Set(rows.map((r) => r.kind))
  return (Object.entries(KINDS) as [ContactKind, (typeof KINDS)[ContactKind]][])
    .filter(([key]) => held.has(key))
    .map(([key, v]) => ({ key, ...v }))
}

// ── Works for, read from the email (fix list of 2026-11-14, A2) ────────
//
// The founder, 2026-11-14: "The email is the identifier." A contact's
// email domain says where she works, so Add contact reads it against the
// companies on the firm's own Companies list by the same rule that decides
// a company's identity (the registrable domain, `sameOrganisation`, which
// the twin rule uses). It only fills the box: she sees what was read and
// may choose another. Pure, so the screen and its tests read one answer.

/** The choice under Works for that adds a company not on the list yet, in the same save. */
export const NEW_COMPANY_CHOICE = 'new'

/** What the email's domain says about where a contact works. */
export type WorksForRead =
  /** No full email address yet: nothing is read. */
  | { read: 'NOTHING' }
  /** A personal mail domain, or Etyme's own: it says nothing about where they work. */
  | { read: 'NOT_A_COMPANY'; domain: string; platform: boolean }
  /** The firm's own domain: the firm itself. */
  | { read: 'OWN'; domain: string; id: string }
  /** One company on the list uses this domain. */
  | { read: 'ONE'; domain: string; company: { id: string; name: string } }
  /** Two or more companies on the list use it: she chooses, nothing is picked for her. */
  | { read: 'MANY'; domain: string; companies: { id: string; name: string }[] }
  /** No company on the list uses it: a new one, with a name she checks before saving. */
  | { read: 'NEW'; domain: string; name: string }

/** The domain of an email address that reads as one, lower case; null otherwise. */
export function emailDomain(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e)) return null
  return e.slice(e.lastIndexOf('@') + 1).replace(/\.$/, '')
}

const sameCompanyDomain = (a: string, b: string) => a === b || sameOrganisation(a, b)

/** Where the email says the contact works, read against the firm's own list. */
export function worksForFromEmail(email: string | null | undefined, book: WorksAtBook | null | undefined): WorksForRead {
  const domain = emailDomain(email)
  if (!domain || !book) return { read: 'NOTHING' }
  if (isPlatformDomain(domain)) return { read: 'NOT_A_COMPANY', domain, platform: true }
  if (!identityDomain(domain)) return { read: 'NOT_A_COMPANY', domain, platform: false }
  const own = book.own.domain ? identityDomain(book.own.domain) : null
  if (own && sameCompanyDomain(own, domain)) return { read: 'OWN', domain, id: book.own.id }
  const seen = new Set<string>()
  const hits = book.companies.filter((c) => {
    if (c.id === book.own.id || seen.has(c.id) || !c.domain || !sameCompanyDomain(c.domain, domain)) return false
    seen.add(c.id)
    return true
  })
  if (hits.length === 1) return { read: 'ONE', domain, company: { id: hits[0].id, name: hits[0].name } }
  if (hits.length > 1) {
    return { read: 'MANY', domain, companies: hits.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)) }
  }
  // A name from the domain, where there is nothing better, and only as the
  // first answer in a box she reads and may correct before saving.
  return { read: 'NEW', domain, name: nameFromDomain(registrableDomain(domain) ?? domain) }
}

/** The line under Works for, saying what the email told the form, and what saving will do. */
export function worksForSays(read: WorksForRead, opts: { ownName: string; companyName?: string; mayRecord: boolean; whoRecords?: string | null }): string | null {
  switch (read.read) {
    case 'NOTHING':
      return null
    case 'NOT_A_COMPANY':
      return read.platform
        ? `${read.domain} is Etyme's own address, so it does not say where they work. Choose the company.`
        : `${read.domain} is a personal email domain, so it does not say where they work. Choose the company.`
    case 'OWN':
      return `Chosen from the email: ${read.domain} is your own firm's domain. Choose another if that is wrong.`
    case 'ONE':
      return `Chosen from the email: ${read.company.name} uses ${read.domain}. Choose another if that is wrong.`
    case 'MANY':
      return `${read.companies.length} companies on your list use ${read.domain}: ${read.companies.map((c) => c.name).join(', ')}. Choose the one they work for.`
    case 'NEW':
      if (!opts.mayRecord) {
        return `No company on your list uses ${read.domain}. ${opts.whoRecords ?? 'Adding a company to your list is not part of your seat.'} You can still choose a company that is on your list.`
      }
      return `No company on your list uses ${read.domain}. Saving adds ${(opts.companyName ?? read.name).trim() || 'the company named below'} to your Companies, not classified. Nobody is emailed.`
  }
}

/** Where the name box for a new company asks her to look before saving. */
export const CHECK_THE_NAME = 'Check the name before you save. It was read from the email’s domain.'

/** The refusal for a new company with no name. */
export const NEW_COMPANY_NAME_MISSING = 'Give the new company’s name, at least two letters.'

/** The refusal where Works for is left empty. */
export const WORKS_FOR_MISSING = 'Say which company they work for.'

/** What she reads after a save that added a company too. Nothing went to anybody. */
export function savedWithCompanySays(person: string, company: string): string {
  return `${person} is in your Contacts at ${company}. ${company} was added to your Companies, not classified. Nothing was sent to anybody.`
}

/** What she reads after a save at a company already there. */
export function savedSays(person: string, company: string): string {
  return `${person} is in your Contacts at ${company}. Nothing was sent to them.`
}

/** The route's sentence for a company that is not on the caller's list. */
export const NOT_ON_YOUR_LIST_SAYS =
  'That company is not on your Companies list. Add it there first, then add the people you know at it.'

/** Where that sentence sends the reader: Companies, with Add a company open. */
export const ADD_A_COMPANY_HREF = '/dashboard/companies?new=1'

/**
 * The activity-log row for a contact added by hand: who added whom at
 * which company, and that nothing was sent. No remove exists, so the row
 * says honestly that it cannot be undone.
 */
export function contactRecordedLog(a: { byName: string; name: string; atName: string; ownFirm: boolean }): { summary: string; reason: string; reversible: false } {
  return {
    summary: `${a.byName} added ${a.name} at ${a.atName} to Contacts`,
    reason: a.ownFirm
      ? 'Added by hand as a colleague at this firm. Nothing was sent to them, and it gives them no login.'
      : 'Added by hand to this company’s own contacts. Nothing was sent to them.',
    reversible: false,
  }
}
