/**
 * Ask Etyme for the worker: the same chat, inside her own pages, and no
 * separate app (founder, 2026-10-16; CLAUDE.md, "Billing and paying follow
 * the agreement between each pair": "then Ask Etyme for workers").
 *
 * A worker's seat — somebody on a firm's bench, or a firm's own employee
 * whose seat reads only their own work — opens on a greeting about her
 * own work, never a firm's queue: the week she has not filed, the paper
 * somebody asked for, the interview waiting on her answer, the bench stay
 * running out; then where each week she sent stands, from filed to paid;
 * and the chain she works through, by name.
 *
 * Pure: no database, no model, no network. Every fact is read by
 * ./worker-read from the worker's own doors (`/api/me/work`,
 * `/api/me/papers`, `/api/me/pipeline`, `/api/me/benches`) and handed in
 * here, so the rules are tested as rules.
 *
 * Four rules hold every sentence here:
 *
 * - **Etyme never files, signs or sends for her.** "File my week" opens
 *   her own page; the twin has no act that files a week, and no act kind
 *   was added for this. A renewal card renews through the bench route
 *   she already uses, on her own press.
 * - **Owed means her employer accepted it.** A week the client signed is
 *   still waiting until the firm that pays her accepts it (founder,
 *   2026-09-29), so "owed to you" never follows a client's signature.
 * - **She knows the whole chain and no rate but her own** (founder,
 *   2026-09-28). Every firm between her and the client is named; what one
 *   firm charges another is never said, and a question about it is
 *   refused in one sentence.
 * - **A figure comes from the record or is not given.** An amount is the
 *   payroll pricing `/api/me/work` already did; where it priced nothing,
 *   nothing is said about money. Expected hours are said only for a whole
 *   week, from the job's own hours.
 */

import { formatDay } from '@/lib/format-date'
import { format, fromMinor } from '@/lib/money'
import { isDeskless } from '@/lib/nav-table'
import { generalAsk, anotherBook } from './transaction'
import { sinceSays, type Link, type RichLine, type NoticeLine, type ThreadNote } from './ask'

// ── Whose Ask Etyme this is ──────────────────────────────────────────

/**
 * A worker's seat: somebody on a firm's bench (a CONSULTANT context), or
 * a firm's own employee whose seat holds no desk — only the reads of
 * their own work, like Karthik Menon at Teleworld. Either reads Ask Etyme
 * about their own work. A seat that holds a desk reads the firm's, as
 * before; the shared sample and a machine key are never a worker.
 */
export function isWorkerSeat(seat: { contextType: string; permissions: readonly string[]; isService?: boolean; readOnly?: boolean }): boolean {
  if (seat.isService || seat.readOnly) return false
  if (seat.contextType === 'CONSULTANT') return true
  return seat.contextType === 'EMPLOYEE' && isDeskless(seat.permissions)
}

// ── The words ────────────────────────────────────────────────────────

/** The chips over the box, for a worker. Each is answered by rules. */
export const WORKER_QUESTIONS: readonly string[] = [
  'What needs me today?',
  'Is my week signed?',
  'What am I owed?',
  'What papers are due?',
  'Who has my consent?',
]

/** What Etyme answers for a worker: the help reply, and the tail of "not yet". */
export const WORKER_ANSWERS =
  'Ask about what needs you, your signed weeks, your pay, your papers or your consent.'

/** Said once wherever a card offers to file a week: the card opens her own page. */
export const NEVER_FILES = 'Etyme never files a week for you; the button opens your own page.'

/** "File my week" asked in the chat. */
export const FILE_IT_YOURSELF = 'Etyme never files your week; you file it on Your work.'

/** The greeting's closing line for a worker. */
export const WORKER_CLOSE = 'Ask me about your weeks, your pay, your papers and your consent. I never file or sign anything for you.'

/** The line under the box, for a worker: what Etyme answers from, and what it never does for her. */
export const WORKER_FOOTER = 'Etyme answers from your own record. It never files, signs or sends anything for you.'

/** The boundary, the greeting's last line, for a worker: nothing she types leaves. */
export const WORKER_BOUNDARY = 'Your record stays yours. Every read is logged. Nothing you type leaves to a model.'

/** A general question with no record behind it. */
export const ONLY_YOUR_WORK =
  'I answer only about your own work: your weeks, your pay, your papers, your interviews and your consent.'

/** Another person's pay, another firm's book, or a benchmark. */
export const NOT_ANOTHER_PERSON = 'I answer only about your own work, never another person’s pay or a firm’s rates.'

/** What one firm charges another for her hours: never said to her. */
export const NOT_THEIR_RATE = 'Etyme shows you your own pay only; what one firm charges another stays between them.'

const YOUR_WORK = '/dashboard/my-work'
const YOUR_PAPERWORK = '/dashboard/my-work/paperwork'
const WHO_HAS_YOU = '/dashboard/my-benches'

// ── The facts ────────────────────────────────────────────────────────

/** How the firm at the bottom of the chain stands to her, read off the buy line that pays her. */
export type Tie = 'EMPLOYED' | 'PAID' | null

/** One placement, one chain, as `/api/me/work` names it. */
export interface WorkerPlacement {
  site: string
  /** Every firm between the site and her employer, nearest the client first. */
  through: string[]
  employer: string
  tie: Tie
  live: boolean
  /** Her last day, where the placement has one. */
  endDate: string | null
  /** Her own pay, from her own rung only, in minor units. Null where Etyme holds none. */
  payRateMinor: number | null
  payCurrency: string | null
  /** Why there is no rate, in `/api/me/work`'s own words. */
  rateNote: string | null
}

/** A run of days she may still file, from her own filing card. */
export interface WeekToFile {
  periodStart: string
  periodEnd: string
  site: string
  /** The Sunday-to-Saturday week the run sits in has ended. */
  ended: boolean
  /** The run covers the whole Sunday-to-Saturday week. */
  wholeWeek: boolean
  /** Hours a week the job runs, where the job says; only said for a whole week. */
  expectedHours: number | null
  /** The day her hours are due, from her own hours-due dates; null where none is written. */
  dueOn: string | null
}

/** A week sent back to her, with the signer's reason. */
export interface ReturnedWeek { periodStart: string; periodEnd: string; site: string; reason: string | null }

/**
 * A week she sent, where it stands. One stage, in the order a week moves:
 * waiting for the client, waiting for a firm below it, accepted by her
 * employer and owed, paid. SIGNED is a week every firm accepted that is
 * not paid by payroll here (her own company or a supplier bills for it),
 * and NOT_SENT a week saved and never sent.
 */
export type SentStage = 'NOT_SENT' | 'WAITING_FOR_CLIENT' | 'WAITING_FOR_EMPLOYER' | 'OWED' | 'PAID' | 'SIGNED'

export interface SentWeek {
  id: string
  periodStart: string
  periodEnd: string
  hours: number
  stage: SentStage
  /** The firm it is with now, where it waits. */
  waitingOn: string | null
  /** The client who signs it first. */
  client: string | null
  /** The firm that pays her; it owes her once it accepts the week. */
  employer: string | null
  /** Where the client approved by email: "Approved by email: Dana Whitfield, Oct 2". */
  approvedBy: string | null
  /** What is still owed for it, in minor units; null where payroll priced nothing. */
  stillOwedMinor: number | null
  /** The hours still unpaid on it, as payroll priced them: what the amount owed is for. */
  owedHours: number | null
  currency: string | null
  dueOn: string | null
  overdue: boolean
  paidOn: string | null
}

/** Something asked of her on her paperwork page. */
export interface PaperAsk {
  id: string
  name: string
  todo: 'sign' | 'upload' | 'open'
  askedBy: string | null
  dueOn: string | null
  stopsWork: boolean
  href: string
  /**
   * The paper she holds that this ask renews, where it renews one: its
   * name and the day it runs out. That day is the one that matters to
   * her, not the ask's own due date, which can fall after the lapse (the
   * walk of 2026-10-22: a license running out Nov 15 read "due Dec 6").
   */
  renews?: { name: string; runsOutOn: string } | null
}

/** A document she holds that runs out soon. */
export interface PaperRunningOut { name: string; runsOutOn: string; stopsWork: boolean }

/** An interview round about her. */
export interface InterviewFact {
  id: string
  role: string
  with: string
  round: number
  /** Still waiting on her answer. */
  waitingOnYou: boolean
  booked: boolean
}

/** A bench stay that ended, or ends soon, which she may renew. */
export interface StayFact {
  listingId: string
  firm: string
  endsOn: string
  ended: boolean
  /** How long the stay she chose lasts, renewed on the same choice. */
  days: number
}

/** Who has her consent, and who employs her. */
export interface ConsentFacts {
  benches: Array<{ firm: string; since: string | null; stay: string | null }>
  /** Firms that asked to list her and wait on her answer. */
  asking: string[]
  /** Firms that employ her: they put her forward without asking, and tell her. */
  employers: string[]
}

export interface WorkerFacts {
  /** Is she on a firm's bench, or a firm's own employee whose seat reads only her own work. */
  seat: 'CONSULTANT' | 'EMPLOYEE'
  /** The firm her seat is at, where it is at one. */
  seatAt: string | null
  placements: WorkerPlacement[]
  toFile: WeekToFile[]
  returned: ReturnedWeek[]
  sent: SentWeek[]
  /** Weeks her own company bills for, said in hours and weeks, never as wages. */
  ownCompanyBills: string | null
  /** Accepted weeks with no rate on Etyme, said rather than counted as zero. */
  weeksWithNoRate: number
  papers: PaperAsk[]
  runningOut: PaperRunningOut[]
  interviews: InterviewFact[]
  /**
   * The jobs firms put her forward for, from her own pipeline: the job,
   * who put her forward, where it stands in the pipeline's own words, and
   * whether it is still open. Absent where it was not read.
   */
  putForward?: Array<{ role: string; by: string; says: string; live: boolean }>
  stays: StayFact[]
  consent: ConsentFacts
  /**
   * Where she stands against each client's time limit, for a site she is
   * on today and whose client set one: whole months counted, never rounded
   * up, across every supplier. Absent where none was read.
   */
  limits?: Array<{ site: string; months: number; capMonths: number; past: boolean }>
  /** Parts of her record that could not be read just now; never said as "nothing". */
  unread: Array<'weeks' | 'papers' | 'interviews' | 'consent'>
}

// ── The answer ───────────────────────────────────────────────────────

/** What a card does. None of them is a twin act: each opens her page, or is her own press on her own route. */
export type WorkerAct = 'FILE_WEEK' | 'SEND_WEEK' | 'FIX_WEEK' | 'PAPER' | 'INTERVIEW' | 'RENEW' | 'CONSENT_ASK'

export interface WorkerCard {
  key: string
  act: WorkerAct
  title: string
  says: string
  /** The page the button opens; for RENEW, where to read the stay after. */
  href: string
  button: string
  /** What to do first, as the recommendation says it, where this card is first. */
  first: string
  /** RENEW only: the listing her own route renews. */
  listingId?: string
  /** PAPER only: the paper stops her work until it is on file, so it goes with the week, not after the money. */
  stopsWork?: boolean
  /** What it is, short, as the headline names it: "your week of Oct 11–17", "your I-9". */
  name: string
}

export interface WorkerTable {
  caption: string
  head: string[]
  rows: Array<{ cells: string[]; href?: string }>
}

export interface WorkerAnswer {
  kind: 'WORKER'
  /** The first message of the chat: the screen opens it with her name. */
  greeting?: boolean
  /** Where she works, one line per live chain, every firm named. */
  where?: string[]
  recommend?: RichLine
  says: string
  cards: WorkerCard[]
  /** Said once under the cards where one files a week. */
  note?: string
  more: RichLine[]
  /**
   * In the greeting, the papers asked of her that do not stop her work:
   * one line, then a card each with Upload and Later. Said after her week
   * and her pay (founder, 2026-10-19: money and the week before paperwork).
   */
  papers?: { says: string; cards: WorkerCard[] }
  /** In the greeting, after the papers: the time limit, what is new since she last looked, and the close. */
  tail?: RichLine[]
  table?: WorkerTable
  links?: Link[]
}

// ── Small words ──────────────────────────────────────────────────────

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const numberWord = (n: number) => (n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n))
const r2 = (n: number) => Math.round(n * 100) / 100
const hoursWord = (n: number) => `${r2(n).toLocaleString('en-US')} hour${r2(n) === 1 ? '' : 's'}`
/** "Oct 19", the year left off: the chat is read today. */
const day = (iso: string) => formatDay(iso, { year: false })
const money = (minor: number, currency: string) => format(fromMinor(minor, currency))
const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

/** "Oct 11–17", "Sep 27–Oct 3": a week as a person says it. */
export function weekWords(start: string, end: string): string {
  const a = day(start)
  const b = day(end)
  if (a === b) return a
  const [am] = a.split(' ')
  const [bm, bd] = b.split(' ')
  return am === bm ? `${a}–${bd}` : `${a}–${b}`
}

function listed(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * Her chain in one line, every firm by name and no rate:
 * "You work at Northbend Athletic through Computer Systems Inc, employed by Techpeple."
 */
export function chainSays(p: Pick<WorkerPlacement, 'site' | 'through' | 'employer' | 'tie'> & Partial<Pick<WorkerPlacement, 'live' | 'endDate'>>): string {
  const how = p.tie === 'EMPLOYED' ? 'employed by' : p.tie === 'PAID' ? 'paid by' : 'placed through'
  const via = p.through.length ? ` through ${p.through.join(', then ')}` : ''
  // A placement that ended is still her chain, said in the past.
  if (p.live === false) return `You worked at ${p.site}${via}${p.endDate ? ` until ${day(p.endDate)}` : ''}, ${how} ${p.employer}.`
  return `You work at ${p.site}${via}, ${how} ${p.employer}.`
}

/** The chains the greeting names: every live one, else the last one she had. */
export function chainsToSay(ps: readonly WorkerPlacement[]): string[] {
  const live = ps.filter((p) => p.live)
  if (live.length) return live.slice(0, 2).map(chainSays)
  const last = [...ps].sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0]
  return last ? [chainSays(last)] : []
}

// ── What needs her ───────────────────────────────────────────────────

/** The things that are hers to do now, in the order she should do them. */
export function cardsFor(f: WorkerFacts): WorkerCard[] {
  const cards: WorkerCard[] = []

  // A week sent back first: somebody is waiting on her correction.
  for (const w of f.returned) {
    const week = weekWords(w.periodStart, w.periodEnd)
    cards.push({
      first: `Correct your week of ${week} and send it again.`,
      key: `fix:${w.periodStart}`,
      act: 'FIX_WEEK',
      title: `Your week of ${week} was sent back.`,
      says: `${w.reason ? `${w.reason.replace(/\.$/, '')}. ` : ''}Correct it and send it again.`,
      href: weekHref(w.periodStart),
      button: 'Correct my week',
      name: `your returned week of ${week}`,
    })
  }

  // A week saved and never sent.
  for (const w of f.sent.filter((s) => s.stage === 'NOT_SENT')) {
    const week = weekWords(w.periodStart, w.periodEnd)
    cards.push({
      first: `Send your week of ${week}.`,
      key: `send:${w.id}`,
      act: 'SEND_WEEK',
      title: `Your week of ${week} is saved and not sent.`,
      says: `It holds ${hoursWord(w.hours)}. Nobody can sign it until you send it.`,
      href: weekHref(w.periodStart),
      button: 'Send my week',
      name: `your unsent week of ${week}`,
    })
  }

  // A week that has ended and is not filed, oldest first. The week still
  // running is not said: telling her to file a week she is still working
  // is a nudge with nothing she can do about it yet.
  for (const w of f.toFile.filter((x) => x.ended).sort((a, b) => a.periodStart.localeCompare(b.periodStart))) {
    const week = weekWords(w.periodStart, w.periodEnd)
    const expected = w.wholeWeek && w.expectedHours != null ? `${hoursWord(w.expectedHours)} are expected; file it when you are ready.` : 'File it when you are ready.'
    const due = w.dueOn ? ` It is due ${day(w.dueOn)}.` : ''
    cards.push({
      first: `File your week of ${week} for ${w.site}.`,
      key: `file:${w.periodStart}`,
      act: 'FILE_WEEK',
      title: `Your week of ${week} isn’t filed yet.`,
      says: `${expected}${due}`,
      href: weekHref(w.periodStart),
      button: 'File my week',
      name: `your week of ${week}`,
    })
  }

  for (const p of f.papers) {
    const verb = p.todo === 'sign' ? 'Sign' : p.todo === 'upload' ? 'Upload' : 'Open'
    const by = p.askedBy ? ` for ${p.askedBy}` : ''
    // A renewal is said by the day the paper she holds runs out, which is
    // the day her work can stop; the ask's own due date is said only where
    // it comes first, or where she holds nothing it renews.
    const lapse = p.renews && (!p.dueOn || p.renews.runsOutOn <= p.dueOn) ? p.renews : null
    const due = lapse
      ? ` Your ${lowerFirst(lapse.name)} runs out on ${day(lapse.runsOutOn)}; send the new one before then.`
      : p.dueOn ? ` It is due ${day(p.dueOn)}.` : ''
    cards.push({
      first: lapse ? `${verb} your ${p.name}${by} before ${day(lapse.runsOutOn)}.` : `${verb} your ${p.name}${by}.`,
      key: `paper:${p.id}`,
      act: 'PAPER',
      title: `${p.name}${by}`,
      says: `${verb} it from your paperwork.${due}${p.stopsWork ? ' Your work stops until it is on file.' : ''}`,
      href: p.href,
      button: verb,
      stopsWork: p.stopsWork,
      name: `your ${lowerFirst(p.name.replace(/\s*\([^)]*\)/g, '').trim())}`,
    })
  }

  for (const i of f.interviews.filter((x) => x.waitingOnYou)) {
    cards.push({
      first: `Answer ${possessive(i.with)} interview request for ${i.role}.`,
      key: `interview:${i.id}`,
      act: 'INTERVIEW',
      title: `${i.with} asked to interview you for ${i.role}.`,
      says: `Round ${i.round}. Pick a time or decline on Your work.`,
      href: YOUR_WORK,
      button: 'Answer interview',
      name: `${possessive(i.with)} interview request`,
    })
  }

  for (const s of f.stays) {
    cards.push({
      first: s.ended
        ? `Renew your stay on ${possessive(s.firm)} bench, if you want to be put forward again.`
        : `Renew your stay on ${possessive(s.firm)} bench before ${day(s.endsOn)}, if you want to stay.`,
      key: `renew:${s.listingId}`,
      act: 'RENEW',
      title: s.ended
        ? `Your stay on ${possessive(s.firm)} bench ended on ${day(s.endsOn)}.`
        : `Your stay on ${possessive(s.firm)} bench ends on ${day(s.endsOn)}.`,
      says: s.ended
        ? `Renew it and ${s.firm} can put you forward again.`
        : `After that ${s.firm} cannot put you forward. Renew it to stay.`,
      href: WHO_HAS_YOU,
      button: `Renew for ${s.days} days`,
      listingId: s.listingId,
      name: `your stay on ${possessive(s.firm)} bench`,
    })
  }

  for (const firm of f.consent.asking) {
    cards.push({
      first: `Answer ${possessive(firm)} ask to list you on its bench.`,
      key: `ask:${firm}`,
      act: 'CONSENT_ASK',
      title: `${firm} asked to list you on its bench.`,
      says: 'Nothing happens until you answer.',
      href: WHO_HAS_YOU,
      button: 'Answer',
      name: `${possessive(firm)} ask to list you`,
    })
  }

  return cards
}

/** The card's action as the recommendation: what to do first. */
function recommendFor(c: WorkerCard): RichLine {
  return { says: c.first }
}

/** "Three things need you." */
export function needSays(n: number): string {
  return n === 0 ? 'Nothing needs you today.' : `${numberWord(n)} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you.`
}

/**
 * The headline with the things in it (founder, 2026-10-19: names, not
 * counts): "Three things need you: your week of Oct 11–17, your I-9 and
 * Brightmoor Staffing’s interview request." At most three are named, the
 * rest are "and n more", and fewer are named where three would run the
 * sentence to twenty words.
 */
export function needNamesSays(cards: readonly Pick<WorkerCard, 'name'>[]): string {
  const n = cards.length
  if (n === 0) return needSays(0)
  const head = needSays(n).replace(/\.$/, '')
  for (let shown = Math.min(3, n); shown >= 1; shown--) {
    const names = cards.slice(0, shown).map((c) => c.name)
    const rest = n - shown
    const list = rest > 0 ? `${names.join(', ')} and ${lowerNumber(rest)} more` : listed(names)
    const said = `${head}: ${list}.`
    if (said.split(/\s+/).length < 20) return said
  }
  return needSays(n)
}

const LOWER_NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const lowerNumber = (n: number) => (n < LOWER_NUMBERS.length ? LOWER_NUMBERS[n] : String(n))
/** "Professional license" → "professional license"; an acronym ("I-9", "W-4") keeps its capitals. */
const lowerFirst = (x: string) => (/^[A-Z][A-Z0-9-]/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1))
/** Her own page, opened at the week a card is about. */
const weekHref = (periodStart: string) => `${YOUR_WORK}?week=${periodStart.slice(0, 10)}`

// ── Where each week stands ───────────────────────────────────────────

/**
 * One sent week, in the words of where it is: filed, waiting for the
 * client to sign, waiting on a firm below it, owed to her (only after her
 * employer accepted it), paid. Never a rate.
 */
export function weekStandsSays(w: SentWeek): string {
  const which = `Your week of ${weekWords(w.periodStart, w.periodEnd)}`
  switch (w.stage) {
    case 'NOT_SENT':
      return `${which} is saved and not sent.`
    case 'WAITING_FOR_CLIENT':
      return `${which} is waiting for ${w.waitingOn ?? w.client ?? 'the client'} to sign.`
    case 'WAITING_FOR_EMPLOYER': {
      const signed = w.approvedBy ? `${w.approvedBy.replace(/\.$/, '')}.` : `${which} is signed${w.client ? ` by ${w.client}` : ''}.`
      const then = w.employer && w.waitingOn && w.waitingOn !== w.employer ? `, then ${w.employer}` : ''
      const lead = w.approvedBy ? `${which}: ${signed}` : signed
      return `${lead} It waits for ${w.waitingOn ?? w.employer ?? 'your employer'} to accept it${then}.`
    }
    case 'OWED': {
      const owed = w.stillOwedMinor != null && w.currency ? `${money(w.stillOwedMinor, w.currency)} is owed to you` : 'It is owed to you'
      const due = w.dueOn ? `, due ${day(w.dueOn)}` : ''
      return `${which} is accepted by ${w.employer ?? 'your employer'}. ${owed}${due}.${w.overdue ? ' Its pay day has passed.' : ''}`
    }
    case 'PAID':
      return `${which} was paid${w.paidOn ? ` on ${day(w.paidOn)}` : ''}.`
    case 'SIGNED':
      return `${which} is signed and accepted by every firm.`
  }
}

/** A short word for the table: where the week is. */
function stageWord(w: SentWeek): string {
  switch (w.stage) {
    case 'NOT_SENT': return 'Not sent'
    case 'WAITING_FOR_CLIENT': return `Waiting for ${w.waitingOn ?? w.client ?? 'the client'} to sign`
    case 'WAITING_FOR_EMPLOYER': return `Signed; waiting for ${w.waitingOn ?? w.employer ?? 'your employer'}`
    case 'OWED': return `Owed to you${w.dueOn ? `, due ${day(w.dueOn)}` : ''}`
    case 'PAID': return `Paid${w.paidOn ? ` ${day(w.paidOn)}` : ''}`
    case 'SIGNED': return 'Signed by every firm'
  }
}

/** Newest first. */
const newest = (ws: readonly SentWeek[]) => [...ws].sort((a, b) => b.periodStart.localeCompare(a.periodStart))

/**
 * What is owed to her, and when: only weeks her employer accepted, priced
 * by payroll. A week the client signed and her employer has not accepted
 * is waiting, never owed.
 */
export function owedSays(f: Pick<WorkerFacts, 'sent' | 'ownCompanyBills' | 'weeksWithNoRate'>): { says: string; more: string[] } {
  const owed = f.sent.filter((w) => w.stage === 'OWED' && w.stillOwedMinor != null && w.stillOwedMinor > 0 && w.currency)
  const currencies = [...new Set(owed.map((w) => w.currency!))]
  const waiting = f.sent.filter((w) => w.stage === 'WAITING_FOR_CLIENT' || w.stage === 'WAITING_FOR_EMPLOYER')
  const employers = [...new Set([...f.sent.map((w) => w.employer)].filter((x): x is string => !!x))]
  const who = employers.length === 1 ? employers[0] : 'your employer'
  const more: string[] = []

  let says: string
  if (owed.length > 0 && currencies.length === 1) {
    const total = owed.reduce((n, w) => n + w.stillOwedMinor!, 0)
    const hours = owed.every((w) => w.owedHours != null) ? owed.reduce((n, w) => n + w.owedHours!, 0) : null
    says = `${money(total, currencies[0])} is owed to you` +
      (hours != null ? `, for ${hoursWord(hours)} ${who} accepted and has not paid yet.` : `, for weeks ${who} accepted and has not paid yet.`)
    const next = owed.filter((w) => !w.overdue && w.dueOn).map((w) => w.dueOn!).sort()[0]
    if (next) more.push(`The next pay day for it is ${day(next)}.`)
    const late = owed.filter((w) => w.overdue).reduce((n, w) => n + w.stillOwedMinor!, 0)
    if (late > 0) more.push(late === total ? 'All of it is past its pay day.' : `${money(late, currencies[0])} of it is past its pay day.`)
  } else if (owed.length > 0) {
    // Two currencies are two sums; one figure across them is not a number anybody can stand behind.
    says = owed.map((w) => `${money(w.stillOwedMinor!, w.currency!)} for your week of ${weekWords(w.periodStart, w.periodEnd)}`).join('; ') + ' is owed to you.'
  } else {
    says = 'Nothing is owed to you right now.'
  }

  if (waiting.length > 0) {
    const hours = waiting.reduce((n, w) => n + w.hours, 0)
    const firms = [...new Set(waiting.map((w) => w.waitingOn).filter((x): x is string => !!x))]
    more.push(
      `${numberWord(waiting.length)} week${waiting.length === 1 ? '' : 's'} you sent, ${hoursWord(hours)}, ${waiting.length === 1 ? 'is' : 'are'} not owed yet.` +
      (firms.length ? ` ${waiting.length === 1 ? 'It waits' : 'They wait'} for ${listed(firms)}.` : ''),
    )
    // The rule, said every time a week waits: her employer's acceptance, not the client's signature.
    more.push(`A week is owed to you once ${who} accepts it, not when the client signs it.`)
  }
  if (f.ownCompanyBills) more.push(f.ownCompanyBills)
  if (f.weeksWithNoRate > 0) {
    more.push(`${numberWord(f.weeksWithNoRate)} accepted week${f.weeksWithNoRate === 1 ? ' has' : 's have'} no rate on Etyme; ${who} has ${f.weeksWithNoRate === 1 ? 'it' : 'those'}.`)
  }
  return { says, more }
}

const UNREAD_WORDS: Record<WorkerFacts['unread'][number], string> = {
  weeks: 'your weeks and pay',
  papers: 'your paperwork',
  interviews: 'your interviews',
  consent: 'who has your consent',
}

/** Said where part of her record could not be read: never "nothing" in its place. */
export function unreadSays(unread: WorkerFacts['unread']): RichLine | null {
  if (unread.length === 0) return null
  return { says: `Etyme could not read ${listed(unread.map((u) => UNREAD_WORDS[u]))} just now, so they are not in this list. Staff have been told.` }
}

/** Nothing on the record about her as a worker yet, in the words of her seat. */
function nothingYet(f: WorkerFacts): string {
  return f.seat === 'CONSULTANT'
    ? 'Nobody has placed you yet. Firms find you through Your page.'
    : `Nothing on the record is about you as a worker yet. Ask ${f.seatAt ? `${possessive(f.seatAt)} owner` : 'your company’s owner'} for the work you need.`
}

/** No week, placement, listing, paper or interview names her. */
function noWork(f: WorkerFacts): boolean {
  return f.placements.length === 0 && f.sent.length === 0 && f.toFile.length === 0 && f.returned.length === 0 &&
    f.papers.length === 0 && f.interviews.length === 0 && f.consent.benches.length === 0 && f.consent.employers.length === 0 &&
    f.stays.length === 0 && f.unread.length === 0
}

/** Lines in the greeting under the headline, before the papers: what fits. */
export const WORKER_LINES = 4

const NUMBER_WORDS_LOWER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const lowerWord = (n: number) => (n >= 0 && n < NUMBER_WORDS_LOWER.length ? NUMBER_WORDS_LOWER[n] : String(n))

/**
 * Where she stands against a client's time limit, in whole months:
 * "You are six months into Northbend Athletic’s eighteen-month time limit."
 */
export function limitLine(l: { site: string; months: number; capMonths: number; past: boolean }): string {
  const cap = `${possessive(l.site)} ${lowerWord(l.capMonths)}-month time limit`
  if (l.past || l.months >= l.capMonths) return `You have reached ${cap}.`
  if (l.months < 1) return `You are under a month into ${cap}.`
  return `You are ${lowerWord(l.months)} month${l.months === 1 ? '' : 's'} into ${cap}.`
}

/** The papers asked of her that do not stop her work, as one line: "Two papers are asked of you: the X and the Y." */
export function papersLine(cards: readonly WorkerCard[]): string {
  // "Non-disclosure agreement" reads "your non-disclosure agreement"; an acronym keeps its capitals.
  const names = cards.map((c) => {
    const name = c.title.replace(/ for .*$/, '')
    return `your ${/^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name}`
  })
  return `${cap1(numberWord(cards.length))} paper${cards.length === 1 ? ' is' : 's are'} asked of you: ${listed(names)}.`
}

const cap1 = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x)

/**
 * Her latest week sent, where it stands, with its link: "Your week of Oct
 * 11–17 is signed and accepted by every firm." Null where she has sent
 * none. The worker's greeting says it, and so does a one-person firm's,
 * because she is the firm and the worker at once (handoffs station,
 * 2026-10-20: Colleen Byrne was the one worker of thirteen whose greeting
 * never said her week was signed — her seat reads the firm's greeting).
 */
export function latestWeekLine(f: Pick<WorkerFacts, 'sent'>): RichLine | null {
  const latest = newest(f.sent.filter((w) => w.stage !== 'NOT_SENT'))[0]
  if (!latest) return null
  return { says: weekStandsSays(latest), links: [{ text: `Your week of ${weekWords(latest.periodStart, latest.periodEnd)}`, href: `/dashboard/weeks/${latest.id}` }] }
}

/**
 * What needs her today, then where her weeks stand, the chain she works
 * through, and what Etyme does not do. With `greeting`, the first message
 * of the chat, in the founder's order (2026-10-19): her chain in one line;
 * her week, who holds it and when it is due; what she is owed; then the
 * papers that do not stop her work as one line with a card each; then the
 * time limit.
 */
export function workerToday(
  f: WorkerFacts,
  opts: { greeting?: boolean; notices?: { shown: readonly NoticeLine[]; older: number }; threads?: { shown: readonly ThreadNote[]; more: number }; now?: Date } = {},
): WorkerAnswer {
  const cards = cardsFor(f)
  // A paper that does not stop the work waits until after the money.
  const later = cards.filter((c) => c.act === 'PAPER' && !c.stopsWork)
  const first = cards.filter((c) => !later.includes(c))
  const shown = first.slice(0, 5)
  const lines: RichLine[] = []

  const unread = unreadSays(f.unread)
  if (unread) lines.push(unread)

  const latest = latestWeekLine(f)
  if (latest) lines.push(latest)
  const owed = owedSays(f)
  if (f.sent.some((w) => w.stage === 'OWED')) lines.push({ says: owed.says })
  // The rule, whenever a week waits: owed once her employer accepts it, not when the client signs it.
  const rule = owed.more.find((m) => m.startsWith('A week is owed to you once'))
  if (rule) lines.push({ says: rule })
  for (const p of f.runningOut.slice(0, 1)) {
    lines.push({ says: `Your ${p.name} runs out on ${day(p.runsOutOn)}.${p.stopsWork ? ' Your work stops if it lapses.' : ''}`, links: [{ text: `Your ${p.name}`, href: YOUR_PAPERWORK }] })
  }
  const booked = f.interviews.find((i) => i.booked)
  if (booked) lines.push({ says: `Your interview with ${booked.with} for ${booked.role} is booked. The time is on Your work.`, links: [{ text: 'Your work', href: YOUR_WORK }] })
  if (first.length > shown.length) lines.push({ says: `${numberWord(first.length - shown.length)} more ${first.length - shown.length === 1 ? 'is' : 'are'} on Your work.`, links: [{ text: 'Your work', href: YOUR_WORK }] })
  if (noWork(f)) lines.push({ says: nothingYet(f) })

  const more = lines.slice(0, WORKER_LINES)
  const tail: RichLine[] = []
  for (const l of f.limits ?? []) tail.push({ says: limitLine(l) })
  // What the notices and conversations said, never counted in the lines above, as on a firm's greeting.
  if (opts.greeting && (opts.notices || opts.threads)) {
    tail.push(...sinceSays(opts.notices?.shown ?? [], opts.notices?.older ?? 0, { now: opts.now, worker: true, threads: opts.threads?.shown, moreThreads: opts.threads?.more }))
  }
  if (opts.greeting) tail.push({ says: WORKER_CLOSE }, { says: WORKER_BOUNDARY })

  const lead = shown[0] ?? later[0]
  return {
    kind: 'WORKER',
    ...(opts.greeting ? { greeting: true, where: chainsToSay(f.placements) } : {}),
    ...(lead ? { recommend: recommendFor(lead) } : {}),
    says: `${needNamesSays([...first, ...later])} Checked just now.`,
    cards: shown,
    more,
    ...(later.length ? { papers: { says: papersLine(later), cards: later } } : {}),
    ...(tail.length ? { tail } : {}),
  }
}

// ── What she asks ────────────────────────────────────────────────────

export type WorkerIntent =
  | 'HELP' | 'NEEDS' | 'SIGNED' | 'OWED' | 'PAPERS' | 'CONSENT' | 'CHAIN' | 'MY_RATE' | 'THEIR_RATE'
  | 'FILE' | 'SIGN_WEEK' | 'EXTEND' | 'LAST_PAID' | 'JOBS' | 'INTERVIEWS' | 'CONTRACT_END' | 'GENERAL' | 'ANOTHER' | 'NOT_YET'

const lowerOf = (t: string) => t.toLowerCase().normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()

/** Read what a worker typed into one of the rule questions. */
export function readWorkerAsk(raw: string): WorkerIntent {
  const t = lowerOf(raw)
  if (!t || /^(help|\?|what can you do\??|what do you answer\??)$/.test(t)) return 'HELP'
  if (generalAsk(t)) return 'GENERAL'
  if (/\b(mark-?up|margin)s?\b|\bbill rate\b|\b(charges?|bills?) (for|them|us)\b|\bpays? (for|them) (me|my)\b|\bpay(s)? (\w+ ){0,2}for me\b|\bwhat does \w+( \w+){0,3} (pay|charge|bill)\b/.test(t)) return 'THEIR_RATE'
  if (anotherBook(t) || /\b(other|another) (person|people|consultants?|workers?|contractors?)'?s?\b|\b(colleague|coworker|co-worker)s?'? (pay|rate|salary)\b/.test(t)) return 'ANOTHER'
  if (/^(file|submit|enter|log|send|fill in|fill out|put in)\b.*\b(week|hours|timesheet|time)\b|\b(file|submit|log|enter) (it|them) for me\b/.test(t)) return 'FILE'
  if (/^(approve|sign|accept)\b.*\b(week|hours|timesheet)\b/.test(t)) return 'SIGN_WEEK'
  if (/^(please |can you |could you )?(extend|lengthen)\b/.test(t) || /\bextend (my|the) (contract|placement|assignment|project)\b/.test(t)) return 'EXTEND'
  if (/^(what|who|anything)\b.*\b(needs?|waiting on|waits? (for|on))\s+me\b|^what do i (need|have) to do\b|^(needs me|my queue|what is waiting( on me)?)\??$/.test(t)) return 'NEEDS'
  if (/\b(contract|placement|assignment|project)s?\b.*\b(end|ends|ending|finish|finishes|over|last day)\b|\bmy last day\b|\bwhen do i (finish|roll ?off)\b/.test(t)) return 'CONTRACT_END'
  if (/\b(last|latest) (paid|pay ?check|payment|pay)\b|\bwhen was i (last )?paid\b|\bwhen did i (last )?get paid\b/.test(t)) return 'LAST_PAID'
  if (/\b(is there|are there|any) (a |any )?(jobs?|work|roles?|openings?|positions?) (for me|i can)\b|\bjobs? for me\b|\bfind me (a )?(job|work|role)\b|\bwhat jobs?\b.*\b(me|i)\b/.test(t)) return 'JOBS'
  if (/\b(my (pay )?rate|my hourly|hourly rate|what am i paid (an|per) hour|my pay rate)\b/.test(t)) return 'MY_RATE'
  if (/\b(owed|owe me|get paid|pay ?day|paycheck|pay check|when (do|will) i (be )?paid|how much (do|will|have) i|been paid|my pay\b)/.test(t)) return 'OWED'
  if (/\b(sign(ed)?|approved?|accept(ed)?|sign(ed)? off)\b/.test(t) && /\b(week|weeks|hours|timesheets?)\b/.test(t)) return 'SIGNED'
  if (/\b(papers?|paperwork|documents?|docs|upload|forms?|i-9|license|certificates?)\b/.test(t)) return 'PAPERS'
  if (/\binterviews?\b/.test(t)) return 'INTERVIEWS'
  if (/\b(consent|who has (me|my)|benches|bench|marketing me|put me forward|submit me|list(ed|s)? me)\b/.test(t)) return 'CONSENT'
  if (/\b(who (employs|pays) me|my employer|who do i work for|my chain|which firms?|my agency|my vendor)\b/.test(t)) return 'CHAIN'
  return 'NOT_YET'
}

/** The record read for one answer: one read, the worker's own. */
export interface WorkerReaders {
  facts(): Promise<WorkerFacts>
}

const text = (says: string, links?: Link[]): WorkerAnswer => ({ kind: 'WORKER', says, cards: [], more: [], ...(links?.length ? { links } : {}) })

/** One answer to one message from a worker. Rules only; nothing here reaches a model. */
export async function respondWorker(question: string, read: WorkerReaders): Promise<WorkerAnswer> {
  const intent = readWorkerAsk(question)
  switch (intent) {
    case 'HELP':
      return text(`I answer from your own record. ${WORKER_ANSWERS}`)
    case 'GENERAL':
      return text(ONLY_YOUR_WORK)
    case 'ANOTHER':
      return text(NOT_ANOTHER_PERSON)
    case 'THEIR_RATE':
      return text(NOT_THEIR_RATE)
    case 'NOT_YET':
      return text(`I cannot answer that yet. ${WORKER_ANSWERS}`)
    default:
      break
  }

  const f = await read.facts()
  const unread = unreadSays(f.unread)
  const withUnread = (a: WorkerAnswer, part: WorkerFacts['unread'][number]): WorkerAnswer =>
    f.unread.includes(part) && unread ? { ...a, says: unread.says, cards: [], more: [], table: undefined, recommend: undefined } : a

  switch (intent) {
    case 'NEEDS':
      return workerToday(f)

    case 'FILE': {
      const card = cardsFor(f).find((c) => c.act === 'FIX_WEEK' || c.act === 'SEND_WEEK' || c.act === 'FILE_WEEK')
      const thisWeek = f.toFile.find((w) => !w.ended)
      const open = card ?? (thisWeek ? {
        key: `file:${thisWeek.periodStart}`, act: 'FILE_WEEK' as const,
        first: `File your week of ${weekWords(thisWeek.periodStart, thisWeek.periodEnd)} for ${thisWeek.site}.`,
        title: `Your week of ${weekWords(thisWeek.periodStart, thisWeek.periodEnd)} is open.`,
        says: 'File the days you have worked when you are ready.', href: weekHref(thisWeek.periodStart), button: 'File my week',
        name: `your week of ${weekWords(thisWeek.periodStart, thisWeek.periodEnd)}`,
      } : null)
      return withUnread({
        kind: 'WORKER',
        says: open ? FILE_IT_YOURSELF : `${FILE_IT_YOURSELF} Every week you can file is filed.`,
        cards: open ? [open] : [],
        more: [],
        links: open ? [] : [{ label: 'Open Your work', href: YOUR_WORK }],
      }, 'weeks')
    }

    case 'SIGN_WEEK': {
      const p = f.placements.find((x) => x.live) ?? f.placements[0]
      const signer = p ? p.site : 'the client'
      const accepter = p ? p.employer : 'your employer'
      return text(`Etyme never signs a week; ${signer} signs it, then ${accepter} accepts it.`)
    }

    case 'EXTEND': {
      // Refused in a sentence that says who may (the never floor, CLAUDE.md
      // "The job twin"): an extension is agreed between the client and the
      // firm that employs her, and that firm extends her line.
      const p = f.placements.find((x) => x.live) ?? f.placements[0]
      if (!p) return withUnread(text('Etyme never extends a contract, and you have no contract on the record to extend.'), 'weeks')
      return withUnread(text(
        `Etyme never extends a contract; ${p.employer} extends yours with ${p.site}. Ask ${p.employer}.`,
        [{ label: 'Open Your work', href: YOUR_WORK }],
      ), 'weeks')
    }

    case 'LAST_PAID': {
      const paid = f.sent.filter((w) => w.stage === 'PAID' && w.paidOn).sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? ''))
      const w = paid[0]
      if (!w) {
        return withUnread(text(
          `No pay to you is recorded on Etyme yet. ${f.ownCompanyBills ? 'Your own company bills for your weeks, so its bills say what was paid.' : 'Your employer’s payroll records it here once it pays a week.'}`,
          [{ label: 'Open Your work', href: YOUR_WORK }],
        ), 'weeks')
      }
      return withUnread(text(
        `You were last paid on ${day(w.paidOn!)}, for your week of ${weekWords(w.periodStart, w.periodEnd)}${w.employer ? `, by ${w.employer}` : ''}. Checked just now.`,
        [{ label: 'Open Your work', href: YOUR_WORK }],
      ), 'weeks')
    }

    case 'JOBS': {
      // Etyme places nobody: the answer is what firms holding her consent
      // did with it, read from her own pipeline, never a list of jobs.
      const open = (f.putForward ?? []).filter((x) => x.live)
      const firms = f.consent.benches.map((b) => b.firm)
      const who = firms.length
        ? `${listed(firms)} ${firms.length === 1 ? 'holds' : 'hold'} your consent to put you forward.`
        : 'No firm holds your consent to put you forward yet.'
      if (open.length === 0) {
        return withUnread({
          kind: 'WORKER', says: `No job you were put forward for is open now. ${who} Checked just now.`, cards: [],
          more: [{ says: 'Etyme never places anybody; the firms that hold your consent put you forward.' }],
          links: [{ label: 'Open Who has you', href: WHO_HAS_YOU }],
        }, 'interviews')
      }
      const first = open[0]
      return withUnread({
        kind: 'WORKER',
        says: `${first.by} put you forward for ${first.role}. ${open.length === 1 ? 'It is' : `${numberWord(open.length)} jobs are`} still open. Checked just now.`,
        cards: cardsFor(f).filter((c) => c.act === 'INTERVIEW'),
        more: [{ says: 'Etyme never places anybody; the firms that hold your consent put you forward.' }],
        table: {
          caption: 'Jobs you were put forward for, still open',
          head: ['Job', 'Put forward by', 'Where it is'],
          rows: open.slice(0, 8).map((x) => ({ cells: [x.role, x.by, x.says] })),
        },
        links: [{ label: 'Open Your work', href: YOUR_WORK }],
      }, 'interviews')
    }

    case 'SIGNED': {
      const ws = newest(f.sent).slice(0, 6)
      if (ws.length === 0) {
        const file = cardsFor(f).find((c) => c.act === 'FILE_WEEK')
        return withUnread({ kind: 'WORKER', says: 'You have not sent a week yet. Checked just now.', cards: file ? [file] : [], ...(file ? { note: NEVER_FILES } : {}), more: [] }, 'weeks')
      }
      return withUnread({
        kind: 'WORKER',
        says: `${weekStandsSays(ws[0])} Checked just now.`,
        cards: [],
        more: [],
        table: {
          caption: 'Your weeks, newest first',
          head: ['Week', 'Hours', 'Where it is'],
          rows: ws.map((w) => ({ cells: [weekWords(w.periodStart, w.periodEnd), r2(w.hours).toLocaleString('en-US'), stageWord(w)], href: `/dashboard/weeks/${w.id}` })),
        },
        links: [{ label: 'Open Your work', href: YOUR_WORK }],
      }, 'weeks')
    }

    case 'OWED': {
      const o = owedSays(f)
      const priced = newest(f.sent.filter((w) => (w.stage === 'OWED' || w.stage === 'PAID'))).slice(0, 6)
      return withUnread({
        kind: 'WORKER',
        says: `${o.says} Checked just now.`,
        cards: [],
        more: o.more.map((says) => ({ says })),
        ...(priced.length ? {
          table: {
            caption: 'Weeks your employer accepted',
            head: ['Week', 'Hours', 'Owed', 'Pay day'],
            rows: priced.map((w) => ({
              cells: [
                weekWords(w.periodStart, w.periodEnd),
                r2(w.hours).toLocaleString('en-US'),
                w.stage === 'PAID' ? 'Paid' : w.stillOwedMinor != null && w.currency ? money(w.stillOwedMinor, w.currency) : 'Not priced here',
                w.stage === 'PAID' ? (w.paidOn ? day(w.paidOn) : '—') : (w.dueOn ? day(w.dueOn) : '—'),
              ],
              href: `/dashboard/weeks/${w.id}`,
            })),
          },
        } : {}),
        links: [{ label: 'Open Your work', href: YOUR_WORK }],
      }, 'weeks')
    }

    case 'PAPERS': {
      const cards = cardsFor(f).filter((c) => c.act === 'PAPER')
      const more: RichLine[] = f.runningOut.map((p) => ({ says: `Your ${p.name} runs out on ${day(p.runsOutOn)}.${p.stopsWork ? ' Your work stops if it lapses.' : ''}` }))
      return withUnread({
        kind: 'WORKER',
        says: `${cards.length === 0 ? 'No paper is asked of you.' : `${numberWord(cards.length)} paper${cards.length === 1 ? ' is' : 's are'} asked of you.`} Checked just now.`,
        ...(cards.length ? { recommend: recommendFor(cards[0]) } : {}),
        cards,
        more,
        links: [{ label: 'Open Your paperwork', href: YOUR_PAPERWORK }],
      }, 'papers')
    }

    case 'INTERVIEWS': {
      const cards = cardsFor(f).filter((c) => c.act === 'INTERVIEW')
      const booked = f.interviews.filter((i) => i.booked)
      return withUnread({
        kind: 'WORKER',
        says: `${cards.length === 0 ? 'No interview is waiting on your answer.' : `${numberWord(cards.length)} interview${cards.length === 1 ? ' waits' : 's wait'} on your answer.`} Checked just now.`,
        cards,
        more: booked.map((i) => ({ says: `Your interview with ${i.with} for ${i.role} is booked. The time is on Your work.` })),
        links: [{ label: 'Open Your work', href: YOUR_WORK }],
      }, 'interviews')
    }

    case 'CONSENT': {
      const c = f.consent
      const more: RichLine[] = []
      const says = c.benches.length === 0
        ? 'No firm holds your consent to put you forward.'
        : `${numberWord(c.benches.length)} firm${c.benches.length === 1 ? ' holds' : 's hold'} your consent to put you forward: ${listed(c.benches.map((b) => b.firm))}.`
      for (const b of c.benches) if (b.stay) more.push({ says: b.stay })
      for (const e of c.employers) more.push({ says: `${e} employs you, so it puts you forward without asking. You are told each time.` })
      const cards = cardsFor(f).filter((x) => x.act === 'CONSENT_ASK' || x.act === 'RENEW')
      return withUnread({
        kind: 'WORKER', says: `${says} Checked just now.`, cards, more,
        links: [{ label: 'Open Who has you', href: WHO_HAS_YOU }],
      }, 'consent')
    }

    case 'CHAIN': {
      const chains = chainsToSay(f.placements)
      if (chains.length === 0) return withUnread(text(nothingYet(f)), 'weeks')
      return withUnread({
        kind: 'WORKER',
        says: chains.join(' '),
        cards: [],
        more: [{ says: 'You see every firm in your chain. What one firm charges another stays between them.' }],
        links: [{ label: 'Open Your work', href: YOUR_WORK }],
      }, 'weeks')
    }

    case 'CONTRACT_END': {
      const ps = f.placements.filter((p) => p.live)
      if (ps.length === 0) return withUnread(text('You have no live contract on the record.'), 'weeks')
      const lines = ps.map((p) => p.endDate
        ? `Your contract at ${p.site} ends on ${formatDay(p.endDate)}.`
        : `Your contract at ${p.site} has no end date on the record.`)
      return withUnread({ kind: 'WORKER', says: `${lines.join(' ')} Checked just now.`, cards: [], more: [], links: [{ label: 'Open Your work', href: YOUR_WORK }] }, 'weeks')
    }

    case 'MY_RATE': {
      const ps = f.placements.filter((p) => p.live)
      if (ps.length === 0) return withUnread(text('You have no live placement, so there is no rate to show.'), 'weeks')
      const lines = ps.map((p) => p.payRateMinor != null && p.payCurrency
        ? `At ${p.site}, ${p.employer} pays you ${money(p.payRateMinor, p.payCurrency)} an hour.`
        : (p.rateNote ?? `Your rate at ${p.site} is not on Etyme; ${p.employer} has it.`))
      return withUnread({ kind: 'WORKER', says: lines.join(' '), cards: [], more: [], links: [{ label: 'Open Your work', href: YOUR_WORK }] }, 'weeks')
    }
  }
  return text(`I cannot answer that yet. ${WORKER_ANSWERS}`)
}
