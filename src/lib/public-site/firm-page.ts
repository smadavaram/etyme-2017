/**
 * What a client reads on a staffing or bench firm's public page, and can
 * act on (the Tapin walk, 2026-10-29: "a client reads nothing to act on:
 * nobody coming free, no ask box, no contact").
 *
 * Three things, each read from the record and nothing invented:
 *
 *   who is coming free — skills, place and the day, never a name or a
 *   rate, and only people who said yes to being shown beyond the firm;
 *   an ask box — the question lands in the firm's own Ask Etyme, never
 *   in Etyme's list, because a firm's client is the firm's;
 *   the firm's contact — as the firm set it at setup: its phone, its
 *   accounts mailbox and the names of the people in charge, never a
 *   person's own address.
 *
 * Pure: nothing in here touches the database.
 */

import { normalEmail, tidy } from '@/lib/public-site/leads'
import { formatDay } from '@/lib/format-date'
import type { ComingFree } from '@/lib/public-site'

// ── Who may be shown on the open internet ───────────────────────────

/** A bench listing, as far as the public page needs to know it. */
export interface ListingConsent {
  /** INVITED · GRANTED · DECLINED. Only the person's own yes counts. */
  state: string
  revokedAt: Date | null
  /** When the stay the person chose runs out; null is until cancelled. */
  staysUntil: Date | null
  /**
   * The person's second, narrower yes: that the firm may show them to
   * companies it does not trade with yet. A public page reaches everybody,
   * so it is the yes this page needs. Off by default; only the person
   * turns it on.
   */
  showInMatches: boolean
  /** Whether they agreed to be shown before their current contract ends. */
  showBeforeFree: boolean
}

/**
 * Whether one person may appear on the firm's public page at all, with
 * no name and no rate either way.
 *
 * "Nothing reaches past this firm until you say yes" is what the firm's
 * own Join the bench line promises; a page anybody can open is past the
 * firm, so the yes it needs is the one to be shown beyond it.
 */
export function mayShowPublicly(l: ListingConsent, now: Date, stillWorking: boolean): boolean {
  if (l.state !== 'GRANTED') return false
  if (l.revokedAt) return false
  if (l.staysUntil && l.staysUntil.getTime() <= now.getTime()) return false
  if (!l.showInMatches) return false
  if (stillWorking && !l.showBeforeFree) return false
  return true
}

/** A person on the bench with no running contract. */
export interface BenchRow {
  personId: string
  headline: string | null
  skills: string[]
  location: string | null
  listing: ListingConsent
  /** True where any running contract has them working today. */
  working: boolean
}

/**
 * The people free today, for the page's "Coming free" list.
 *
 * Somebody still working is the rolling-off list's, never this one's, so
 * nobody is said to be free while they are on a contract.
 */
export function benchFreeNow(rows: BenchRow[], now: Date, alreadyListed: ReadonlySet<string> = new Set()): ComingFree[] {
  const today = now.toISOString().slice(0, 10)
  const seen = new Set(alreadyListed)
  const out: ComingFree[] = []
  for (const r of rows) {
    if (r.working || seen.has(r.personId)) continue
    if (!mayShowPublicly(r.listing, now, false)) continue
    seen.add(r.personId)
    out.push({
      headline: r.headline,
      skills: r.skills,
      location: r.location,
      freeOn: today,
      daysUntilFree: 0,
      provenAt: null,
    })
  }
  return out
}

/** "Free now", "Free in 12 days", "Free Nov 14": the day, never a code. */
export function freeSays(c: Pick<ComingFree, 'daysUntilFree' | 'freeOn'>): string {
  if (c.daysUntilFree <= 0) return 'Free now'
  if (c.daysUntilFree <= 30) return `Free in ${c.daysUntilFree} day${c.daysUntilFree === 1 ? '' : 's'}`
  return `Free ${formatDay(c.freeOn)}`
}

/** The summary line, counted from the rows actually shown. */
export function freeSummary(rows: Pick<ComingFree, 'daysUntilFree'>[]): string | null {
  if (rows.length === 0) return null
  const now = rows.filter((r) => r.daysUntilFree <= 0).length
  const soon = rows.length - now
  const n = (k: number) => `${k} ${k === 1 ? 'person' : 'people'}`
  if (now > 0 && soon > 0) return `${n(now)} free now, ${soon} more within three months.`
  if (now > 0) return `${n(now)} free now.`
  return `${n(soon)} coming free within three months.`
}

// ── The firm's contact, as the firm set it ──────────────────────────

export type InChargeDuty = 'OWNER' | 'HR' | 'BILLING_CONTACT'

const DUTY_SAYS: Record<InChargeDuty, string> = {
  OWNER: 'Owner',
  HR: 'HR',
  BILLING_CONTACT: 'Billing',
}

export interface ContactInput {
  phone: string | null
  accountsEmail: string | null
  /**
   * The people in charge, from setup. The email on the row is never read
   * here: it is a person's own address, and a public page is not the
   * place for it.
   */
  inCharge: { duty: string; name: string | null; seatedName: string | null }[]
}

export interface FirmContact {
  phone: string | null
  accountsEmail: string | null
  people: { role: string; name: string }[]
}

/** Null where the firm set nothing, so the page invents nothing. */
export function firmContact(c: ContactInput): FirmContact | null {
  const phone = tidy(c.phone)
  const mail = normalEmail(c.accountsEmail)
  const accountsEmail = mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : null
  const order: InChargeDuty[] = ['OWNER', 'HR', 'BILLING_CONTACT']
  const people = order.flatMap((duty) => {
    const row = c.inCharge.find((r) => r.duty === duty)
    const name = tidy(row?.name ?? null) ?? tidy(row?.seatedName ?? null)
    return name ? [{ role: DUTY_SAYS[duty], name }] : []
  })
  if (!phone && !accountsEmail && people.length === 0) return null
  return { phone, accountsEmail, people }
}

/** `tel:` for a phone as the firm wrote it, digits and a leading plus only. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null
}

// ── The ask box, landing in the firm's Ask Etyme ────────────────────

/** Whether this kind of company's page carries the ask box for a client. */
export function offersAsk(kind: string): boolean {
  return kind === 'VENDOR'
}

export const FIRM_ASK_COPY = {
  heading: (firm: string) => `Ask ${firm}`,
  means: (firm: string) =>
    `It goes to the people at ${firm} who put consultants forward. Nobody else reads it, and nothing is sent to you but their answer.`,
  emailLabel: 'Your work email',
  askLabel: 'What do you need?',
  askPlaceholder: 'A data engineer in Ohio from December, for six months.',
  namePlaceholder: 'Your name',
  companyPlaceholder: 'Your company',
  button: 'Send it',
  sending: 'Sending…',
} as const

/** The one reply, true on every path that reaches it. */
export function firmAskThanks(firm: string): string {
  return `Sent to ${firm}. It is waiting for them on Etyme, with your address to write back to.`
}

export const NOBODY_READS =
  'Nobody at this firm can read a question yet, so nothing was sent. Try again later.'

const ASK_LIMIT = 2000

export interface FirmAskInput {
  email?: string | null
  asked?: string | null
  name?: string | null
  companyName?: string | null
}

/** Each field quoted back where it is wrong, in the page's words. */
export function firmAskProblems(a: FirmAskInput): { field: 'email' | 'asked' | 'name' | 'companyName'; says: string }[] {
  const out: { field: 'email' | 'asked' | 'name' | 'companyName'; says: string }[] = []
  const typed = (a.email ?? '').trim()
  if (!typed) {
    out.push({ field: 'email', says: 'Your email, so the firm can write back.' })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed) || typed.length > 254) {
    out.push({ field: 'email', says: `“${typed}” is not an email address anybody can write back to.` })
  }
  const asked = (a.asked ?? '').trim()
  if (asked.length < 3) {
    out.push({ field: 'asked', says: 'Say what you need. A sentence is enough.' })
  } else if (asked.length > ASK_LIMIT) {
    out.push({ field: 'asked', says: `That is ${asked.length.toLocaleString('en-US')} characters. Send the sentence that matters; they will ask for the rest.` })
  }
  if ((a.name ?? '').trim().length > 200) out.push({ field: 'name', says: 'That is longer than a name.' })
  if ((a.companyName ?? '').trim().length > 200) out.push({ field: 'companyName', says: 'That is longer than a company name.' })
  return out
}

/** How many questions one firm's page takes in an hour before it stops. */
export const ASKS_PER_HOUR = 30

/** The notice each seat reads in Ask Etyme: who asked, and what. */
export function firmAskNotice(a: { email: string; asked: string; name: string | null; companyName: string | null }): { title: string; body: string } {
  const who = a.name ? (a.companyName ? `${a.name} at ${a.companyName}` : a.name) : a.companyName ? `Somebody at ${a.companyName}` : a.email
  const short = a.asked.length > 80 ? `${a.asked.slice(0, 77).trimEnd()}…` : a.asked
  return {
    title: `${who} asked from your page: “${short}”`,
    body: `${a.asked}\n\nWrite back to ${a.email}. They asked from your page on Etyme; nobody else was sent this.`,
  }
}
