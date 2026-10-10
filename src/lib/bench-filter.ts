/**
 * Filter with rules before you pay a model.
 *
 * The match engine took up to two hundred bench listings, deduplicated
 * them, and sent every one to the model in batches of twenty-five. Eight
 * calls per requirement, with one filter applied beforehand — "not already
 * submitted" — and nothing else.
 *
 * Everything else it needed to know first is arithmetic. Does this person
 * have any of the skills at all. Is their rate floor under the ceiling. Are
 * they free before the start date. Does their work authorization match. All
 * of that is string comparison and date comparison: free, instant, and
 * right every time.
 *
 * On a forty-person bench that is forty scored where fifteen were worth
 * scoring — roughly $53 a month becoming $140, which is the difference
 * between a business at 94% gross margin and one at 70%. On a two-hundred
 * person bench it is thirteen times worse.
 *
 * ── The rule that decides the shape of this file ─────────────────────
 *
 * Use code, not a model, wherever a rule will do. Save the model for the
 * one judgment that actually needs one — is this skill claim evidenced —
 * which is exactly what the match engine is for and exactly what these
 * rules are not.
 *
 * ── Why every drop says why ──────────────────────────────────────────
 *
 * A filter that silently removes people is indistinguishable from a filter
 * that is broken. Every drop carries its reason, the reasons are counted,
 * and the counts go on the screen — so "nobody matched" is answerable
 * without reading code.
 */

import { checkStatedTerms, perHour, ENGAGEMENT_TYPES, type EngagementType } from '@/lib/award/hire-terms'
import { range } from '@/lib/money-display'

/** How many reach the model, unless somebody says otherwise. */
export const DEFAULT_SHORTLIST = 15

/**
 * How long after the start date somebody can still be worth showing.
 *
 * A consultant free two weeks after a role starts is often still placed —
 * start dates slip more often than benches do. Beyond a month they are a
 * different conversation.
 */
const LATE_GRACE_DAYS = 30

export interface Role {
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  startDate: Date | null
  workAuth?: string | null
}

export interface Candidate {
  personId: string
  name: string
  skills: string[]
  location: string | null
  workAuth: string | null
  /** The least they will work for, in cents per hour. */
  rateFloor: number | null
  availableFrom: Date | null
  /** Last time the person themselves confirmed any of this. */
  confirmedAt?: Date | null
}

export interface Kept {
  candidate: Candidate
  /** How many of the role's skills they plainly have. */
  skillHits: number
  /** Ordering hint, not a score. The score is the model's job. */
  rank: number
}

export interface Dropped {
  personId: string
  name: string
  /** One sentence, in words a recruiter would use. */
  because: string
  /** Grouped for counting: SKILLS · RATE · AVAILABILITY · WORK_AUTH · STALE */
  code: string
}

export interface Sifted {
  kept: Kept[]
  dropped: Dropped[]
  considered: number
  /** Said on the screen, so "nobody matched" is answerable. */
  summary: string
}

// ── The rules ─────────────────────────────────────────────────────────

/**
 * Skills, compared the cheap way.
 *
 * Not semantic — that is what the model is for. This only asks whether
 * there is any plain overlap at all, because somebody with none of the
 * named skills is not a borderline call the model needs to make.
 *
 * Substring both ways so "SAP FICO" matches "FICO" and "React" matches
 * "React.js". Crude on purpose: the cost of keeping one extra person is
 * one more row in a batch; the cost of dropping a real match is a
 * placement.
 */
export function skillHits(roleSkills: string[], theirs: string[]): number {
  if (roleSkills.length === 0) return 1 // nothing asked for, nothing to fail

  const mine = theirs.map(norm).filter(Boolean)
  let hits = 0

  for (const want of roleSkills.map(norm).filter(Boolean)) {
    if (mine.some((have) => have.includes(want) || want.includes(have))) hits++
  }
  return hits
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#/.]/g, '')
}

/**
 * Can they work at this rate.
 *
 * Their floor against the role's ceiling, and nothing subtler. A floor
 * above the ceiling is not a negotiation, it is a no — and finding that
 * out from a model costs money to be told what subtraction would have
 * said.
 *
 * Unknown floor stays in. A missing number is not a reason to lose
 * somebody, and half a bench has no rate recorded.
 */
export function rateWorks(role: Role, c: Candidate): boolean {
  if (c.rateFloor == null || role.billMax == null) return true
  return c.rateFloor <= role.billMax
}

/**
 * Are they free in time.
 *
 * Free before the start date, or within a month after it — start dates
 * slip more often than benches do. Unknown availability stays in.
 */
export function freeInTime(role: Role, c: Candidate): boolean {
  if (c.availableFrom == null || role.startDate == null) return true

  const latest = new Date(role.startDate)
  latest.setDate(latest.getDate() + LATE_GRACE_DAYS)
  return c.availableFrom <= latest
}

/**
 * Does the permit match.
 *
 * It no longer decides who is dropped, and that is the point.
 *
 * This used to return false on any mismatch and the caller removed the
 * person from the list without telling anybody. A role saying
 * "US citizens only" therefore erased every lawful permanent resident,
 * asylee, refugee and visa holder from a recruiter's bench, silently,
 * on the strength of a sentence somebody typed into an advert.
 *
 * In the United States that is citizenship-status discrimination under
 * INA §274B unless a law requires the restriction — and nothing here
 * records whether one does. Addendum E's own rule settles what to do
 * without that: BLOCK only where legally grounded, WARN everywhere
 * else. An ungrounded restriction is not grounded, so it warns.
 *
 * The mismatch is not lost. `lib/checks` surfaces it against the person,
 * where a recruiter sees it and decides, instead of never seeing them.
 * When Requirement carries a recorded lawful basis, this becomes a real
 * gate again by consulting `authDecision` — see lib/work-authorisation.
 */
export function authWorks(role: Role, c: Candidate): boolean {
  if (!role.workAuth) return true
  if (!c.workAuth) return true // unknown is not a no
  // Deliberately always true. Kept as a function, and kept called, so
  // the day a basis exists there is one place to change.
  return true
}

/**
 * Has anybody confirmed this record recently.
 *
 * A bench record says somebody is free at $78 and knows Java. That was
 * true three weeks ago; since then they took a contract or raised their
 * rate, and nobody updated it because updating records is nobody's job.
 * Scoring a stale record produces confident nonsense faster than a human
 * could produce it slowly.
 *
 * So an unconfirmed record is not dropped — that would hide the whole
 * bench on day one — it is pushed down the ranking, and the reason is
 * said out loud.
 */
export function staleness(c: Candidate, now: Date): number {
  if (!c.confirmedAt) return 999
  return Math.floor((now.getTime() - c.confirmedAt.getTime()) / 86400000)
}

// ── The sift ──────────────────────────────────────────────────────────

/**
 * Two hundred in, fifteen out, and a reason for every one of the other
 * hundred and eighty-five.
 */
export function sift(
  role: Role,
  candidates: Candidate[],
  opts: { shortlist?: number; now?: Date } = {}
): Sifted {
  const shortlist = opts.shortlist ?? DEFAULT_SHORTLIST
  const now = opts.now ?? new Date()

  const kept: Kept[] = []
  const dropped: Dropped[] = []

  for (const c of candidates) {
    const hits = skillHits(role.skills, c.skills)

    if (hits === 0) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'SKILLS',
        because: `none of ${role.skills.slice(0, 3).join(', ')}`,
      })
      continue
    }

    if (!rateWorks(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'RATE',
        because: `wants $${Math.round((c.rateFloor ?? 0) / 100)}, the job tops out at $${Math.round((role.billMax ?? 0) / 100)}`,
      })
      continue
    }

    if (!freeInTime(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'AVAILABILITY',
        because: `not free until ${c.availableFrom!.toISOString().slice(0, 10)}`,
      })
      continue
    }

    // No `continue` here any more. A work authorization mismatch is a
    // thing to show a recruiter, not a reason to make somebody vanish.
    if (!authWorks(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'WORK_AUTH',
        because: `the job needs ${role.workAuth}, they are ${c.workAuth}`,
      })
      continue
    }

    kept.push({ candidate: c, skillHits: hits, rank: 0 })
  }

  // Order before cutting. More skills first; a fresher record wins a tie,
  // because between two equal people the one who answered a text last week
  // is the one who is actually there.
  kept.sort((a, b) => {
    if (b.skillHits !== a.skillHits) return b.skillHits - a.skillHits
    return staleness(a.candidate, now) - staleness(b.candidate, now)
  })
  kept.forEach((k, i) => (k.rank = i + 1))

  const overflow = kept.slice(shortlist)
  for (const o of overflow) {
    dropped.push({
      personId: o.candidate.personId,
      name: o.candidate.name,
      code: 'SHORTLIST',
      because: `ranked ${o.rank}, and only the top ${shortlist} are scored`,
    })
  }

  const final = kept.slice(0, shortlist)

  return {
    kept: final,
    dropped,
    considered: candidates.length,
    summary: summarize(candidates.length, final.length, dropped),
  }
}

/**
 * Said on the screen.
 *
 * "Nobody matched" is not an answer a recruiter can do anything with. This
 * says what went where, so the next move is obvious — widen the rate, drop
 * a skill, or accept a later start.
 */
export function summarize(considered: number, kept: number, dropped: Dropped[]): string {
  if (considered === 0) return 'Nobody on the bench yet.'

  const counts = new Map<string, number>()
  for (const d of dropped) counts.set(d.code, (counts.get(d.code) ?? 0) + 1)

  const said: string[] = []
  const label: Record<string, string> = {
    SKILLS: 'no overlapping skills',
    RATE: 'priced above the job',
    AVAILABILITY: 'not free in time',
    WORK_AUTH: 'wrong work authorization',
    SHORTLIST: 'ranked below the cut',
  }

  for (const code of ['SKILLS', 'RATE', 'AVAILABILITY', 'WORK_AUTH', 'SHORTLIST']) {
    const n = counts.get(code)
    if (n) said.push(`${n} ${label[code]}`)
  }

  if (kept === 0) {
    return `Nobody fits out of ${considered}: ${said.join(', ')}.`
  }

  return said.length > 0
    ? `${kept} of ${considered} worth scoring — ${said.join(', ')}.`
    : `${kept} of ${considered} worth scoring.`
}

// ── Reading the bench answer — one door ───────────────────────────────

/**
 * What `/api/bench` said, turned into rows.
 *
 * ── The bug this exists to stop coming back ──────────────────────────
 *
 * `/api/bench` answers `{ data: { tiers, totals } }`. Two screens read
 * that answer and each worked out the shape for itself. The bench page
 * read `data.tiers` and flattened it correctly. The training page read
 * `data.listings` — a key the route has never returned in its life — and
 * so received an empty array on every firm that ever existed. It then
 * reported "Bench consultants 0 with skills listed" over a bench of five
 * fully skilled people, and computed a skill gap from that zero.
 *
 * Nobody noticed because the failure was silent and confident. A missing
 * key in JavaScript is `undefined`, `undefined ?? []` is `[]`, and `[]`
 * counts to nought without complaint. So the one page in the product
 * about developing people reported that no consultant anywhere had a
 * skill, for every supplier, and looked like an honest empty state.
 *
 * Two rules follow, and they are why this is a function rather than four
 * lines in each page:
 *
 * **One door.** Every screen that reads the bench reads it here. Two
 * screens on one menu must not disagree about the same firm's bench, and
 * the only way to guarantee that is for them to ask the same code.
 *
 * **An answer that cannot be read is not an answer of zero.** Where the
 * shape is not what this understands, the reading fails and says so, and
 * the screen shows a sentence rather than a number. A plausible wrong
 * number is worse than a blank, because nobody audits good news.
 */
export interface BenchRow {
  /** The listing, which is what the row actually is. */
  listingId: string
  tier: 'RETAINED' | 'MARKETING'
  /** INVITED · GRANTED · DECLINED — whether they agreed to be marketed. */
  consent: string | null
  /**
   * How far the listing reaches — NOBODY · FIRM_ONLY · NETWORK — and the
   * sentence that says so, as the route computed them from the consent
   * and the tier (`whoSees` in lib/shared-consultant). Null where the
   * route did not say, which a screen shows as a blank, never a guess.
   */
  reach: string | null
  reachSays: string | null
  consultantId: string
  personId: string
  name: string
  email: string | null
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  /** Cents per hour. Undefined where the reader may not see cost. */
  rateMin: number | null
  rateMax: number | null
  /** ISO, as the route sent it. Parsed by whoever needs a date. */
  availableFrom: string | null
  /** When they are free, as the route read it off the work (`whenFree`). Null where the route did not say. */
  free: Free | null
  /** The stay they chose on this bench, in a line (`stayRow`). Null for somebody who has not said yes. */
  stay: string | null
  visibility: string
  grantedAt: string
  /** Whose bench this listing lives on — your own firm, or a partner's. */
  companyId: string
  companyName: string
  /** On a partner's bench, why this person is already the reader's (`alreadyOursSays`). Null otherwise. */
  oursSays: string | null
}

export type BenchReading =
  | { ok: true; rows: BenchRow[]; retained: number; marketing: number; why: null }
  /**
   * The shape was not understood. `rows` is empty and must not be read as
   * a count of anything — `why` is what goes on the screen instead.
   */
  | { ok: false; rows: []; retained: null; marketing: null; why: string }

function unreadable(why: string): BenchReading {
  return { ok: false, rows: [], retained: null, marketing: null, why }
}

/** Every value we accept for a tier, so a new tier fails loudly rather than vanishing. */
const TIERS = ['RETAINED', 'MARKETING'] as const

export function readBench(payload: unknown): BenchReading {
  if (payload == null || typeof payload !== 'object') {
    return unreadable('The bench did not answer. Nothing is counted here rather than counted as nothing.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (payload as any).data
  if (data == null || typeof data !== 'object') {
    return unreadable('The bench answered without a body this page understands, so no count is shown.')
  }

  const tiers = data.tiers
  if (tiers == null || typeof tiers !== 'object' || Array.isArray(tiers)) {
    return unreadable(
      'The bench answered in a shape this page does not understand — it expects the ' +
        'listings grouped by tier. No number is shown, because a zero here would be invented.'
    )
  }

  const rows: BenchRow[] = []
  let unreadableRows = 0

  for (const tier of Object.keys(tiers)) {
    const listings = tiers[tier]
    if (listings == null) continue
    if (!Array.isArray(listings)) {
      return unreadable(`The bench answered with a "${tier}" group that is not a list of people, so nothing is counted.`)
    }
    if (!(TIERS as readonly string[]).includes(tier)) {
      return unreadable(
        `The bench answered with a tier this page has never heard of ("${tier}"). ` +
          'It is not counted and it is not ignored — somebody has to decide what it means.'
      )
    }

    for (const l of listings) {
      const person = l?.consultant?.person
      if (!l?.id || !l?.consultant?.id || !person?.id || typeof person?.name !== 'string') {
        unreadableRows++
        continue
      }
      rows.push({
        listingId: String(l.id),
        tier: tier as 'RETAINED' | 'MARKETING',
        consent: typeof l.consent === 'string' ? l.consent : null,
        reach: typeof l.reach === 'string' ? l.reach : null,
        reachSays: typeof l.reachSays === 'string' ? l.reachSays : null,
        consultantId: String(l.consultant.id),
        personId: String(person.id),
        name: person.name,
        email: typeof person.email === 'string' ? person.email : null,
        headline: l.consultant.headline ?? null,
        skills: Array.isArray(l.consultant.skills) ? l.consultant.skills.filter((s: unknown) => typeof s === 'string') : [],
        location: l.consultant.location ?? null,
        workAuth: l.consultant.workAuth ?? null,
        rateMin: typeof l.rateMin === 'number' ? l.rateMin : null,
        rateMax: typeof l.rateMax === 'number' ? l.rateMax : null,
        availableFrom: l.consultant.availableFrom ?? null,
        free:
          l.free && typeof l.free === 'object' && typeof l.free.state === 'string' && typeof l.free.says === 'string'
            ? { state: l.free.state, on: typeof l.free.on === 'string' ? l.free.on : null, says: l.free.says }
            : null,
        stay: typeof l.stay === 'string' ? l.stay : null,
        visibility: typeof l.consultant.visibility === 'string' ? l.consultant.visibility : 'INTERNAL',
        grantedAt: typeof l.grantedAt === 'string' ? l.grantedAt : '',
        companyId: String(l.company?.id ?? ''),
        companyName: String(l.company?.name ?? ''),
        oursSays: typeof l.oursSays === 'string' ? l.oursSays : null,
      })
    }
  }

  // A reader that silently drops people is indistinguishable from a
  // broken one — the rule this whole file is built on. So a row that
  // cannot be read fails the whole reading rather than shortening it,
  // because a bench of five showing four is the bug nobody reports.
  if (unreadableRows > 0) {
    return unreadable(
      `The bench answered with ${unreadableRows} ` +
        `${unreadableRows === 1 ? 'row' : 'rows'} this page could not read, so no count is shown. ` +
        'A short list read as a whole one is worse than no list.'
    )
  }

  return {
    ok: true,
    rows,
    retained: rows.filter((r) => r.tier === 'RETAINED').length,
    marketing: rows.filter((r) => r.tier === 'MARKETING').length,
    why: null,
  }
}

/**
 * Where the bench's Submit takes the reader, for the people chosen.
 *
 * It opened the submit form and dropped who was chosen, so a recruiter
 * ticked somebody on the bench and then had to find them again in a
 * picker. The form takes one person (`/dashboard/submissions?new=1&person=`),
 * so one person goes through by id.
 *
 * More than one is refused in a sentence rather than opened with the
 * first and the rest silently lost: a recruiter who ticked three and
 * submitted one would believe all three went. Nobody is sent forward
 * who has not agreed to be marketed by this firm — said here, before
 * the form, rather than as a refusal after it.
 */
export function submitLink(
  chosen: { personId: string; name: string; consent?: string | null }[]
): { ok: true; href: string } | { ok: false; says: string } {
  if (chosen.length === 0) {
    return { ok: false, says: 'Choose the person to put forward first.' }
  }
  if (chosen.length > 1) {
    return {
      ok: false,
      says:
        `You chose ${chosen.length} people. A submission is one person to one job, so put them forward ` +
        'one at a time: choose one and press Submit.',
    }
  }
  const [p] = chosen
  if (p.consent && p.consent !== 'GRANTED') {
    return {
      ok: false,
      says:
        p.consent === 'DECLINED'
          ? `${p.name} declined to be marketed by you, so they cannot be put forward.`
          : `${p.name} has not answered your invitation yet. Nobody is put forward until they say yes.`,
    }
  }
  return { ok: true, href: `/dashboard/submissions?new=1&person=${encodeURIComponent(p.personId)}` }
}

/** Said on Bench where the seat does not read pay, in place of what the bench costs. */
export const BURN_READ_BY = 'What the bench costs is read by the desks that read pay'

/**
 * What an "Add to application" sends, from what the screen shows and what
 * the person typed — two figures where the person comes through a
 * supplier, because putting a supplier's person forward is two prices:
 * what the supplier charges you (from its listing, where it said) and
 * what you bill. Dollars an hour in, cents out, as `Submission.rate` is.
 * Refused in a sentence rather than sent to a door that would refuse it.
 */
export function submitFields(
  action: { rate: number | null; payRate: number | null; offeredBy: string | null },
  typed: { bill?: string | null; pay?: string | null },
  names: { person: string; firm: string }
): { ok: true; rate: number; payRate: number | null } | { ok: false; says: string } {
  const read = (t: string | null | undefined, fallback: number | null) => {
    if (t != null && t.trim() !== '') {
      const n = Number(t)
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN
    }
    return fallback
  }
  const rate = read(typed.bill, action.rate)
  if (rate == null || Number.isNaN(rate)) {
    return { ok: false, says: `Say the hourly rate you bill for ${names.person}.` }
  }
  if (!action.offeredBy) return { ok: true, rate, payRate: null }
  const payRate = read(typed.pay, action.payRate)
  if (payRate == null || Number.isNaN(payRate)) {
    return { ok: false, says: `Say what ${names.firm} charges you an hour for ${names.person}. Its listing does not say.` }
  }
  return { ok: true, rate, payRate }
}

/**
 * What an edit of a person's record sends from the consultant page: the
 * skills, the day they are free and, for a desk that reads pay, the
 * lowest rate they take. Dollars an hour in, cents out; a blank free
 * date clears it, a blank skills box is none. The rate floor is a pay
 * figure, so a desk that does not read pay cannot send one — refused in a
 * sentence rather than sent to a door that refuses it.
 */
export function profileEditBody(
  typed: { skills: string; availableFrom: string; rateFloor: string },
  mayRate: boolean
): { ok: true; body: { skills: string[]; availableFrom: string | null; rateFloor?: number | null } } | { ok: false; says: string } {
  const skills = [...new Set(typed.skills.split(',').map((x) => x.trim()).filter(Boolean))]
  const day = typed.availableFrom.trim()
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, says: 'Say the free date as a day on the calendar.' }
  const body: { skills: string[]; availableFrom: string | null; rateFloor?: number | null } = { skills, availableFrom: day || null }
  const rate = typed.rateFloor.trim()
  if (rate) {
    if (!mayRate) return { ok: false, says: 'The lowest rate somebody takes is pay, set by the desks that read pay or by the person.' }
    const n = Number(rate)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, says: 'Say the lowest hourly rate as a number of dollars.' }
    body.rateFloor = Math.round(n * 100)
  } else if (mayRate) {
    body.rateFloor = null
  }
  return { ok: true, body }
}

/**
 * The word a person reads for a value the database holds. A screen never
 * prints an enum (CLAUDE.md, "Explain in a sentence, not a code"); an
 * unknown value is spelled out in lower case rather than shouted.
 */
const WORDS: Record<string, string> = {
  // Bench tiers — the firm's choice of how far a listing reaches.
  RETAINED: 'Kept to us', MARKETING: 'Shown to our partners', // the same pair as TIER_WORD below
  // Submission kinds — who holds the person.
  BENCH: 'Our bench', NETWORK: "A partner's bench", INTERNAL: 'Our employee', CONSENT: 'Asked them first',
  // Profile visibility.
  INTERNAL_ONLY: 'Inside the firm', FEED: 'On their own page', CLIENT_VISIBLE: 'Clients may see', VERIFIED: 'Checked by a firm',
  // Listing consent.
  INVITED: 'Asked, not answered', GRANTED: 'Said yes', DECLINED: 'Said no',
}

export function wordFor(value: string | null | undefined): string {
  if (!value) return 'Not set'
  const w = WORDS[value]
  if (w) return w
  const plain = value.toLowerCase().replace(/_/g, ' ')
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

// ── Who is free — one door for every bench page ───────────────────────

/** A line of work on the record for this person, at any firm. */
export interface FreeLine {
  startsOn: Date | null
  endsOn: Date | null
  /** Papered or running: PENDING_VERIFICATION · VERIFIED · IN_PROGRESS · PAUSED. ENDED and CANCELLED are not passed. */
  state: string
}

export type FreeState = 'NOW' | 'FROM' | 'PLACED' | 'UNKNOWN'

export interface Free {
  state: FreeState
  /** The first day they can start elsewhere, as YYYY-MM-DD. Null where nothing says. */
  on: string | null
  /** The word for the row: "Free now", "Free from Nov 15, 2026", "On a placement until Oct 26, 2026". */
  says: string
}

/** The states of a line that is papered or running — the ones that make somebody not free. */
export const LIVE_STATES: readonly string[] = ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED']

const DAY_MS_FREE = 86_400_000
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const isoOf = (d: Date) => midnight(d).toISOString().slice(0, 10)
const dayAfter = (d: Date) => new Date(midnight(d).getTime() + DAY_MS_FREE)
const shortDay = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/**
 * When somebody on a bench is free, read off the work.
 *
 * The bench rows, the matches and the training funnel each read a free
 * date of their own — the profile's `availableFrom`, which nobody keeps —
 * while Bench profit read the contracts. So one page said "Available
 * Unknown, Available now 0" over three people another page said were on
 * the bench today, and two people placed at a client read as marketed
 * and free (bench tester, 2026-10-01). This is the one answer:
 *
 *   on a placement now       not free; free from the day after it ends,
 *                            or "no end date on record"
 *   a placement papered      not free; it starts on its day
 *   nothing running          free from the later of their own free date
 *                            and the day after their last placement; free
 *                            now where that day has come, or where they
 *                            are on a bench they agreed to and nothing on
 *                            the record says otherwise
 *   nothing at all           unknown, and never called free
 *
 * Pure. The caller passes every papered or running line for the person
 * — at any firm, because a person placed through somebody else is not
 * free either — and never their ended ones beyond the latest end.
 */
export function whenFree(input: {
  lines: FreeLine[]
  /** The last day of the latest placement that has ended, if any. */
  lastEnded?: Date | null
  /** The day they say they are free from, on their own profile. */
  availableFrom: Date | null
  /** The day they agreed to be on this bench. Null where they have not. */
  onBenchSince: Date | null
  now: Date
}): Free {
  const today = midnight(input.now)
  const papered = (l: FreeLine) => LIVE_STATES.includes(l.state)
  const running = input.lines.filter(
    (l) =>
      papered(l) &&
      (l.startsOn == null || midnight(l.startsOn) <= today) &&
      (l.endsOn == null || midnight(l.endsOn) >= today)
  )
  if (running.length > 0) {
    if (running.some((l) => l.endsOn == null)) {
      return { state: 'PLACED', on: null, says: 'On a placement with no end date on record' }
    }
    const last = running.reduce((a, l) => (l.endsOn! > a ? l.endsOn! : a), running[0].endsOn!)
    return { state: 'PLACED', on: isoOf(dayAfter(last)), says: `On a placement until ${shortDay(last)}` }
  }
  const next = input.lines
    .filter((l) => papered(l) && l.startsOn != null && midnight(l.startsOn) > today)
    .sort((a, b) => a.startsOn!.getTime() - b.startsOn!.getTime())[0]
  if (next) {
    return { state: 'PLACED', on: null, says: `Starts a placement on ${shortDay(next.startsOn!)}` }
  }

  const candidates: Date[] = []
  if (input.availableFrom) candidates.push(midnight(input.availableFrom))
  if (input.lastEnded) candidates.push(dayAfter(input.lastEnded))
  if (candidates.length === 0) {
    return input.onBenchSince
      ? { state: 'NOW', on: isoOf(today), says: 'Free now' }
      : { state: 'UNKNOWN', on: null, says: 'Free date not on record' }
  }
  const from = new Date(Math.max(...candidates.map((d) => d.getTime())))
  if (from <= today) return { state: 'NOW', on: isoOf(today), says: 'Free now' }
  return { state: 'FROM', on: isoOf(from), says: `Free from ${shortDay(from)}` }
}

// ── What a row says under a person's name ─────────────────────────────

/**
 * The line under a person's name on a bench.
 *
 * Their headline where they have one. Where they do not, their own
 * firm's bench may show the email it holds for them — they are its
 * people — but a partner's bench never does: an address on a partner's
 * row is a way to go round the firm that marketed them (bench tester,
 * 2026-10-01). Their skills stand in, or a plain "No headline yet".
 */
export function benchSubtitle(row: { headline: string | null; email: string | null; skills: string[] }, ownBench: boolean): string {
  if (row.headline && row.headline.trim()) return row.headline
  if (ownBench && row.email) return row.email
  if (row.skills.length > 0) return row.skills.slice(0, 3).join(' · ')
  return 'No headline yet'
}

// ── Who may open a bench ──────────────────────────────────────────────

/**
 * Whether this seat may browse a bench at all.
 *
 * A client never does. CLAUDE.md, "How bench reaches a job": bench comes
 * to a client through matching on its own job request, and never as a
 * page of named people with rates. Only the client's own payroll — its
 * own staff, which the document desks read — stays open to it.
 */
export function mayBrowseBench(
  r: {
    companyKind: string | null
    scope: string
    /**
     * Whether this seat can open a job request and so press Find matches.
     * A client's seat with no desk cannot, and an instruction it cannot
     * follow is not an answer (sign-up walk round six, 14). Left out, the
     * route's own refusal is unchanged: it is read by whoever asked.
     */
    opensJobRequests?: boolean
    companyName?: string | null
  }
): { ok: true } | { ok: false; code: 'CLIENT'; says: string } {
  if (r.companyKind === 'CLIENT' && r.scope !== 'payroll' && r.scope !== 'mine') {
    if (r.opensJobRequests === false) {
      return {
        ok: false,
        code: 'CLIENT',
        says:
          'A bench is a supplier’s own people, and a client does not browse one. Bench reaches ' +
          `${r.companyName ?? 'your company'} through matching on its job requests, and job requests are not part ` +
          'of your seat. Ask your company’s owner if you need them.',
      }
    }
    return {
      ok: false,
      code: 'CLIENT',
      says:
        'A bench is a supplier’s own people, and a client does not browse one. People reach your job ' +
        'requests through matching, from your suppliers first — open a job request and press Find matches.',
    }
  }
  return { ok: true }
}

/**
 * What a company's page answers somebody signed in at no company — a
 * candidate who signed up on her own and is on nobody's bench. Never a
 * system phrase ("Active context must be associated with a company") and
 * never a firm she does not have ("the bench at your firm"): whose page it
 * is, and where her own work is (sign-up walk round six, 9).
 */
export function notAtACompany(thing: string): string {
  return `This is a company’s ${thing}, and you are not signed in at a company. Your own work is under Your work.`
}

/**
 * What a bench answers a seat that does not read people, in a sentence.
 * With no firm at all, the no-company sentence: there is no "bench at
 * your firm" to be refused.
 */
export function benchClosedSays(firm: string | null | undefined): string {
  if (!firm) return notAtACompany('bench')
  return (
    `The bench at ${firm} is read by the desks that work with consultants — the recruiters, the resource ` +
    'manager, HR and the owner. Your seat is not one of them. Ask whoever manages roles there.'
  )
}

/**
 * The one sentence the Bench page draws alone, or null where the page is
 * the reader's to see. A refused page is its sentence and nothing above it
 * — no "Bench" heading and no "People who granted you a listing" over a
 * seat that may not open it (sign-up walk round seven, 6: Sam, a desk-less
 * Member at a supplier, and Karthik, a worker at an integrator, both read
 * the page's own prose above the refusal).
 *
 * Nothing is decided while the session is still loading, so a seat that
 * will be let in is never refused for the second before it is known.
 */
export function benchPageClosed(r: {
  loading: boolean
  /** Null for somebody signed in at no company. */
  company: { name: string } | null
  client: { ok: true } | { ok: false; says: string }
  readsBench: boolean
  readsProfit: boolean
}): string | null {
  if (r.loading) return null
  if (r.company == null) return benchClosedSays(null)
  if (!r.client.ok) return r.client.says
  if (!r.readsBench && !r.readsProfit) return benchClosedSays(r.company.name)
  return null
}

// ── The tier, in one set of words ─────────────────────────────────────

/**
 * The firm's two choices for a listing, named once. The Consultants page
 * said "Kept to us" and "Shown to our partners" while Bench said
 * "Retained" and "Marketing" for the same two things (bench tester,
 * 2026-10-01). These are the words, everywhere; `wordFor` reads them.
 */
export const TIER_WORD = { RETAINED: 'Kept to us', MARKETING: 'Shown to our partners' } as const

// ── What adding a consultant says ─────────────────────────────────────

/**
 * The sentence after a firm adds somebody. Adding them also asks them to
 * join the firm's bench — a consultant a firm adds is marketed by
 * default, and nothing reaches past the firm until they say yes — so the
 * sentence says the invitation went, where it went, and what follows.
 */
export function addedSays(f: { name: string; firm: string; tier: 'RETAINED' | 'MARKETING'; emailed: boolean }): string {
  const asked = f.emailed
    ? `${f.firm} has emailed them to ask if they will join its bench.`
    : `${f.firm} will ask them to join its bench; no email address is on record to send the ask, so copy the link from Bench.`
  const reach =
    f.tier === 'MARKETING'
      ? 'Once they say yes they are shown to your partners.'
      : 'Once they say yes they are kept to you, shown to no partner.'
  return `${f.name} is added. ${asked} ${reach} Nobody is put forward until they say yes.`
}

/**
 * The add form's own words for the two choices. "Shown to our partners"
 * on its own read as though partners saw the person the moment they were
 * saved, and nothing reaches a partner until the person says yes (outside
 * review, 2026-10-05). The bench keeps TIER_WORD, because a listing there
 * already carries its answer beside it.
 */
export const ADD_TIER_OPTION = {
  MARKETING: 'Shown to our partners once they say yes',
  RETAINED: 'Kept to us',
} as const

/**
 * The sentence above the one button. Saving the form also emails the
 * person, so the button must not be the first place that is said.
 */
export function savingSays(name: string): string {
  const who = name.trim() || 'this person'
  return `Saving emails ${who} to ask if they will join your bench. Nobody outside your firm sees them, and nobody puts them forward, until they say yes.`
}

/**
 * Skills typed into the tag field. A comma or Enter ends a skill, so a
 * pasted "SAP BRIM, ABAP" becomes two. Blank pieces are dropped, and a
 * skill already there in any case is not added twice; the first spelling
 * stays. The field submits the same array the comma text did.
 */
export function addSkillTags(current: readonly string[], typed: string): string[] {
  const out = [...current]
  const seen = new Set(current.map((s) => s.toLowerCase()))
  for (const piece of typed.split(',')) {
    const skill = piece.trim().replace(/\s+/g, ' ')
    if (!skill || seen.has(skill.toLowerCase())) continue
    seen.add(skill.toLowerCase())
    out.push(skill)
  }
  return out
}

/**
 * A rate range for a listing, dollars an hour in, cents out, checked
 * against the person's own floor. Blank is no rate.
 */
export function listingRates(
  typed: { min: string; max: string },
  floorCents: number | null
): { ok: true; rateMin: number | null; rateMax: number | null } | { ok: false; says: string } {
  const read = (t: string) => {
    if (!t.trim()) return null
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN
  }
  const rateMin = read(typed.min)
  const rateMax = read(typed.max)
  if (Number.isNaN(rateMin) || Number.isNaN(rateMax)) return { ok: false, says: 'Say each rate as a number of dollars an hour.' }
  if (rateMin != null && rateMax != null && rateMin > rateMax) return { ok: false, says: 'The lowest rate is above the highest. Swap them.' }
  if (floorCents != null && rateMax != null && rateMax < floorCents) {
    return { ok: false, says: `The highest rate is under the $${(floorCents / 100).toFixed(2)} an hour they said they take at the least.` }
  }
  return { ok: true, rateMin, rateMax }
}

// ── Terms stated at listing (2026-10-06) ──────────────────────────────
//
// A listing is consent to be marketed, never consent to be employed
// (lib/award/hire-terms). So a firm that already knows how it would
// engage somebody, and at what pay, may say so when it lists them — and
// the person reads it beside the yes. Optional on purpose: a listing
// with nothing said about pay is still a listing, and the placement then
// waits on the terms page as before.
//
// Checked through demand's `checkStatedTerms` and nothing of our own, so
// the listing door and the terms page refuse the same things in the same
// sentence: no $0 rate, one of the engagement types, and never "employed
// by another firm" — that firm puts them forward itself.
//
// What the person agrees is what they were shown. A yes carries the
// terms the page printed, and if the firm changed them in between the
// yes agrees nothing and asks them to read again. A yes to a listing
// with no terms agrees only the marketing.


/** The five columns a listing carries for its terms. Null is "nobody said". */
export interface ListingTermsFields {
  termsEngagementType: string | null
  termsPayRateCents: number | null
  termsStatedAt: Date | null
  termsStatedById: string | null
  termsAgreedAt: Date | null
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/**
 * What a firm typed about pay when it listed somebody, as the columns to
 * write. Nothing typed writes all five as null — including on a listing
 * asked again after it was taken back, where an old agreement must not
 * survive the person's withdrawal.
 */
export function listingTermsFrom(
  typed: { engagementType: unknown; payRateCents: unknown },
  who: {
    personName: string
    firmName: string
    ownCompany: { id: string; name: string } | null
    statedById: string
    now: Date
  }
):
  | { ok: true; fields: ListingTermsFields; says: string | null }
  | { ok: false; code: string; says: string; field: 'termsEngagementType' | 'termsPayRateCents' } {
  const none: ListingTermsFields = {
    termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null, termsStatedById: null, termsAgreedAt: null,
  }
  if (blank(typed.engagementType) && blank(typed.payRateCents)) return { ok: true, fields: none, says: null }

  const rate = typeof typed.payRateCents === 'number' ? typed.payRateCents : Number(typed.payRateCents)
  const verdict = checkStatedTerms({
    engagementType: blank(typed.engagementType) ? null : String(typed.engagementType),
    payRateCents: Number.isFinite(rate) ? rate : null,
    personName: who.personName,
    firmName: who.firmName,
    ownCompany: who.ownCompany,
  })
  if (!verdict.ok) {
    return {
      ok: false,
      code: verdict.code,
      says: verdict.says,
      field: verdict.code === 'NO_RATE' ? 'termsPayRateCents' : 'termsEngagementType',
    }
  }
  return {
    ok: true,
    fields: {
      termsEngagementType: verdict.engagementType,
      termsPayRateCents: verdict.payRateCents,
      termsStatedAt: who.now,
      termsStatedById: who.statedById,
      // Never agreed by the firm saying so. Only the person's own yes.
      termsAgreedAt: null,
    },
    says: `${verdict.says} ${who.personName} sees these terms when they are asked, and agrees them only by saying yes.`,
  }
}

/** How each engagement reads to the person it is about. */
const TO_THE_PERSON: Record<Exclude<EngagementType, 'OTHER_EMPLOYER'>, string> = {
  W2: 'as its employee (W2)',
  IND_1099: 'as an independent contractor (1099)',
  OWN_COMPANY: 'through your own company',
}

export interface TermsShown {
  engagementType: EngagementType
  payRateCents: number
  /** "$90/hr" */
  rate: string
  /** "as its employee (W2)" */
  words: string
  agreed: boolean
  says: string
}

/**
 * The stated terms as the person reads them, or null where nothing was
 * stated — or where what is on the row is not something the listing door
 * would have written, which is shown as nothing rather than guessed at.
 */
export function termsShown(
  l: { termsEngagementType: string | null; termsPayRateCents: number | null; termsAgreedAt: Date | null },
  firmName: string
): TermsShown | null {
  const type = l.termsEngagementType as EngagementType | null
  if (!type || !ENGAGEMENT_TYPES.includes(type) || type === 'OTHER_EMPLOYER') return null
  const rate = perHour(l.termsPayRateCents)
  if (!rate) return null
  const words = TO_THE_PERSON[type]
  const agreed = l.termsAgreedAt != null
  return {
    engagementType: type,
    payRateCents: l.termsPayRateCents!,
    rate,
    words,
    agreed,
    says: agreed
      ? `You agreed: ${firmName} pays you ${rate}, ${words}, when it places you.`
      : `${firmName} says it would pay you ${rate}, ${words}, when it places you.`,
  }
}

/**
 * What a yes agrees about pay.
 *
 * `seen` is the terms the person's page printed beside the button. Where
 * the firm stated terms, the yes agrees them only if they are the ones
 * shown; otherwise it is refused, so nobody agrees a figure they never
 * read. Where nothing was stated, the yes agrees only the marketing.
 */
export function agreeingTerms(
  l: { termsEngagementType: string | null; termsPayRateCents: number | null; termsAgreedAt: Date | null },
  seen: unknown,
  firmName: string,
  now: Date
):
  | { ok: true; data: { termsAgreedAt: Date } | Record<string, never>; agreed: boolean; says: string }
  | { ok: false; says: string } {
  const stated = termsShown(l, firmName)
  if (!stated) {
    return {
      ok: true,
      data: {},
      agreed: false,
      says: `${firmName} has not said what it would pay you, so this yes lets it market you and agrees no pay.`,
    }
  }
  if (stated.agreed) return { ok: true, data: {}, agreed: true, says: stated.says }
  const s = (seen ?? null) as { engagementType?: unknown; payRateCents?: unknown } | null
  const same =
    s != null &&
    String(s.engagementType ?? '').toUpperCase() === stated.engagementType &&
    Math.round(Number(s.payRateCents)) === stated.payRateCents
  if (!same) {
    return {
      ok: false,
      says: `${stated.says} Read these terms, then say yes again — your yes agrees them.`,
    }
  }
  return {
    ok: true,
    data: { termsAgreedAt: now },
    agreed: true,
    says: `You agreed: ${firmName} pays you ${stated.rate}, ${stated.words}, when it places you.`,
  }
}

// ── A partner's person who is already ours (bench tester, 2026-10-03) ──

/**
 * What a partner's row says instead of "Ask to represent" when the person
 * is already the reader's.
 *
 * Sundara read Tobias Wren and Noor Abernathy on Partner bench — Pellwright
 * markets them — with "Ask to represent" beside each, while both were on a
 * placement Sundara itself sells. Asking a person the reader already buys
 * through a partner to be represented directly is going round that partner,
 * and asking somebody already on the reader's own bench asks twice. So the
 * row says which it is, and offers nothing. Null means neither: the ask
 * stands.
 */
export function alreadyOursSays(f: { ownListing: boolean; placedByUs: boolean }): string | null {
  if (f.placedByUs) return 'On a placement through you'
  if (f.ownListing) return 'Already on your bench'
  return null
}

// ── What we need (BenchWant, 2026-10-06) ──────────────────────────────
//
// CLAUDE.md, "The bench is the difference": what a firm asks its partners
// to offer — skills, places, rate range and the desk that receives — is
// "What we need", shown at the top of Partner bench. Read by firms that
// already trade with it, one rung at a time, and never by a client: a
// client does not browse a bench, and so has no bench to ask for.

/** What one ask carries once the door has read it. */
export interface WantFields {
  skills: string[]
  places: string[]
  rateMinCents: number | null
  rateMaxCents: number | null
  receivingRoleId: string | null
  receivingPersonId: string | null
}

/**
 * Read an ask from what a screen sent, and refuse it in a sentence.
 *
 * Skills are required — an ask for "anybody" is not an ask. Places may be
 * empty, which reads as "anywhere". The rate is cents an hour, as every
 * rate on the record is; the screen converts dollars with `listingRates`.
 * At most one receiving desk: a role, or a named person, or neither.
 */
export function readWant(body: unknown): { ok: true; want: WantFields } | { ok: false; says: string; field: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const list = (v: unknown): string[] => {
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
    return addSkillTags([], raw.map((x) => String(x)).join(','))
  }
  const skills = list(b.skills)
  if (skills.length === 0) return { ok: false, field: 'skills', says: 'Name at least one skill you need.' }
  if (skills.length > 20) return { ok: false, field: 'skills', says: 'Name twenty skills at most. Split a longer list into two asks.' }
  // A place is "Wichita, KS", so places never split on a comma: a list
  // arrives as an array, or typed with semicolons between them.
  const places = (Array.isArray(b.places) ? b.places.map((x) => String(x)) : typeof b.places === 'string' ? b.places.split(';') : [])
    .map((x) => x.trim().replace(/\s+/g, ' '))
    .filter((x, i, all) => x && all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
  const cents = (v: unknown): number | null | 'BAD' => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isInteger(n) && n > 0 ? n : 'BAD'
  }
  const rateMinCents = cents(b.rateMinCents)
  const rateMaxCents = cents(b.rateMaxCents)
  if (rateMinCents === 'BAD' || rateMaxCents === 'BAD') {
    return { ok: false, field: 'rate', says: 'Say each rate as a number of dollars an hour.' }
  }
  if (rateMinCents != null && rateMaxCents != null && rateMinCents > rateMaxCents) {
    return { ok: false, field: 'rate', says: 'The lowest rate is above the highest. Swap them.' }
  }
  const id = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const receivingRoleId = id(b.receivingRoleId)
  const receivingPersonId = id(b.receivingPersonId)
  if (receivingRoleId && receivingPersonId) {
    return { ok: false, field: 'desk', says: 'Choose one desk to receive offers: a role or a person, not both.' }
  }
  return { ok: true, want: { skills, places, rateMinCents, rateMaxCents, receivingRoleId, receivingPersonId } }
}

/**
 * One ask in a line, the same for the firm that wrote it and the partner
 * reading it: "Process validation, Cleaning validation · Wichita, KS or
 * Remote · $90–$120/hr · offers go to the Recruiter desk".
 */
export function wantSays(w: {
  skills: string[]
  places: string[]
  rateMinCents: number | null
  rateMaxCents: number | null
  currency?: string
  roleName: string | null
  personName: string | null
}): string {
  const where = w.places.length === 0 ? 'any place' : w.places.length === 1 ? w.places[0] : `${w.places.slice(0, -1).join(', ')} or ${w.places[w.places.length - 1]}`
  const pay = w.rateMinCents == null && w.rateMaxCents == null ? 'rate not said' : range(w.rateMinCents, w.rateMaxCents, w.currency ?? 'USD')
  const desk = w.personName ? `offers go to ${w.personName}` : w.roleName ? `offers go to the ${w.roleName} desk` : 'offers go to whoever reads Partner bench'
  return `${w.skills.join(', ')} · ${where} · ${pay} · ${desk}`
}

/**
 * Who may write an ask. A client never — it has no bench to fill, and
 * people reach its job requests through matching. At a firm, the desks that
 * change the bench: the recruiters, the resource manager, HR and the owner.
 */
export function mayWriteWant(r: { companyKind: string | null; writesPeople: boolean }): { ok: true } | { ok: false; says: string } {
  if (r.companyKind === 'CLIENT') {
    return {
      ok: false,
      says: 'A client does not ask partners for bench. People reach your job requests through matching, from your suppliers first.',
    }
  }
  if (!r.writesPeople) {
    return {
      ok: false,
      says: 'What your firm asks its partners for is written by the desks that run the bench — the recruiters, the resource manager, HR and the owner. Ask one of them.',
    }
  }
  return { ok: true }
}
