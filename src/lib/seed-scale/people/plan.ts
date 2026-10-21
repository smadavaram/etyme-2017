/**
 * The generated world's people, decided without the database.
 *
 * Two thousand people (`SCALE.people`), drawn to `CAREER_MIX`: freshers
 * a bench firm has just trained, engineers ten years in and between
 * projects, people who left a bench for a one-person company of their
 * own, people looking while still employed, people on a live placement
 * today, and the rest who were asked onto a bench and did not say yes,
 * said no, or let their stay run out. Four hundred of them
 * (`GSI_STAFF`) are the integrators' own W2 staff: an employee seat and
 * a profile, no listing, because the employment is the consent.
 *
 * Pure and deterministic: the same frame and the same birthday give the
 * same people, ids, names, lines and rates, so `papers` and `jobs` read
 * them before any row exists and a second seeding finds every row by
 * its id.
 *
 * The rules this file keeps, each a sentence in
 * `__tests__/invariants/seed-scale-people.test.ts`:
 *
 *   · the mix is CAREER_MIX of SCALE.people, and GSI_STAFF of them are integrators' staff
 *   · every skill on a person comes from the closed vocabulary
 *   · a listing is the person's own yes, for a stay from the allowed list or until cancelled,
 *     at their own firm or a firm their firm already trades with
 *   · every line's pay is at or under its bill, from money's `pairFor`
 *   · at most NEAR_TIME_LIMIT_SHARE of people sit within two months of a client's time limit,
 *     and some do, so the time limit is exercised
 *   · every line runs through firms that trade with each other on the register
 */

import { day } from '@/lib/seed-days'
import { daysFor } from '@/lib/tenure-days'
import { STAY_CHOICES } from '@/lib/bench-stay'
import { EARLIEST_DAY, timeLimitMonths } from '../frame'
import { industry, skillsOf } from '../industries'
import { NameBook, between, emailFor, idFor, keyed, pick, weighted } from '../kit'
import { floorFor, listingRate, pairFor } from '../rates/pure'
import {
  CAREER_MIX, GSI_STAFF, SCALE,
  type Band, type Career, type IndustryKey, type PersonFacts, type RatePair, type RoleTemplate,
  type ScaleFirm, type ScaleFrame, type WorkAuth,
} from '../types'

// ── The shapes ────────────────────────────────────────────────────────

/** One line in a person's history or today: a chain of firms down to the person, at one client. */
export interface LinePlan {
  /** The stable key every id of this line is derived from. */
  key: string
  clientId: string
  /** Firm ids, top first: chain[0] sells to the client, chain[last] employs the person. */
  chain: string[]
  start: Date
  /** The last day on site, counted. */
  end: Date
  live: boolean
  /** Per rung, from money's `pairFor`: what the rung bills above it and pays below it. */
  rates: RatePair[]
  /** The role this line was for, which may be in a second industry. */
  role: RoleTemplate
  industry: IndustryKey
  /** The client's own site the work is done at, where the person sits in that site's country. */
  workLocationId: string | null
  /** The bottom of the chain is the person's own one-person company: paid corp-to-corp, no pay line under it. */
  ownCompany: boolean
  /** An integrator's manager has flagged this person coming off this line. */
  release: { releasedById: string; rollsOffOn: Date; confirmed: boolean } | null
}

export interface ListingPlan {
  firmId: string
  tier: 'MARKETING' | 'RETAINED'
  state: 'GRANTED' | 'INVITED' | 'DECLINED'
  invitedAt: Date
  respondedAt: Date | null
  grantedAt: Date
  /** Taken back by the person, or ended by the clock (then `lapsed`). */
  revokedAt: Date | null
  lapsed: boolean
  stayDays: number | null
  askFirst: boolean
  showInMatches: boolean
  declinedNote: string | null
  rate: Band
}

export interface PersonPlan {
  /** 1 to SCALE.people; the number in their address. */
  n: number
  facts: PersonFacts
  gsiStaff: boolean
  headline: string
  location: string
  years: number
  availableFrom: Date
  confirmedAt: Date
  rateFloor: number
  lines: LinePlan[]
  listings: ListingPlan[]
  /** An EMPLOYEE seat: at an integrator (its staff, or somebody looking) or at a client. */
  employment: { firmId: string; side: 'BUY' | 'SELL'; grantedAt: Date; practice: string } | null
  /** Their own company-less seat, for everybody with no seat at a firm. */
  ownSeat: boolean
  enrollment: { firmId: string; enrolledAt: Date; completedAt: Date; score: number } | null
  /** OWN_COMPANY: the bench they left. */
  formerFirmId: string | null
  /** A firm they asked never to be put forward to: their own employer, for a client's employee. */
  doNotSubmit: string | null
  resume: string
}

// ── Sizes ─────────────────────────────────────────────────────────────

const CAREERS: Career[] = ['FRESHER', 'BETWEEN_PROJECTS', 'OWN_COMPANY', 'LOOKING_WHILE_EMPLOYED', 'PLACED', 'OTHER']

/** How many of the 2,000 take each career: CAREER_MIX, the rounding left on OTHER. */
export function careerCounts(total: number = SCALE.people): Record<Career, number> {
  const out = {} as Record<Career, number>
  let given = 0
  for (const c of CAREERS) {
    if (c === 'OTHER') continue
    out[c] = Math.round(total * CAREER_MIX[c])
    given += out[c]
  }
  out.OTHER = total - given
  return out
}

/** Of the integrators' staff, how many are between projects; the rest are on a line today. */
const GSI_BETWEEN_SHARE = 0.5
/** Of the people looking while employed, how many are employed at an integrator; the rest at a client. */
const LOOKING_AT_GSI_SHARE = 0.5
/** Of those who left a bench for their own company, how many sell themselves into a live line today. */
const OWN_COMPANY_LIVE_SHARE = 0.5
/** One person in this many between projects is built two months or less from a client's time limit. */
const NEAR_CAP_EVERY = 6
/** Room every other person keeps under a client's limit, in days. */
const CAP_ROOM = 120

// The first day a generated line or seat may start, and a client's time
// limit, are the frame's (`EARLIEST_DAY`, `timeLimitMonths`): one
// writer for each, so the people and the governance rule cannot disagree.

// ── Where people sit ──────────────────────────────────────────────────

const ABROAD: Record<'IN' | 'GB' | 'AU', { cities: string[]; word: string }> = {
  IN: { cities: ['Bengaluru', 'Hyderabad', 'Pune', 'Chennai'], word: 'India' },
  GB: { cities: ['Manchester', 'Leeds', 'Bristol', 'London'], word: 'UK' },
  AU: { cities: ['Sydney', 'Melbourne', 'Brisbane'], word: 'Australia' },
}

function placeOf(r: () => number, country: PersonFacts['country'], ind: IndustryKey): string {
  if (country === 'US') return pick(r, industry(ind).places)
  const a = ABROAD[country]
  return `${pick(r, a.cities)}, ${a.word}`
}

function authFor(r: () => number, country: PersonFacts['country'], career: Career): WorkAuth {
  if (country !== 'US') return 'OTHER'
  if (career === 'FRESHER') return weighted(r, [['CITIZEN', 40], ['GREEN_CARD', 15], ['OPT', 35], ['H1B', 10]]) as WorkAuth
  return weighted(r, [['CITIZEN', 45], ['GREEN_CARD', 22], ['H1B', 25], ['TN', 4], ['OPT', 4]]) as WorkAuth
}

/** The profile's own words for an authorization (lib/work-authorisation). Null where nothing US applies. */
export function profileAuth(a: WorkAuth): string | null {
  switch (a) {
    case 'CITIZEN': return 'US_CITIZEN'
    case 'GREEN_CARD': return 'GC'
    case 'H1B': return 'H1B'
    case 'OPT': return 'OPT'
    case 'TN': return 'TN'
    default: return null
  }
}

// ── Chains ────────────────────────────────────────────────────────────

/**
 * Every way down from a client to an employer, top first, up to three
 * rungs: a firm on the panel; a sub-vendor or bench firm under it; a bench
 * firm under that. Each hop is a tie on the register.
 */
function chainsTo(frame: ScaleFrame, client: ScaleFirm): string[][] {
  const out: string[][] = []
  for (const top of frame.panelOf(client.id)) {
    out.push([top.id])
    for (const mid of frame.subsOf(top.id)) {
      if (mid.id === top.id) continue
      out.push([top.id, mid.id])
      for (const low of frame.subsOf(mid.id)) {
        if (low.id === top.id || low.id === mid.id) continue
        out.push([top.id, mid.id, low.id])
      }
    }
  }
  return out
}

// ── The plan ──────────────────────────────────────────────────────────

const plans = new WeakMap<ScaleFrame, PersonPlan[]>()

/** Every person, every line, every listing. Pure; computed once per frame. */
export function planPeople(frame: ScaleFrame): PersonPlan[] {
  const have = plans.get(frame)
  if (have) return have
  const out = new Planner(frame).run()
  plans.set(frame, out)
  return out
}

/** The facts `papers` and `jobs` read: who each person is, where they sit, and their lines. */
export function buildPeople(frame: ScaleFrame): PersonFacts[] {
  return planPeople(frame).map((p) => p.facts)
}

/** The same facts, under the name the brief gave them. */
export const peopleFacts = buildPeople

/** A person's id, from their number. */
export const personIdOf = (n: number): string => idFor(`person/${String(n).padStart(4, '0')}`)

const DAY = 86_400_000
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
/** Days on site, both ends counted. */
const spanDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY) + 1

class Planner {
  private names = new NameBook()
  private chains = new Map<string, string[][]>()
  private people: PersonPlan[] = []
  private n = 0
  private clients: ScaleFirm[]
  private gsis: ScaleFirm[]

  constructor(private frame: ScaleFrame) {
    for (const f of frame.firms) for (const s of f.seats) this.names.hold(s.name, f.id)
    this.clients = frame.byPosition('CLIENT')
    this.gsis = frame.byPosition('GSI')
    for (const c of this.clients) this.chains.set(c.id, chainsTo(frame, c))
  }

  run(): PersonPlan[] {
    const counts = careerCounts()
    const gsiBetween = Math.round(GSI_STAFF * GSI_BETWEEN_SHARE)
    const gsiPlaced = GSI_STAFF - gsiBetween
    if (gsiBetween > counts.BETWEEN_PROJECTS || gsiPlaced > counts.PLACED) {
      throw new Error('The integrators hold more staff than the careers they are drawn from.')
    }
    const lookingAtGsi = Math.round(counts.LOOKING_WHILE_EMPLOYED * LOOKING_AT_GSI_SHARE)

    for (let i = 0; i < counts.FRESHER; i++) this.fresher(i)
    for (let i = 0; i < gsiBetween; i++) this.gsiStaff(i, false)
    for (let i = 0; i < counts.BETWEEN_PROJECTS - gsiBetween; i++) this.between(i)
    for (let i = 0; i < counts.OWN_COMPANY; i++) this.ownCompany(i)
    for (let i = 0; i < counts.LOOKING_WHILE_EMPLOYED; i++) this.looking(i, i < lookingAtGsi)
    for (let i = 0; i < gsiPlaced; i++) this.gsiStaff(i, true)
    for (let i = 0; i < counts.PLACED - gsiPlaced; i++) this.placed(i)
    for (let i = 0; i < counts.OTHER; i++) this.other(i)
    return this.people
  }

  // ── Building blocks ──

  private firm(id: string): ScaleFirm {
    const f = this.frame.byId.get(id)
    if (!f) throw new Error(`No firm ${id} in the frame.`)
    return f
  }

  /** Chains to a client whose employer works in the industry; `bottom` narrows who employs. */
  private chainsFor(client: ScaleFirm, ind: IndustryKey, bottom: (f: ScaleFirm) => boolean): string[][] {
    return (this.chains.get(client.id) ?? []).filter((c) => {
      const b = this.firm(c[c.length - 1])
      return b.industries.includes(ind) && bottom(b)
    })
  }

  private notGsi = (f: ScaleFirm) => f.position !== 'GSI'

  private roleIn(r: () => number, ind: IndustryKey, seniority?: RoleTemplate['seniority'][]): RoleTemplate {
    const roles = industry(ind).roles
    const fit = seniority ? roles.filter((x) => seniority.includes(x.seniority)) : roles
    return pick(r, fit.length ? fit : roles)
  }

  private skillsFor(r: () => number, role: RoleTemplate, ind: IndustryKey, extra: number, also: RoleTemplate[] = []): string[] {
    const out = [...role.skills]
    for (const a of also) for (const s of a.skills) if (!out.includes(s) && out.length < 7) out.push(s)
    const pool = skillsOf(ind).filter((s) => !out.includes(s))
    // Never fewer than three: a role with two skills borrows one from its own trade.
    const want = Math.max(extra, 3 - out.length)
    for (let i = 0; i < want && pool.length && out.length < 7; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0])
    return out
  }

  private line(
    key: string, client: ScaleFirm, chain: string[], start: Date, end: Date, live: boolean,
    who: { id: string; role: RoleTemplate; industry: IndustryKey }, country: PersonFacts['country'],
    opts: { ownCompany?: boolean; release?: LinePlan['release'] } = {}
  ): LinePlan {
    const rungs = chain.length
    // Keyed on the person, so every line of theirs at one depth reads one chain and their own floor holds.
    const rates = chain.map((_, r) => pairFor({ id: who.id, role: who.role, industry: who.industry }, r, rungs))
    const site = country === 'US' ? null : client.sites.find((s) => s.country === country)?.id ?? null
    return {
      key, clientId: client.id, chain, start, end, live, rates, role: who.role, industry: who.industry,
      workLocationId: site, ownCompany: !!opts.ownCompany, release: opts.release ?? null,
    }
  }

  /**
   * Ended lines, newest first, walking back from `latestEnd`. The newest
   * one is through `firstChain` where it is given (the firm the person is
   * on the bench of now); the rest through any firm that reaches a client
   * of the industry. No client is let past its limit less `CAP_ROOM`.
   */
  private history(
    r: () => number, who: { id: string; role: RoleTemplate; industry: IndustryKey }, country: PersonFacts['country'],
    count: number, latestEnd: Date, opts: {
      first?: { client: ScaleFirm; chain: string[] }
      bottom: (f: ScaleFirm) => boolean
      used?: Map<string, number>
      second?: { industry: IndustryKey; role: RoleTemplate } | null
    }
  ): LinePlan[] {
    const used = opts.used ?? new Map<string, number>()
    const out: LinePlan[] = []
    let end = latestEnd
    for (let i = 0; i < count; i++) {
      // One line in a second industry, for somebody who has worked across two.
      const crossing = !!opts.second && i === 1
      const ind = crossing ? opts.second!.industry : who.industry
      const role = crossing ? opts.second!.role : who.role
      let client: ScaleFirm | undefined
      let chain: string[] | undefined
      if (i === 0 && opts.first) {
        client = opts.first.client
        chain = opts.first.chain
      } else {
        const options = this.clients.filter((c) => c.industries[0] === ind && this.chainsFor(c, ind, opts.bottom).length > 0)
        if (!options.length) break
        client = pick(r, options)
        chain = pick(r, this.chainsFor(client, ind, opts.bottom))
      }
      const room = daysFor(timeLimitMonths(client)) - CAP_ROOM - (used.get(client.id) ?? 0)
      let dur = between(r, 90, 270)
      if (dur > room) dur = room
      if (dur < 60) {
        if (i === 0 && opts.first) throw new Error(`No room left at ${client.name} for the line a person is on the bench from.`)
        continue
      }
      let start = plus(end, -(dur - 1))
      if (start < day(EARLIEST_DAY)) {
        if (i > 0 || spanDays(day(EARLIEST_DAY), end) < 60) break
        start = day(EARLIEST_DAY)
        dur = spanDays(start, end)
      }
      used.set(client.id, (used.get(client.id) ?? 0) + dur)
      out.push(this.line(`h${i}`, client, chain, start, end, false, { id: who.id, role, industry: ind }, country))
      end = plus(start, -between(r, 20, 150))
    }
    return out
  }

  private stay(r: () => number, grantedAt: Date, mustRunPast: Date): number | null {
    // "Until cancelled" is the default, so most people never chose a number.
    if (r() < 0.7) return null
    const fits = STAY_CHOICES.filter((d) => plus(grantedAt, d) > mustRunPast)
    return fits.length ? pick(r, fits) : null
  }

  private listing(
    r: () => number, firmId: string, tier: ListingPlan['tier'], invitedAt: Date, rate: Band,
    opts: { askFirst?: boolean; showInMatches?: boolean } = {}
  ): ListingPlan {
    const respondedAt = plus(invitedAt, between(r, 0, 4))
    const grantedAt = respondedAt
    return {
      firmId, tier, state: 'GRANTED', invitedAt, respondedAt, grantedAt, revokedAt: null, lapsed: false,
      stayDays: this.stay(r, grantedAt, day(45)),
      askFirst: !!opts.askFirst,
      showInMatches: opts.showInMatches ?? (tier === 'MARKETING' && r() < 0.45),
      declinedNote: null, rate,
    }
  }

  private add(p: Omit<PersonPlan, 'n' | 'facts' | 'resume' | 'rateFloor'> & {
    name: string; career: Career; ind: IndustryKey; role: RoleTemplate; skills: string[]; workAuth: WorkAuth
    country: PersonFacts['country']; firmId: string; id: string; n: number
    listing: PersonFacts['listing']; course?: string
  }): void {
    const facts: PersonFacts = {
      id: p.id, email: emailFor(p.name, p.n), name: p.name, career: p.career, industry: p.ind, role: p.role,
      skills: p.skills, workAuth: p.workAuth, country: p.country, firmId: p.firmId, listing: p.listing,
      lineEnds: p.lines.map((l) => ({ clientId: l.clientId, employerId: l.chain[l.chain.length - 1], start: l.start, end: l.end, live: l.live })),
    }
    const plan: PersonPlan = {
      n: p.n, facts, gsiStaff: p.gsiStaff, headline: p.headline, location: p.location, years: p.years,
      availableFrom: p.availableFrom, confirmedAt: p.confirmedAt, rateFloor: floorFor({ id: p.id, role: p.role, industry: p.ind }),
      lines: p.lines, listings: p.listings, employment: p.employment, ownSeat: p.ownSeat, enrollment: p.enrollment,
      formerFirmId: p.formerFirmId, doNotSubmit: p.doNotSubmit, resume: '',
    }
    plan.resume = resumeOf(plan, this.frame, p.course)
    this.people.push(plan)
  }

  private next(career: Career, firmKey: string | null): { n: number; id: string; name: string; r: () => number } {
    const n = ++this.n
    const name = this.names.take(`person/${n}`, firmKey)
    return { n, id: personIdOf(n), name, r: keyed(`person/${n}/${career}`) }
  }

  private countryAt(r: () => number, firm: ScaleFirm | null): PersonFacts['country'] {
    if (firm?.position === 'GSI') {
      const inSite = firm.sites.some((s) => s.country === 'IN')
      const gbSite = firm.sites.some((s) => s.country === 'GB')
      return weighted(r, [['US', 55], ['IN', inSite ? 35 : 0], ['GB', gbSite ? 10 : 0]]) as PersonFacts['country']
    }
    return weighted(r, [['US', 80], ['IN', 10], ['GB', 6], ['AU', 4]]) as PersonFacts['country']
  }

  // ── The careers ──

  /** Just trained by a bench firm: the course completed, listed by their own yes after it, no lines yet. */
  private fresher(i: number): void {
    const bench = this.frame.byPosition('BENCH')
    const firm = bench[i % bench.length]
    const { n, id, name, r } = this.next('FRESHER', null)
    const ind = firm.industries[0]
    const niche = industry(ind).niches.find((x) => x.key === firm.niche) ?? industry(ind).niches[0]
    const role = [...industry(ind).roles].sort((a, b) => overlap(b.skills, niche.skills) - overlap(a.skills, niche.skills))[0]
    const country = this.countryAt(r, null)
    const enrolledAt = day(-between(r, 70, 160))
    const completedAt = plus(enrolledAt, Math.max(21, Math.round(niche.course.hours / 3)))
    const finished = completedAt > day(-3) ? day(-3) : completedAt
    const who = { id, role, industry: ind }
    const listing = this.listing(r, firm.id, 'MARKETING', plus(finished, 1), listingRate(who), { showInMatches: r() < 0.6 })
    this.add({
      id, n, name, career: 'FRESHER', ind, role, skills: [...niche.skills], workAuth: authFor(r, country, 'FRESHER'),
      country, firmId: firm.id, listing: { firmId: firm.id, tier: 'MARKETING', askFirst: false },
      gsiStaff: false, headline: `${role.title}, newly trained`, location: placeOf(r, country, ind), years: 0,
      availableFrom: listing.grantedAt, confirmedAt: day(-between(r, 1, 20)), lines: [], listings: [listing],
      employment: null, ownSeat: true,
      enrollment: { firmId: firm.id, enrolledAt, completedAt: finished, score: between(r, 68, 98) },
      formerFirmId: null, doNotSubmit: null, course: niche.course.title,
    })
  }

  /** An integrator's own W2: an employee seat with their discipline, a profile, no listing. */
  private gsiStaff(i: number, placed: boolean): void {
    // Each integrator holds the same number of staff: half between projects, half on a line.
    const gsi = this.gsis[i % this.gsis.length]
    const { n, id, name, r } = this.next(placed ? 'PLACED' : 'BETWEEN_PROJECTS', gsi.id)
    const clients = this.clients.filter((c) => this.frame.panelOf(c.id).some((s) => s.id === gsi.id))
    if (!clients.length) throw new Error(`${gsi.name} sits on no client's panel, so its people can work nowhere.`)
    const client = pick(r, clients)
    const ind = client.industries[0]
    const role = this.roleIn(r, ind)
    const country = this.countryAt(r, gsi)
    const who = { id, role, industry: ind }
    const years = between(r, 2, 14)
    const hired = day(-between(r, 400, -EARLIEST_DAY))
    const dm = gsi.seats.find((s) => s.role === 'Delivery Manager') ?? gsi.seats[0]
    let lines: LinePlan[]
    let availableFrom: Date
    if (placed) {
      // A third are coming off their project within six weeks, flagged by their delivery manager.
      const rolling = i % 3 === 0
      const end = rolling ? day(between(r, 7, 42)) : day(between(r, 60, 300))
      const room = daysFor(timeLimitMonths(client)) - CAP_ROOM
      const start = plus(day(0), -Math.min(between(r, 30, 300), room - spanDays(day(0), end)))
      lines = [this.line('live', client, [gsi.id], start, end, true, who, country, {
        release: rolling ? { releasedById: dm.personId, rollsOffOn: end, confirmed: i % 2 === 0 } : null,
      })]
      availableFrom = plus(end, 1)
    } else {
      lines = this.history(r, who, country, between(r, 1, 3), day(-between(r, 0, 60)), {
        first: { client, chain: [gsi.id] }, bottom: (f) => f.id === gsi.id,
      })
      availableFrom = plus(lines[0].end, 1)
    }
    this.add({
      id, n, name, career: placed ? 'PLACED' : 'BETWEEN_PROJECTS', ind, role, skills: this.skillsFor(r, role, ind, between(r, 0, 2)),
      workAuth: authFor(r, country, 'PLACED'), country, firmId: gsi.id, listing: null, gsiStaff: true,
      headline: `${role.title}, ${years} years`, location: placeOf(r, country, ind), years, availableFrom,
      confirmedAt: day(-between(r, 1, 30)), lines, listings: [],
      employment: { firmId: gsi.id, side: 'SELL', grantedAt: latest(day(EARLIEST_DAY - 10), earliest(hired, plus(lines[lines.length - 1].start, -14))), practice: `Delivery — ${role.title.toLowerCase()} practice` },
      ownSeat: false, enrollment: null, formerFirmId: null, doNotSubmit: null,
    })
  }

  /** Ten years in, two to four ended lines across suppliers, free now, on the bench of the firm that last employed them. */
  private between(i: number): void {
    const { n, id, name, r } = this.next('BETWEEN_PROJECTS', null)
    const near = i % NEAR_CAP_EVERY === 0
    // Somebody near a limit is built at a client whose limit fits inside the firms' two years on the record.
    const client = pick(r, this.clients.filter((c) => this.chainsFor(c, c.industries[0], this.notGsi).length > 0 && (!near || timeLimitMonths(c) === 18)))
    const ind = client.industries[0]
    const role = this.roleIn(r, ind, ['MID', 'SENIOR'])
    const country = this.countryAt(r, null)
    const who = { id, role, industry: ind }
    const options = this.chainsFor(client, ind, this.notGsi)
    const firstChain = pick(r, options)
    const used = new Map<string, number>()
    let lines: LinePlan[]
    if (near) {
      // Two lines at one client through two different suppliers, the
      // second ending in the last month, adding up to within two months
      // of the client's limit: the time limit has somebody to stop.
      const others = options.filter((c) => c[c.length - 1] !== firstChain[firstChain.length - 1])
      const earlierChain = others.length ? pick(r, others) : firstChain
      const total = daysFor(timeLimitMonths(client)) - between(r, 10, 50)
      const d2 = between(r, 150, 250)
      const d1 = total - d2
      const end2 = day(-between(r, 0, 30))
      const start2 = plus(end2, -(d2 - 1))
      const end1 = plus(start2, -between(r, 20, 60))
      const start1 = plus(end1, -(d1 - 1))
      lines = [
        this.line('h0', client, firstChain, start2, end2, false, who, country),
        this.line('h1', client, earlierChain, start1, end1, false, who, country),
      ]
      used.set(client.id, Number.POSITIVE_INFINITY)
      lines.push(...this.history(r, who, country, between(r, 0, 1), plus(start1, -between(r, 100, 200)), {
        bottom: this.notGsi, used,
      }).map((l, k) => ({ ...l, key: `h${k + 2}` })))
    } else {
      const crosses = r() < 0.15
      const otherInd = crosses ? pick(r, (['IT', 'HEALTHCARE', 'MANUFACTURING', 'FINANCE'] as IndustryKey[]).filter((x) => x !== ind)) : null
      lines = this.history(r, who, country, between(r, 2, 4), day(-between(r, 0, 60)), {
        first: { client, chain: firstChain }, bottom: this.notGsi, used,
        second: otherInd ? { industry: otherInd, role: this.roleIn(r, otherInd, ['MID', 'SENIOR']) } : null,
      })
    }
    const firmId = firstChain[firstChain.length - 1]
    const listings: ListingPlan[] = []
    const rate = listingRate(who)
    const retained = r() < 0.2
    listings.push(this.listing(r, firmId, retained ? 'RETAINED' : 'MARKETING', plus(lines[0].end, -between(r, 0, 20)), rate))
    // A third have also said yes to a prime their firm sells to, which shows them one rung up.
    const above = this.frame.primesOf(firmId)
    if (!retained && above.length && r() < 0.33) {
      listings.push(this.listing(r, pick(r, above).id, 'MARKETING', plus(lines[0].end, between(r, 1, 10)), rate))
    }
    const also = lines.filter((l) => l.role !== role).map((l) => l.role)
    const years = between(r, 8, 15)
    this.add({
      id, n, name, career: 'BETWEEN_PROJECTS', ind, role, skills: this.skillsFor(r, role, ind, between(r, 0, 2), also),
      workAuth: authFor(r, country, 'BETWEEN_PROJECTS'), country, firmId,
      listing: { firmId, tier: listings[0].tier, askFirst: false }, gsiStaff: false,
      headline: `${role.title}, ${years} years`, location: placeOf(r, country, ind), years,
      availableFrom: plus(lines[0].end, 1), confirmedAt: day(-between(r, 1, 30)), lines, listings,
      employment: null, ownSeat: true, enrollment: null, formerFirmId: null, doNotSubmit: null,
    })
  }

  /** Left a bench for a company of their own: the old yes taken back, and half sell themselves corp-to-corp today. */
  private ownCompany(i: number): void {
    const { n, id, name, r } = this.next('OWN_COMPANY', null)
    const client = pick(r, this.clients.filter((c) => this.chainsFor(c, c.industries[0], this.notGsi).length > 0))
    const ind = client.industries[0]
    const role = this.roleIn(r, ind, ['MID', 'SENIOR'])
    const country: PersonFacts['country'] = 'US'
    const who = { id, role, industry: ind }
    const fromBench = this.chainsFor(client, ind, (f) => f.position === 'BENCH' || f.position === 'SUB_VENDOR')
    const firstChain = pick(r, fromBench.length ? fromBench : this.chainsFor(client, ind, this.notGsi))
    const former = firstChain[firstChain.length - 1]
    const left = day(-between(r, 205, 260))
    const used = new Map<string, number>()
    const lines = this.history(r, who, country, between(r, 1, 2), plus(left, -between(r, 5, 40)), {
      first: { client, chain: firstChain }, bottom: this.notGsi, used,
    })
    const soloId = soloIdOf(id)
    const rate = listingRate(who)
    const old = this.listing(r, former, 'MARKETING', plus(lines[0].start, -between(r, 10, 40)), rate)
    old.revokedAt = left
    old.stayDays = null
    let availableFrom = day(0)
    if (i % Math.round(1 / OWN_COMPANY_LIVE_SHARE) === 0) {
      // Sells herself to a prime on a client's panel, which sells her on.
      const primes = this.frame.panelOf(client.id).filter((f) => f.position === 'PRIME' && f.industries.includes(ind))
      const prime = primes.length ? pick(r, primes) : null
      if (prime) {
        const room = daysFor(timeLimitMonths(client)) - CAP_ROOM - (used.get(client.id) ?? 0)
        const start = day(-between(r, 20, 180))
        const end = plus(start, Math.min(between(r, 120, 360), room) - 1)
        if (end > day(14)) {
          lines.unshift(this.line('live', client, [prime.id, soloId], start, end, true, who, country, { ownCompany: true }))
          availableFrom = plus(end, 1)
        }
      }
    }
    const years = between(r, 6, 15)
    this.add({
      id, n, name, career: 'OWN_COMPANY', ind, role, skills: this.skillsFor(r, role, ind, between(r, 1, 3)),
      workAuth: authFor(r, country, 'OWN_COMPANY'), country, firmId: soloId, listing: null, gsiStaff: false,
      headline: `${role.title}, ${years} years, through their own company`, location: placeOf(r, country, ind), years,
      availableFrom, confirmedAt: day(-between(r, 1, 30)), lines, listings: [old],
      employment: null, ownSeat: false, enrollment: null, formerFirmId: former, doNotSubmit: null,
    })
  }

  /** Employed at an integrator or a client, and open to the next thing: listed by their own yes, asked first. */
  private looking(i: number, atGsi: boolean): void {
    const where = atGsi ? this.gsis[i % this.gsis.length] : this.clients[i % this.clients.length]
    const { n, id, name, r } = this.next('LOOKING_WHILE_EMPLOYED', where.id)
    const ind = atGsi ? pick(r, where.industries) : where.industries[0]
    const role = this.roleIn(r, ind)
    const country = this.countryAt(r, atGsi ? where : null)
    const who = { id, role, industry: ind }
    const benches = this.frame.byPosition('BENCH').filter((b) => b.industries.includes(ind))
    const bench = pick(r, benches.length ? benches : this.frame.byPosition('BENCH'))
    const l = this.listing(r, bench.id, 'MARKETING', day(-between(r, 10, 90)), listingRate(who), { askFirst: true, showInMatches: r() < 0.5 })
    const years = between(r, 3, 12)
    this.add({
      id, n, name, career: 'LOOKING_WHILE_EMPLOYED', ind, role, skills: this.skillsFor(r, role, ind, between(r, 0, 2)),
      workAuth: authFor(r, country, 'LOOKING_WHILE_EMPLOYED'), country, firmId: where.id,
      listing: { firmId: bench.id, tier: 'MARKETING', askFirst: true }, gsiStaff: false,
      headline: `${role.title}, ${years} years`, location: placeOf(r, country, ind), years,
      availableFrom: day(between(r, 30, 120)), confirmedAt: day(-between(r, 100, 200)), lines: [], listings: [l],
      employment: { firmId: where.id, side: atGsi ? 'SELL' : 'BUY', grantedAt: day(-between(r, 300, -EARLIEST_DAY)), practice: atGsi ? `Delivery — ${role.title.toLowerCase()} practice` : `${role.title}, permanent staff` },
      ownSeat: false, enrollment: null, formerFirmId: null, doNotSubmit: atGsi ? null : where.id,
    })
  }

  /** On a live line today through a supplier's chain, kept on that firm's own bench while they work. */
  private placed(i: number): void {
    const { n, id, name, r } = this.next('PLACED', null)
    const client = this.clients[i % this.clients.length]
    const ind = client.industries[0]
    const role = this.roleIn(r, ind)
    const country = this.countryAt(r, null)
    const who = { id, role, industry: ind }
    const options = this.chainsFor(client, ind, this.notGsi)
    if (!options.length) throw new Error(`Nobody but an integrator reaches ${client.name}.`)
    const chain = pick(r, options)
    const room = daysFor(timeLimitMonths(client)) - CAP_ROOM
    const booked = between(r, 120, Math.min(420, room))
    const served = between(r, 20, Math.min(300, booked - 30))
    const start = day(-served)
    const end = plus(start, booked - 1)
    const lines = [this.line('live', client, chain, start, end, true, who, country)]
    if (r() < 0.5) {
      const used = new Map<string, number>([[client.id, Number.POSITIVE_INFINITY]])
      lines.push(...this.history(r, who, country, 1, plus(start, -between(r, 30, 200)), { bottom: this.notGsi, used })
        .map((l) => ({ ...l, key: 'h1' })))
    }
    const firmId = chain[chain.length - 1]
    const years = between(r, 3, 15)
    const listing = this.listing(r, firmId, 'RETAINED', plus(start, -between(r, 20, 60)), listingRate(who))
    this.add({
      id, n, name, career: 'PLACED', ind, role, skills: this.skillsFor(r, role, ind, between(r, 0, 2)),
      workAuth: authFor(r, country, 'PLACED'), country, firmId,
      listing: { firmId, tier: 'RETAINED', askFirst: false }, gsiStaff: false,
      headline: `${role.title}, ${years} years`, location: placeOf(r, country, ind), years,
      availableFrom: plus(end, 1), confirmedAt: day(-between(r, 1, 30)), lines, listings: [listing],
      employment: null, ownSeat: true, enrollment: null, formerFirmId: null, doNotSubmit: null,
    })
  }

  /** Asked onto a bench and never answered, said no, or let the stay they chose run out. */
  private other(i: number): void {
    const pool = [...this.frame.byPosition('BENCH'), ...this.frame.byPosition('SUB_VENDOR')]
    const firm = pool[(i * 7) % pool.length]
    const { n, id, name, r } = this.next('OTHER', null)
    const ind = pick(r, firm.industries)
    const role = this.roleIn(r, ind)
    const country = this.countryAt(r, null)
    const who = { id, role, industry: ind }
    const invitedAt = day(-between(r, 20, 200))
    const kind = (['INVITED', 'DECLINED', 'LAPSED'] as const)[i % 3]
    const l: ListingPlan = {
      firmId: firm.id, tier: 'MARKETING', state: 'INVITED', invitedAt, respondedAt: null, grantedAt: invitedAt,
      revokedAt: null, lapsed: false, stayDays: null, askFirst: false, showInMatches: false, declinedNote: null,
      rate: listingRate(who),
    }
    if (kind === 'DECLINED') {
      l.state = 'DECLINED'
      l.respondedAt = plus(invitedAt, between(r, 1, 6))
      l.declinedNote = pick(r, ['Not looking right now.', 'I took a permanent role.', 'Only remote work for now.'])
    } else if (kind === 'LAPSED') {
      // They said yes for a set stay, and the stay ran out before today.
      l.state = 'GRANTED'
      l.respondedAt = plus(invitedAt, between(r, 0, 3))
      l.grantedAt = l.respondedAt
      const fits = STAY_CHOICES.filter((d) => plus(l.grantedAt, d) < day(-1))
      l.stayDays = fits.length ? pick(r, fits) : 5
      l.revokedAt = plus(l.grantedAt, l.stayDays)
      l.lapsed = true
    }
    const years = between(r, 1, 10)
    this.add({
      id, n, name, career: 'OTHER', ind, role, skills: this.skillsFor(r, role, ind, between(r, 0, 2)),
      workAuth: authFor(r, country, 'OTHER'), country, firmId: firm.id, listing: null, gsiStaff: false,
      headline: `${role.title}, ${years} years`, location: placeOf(r, country, ind), years,
      availableFrom: day(between(r, -30, 60)), confirmedAt: day(-between(r, 30, 200)), lines: [], listings: [l],
      employment: null, ownSeat: true, enrollment: null, formerFirmId: null, doNotSubmit: null,
    })
  }
}

const earliest = (a: Date, b: Date) => (a < b ? a : b)
const latest = (a: Date, b: Date) => (a > b ? a : b)
const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length

/** The one-person company a person's own career makes: the id `ensureSolo` gives it. */
export function soloIdOf(personId: string): string {
  return idFor(`firm/solo/${personId}`)
}

// ── The résumé ────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
const SECTOR: Record<IndustryKey, string> = {
  IT: 'a software', HEALTHCARE: 'a hospital', MANUFACTURING: 'a manufacturing', FINANCE: 'a financial services',
}

/**
 * What the person sent: their name, headline, skills and work, newest
 * first. It says nothing about the right to work, because a CV is read to
 * extract, never to decide, and work authorization is never read from one.
 */
function resumeOf(p: PersonPlan, frame: ScaleFrame, course?: string): string {
  const f = p.facts
  const out = [`${f.name}`, `${p.headline} — ${p.location}`, '', `Skills: ${f.skills.join(', ')}`, '', 'Experience']
  if (p.lines.length === 0) out.push(p.employment ? `${f.role.title} on permanent staff.` : 'Starting out.')
  for (const l of [...p.lines].sort((a, b) => b.start.getTime() - a.start.getTime())) {
    const client = frame.byId.get(l.clientId)
    const to = l.live ? 'present' : month(l.end)
    out.push(`${l.role.title}, on contract at ${SECTOR[l.industry]} client${client ? ` in ${client.sites[0].city}` : ''}, ${month(l.start)} to ${to}.`)
  }
  if (course && p.enrollment) out.push('', 'Training', `${course}, completed ${month(p.enrollment.completedAt)}.`)
  return out.join('\n') + '\n'
}

// ── Counting, for the tests and the report ────────────────────────────

/** How many people each career holds, and how many in each industry. */
export function tally(people: PersonPlan[]): { careers: Record<Career, number>; industries: Record<IndustryKey, number>; gsiStaff: number; live: number } {
  const careers = { FRESHER: 0, BETWEEN_PROJECTS: 0, OWN_COMPANY: 0, LOOKING_WHILE_EMPLOYED: 0, PLACED: 0, OTHER: 0 } as Record<Career, number>
  const industries = { IT: 0, HEALTHCARE: 0, MANUFACTURING: 0, FINANCE: 0 } as Record<IndustryKey, number>
  let gsiStaff = 0
  let live = 0
  for (const p of people) {
    careers[p.facts.career]++
    industries[p.facts.industry]++
    if (p.gsiStaff) gsiStaff++
    live += p.lines.filter((l) => l.live).length
  }
  return { careers, industries, gsiStaff, live }
}
