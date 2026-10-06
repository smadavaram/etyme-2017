/**
 * A consultant's own page.
 *
 * Every agency they work through has one. The person doing the work had
 * nothing, which is backwards in a market where the person is the product.
 *
 * Three things make this different from a bench listing, and all three are
 * the point.
 *
 * **It is theirs.** It survives leaving an agency, because the work
 * history is attached to the person and always was. A bench listing is a
 * permission granted to a company; this is not.
 *
 * **It shows what they did, not who for.** A client did not agree to
 * appear on somebody's portfolio. "Eighteen months on an SAP BRIM
 * migration at a medical device manufacturer" says everything a reader
 * needs and names nobody.
 *
 * **It says nothing they did not agree to.** Visibility already exists on
 * the profile, and a page is the most visible thing there is, so it starts
 * off and stays off until they turn it on.
 */

import { paidOnDay } from '@/lib/money/pay-day-period'
import { sheetPay, type WageLine, type DayPremium } from '@/lib/money/sheet-overtime'
import type { OvertimeMethod } from '@/lib/money/overtime-method'
import { nextOpen } from '@/lib/money/next-cycle'
import { periodFor, hoursInPeriod, type AcceptedCut, type Terms, type Period } from '@/lib/periods'
import { priceByDay, type RatePeriod } from '@/lib/contract-rate'
import { weekStart, weekEnd } from '@/lib/overtime'
import { amount, compact } from '@/lib/money-display'
import { mayReadPayOf, type PayViewer } from '@/lib/money/pay-visibility'
import { canReadBillRate } from '@/lib/permissions'

export type Visibility = 'INTERNAL' | 'FEED' | 'CLIENT_VISIBLE' | 'VERIFIED'

export interface Engagement {
  /** What they did. */
  role: string
  skills: string[]
  startedAt: Date
  endedAt: Date | null
  /** The industry, never the client. */
  sector: string | null
  location: string | null
}

export interface PortfolioInput {
  name: string
  headline: string | null
  skills: string[]
  location: string | null
  visibility: Visibility
  /** Null while they are working. */
  availableFrom: Date | null
  engagements: Engagement[]
  /** Courses finished, which is the evidence of keeping current. */
  completedTraining: { title: string; completedAt: Date }[]
  /** Checks that are current. Never the documents themselves. */
  verified: string[]
}

export interface PortfolioEntry {
  role: string
  skills: string[]
  /** "18 months" rather than two dates a reader has to subtract. */
  lasted: string
  sector: string | null
  location: string | null
  current: boolean
}

export interface Portfolio {
  name: string
  headline: string
  intro: string
  skills: { skill: string; years: number | null }[]
  location: string | null
  /** Said plainly, because it is the first thing anybody wants. */
  availability: string
  engagements: PortfolioEntry[]
  training: { title: string; when: string }[]
  verified: string[]
  totalYears: number | null
}

const MONTH = 30 * 86_400_000

/**
 * Whether this page may be shown to a stranger at all.
 *
 * Two things, and both have to be true. An address, because there is
 * nowhere for the page to be without one. And a date they turned it on,
 * which only the person themselves can set.
 *
 * Deliberately not `visibility`. That field says whether an agency may
 * show somebody to clients inside the platform — it is usually set by the
 * agency, on a bench listing, and it is not consent to be named on the
 * open internet. Reading it as consent would have published people who
 * agreed to be on a bench and nothing more.
 */
export function pageIsLive(page: { slug: string | null; pageLiveAt: Date | null }): boolean {
  return page.slug !== null && page.pageLiveAt !== null
}

function lasted(from: Date, to: Date | null, now: Date): string {
  const months = Math.max(1, Math.round(((to ?? now).getTime() - from.getTime()) / MONTH))
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (rest === 0) return `${years} year${years === 1 ? '' : 's'}`
  return `${years} year${years === 1 ? '' : 's'} ${rest} month${rest === 1 ? '' : 's'}`
}

/**
 * How long they have been doing each thing.
 *
 * Counted from engagements rather than claimed, which is the difference
 * between a portfolio and a CV. Somebody who lists Kubernetes and has never
 * been placed on it shows no number, and that absence is informative.
 */
function yearsPerSkill(engagements: Engagement[], now: Date): Map<string, number> {
  const months = new Map<string, number>()
  for (const e of engagements) {
    const span = Math.max(1, Math.round(((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / MONTH))
    for (const s of e.skills) months.set(s, (months.get(s) ?? 0) + span)
  }
  const years = new Map<string, number>()
  for (const [skill, m] of months) {
    // Under a year reads as noise on a portfolio; the skill still appears,
    // without a number beside it.
    if (m >= 12) years.set(skill, Math.round(m / 12))
  }
  return years
}

/**
 * When they are free, said the way somebody would ask it.
 *
 * The single most useful line on the page, and the one a CV never has.
 */
export function availabilityOf(
  availableFrom: Date | null,
  engagements: Engagement[],
  now: Date
): string {
  const current = engagements.find((e) => e.endedAt === null || e.endedAt > now)

  if (current?.endedAt) {
    const days = Math.ceil((current.endedAt.getTime() - now.getTime()) / 86_400_000)
    if (days <= 0) return 'Available now.'
    return `On an engagement until ${current.endedAt.toISOString().slice(0, 10)} — free in ${days} day${days === 1 ? '' : 's'}.`
  }
  if (current) {
    // Working with no end date. Saying "available now" would be a lie a
    // reader would act on.
    return 'Currently on an engagement with no set end date.'
  }
  if (availableFrom && availableFrom > now) {
    return `Available from ${availableFrom.toISOString().slice(0, 10)}.`
  }
  return 'Available now.'
}

/**
 * The words, written from what they have done.
 *
 * Same rule as a company: written from facts, editable, and never covering
 * the facts. Nothing here reaches — somebody with one engagement reads as
 * somebody with one engagement.
 */
export function writeBio(input: PortfolioInput, now: Date): { headline: string; intro: string } {
  const years = yearsPerSkill(input.engagements, now)
  const top = [...years.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  const headline =
    input.headline ??
    (top.length > 0
      ? `${top.slice(0, 2).map(([s]) => s).join(' and ')} consultant`
      : input.skills.length > 0
        ? `${input.skills.slice(0, 2).join(' and ')} consultant`
        : 'Contract consultant')

  const bits: string[] = []

  const totalMonths = input.engagements.reduce(
    (sum, e) => sum + Math.max(1, Math.round(((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / MONTH)),
    0
  )
  if (totalMonths >= 12) {
    const y = Math.round(totalMonths / 12)
    bits.push(
      `${y} year${y === 1 ? '' : 's'} across ${input.engagements.length} engagement${input.engagements.length === 1 ? '' : 's'}.`
    )
  } else if (input.engagements.length > 0) {
    bits.push(`${input.engagements.length} engagement${input.engagements.length === 1 ? '' : 's'} so far.`)
  }

  if (top.length > 0) {
    const [skill, y] = top[0]
    bits.push(`${y} year${y === 1 ? '' : 's'} on ${skill}.`)
  }

  if (input.completedTraining.length > 0) {
    bits.push(`${input.completedTraining.length} course${input.completedTraining.length === 1 ? '' : 's'} finished.`)
  }

  return {
    headline,
    intro: bits.length > 0
      ? bits.slice(0, 2).join(' ')
      // Nothing to show yet, said rather than dressed up.
      : 'New on Etyme. This page fills in from real engagements as they happen.',
  }
}

export function buildPortfolio(input: PortfolioInput, now: Date): Portfolio {
  const years = yearsPerSkill(input.engagements, now)
  const bio = writeBio(input, now)

  const totalMonths = input.engagements.reduce(
    (sum, e) => sum + Math.max(1, Math.round(((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / MONTH)),
    0
  )

  return {
    name: input.name,
    headline: bio.headline,
    intro: bio.intro,
    location: input.location,
    availability: availabilityOf(input.availableFrom, input.engagements, now),
    // Their stated skills, with counted years where there are any. A skill
    // with no number is one they have not been placed on, and that gap is
    // worth a reader seeing.
    skills: [...new Set([...input.skills, ...years.keys()])]
      .map((skill) => ({ skill, years: years.get(skill) ?? null }))
      .sort((a, b) => (b.years ?? 0) - (a.years ?? 0)),
    engagements: input.engagements
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map((e) => ({
        role: e.role,
        skills: e.skills,
        lasted: lasted(e.startedAt, e.endedAt, now),
        // The industry, never the client. They did not agree to appear.
        sector: e.sector,
        location: e.location,
        current: e.endedAt === null || e.endedAt > now,
      })),
    training: input.completedTraining
      .slice()
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      .map((t) => ({ title: t.title, when: t.completedAt.toISOString().slice(0, 7) })),
    verified: input.verified,
    totalYears: totalMonths >= 12 ? Math.round(totalMonths / 12) : null,
  }
}

// ── Whose page this is ────────────────────────────────────────────────

/**
 * Who has a page of their own, and why.
 *
 * ── The bug this exists to stop coming back ──────────────────────────
 *
 * A page used to be a thing only a bench listing could produce: the
 * profile row was created when somebody joined an agency's bench, and
 * every consultant-facing surface read that row or refused. So a GSI's
 * own W2 — Karthik Menon on the demo door, an engineer his employer
 * staffs directly — opened his own page and was told he did not have a
 * profile and that "one is made when you join a bench".
 *
 * That refusal was wrong twice. It refused somebody who is placed,
 * working and billed through this system; and the instruction it gave
 * him was to consent to being marketed by a firm that is not his
 * employer, which is the one thing his situation says he should not do.
 *
 * CLAUDE.md settled the party half of this on 2026-09-17: a firm may
 * put its own W2 in front of a client with no listing, because the
 * employment contract is the consent. This is the person half of the
 * same sentence. **A page is for the person the work is about, not for
 * somebody who has agreed to be sold by a third party.**
 *
 * ── Why work rather than employment is the test ──────────────────────
 *
 * There is no column saying "this person does the work". Every staffer
 * of every company holds an EMPLOYEE context too — the client's own
 * bookkeeper has one — so employment alone cannot tell an avionics
 * engineer from an accounts payable clerk, and handing a page to
 * everybody would let a desk worker take a permanent public address they
 * will never use.
 *
 * What does tell them apart is the work itself: a placement in their
 * name, a submission that put them forward, a contract under which
 * somebody pays them to do the job. That is derived from the flows
 * rather than typed in by anybody, which is the rule the rest of this
 * product already follows.
 */
export type PageBecause =
  /** An agency markets them under a listing they granted. */
  | 'BENCH'
  /** Their employer staffs them directly, and needs no listing to. */
  | 'EMPLOYED'
  /** The work is on the record with no agency and no employer behind it. */
  | 'PLACED'
  /**
   * They made the page themselves and nobody has put them forward yet.
   *
   * The state every consumer-email sign-in is in on their first day: a
   * profile, and not one other fact. It used to fall through to `PLACED`
   * and be told "your work is on the record here", which is the one
   * thing that is not true about them — and a sentence somebody reads
   * about themselves on day one, knowing it is wrong, is worse than a
   * blank page.
   */
  | 'OWN_MAKING'
  /** Nothing here is about them as somebody who does the work. */
  | 'NOBODY'

export interface WorkingLife {
  /** Agencies currently marketing them, by name. A listing they granted. */
  benches: string[]
  /** Firms that employ them, by name. No listing is needed to staff them. */
  employers: string[]
  /** Placements in their name, live or finished. */
  placements: number
  /** Times somebody has put them forward. */
  submissions: number
  /** Contracts under which somebody pays them for the work. */
  paidEngagements: number
  /** A profile row already exists — from a bench, an import, or their own hand. */
  hasProfile: boolean
}

export interface PageVerdict {
  ok: boolean
  because: PageBecause
  /**
   * Their standing, in a sentence, in their own situation's words.
   *
   * Shown whether the answer is yes or no, because a refusal on this
   * surface has to say what is missing and what to do — and the old one
   * said what to do and had it backwards.
   */
  says: string
}

/** "A", "A and B", "A, B and C" — a list a person would say out loud. */
export function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function ownPage(life: WorkingLife): PageVerdict {
  const works =
    life.hasProfile ||
    life.placements > 0 ||
    life.submissions > 0 ||
    life.paidEngagements > 0

  if (!works) {
    return {
      ok: false,
      because: 'NOBODY',
      says:
        'This page is for the person the work is about, and nothing here has your name ' +
        'on it as a contractor yet. It appears by itself the first time somebody puts ' +
        'you forward or places you. If you do contract work through a firm on Etyme, ' +
        'ask them to add you and it starts there.',
    }
  }

  // Order matters, and it is the order a person would answer the
  // question in: who is selling me, else who employs me, else the work
  // itself. Somebody can be both — a nurse on a bench who also owns the
  // company that pays her — and the listing is the louder fact.
  if (life.benches.length > 0) {
    return {
      ok: true,
      because: 'BENCH',
      says:
        `${joinNames(life.benches)} ${life.benches.length === 1 ? 'markets' : 'market'} you. ` +
        'This page is yours rather than theirs: it goes with you when you leave, and ' +
        'nothing on it is public until you turn it on.',
    }
  }

  if (life.employers.length > 0) {
    return {
      ok: true,
      because: 'EMPLOYED',
      says:
        `${joinNames(life.employers)} ${life.employers.length === 1 ? 'employs' : 'employ'} you ` +
        'and can staff you directly, so you are on no agency’s bench and need no listing ' +
        'to work. This page is still yours, it goes with you, and nothing on it is public ' +
        'until you turn it on.',
    }
  }

  // Somebody whose only fact is a profile row they made themselves.
  //
  // Asked before PLACED rather than after, because PLACED's sentence
  // opens on work being on the record and there is none: no placement,
  // no submission, nobody paying them. Party 8B in the lane drawings —
  // a state rather than a flow, and the honest thing to say about it is
  // that the next move is theirs, both ways.
  const onTheRecord =
    life.placements > 0 || life.submissions > 0 || life.paidEngagements > 0

  if (!onTheRecord) {
    return {
      ok: true,
      because: 'OWN_MAKING',
      says:
        'You made this page yourself, and nobody has put you forward yet. No firm markets ' +
        'you, no firm employs you here, and nothing on it is public until you turn it on. ' +
        'Two things can happen from here and both are yours to decide: a firm invites you ' +
        'onto its bench and you grant it a listing, or you set up a company of your own and ' +
        'sell yourself.',
    }
  }

  return {
    ok: true,
    because: 'PLACED',
    says:
      'Your work is on the record here, so this page is yours. No agency markets you, ' +
      'and nothing on it is public until you turn it on.',
  }
}

/**
 * What a page is when it is first made.
 *
 * Made by the person, on their own first edit — never by a firm, never by
 * a placement, never by this file. Neutrality is absolute: Etyme markets
 * nobody, so a row coming into existence must publish nothing.
 *
 * Both fields are the schema’s defaults and both are written anyway. A
 * default is a fact about a migration; this is the promise, and it is
 * held in one place where a test can read it.
 */
export function startingPage(): { visibility: Visibility; pageLiveAt: null } {
  return { visibility: 'INTERNAL', pageLiveAt: null }
}

/**
 * The sentence on "Who has you".
 *
 * It used to read "No agency is marketing you" to everybody with no
 * listings, which is true and, to somebody a firm employs, lands as
 * "nobody has you". Karthik Menon has an employer, a finished placement
 * and four signed weeks; being told nobody has him is the same bug as
 * the page refusing him.
 */
export function whoHasYouNote(input: { benches: number; employers: string[] }): string {
  if (input.benches > 0) {
    return (
      `${input.benches} ${input.benches === 1 ? 'agency markets' : 'agencies market'} you. ` +
      'They cannot see each other, and none of them can see this page.'
    )
  }
  if (input.employers.length > 0) {
    return (
      `${joinNames(input.employers)} ${input.employers.length === 1 ? 'employs and staffs' : 'employ and staff'} ` +
      'you directly — an employer needs no listing, and tells you rather than asks. ' +
      'No agency is marketing you besides, and a listing is yours to give and to take back.'
    )
  }
  return (
    'No agency is marketing you. A bench listing is your permission, and it is yours to ' +
    'give and to take back.'
  )
}

// ── Their address ─────────────────────────────────────────────────────

const RESERVED = new Set([
  'me', 'you', 'admin', 'api', 'app', 'www', 'etyme', 'about', 'help',
  'support', 'login', 'signup', 'settings', 'new', 'edit', 'search',
])

export interface SlugVerdict {
  ok: boolean
  value: string | null
  reason: string
}

/**
 * The address a consultant picks.
 *
 * Theirs permanently, so it is never reissued — an old link landing on a
 * stranger's portfolio would be worse than a dead one.
 */
export function checkSlug(raw: string, taken: Set<string>): SlugVerdict {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '-')

  if (v.length < 3) return { ok: false, value: null, reason: 'Three characters or more.' }
  if (v.length > 40) return { ok: false, value: null, reason: 'Forty characters at most.' }
  if (!/^[a-z0-9-]+$/.test(v)) {
    return { ok: false, value: null, reason: 'Letters, numbers and hyphens only.' }
  }
  if (v.startsWith('-') || v.endsWith('-')) {
    return { ok: false, value: null, reason: 'Cannot start or end with a hyphen.' }
  }
  if (RESERVED.has(v)) return { ok: false, value: null, reason: `${v} is kept back.` }
  if (taken.has(v)) return { ok: false, value: null, reason: `${v} is taken.` }

  return { ok: true, value: v, reason: `etyme.com/c/${v} is yours.` }
}

// ── Written by a model, when there is one ─────────────────────────────

/**
 * The same split a company's page uses: the voice may be written, the
 * facts never are.
 *
 * What comes back is two sentences and a headline. Every number on the
 * page underneath — engagements, years, when they are free — is read live
 * and cannot be touched from here, so a written line can go out of style
 * but never out of date.
 */
const BIO_SYSTEM = `You write the headline and short intro on a contract consultant's own page.

You are given facts about their work. Write:

- headline: one line under their name. What they do, in the register a
  hiring manager uses. Not a slogan.
- intro: at most two short sentences. Concrete.

Rules that matter more than style:

- Invent nothing. Every claim must follow from a fact you were given. No
  client names, no certifications, no team sizes, no years you were not told.
- No unverifiable adjectives. "Expert", "seasoned", "passionate",
  "results-driven" and "proven" are filler and read as filler.
- If they have done little, say so plainly. Somebody with one engagement
  should read as somebody with one engagement.
- Never name or hint at a client. Sectors only.
- American spelling. Every reader is a US enterprise.

Return only JSON: {"headline":"...","intro":"..."}`

export function parseBio(text: string): { headline: string; intro: string } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return null

  try {
    const p = JSON.parse(candidate.slice(start, end + 1))
    if (typeof p?.headline !== 'string' || typeof p?.intro !== 'string') return null
    // A headline that runs to a paragraph is not a headline, and it breaks
    // the layout of every page that renders it.
    if (p.headline.length > 120 || p.intro.length > 400) return null
    return { headline: p.headline.trim(), intro: p.intro.trim() }
  } catch {
    return null
  }
}

export function bioModelAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

async function writeBioWithModel(
  input: PortfolioInput,
  now: Date
): Promise<{ headline: string; intro: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: key })

  const built = buildPortfolio(input, now)
  const prompt = `Name: ${input.name}
Where: ${input.location ?? 'not stated'}
Skills they list: ${input.skills.join(', ') || 'not stated'}
Years per skill, counted from real engagements: ${
    built.skills
      .filter((s) => s.years !== null)
      .map((s) => `${s.skill} ${s.years}y`)
      .join(', ') || 'none yet'
  }
Engagements: ${
    built.engagements
      .map((e) => `${e.role}, ${e.lasted}, ${e.sector ?? 'sector not stated'}`)
      .join(' | ') || 'none yet'
  }
Courses finished: ${input.completedTraining.map((t) => t.title).join(', ') || 'none'}
Checks that are current: ${input.verified.join(', ') || 'none'}
Availability: ${built.availability}`

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 800,
      system: BIO_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')

    return parseBio(text)
  } catch {
    // Falls back rather than failing. Nobody should be left without a page
    // because a third party was slow.
    return null
  }
}

/**
 * Their words, however they can be written.
 *
 * Never returns nothing, and says which way it went — a page written by
 * rule should never be mistaken for one somebody wrote themselves.
 */
export async function writeBioBest(
  input: PortfolioInput,
  now: Date
): Promise<{ headline: string; intro: string; writtenBy: 'MODEL' | 'RULES' }> {
  const fromModel = await writeBioWithModel(input, now)
  if (fromModel) return { ...fromModel, writtenBy: 'MODEL' }
  return { ...writeBio({ ...input, headline: null }, now), writtenBy: 'RULES' }
}

/**
 * What a consultant may write about themselves.
 *
 * Almost anything — it is their page. The limits are length, because a
 * headline that is a paragraph breaks the layout for everybody, and
 * borrowing Etyme's name for a claim we never made.
 */
export function checkBioEdit(field: 'headline' | 'intro', value: string): { ok: boolean; reason: string } {
  const v = value.trim()
  const max = field === 'headline' ? 120 : 400

  if (!v) return { ok: false, reason: 'Say something, or leave it as it was.' }
  if (v.length > max) {
    return { ok: false, reason: `Too long — ${max} characters at most, and it reads better well under that.` }
  }
  if (
    /\betyme\b.{0,20}\b(verified|approved|certified|endorsed|recommend)/i.test(v) ||
    /\b(verified|approved|certified|endorsed)\b.{0,20}\betyme\b/i.test(v)
  ) {
    return {
      ok: false,
      reason: 'That reads as though Etyme vouched for you, and we have not. Say what you do instead.',
    }
  }
  return { ok: true, reason: 'Saved.' }
}

// ── The employer's roster ─────────────────────────────────────────────

/**
 * The people a firm employs, and what each of them is on right now.
 *
 * ── Why this is not a bench ──────────────────────────────────────────
 *
 * CLAUDE.md, on what a prime needs that a staffing vendor does not:
 *
 *   > **Its own bench**: employees between projects, visible to the
 *   > delivery managers and HR who allocate them. Not a `BenchListing` —
 *   > that is a consultant consenting to be sold; this is an employer's
 *   > roster.
 *
 * Every talent screen in the product read bench *listings*, and you do
 * not ask your own W2 for permission to staff them. So a staffing vendor
 * — whose people mostly are listings — looked right, and an integrator
 * looked empty: Teleworld Solutions holds five live EMPLOYEE seats and
 * its own Consultants page read "TOTAL 0 consultants" while its Bench
 * page was bare under the heading "Your own team".
 *
 * ── The two things that make this a roster and not a shop window ──────
 *
 * **A roster is not consent to sell anybody.** `listed` says whether this
 * person granted this firm a bench listing, and nothing else on this
 * surface may offer to market, share or list somebody where it is false.
 * A firm may still put its own W2 in front of a client — it is
 * `INTERNAL`, the employment is the consent and the employee is told, not
 * asked — but that is the submissions door's business and its own rules,
 * not a button on a roster. `mayMarket` below is the guard.
 *
 * **Standing is read off the work, never off the seat.** The same rule
 * `ownPage` above is built on, for the same reason: every staffer of
 * every firm holds an EMPLOYEE context, so a seat cannot tell a
 * validation engineer from the firm's owner. What tells them apart is a
 * contract with their name on it. Where there is none, this says so in
 * those words and refuses to call the person available — which is the
 * honest answer for four of Teleworld's five, and a far better one than
 * counting the owner as bench capacity.
 *
 * ── What is deliberately not derived ─────────────────────────────────
 *
 * Whether somebody is billable. `BuyContractState` already carries
 * `BENCH_PAID`, `INTERNAL` and `TRAINING` — the exact three states a
 * roster wants — and nothing in the product has ever written one of them
 * (nought rows in the seeded world). When something does, this reads them
 * instead of inferring, and the inference here becomes the fallback.
 */
export type RosterStanding =
  /** A contract with their name on it is live today. */
  | 'ON_PROJECT'
  /** A contract is papered and the work has not started. */
  | 'STARTING_SOON'
  /** Their last assignment ended and nothing has replaced it. The bench that matters. */
  | 'BETWEEN_PROJECTS'
  /** No contract of any kind carries their name here. Not a claim that they are free. */
  | 'NOT_ON_THE_RECORD'

export interface RosterLine {
  /** Whether work is happening under it today. */
  live: boolean
  /** Live but suspended — still engaged, not free. */
  paused?: boolean
  startsOn: Date | null
  endsOn: Date | null
  /** Where the work is. The firm's own counterparty on its own contract. */
  clientName: string | null
}

export interface RosterPerson {
  personId: string
  name: string
  /** The seat they hold here, in the firm's own words. "Validation Engineer", "Owner". */
  seat: string | null
  /** Why the seat was granted — the practice, where the firm wrote one down. */
  practice: string | null
  /** Skills on record. Empty is common and is reported, never filled in. */
  skills: string[]
  /** Whether they have granted this firm a bench listing. Decides marketing and nothing else. */
  listed: boolean
  lines: RosterLine[]
}

export interface RosterVerdict {
  standing: RosterStanding
  /** One sentence about this person, in a delivery manager's words. */
  says: string
  /** Days since the last assignment ended. Null unless BETWEEN_PROJECTS. */
  freeForDays: number | null
  /** Where they are, where that is known. */
  on: string | null
  /**
   * Whether this person can be allocated to something.
   *
   * True only for BETWEEN_PROJECTS. `NOT_ON_THE_RECORD` is not free and
   * not busy — it is unknown, and counting unknown as free is how the
   * firm's owner ends up on a capacity number.
   */
  free: boolean
}

const A_DAY = 24 * 60 * 60 * 1000

function onDay(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function standingOf(p: RosterPerson, now: Date): RosterVerdict {
  const live = p.lines.filter((l) => l.live)
  if (live.length > 0) {
    // The one that runs longest is the one that describes them.
    const main = live.reduce((a, b) => ((b.endsOn?.getTime() ?? Infinity) > (a.endsOn?.getTime() ?? Infinity) ? b : a))
    const where = main.clientName ? ` at ${main.clientName}` : ''
    const until = main.endsOn ? `, until ${onDay(main.endsOn)}` : ''
    return {
      standing: 'ON_PROJECT',
      says: main.paused
        ? `On a project${where}, paused${until}. Still engaged, so not free to allocate.`
        : `On a project${where}${until}.`,
      freeForDays: null,
      on: main.clientName,
      free: false,
    }
  }

  const starting = p.lines
    .filter((l) => l.startsOn != null && l.startsOn.getTime() > now.getTime())
    .sort((a, b) => a.startsOn!.getTime() - b.startsOn!.getTime())[0]
  if (starting) {
    const where = starting.clientName ? ` at ${starting.clientName}` : ''
    return {
      standing: 'STARTING_SOON',
      says: `Starts${where} on ${onDay(starting.startsOn!)}. Papered and not begun, so not on the bench.`,
      freeForDays: null,
      on: starting.clientName,
      free: false,
    }
  }

  const ended = p.lines
    .filter((l) => l.endsOn != null && l.endsOn.getTime() <= now.getTime())
    .sort((a, b) => b.endsOn!.getTime() - a.endsOn!.getTime())[0]
  if (ended) {
    const days = Math.max(0, Math.floor((now.getTime() - ended.endsOn!.getTime()) / A_DAY))
    const where = ended.clientName ? ` ${ended.clientName}` : ''
    return {
      standing: 'BETWEEN_PROJECTS',
      says:
        `Came off${where} on ${onDay(ended.endsOn!)} — ` +
        `${days} ${days === 1 ? 'day' : 'days'} between projects.`,
      freeForDays: days,
      on: null,
      free: true,
    }
  }

  return {
    standing: 'NOT_ON_THE_RECORD',
    says: p.seat
      ? `No contract here carries their name. Their seat says ${p.seat}, and nothing on the record says whether they are free.`
      : 'No contract here carries their name, and no seat says what they do. Nothing on the record says whether they are free.',
    freeForDays: null,
    on: null,
    free: false,
  }
}

/**
 * Whether this surface may offer to market somebody.
 *
 * Asked per person, per button. A roster row for somebody who granted no
 * listing carries no Share and no Submit, and the sentence says why
 * rather than greying a control out with no words — CLAUDE.md: "Never a
 * disabled button with no words."
 */
export function mayMarket(p: { name: string; listed: boolean }): { ok: boolean; says: string } {
  if (p.listed) {
    return { ok: true, says: `${p.name} granted you a bench listing, so they can be marketed.` }
  }
  return {
    ok: false,
    says:
      `${p.name} has granted no bench listing, so nothing here markets, shares or lists them. ` +
      'Putting your own employee in front of a client happens from the job itself, where the ' +
      'employment is the consent and they are told where they went.',
  }
}

export interface RosterSummary {
  total: number
  onProject: number
  startingSoon: number
  betweenProjects: number
  notOnTheRecord: number
  /** People with at least one skill on record. */
  skillsKnown: number
  skillsUnknown: number
  /** How many granted a listing. A roster is usually mostly nought here, and that is correct. */
  marketable: number
  says: string
}

export function rosterSummary(rows: RosterPerson[], now: Date): RosterSummary {
  const verdicts = rows.map((r) => standingOf(r, now))
  const count = (s: RosterStanding) => verdicts.filter((v) => v.standing === s).length

  const total = rows.length
  const onProject = count('ON_PROJECT')
  const startingSoon = count('STARTING_SOON')
  const betweenProjects = count('BETWEEN_PROJECTS')
  const notOnTheRecord = count('NOT_ON_THE_RECORD')
  const skillsKnown = rows.filter((r) => r.skills.some((s) => s.trim())).length

  return {
    total,
    onProject,
    startingSoon,
    betweenProjects,
    notOnTheRecord,
    skillsKnown,
    skillsUnknown: total - skillsKnown,
    marketable: rows.filter((r) => r.listed).length,
    says: rosterSentence({ total, onProject, startingSoon, betweenProjects, notOnTheRecord }),
  }
}

function rosterSentence(f: {
  total: number
  onProject: number
  startingSoon: number
  betweenProjects: number
  notOnTheRecord: number
}): string {
  if (f.total === 0) {
    return (
      'Nobody is on your payroll here yet. Invite your team, and you can staff them on client ' +
      'work without asking them for a bench listing — the employment is the consent.'
    )
  }

  const parts: string[] = []
  if (f.onProject > 0) parts.push(`${f.onProject} on a project`)
  if (f.startingSoon > 0) parts.push(`${f.startingSoon} starting soon`)
  if (f.betweenProjects > 0) parts.push(`${f.betweenProjects} between projects`)

  const head = `${f.total} ${f.total === 1 ? 'person' : 'people'} on your payroll`
  const middle = parts.length > 0 ? `. ${joinNames(parts)}` : ''
  // The honest part, and the reason this sentence exists. Unknown is not
  // free: a firm's owner and a delivery engineer who has never been
  // placed here both land in it, and neither is capacity.
  const one = f.notOnTheRecord === 1
  const tail =
    f.notOnTheRecord > 0
      ? `. ${f.notOnTheRecord} ${one ? 'has' : 'have'} no contract on the record here, so nothing says whether they are free — ` +
        `${one ? 'their seat says' : 'their seats say'} what they do`
      : ''

  return `${head}${middle}${tail}.`
}

// ─────────────────────────────────────────────────────────────────────
// The worker files their own week
// ─────────────────────────────────────────────────────────────────────
//
// CLAUDE.md, Phase 1 station 6: "the worker files their own week; nobody
// else may". Found broken on the founder's lifecycle walk, 2026-09-28:
// a consultant's own page listed their weeks and offered "Send for
// approval" on an open one, and nothing anywhere let them write a week
// in the first place. The route would have taken it — `mayEnter` admits
// the person whose hours they are — and the page never asked.
//
// Three questions, answered here with no database so every branch can
// be tested: which contract the hours go on, which days are still open to
// file, and whether what they typed is a week anybody can sign.

/** One of the worker's own contracts, as their page reads it. */
export interface WorkRung {
  id: string
  personId: string
  /** The firm selling the work on this rung. */
  companyId: string
  /** The firm buying it on this rung. */
  clientCompanyId: string
  state: string
  /** YYYY-MM-DD. */
  startDate: string
  /** YYYY-MM-DD, or null where the placement is open-ended. */
  endDate: string | null
}

/** How long after the last day the final week may still be filed. */
export const FINAL_WEEK_GRACE_DAYS = 14

const DAY_MS = 86_400_000

function toDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The contracts a worker files hours against.
 *
 * In a chain every rung is a sell contract with their name on it — the
 * sub-vendor selling them to the prime, the prime selling them to the
 * client. The hours hang off the **bottom** rung, where the employer is
 * (`lib/chain-top` says the same from the client's side), and every rung
 * above bills on those same signed hours. A week filed on a rung above
 * would be the prime's contract carrying hours its supplier never saw,
 * and the supplier's invoice would have nothing to match.
 *
 * So: the rungs whose seller is not itself buying this person on another
 * of their rungs. A person with no chain has one rung and it is that.
 *
 * Live means in progress, or ended within the grace period — somebody
 * whose placement ended on a Wednesday still owes the Monday to
 * Wednesday, and the nightly job marks it ended before they have sat
 * down to file it. A paused placement takes no hours.
 */
export function rungsToFile(all: WorkRung[], today: string): WorkRung[] {
  const t = toDay(today)
  const live = all.filter((c) => {
    if (c.state === 'IN_PROGRESS') return true
    if (c.state === 'ENDED' && c.endDate) {
      return t - toDay(c.endDate) <= FINAL_WEEK_GRACE_DAYS * DAY_MS
    }
    return false
  })
  return live.filter((c) => {
    const buyers = all.filter((o) => o.id !== c.id && o.personId === c.personId).map((o) => o.clientCompanyId)
    return !buyers.includes(c.companyId)
  })
}

/** A week already on the record for this contract: its period, as filed. */
export interface FiledWeek {
  periodStart: string
  periodEnd: string
}

/** A run of days the worker may still file, as one sheet. */
export interface OpenWeek {
  periodStart: string
  periodEnd: string
  /** Every day in the run, oldest first. */
  days: string[]
  /** "Sun, Sep 20 – Sat, Sep 26", for the picker. */
  label: string
}

/** How many weeks back the page offers. Older than this is a conversation with the employer. */
export const WEEKS_BACK = 6

export type ClosedBecause = 'FUTURE' | 'BEFORE_START' | 'AFTER_END' | 'ALREADY_FILED' | 'OPEN'

/** Why a single day can or cannot carry hours on this contract. */
export function dayStanding(
  day: string,
  c: { startDate: string; endDate: string | null },
  filed: FiledWeek[],
  today: string
): ClosedBecause {
  const d = toDay(day)
  if (d > toDay(today)) return 'FUTURE'
  if (d < toDay(c.startDate)) return 'BEFORE_START'
  if (c.endDate && d > toDay(c.endDate)) return 'AFTER_END'
  if (filed.some((f) => toDay(f.periodStart) <= d && d <= toDay(f.periodEnd))) return 'ALREADY_FILED'
  return 'OPEN'
}

function label(from: string, to: string): string {
  const f = (iso: string) =>
    new Date(toDay(iso)).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return from === to ? f(from) : `${f(from)} – ${f(to)}`
}

/**
 * The weeks a worker can still file on one contract, newest first.
 *
 * A week is Sunday to Saturday (`weekStart` to `weekEnd`), trimmed to the days that have happened,
 * that the placement covers, and that no filed sheet already covers — so
 * two sheets never claim the same day, and a week filed on a Wednesday
 * leaves Thursday to Saturday for the next one rather than swallowing them.
 * Where a filed sheet sits in the middle of a week, the days either side
 * are offered as separate runs rather than one period spanning it.
 *
 * A week whose Saturday has not come yet is this week, filed as it goes.
 * Saturday and Sunday are days like any other here: not expected, never
 * flagged, and open to hours where somebody worked them.
 */
export function openWeeks(
  c: { startDate: string; endDate: string | null },
  filed: FiledWeek[],
  today: string
): OpenWeek[] {
  const out: OpenWeek[] = []
  const lastSunday = toDay(weekStart(today))
  const firstSunday = Math.max(toDay(weekStart(c.startDate)), lastSunday - (WEEKS_BACK - 1) * 7 * DAY_MS)

  for (let sun = lastSunday; sun >= firstSunday; sun -= 7 * DAY_MS) {
    const sat = toDay(weekEnd(fromDay(sun)))
    let run: string[] = []
    const runs: string[][] = []
    for (let d = sun; d <= sat; d += DAY_MS) {
      const day = fromDay(d)
      if (dayStanding(day, c, filed, today) === 'OPEN') {
        run.push(day)
      } else if (run.length > 0) {
        runs.push(run)
        run = []
      }
    }
    if (run.length > 0) runs.push(run)
    for (const r of runs.reverse()) {
      out.push({ periodStart: r[0], periodEnd: r[r.length - 1], days: r, label: label(r[0], r[r.length - 1]) })
    }
  }
  return out
}

export interface WeekCheck {
  ok: boolean
  /** Said to the worker, naming the day where it is about a day. */
  says: string
  /** The days with hours on them, cleaned, where ok. */
  days?: Record<string, number>
  totalHours?: number
}

const REFUSE: Record<Exclude<ClosedBecause, 'OPEN'>, (day: string, c: { startDate: string; endDate: string | null }) => string> = {
  FUTURE: (day) => `${label(day, day)} has not happened yet. Send hours for days you have worked.`,
  BEFORE_START: (day, c) => `${label(day, day)} is before your placement starts on ${label(c.startDate, c.startDate)}.`,
  AFTER_END: (day, c) => `${label(day, day)} is after your placement ended on ${label(c.endDate!, c.endDate!)}.`,
  ALREADY_FILED: (day) => `${label(day, day)} is already on a week you filed.`,
}

/**
 * Whether what the worker typed is a week somebody can sign.
 *
 * Every refusal is a sentence about a day, never a code. Nothing here
 * decides pay or overtime: those are the signer's, on the approval, and
 * the route flags a long day for them to look at rather than refusing it.
 */
export function checkWeek(input: {
  week: OpenWeek
  hours: Record<string, number | string | null | undefined>
  contract: { startDate: string; endDate: string | null }
  filed: FiledWeek[]
  today: string
}): WeekCheck {
  const days: Record<string, number> = {}
  for (const [day, raw] of Object.entries(input.hours)) {
    if (raw === null || raw === undefined || raw === '') continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return { ok: false, says: 'A day came through without a date. Reload the page and try again.' }
    }
    const h = Number(raw)
    if (!Number.isFinite(h) || h < 0) {
      return { ok: false, says: `${label(day, day)}: hours are a number of zero or more.` }
    }
    if (h === 0) continue
    if (h > 24) {
      return { ok: false, says: `${label(day, day)}: a day holds at most 24 hours.` }
    }
    const standing = dayStanding(day, input.contract, input.filed, input.today)
    if (standing !== 'OPEN') return { ok: false, says: REFUSE[standing](day, input.contract) }
    if (!input.week.days.includes(day)) {
      return { ok: false, says: `${label(day, day)} is not in the week you are sending (${input.week.label}).` }
    }
    days[day] = h
  }

  const totalHours = Object.values(days).reduce((n, h) => n + h, 0)
  if (totalHours === 0) {
    return { ok: false, says: `There are no hours on ${input.week.label}. Enter the hours you worked, then send.` }
  }

  return {
    ok: true,
    says: `${totalHours} ${totalHours === 1 ? 'hour' : 'hours'} for ${input.week.label}, ready to send for approval.`,
    days,
    totalHours,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Where they were put forward, in their words
// ─────────────────────────────────────────────────────────────────────

/**
 * What a submission's status means, said to the person it happened to.
 *
 * Never the code. "SUBMITTED" on a screen is a database column; "your
 * name is with them and they have not come back yet" is what somebody
 * actually wants to know.
 *
 * OFFERED says what happens next and who does it, in the same words the
 * candidate's email uses (`lib/interview-notices`): they are placed when
 * the client awards the position, and the firm that put them forward is
 * in touch about start and terms. It used to say "They made an offer."
 * and nothing else, which read as a job offer the person could accept —
 * and there is nothing for them to accept; the award is the client's.
 * No rate, ever: the price on a submission is between two firms.
 */
export function pipelineSays(
  status: string,
  interviews: number,
  names: { client: string; supplier: string }
): string {
  switch (status) {
    case 'SUBMITTED':
      return 'With them now. Nobody has come back yet.'
    case 'SHORTLISTED':
      return 'They shortlisted you.'
    case 'INTERVIEWING':
      return interviews > 0 ? `Interviewing — ${interviews} arranged.` : 'Interviewing.'
    case 'OFFERED':
      return (
        `You are placed when ${names.client} awards the position. ` +
        `${names.supplier} will be in touch about your start date and terms.`
      )
    case 'PLACED':
      return 'You got it.'
    case 'REJECTED':
      return 'They went a different way.'
    case 'WITHDRAWN':
      return 'Taken off it.'
    default:
      return status
  }
}

// ─────────────────────────────────────────────────────────────────────
// Where you work: one placement, the whole chain, in order
// ─────────────────────────────────────────────────────────────────────
//
// Founder, 2026-09-28: "Worker knows the complete chain." Their page
// listed every rung as a placement of its own, so Helena read Northbend
// Athletic twice — once as Techpeple's contract, once as Computer
// Systems'. One placement is one line naming every firm between her and
// the client, in order. The NDA keeping a sub-vendor's name from the
// client is about the client; the worker is employed through that firm
// and already knows it. Rates of rungs she is not party to stay closed.

export interface ChainRung extends WorkRung {
  /** The firm selling on this rung. */
  companyName: string
  /** The firm buying on this rung. */
  clientName: string
  /** Where the work happens, where the rung names it. */
  endClientName: string | null
}

/** How the firm at the bottom stands to the worker. */
export type Tie = 'EMPLOYED' | 'PAID' | null

export interface PlacementLine<T extends ChainRung = ChainRung> {
  /** The worker's own rung: the bottom of the chain. */
  own: T
  /** Every rung, bottom first. */
  rungs: T[]
  /** Where the work happens. */
  site: string
  /** The firms between the site and the bottom, nearest the client first. */
  through: string[]
  /** The firm at the bottom, which pays the worker. */
  employer: string
  /** "Northbend Athletic · through Computer Systems · employed by Techpeple" */
  says: string
}

function overlapDays(a: WorkRung, b: WorkRung): boolean {
  const aEnd = a.endDate ? toDay(a.endDate) : Number.POSITIVE_INFINITY
  const bEnd = b.endDate ? toDay(b.endDate) : Number.POSITIVE_INFINITY
  return toDay(a.startDate) <= bEnd && toDay(b.startDate) <= aEnd
}

/**
 * The worker's placements, one per chain, each naming the whole chain.
 *
 * Walked up from each bottom rung: the buyer of one rung is the seller of
 * the next, over the same days. Where two rungs above claim the same days
 * the walk stops there rather than guessing, and anything not reached is
 * its own line — a rung is never dropped, because a placement missing
 * from a person's own page is worse than one shown twice.
 *
 * `tie` says how the bottom firm stands to them, read from the buy line
 * that pays them: employed (W2 and the fixed-term kinds), paid (their own
 * corporation or 1099), or null where no buy line says, which reads
 * "through" rather than guessing a relationship.
 */
export function placementLines<T extends ChainRung>(rungs: T[], tie: (companyId: string) => Tie): PlacementLine<T>[] {
  const reached = new Set<string>()
  const lines: PlacementLine<T>[] = []

  const bottoms = rungs.filter(
    (c) => !rungs.some((o) => o.id !== c.id && o.personId === c.personId && o.clientCompanyId === c.companyId)
  )

  const build = (start: T): PlacementLine<T> => {
    const chain: T[] = [start]
    reached.add(start.id)
    let current = start
    for (;;) {
      const above = rungs.filter(
        (o) => !reached.has(o.id) && o.personId === current.personId && o.companyId === current.clientCompanyId && overlapDays(o, start)
      )
      if (above.length !== 1) break
      current = above[0]
      chain.push(current)
      reached.add(current.id)
    }
    const top = chain[chain.length - 1]
    const site = top.endClientName ?? top.clientName
    const sellersAbove = chain.slice(1).map((r) => r.companyName).reverse()
    // The top rung's buyer is somebody other than the site — a program
    // office or a shared service center paying for it — and is a firm
    // between them too.
    const through = [...(top.clientName !== site ? [top.clientName] : []), ...sellersAbove]
    const employer = start.companyName
    const t = tie(start.companyId)
    const bottomWord = t === 'EMPLOYED' ? 'employed by' : t === 'PAID' ? 'paid by' : 'through'
    const says = [site, ...through.map((n) => `through ${n}`), `${bottomWord} ${employer}`].join(' · ')
    return { own: start, rungs: chain, site, through, employer, says }
  }

  for (const b of bottoms) lines.push(build(b))
  // A rung no walk reached — two chains above one rung, say — still shows.
  for (const r of rungs) if (!reached.has(r.id)) lines.push(build(r))
  return lines
}

/** Which buy-line contract types make the paying firm an employer. */
export function tieOf(contractType: string | null | undefined): Tie {
  if (!contractType) return null
  return ['W2', 'C2H_W2', 'CDD', 'FIXED_TERM'].includes(contractType) ? 'EMPLOYED' : 'PAID'
}

// ── When a placement ran, in words ─────────────────────────────────────
//
// Where you work read "from 2026-06-01" under a placement whose chip said
// ended — an ISO day with no end, beside a word saying it had one. A
// person reads their own dates the way a calendar prints them.

// Moved to `lib/plain-date` so a browser page can print a day without
// loading this module's server imports. Re-exported so callers here keep working.
import { plainDate, daySpan } from '@/lib/plain-date'
export { plainDate, daySpan }

/**
 * A placement's dates as a person reads them: "Jun 1 – Aug 31, 2026 ·
 * ended", "Dec 1, 2025 – Feb 27, 2026", or "from Jun 1, 2026" where no
 * last day is on the record. Ended is said where the contract is ENDED,
 * or where its last day has passed and the nightly job has not caught up
 * yet; cancelled is said as cancelled. Never an ISO date.
 */
export function placementSpan(
  p: { startDate: string; endDate: string | null; state: string },
  today: string
): string {
  const start = p.startDate.slice(0, 10)
  const end = p.endDate?.slice(0, 10) ?? null
  const span = end ? daySpan(start, end) : `from ${plainDate(start)}`
  if (p.state === 'CANCELLED') return `${span} · cancelled`
  if (p.state === 'ENDED' || (end && end < today.slice(0, 10))) return `${span} · ended`
  return span
}

// ── What became of the weeks the client signed ─────────────────────────
//
// The summary on Your work read "Approved, not billed 14 — your vendor
// bills these" to Karthik Menon, who is Teleworld's own W2. Nobody bills
// him: his employer bills the client and pays him by payroll. What
// matters to an employee about a signed week is the other half of "who
// owes what, and when" (CLAUDE.md, 2026-09-29): paid, owed to him once
// his employer accepted it, or still waiting on his employer. The vendor
// sentence stays only for work paid through a supplier.

export interface SignedWeeks {
  /**
   * Weeks the client signed on work where the firm paying them does not
   * employ them, and nobody has billed yet.
   */
  notBilled: number
  /**
   * The not-billed weeks are billed by the person's own company (corp to
   * corp through her own LLC, or a 1099 in her own name), so the note says
   * her company bills them, never her vendor.
   */
  ownCompany?: boolean
  /**
   * On work where the bottom firm employs them; null where none does.
   */
  employed: null | {
    /** Paid in full, by a payroll run the record shows. */
    paid: number
    /** Accepted by the employer and not yet paid. */
    owed: number
    /** Accepted, and this page has no figure or pay record to say which. */
    unknown: number
    /** Who employs them, where there is one name; else "your employer". */
    employer: string | null
  }
}

export interface SummaryCard {
  label: string
  value: number
  note: string
}

/**
 * The third summary card on Your work.
 *
 * For somebody paid through a supplier, unchanged: approved weeks nobody
 * has billed, which their vendor bills. For an employee, the weeks every
 * firm on the chain has accepted, split the way his pay stands — never a
 * sentence about billing, because nothing is billed to him.
 *
 * A week the client signed and a firm below has not accepted yet is not
 * here. It is waiting, and the waiting card counts it (`waitingCard`).
 * Until 2026-10-03 it was counted on both, and Helena Marsh's Sep 21 week
 * read as approved, as waiting on approval, and as "waiting on Techpeple"
 * while it was with Computer Systems Inc — one week, three states.
 */
export function signedWeeksCard(s: SignedWeeks): SummaryCard {
  if (!s.employed) {
    return { label: 'Approved, not billed', value: s.notBilled, note: s.ownCompany ? 'your company bills these' : 'your vendor bills these' }
  }
  const e = s.employed
  const plural = (n: number) => `${n} week${n === 1 ? '' : 's'}`
  const parts: string[] = []
  if (e.paid > 0) parts.push(`${e.paid} paid`)
  if (e.owed > 0) parts.push(`${e.owed} owed to you`)
  if (e.unknown > 0) parts.push(`${e.unknown} accepted, pay not recorded here`)
  // Mixed work: the supplier-paid weeks keep their own words.
  if (s.notBilled > 0) parts.push(`${plural(s.notBilled)} your vendor bills`)
  const value = e.paid + e.owed + e.unknown + s.notBilled
  return {
    label: 'Approved weeks',
    value,
    note: parts.length > 0 ? parts.join(' · ') : 'none signed yet',
  }
}

// ── One week, one state ──────────────────────────────────────────────────
//
// The worker tester, 2026-10-03, on Helena Marsh's page: the Sep 21 week
// was counted as approved, as waiting on approval, and as "waiting on
// Techpeple", while the section below said it was with Computer Systems
// Inc. And Rosa Delgado's paid weeks read "approved" in Your hours under a
// section that said "Paid". Each reader had worked the state out its own
// way. This is the one way: the tiles, the pay section and Your hours all
// read a week through `weekState`.

export type WeekKind = 'NOT_SENT' | 'SENT_BACK' | 'WAITING' | 'APPROVED'

export interface WeekState {
  kind: WeekKind
  /** The word on her row: "waiting on Computer Systems Inc", "owed to you", "paid". */
  word: string
  tone: 'verified' | 'attention' | 'action' | 'passive'
  /** The firm the week is with now, where it is waiting. */
  waitingOn: string | null
}

/**
 * Where a payroll run pays her, whether a sheet's days are paid in full
 * or still owed, read off the owed weeks (`owedByWeek`). A sheet whose
 * days fall in a week with anything still owed is owed. Null where no
 * owed week covers the sheet — her pay is not run on Etyme, or the week
 * has no figure — and the row then keeps the trade's own word.
 */
export function payStageOf(
  days: Record<string, number> | null | undefined,
  periodStart: string,
  owed: ReadonlyArray<{ weekOf: string; stage: OwedStage; priced: boolean }>
): OwedStage | null {
  const worked = Object.entries(days ?? {}).filter(([, h]) => (Number(h) || 0) > 0).map(([d]) => d.slice(0, 10))
  const weeks = new Set((worked.length > 0 ? worked : [periodStart.slice(0, 10)]).map((d) => weekStart(d)))
  const mine = owed.filter((w) => w.priced && weeks.has(w.weekOf))
  if (mine.length === 0) return null
  return mine.some((w) => w.stage === 'OWED') ? 'OWED' : 'PAID'
}

/**
 * The one state of a week she filed.
 *
 * - **waiting** — sent and not yet accepted by every firm on the chain,
 *   and named by the firm it is with now (`waitingWeek`);
 * - **paid** or **owed to you** — where her employer pays her by payroll
 *   and the week is accepted (`payStageOf`);
 * - otherwise the trade's word: billed, approved, sent back, not sent.
 */
export function weekState(t: {
  status: string
  billed: boolean
  /** The firm it is with, from `waitingWeek`; null where nobody is still to sign. */
  waitingOn: string | null
  pay: OwedStage | null
}): WeekState {
  if (t.status === 'OPEN') return { kind: 'NOT_SENT', word: 'not sent', tone: 'passive', waitingOn: null }
  if (t.status === 'REJECTED') return { kind: 'SENT_BACK', word: 'sent back', tone: 'attention', waitingOn: null }
  if (t.waitingOn) return { kind: 'WAITING', word: `waiting on ${t.waitingOn}`, tone: 'action', waitingOn: t.waitingOn }
  if (t.pay === 'PAID') return { kind: 'APPROVED', word: 'paid', tone: 'verified', waitingOn: null }
  if (t.pay === 'OWED') return { kind: 'APPROVED', word: 'owed to you', tone: 'verified', waitingOn: null }
  if (t.status === 'SUBMITTED') return { kind: 'WAITING', word: 'waiting on approval', tone: 'action', waitingOn: null }
  if (t.status === 'APPROVED') return { kind: 'APPROVED', word: t.billed ? 'billed' : 'approved', tone: 'verified', waitingOn: null }
  return { kind: 'NOT_SENT', word: t.status.toLowerCase().replace(/_/g, ' '), tone: 'passive', waitingOn: null }
}

/**
 * The "Waiting on approval" card: every week she sent that some firm on
 * the chain has still to sign or accept, and which firm each is with.
 */
export function waitingCard(states: ReadonlyArray<WeekState>): SummaryCard {
  const waiting = states.filter((s) => s.kind === 'WAITING')
  const by = new Map<string, number>()
  for (const s of waiting) {
    const k = s.waitingOn ?? 'the firms on it'
    by.set(k, (by.get(k) ?? 0) + 1)
  }
  return {
    label: 'Waiting on approval',
    value: waiting.length,
    note: waiting.length === 0 ? 'nothing waiting' : [...by].map(([name, n]) => `${n} with ${name}`).join(' · '),
  }
}

/**
 * Who signs her hours after she sends them, in the order they sign:
 * "After you send, Northbend Athletic approves them first. Then Computer
 * Systems Inc and Techpeple accept them, in that order." The filing card
 * said "Techpeple and the client each sign them", which left out the firm
 * between and put the client last (worker tester, 2026-10-03).
 */
export function signingOrder(signers: ReadonlyArray<WeekSigner>): string {
  if (signers.length === 0) return 'After you send, they go for approval.'
  const [first, ...below] = signers
  if (below.length === 0) return `After you send, ${first.name} approves them.`
  const head = `After you send, ${first.name} approves them first.`
  if (below.length === 1) return `${head} Then ${below[0].name} accepts them.`
  const names = below.map((s) => s.name)
  return `${head} Then ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} accept them, in that order.`
}

// ─────────────────────────────────────────────────────────────────────
// A week sent back, corrected and sent again
// ─────────────────────────────────────────────────────────────────────
//
// A reject returns a week to OPEN with a reason. Your work counted its
// days as filed — they are, on that row — so the week was offered
// nowhere and the worker could not correct it. The timesheets door now
// files a week again over its own OPEN row (`timesheets/filing.ts`), so
// the page offers the returned week itself, with the hours that were on
// it and the reason it came back.

/** A week on the record that came back for correction. */
export interface ReturnedSheet {
  id: string
  periodStart: string
  periodEnd: string
  /** The hours that were on it, by day. */
  days: Record<string, number>
}

export interface ReturnedWeek extends OpenWeek {
  timesheetId: string
  /** The hours that were on it, to start the correction from. */
  hours: Record<string, number>
  /** Why it came back, in the signer's words, or null where nothing says. */
  reason: string | null
}

/**
 * The returned week as a week to file again.
 *
 * Its own period, every day of it that the placement covers and that has
 * happened, judged against every *other* week — its own row is the one
 * being written, so its days are not "already filed" against itself.
 * Null where no day of it can carry hours any more (the placement was
 * shortened under it), which the page says rather than offering a form
 * that would refuse every box.
 */
export function returnedWeek(
  sheet: ReturnedSheet,
  contract: { startDate: string; endDate: string | null },
  others: FiledWeek[],
  today: string,
  reason: string | null
): ReturnedWeek | null {
  const days: string[] = []
  for (let d = toDay(sheet.periodStart); d <= toDay(sheet.periodEnd); d += DAY_MS) {
    const day = fromDay(d)
    if (dayStanding(day, contract, others, today) === 'OPEN') days.push(day)
  }
  if (days.length === 0) return null
  const hours: Record<string, number> = {}
  for (const [day, h] of Object.entries(sheet.days ?? {})) {
    const n = Number(h)
    if (days.includes(day.slice(0, 10)) && Number.isFinite(n) && n > 0) hours[day.slice(0, 10)] = n
  }
  return {
    timesheetId: sheet.id,
    periodStart: sheet.periodStart,
    periodEnd: sheet.periodEnd,
    days,
    label: label(sheet.periodStart, sheet.periodEnd),
    hours,
    reason,
  }
}


// ── What the worker is owed, week by week ──────────────────────────────
//
// Money reported on 2026-09-29 that a non-exempt worker's own page figured
// what she is owed as straight time only: a forty-five-hour week read
// $70 × 45 on her page while payroll paid the premium on the five hours
// over the line. Two answers to one question, and the worker's was wrong.
//
// So this asks payroll's own functions the question payroll asks —
// `sheetPay` for which hours the employer's acceptance pays and the
// premium on the ones over the line, `priceByDay` for each paid hour at
// the rate in force, on the weekly line and the wage facts payroll reads
// — and restates none of the arithmetic. When payroll's
// rules move (a legal line where the contract names none, a method a firm
// chose, a cut week accepted at or under the line), they move inside
// those functions and this page follows.
//
// ── Who owes what, and when — the founder, 2026-09-29 ────────────────
//
// Once the client approves a week, the client owes it — to the firm it
// pays, on that firm's bill. Once the employer (or the vendor above the
// worker) accepts it, having checked the client's approval, the employer
// owes the worker, due on the worker's own payment terms.
//
// So a week on her page is in one of four places, and only the last two
// are money she is owed:
//
//   waiting for the client    filed and sent; nobody has signed it
//   waiting for the employer  the client signed; her employer has not
//                             accepted it, so nothing is owed yet and no
//                             figure is shown as owed
//   owed to you               the employer accepted it: what payroll pays
//                             for it, less what has been paid, and the pay
//                             day it falls due on from her own pay line
//   paid                      what was paid, and the day
//
// A week that was owed until 2026-09-29 the moment the client signed it
// told a worker she was owed money her employer had not agreed to pay.
//
// No bill rate is anywhere in it. The inputs are the worker's own pay
// line and her own weeks.

/** One of the worker's weeks as a payroll run would read it. */
export interface OwedSheet {
  id: string
  /** ISO day → hours, leave included, already narrowed to this pay line. */
  days: Record<string, number> | null
  /**
   * The whole sheet's days, where this pay line covers only some of them.
   * The employer accepted the whole sheet, so its acceptance is cut on the
   * whole sheet before the days of this line are read. Defaults to `days`.
   */
  allDays?: Record<string, number> | null
  /** ISO day → hours of paid leave, a subset of `days`. */
  leaveDays?: Record<string, number> | null
  /**
   * The employer's acceptance, as payroll reads it (`acceptanceForPay` in
   * lib/money/pay-hours): null pays every hour filed, 'MANY' is more than
   * one acceptance standing with nothing to say which governs.
   */
  accepted: AcceptedCut | null | 'MANY'
  /** When the employer accepted it: the day the debt to the worker starts. */
  acceptedAt: Date | null
  /** Used only where no daily hours were recorded. */
  totalHours: number
  periodStart: Date
  periodEnd: Date
}

/** A date on the pay line's own schedule. */
export interface PayDate {
  kind: string
  dueOn: Date
  completedAt: Date | null
}

/** The pay line the weeks are paid from — the worker's own, never a rung above. */
export interface OwedPayLine {
  /** The line's opening pay rate, cents an hour. */
  contractRateCents: number
  /** Approved pay changes, read by `rateInForce`. */
  periods: RatePeriod[]
  /** The weekly line as payroll reads it: the employer's own, else the sell line's. */
  afterHours: number | null
  method: OvertimeMethod
  wage: WageLine
  currency: string
  /**
   * The line's pay days: its SALARY_PAY cycles, the same dates the payroll
   * screen reads "next pay" from (`nextOpen` in lib/money/next-cycle). A
   * week falls due on the first one on or after both its last day and the
   * day the employer accepted it, whether or not payroll has run that day
   * — never a date worked out here.
   */
  payDates: PayDate[]
  /**
   * The line's pay periods and its straddle, read through the one door
   * payroll reads them through (`periodTermsFor('BUY', …)` in
   * lib/money/order-terms, with the person's own start). Where given, a
   * week's days are grouped into the pay periods the payroll run pays
   * them in — split by day under SPLIT, the whole sheet with its last day
   * under END, with its first under START (`hoursInPeriod`) — and each
   * group falls due on the first pay day after its own period ends. Where
   * absent, the week is one part, due after its last day, as before.
   */
  terms?: Terms
}

/**
 * One part of a week paid on a pay day of its own.
 *
 * A week crossing two months, on a line paid monthly with its days split,
 * is paid twice: its June days with June and its July days with July.
 * The run tells that truth; the week tells it too.
 */
export interface OwedPart {
  /** The first and last day worked in this part. */
  from: string
  to: string
  /** "Jun 29 – Jun 30, 2026". */
  label: string
  /** The pay period it is paid in, as payroll names it ("June 2026"). */
  period: string
  hours: number
  owedCents: number
  paidCents: number
  stillOwedCents: number
  stage: OwedStage
  /** The pay day it falls due on, where anything of it is unpaid. */
  dueOn: string | null
  overdue: boolean
  /** The day it was paid, where the record says. */
  paidOn: string | null
}

/** What payroll has already paid for one day of one sheet. */
export interface PaidSoFar {
  hours: number
  straightCents: number
  premiumHours: number
  premiumCents: number
  /** The last day a run or an approved back payment paid this day, where the record says. */
  paidOn?: string | null
}

/** Owed: the employer accepted it and some of it is unpaid. Paid: all of it is. */
export type OwedStage = 'OWED' | 'PAID'

export interface OwedWeek {
  /** The Sunday that opens the week (`weekStart`). */
  weekOf: string
  stage: OwedStage
  currency: string
  /**
   * False where this page cannot stand behind a figure for the week, and
   * `says` names why. Every money field below is then null.
   */
  priced: boolean
  /** The hours paid for the week: what the employer accepted, never what was filed. */
  hours: number | null
  ordinaryHours: number | null
  overtimeHours: number | null
  /** The extra the overtime hours earn, on top of their usual pay. Rounded once. */
  premiumCents: number | null
  /** Usual pay for every hour plus the premium: what payroll pays for the week. */
  owedCents: number | null
  /** What payroll runs and approved back pay have already paid for these days. */
  paidCents: number
  paidHours: number
  /** Owed less paid, never below nothing. */
  stillOwedCents: number | null
  unpaidHours: number | null
  unpaidOvertimeHours: number | null
  /** The hours filed on this pay line in the week. */
  filedHours: number
  /**
   * The pay day the unpaid part falls due on, from the pay line's own
   * dates. Null where nothing is owed, or where the line has no pay day
   * after the week — which `says` states rather than guessing one.
   */
  dueOn: string | null
  /** True where that pay day has passed and something is still owed. */
  overdue: boolean
  /** The last day anything for this week was paid, where the record says. */
  paidOn: string | null
  /**
   * Where the week's days are paid on more than one pay day, each part
   * with its own days, hours, amount and date. Null where the week is
   * paid in one — which is every week on a line that pays a crossing
   * week whole.
   */
  parts: OwedPart[] | null
  /** The week in plain words. Never a rate, never a code. */
  says: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const hoursWord = (n: number) => `${r2(n)} hour${r2(n) === 1 ? '' : 's'}`
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/**
 * "Sep 14", and "Sep 14, 2025" where the year is not this one. Read in
 * UTC, because every date here is a calendar day stored at midnight UTC
 * and a reader west of London would otherwise see the day before.
 */
export function shortDay(iso: string, today?: Date): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const thisYear = (today ?? new Date()).getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
    ...(d.getUTCFullYear() !== thisYear ? { year: 'numeric' } : {}),
  })
}

interface WeekTally {
  hours: number
  straight: number
  over: number
  premium: number
  paidHours: number
  paidCents: number
  unpaidHours: number
  unpaidOver: number
  twoRates: boolean
  /** Hours at each rate in force that week, with the first day worked at it. */
  byRate: Map<number, { hours: number; first: string }>
  unclassified: number
  filed: number
  lastDay: string | null
  acceptedOn: string | null
  paidOn: string | null
  many: boolean
  /** Sheets touching the week whose acceptance differs from what was filed on this line. */
  cuts: Array<{ filed: number; accepted: number; moreThanFiled: boolean }>
  /** Worked over the line and accepted at or under it: paid at straight time. */
  straightTime: boolean
  /** The week's days by the pay period that pays them, keyed by the period's first day. */
  parts: Map<string, PartTally>
}

interface PartTally {
  period: Period | null
  firstDay: string | null
  lastDay: string | null
  hours: number
  straight: number
  premium: number
  paidCents: number
  paidOn: string | null
}

/**
 * Which pay period pays each day of a sheet, the way the payroll run
 * decides it: each candidate period is asked through `hoursInPeriod`
 * with the line's straddle, and a period that takes the sheet partly
 * takes exactly its own days, one that takes it whole takes every day.
 * No second copy of the straddle rule lives here.
 */
function payPeriodsOfDays(
  sheet: { id: string; periodStart: Date; periodEnd: Date; days: Record<string, number>; totalHours: number },
  dayList: string[],
  terms: Terms
): Map<string, Period> {
  const out = new Map<string, Period>()
  const candidates = new Map<string, Period>()
  for (const d of [...dayList, isoDay(sheet.periodStart), isoDay(sheet.periodEnd)]) {
    const p = periodFor(new Date(`${d}T00:00:00Z`), terms)
    candidates.set(isoDay(p.start), p)
  }
  for (const p of [...candidates.values()].sort((a, b) => +a.start - +b.start)) {
    const r = hoursInPeriod(sheet, p, terms.straddle)
    if (!r) continue
    for (const d of dayList) {
      if (out.has(d)) continue
      const inside = d >= isoDay(p.start) && d <= isoDay(p.end)
      if (!r.partial || inside) out.set(d, p)
    }
  }
  return out
}

/**
 * Every week of the worker's accepted work on one pay line, what payroll
 * pays for it, what has been paid, what is still owed, and the pay day it
 * falls due on.
 *
 * Only sheets the employer accepted belong here: `waitingWeek` answers for
 * the rest, and never with a figure. `paidOn` answers what has already
 * been paid for a day of a sheet — the payroll book (`paidBook` in
 * lib/payroll-paid), passed in so this stays free of the database.
 *
 * A week the employer cut is priced on the hours it accepted, cut the way
 * payroll cuts them (`sheetPay`): ordinary hours first, so the worker
 * keeps her overtime, and a week accepted at or under the line paid at
 * straight time. A week with more than one acceptance standing shows no
 * figure, because payroll pays it on none of them.
 */
export function owedByWeek(
  sheets: OwedSheet[],
  line: OwedPayLine,
  paidOn: (sheetId: string, day: string) => PaidSoFar | undefined,
  today: Date = new Date()
): OwedWeek[] {
  const tally = new Map<string, WeekTally>()
  const at = (weekOf: string): WeekTally => {
    if (!tally.has(weekOf)) {
      tally.set(weekOf, {
        hours: 0, straight: 0, over: 0, premium: 0, paidHours: 0, paidCents: 0,
        unpaidHours: 0, unpaidOver: 0, twoRates: false, byRate: new Map(), unclassified: 0,
        filed: 0, lastDay: null, acceptedOn: null, paidOn: null, many: false, cuts: [], straightTime: false,
        parts: new Map(),
      })
    }
    return tally.get(weekOf)!
  }
  const clean = (m: Record<string, number> | null | undefined) =>
    Object.fromEntries(
      Object.entries(m ?? {})
        .map(([d, h]) => [d.slice(0, 10), Number(h) || 0] as const)
        .filter(([, h]) => h > 0)
    ) as Record<string, number>

  const partOf = (w: WeekTally, period: Period | null, day: string): PartTally => {
    const key = period ? isoDay(period.start) : 'ONE'
    if (!w.parts.has(key)) {
      w.parts.set(key, { period, firstDay: null, lastDay: null, hours: 0, straight: 0, premium: 0, paidCents: 0, paidOn: null })
    }
    const part = w.parts.get(key)!
    part.firstDay = !part.firstDay || day < part.firstDay ? day : part.firstDay
    part.lastDay = later(part.lastDay, day)
    return part
  }

  for (const s of sheets) {
    const days = clean(s.days)
    const hasDays = Object.keys(days).length > 0
    const acceptedOn = s.acceptedAt ? isoDay(s.acceptedAt) : null
    // Which pay period pays each day, where the line's terms are known.
    // A sheet with no days by the day cannot be split, and `hoursInPeriod`
    // sends it whole to the period its last day is in.
    const periodOfDay = (dayList: string[]) =>
      line.terms
        ? payPeriodsOfDays(
            { id: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd, days: hasDays ? days : {}, totalHours: s.totalHours },
            dayList,
            line.terms
          )
        : new Map<string, Period>()

    // What was filed on this line, week by week — so a week the employer
    // accepted none of still shows, and says so.
    const filedDays: Record<string, number> = hasDays ? days : { [isoDay(s.periodStart)]: s.totalHours }
    const touched = new Set<string>()
    for (const [day, h] of Object.entries(filedDays)) {
      const w = at(weekStart(day))
      touched.add(weekStart(day))
      w.filed += h
      w.lastDay = later(w.lastDay, hasDays ? day : isoDay(s.periodEnd))
      w.acceptedOn = later(w.acceptedOn, acceptedOn)
    }

    // More than one acceptance standing: payroll pays none of them, so
    // this page prices none of them.
    if (s.accepted === 'MANY') {
      for (const weekOf of touched) at(weekOf).many = true
      for (const [day, h] of Object.entries(filedDays)) {
        const paid = paidOn(s.id, day)
        const w = at(weekStart(day))
        w.paidHours += Math.min(paid?.hours ?? 0, h)
        w.paidCents += (paid?.straightCents ?? 0) + (paid?.premiumCents ?? 0)
        if (paid && (paid.hours > 0 || paid.straightCents > 0)) w.paidOn = later(w.paidOn, paid.paidOn ?? null)
      }
      continue
    }

    // Which hours the acceptance pays, cut the way payroll cuts them, and
    // the premium on the hours over the line — payroll's one call for it.
    const pay = hasDays
      ? sheetPay({
          all: clean(s.allDays ?? s.days),
          days,
          leaveDays: s.leaveDays ?? {},
          afterHours: line.afterHours,
          accepted: s.accepted,
          contractRateCents: line.contractRateCents,
          periods: line.periods,
          method: line.method,
          line: line.wage,
        })
      : null

    if (pay && pay.cut.accepted != null && (pay.cut.moreThanFiled || r2(pay.cut.filed - pay.cut.paid) > 0)) {
      // An acceptance records a sheet's total, not a week's: said once on
      // every week the sheet touches.
      for (const weekOf of touched) {
        at(weekOf).cuts.push({ filed: pay.cut.filed, accepted: pay.cut.accepted, moreThanFiled: pay.cut.moreThanFiled })
      }
    }
    if (pay) for (const st of pay.straightTime) at(st.weekOf).straightTime = true

    // The straight time, each paid day at the rate in force that day.
    const priced = priceByDay({
      contractRateCents: line.contractRateCents,
      periods: line.periods,
      days: pay ? pay.days : {},
      hours: pay ? null : s.accepted ? s.accepted.hours : s.totalHours,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
    })

    // The overtime, as payroll prices it.
    const weeks = pay?.weeks ?? []
    const premiums = pay?.premiums ?? new Map<string, DayPremium>()

    const periods = periodOfDay(priced.days.map((d) => d.day))
    for (const d of priced.days) {
      const w = at(weekStart(d.day))
      const part = partOf(w, periods.get(d.day) ?? null, d.day)
      w.hours += d.hours
      w.straight += d.hours * d.rateCents
      if (d.hours > 0) {
        const r = w.byRate.get(d.rateCents)
        if (r) { r.hours += d.hours; if (d.day < r.first) r.first = d.day }
        else w.byRate.set(d.rateCents, { hours: d.hours, first: d.day })
      }
      part.hours += d.hours
      part.straight += d.hours * d.rateCents
      const p = premiums.get(d.day)
      if (p) {
        w.over += p.hours
        w.premium += p.premiumCents
        part.premium += p.premiumCents
      }
      const paid = paidOn(s.id, d.day)
      w.paidHours += Math.min(paid?.hours ?? 0, d.hours)
      w.paidCents += (paid?.straightCents ?? 0) + (paid?.premiumCents ?? 0)
      part.paidCents += (paid?.straightCents ?? 0) + (paid?.premiumCents ?? 0)
      if (paid && (paid.hours > 0 || paid.straightCents > 0 || paid.premiumCents > 0)) {
        w.paidOn = later(w.paidOn, paid.paidOn ?? null)
        part.paidOn = later(part.paidOn, paid.paidOn ?? null)
      }
      w.unpaidHours += Math.max(0, d.hours - (paid?.hours ?? 0))
      w.unpaidOver += Math.max(0, (p?.hours ?? 0) - (paid?.premiumHours ?? 0))
    }
    for (const sw of weeks) {
      const w = at(sw.weekOf)
      if (!sw.overtime) w.unclassified += sw.overHours
      else if (sw.overtime.rates.length > 1 && sw.overtime.premiumCents > 0) w.twoRates = true
    }
  }

  const employer = line.wage.employerName ?? 'your employer'
  const Employer = employer.charAt(0).toUpperCase() + employer.slice(1)
  const todayIso = isoDay(today)
  const day = (iso: string) => shortDay(iso, today)

  return [...tally.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekOf, w]): OwedWeek => {
      const paidCents = Math.round(w.paidCents)
      const paidHours = r2(w.paidHours)
      const filedHours = r2(w.filed)

      if (w.many) {
        return {
          weekOf, stage: 'OWED', currency: line.currency, priced: false,
          hours: null, ordinaryHours: null, overtimeHours: null, premiumCents: null,
          owedCents: null, stillOwedCents: null, unpaidHours: null, unpaidOvertimeHours: null,
          paidCents, paidHours, filedHours, dueOn: null, overdue: false, paidOn: w.paidOn, parts: null,
          says:
            `${Employer} has accepted this week more than once, and nothing says which acceptance stands, ` +
            `so its payroll pays it once all but one are withdrawn. This page shows no figure for it until then.`,
        }
      }

      const hours = r2(w.hours)
      const over = r2(w.over)
      // Straight time rounded once and the premium rounded once, as a
      // payroll run rounds them.
      const straightCents = Math.round(w.straight)
      const premiumCents = Math.round(w.premium)
      const owedCents = straightCents + premiumCents
      const stillOwedCents = Math.max(0, owedCents - paidCents)
      const paidTooMuch = paidCents > owedCents
      const stage: OwedStage = stillOwedCents === 0 && paidCents > 0 ? 'PAID' : 'OWED'

      const parts: string[] = []

      // What the employer accepted, where it is not what was filed.
      for (const c of w.cuts) {
        if (c.moreThanFiled) {
          parts.push(`${Employer} accepted ${hoursWord(c.accepted)} and you filed ${hoursWord(c.filed)}, so the ${r2(c.filed)} you filed are paid.`)
        } else if (c.accepted <= 0) {
          parts.push(`You filed ${hoursWord(c.filed)} and ${employer} accepted none of them.`)
        } else {
          parts.push(`You filed ${hoursWord(c.filed)} and ${employer} accepted ${r2(c.accepted)}.`)
        }
      }

      if (hours <= 0) {
        if (w.cuts.length === 0) parts.push('No hours to pay this week.')
      } else if (over > 0) {
        parts.push(
          `${hoursWord(hours)}: ${r2(hours - over)} ordinary and ${r2(over)} overtime. ` +
            `The ${hoursWord(over)} of overtime earn an extra ${amount(premiumCents, line.currency)} on top of your usual pay.`
        )
        if (w.twoRates) parts.push('You were paid at two rates that week, so the extra is worked out on the average of the two.')
      } else if (w.straightTime) {
        parts.push(
          `${hoursWord(hours)}, all at your usual pay, because the week as accepted is not over ${line.afterHours} hours.`
        )
      } else if (w.unclassified > 0) {
        parts.push(
          `${hoursWord(hours)}, ${hoursWord(w.unclassified)} of them over ${line.afterHours} in the week. ` +
            `${Employer} has not recorded whether you are owed overtime, so they are shown at your usual pay. Ask ${employer}.`
        )
      } else if (w.byRate.size > 1) {
        // Paid at more than one rate, with no overtime: Rosa Delgado's
        // raise week read "40 hours, none of them overtime" beside $2,736,
        // which is not 40 at either rate (worker tester, 2026-10-03).
        parts.push(`${hoursWord(hours)}: ${ratesSaid(weekOf, w.byRate, line.periods, line.currency, today)}`)
      } else {
        parts.push(`${hoursWord(hours)}, none of them overtime.`)
      }
      if (paidTooMuch) parts.push(`More has been paid for this week than this page works out. ${Employer} has the record.`)

      // When: the day it was paid, or the pay day it falls due on.
      //
      // Each part of the week on its own pay day, where the line's terms
      // put its days in more than one pay period — the way the payroll run
      // pays them. A part falls due on the first pay day on the line after
      // both its own pay period ends and the employer accepted it; a pay
      // day before the acceptance was never this week's, and a pay day
      // payroll ran without paying it still counts — the run that left it
      // out does not move the day it fell due — so every pay day on the
      // line is read, run or not. Without terms, the week is one part and
      // falls due after its last day, as it always did.
      const dueFor = (from: string): string | null => {
        const next = nextOpen(
          line.payDates.map((p) => ({ ...p, completedAt: null })),
          'SALARY_PAY',
          new Date(`${from}T00:00:00Z`)
        )
        return next ? isoDay(next.dueOn) : null
      }
      const fromOf = (pt: PartTally | null) =>
        later(pt?.period ? isoDay(pt.period.end) : w.lastDay, w.acceptedOn) ?? weekOf

      const partsList = [...w.parts.values()].filter((pt) => pt.hours > 0).sort((a, b) => a.firstDay!.localeCompare(b.firstDay!))
      let split: OwedPart[] | null = null
      let dueOn: string | null = null
      let overdue = false

      if (partsList.length > 1) {
        split = partsList.map((pt): OwedPart => {
          const owed = Math.round(pt.straight) + Math.round(pt.premium)
          const paid = Math.round(pt.paidCents)
          const still = Math.max(0, owed - paid)
          const partStage: OwedStage = still === 0 && paid > 0 ? 'PAID' : 'OWED'
          const due = still > 0 ? dueFor(fromOf(pt)) : null
          return {
            from: pt.firstDay!, to: pt.lastDay!,
            label: pt.firstDay === pt.lastDay ? day(pt.firstDay!) : `${day(pt.firstDay!)} – ${day(pt.lastDay!)}`,
            period: pt.period?.label ?? '',
            hours: r2(pt.hours),
            owedCents: owed, paidCents: paid, stillOwedCents: still,
            stage: partStage,
            dueOn: due,
            overdue: due !== null && due < todayIso,
            paidOn: paid > 0 ? pt.paidOn : null,
          }
        })
        parts.push(`${Employer} pays this week on ${split.length} pay days, one for each pay period its days fall in.`)
        for (const pt of split) {
          const head = `${pt.label}: ${hoursWord(pt.hours)}, ${amount(pt.owedCents, line.currency)},`
          if (pt.stage === 'PAID') {
            parts.push(`${head} ${pt.paidOn ? `paid on ${day(pt.paidOn)}` : 'paid, and the record does not say which day'}.`)
          } else {
            const partly = pt.paidCents > 0 ? `partly paid${pt.paidOn ? ` on ${day(pt.paidOn)}` : ''}, and the rest ` : ''
            parts.push(
              `${head} ${partly}` +
                (pt.dueOn
                  ? pt.overdue
                    ? `fell due on your pay day of ${day(pt.dueOn)} and has not been paid.`
                    : `is due on your pay day, ${day(pt.dueOn)}.`
                  : `has no pay date set.`)
            )
          }
        }
        dueOn = split.filter((pt) => pt.stillOwedCents > 0 && pt.dueOn).map((pt) => pt.dueOn!).sort()[0] ?? null
        overdue = split.some((pt) => pt.overdue)
      } else if (stage === 'PAID') {
        parts.push(w.paidOn ? `${Employer} paid it on ${day(w.paidOn)}.` : `${Employer} paid it. The record does not say which day.`)
      } else if (stillOwedCents > 0) {
        if (paidCents > 0) {
          parts.push(w.paidOn ? `${Employer} paid part of it on ${day(w.paidOn)}.` : `${Employer} has paid part of it.`)
        }
        dueOn = dueFor(fromOf(partsList[0] ?? null))
        if (dueOn) {
          overdue = dueOn < todayIso
          parts.push(
            overdue
              ? `It fell due on your pay day of ${day(dueOn)} and has not been paid.`
              : `It is due on your pay day, ${day(dueOn)}.`
          )
        } else {
          parts.push(`${Employer} has not set a pay date for this week.`)
        }
      }

      return {
        weekOf, stage, currency: line.currency, priced: true,
        hours,
        ordinaryHours: r2(hours - over),
        overtimeHours: over,
        premiumCents,
        owedCents,
        paidCents,
        paidHours,
        stillOwedCents,
        unpaidHours: r2(w.unpaidHours),
        unpaidOvertimeHours: r2(w.unpaidOver),
        filedHours,
        dueOn,
        overdue,
        paidOn: paidCents > 0 ? w.paidOn : null,
        parts: split,
        says: parts.join(' '),
      }
    })
}

/**
 * "16 at $66 and 24 at $70, because your raise took effect on Aug 5." A
 * week whose days were paid at more than one rate, each rate with its
 * hours, in the order they applied, and the day the last one began: the
 * approved rate change's own date where one starts inside the week, else
 * the first day worked at it.
 */
export function ratesSaid(
  weekOf: string,
  byRate: ReadonlyMap<number, { hours: number; first: string }>,
  periods: ReadonlyArray<Pick<RatePeriod, 'rateCents' | 'fromDate'>>,
  currency: string,
  today: Date = new Date()
): string {
  const segs = [...byRate.entries()].map(([rate, v]) => ({ rate, ...v })).sort((a, b) => a.first.localeCompare(b.first))
  const each = segs.map((x) => `${r2(x.hours)} at ${compact(x.rate, currency)}`)
  const list = each.length === 2 ? each.join(' and ') : `${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}`
  const last = segs[segs.length - 1]
  const before = segs[segs.length - 2]
  const change = periods.find((p) => {
    const from = isoDay(p.fromDate)
    return p.rateCents === last.rate && from >= weekOf && from <= last.first
  })
  const on = shortDay(change ? isoDay(change.fromDate) : last.first, today)
  const why = last.rate > before.rate ? `your raise took effect on ${on}` : `your rate changed on ${on}`
  return `${list}, because ${why}.`
}

// ── A week that is not owed yet ──────────────────────────────────────────
//
// Filed and sent, and waiting on somebody: the client to sign it, or —
// once it has — each firm below the client to accept it in turn, down to
// her employer (CLAUDE.md, "The signed week travels down the chain").
// None of it is owed to her until her employer accepts it, so a waiting
// week carries hours and a sentence and never a figure.

export type SignRole = 'CLIENT_APPROVAL' | 'PASS_THROUGH' | 'EMPLOYER_ACCEPTANCE'

/** One signature a week needs, in the order it is needed. */
export interface WeekSigner {
  companyId: string
  name: string
  role: SignRole
}

/**
 * Every signature the worker's week needs, in order: the client where the
 * work is, each firm between it and her employer (nearest the client
 * first), and her employer last. The order the timesheet approve route
 * walks (`signersOf` in its chain-turn), read off her own placement line.
 *
 * `line.rungs` is bottom first, as `placementLines` returns it; `client`
 * is the company where the work happens, which on the top rung is its end
 * client where one is named and its buyer where not.
 */
export function weekSigners(
  line: { rungs: Array<{ companyId: string; companyName: string }> },
  client: { id: string; name: string }
): WeekSigner[] {
  if (line.rungs.length === 0) return []
  const [own, ...above] = line.rungs
  return [
    { companyId: client.id, name: client.name, role: 'CLIENT_APPROVAL' },
    ...above.reverse().map((r) => ({ companyId: r.companyId, name: r.companyName, role: 'PASS_THROUGH' as const })),
    { companyId: own.companyId, name: own.companyName, role: 'EMPLOYER_ACCEPTANCE' },
  ]
}

/**
 * When a signer signed this week, or null. The ledger first; the client's
 * and the employer's columns as well, because weeks signed before the
 * ledger existed carry only those (the same reading as the approve
 * route's `signedBy`).
 */
export function signedAtOf(
  s: WeekSigner,
  week: { clientApprovedAt: Date | null; employerAcceptedAt: Date | null },
  live: Array<{ companyId: string; role: string; at: Date }>
): Date | null {
  const onLedger = live.find((a) => a.companyId === s.companyId && a.role === s.role)
  if (onLedger) return onLedger.at
  if (s.role === 'CLIENT_APPROVAL') return week.clientApprovedAt
  if (s.role === 'EMPLOYER_ACCEPTANCE') return week.employerAcceptedAt
  return null
}

export interface WaitingSheet {
  id: string
  periodStart: Date
  periodEnd: Date
  /** The hours filed. */
  hours: number
  submittedAt: Date | null
  /** Every signature the week needs, in order, with when each was given. */
  signers: Array<WeekSigner & { signedAt: Date | null }>
  /**
   * Where the client approved the week by email rather than in Etyme, the
   * sentence that says so ("Approved by email: Marcus Oyelaran, Sep 2 —
   * evidence attached", from `approvalWordsFor` in lib/week-approval).
   * It replaces "<client> signed it", because nobody at the client signed
   * in Etyme and the page must never say they did (CLAUDE.md, 2026-09-30).
   */
  clientApproval?: string | null
}

export type WaitingStage = 'WAITING_FOR_CLIENT' | 'WAITING_FOR_EMPLOYER'

export interface WaitingWeek {
  sheetId: string
  /** The Sunday of the week the sheet starts in, so it sorts beside the weeks owed. */
  weekOf: string
  periodStart: string
  periodEnd: string
  /** "Week of Sep 14", or "Sep 1 to Sep 15" for a sheet longer than a week. */
  label: string
  stage: WaitingStage
  hours: number
  /** The firm it is with now. */
  waitingOn: string
  /** The firm that pays her. */
  employer: string
  says: string
}

/**
 * Where a filed week stands, where it is not owed yet. Null where her
 * employer has accepted it — it is owed then, and `owedByWeek` prices it.
 */
export function waitingWeek(s: WaitingSheet, today: Date = new Date()): WaitingWeek | null {
  const employer = [...s.signers].reverse().find((x) => x.role === 'EMPLOYER_ACCEPTANCE')
  if (!employer || employer.signedAt) return null
  const client = s.signers.find((x) => x.role === 'CLIENT_APPROVAL')
  const next = s.signers.find((x) => !x.signedAt) ?? employer
  const day = (d: Date) => shortDay(isoDay(d), today)

  const start = isoDay(s.periodStart)
  const end = isoDay(s.periodEnd)
  const spanDays = Math.round((+s.periodEnd - +s.periodStart) / DAY_MS)
  const label = spanDays <= 6 && weekStart(start) === weekStart(end) ? `Week of ${shortDay(weekStart(start), today)}` : `${shortDay(start, today)} to ${shortDay(end, today)}`

  let stage: WaitingStage
  let says: string
  if (client && !client.signedAt) {
    stage = 'WAITING_FOR_CLIENT'
    says = `Sent to ${client.name}${s.submittedAt ? ` on ${day(s.submittedAt)}` : ''}. Waiting for them to sign.`
  } else {
    stage = 'WAITING_FOR_EMPLOYER'
    const done = s.signers.filter((x) => x.signedAt && x.role !== 'EMPLOYER_ACCEPTANCE')
    const signed = done.map((x) =>
      x.role === 'CLIENT_APPROVAL' && s.clientApproval
        ? `${s.clientApproval.replace(/\.$/, '')}.`
        : `${x.name} ${x.role === 'CLIENT_APPROVAL' ? 'signed' : 'accepted'} it on ${day(x.signedAt!)}.`
    )
    const then = next.companyId === employer.companyId ? '' : `, then ${employer.name}`
    says =
      [...signed, `Waiting for ${next.name} to accept it${then}.`].join(' ') +
      ` It is owed to you once ${employer.name} accepts it.`
  }

  return {
    sheetId: s.id,
    weekOf: weekStart(start),
    periodStart: start,
    periodEnd: end,
    label,
    stage,
    hours: r2(s.hours),
    waitingOn: stage === 'WAITING_FOR_CLIENT' ? client!.name : next.name,
    employer: employer.name,
    says,
  }
}

// ── The door from her list to one week ───────────────────────────────────
//
// The week's own page (/dashboard/weeks/[id]) is where the worker sends
// "Approve by email" to the client's approver, attaches the client's
// approval email, and reads who approved it. Her list links every week she
// has sent there, worded for what she can do on it. A week she has not
// sent has no door: the form to file it is the door.

export interface WeekDoor {
  href: string
  says: string
}

export function weekDoor(t: {
  id: string
  status: string
  clientApproved: boolean
  /** The "Approved by email: …" sentence, where the client approved that way. */
  approvedBy: string | null
  /**
   * What the week's own page would answer about approval by email, read
   * through lib/week-approval (`readWeekApprovals`), where it was asked.
   * The worker tester, 2026-10-03: the row offered "Ask the client to
   * approve by email" on a 45-hour week the page then refused, and went on
   * offering it after a link had gone to Marcus Oyelaran and was waiting.
   */
  email?: {
    /** The client's name, for the sentence when it must sign in Etyme. */
    clientName: string
    /** Why the week cannot be approved by email, or null where it can. */
    refused: string | null
    /** A link that has gone and is still waiting for an answer. */
    linkWaiting: { to: string; on: string } | null
  }
}): WeekDoor | null {
  if (t.status === 'OPEN') return null
  const href = `/dashboard/weeks/${t.id}`
  if (t.status === 'SUBMITTED' && !t.clientApproved) {
    if (t.email?.linkWaiting) return { href, says: `Link sent to ${t.email.linkWaiting.to}, ${t.email.linkWaiting.on}` }
    if (t.email?.refused) return { href, says: `${t.email.clientName} signs this week in Etyme` }
    return { href, says: 'Ask the client to approve by email' }
  }
  if (t.approvedBy) return { href, says: 'See the approval and its evidence' }
  return { href, says: 'Open this week' }
}

// ── When a day was paid ──────────────────────────────────────────────────
//
// `paidBook` (lib/payroll-paid) says how much of each day has been paid
// and not when. A worker asking "was I paid for that week" wants the day,
// so this reads the date off the same rows: a processed PAYROLL_RUN's own
// time for each line it paid, and an approved back payment's time for each
// day it raised. The latest one is the day a week was last paid. The
// amounts stay paidBook's; only the date is read here, and where a day is
// on no row this says nothing rather than a guess.

/**
 * The latest day each paid day was paid on, keyed as `paidKey` keys it
 * (`buyContractId|personId|timesheetId|day`), for these buy contracts.
 *
 * Only a processed run pays, and a row the run refused paid nothing — the
 * same two rules `paidBook` reads by.
 */
export function paidDatesFrom(
  runs: ReadonlyArray<{ at: Date; payload: unknown }>,
  backPaid: ReadonlyArray<{ at: Date; payload: unknown }>,
  buyContractIds: readonly string[],
  key: (buyContractId: string, personId: string, timesheetId: string, day: string) => string,
  // The line's own pay days, so a run pressed on or before the pay day it
  // settled reads as paid on that pay day, and a late run on the day it
  // ran (`paidOnDay` in lib/money/pay-day-period). Without it, the day
  // the run was pressed, as before.
  payDaysOf?: (buyContractId: string) => ReadonlyArray<{ dueOn: Date; completedAt: Date | null }>
): Map<string, string> {
  const wanted = new Set(buyContractIds)
  const out = new Map<string, string>()
  const mark = (k: string, d: string) => {
    const was = out.get(k)
    if (!was || d > was) out.set(k, d)
  }
  for (const run of runs) {
    const p = (run.payload ?? {}) as {
      action?: string
      runAt?: string
      contracts?: Array<{ buyContractId?: string; refused?: string | null; paid?: Array<{ personId: string; timesheetId: string; day: string }> }>
    }
    if (p.action !== 'process') continue
    const ranAt = p.runAt ? new Date(p.runAt) : run.at
    for (const c of p.contracts ?? []) {
      if (!c.buyContractId || !wanted.has(c.buyContractId) || c.refused || !Array.isArray(c.paid)) continue
      const day = payDaysOf ? paidOnDay(ranAt, payDaysOf(c.buyContractId)) : isoDay(run.at)
      for (const l of c.paid) mark(key(c.buyContractId, l.personId, l.timesheetId, l.day), day)
    }
  }
  for (const row of backPaid) {
    const lines = ((row.payload ?? {}) as {
      backPay?: Array<{ buyContractId: string; personId: string; timesheetId: string; day: string }>
    }).backPay
    if (!Array.isArray(lines)) continue
    for (const l of lines) {
      if (!wanted.has(l.buyContractId)) continue
      mark(key(l.buyContractId, l.personId, l.timesheetId, l.day), isoDay(row.at))
    }
  }
  return out
}


/**
 * Which figures a rate progression may carry for this viewer.
 *
 * A rate progression (`/api/consultants/:id/rate-progression`) is one
 * person's pay across their placements. Three figures can sit on a
 * point, and each is read under its own rule:
 *
 * - **pay** — the desks that run pay (`consultants.cost`) or the person
 *   it pays, through `mayReadPayOf` in lib/money/pay-visibility, the
 *   same rule as every other door onto a pay rate;
 * - **bill** — the price desk's figure (`margin.read`). Reading pay
 *   never hands anybody the bill rate: until 2026-09-30 this route
 *   showed AP & Payroll the bill rate and the margin because it held
 *   `consultants.cost`;
 * - **margin** — only where both are readable, because a margin is a
 *   subtraction of the two and printing it would print the one withheld.
 */
export function progressionFigures(
  viewer: PayViewer,
  subjectPersonId: string
): { pay: boolean; bill: boolean; margin: boolean } {
  const pay = mayReadPayOf(viewer, subjectPersonId)
  const bill = canReadBillRate({ permissions: viewer.permissions })
  return { pay, bill, margin: pay && bill }
}
