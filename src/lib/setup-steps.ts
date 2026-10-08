/**
 * Setup asks five things, then stops.
 *
 * Decided by the founder, 2026-10-07. After the first sign-in a new
 * company walks the five steps the prototype drew
 * (prototypes/Etyme_Onboarding.jsx): sign in; your company; how you work;
 * your people; your team. Every answer has a default, so a company may
 * click through in a minute, and what it answers is recorded with who and
 * when.
 *
 * This file is the rules and the words, with no database in it, so the
 * setup page, the dashboard's reminder and the door
 * (app/api/onboarding/setup) all read one answer. The record itself is
 * `Company.setupSteps`; the dates are `setupStartedAt` and
 * `setupFinishedAt`.
 */

import { TEMPLATE_PACKS } from '@/lib/template-packs'

// ── The steps ─────────────────────────────────────────────────────────

/** The four steps that are recorded. Signing in is the fifth, and it is done on arrival. */
export type SetupStep = 'COMPANY' | 'WORK' | 'PEOPLE' | 'TEAM'
export type StepOutcome = 'DONE' | 'SKIPPED'

export interface StepAnswer {
  outcome: StepOutcome
  /** The person who answered. */
  byId: string
  /** When, as an ISO string, because it is stored as JSON. */
  at: string
}

export type SetupRecord = Partial<Record<SetupStep, StepAnswer>>

export const RECORDED_STEPS: readonly SetupStep[] = ['COMPANY', 'WORK', 'PEOPLE', 'TEAM']

/** The rail, in the prototype's order and words. */
export const SETUP_RAIL: readonly { key: 'SIGN_IN' | SetupStep; label: string }[] = [
  { key: 'SIGN_IN', label: 'Sign in' },
  { key: 'COMPANY', label: 'Your company' },
  { key: 'WORK', label: 'How you work' },
  { key: 'PEOPLE', label: 'Your people' },
  { key: 'TEAM', label: 'Your team' },
]

/**
 * The steps a company of this kind walks.
 *
 * A one-person firm is the person and the firm at once: there is no
 * contractor list to import and nobody else to invite, so its setup is
 * three steps — sign in, your company, how you work — and it is never
 * asked for a list or a team, nor reminded of one (sign-up walk, round
 * two, item 37).
 */
export function stepsFor(kind?: string | null): readonly SetupStep[] {
  return kind === 'CONSULTANT_CORP' ? ['COMPANY', 'WORK'] : RECORDED_STEPS
}

/** The rail a company of this kind sees: signing in, then its own steps. */
export function railFor(kind?: string | null): readonly { key: 'SIGN_IN' | SetupStep; label: string }[] {
  const mine = stepsFor(kind)
  return SETUP_RAIL.filter((s) => s.key === 'SIGN_IN' || mine.includes(s.key))
}

/** "Step 3 of 3": where a step sits on this company's own rail. */
export function stepLabel(step: SetupStep, kind?: string | null): string {
  const rail = railFor(kind)
  return `Step ${rail.findIndex((s) => s.key === step) + 1} of ${rail.length}`
}

/**
 * Which steps may be skipped. A company cannot exist without a name and a
 * type, and how it works always has an answer — the defaults are one —
 * so only the two that bring things in from outside may wait.
 */
export const SKIPPABLE: readonly SetupStep[] = ['PEOPLE', 'TEAM']

/** The step words a reminder uses, lower case after "Finish setting up:". */
const REMINDER_WORDS: Record<SetupStep, string> = {
  COMPANY: 'your company',
  WORK: 'how you work',
  PEOPLE: 'your people',
  TEAM: 'your team',
}

/** Whatever was stored, read back as a record. Anything malformed is ignored, never trusted. */
export function readRecord(raw: unknown): SetupRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: SetupRecord = {}
  for (const step of RECORDED_STEPS) {
    const a = (raw as Record<string, any>)[step]
    if (a && (a.outcome === 'DONE' || a.outcome === 'SKIPPED') && typeof a.byId === 'string' && typeof a.at === 'string') {
      out[step] = { outcome: a.outcome, byId: a.byId, at: a.at }
    }
  }
  return out
}

export type RecordVerdict =
  | { ok: true; record: SetupRecord; finished: boolean }
  | { ok: false; message: string }

/**
 * Record one answer, with who and when.
 *
 * Answering a step again replaces the earlier answer — a company that
 * skipped its people and came back to import them has done the step, and
 * the record says so with the later name and date.
 */
export function recordStep(
  record: SetupRecord,
  step: unknown,
  outcome: unknown,
  byId: string,
  at: Date,
  kind?: string | null,
): RecordVerdict {
  if (!RECORDED_STEPS.includes(step as SetupStep)) {
    return { ok: false, message: 'That is not one of the setup steps.' }
  }
  if (!stepsFor(kind).includes(step as SetupStep)) {
    return { ok: false, message: 'A one-person firm has no contractor list or team to set up.' }
  }
  if (outcome !== 'DONE' && outcome !== 'SKIPPED') {
    return { ok: false, message: 'Say whether the step is done or skipped.' }
  }
  const s = step as SetupStep
  if (outcome === 'SKIPPED' && !SKIPPABLE.includes(s)) {
    return {
      ok: false,
      message:
        s === 'COMPANY'
          ? 'Your company cannot be skipped. It needs a name and a type.'
          : 'How you work cannot be skipped, but the defaults are already filled in. Press Continue to keep them.',
    }
  }
  const next: SetupRecord = { ...record, [s]: { outcome, byId, at: at.toISOString() } }
  return { ok: true, record: next, finished: isFinished(next, kind) }
}

/** Every step has an answer, done or skipped. */
export function isFinished(record: SetupRecord, kind?: string | null): boolean {
  return stepsFor(kind).every((s) => record[s])
}

/** The first step with no answer yet, or null when every step has one. */
export function nextStep(record: SetupRecord, kind?: string | null): SetupStep | null {
  return stepsFor(kind).find((s) => !record[s]) ?? null
}

// ── What is still owed, and the one line that says so ────────────────

/** Facts read off the company's own rows, so a step done another way counts. */
export interface SetupFacts {
  /** An import of people was committed. */
  peopleImported: boolean
  /** Somebody besides the owner holds a seat or was invited. */
  teammates: number
}

/**
 * The steps still owed: unanswered, or skipped and not since done another
 * way. Importing from the Import page later, or inviting from Users and
 * permissions, finishes the step as surely as doing it here.
 */
export function outstanding(record: SetupRecord, facts: SetupFacts, kind?: string | null): SetupStep[] {
  return stepsFor(kind).filter((s) => {
    if (s === 'PEOPLE' && facts.peopleImported) return false
    if (s === 'TEAM' && facts.teammates > 0) return false
    return record[s]?.outcome !== 'DONE'
  })
}

export interface Reminder {
  says: string
  href: string
}

/**
 * The one line on the dashboard, or nothing.
 *
 * Only for a company that began setup — one formed before the steps
 * existed, or recorded by somebody else as a counterparty, is never asked.
 * One line however many steps are owed, never a line per step.
 */
export function reminderFor(input: {
  startedAt: Date | string | null
  record: SetupRecord
  facts: SetupFacts
  kind?: string | null
}): Reminder | null {
  if (!input.startedAt) return null
  const owed = outstanding(input.record, input.facts, input.kind)
  if (owed.length === 0) return null
  return {
    says: `Finish setting up: ${owed.map((s) => REMINDER_WORDS[s]).join(', ')}.`,
    href: '/start?finish=1',
  }
}

/**
 * Whether /start shows the steps to this person.
 *
 * Only to somebody who may change the company's setup. Never to a company
 * that finished, unless they followed the dashboard's link back and there
 * is something still owed.
 */
export function showsSteps(input: {
  startedAt: Date | string | null
  finishedAt: Date | string | null
  mayRun: boolean
  followedLinkBack: boolean
  owed: number
}): boolean {
  if (!input.startedAt || !input.mayRun) return false
  if (!input.finishedAt) return true
  return input.followedLinkBack && input.owed > 0
}

/**
 * The line over "How you work" for a supplier that took its record from
 * a client's invitation: who the client is, and what comes next.
 */
export function claimedSentence(client: string): string {
  return `${client} is your client. Next: your week and payroll.`
}

// ── Step 2: country, currency and the pack ───────────────────────────

export interface CountryOption {
  code: string
  name: string
  currency: string
}

/**
 * The countries setup offers. The first three have holidays built in
 * (lib/holidays); the rest start with an empty calendar the company fills.
 * Every code `countryFromDomain` can guess is here.
 */
export const COUNTRIES: readonly CountryOption[] = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
]

export const CURRENCIES: readonly string[] = Array.from(new Set(COUNTRIES.map((c) => c.currency)))

export function countryName(code: string | null | undefined): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? (code ?? 'United States')
}

/** The currency a country pays in. Dollars where the country is not on the list. */
export function currencyFor(country: string | null | undefined): string {
  return COUNTRIES.find((c) => c.code === (country ?? '').toUpperCase())?.currency ?? 'USD'
}

/** A two-letter code setup knows, or null. */
export function knownCountry(code: unknown): string | null {
  const c = String(code ?? '').trim().toUpperCase()
  return COUNTRIES.some((x) => x.code === c) ? c : null
}

/** A three-letter currency, or null. */
export function knownCurrency(code: unknown): string | null {
  const c = String(code ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : null
}

/**
 * The country guess, said as a guess. A guess shown as a fact is a wrong
 * calendar nobody checks.
 */
export function countryGuessSentence(country: string, domain: string | null): string {
  if (!domain) {
    return `A personal email does not say where you are, so we started with ${countryName(country)}. Change it if that is wrong.`
  }
  return `We guessed ${countryName(country)} from your web address. Change it if that is wrong.`
}

/** How a pack's country is said in one line. */
const PACK_PLACE: Record<string, string> = { US: 'US', IN: 'India', GB: 'UK' }

const RHYTHM_WORDS: Record<string, string> = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'every other week',
  SEMIMONTHLY: 'twice a month',
  MONTHLY: 'monthly',
}

/**
 * Which pack the dates follow, in one line, read off the pack itself so
 * the sentence cannot drift from what the generator does.
 */
export function packSentence(packId: string): string {
  const pack = TEMPLATE_PACKS[packId]
  if (!pack) return 'Your dates follow the default pack.'
  const hours = pack.cycleDefinitions.find((c) => c.kind === 'TIMESHEET_SUBMIT')?.frequency
  const pay = pack.cycleDefinitions.find((c) => c.kind === 'SALARY_PAY')?.frequency
  // The rhythm is said once, after the colon; before it only the country.
  const word = (f: string) => RHYTHM_WORDS[f] ?? f.toLowerCase()
  const parts = [
    hours ? (hours === 'WEEKLY' || hours === 'MONTHLY' ? `${word(hours)} hours` : `hours ${word(hours)}`) : null,
    pay ? `pay ${word(pay)}` : null,
  ].filter(Boolean)
  return `Your dates follow the ${PACK_PLACE[pack.country] ?? countryName(pack.country)} pack: ${parts.join(', ')}.`
}

// ── Where a colleague lands ──────────────────────────────────────────

/**
 * The page each desk opens on, best first. A colleague with a role lands
 * on their own desk's page rather than on a dashboard with nothing for
 * them on it. Owner and Admin have no entry: the console is their desk.
 */
export const DESK_PAGES: Record<string, readonly string[]> = {
  Recruiter: ['/dashboard/requirements', '/dashboard/submissions'],
  'Resource Manager': ['/dashboard/bench', '/dashboard/rolloff'],
  'Account Manager': ['/dashboard/requirements', '/dashboard/submissions'],
  HR: ['/dashboard/compliance', '/dashboard/consultants'],
  'Contract Manager': ['/dashboard/contracts'],
  'Accounts Receivable': ['/dashboard/ar', '/dashboard/invoices'],
  'AP & Payroll': ['/dashboard/payroll', '/dashboard/ap'],
  Finance: ['/dashboard/ar', '/dashboard/payroll'],
  'Compliance Officer': ['/dashboard/compliance'],
  'Program Manager': ['/dashboard/program'],
  'Hiring Manager': ['/dashboard/requisitions', '/dashboard/requirements'],
  Approver: ['/dashboard/decisions'],
  'HR Partner': ['/dashboard/requisitions', '/dashboard/requirements'],
  'Procurement Lead': ['/dashboard/suppliers'],
  'AP Clerk': ['/dashboard/ap', '/dashboard/invoices'],
  Viewer: ['/dashboard/program'],
  'Supplier Manager': ['/dashboard/suppliers'],
  Coordinator: ['/dashboard/requirements', '/dashboard/submissions'],
  'Delivery Manager': ['/dashboard/bench', '/dashboard/requirements'],
  'Contractor Desk': ['/dashboard/requirements', '/dashboard/consultants'],
  'Team Lead': ['/dashboard/timesheets'],
  Member: ['/dashboard/my-work', '/dashboard/timesheets'],
}

/**
 * The first of the desk's pages that is on this seat's own menu, or the
 * console. Read against the menu so a desk is never sent to a page its
 * own route refuses.
 */
export function deskPageFor(roleName: string | null | undefined, menu: readonly string[], home: string): string {
  const wanted = roleName ? DESK_PAGES[roleName] ?? [] : []
  return wanted.find((href) => menu.includes(href)) ?? home
}
