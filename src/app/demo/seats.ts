/**
 * The doors on /demo, as data.
 *
 * They were written inline on the page, so nothing could check them
 * against the world they claim to describe. A seat that names a company
 * the seed does not build is a demo page that 404s on a click, and the
 * founder found exactly that: he was told to open /demo and sit at
 * Teleworld, and Teleworld was not on the page at all.
 *
 * Everything here is true of the seeded world (lib/seed-world,
 * lib/seed-programmes) and `__integration__/demo-seats.test.ts` walks
 * every slug below into a real company of the kind the words claim.
 *
 * `slug` is the company slug in the seeded world — the seed writes every
 * firm with a `world-` prefix, so `teleworld` in the seed list is
 * `world-teleworld` here, which is what POST /api/demo accepts.
 *
 * The slugs and the names deliberately disagree. Three of these firms
 * were named after real enterprises, which on a public page reads as
 * three live customers who have never heard of us; the names are
 * invented now (`docs/demo-names.md`) and the slugs stay, because a
 * slug is an address nobody reads and changing it would break every
 * integration test and every `POST /api/demo` body written down
 * anywhere. `__tests__/invariants/demo-names.test.ts` refuses the old
 * names coming back, here and in the seeds.
 */

import type { Program } from './desk-picker'

/**
 * The three enterprise programs, each with a desk per job.
 *
 * These get the desk list: a client is four or five jobs rather than one
 * seat, and the point of the door is to find your own work on it.
 */
export const CLIENT_PROGRAMS: Program[] = [
  {
    slug: 'world-nike',
    name: 'Northbend Athletic',
    where: 'Tualatin, OR',
    about:
      'Three suppliers, one of them supplying through a bench vendor it never names. ' +
      'A planning analyst on her second supplier here, fourteen months into an eighteen-month cap.',
  },
  {
    slug: 'world-corning',
    name: 'Cavanaugh Glassworks',
    where: 'Elmira, NY',
    about:
      'A glass plant hiring validation, MES and quality people. A supplier whose liability ' +
      'certificate runs out in twelve days, and a past contractor who is clear to come back.',
  },
  {
    slug: 'world-terumo-bct',
    name: 'Talvern Medical',
    where: 'Westminster, CO',
    about:
      'A medical device maker. One SAP consultant is twenty-three months on site across two ' +
      'suppliers, against a cap of eighteen — a number neither supplier can see.',
  },
]

/**
 * The firms that supply them. One seat each, and both halves of each
 * firm's book named on the door.
 *
 * Every one of these sells upward and buys downward, and the door used
 * to name only the selling. A staffing firm reading "sells into two
 * clients" sees half a product and the half it already has software
 * for; the half nobody sells it is the one where it is the customer —
 * the leg below, the bill from it, the paperwork it is chasing.
 */
export const SUPPLIER_SEATS: Program[] = [
  {
    slug: 'world-computer-systems',
    name: 'Computer Systems Inc',
    where: 'Prime supplier',
    about:
      'Sells Helena Marsh into Northbend Athletic and a lab analyst into a hospital, where a screen ' +
      'is in the diary this week. Buys Helena from a bench vendor the client never learns about, ' +
      'and that firm’s bill for four weeks is sitting unpaid.',
  },
  {
    slug: 'world-vertex-global',
    name: 'Vertex Global',
    where: 'Prime supplier',
    about:
      'Sells into Cavanaugh Glassworks and Talvern Medical, with a week of a validation ' +
      'engineer’s hours filed and waiting on the plant to sign it. Buys that same engineer from ' +
      'a bench vendor below, at the gap it keeps.',
  },
  {
    slug: 'world-cloudepa',
    name: 'CloudEPA',
    where: 'Sub-vendor, two rungs down',
    about:
      'Sells only to the prime above it — a consultant of its own is shortlisted there and a ' +
      'screen is booked — and never learns which hospital the seat is at. Buys nobody, because ' +
      'it employs them: the I-9 it asked its own consultant for six days ago is still not back.',
  },
]

/**
 * The program office that is not the client.
 *
 * An MSP runs a client’s program, and the seed used to give it no
 * contracts at all on the theory that an MSP routes work and takes no
 * rate. That is one kind of MSP. The ordinary kind sells to its client
 * and buys below it — including from itself, when the person on the
 * seat is its own employee, which is the INTERNAL submission with no
 * bench listing and no purchase order anywhere.
 *
 * Its navigation is the vendor’s: CLAUDE.md specifies a nav per
 * company type and names no MSP, so it falls through rather than
 * inventing one nobody asked for.
 */
export const PROGRAM_OFFICE_SEATS: Program[] = [
  {
    slug: 'world-aptiva',
    name: 'Aptiva Workforce',
    where: 'Managed program office',
    about:
      'Runs a hospital’s contingent program and staffs part of it off its own payroll. Sell side: ' +
      'two weeks of its analyst’s hours are signed by both parties and nobody has invoiced them. ' +
      'Buy side: a third week the hospital has signed is waiting on Aptiva to accept it as the employer.',
  },
]

/**
 * The two integrators, who staff a client seat off their own payroll.
 *
 * A GSI is the one firm that sells a person it already employs, so it
 * has no bench listing to grant and nobody's consent to ask — the
 * employment contract already said it. That is the INTERNAL submission
 * path, and these two seats are the only place in the demo where it can
 * be walked.
 *
 * Both sit at the delivery manager's desk, because that is the desk that
 * submits.
 */
export const INTEGRATOR_SEATS: Program[] = [
  {
    slug: 'world-teleworld',
    name: 'Teleworld Solutions',
    where: 'Systems integrator',
    about:
      'Sunil Raghavan runs delivery, with four people on his own payroll between projects. Sell ' +
      'side: Corveldt Aerospace has an open DO-178C seat and Karthik Menon, three weeks off an ' +
      'avionics program, fits it — submit him with no bench listing anywhere. Buy side: the ' +
      'engineer already on that program is bought from a bench vendor, whose bill is unpaid.',
  },
  {
    slug: 'world-sundara',
    name: 'Sundara Systems',
    where: 'Systems integrator',
    about:
      'Lakshmi Iyer has the same four disciplines idle between projects. Sell side: the same ' +
      'Corveldt avionics seat is open to Sundara at a band of its own, and Aditi Ramaswamy fits ' +
      'it. Buy side: its validation engineer at Talvern Medical is bought from a bench vendor, ' +
      'and the client above has never been told that firm exists.',
  },
]

/**
 * The four people, each a door of their own.
 *
 * ── Why a person is a door ───────────────────────────────────────────
 *
 * Every other seat on this page is a company, and the consultant is the
 * one party to a placement who is not one. The only way to look around
 * as a candidate was to mint a private throwaway workspace with a
 * random Java developer in it — one profile, invisible to everybody
 * else, unconnected to the world the other doors open onto. So the
 * third side of this market could not be shown against the same
 * placement the client and the supplier were looking at.
 *
 * These four are people the world already holds, in four industries, on
 * four different kinds of paper:
 *
 *   employed by an integrator (W2) · listed on a bench through a prime ·
 *   two rungs down a chain on an H1B · corp to corp through a limited
 *   company she owns
 *
 * The fourth is the one that proves the horizontal claim. A travel nurse
 * is not IT staffing, and CLAUDE.md has said since the beginning that
 * nothing in the core may assume it — while every seeded person in this
 * world wrote software. She works three twelve-hour shifts, invoices
 * through her own company, and the document her assignment rests on is a
 * license from a state board that runs out inside the month.
 *
 * Each lands on `/dashboard/my-work`, which is that person's own page and
 * not any company's. `email` is the seeded address the door sits at;
 * `POST /api/demo {"person":"<slug>"}` is how it is taken, and the route
 * reads this list rather than trusting an address off the wire.
 */
export interface CandidateSeat extends Program {
  /** The seeded person this door sits at. Never typed in by a visitor. */
  email: string
}

export const CANDIDATE_SEATS: CandidateSeat[] = [
  {
    slug: 'karthik-menon',
    name: 'Karthik Menon',
    where: 'Aerospace · DO-178C verification',
    email: 'karthik.menon@seed.etyme.invalid',
    about:
      'On an integrator’s own payroll, not on anybody’s bench — nobody asks your permission to ' +
      'be staffed, because the employment contract already did. Three months of avionics ' +
      'software assurance ended three weeks ago, four weeks of it signed by both sides, and the ' +
      'client has an open DO-178C seat your employer has not put you forward for yet.',
  },
  {
    slug: 'helena-marsh',
    name: 'Helena Marsh',
    where: 'Apparel · SAP S/4 finance lead',
    email: 'helena.marsh@seed.etyme.invalid',
    about:
      'Listed on a bench vendor’s books and sold on to a sportswear company by the prime above ' +
      'it, which is the firm the client thinks employs you. Two hundred days on site against an ' +
      'eighteen-month cap, and the week you filed is still waiting for somebody to sign it.',
  },
  {
    slug: 'chidi-okafor',
    name: 'Chidi Okafor',
    where: 'Medical device · CSV and 21 CFR Part 11',
    email: 'chidi.okafor@seed.etyme.invalid',
    about:
      'Two rungs down a chain on an H1B: a bench vendor employs you, an integrator sells you, a ' +
      'device maker signs your hours. Three weeks are signed and billed, and the client has asked ' +
      'you for a site access and data integrity attestation nobody else can sign for you.',
  },
  {
    slug: 'colleen-byrne',
    name: 'Colleen Byrne',
    where: 'Healthcare · ICU travel nurse',
    email: 'colleen.byrne@seed.etyme.invalid',
    about:
      'Thirteen weeks in a hospital ICU, three twelve-hour shifts a week, paid corp to corp ' +
      'through the limited company you own — so your company carries the liability cover, not ' +
      'the agency. Your state license runs out in twenty-four days, inside the assignment, and ' +
      'the renewal has been asked for and not filed.',
  },
]

/** Every company door on the page, for anything that has to check them all. */
export const ALL_SEATS: Program[] = [
  ...CLIENT_PROGRAMS,
  ...SUPPLIER_SEATS,
  ...PROGRAM_OFFICE_SEATS,
  ...INTEGRATOR_SEATS,
]
