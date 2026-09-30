/**
 * Who a job request is matched against, and what each viewer may see.
 *
 * ── The decision, 2026-09-30 ─────────────────────────────────────────
 *
 * The founder: "We have a matching feature that will bring available and
 * matching bench to requirements, with priority to existing vendors, that
 * they can add to the application. In case the matching bench is not a
 * vendor, client-side recruiters can request creators to be added."
 *
 * Until today the pool was the requirement owner's own bench and nothing
 * else, which is right for a staffing firm asking "do we have anybody"
 * and empty for a client, who has no bench. So a client's job request —
 * the thing Etyme exists for — could never be matched with anybody.
 *
 * The pool is now four circles, and every person in it is there by a
 * consent they gave:
 *
 *   OWN         the viewer's own granted listings, and — for a firm that
 *               sells — its own employees between projects, who go
 *               forward as its own employees (INTERNAL)
 *   PANEL       marketed bench of the firms the viewer already buys from
 *   TRADING     marketed bench of the other firms the viewer trades with
 *   SUGGESTION  marketed bench of a firm the viewer does not trade with,
 *               only where the person said yes to being shown in matches
 *               beyond the firms their bench firm trades with
 *
 * Ranked in that order, then by score.
 *
 * ── What a suggestion may say ─────────────────────────────────────────
 *
 * The firm, the skills, when they are free and the reasons. Never the
 * person's name, contact or rate — the firm is not the viewer's supplier,
 * so nothing about the person belongs to the viewer yet. Its one action
 * is asking to add the firm, which walks supplier onboarding like any
 * other firm. Suggestions are shown only to a client on its own job
 * request, because asking to add a supplier is a client's act.
 *
 * ── The chain ────────────────────────────────────────────────────────
 *
 * A sub-vendor's name is the prime's to keep. A firm that sits below one
 * of the client's primes on a chain at the client is never suggested to
 * that client, even where the person agreed to be shown: suggesting it
 * would invite the client to go round the prime, which is the one thing
 * the NDA between them exists to stop. Disclosure does not widen this —
 * reading a sub's name on a placement is not a deal with the sub.
 *
 * ── Rates ────────────────────────────────────────────────────────────
 *
 * A buyer never reads a rate off a match. The rate arrives with the
 * submission, from the firm that makes it, at the rung the buyer pays.
 * A firm that sells reads its own listing's rate and the rate its own
 * supplier asks, because those are its own deals.
 */

import { prisma } from '@/lib/db'
import { standingOf, type RosterLine } from '@/lib/consultant-portfolio'
import { stayOver } from '@/lib/bench-stay'

// ─────────────────────────────────────────────────────────────────────
// Pure: the rules
// ─────────────────────────────────────────────────────────────────────

export type Reach = 'OWN' | 'PANEL' | 'TRADING' | 'SUGGESTION'

export const REACH_ORDER: Record<Reach, number> = { OWN: 0, PANEL: 1, TRADING: 2, SUGGESTION: 3 }

/** The heading a list of matches is grouped under, in the reader's words. */
export const REACH_WORD: Record<Reach, string> = {
  OWN: 'Your own people',
  PANEL: 'From your suppliers',
  TRADING: 'From firms you work with',
  SUGGESTION: 'Suggested — not your supplier yet',
}

/** The firms a company already deals with, as matching reads them. */
export interface Ties {
  /** The viewer. */
  self: string
  /** Firms the viewer buys from: its supplier panel. */
  panel: Set<string>
  /** Every other firm the viewer trades with. Never overlaps `panel`. */
  trading: Set<string>
  /** Firms the viewer has blocked. Nobody from them is shown. */
  blocked: Set<string>
  /**
   * Firms below one of the viewer's primes on a chain at the viewer.
   * Never suggested; see the chain note above.
   */
  belowPrimes: Set<string>
}

export interface ListingFacts {
  companyId: string
  tier: string
  state: string
  revokedAt: Date | null
  showInMatches: boolean
  /** When the person's chosen stay on this bench runs out. Null is until cancelled. */
  staysUntil?: Date | null
}

/**
 * How far this listing reaches this viewer, or null where it does not.
 *
 * `suggest` is false for everybody except a client on its own job request.
 */
export function reachOf(l: ListingFacts, ties: Ties, suggest: boolean, now: Date = new Date()): Reach | null {
  // The consent first, always. Nothing reaches anybody on a listing that
  // was taken back, declined or never answered — or whose chosen stay ran
  // out, even before the nightly job has written the ending down.
  if (l.revokedAt || l.state !== 'GRANTED') return null
  if (stayOver({ staysUntil: l.staysUntil ?? null }, now)) return null
  if (l.companyId === ties.self) return 'OWN'
  // Retained is the firm keeping somebody to itself.
  if (l.tier !== 'MARKETING') return null
  if (ties.blocked.has(l.companyId)) return null
  if (ties.panel.has(l.companyId)) return 'PANEL'
  if (ties.trading.has(l.companyId)) return 'TRADING'
  if (!suggest || !l.showInMatches) return null
  if (ties.belowPrimes.has(l.companyId)) return null
  return 'SUGGESTION'
}

/** One person in the pool, through the one firm they are reached by. */
export interface PoolEntry {
  personId: string
  consultantId: string
  name: string
  reach: Reach
  /** The viewer's own employee, who goes forward as INTERNAL. */
  employee: boolean
  /** The firm that holds them — the listing's firm, or the employer. */
  firmId: string
  firmName: string
  /** What the firm markets them at, in cents an hour. Null where nothing is on record. */
  rateMin: number | null
  rateMax: number | null
  /** When the firm was given the consent this entry stands on. Breaks a tie between two firms. */
  since: Date | null
  /** For an employee: one sentence about where they are, in a delivery manager's words. */
  standing: string | null
  consultant: {
    headline: string | null
    skills: string[]
    location: string | null
    workAuth: string | null
    rateFloor: number | null
    availableFrom: Date | null
    confirmedAt: Date | null
  }
}

/**
 * One entry per person: the nearest circle wins, and within a circle the
 * firm that has held their consent longest.
 *
 * A person on two suppliers' benches is one person to a client, and the
 * first firm they said yes to is the least arbitrary one to name.
 */
export function onePerPerson(entries: PoolEntry[]): PoolEntry[] {
  const best = new Map<string, PoolEntry>()
  for (const e of entries) {
    const held = best.get(e.personId)
    if (!held) {
      best.set(e.personId, e)
      continue
    }
    const a = REACH_ORDER[e.reach]
    const b = REACH_ORDER[held.reach]
    if (a < b) best.set(e.personId, e)
    else if (a === b) {
      // Your own employee beats your own listing of them: the employment
      // is the consent, and INTERNAL is what they are.
      if (e.employee && !held.employee) best.set(e.personId, e)
      else if (e.employee === held.employee && (e.since?.getTime() ?? Infinity) < (held.since?.getTime() ?? Infinity)) {
        best.set(e.personId, e)
      }
    }
  }
  return [...best.values()]
}

/** Nearest circle first, then the engine's score. */
export function ranked<T extends { reach: Reach; score: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => REACH_ORDER[a.reach] - REACH_ORDER[b.reach] || b.score - a.score)
}

// ── What a viewer is shown ─────────────────────────────────────────────

export interface Factor {
  label: string
  value: number
  weight: number
  detail?: string
}

/**
 * A rate factor's detail, said without a number.
 *
 * The engine writes "Floor $95/hr within budget", which is a person's
 * rate. A buyer reads whether it fits and nothing else.
 */
export function rateWithoutNumber(f: Factor): Factor {
  if (!/rate/i.test(f.label)) return f
  const detail =
    f.value >= 100 ? 'Within the job’s rate range'
    : f.value === 50 ? 'Rate not on record'
    : 'Above the job’s rate range'
  return { ...f, detail }
}

/** Replace every spelling of a person's name in a model's sentence. */
export function withoutName(text: string | null, name: string): string | null {
  if (!text) return text
  let out = text
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 1)
  for (const p of [name.trim(), ...parts]) {
    if (!p) continue
    out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'this consultant')
  }
  // "this consultant this consultant" where a full name was replaced part by part.
  return out.replace(/(this consultant)(\s+this consultant)+/gi, '$1')
}

export interface Shown {
  /** Null on a suggestion. */
  name: string | null
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  availability: string | null
  /** The firm they come through, by name. */
  firm: { id: string; name: string }
  factors: Factor[]
  basis: string
  unknowns: string | null
  /** The firm's rate for them, where this viewer may read it. */
  rate: { min: number | null; max: number | null } | null
}

/**
 * What one match looks like to one viewer.
 *
 * `buyer` is whoever the job request is submitted to. A buyer never reads
 * a rate off a match; a suggestion never carries a name, a headline (it
 * is the person's own words and names them as often as not), a location
 * or a work authorization.
 */
export function shownTo(
  entry: PoolEntry,
  match: { factors: Factor[]; basis: string; unknowns: string | null },
  viewer: { buyer: boolean }
): Shown {
  const suggestion = entry.reach === 'SUGGESTION'
  const hideRate = viewer.buyer || suggestion
  const factors = hideRate ? match.factors.map(rateWithoutNumber) : match.factors
  return {
    name: suggestion ? null : entry.name,
    headline: suggestion ? null : entry.consultant.headline,
    skills: entry.consultant.skills,
    location: suggestion ? null : entry.consultant.location,
    workAuth: suggestion ? null : entry.consultant.workAuth,
    availability: entry.consultant.availableFrom?.toISOString() ?? null,
    firm: { id: entry.firmId, name: entry.firmName },
    factors: suggestion ? factors.map((f) => ({ ...f, detail: withoutName(f.detail ?? null, entry.name) ?? undefined })) : factors,
    basis: suggestion
      ? `A consultant at ${entry.firmName}, scored on skills, place, availability and rate fit. ` +
        `Their name, contact and rate stay with ${entry.firmName} until ${entry.firmName} is your supplier.`
      : match.basis,
    unknowns: suggestion ? withoutName(match.unknowns, entry.name) : match.unknowns,
    rate: hideRate ? null : { min: entry.rateMin, max: entry.rateMax },
  }
}

// ── The one action on a row ─────────────────────────────────────────────

export type MatchAction =
  /** Put them forward through `/api/submissions`, with these exact fields. */
  | {
      kind: 'SUBMIT'
      fromCompanyId: string
      /** The rate to send, in cents an hour. Null where the firm must type its own. */
      rate: number | null
      /** Where the person comes from a supplier on the viewer's network. */
      offeredBy: string | null
      /** What the viewer pays that supplier, from the supplier's own listing. */
      payRate: number | null
      /** INTERNAL for the viewer's own employee. */
      as: 'INTERNAL' | 'OWN_BENCH' | 'FROM_SUPPLIER'
      says: string
    }
  /** A buyer asks the firm (or the prime above it) to put them forward. */
  | { kind: 'ASK'; toCompanyId: string; toName: string; says: string }
  /** A suggestion: ask to add the firm as a supplier. */
  | { kind: 'ASK_TO_ADD'; firmId: string; firmName: string; says: string }
  | { kind: 'NONE'; says: string }

/**
 * What the viewer can do with this row.
 *
 * `under` is where an approved sub-vendor works under a prime the buyer
 * pays: the ask goes to the prime, never round it.
 */
export function actionFor(input: {
  entry: PoolEntry
  viewer: { companyId: string; buyer: boolean }
  /** A rate the firm has billed this person at before, for its own employee. */
  lastBillRate?: number | null
  under?: { companyId: string; name: string } | null
}): MatchAction {
  const { entry, viewer } = input
  const who = entry.name

  if (entry.reach === 'SUGGESTION') {
    return {
      kind: 'ASK_TO_ADD',
      firmId: entry.firmId,
      firmName: entry.firmName,
      says:
        `${entry.firmName} is not your supplier yet. Ask to add it, and it walks your supplier ` +
        'onboarding like any other firm. Once it is approved, this person can be put forward.',
    }
  }

  if (viewer.buyer) {
    if (entry.reach === 'OWN') {
      return {
        kind: 'NONE',
        says: `${who} is your own. Nobody is submitted to their own company — staff them directly.`,
      }
    }
    const to = input.under ?? { companyId: entry.firmId, name: entry.firmName }
    return {
      kind: 'ASK',
      toCompanyId: to.companyId,
      toName: to.name,
      says: input.under
        ? `${entry.firmName} works for you under ${to.name}, so the ask goes to ${to.name}.`
        : `Ask ${to.name} to put ${who} forward. The submission, and the rate, come from them.`,
    }
  }

  // A firm that sells.
  if (entry.reach === 'OWN' && entry.employee) {
    return {
      kind: 'SUBMIT',
      fromCompanyId: viewer.companyId,
      rate: input.lastBillRate ?? null,
      offeredBy: null,
      payRate: null,
      as: 'INTERNAL',
      says:
        `${who} is your own employee, so the employment is the consent. They go forward as your ` +
        'own and are told where they went.',
    }
  }
  if (entry.reach === 'OWN') {
    return {
      kind: 'SUBMIT',
      fromCompanyId: viewer.companyId,
      rate: entry.rateMax ?? entry.rateMin ?? null,
      offeredBy: null,
      payRate: null,
      as: 'OWN_BENCH',
      says: `${who} granted you a bench listing. The rate is the one on it.`,
    }
  }
  return {
    kind: 'SUBMIT',
    fromCompanyId: viewer.companyId,
    // Your own bill rate is yours to say. The supplier's is what it asked.
    rate: null,
    offeredBy: entry.firmId,
    payRate: entry.rateMax ?? entry.rateMin ?? null,
    as: 'FROM_SUPPLIER',
    says:
      `${entry.firmName} offered ${who} to the firms it works with. You put them forward in your ` +
      `name and buy them from ${entry.firmName}; say your own rate.`,
  }
}

// ─────────────────────────────────────────────────────────────────────
// The database: ties and the pool
// ─────────────────────────────────────────────────────────────────────

const NOT_BINDING = ['TERMINATED', 'EXPIRED']

/**
 * The firms a company deals with.
 *
 * `panel` is who it buys from: an agreement where it is the client, a
 * supplier row on its own register, or a contract that bills it. The
 * supplier list reads the same three (`app/api/suppliers`).
 *
 * `trading` is everyone else it trades with: the register either way
 * round — which is the rule Bench → Your network and the submit door's
 * network both read — and an agreement where it is the vendor.
 *
 * `network`, returned beside, is only the register either way round. A
 * firm that sells can put forward a supplier's person only through that
 * door (`app/api/submissions`, `networkOf`), so a seller's pool keeps to
 * it rather than offer a row the door would refuse.
 */
export async function tiesOf(companyId: string, now: Date = new Date()): Promise<Ties & { network: Set<string> }> {
  const [mine, theirs, asClient, asVendor, billed, blocks, subs] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId },
      select: { otherCompanyId: true, relationship: true, status: true },
    }),
    prisma.counterparty.findMany({
      where: { otherCompanyId: companyId, status: 'ACTIVE' },
      select: { companyId: true },
    }),
    prisma.masterAgreement.findMany({
      where: { clientId: companyId, status: { notIn: NOT_BINDING } },
      select: { vendorId: true },
    }),
    prisma.masterAgreement.findMany({
      where: { vendorId: companyId, status: { notIn: NOT_BINDING } },
      select: { clientId: true },
    }),
    prisma.sellContract.findMany({
      where: { clientCompanyId: companyId, state: { notIn: ['DRAFT', 'CANCELLED'] } },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
    prisma.blacklist.findMany({
      where: {
        companyId, targetType: 'COMPANY', liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { targetId: true },
    }),
    // Firms selling to somebody other than this company, on work at this
    // company: the rungs below its primes.
    prisma.sellContract.findMany({
      where: { endClientCompanyId: companyId, clientCompanyId: { not: companyId } },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
  ])

  const blocked = new Set(blocks.map((b) => b.targetId))
  for (const r of mine) if (r.status === 'BLOCKED') blocked.add(r.otherCompanyId)

  const network = new Set<string>()
  for (const r of mine) if (r.status === 'ACTIVE') network.add(r.otherCompanyId)
  for (const r of theirs) network.add(r.companyId)

  const panel = new Set<string>()
  for (const r of mine) if (r.status === 'ACTIVE' && r.relationship === 'SUPPLIER') panel.add(r.otherCompanyId)
  for (const a of asClient) panel.add(a.vendorId)
  for (const c of billed) panel.add(c.companyId)

  const trading = new Set<string>()
  for (const id of network) if (!panel.has(id)) trading.add(id)
  for (const a of asVendor) if (!panel.has(a.clientId)) trading.add(a.clientId)

  for (const s of [panel, trading, network]) {
    s.delete(companyId)
    for (const b of blocked) s.delete(b)
  }

  const belowPrimes = new Set(subs.map((s) => s.companyId))
  // A firm the company deals with directly is not hidden by also sitting
  // below somebody else.
  for (const id of panel) belowPrimes.delete(id)
  for (const id of trading) belowPrimes.delete(id)

  return { self: companyId, panel, trading, blocked, belowPrimes, network }
}

/** The job request, as the pool reads it. */
export interface PoolRequirement {
  id: string
  companyId: string
  payerCompanyId: string | null
  endClientCompanyId: string | null
}

/** Who the job request is submitted to. */
export function buyerOf(r: PoolRequirement): string {
  return r.payerCompanyId ?? r.companyId
}

export interface Pool {
  entries: PoolEntry[]
  /** A sentence about who was looked at, for the basis line on the screen. */
  says: string
}

/**
 * Everybody this viewer may be matched with on this job request.
 *
 * `suggest` is decided by the caller: true only for a client on its own
 * job request.
 */
export async function poolFor(
  requirement: PoolRequirement,
  viewerCompanyId: string,
  opts: { suggest: boolean; now?: Date } = { suggest: false }
): Promise<Pool> {
  const now = opts.now ?? new Date()
  const buyer = viewerCompanyId === buyerOf(requirement)
  const clientId = requirement.endClientCompanyId ?? buyerOf(requirement)
  const ties = await tiesOf(viewerCompanyId, now)

  // A firm that sells reaches a supplier's person only through its
  // register, which is the door the submission goes through.
  const reachTies: Ties = buyer
    ? ties
    : {
        ...ties,
        panel: new Set([...ties.panel].filter((id) => ties.network.has(id))),
        trading: new Set([...ties.trading].filter((id) => ties.network.has(id))),
      }
  const outside = [...reachTies.panel, ...reachTies.trading]

  const [submitted, barredHere, personBars] = await Promise.all([
    prisma.submission.findMany({ where: { requirementId: requirement.id }, select: { personId: true } }),
    prisma.blacklist.findMany({
      where: {
        companyId: viewerCompanyId, targetType: 'PERSON', liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { targetId: true },
    }),
    // The person's own "never send me there".
    prisma.doNotSubmit.findMany({ where: { companyId: clientId }, select: { personId: true } }),
  ])
  const excluded = new Set([
    ...submitted.map((s) => s.personId),
    ...barredHere.map((b) => b.targetId),
    ...personBars.map((d) => d.personId),
  ])

  const consultantSelect = {
    id: true, personId: true, headline: true, skills: true, location: true, workAuth: true,
    rateFloor: true, availableFrom: true, confirmedAt: true,
    person: { select: { name: true } },
  } as const

  // Listings: the viewer's own, every marketed one of a firm it deals
  // with, and — for a client on its own request — every marketed one
  // whose person said yes to being shown in matches. Always filtered by
  // company or by that yes; never the whole platform.
  const listingWhere = {
    revokedAt: null,
    state: 'GRANTED',
    consultant: { personId: { notIn: [...excluded] } },
    AND: [
      {
        OR: [
          { companyId: viewerCompanyId },
          ...(outside.length > 0 ? [{ companyId: { in: outside }, tier: 'MARKETING' as const }] : []),
          ...(opts.suggest ? [{ tier: 'MARKETING' as const, showInMatches: true }] : []),
        ],
      },
      // A stay the person chose, still running — or none chosen.
      { OR: [{ staysUntil: null }, { staysUntil: { gt: now } }] },
    ],
  }
  const listings = await prisma.benchListing.findMany({
    where: listingWhere,
    select: {
      companyId: true, tier: true, state: true, revokedAt: true, showInMatches: true, staysUntil: true,
      rateMin: true, rateMax: true, grantedAt: true, consultantId: true,
      company: { select: { name: true } },
      consultant: { select: consultantSelect },
    },
    take: 400,
  })

  const entries: PoolEntry[] = []
  for (const l of listings) {
    const reach = reachOf(l, reachTies, opts.suggest, now)
    if (!reach) continue
    entries.push({
      personId: l.consultant.personId,
      consultantId: l.consultantId,
      name: l.consultant.person.name,
      reach,
      employee: false,
      firmId: l.companyId,
      firmName: l.company.name,
      rateMin: l.rateMin,
      rateMax: l.rateMax,
      since: l.grantedAt,
      standing: null,
      consultant: l.consultant,
    })
  }

  // The viewer's own employees between projects, or coming off one soon —
  // for a firm that sells. A client's own staff are not contingent work.
  let noSkills = 0
  let busy = 0
  if (!buyer) {
    const own = await employeesFree(viewerCompanyId, excluded, now)
    noSkills = own.noSkills
    busy = own.busy
    entries.push(...own.entries)
  }

  const people = onePerPerson(entries)
  const count = (r: Reach) => people.filter((p) => p.reach === r).length
  const parts = [
    // A buyer holds no bench of its own worth counting at nought.
    ...(buyer && count('OWN') === 0 ? [] : [`${count('OWN')} of your own`]),
    `${count('PANEL')} from your suppliers`,
    `${count('TRADING')} from other firms you work with`,
  ]
  if (opts.suggest) parts.push(`${count('SUGGESTION')} suggested from firms you do not work with yet`)
  const tail: string[] = []
  if (noSkills > 0) tail.push(`${noSkills} of your employees have no skills on record, so matching cannot weigh them`)
  if (busy > 0) tail.push(`${busy} of your employees are on a project past the next month`)
  return {
    entries: people,
    says: `Looked at ${parts.join(', ')}.${tail.length ? ` ${tail.join('; ')}.` : ''}`,
  }
}

/** How far ahead a project's end still counts as coming off it. */
const ROLLING_OFF_DAYS = 30

/**
 * A firm's own employees who are free, or coming off a project within a
 * month, with skills on record.
 *
 * Standing is read off the work, never off the seat
 * (`standingOf` in `lib/consultant-portfolio`, the rule the payroll
 * roster reads). Nobody whose standing is unknown is called free.
 */
async function employeesFree(
  companyId: string,
  excluded: Set<string>,
  now: Date
): Promise<{ entries: PoolEntry[]; noSkills: number; busy: number }> {
  const seats = await prisma.context.findMany({
    where: {
      companyId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      personId: { notIn: [...excluded] },
    },
    select: {
      personId: true, grantedAt: true,
      role: { select: { name: true } },
      person: {
        select: {
          name: true,
          consultant: {
            select: {
              id: true, personId: true, headline: true, skills: true, location: true, workAuth: true,
              rateFloor: true, availableFrom: true, confirmedAt: true,
              person: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  const withProfile = seats.filter((s) => s.person.consultant && s.person.consultant.skills.length > 0)
  const noSkills = new Set(seats.filter((s) => !(s.person.consultant && s.person.consultant.skills.length > 0)).map((s) => s.personId)).size
  const ids = [...new Set(withProfile.map((s) => s.personId))]
  if (ids.length === 0) return { entries: [], noSkills, busy: 0 }

  const [sells, buys, company] = await Promise.all([
    prisma.sellContract.findMany({
      where: {
        companyId, personId: { in: ids },
        state: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] },
      },
      select: {
        personId: true, state: true, startDate: true, endDate: true,
        clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
      },
    }),
    prisma.buyContractCandidate.findMany({
      where: {
        personId: { in: ids }, state: { in: ['ACTIVE', 'ENDED'] },
        buyContract: { companyId, state: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] } },
      },
      select: { personId: true, startDate: true, endDate: true, state: true, buyContract: { select: { state: true } } },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ])

  const lines = new Map<string, RosterLine[]>()
  const add = (id: string, l: RosterLine) => lines.set(id, [...(lines.get(id) ?? []), l])
  for (const c of sells) {
    add(c.personId, {
      live: c.state === 'IN_PROGRESS' || c.state === 'PAUSED',
      paused: c.state === 'PAUSED',
      startsOn: c.startDate ?? null,
      endsOn: c.endDate ?? null,
      clientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
    })
  }
  for (const b of buys) {
    const s = b.buyContract.state
    add(b.personId, {
      live: b.state === 'ACTIVE' && (s === 'IN_PROGRESS' || s === 'PAUSED'),
      paused: s === 'PAUSED',
      startsOn: b.startDate ?? null,
      endsOn: b.endDate ?? null,
      clientName: null,
    })
  }

  const soon = new Date(now.getTime() + ROLLING_OFF_DAYS * 86_400_000)
  const entries: PoolEntry[] = []
  let busy = 0
  const seen = new Set<string>()
  for (const s of withProfile) {
    if (seen.has(s.personId)) continue
    seen.add(s.personId)
    const mine = lines.get(s.personId) ?? []
    const verdict = standingOf(
      { personId: s.personId, name: s.person.name, seat: s.role?.name ?? null, practice: null, skills: s.person.consultant!.skills, listed: false, lines: mine },
      now
    )
    const comingOff =
      verdict.standing === 'ON_PROJECT' &&
      mine.some((l) => l.live && !l.paused && l.endsOn != null && l.endsOn <= soon) &&
      !mine.some((l) => l.live && (l.endsOn == null || l.endsOn > soon))
    if (!verdict.free && !comingOff) {
      if (verdict.standing === 'ON_PROJECT' || verdict.standing === 'STARTING_SOON') busy++
      continue
    }
    const c = s.person.consultant!
    entries.push({
      personId: s.personId,
      consultantId: c.id,
      name: s.person.name,
      reach: 'OWN',
      employee: true,
      firmId: companyId,
      firmName: company?.name ?? 'your firm',
      rateMin: null,
      rateMax: null,
      since: s.grantedAt ?? null,
      standing: verdict.says,
      consultant: c,
    })
  }
  return { entries, noSkills, busy }
}
