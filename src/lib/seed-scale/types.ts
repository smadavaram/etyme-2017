/**
 * The generated world at the founder's scale: the contract the five
 * folders build against. Types and constants only; nothing here reads a
 * database or runs a step.
 *
 * Laid first and alone (docs/seed-scale-brief.md, section 5.3), so the
 * architect's frame and the four domain folders can be written at the
 * same time:
 *
 *   lib/seed-scale/{kit,industries,frame,index}   architect
 *   lib/seed-scale/people                         supply
 *   lib/seed-scale/papers                         regulatory
 *   lib/seed-scale/jobs                           demand
 *   lib/seed-scale/rates                          money (pure half first)
 *
 * The nine decisions behind it are in CLAUDE.md, "Nine decisions for the
 * generated world" (2026-10-20): a separate sealed template beside the
 * base one; a client's panel holds six to twelve suppliers and an MSP
 * runs five of the ten clients; ended careers carry no cycles; live
 * placements get the order header only; every generated address ends
 * `.scale.invalid`; generated ids sort after the base world's.
 */

import type { Share } from '@/lib/seed-steps'

export type { Share }

// ── Words ─────────────────────────────────────────────────────────────

/** As Prisma's `CompanyKind`. */
export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

/** The four industries the vocabulary covers. Kept in code: there is no industry column. */
export type IndustryKey = 'IT' | 'HEALTHCARE' | 'MANUFACTURING' | 'FINANCE'

export const INDUSTRY_KEYS: readonly IndustryKey[] = ['IT', 'HEALTHCARE', 'MANUFACTURING', 'FINANCE']

/** Where a firm sits on a deal. Kind alone cannot tell a prime from a sub-vendor. */
export type Position = 'CLIENT' | 'GSI' | 'MSP' | 'PRIME' | 'SUB_VENDOR' | 'BENCH' | 'SOLO'

// ── Sizes ─────────────────────────────────────────────────────────────

/** The headline sizes, in one place, so no file hard-codes a count. */
export const SCALE = {
  clients: 10,
  gsis: 10,
  msps: 5,
  suppliers: 100,
  /** The three sum to `suppliers`. */
  primes: 30,
  subVendors: 40,
  benchFirms: 30,
  people: 2000,
  /** Suppliers per client (section 6.4, loop 1). */
  panelSize: { min: 6, max: 12 },
  /** Clients an MSP runs through a `ProgramSeat`; the rest run their own program. */
  mspRuns: 5,
} as const

export type ScaleSizes = typeof SCALE

// ── Addresses, slugs and keys ─────────────────────────────────────────

/**
 * Every generated person's address ends here. A reserved name nobody can
 * register (`.invalid`), and one the four base-world reads that sweep
 * reserved suffixes exclude, so the base world's counts do not move.
 */
export const SCALE_EMAIL_SUFFIX = '.scale.invalid'

/** The domain under it: `<first>.<last>.<nnnn>@people.scale.invalid`. */
export const SCALE_EMAIL_DOMAIN = `people${SCALE_EMAIL_SUFFIX}`

/**
 * Every generated firm's slug begins here: `world-sx-<kind>-<nn>-<handle>`.
 * It must begin `world-` for the demo door and the catalog to open it,
 * and it is never in `WORLD_SLUGS`, so the roster-scoped base steps do
 * not walk it.
 */
export const SCALE_SLUG_PREFIX = 'world-sx-'

/**
 * The prefix of every stable key a deterministic id is derived from
 * (`sx/person/0412`, `sx/firm/prime/07`). The id itself is made by
 * `idFor` in the kit and sorts after the base world's.
 */
export const SCALE_KEY_PREFIX = 'sx/'

/** The version stamped on every generated step's marker; bump it to re-walk them all. */
export const SCALE_VERSION = 1

// ── The vocabulary ────────────────────────────────────────────────────

export type Seniority = 'JUNIOR' | 'MID' | 'SENIOR'

export interface RoleTemplate {
  /** A licensed title contains the occupation word ("nurse", "therapist"), so the licensed packet is picked. */
  title: string
  /** Each at least four letters, used verbatim by people and jobs. */
  skills: string[]
  seniority: Seniority
  licensed: boolean
}

/** For a bench firm: a skill family and the course it trains people on. */
export interface Niche {
  key: string
  label: string
  skills: string[]
  course: { title: string; hours: number; priceCents: number }
}

export interface Industry {
  key: IndustryKey
  /** The closed vocabulary. */
  roles: RoleTemplate[]
  places: string[]
  /** Invented; checked against real company names (lib/positioning). */
  firmStems: string[]
  niches: Niche[]
}

// ── The frame: firms, seats, trades ───────────────────────────────────

/** A seat the stations can sit in. */
export interface ScaleSeat {
  personId: string
  /** Ends `SCALE_EMAIL_SUFFIX`. */
  email: string
  name: string
  /** The role's own name, e.g. "Hiring Manager". */
  role: string
  /** The demo role key it opens as; null for a discipline role. */
  roleKey: string | null
  companyId: string
  /** Strictly increasing per firm; the Owner is first. */
  grantedAt: Date
}

export interface ScaleFirm {
  index: number
  /** Deterministic. */
  id: string
  /** Begins `SCALE_SLUG_PREFIX`. */
  slug: string
  name: string
  kind: CompanyKind
  position: Position
  /** Written explicitly on every supplier, which no seed did before. */
  posture: 'PRIME' | 'BENCH' | null
  industries: IndustryKey[]
  /** Bench firms only: the niche key. */
  niche: string | null
  /** Where the firm is registered. Its sites may be elsewhere. */
  country: 'US'
  /**
   * Where its people work, the head office first: a client with a US head
   * office and an India or UK site, an integrator with an offshore one.
   * A site has a country and nothing else yet (CLAUDE.md, "A site has a
   * country and a time zone", 2026-10-20); its holidays are the company's
   * `Holiday` rows marked with that country.
   */
  sites: ScaleSite[]
  /** Owner first. */
  seats: ScaleSeat[]
  /** The first seat holding this demo role key, or null. */
  seat(roleKey: string): ScaleSeat | null
  /** Clients only. */
  program?: {
    orgUnitIds: Record<string, string>
    costCenterIds: string[]
    approverId: string
    hiringManagerId: string
  }
}

/** One place a firm's people work: a `CompanyLocation`. */
export interface ScaleSite {
  /** Deterministic; the head office's is passed to `createCompany`. */
  id: string
  name: string
  /** Two letters. */
  country: 'US' | 'IN' | 'GB'
  city: string
  primary: boolean
}

/**
 * One tie on the register; `seedFrame` writes both rows, the way the base
 * world does:
 *
 *   CLIENT  a supplier sells to a client: its row says CLIENT, the client's SUPPLIER
 *   PRIME   a supplier sells to a supplier: its row says PRIME, the buyer's SUPPLIER
 *   MSP     a supplier sells into a client an MSP runs: its row says MSP, the MSP's SUPPLIER
 *   RUNS    an MSP runs a client's program: its row says CLIENT, the client's MSP
 */
export interface Trade {
  /** Firm id: the supplier, or the MSP on a RUNS tie. */
  seller: string
  /** Firm id: the client, the prime, or the MSP on an MSP tie. */
  buyer: string
  relationship: 'CLIENT' | 'PRIME' | 'MSP' | 'RUNS'
  tier: 'PROBATION' | 'APPROVED' | 'PREFERRED' | null
  agreementId: string | null
  /** False by default: a sub-vendor's name is the prime's to keep. */
  disclosesSubVendors: boolean
}

export interface ScaleFrame {
  firms: ScaleFirm[]
  byId: Map<string, ScaleFirm>
  bySlug: Map<string, ScaleFirm>
  byPosition(p: Position): ScaleFirm[]
  trades: Trade[]
  /** The suppliers a client sends jobs to: six to twelve. */
  panelOf(clientId: string): ScaleFirm[]
  primesOf(subId: string): ScaleFirm[]
  subsOf(primeId: string): ScaleFirm[]
  mspOf(clientId: string): ScaleFirm | null
  industries: Industry[]
  /** The day the base world was born; every generated date counts from it. */
  clock: { birthday: Date }
}

// ── People ────────────────────────────────────────────────────────────

/** The careers the 2,000 are drawn from (section 2.2 and 2.4). */
export type Career =
  /** Just trained by a bench firm; no contracts yet. */
  | 'FRESHER'
  /** Ten years in, two to four ended lines, free now. */
  | 'BETWEEN_PROJECTS'
  /** Left a bench for a one-person company of their own. */
  | 'OWN_COMPANY'
  /** On a live line, or employed, and open to the next thing. */
  | 'LOOKING_WHILE_EMPLOYED'
  /** On a live placement today. */
  | 'PLACED'
  /** Invited and unanswered, declined, or lapsed. */
  | 'OTHER'

/** The mix of the 2,000, as shares that sum to one. Tunable here and nowhere else. */
export const CAREER_MIX: Readonly<Record<Career, number>> = {
  FRESHER: 0.25,
  BETWEEN_PROJECTS: 0.25,
  OWN_COMPANY: 0.08,
  LOOKING_WHILE_EMPLOYED: 0.15,
  PLACED: 0.2,
  OTHER: 0.07,
}

/** Of the 2,000, the W2 staff of the ten integrators (an EMPLOYEE seat and a profile, no listing). */
export const GSI_STAFF = 400

/** At most this share of people sits within two months of a client's time limit, or matching starves. */
export const NEAR_TIME_LIMIT_SHARE = 0.05

export type WorkAuth = 'CITIZEN' | 'GREEN_CARD' | 'H1B' | 'OPT' | 'TN' | 'OTHER'

/** One ended or live line in a person's history, as the papers and the rates read it. */
export interface LineEnd {
  /** The client the person worked at. */
  clientId: string
  /** The firm that employed the person on it. */
  employerId: string
  start: Date
  end: Date
  live: boolean
}

/**
 * One generated person, as `people` builds them. Deterministic, so
 * `buildPeople(frame)` returns them without a read and `papers` reads
 * them before any row exists.
 */
export interface PersonFacts {
  id: string
  /** Ends `SCALE_EMAIL_SUFFIX`. */
  email: string
  name: string
  career: Career
  industry: IndustryKey
  role: RoleTemplate
  skills: string[]
  workAuth: WorkAuth
  /** Where the person themselves sits: the US, India, the UK or Australia. */
  country: 'US' | 'IN' | 'GB' | 'AU'
  /** The firm whose bench or payroll they are on; their own company for OWN_COMPANY. */
  firmId: string
  /** Where they are listed for marketing, and how. Null for a GSI's own staff. */
  listing: { firmId: string; tier: 'MARKETING' | 'RETAINED'; askFirst: boolean } | null
  lineEnds: LineEnd[]
}

// ── Rates (money's pure half builds these) ────────────────────────────

/** A pay range in cents per hour. */
export interface Band {
  minCents: number
  maxCents: number
  currency: 'USD'
}

/** One line's two rates: what the firm bills above it, and what it pays below it. */
export interface RatePair {
  billCents: number
  payCents: number
  currency: 'USD'
}

/**
 * The rates down a chain, top first: the client pays rung 0 and each
 * rung keeps the gap to the next. Never shown across rungs.
 */
export type ChainRates = number[]

/** What a client asks for a role: the band on the job's invitation, never on the job. */
export type BandFor = (role: RoleTemplate, industry: IndustryKey) => Band
/** Rung rates for a placement `rungs` deep, inside the band. */
export type ChainFor = (band: Band, rungs: number, key: string) => ChainRates
/** One line's bill and pay rate, for a person at one rung. */
export type PairFor = (person: Pick<PersonFacts, 'id' | 'role' | 'industry'>, rung: number, rungs: number) => RatePair
/** The range a person is listed at on a bench. */
export type ListingRate = (person: Pick<PersonFacts, 'id' | 'role' | 'industry'>) => Band
/** The lowest rate a person will take, which the sift compares with a job's top rate. */
export type FloorFor = (person: Pick<PersonFacts, 'id' | 'role' | 'industry'>) => number

// ── What each folder exports ──────────────────────────────────────────

/** `lib/seed-scale/frame`. */
export type BuildFrame = () => ScaleFrame
export type SeedFrame = (frame: ScaleFrame) => Promise<void>
export type LoadFrame = () => Promise<ScaleFrame>
export type EnsureSolo = (frame: ScaleFrame, personId: string, name: string) => Promise<ScaleFirm>

/** `lib/seed-scale/people` (supply). */
export type BuildPeople = (frame: ScaleFrame) => PersonFacts[]
export type SeedPeople = (frame: ScaleFrame, share?: Share) => Promise<void>
/** `lib/seed-scale/papers` (regulatory). */
export type SeedPapers = (frame: ScaleFrame, people: PersonFacts[], share?: Share) => Promise<void>
/** `lib/seed-scale/jobs` (demand). */
export type SeedJobs = (frame: ScaleFrame, share?: Share) => Promise<void>
/** `lib/seed-scale/rates` (money). */
export type SeedRates = (frame: ScaleFrame, share?: Share) => Promise<void>

/** The most rows one `createMany` writes: 500 rows of 30 columns stays under the bind limit. */
export const BATCH_ROWS = 500

/** The most queries one step may ask, fresh or re-walked (`__integration__/seed-step-size.test.ts`). */
export const STEP_QUERY_BUDGET = 350
