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

import { sheetOvertime, premiumByDay, type WageLine } from '@/lib/money/sheet-overtime'
import type { OvertimeMethod } from '@/lib/money/overtime-method'
import { priceByDay, type RatePeriod } from '@/lib/contract-rate'
import { weekStart } from '@/lib/overtime'
import { amount } from '@/lib/money-display'

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

/** The Monday of the week a day falls in. Weeks run Monday to Sunday. */
export function mondayOf(iso: string): string {
  const ms = toDay(iso)
  const dow = new Date(ms).getUTCDay() // 0 Sunday … 6 Saturday
  return fromDay(ms - ((dow + 6) % 7) * DAY_MS)
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
  /** "Mon 21 Sep – Sun 27 Sep", for the picker. */
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
 * A week is Monday to Sunday, trimmed to the days that have happened,
 * that the placement covers, and that no filed sheet already covers — so
 * two sheets never claim the same day, and a week filed on a Wednesday
 * leaves Thursday to Sunday for the next one rather than swallowing them.
 * Where a filed sheet sits in the middle of a week, the days either side
 * are offered as separate runs rather than one period spanning it.
 */
export function openWeeks(
  c: { startDate: string; endDate: string | null },
  filed: FiledWeek[],
  today: string
): OpenWeek[] {
  const out: OpenWeek[] = []
  const lastMonday = toDay(mondayOf(today))
  const firstMonday = Math.max(toDay(mondayOf(c.startDate)), lastMonday - (WEEKS_BACK - 1) * 7 * DAY_MS)

  for (let mon = lastMonday; mon >= firstMonday; mon -= 7 * DAY_MS) {
    let run: string[] = []
    const runs: string[][] = []
    for (let i = 0; i < 7; i++) {
      const day = fromDay(mon + i * DAY_MS)
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
// Athletic twice — once as CloudEPA's contract, once as Computer
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
  /** "Northbend Athletic · through Computer Systems · employed by CloudEPA" */
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
// `priceByDay` for each day at the rate in force, `sheetOvertime` and
// `premiumByDay` for the premium, on the weekly line and the wage facts
// payroll reads — and restates none of the arithmetic. When payroll's
// rules move (a legal line where the contract names none, a method a firm
// chose), they move inside those functions and this page follows.
//
// No bill rate is anywhere in it. The inputs are the worker's own pay
// line and her own weeks.

/** One of the worker's weeks as a payroll run would read it. */
export interface OwedSheet {
  id: string
  /** ISO day → hours, leave included, already narrowed to this pay line. */
  days: Record<string, number> | null
  /** ISO day → hours of paid leave, a subset of `days`. */
  leaveDays?: Record<string, number> | null
  /** What the employer accepted, where it differs from what was filed. */
  acceptedHours: number | null
  /** Used only where no daily hours were recorded. */
  totalHours: number
  periodStart: Date
  periodEnd: Date
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
}

/** What payroll has already paid for one day of one sheet. */
export interface PaidSoFar {
  hours: number
  straightCents: number
  premiumHours: number
  premiumCents: number
}

export interface OwedWeek {
  /** The Monday of the week. */
  weekOf: string
  currency: string
  /**
   * False where this page cannot stand behind a figure for the week, and
   * `says` names why. Every money field below is then null.
   */
  priced: boolean
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
  /** The week in plain words. Never a rate, never a code. */
  says: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const hoursWord = (n: number) => `${r2(n)} hour${r2(n) === 1 ? '' : 's'}`

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
  unclassified: number
  withheld: { filed: number; accepted: number } | null
}

/**
 * Every week of the worker's accepted work on one pay line, what payroll
 * pays for it, what has been paid, and what is still owed.
 *
 * `paidOn` answers what has already been paid for a day of a sheet — the
 * payroll book (`paidBook` in lib/payroll-paid), passed in so this stays
 * free of the database.
 *
 * A week the employer cut, that also went over the line, is not priced:
 * which hours come off decides the overtime, that is payroll's decision
 * to make, and a plausible figure here would be a guess at it.
 */
export function owedByWeek(
  sheets: OwedSheet[],
  line: OwedPayLine,
  paidOn: (sheetId: string, day: string) => PaidSoFar | undefined
): OwedWeek[] {
  const tally = new Map<string, WeekTally>()
  const at = (weekOf: string): WeekTally => {
    if (!tally.has(weekOf)) {
      tally.set(weekOf, {
        hours: 0, straight: 0, over: 0, premium: 0, paidHours: 0, paidCents: 0,
        unpaidHours: 0, unpaidOver: 0, twoRates: false, unclassified: 0, withheld: null,
      })
    }
    return tally.get(weekOf)!
  }

  for (const s of sheets) {
    const days = Object.fromEntries(
      Object.entries(s.days ?? {}).map(([d, h]) => [d.slice(0, 10), Number(h) || 0])
    ) as Record<string, number>
    const hasDays = Object.keys(days).length > 0
    const filed = r2(Object.values(days).reduce((n, h) => n + h, 0))

    // The overtime, as payroll prices it: the same call, the same inputs.
    const weeks = hasDays
      ? sheetOvertime({
          days,
          leaveDays: s.leaveDays ?? null,
          afterHours: line.afterHours,
          contractRateCents: line.contractRateCents,
          periods: line.periods,
          method: line.method,
          line: line.wage,
        })
      : []

    const cut = hasDays && s.acceptedHours != null && r2(filed - s.acceptedHours) > 0
    if (cut && weeks.length > 0) {
      // The sheet's own filed and accepted totals, said once on every week
      // it touches — an acceptance records a sheet's total, not a week's.
      const touched = new Set<string>()
      for (const [day, h] of Object.entries(days)) {
        if (h <= 0) continue
        const w = at(weekStart(day))
        touched.add(weekStart(day))
        const paid = paidOn(s.id, day)
        w.paidHours += Math.min(paid?.hours ?? 0, h)
        w.paidCents += (paid?.straightCents ?? 0) + (paid?.premiumCents ?? 0)
      }
      for (const weekOf of touched) {
        const w = at(weekOf)
        const was = w.withheld ?? { filed: 0, accepted: 0 }
        w.withheld = { filed: r2(was.filed + filed), accepted: r2(was.accepted + s.acceptedHours!) }
      }
      continue
    }

    const priced = priceByDay({
      contractRateCents: line.contractRateCents,
      periods: line.periods,
      days,
      hours: s.acceptedHours != null ? s.acceptedHours : hasDays ? null : s.totalHours,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
    })
    const premiums = premiumByDay(weeks)

    for (const d of priced.days) {
      const w = at(weekStart(d.day))
      w.hours += d.hours
      w.straight += d.hours * d.rateCents
      const p = premiums.get(d.day)
      if (p) {
        w.over += p.hours
        w.premium += p.premiumCents
      }
      const paid = paidOn(s.id, d.day)
      w.paidHours += Math.min(paid?.hours ?? 0, d.hours)
      w.paidCents += (paid?.straightCents ?? 0) + (paid?.premiumCents ?? 0)
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

  return [...tally.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekOf, w]): OwedWeek => {
      const paidCents = Math.round(w.paidCents)
      const paidHours = r2(w.paidHours)
      if (w.withheld) {
        return {
          weekOf, currency: line.currency, priced: false,
          hours: null, ordinaryHours: null, overtimeHours: null, premiumCents: null,
          owedCents: null, stillOwedCents: null, unpaidHours: null, unpaidOvertimeHours: null,
          paidCents, paidHours,
          says:
            `You filed ${hoursWord(w.withheld.filed)} and ${employer} accepted ${hoursWord(w.withheld.accepted)}. ` +
            `Which hours come off changes your overtime, so this page shows no figure for this week. ` +
            `${Employer}'s payroll has it.`,
        }
      }

      const hours = r2(w.hours)
      const over = r2(w.over)
      // Straight time rounded once and the premium rounded once, as a
      // payroll run rounds them.
      const straightCents = Math.round(w.straight)
      const premiumCents = Math.round(w.premium)
      const owedCents = straightCents + premiumCents
      const paidTooMuch = paidCents > owedCents

      const parts: string[] = []
      if (over > 0) {
        parts.push(
          `${hoursWord(hours)}: ${r2(hours - over)} ordinary and ${r2(over)} overtime. ` +
            `The ${hoursWord(over)} of overtime earn an extra ${amount(premiumCents, line.currency)} on top of your usual pay.`
        )
        if (w.twoRates) parts.push('You were paid at two rates that week, so the extra is worked out on the average of the two.')
      } else if (w.unclassified > 0) {
        parts.push(
          `${hoursWord(hours)}, ${hoursWord(w.unclassified)} of them over ${line.afterHours} in the week. ` +
            `${Employer} has not recorded whether you are owed overtime, so they are shown at your usual pay. Ask ${employer}.`
        )
      } else {
        parts.push(`${hoursWord(hours)}, none of them overtime.`)
      }
      if (paidTooMuch) parts.push(`More has been paid for this week than this page works out. ${Employer} has the record.`)

      return {
        weekOf, currency: line.currency, priced: true,
        hours,
        ordinaryHours: r2(hours - over),
        overtimeHours: over,
        premiumCents,
        owedCents,
        paidCents,
        paidHours,
        stillOwedCents: Math.max(0, owedCents - paidCents),
        unpaidHours: r2(w.unpaidHours),
        unpaidOvertimeHours: r2(w.unpaidOver),
        says: parts.join(' '),
      }
    })
}
