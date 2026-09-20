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

/**
 * One door: a firm or a person, with a place and a sentence.
 *
 * It lived in the picker, which meant the data imported the component
 * that drew it. The shape of a door is the seat list's own business and
 * the drawing is not, so it is here and the picker reads it.
 */
export interface Program {
  slug: string
  name: string
  where: string
  about: string
}

/**
 * The three enterprise programs, each with a desk per job.
 *
 * These get the desk list: a client is four or five jobs rather than one
 * seat, and the point of the door is to find your own work on it.
 */
export interface ClientProgram extends Program {
  /**
   * What is on a desk at this program today.
   *
   * Not a promise and not a brochure line: every one of these is a row
   * in the seeded world, and `__integration__/demo-seats.test.ts` goes
   * and finds it. A sentence on a door that the world behind the door
   * does not hold is the worst thing this page can do, because the
   * visitor clicks it.
   */
  waiting: string
}

export const CLIENT_PROGRAMS: ClientProgram[] = [
  {
    slug: 'world-nike',
    name: 'Northbend Athletic',
    where: 'Tualatin, OR',
    waiting:
      'A 44-hour week is waiting for a signature — four hours over what the role allows.',
    about:
      'Three suppliers, one of them supplying through a bench vendor it never names. ' +
      'A planning analyst on her second supplier here, fourteen months into an eighteen-month cap.',
  },
  {
    slug: 'world-corning',
    name: 'Cavanaugh Glassworks',
    where: 'Elmira, NY',
    // What this door said until 2026-09-20 was a supplier whose liability
    // certificate runs out in twelve days, and it was not true of the
    // world behind the door: `cover()` in lib/seed-programmes skips a
    // firm that already holds a certificate, and every firm in the base
    // world holds one running to next spring. So the per-client `cover`
    // map is inert for any supplier the world seeded first — the only
    // cover running out anywhere is Brightmoor's, twenty days off, at
    // the program above. Said here rather than quietly dropped: the
    // seed is the fix, and it is not this change's.
    waiting:
      'One contractor is on site on a purchase order with no agreement behind it at all, and ' +
      'somebody starts in ten days with no I-9 on file.',
    about:
      'A glass plant hiring validation, MES and quality people. A week of a validation ' +
      'engineer’s hours is waiting on the plant to sign it, and a past contractor is out long ' +
      'enough to be asked back.',
  },
  {
    slug: 'world-terumo-bct',
    name: 'Talvern Medical',
    where: 'Westminster, CO',
    waiting:
      'One consultant is twenty-three months on site across two suppliers, against a cap of ' +
      'eighteen — a number neither supplier can produce.',
    // The tenure number is the line above; repeating it here put the same
    // sentence twice on one card, which a reader notices before anything
    // else on it. This says what else is on the desks.
    about:
      'A medical device maker hiring SAP, validation and regulatory people through three ' +
      'suppliers. A week of hours is filed and waiting, an invoice is out, and somebody ' +
      'starts in five days with no I-9 on file.',
  },
]

/**
 * The desks at a client program, in the words of the person at each.
 *
 * A program is not one seat. It is a manager who needs somebody, a lead
 * who signs for the money, a clerk who pays what matched and an officer
 * who answers for tenure — and each of them judges a product by sitting
 * at their own desk and finding their own work waiting. So the door
 * says which desk, and each lands on its own queue.
 *
 * `desk` is the suffix on the seeded address — the company's own slug
 * with `-ap@` after it is its AP clerk — and it travels as
 * `POST /api/demo {"as":…,"desk":…}`. The empty one is the first seat,
 * which holds everything: the founder wanted to try what an account
 * owner does, add a person and name them a desk, without a seed doing
 * it first.
 *
 * It lives here rather than inside the picker so a test can walk every
 * chip on the page into the route and find out whether it seats
 * anybody. It did not, and a desk the route does not know is a chip
 * that answers a click with an error.
 */
export interface ClientDesk {
  /** The address suffix. British, and staying so — an address is not a word anybody reads. */
  desk: string
  /** What the chip says. */
  label: string
  /** What is on that desk when they get there. */
  waiting: string
}

export const CLIENT_DESKS: ClientDesk[] = [
  { desk: 'programme', label: 'Program manager',
    waiting: 'Runs the program. Sets the rules, chooses the suppliers, sees the spend.' },
  { desk: 'hiring', label: 'Hiring manager',
    waiting: 'Needs somebody. A week of hours is waiting for your signature.' },
  { desk: 'hr', label: 'HR partner',
    waiting: 'A requisition over the headcount plan is waiting for your read of the role.' },
  { desk: 'procurement', label: 'Procurement lead',
    waiting: 'A requisition is waiting for you to say which suppliers may see it.' },
  { desk: 'vp', label: 'Approver',
    waiting: 'A requisition over the $250k line is in your queue.' },
  { desk: 'ap', label: 'AP clerk',
    waiting: 'An invoice has matched the hours and is waiting to be paid.' },
  { desk: 'compliance', label: 'Compliance officer',
    waiting: 'Tenure across every supplier, and whose paperwork is not on file.' },
  { desk: '', label: 'Account owner',
    waiting: 'People, roles and desks. Add someone, make them HR for a unit, and watch a requisition find them.' },
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
 * The five people, each a door of their own.
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
 * These five are people the world already holds, in five industries, on
 * five different kinds of paper:
 *
 *   employed by an integrator (W2) · listed on a bench through a prime ·
 *   two rungs down a chain on an H1B · nothing at all, yet · corp to corp
 *   through a limited company she owns
 *
 * The travel nurse is the one that proves the horizontal claim. A nurse
 * is not IT staffing, and CLAUDE.md has said since the beginning that
 * nothing in the core may assume it — while every seeded person in this
 * world wrote software. She works three twelve-hour shifts, invoices
 * through her own company, and the document her assignment rests on is a
 * license from a state board that runs out inside the month.
 *
 * The fourth is the one that was missing until 2026-09-20, and this
 * page said so in a paragraph where a door should have been. Party 8B
 * in the lane drawings: a person with a profile, a page of their own
 * and nothing else — no bench listing, no employer, no corporation, no
 * submission anywhere. It is not an exotic case. It is what `POST
 * /api/onboarding` leaves every consumer-email sign-in holding on day
 * one, which makes it the first screen a real consultant ever sees, and
 * the only one the demo could not open. Her door is deliberately the
 * emptiest on the page; filling it would make her somebody else.
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
    slug: 'marisol-quintero',
    name: 'Marisol Quintero',
    where: 'Industrial automation · PLC and SCADA commissioning',
    email: 'marisol.quintero@seed.etyme.invalid',
    about:
      'Nobody employs you, nobody lists you, you have incorporated nothing, and not one ' +
      'submission anywhere carries your name — which is what this product leaves a consultant ' +
      'holding on the day they sign in. What you have is a page you turned on yourself and a ' +
      'choice: grant a firm a bench listing and let it market you, or incorporate and sell ' +
      'yourself. Etyme places nobody, so nothing here happens until you make it.',
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
