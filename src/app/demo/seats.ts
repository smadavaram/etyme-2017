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
  /**
   * The industry, or the kind of work a firm supplies, drawn on its own
   * line under the name. The founder, 2026-09-29: "Put the industry
   * under each demo company, so people know which industries can use
   * it." A field rather than words in the prose, so every door says it
   * the same way and a test can find it. Read off the seeded roles, not
   * chosen for the spread.
   */
  industry: string
  /**
   * What is waiting behind this door today — one or two short sentences.
   * A client program's is checked against the seeded world.
   */
  waiting: string
  /** Who they are, in one or two short sentences. */
  about: string
  /**
   * The desks at this firm, where it seats more than one person.
   *
   * A client program has always drawn a row of desks; a supplier drew
   * one button, because a supplier seated one person. Brightmoor
   * Staffing seats nine now, so the door for a firm carries the same
   * row when there is one to carry.
   */
  desks?: ClientDesk[]
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

/*
 * Plain English, the founder, 2026-09-29: every line on these doors is
 * read by people in India, the US, the UK and Australia, many of them
 * not native speakers. Short sentences, common words, one idea each; no
 * sentence past twenty-five words (`demo-door.test.ts` counts). Facts
 * and numbers stay exactly as the seed has them.
 */

export const CLIENT_PROGRAMS: ClientProgram[] = [
  {
    slug: 'world-nike',
    name: 'Northbend Athletic',
    where: 'Tualatin, OR',
    industry: 'Retail · apparel',
    waiting:
      'A 44-hour week is waiting for a signature. That is four hours over what the job allows.',
    about:
      'Three suppliers. One buys from a bench vendor, a firm with workers waiting for a project, ' +
      'and never names it. A planning analyst on her second supplier here is fourteen months ' +
      'into an eighteen-month time limit.',
  },
  {
    slug: 'world-corning',
    name: 'Cavanaugh Glassworks',
    where: 'Elmira, NY',
    industry: 'Manufacturing · glass',
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
      'One contractor works on a purchase order with no agreement behind it. Another starts ' +
      'in ten days with no US work form (I-9) on file.',
    about:
      'A glass plant hiring validation, manufacturing systems and quality people. A validation ' +
      'engineer’s week is waiting for the plant to sign it. A past contractor has been gone ' +
      'long enough to be asked back.',
  },
  {
    slug: 'world-terumo-bct',
    name: 'Talvern Medical',
    where: 'Westminster, CO',
    industry: 'Healthcare · medical devices',
    waiting:
      'One consultant is twenty-three months on site across two suppliers. The time limit is ' +
      'eighteen. Neither supplier can produce that number.',
    // The tenure number is the line above; repeating it here put the same
    // sentence twice on one card, which a reader notices before anything
    // else on it. This says what else is on the desks.
    about:
      'A medical device maker hiring finance, validation and regulatory people through three ' +
      'suppliers. A week of hours is filed and waiting. A supplier has sent its bill. ' +
      'Somebody starts in five days with no I-9 on file.',
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
    waiting: 'A job request over the headcount plan is waiting for you to review the job.' },
  { desk: 'procurement', label: 'Procurement lead',
    waiting: 'A job request is waiting for you to say which suppliers may see it.' },
  { desk: 'vp', label: 'Approver',
    waiting: 'A job request over $250k is in your queue. Your yes is one of two.' },
  { desk: 'ap', label: 'AP clerk',
    waiting: 'A bill has matched the hours and is waiting to be paid.' },
  { desk: 'compliance', label: 'Compliance officer',
    waiting: 'How long each person has been on site, across every supplier, and whose paperwork is missing.' },
  // The second half of the final word, said out loud.
  //
  // A client's final rank is two desks, not one: the approver, and
  // whoever owns the cost center the money is coded to. At all three
  // programs the cost center's owner is the account owner, so this chip
  // is the only door to the last yes on an over-threshold requisition —
  // and it said nothing about it. The release walk read that as "no desk
  // key seats him" and concluded raise-to-award could not be finished
  // from the demo. It can: HR, then the approver, then here, and the
  // requisition goes OPEN. What was missing was the sentence, which is
  // the same failure as a menu entry the route will refuse, facing the
  // other way — a door that opens onto work it does not name.
  //
  // `__integration__/demo-seats.test.ts` walks those three doors into a
  // published requisition, so a desk that stops being the last yes
  // breaks the build rather than the founder's walk.
  { desk: '', label: 'Account owner',
    waiting: 'People, roles and desks. And the last yes on the job request over $250k, after the approver.' },
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
/**
 * The desks a supplier runs on, in its own words.
 *
 * A staffing firm is not one seat either. It has somebody who owns the
 * client relationship, somebody who finds people, somebody who owns the
 * bench, somebody who papers the deal, somebody who bills, somebody who
 * pays and somebody who chases the certificates — and each of those is
 * a different morning. All nine existed as roles in
 * `lib/company-defaults`, every one of them was held by nobody in the
 * seeded world, and so none could be opened from this page at all
 * (the browser walk, 2026-09-21). Brightmoor Staffing seats them now.
 */
export const SUPPLIER_DESKS: ClientDesk[] = [
  { desk: 'account', label: 'Account manager',
    waiting: 'Owns the client: jobs, rates, submissions and bills. Never payroll.' },
  { desk: 'recruiter', label: 'Recruiter',
    waiting: 'Finds and submits people. Cannot see what anybody costs.' },
  { desk: 'resourcing', label: 'Resource manager',
    waiting: 'Owns the bench and decides who goes where.' },
  { desk: 'contracts', label: 'Contract manager',
    waiting: 'Agreements, orders, extensions and rate changes. Neither submits nor pays.' },
  { desk: 'hr', label: 'HR',
    waiting: 'Paperwork and work authorization for the firm’s own people. Sees no money.' },
  { desk: 'ar', label: 'Accounts receivable',
    waiting: 'Bills the client and records what came in. Never runs payroll.' },
  { desk: 'payroll', label: 'AP & payroll',
    waiting: 'Pays the consultant and the sub-vendor. Never issues a client bill.' },
  { desk: 'finance', label: 'Finance',
    waiting: 'Bills, pays and closes the month. At a small firm, this is the whole desk.' },
  { desk: 'compliance', label: 'Compliance officer',
    waiting: 'Whose insurance is running out, and whose paperwork is missing.' },
  { desk: '', label: 'Owner',
    waiting: 'Everything, including what each placement earns.' },
]

export const SUPPLIER_SEATS: Program[] = [
  {
    slug: 'world-brightmoor',
    name: 'Brightmoor Staffing',
    where: 'Prime supplier, every desk seated',
    industry: 'Staffing · retail systems and supply planning',
    waiting:
      'Its liability insurance runs out in twenty days. That is the compliance officer’s work today.',
    about:
      'Sells two contractors to Northbend Athletic from its own payroll. Buys an engineer from ' +
      'a bench vendor and sells them to a retailer. A person sits at each of its nine desks.',
    desks: SUPPLIER_DESKS,
  },
  {
    slug: 'world-computer-systems',
    name: 'Computer Systems Inc',
    where: 'Prime supplier',
    industry: 'IT staffing · finance and hospital systems',
    waiting:
      'A bench vendor’s invoice for four weeks is unpaid. A lab analyst has a screening call ' +
      'at a hospital this week.',
    about:
      'Sells Helena Marsh to Northbend Athletic, and a lab analyst to a hospital. Buys Helena ' +
      'from a bench vendor the client never learns about.',
  },
  {
    slug: 'world-vertex-global',
    name: 'Vertex Global',
    where: 'Prime supplier',
    industry: 'Engineering and IT staffing',
    waiting:
      'A validation engineer’s week is filed and waiting for the plant to sign it.',
    about:
      'Sells to Cavanaugh Glassworks and Talvern Medical. Buys that same engineer from a bench ' +
      'vendor below, and keeps the difference in rate.',
  },
  {
    slug: 'world-cloudepa',
    name: 'CloudEPA',
    where: 'Sub-vendor, below a prime',
    industry: 'IT consulting · finance and lab systems',
    waiting:
      'Its own consultant is shortlisted at the prime, with a screening call booked. The I-9 ' +
      'it asked its own consultant for six days ago is still not back.',
    about:
      'Sells only to the prime above it, and never learns which hospital the job is at. Buys ' +
      'from nobody: it employs its own people.',
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
    slug: 'world-kestrel',
    name: 'Kestrel MSP',
    where: 'Program office, at the client’s compliance desk',
    industry: 'Program office · compliance',
    waiting:
      'Talvern Medical’s time-on-site record across every supplier, whose insurance is current, ' +
      'and what is held on each person.',
    about:
      'Places nobody at Talvern, so no contract links the two firms. Talvern granted Kestrel a ' +
      'compliance officer desk, and every read Kestrel makes is logged.',
    desks: [
      { desk: 'compliance', label: 'Compliance officer',
        waiting: 'Talvern Medical’s time-on-site record and paperwork, from the desk Talvern granted.' },
      { desk: '', label: 'Owner',
        waiting: 'The office’s own records, and the programs it runs.' },
    ],
  },
  {
    slug: 'world-aptiva',
    name: 'Aptiva Workforce',
    where: 'Managed program office',
    industry: 'Program office · healthcare',
    waiting:
      'Both sides signed two weeks of its analyst’s hours, and nobody has billed them. The ' +
      'hospital signed a third week, which waits for Aptiva to accept it as the employer.',
    about:
      'Runs a hospital’s contract-worker program. It sells to the hospital and staffs part of ' +
      'the program with people it employs.',
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
    industry: 'IT services · aerospace software',
    waiting:
      'Corveldt Aerospace has an open DO-178C avionics software job. Karthik Menon fits it. ' +
      'Submit him with no bench listing.',
    about:
      'Sunil Raghavan runs delivery and sells people from his own payroll. Four are between ' +
      'projects; Karthik left an avionics project three weeks ago. Teleworld buys the engineer ' +
      'still on that project from a bench vendor, whose invoice is unpaid.',
  },
  {
    slug: 'world-sundara',
    name: 'Sundara Systems',
    where: 'Systems integrator',
    industry: 'IT services · engineering software',
    waiting:
      'The same Corveldt avionics job is open to Sundara, at its own rate band. Aditi ' +
      'Ramaswamy fits it.',
    about:
      'Lakshmi Iyer runs delivery and sells from her own payroll, with the same four skills ' +
      'between projects. Sundara buys its validation engineer at Talvern Medical from a bench ' +
      'vendor that Talvern has never been told about.',
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
    where: 'An integrator’s own employee (W2)',
    industry: 'Aerospace · DO-178C avionics verification',
    email: 'karthik.menon@seed.etyme.invalid',
    waiting:
      'The client has an open DO-178C job. Your employer has not put you forward for it yet.',
    about:
      'You are on an integrator’s payroll, not on a bench, so it can staff you without asking. ' +
      'Your three-month avionics project ended three weeks ago; both sides signed four weeks of it.',
  },
  {
    slug: 'helena-marsh',
    name: 'Helena Marsh',
    where: 'On a bench, sold through a prime',
    industry: 'Apparel · ERP finance',
    email: 'helena.marsh@seed.etyme.invalid',
    waiting: 'The week you filed is still waiting for somebody to sign it.',
    about:
      'A bench vendor lists you, and a prime sells you to a sportswear company. The client ' +
      'thinks the prime employs you. You are two hundred days on site, against an eighteen-month ' +
      'time limit.',
  },
  {
    slug: 'chidi-okafor',
    name: 'Chidi Okafor',
    where: 'US work visa (H-1B), two firms below the client',
    industry: 'Medical devices · system validation (21 CFR Part 11)',
    email: 'chidi.okafor@seed.etyme.invalid',
    waiting:
      'The client asked you to sign a site access and data integrity attestation. Nobody else ' +
      'can sign it for you.',
    about:
      'A bench vendor employs you, an integrator sells you, and a device maker signs your hours. ' +
      'Three weeks are signed and billed.',
  },
  {
    slug: 'marisol-quintero',
    name: 'Marisol Quintero',
    where: 'No employer yet',
    industry: 'Industrial automation · PLC and SCADA commissioning',
    email: 'marisol.quintero@seed.etyme.invalid',
    waiting:
      'You have a page you turned on yourself, and a choice. Let a firm list you on its bench ' +
      'and market you, or incorporate and sell yourself.',
    about:
      'Nobody employs you, nobody lists you, and you have incorporated nothing. No submission ' +
      'anywhere carries your name. Etyme places nobody, so nothing happens until you act.',
  },
  {
    slug: 'colleen-byrne',
    name: 'Colleen Byrne',
    where: 'Paid through her own company',
    industry: 'Healthcare · ICU nursing',
    email: 'colleen.byrne@seed.etyme.invalid',
    waiting:
      'Your state license runs out in twenty-four days, inside the assignment. The renewal was ' +
      'asked for and is not filed yet.',
    about:
      'Thirteen weeks in a hospital ICU, three twelve-hour shifts a week. You are paid through ' +
      'the company you own, so it carries the liability insurance, not the agency.',
  },
]

/** Every company door on the page, for anything that has to check them all. */
export const ALL_SEATS: Program[] = [
  ...CLIENT_PROGRAMS,
  ...SUPPLIER_SEATS,
  ...PROGRAM_OFFICE_SEATS,
  ...INTEGRATOR_SEATS,
]

/**
 * The words before the two links at the foot of `/demo` — the audit and a
 * person, from `lib/public-site/funnel`. Here rather than in the page so a
 * test can read the whole line against `promisesAnAccount`.
 */
export const NEXT_STEP_LEAD = 'Want this with your own suppliers?'
