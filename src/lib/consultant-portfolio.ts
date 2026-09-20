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
