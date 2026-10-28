/**
 * The admin's setup checklist: eleven items, every one skippable, and it
 * comes back until it is done.
 *
 * Decided by the founder, 2026-10-22 ("shouldn't the admin account be more
 * elaborate, even if it means giving a 'skip for now' option"), drawn, and
 * built on his "Build it", 2026-10-28. Sign-in and "Your company" stay a
 * minute long (`lib/setup-steps`); after them the Owner or Admin reads
 * this list. Each item is one screen with its defaults filled, "Save and
 * continue", "Skip for now", and one line saying what skipping stops.
 *
 * This file is the rules and the words, with no database in it: which
 * items a kind of company reads, whether each is done, skipped or still to
 * do, the one line the reminder says, and where an answer came from. The
 * record is `lib/setup-checklist-state`; what a skipped item refuses is
 * `lib/setup-gates`.
 *
 * Three words, never a percentage: done, skipped, to do. A progress bar
 * with a number on it was struck from the drawing.
 */

export type ItemKey =
  | 'COMPANY'
  | 'ADDRESSES'
  | 'SITES'
  | 'PEOPLE_IN_CHARGE'
  | 'HOW_YOU_WORK'
  | 'PAPERS'
  | 'BANK'
  | 'COMPANIES'
  | 'TEAM'
  | 'DOMAIN'
  | 'INTEGRATIONS'

export type ItemOutcome = 'DONE' | 'SKIPPED'
export type ItemState = 'DONE' | 'SKIPPED' | 'TODO'
export type AnswerSource = 'DOMAIN' | 'PAPER' | 'IMPORT' | 'WEBSITE' | 'PERSON'

/** The eleven, in the order they are read. Sites is read third, after Addresses. */
export const ITEM_ORDER: readonly ItemKey[] = [
  'COMPANY', 'ADDRESSES', 'SITES', 'PEOPLE_IN_CHARGE', 'HOW_YOU_WORK', 'PAPERS',
  'BANK', 'COMPANIES', 'TEAM', 'DOMAIN', 'INTEGRATIONS',
]

export interface ItemWords {
  label: string
  /** The line under the name on the list. */
  line: string
  /** The one sentence under the heading when the item is open. */
  sub: string
  /** Lower case, after "Finish setting up:". */
  reminder: string
  /** What skipping stops, and nothing else. Said under the two buttons. */
  skipStops: string
}

export const ITEM_WORDS: Record<ItemKey, ItemWords> = {
  COMPANY: {
    label: 'Your company',
    line: 'Legal name, phone, time zone, currency',
    sub: 'The name and number on every bill and agreement.',
    reminder: 'your company',
    skipStops: 'If you skip: bills and agreements use the name you signed up with.',
  },
  ADDRESSES: {
    label: 'Addresses',
    line: 'Legal and billing address',
    sub: 'Every bill names your legal and billing address.',
    reminder: 'addresses',
    skipStops: 'If you skip: Etyme sends no bill until there is a billing address, and says so on the bill.',
  },
  SITES: {
    label: 'Sites',
    line: 'Where people work, and which suppliers fill jobs there',
    sub: 'Days off, the time zone and the suppliers follow the site.',
    reminder: 'your sites',
    // The site's own sentence (`skipStops` in lib/site-rules) names the
    // primary site; this is its general form for the list.
    skipStops: 'If you skip: a job with no site is posted at your primary site and goes to every approved supplier.',
  },
  PEOPLE_IN_CHARGE: {
    label: 'The people in charge',
    line: 'Owner, HR, billing contact, accounts email',
    sub: 'Who answers for the company, for its people and for its bills.',
    reminder: 'the people in charge',
    skipStops: 'If you skip: nothing stops.',
  },
  HOW_YOU_WORK: {
    label: 'How you work',
    line: 'The week, days off, holidays, payroll',
    sub: 'Your week runs Sunday to Saturday. Change what is off, and when hours are due.',
    reminder: 'how you work',
    skipStops: 'If you skip: the usual US week and payroll apply.',
  },
  PAPERS: {
    label: 'Papers you require',
    line: 'For workers, employees, suppliers, customers',
    sub: 'What you ask of each party before work starts. Work authorization cannot be waived.',
    reminder: 'papers you require',
    skipStops: 'If you skip: the shipped sets apply, and Etyme does not chase a paper for a party whose set you have not confirmed.',
  },
  BANK: {
    label: 'Bank details',
    line: 'Checked by Finance before anybody pays you',
    sub: 'Where your clients pay you. Only the bank, the account name and four digits are kept.',
    reminder: 'bank details',
    skipStops: 'If you skip: nobody pays this company until its bank details are checked.',
  },
  COMPANIES: {
    label: 'Your companies',
    line: 'The clients and suppliers you already work with',
    sub: 'Add the companies you already work with, so jobs, bills and papers reach them.',
    reminder: 'your companies',
    skipStops: 'If you skip: nothing stops. Add a company the first time you work with it.',
  },
  TEAM: {
    label: 'Your team',
    line: 'Invite the people who work here',
    sub: 'Each person gets the role for what they do here.',
    reminder: 'your team',
    skipStops: 'If you skip: nothing stops. Invite people any time from Users & permissions.',
  },
  DOMAIN: {
    label: 'Your domain',
    line: 'Verify your domain so colleagues join by signing in',
    sub: 'Prove you own your domain with one DNS record. Then colleagues join by signing in.',
    reminder: 'your domain',
    skipStops: 'If you skip: colleagues join by invitation until the domain is verified.',
  },
  INTEGRATIONS: {
    label: 'Integrations',
    line: 'Teams, and the export for your accounting system',
    sub: 'Where notices reach your people, and how your books get the journal.',
    reminder: 'integrations',
    skipStops: 'If you skip: nothing stops. Notices go by email until a Teams channel is set.',
  },
}

/**
 * The items a company of this kind reads, in order.
 *
 *  - A one-person firm is the person and the firm at once: no team to
 *    invite, no sites (she works where her client puts her), nobody else
 *    in charge, no colleague to join by domain. Seven items.
 *  - A client pays and is never paid, so it has no bank details to give.
 *  - Everybody else reads all eleven.
 */
export function itemsFor(kind: string | null | undefined): readonly ItemKey[] {
  if (kind === 'CONSULTANT_CORP') {
    return ITEM_ORDER.filter((k) => k !== 'SITES' && k !== 'TEAM' && k !== 'PEOPLE_IN_CHARGE' && k !== 'DOMAIN')
  }
  if (kind === 'CLIENT') return ITEM_ORDER.filter((k) => k !== 'BANK')
  return ITEM_ORDER
}

// ── What is already true, read off the company's own rows ────────────

/**
 * Facts that finish an item done another way. An address saved on the
 * Settings page, a site confirmed at first sign-in, a teammate invited
 * from Users & permissions: each finishes its item as surely as the
 * checklist does, so nobody is asked twice.
 */
export interface ChecklistFacts {
  legalNameSet: boolean
  legalAddress: boolean
  /** The billing address is the legal one, or a billing address is on file. */
  billingAddress: boolean
  /** Sites were confirmed at first sign-in (`lib/setup-steps`). */
  sitesConfirmed: boolean
  /** Somebody besides the owner is named in charge, or the accounts email is set. */
  inChargeNamed: boolean
  /** The week or payroll was answered by somebody, or at first sign-in. */
  workAnswered: boolean
  /** The parties whose paper set was confirmed. */
  papersConfirmed: readonly string[]
  /** The parties this company asks papers of (`defaultRequiredSets`). */
  papersOwed: readonly string[]
  bankEntered: boolean
  counterparties: number
  teammates: number
  domainVerified: boolean
  teamsSet: boolean
}

export const NO_FACTS: ChecklistFacts = {
  legalNameSet: false, legalAddress: false, billingAddress: false, sitesConfirmed: false,
  inChargeNamed: false, workAnswered: false, papersConfirmed: [], papersOwed: [],
  bankEntered: false, counterparties: 0, teammates: 0, domainVerified: false, teamsSet: false,
}

export type ChecklistRecord = Partial<Record<ItemKey, { outcome: ItemOutcome; byId: string | null; at: string }>>

/** Whether the company's own rows already finish this item. */
export function doneByFacts(item: ItemKey, f: ChecklistFacts): boolean {
  switch (item) {
    case 'COMPANY': return f.legalNameSet
    case 'ADDRESSES': return f.legalAddress && f.billingAddress
    case 'SITES': return f.sitesConfirmed
    case 'PEOPLE_IN_CHARGE': return f.inChargeNamed
    case 'HOW_YOU_WORK': return f.workAnswered
    case 'PAPERS': return f.papersOwed.length > 0 && f.papersOwed.every((p) => f.papersConfirmed.includes(p))
    case 'BANK': return f.bankEntered
    case 'COMPANIES': return f.counterparties > 0
    case 'TEAM': return f.teammates > 0
    case 'DOMAIN': return f.domainVerified
    case 'INTEGRATIONS': return f.teamsSet
  }
}

/**
 * Done, skipped or to do. Done wins: a skipped item later finished another
 * way is done, and an item recorded done stays done. A skipped item stays
 * skipped, and owed, until it is done.
 */
export function stateOf(item: ItemKey, record: ChecklistRecord, facts: ChecklistFacts): ItemState {
  if (record[item]?.outcome === 'DONE' || doneByFacts(item, facts)) return 'DONE'
  if (record[item]?.outcome === 'SKIPPED') return 'SKIPPED'
  return 'TODO'
}

export interface ChecklistRow {
  key: ItemKey
  label: string
  state: ItemState
  /** The list's line: the item's own, or for a skipped one what skipping stops. */
  line: string
  /** "2 of 11". */
  place: string
}

export interface Checklist {
  rows: ChecklistRow[]
  done: number
  skipped: number
  todo: number
  /** "3 done · 2 skipped · 6 to do". */
  countLine: string
  /** "Eleven things. Skip any of them for now." */
  intro: string
  /** The items still owed, in order: to do and skipped. */
  owed: ItemKey[]
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven']

export function checklistFor(input: { kind: string | null | undefined; record: ChecklistRecord; facts: ChecklistFacts }): Checklist {
  const keys = itemsFor(input.kind)
  const rows = keys.map((key, i): ChecklistRow => {
    const state = stateOf(key, input.record, input.facts)
    const w = ITEM_WORDS[key]
    return {
      key,
      label: w.label,
      state,
      line: state === 'SKIPPED' ? `Skipped. ${skipLine(key)}` : w.line,
      place: `${i + 1} of ${keys.length}`,
    }
  })
  const done = rows.filter((r) => r.state === 'DONE').length
  const skipped = rows.filter((r) => r.state === 'SKIPPED').length
  const todo = rows.length - done - skipped
  return {
    rows,
    done,
    skipped,
    todo,
    countLine: `${done} done · ${skipped} skipped · ${todo} to do`,
    intro: `${NUMBER_WORDS[keys.length] ?? keys.length} things. Skip any of them for now. This list stays on Today until it is done.`,
    owed: rows.filter((r) => r.state !== 'DONE').map((r) => r.key),
  }
}

/** What skipping stops, without the "If you skip:" in front, for the list's line. */
export function skipLine(item: ItemKey): string {
  const s = ITEM_WORDS[item].skipStops.replace(/^If you skip: /, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── The one line that comes back ─────────────────────────────────────

/** Where the reminder's link goes. */
export const CHECKLIST_HREF = '/dashboard/settings/setup'

/**
 * "Finish setting up: addresses, papers you require, bank details and 2
 * more." — or null when nothing is owed. One line however many items are
 * owed, naming at most three. Said
 * on Today and in the Ask Etyme greeting, with "Complete setup", until the
 * list is empty; it never nags daily, it stays.
 */
export function reminderSentence(owed: readonly ItemKey[]): string | null {
  if (owed.length === 0) return null
  // At most three named, so the line stays one short sentence in the chat's
  // voice; the setup page lists every item.
  const named = owed.slice(0, REMINDER_NAMES).map((k) => ITEM_WORDS[k].reminder)
  const rest = owed.length - named.length
  return rest > 0
    ? `Finish setting up: ${named.join(', ')} and ${rest} more.`
    : `Finish setting up: ${named.join(', ')}.`
}

/** How many items the reminder names before "and N more". */
export const REMINDER_NAMES = 3

/** The words of the reminder's link. */
export const COMPLETE_SETUP = 'Complete setup'

// ── Recording an item ────────────────────────────────────────────────

export type ItemVerdict =
  | { ok: true; item: ItemKey; outcome: ItemOutcome }
  | { ok: false; says: string }

/** Whether this item may be answered this way at this kind of company. Every item may be skipped. */
export function checkItemAnswer(kind: string | null | undefined, item: unknown, outcome: unknown): ItemVerdict {
  if (!ITEM_ORDER.includes(item as ItemKey)) return { ok: false, says: 'That is not one of the setup items.' }
  const key = item as ItemKey
  if (!itemsFor(kind).includes(key)) {
    return { ok: false, says: notForKind(kind, key) }
  }
  if (outcome !== 'DONE' && outcome !== 'SKIPPED') return { ok: false, says: 'Say whether the item is done or skipped.' }
  return { ok: true, item: key, outcome }
}

function notForKind(kind: string | null | undefined, item: ItemKey): string {
  if (kind === 'CLIENT' && item === 'BANK') return 'A client pays its suppliers and is not paid on Etyme, so it has no bank details to give.'
  if (kind === 'CONSULTANT_CORP') {
    if (item === 'SITES') return 'A one-person firm works where its client puts it, so it has no sites to confirm.'
    if (item === 'TEAM') return 'A one-person firm has no team to invite.'
    if (item === 'DOMAIN') return 'A one-person firm has no colleagues to join by domain.'
    return 'A one-person firm is in charge of itself, so there is nobody else to name.'
  }
  return 'That item is not part of setup for this company.'
}

// ── Where an answer came from ────────────────────────────────────────

/**
 * The line under an answer: where it came from, and who confirmed it when.
 * "From your W-9: “Tapin LLC”. Saved by Sharath Madavaram, Oct 28, 2026."
 */
export function sourceWords(input: {
  source: AnswerSource
  quote?: string | null
  by?: string | null
  at?: Date | string | null
  /** Which paper, where the source is a paper: "W-9". */
  paper?: string | null
}): string {
  const quoted = input.quote ? `: “${input.quote.trim().slice(0, 80)}”` : ''
  const from: Record<AnswerSource, string> = {
    DOMAIN: `Guessed from your work email${quoted}`,
    PAPER: `From your ${input.paper ?? 'paper'}${quoted}`,
    IMPORT: `From your file${quoted}`,
    WEBSITE: `From your website${quoted}`,
    PERSON: 'Typed by a person',
  }
  const head = input.source === 'PERSON' && input.by ? `Typed by ${input.by}` : from[input.source]
  const when = input.at ? dayWords(input.at) : null
  const tail = input.source !== 'PERSON' && input.by
    ? `. Confirmed by ${input.by}${when ? `, ${when}` : ''}.`
    : input.source === 'PERSON' && when ? `, ${when}.` : '.'
  return `${head}${tail}`
}

/** The stamp under an open item. */
export function savedStamp(by: string | null | undefined, at: Date | string | null | undefined): string {
  if (!at) return 'Not answered yet. Each answer is saved with your name and the time.'
  return `Saved by ${by ?? 'somebody no longer here'}, ${dayWords(at)}.`
}

function dayWords(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── The people in charge ─────────────────────────────────────────────

export type Duty = 'OWNER' | 'HR' | 'BILLING_CONTACT'
export const DUTIES: readonly Duty[] = ['OWNER', 'HR', 'BILLING_CONTACT']
export const DUTY_WORDS: Record<Duty, string> = {
  OWNER: 'Owner',
  HR: 'HR',
  BILLING_CONTACT: 'Billing contact',
}

/**
 * The role a person named in charge is invited with, where they are not
 * seated yet, by the role names this kind of company holds
 * (`lib/company-defaults`). Null: the Owner is never handed out by an
 * invitation.
 */
export function inviteRoleFor(duty: Duty, kind: string | null | undefined): string | null {
  if (duty === 'OWNER') return null
  if (duty === 'HR') return kind === 'CLIENT' ? 'HR Partner' : kind === 'MSP' ? 'Compliance Officer' : 'HR'
  return kind === 'CLIENT' || kind === 'MSP' ? 'AP Clerk' : 'Accounts Receivable'
}

/** A plain email, or null. */
export function plainEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

// ── Bank details ─────────────────────────────────────────────────────

/** Four digits, or null. Only the last four are ever kept. */
export function lastFour(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/** "Bellrock Bank · Tapin LLC · ending 0021". The whole of what a screen shows. */
export function bankWords(b: { bankName: string | null; accountName: string | null; last4: string | null }): string {
  return [b.bankName, b.accountName, b.last4 ? `ending ${b.last4}` : null].filter(Boolean).join(' · ')
}

/** Where the bank details stand, in a sentence. */
export function bankStanding(b: { verifiedAt: Date | string | null; verifiedBy?: string | null; verifiedAtFirm?: string | null }): string {
  if (b.verifiedAt) {
    return `Checked${b.verifiedAtFirm ? ` by ${b.verifiedAtFirm}’s Finance team` : ''}${b.verifiedBy ? ` (${b.verifiedBy})` : ''}, ${dayWords(b.verifiedAt)}.`
  }
  return 'Not checked yet. Each client’s Finance team checks these before it pays you.'
}

// ── Profile fields ───────────────────────────────────────────────────

export const ENTITY_TYPES: readonly string[] = [
  'LLC', 'Corporation', 'S corporation', 'Partnership', 'Sole proprietor', 'Nonprofit', 'Other',
]

/** A year a company could have been established in, or null. */
export function plainYear(raw: unknown, now: Date = new Date()): number | null {
  const n = Number(String(raw ?? '').trim())
  return Number.isInteger(n) && n >= 1800 && n <= now.getUTCFullYear() ? n : null
}

/** An https address as typed, or null. Never fetched. */
export function plainWebsite(raw: unknown): string | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withScheme)
    return u.hostname.includes('.') ? `https://${u.hostname}${u.pathname === '/' ? '' : u.pathname}` : null
  } catch {
    return null
  }
}

/** "12-3456789", from any spacing, or null. */
export function plainEin(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : null
}
