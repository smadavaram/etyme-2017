import type { DemoTarget } from './flow'

/**
 * The four party doors: suppliers and bench firms, program offices,
 * integrators, and contractors.
 *
 * ── Decided 2026-10-13 (CLAUDE.md, "Nine decisions", item 2) ─────────
 *
 * The home page is written to the client, and stays that way. Every other
 * party reads over the client's shoulder, and some need a page of their
 * own to be sent to: a supplier whose client is moving its program onto
 * Etyme, a program office, an integrator, a contractor. These four pages
 * are those doors. They are reached by link or advertising and are not on
 * the home page's menu. Each footer links the other three.
 *
 * Built from the four drawings the founder approved, one template each:
 *
 *   1. the eyebrow names the party; the headline is about their day
 *   2. one real screen, the one that most changes their day
 *   3. day one: only what is in the demo now, as that desk (eight panels)
 *   4. what stays yours: the privacy rules in the product, stated as rules
 *   5. how you grow on it: built and being built side by side, no date
 *   6. sign up first, the demo second, a person third
 *
 * Every panel labeled "Built" was checked against the code when it was
 * drawn; the labels are kept as drawn. A few words moved from the drawings,
 * each because a guard in lib/positioning is right about it, and each is
 * listed in the commit that built these pages:
 *
 *   - "Our bench" (the product's menu word) reads as "our bench" to the
 *     neutrality guard, which is the one sentence Etyme may never say. On
 *     these pages it is "your bench", as the documentation already says.
 *   - "Etyme places nobody" is said as "Etyme never places anybody", the
 *     footer's own words, for the same reason.
 *   - The integrator's lead was one sentence of thirty-two words. It is
 *     three sentences now, and the firm's managers are the ones who move
 *     people, which is what the product does.
 *   - "Your invoice" on the supplier's door is "your bill": what a firm
 *     issues upward to whoever pays it is a bill (the founder,
 *     2026-09-28); the client receives it as an invoice receipt.
 *   - The integrator's screen is the client's program dashboard, so its
 *     caption says that, rather than "across every client project".
 *   - Three sentences that tripped a guard or the twenty-five-word line
 *     were split or reworded with their facts kept, and the program
 *     office's two rows use the founder's own labels, "Etyme as VMS
 *     software" and "Etyme as MSP provider" (decided 2026-09-20).
 *
 * The words live here so the guards read them as data; the view is
 * `./party-page`, and each route under `app/(site)/for` is three lines.
 */

export type PartySlug = 'suppliers' | 'program-offices' | 'integrators' | 'contractors'

export interface PartyScreen {
  img: string
  alt: string
  /** What the screen shows this party, after "One screen ·". */
  caption: string
  /** When it was taken, UTC; the same files the home page shows. */
  capturedAt: string
}

export interface PartyPanel {
  label: string
  title: string
  d: string
}

export interface PartyPage {
  slug: PartySlug
  route: `/for/${PartySlug}`
  /** The party, said the way they say it; used for the footer link too. */
  eyebrow: string
  title: string
  lede: string
  /** The hero's two buttons. */
  signUpLabel: string
  demoLabel: string
  screen: PartyScreen
  dayOne: { heading: string; panels: PartyPanel[] }
  yours: {
    heading: string
    points: { t: string; d: string }[]
    rowsLabel: string
    rows: [string, string][]
  }
  grow: {
    heading: string
    lede: string
    /** `built` is the label as drawn: Built, or Being built. */
    panels: { built: boolean; label: string; d: string }[]
  }
  close: {
    heading: string
    signUp: string
    demo: { title: string; d: string }
  }
  /** Where Sign up goes: the company form, or the candidate's. */
  signUpHref: string
  /** Where the demo opens. A contractor's opens a person's own page. */
  demo: { target: DemoTarget } | { candidate: true }
}

/** Said under the hero on every door. The price is the founder's alone. */
export const PRICE_NOTE = 'Free while testing. No price is set yet.'
/** Said under every screen, because a picture lists names no text guard can read. */
export const ON_SCREEN = 'Demo company, not a customer.'
/** Said under the rows panel on every door. */
export const ROWS_NOTE = 'These are the rules in the product today, not a policy page.'
/** The day-one heading on every door. */
export const DAY_ONE_HEADING = 'Everything below is in the demo today, from your own desk'
/** The ask card on every door. */
export const ASK_LINE =
  'An email and a sentence. One of the people building this reads it and writes back, or tells you it is not built yet.'

const PROGRAM_DASHBOARD: Omit<PartyScreen, 'caption'> = {
  img: '/screens/program-dashboard.png',
  alt: 'The program dashboard. A sentence says whether anything needs the reader today. Six numbers follow: on site, suppliers, this month, ending soon, the time limit and job requests.',
  capturedAt: '2026-09-28T19:09:17Z',
}
const TIMESHEETS: Omit<PartyScreen, 'caption'> = {
  img: '/screens/timesheets.png',
  alt: 'A timesheets screen with weeks waiting for a signature and weeks approved. Each shows the person, the period, the hours, the bill rate and the value.',
  capturedAt: '2026-09-28T19:09:34Z',
}

export const SUPPLIERS: PartyPage = {
  slug: 'suppliers',
  route: '/for/suppliers',
  eyebrow: 'For suppliers and bench firms',
  title: 'Submit once. Hours signed once. Bills matched and paid.',
  lede:
    'Your client runs its contractor program on Etyme, or will. Your desk on it is yours: your people, your rates, your sub-vendors, seen by you and the client you work for, and nobody else.',
  signUpLabel: 'Sign up as a supplier',
  demoLabel: 'See a supplier’s desk in the demo →',
  screen: { ...TIMESHEETS, caption: 'the client signed the week; it reaches you to accept and bill' },
  dayOne: {
    heading: DAY_ONE_HEADING,
    panels: [
      { label: 'Job requests', title: 'One place to read what the client wants', d: 'Each request names the rate band for you, the site and the calendar. You submit from it. No email thread.' },
      { label: 'Submissions', title: 'Your people, forward once', d: 'A person goes forward with their consent, or as your own employee. Interviews are set up on the same row and you are told at each round.' },
      { label: 'Hours', title: 'The week the client signed is the week you bill', d: 'The worker files it once. The client signs it. It reaches you to accept. Nobody re-keys it.' },
      { label: 'Bills', title: 'Your bill, matched, then paid', d: 'Your bill is checked against the signed hours and the contract rate. When all three agree it is ready to pay, and you can see that it is.' },
      { label: 'Paperwork', title: 'Asked for once, watched by date', d: 'Insurance, good standing, a worker’s permit: you are told before a date passes, not after a start is refused.' },
      { label: 'Your team', title: 'Your own desks, in your words', d: 'Account manager, recruiter, HR, contract manager, accounts receivable, AP and payroll. Each sees its own work.' },
      { label: 'Your bench', title: 'Your people between projects, warm', d: 'Who is free, from when, with what skills. Offered to the firms you already trade with, by each person’s own consent.' },
      { label: 'Partner bench', title: 'What you need, and who is offered', d: 'Say the skills, places and rate range you want. Partner firms offer people; you put them forward to your own job request.' },
    ],
  },
  yours: {
    heading: 'The record is the client’s. Your business is not on display.',
    points: [
      { t: 'Your rates are closed at every rung.', d: 'The client sees the rate it pays you. It never sees what you pay a sub-vendor or a worker.' },
      { t: 'Your sub-vendors’ names are yours to keep.', d: 'The client sees the firm it pays. A firm below you is named only if the client’s agreement with you says so, agreed at signing.' },
      { t: 'Your client stays your client.', d: 'Etyme never places anybody, never runs a bench of its own and never bills for a person. The record carries the work; the firms do it.' },
      { t: 'Every read of your people’s records is logged.', d: 'Who read it, why, and whether it was allowed. A refused read is logged before the refusal goes out.' },
      { t: 'Your margin is nobody’s business but yours.', d: 'Where you choose not to disclose markup, nothing on the client’s screen says so. What the client sees is standing: insured, authorized, cleared.' },
    ],
    rowsLabel: 'What the client sees of you',
    rows: [
      ['Your firm’s standing', 'Insured, cleared, approved or preferred'],
      ['The people you placed', 'Name, site, months on site'],
      ['The rate it pays you', 'Yes, its own rung only'],
      ['What you pay below you', 'Never'],
      ['Your sub-vendors’ names', 'Only if its agreement with you says so'],
      ['Your bench', 'Only what you choose to offer it'],
    ],
  },
  grow: {
    heading: 'More clients find you through the work, not through a sales call',
    lede: 'A supplier grows on the record in three ways. The first two are built. The third is being built, and no date is set.',
    panels: [
      { built: true, label: 'a match is a door', d: 'When a client’s job request matches your bench, the client sees your firm, the skills and the reasons, never the person’s name or rate. It can ask to add you as a supplier. You walk its onboarding like any firm.' },
      { built: true, label: 'the bench as a business', d: 'Train for a niche, keep people warm, offer them to partners and primes by consent. Bench profit per person is on your bench page today: what the bench cost against what the placement earned.' },
      { built: false, label: 'your expertise beside your rate', d: 'Today rate is the only number a client has to choose a supplier by. The record will also show what you bring: certifications held, how long your people stay, how placements went. Not built yet.' },
    ],
  },
  close: {
    heading: 'Your desk is ready before your client asks you to use it',
    signUp: 'A work email, a password and your firm’s Etyme address. Your desks, your team and your bench, from today. When a client joins, you are already there.',
    demo: { title: 'See a supplier’s desk in the demo', d: 'A month of work at a demo client, from the account manager’s desk. No card. No sign-up.' },
  },
  signUpHref: '/signup',
  demo: { target: { as: 'world-brightmoor', desk: 'account', screen: '/dashboard', seat: 'the account manager' } },
}

export const PROGRAM_OFFICES: PartyPage = {
  slug: 'program-offices',
  route: '/for/program-offices',
  eyebrow: 'For program offices',
  title: 'Run the whole program from one desk, with every supplier on one record.',
  lede:
    'You may be the client’s own program office, or a firm that runs programs for clients. The work is the same. Decide who may supply and at what band, and release job requests. Keep the weeks and the bills moving, and watch the paperwork. Etyme is that desk.',
  signUpLabel: 'Sign up as a program office',
  demoLabel: 'See the program desk in the demo →',
  screen: { ...PROGRAM_DASHBOARD, caption: 'the program desk: what needs you, then the picture' },
  dayOne: {
    heading: DAY_ONE_HEADING,
    panels: [
      { label: 'The desk', title: 'What needs you, then the picture', d: 'Approvals waiting, weeks to sign, bills to match, people starting soon. Then on site, suppliers, this month, ending soon, time limits.' },
      { label: 'Suppliers', title: 'A supplier is a workflow, not a form', d: 'Recommended, audited, qualified, cleared, bank details verified. Each desk checks its own items. The firm fills in its own side through its own link.' },
      { label: 'Job requests', title: 'Released to cleared suppliers only', d: 'Rate bands per supplier, never shown to another. Within plan a request clears by rule; outside it, the desk that owns the miss decides.' },
      { label: 'Governance', title: 'Blocks where the law is behind it, warns elsewhere', d: 'Time limit, break in service, work authorization, lapsed insurance block. Rate band and headcount warn, take a reason, proceed. Nothing is silently allowed.' },
      { label: 'Weeks and bills', title: 'Signed once, matched once', d: 'The worker files, the manager signs, the signed week travels down the chain. Each invoice receipt is checked against hours and rate before it is paid.' },
      { label: 'Time limits', title: 'Counted per person, across every supplier', d: 'Twelve months through one firm plus twelve through another is twenty-four. Warnings at 90, 60 and 30 days.' },
      { label: 'A seat at the client', title: 'Act under the client’s rules, every read logged', d: 'A program office that is not the client works in a seat the client grants, with the client’s own permissions and words.' },
      { label: 'The program twin', title: 'A helper that watches the record nightly', d: 'It records what it finds, raises exceptions, and asks a person before anything that moves money. What it may do is a contract you set.' },
    ],
  },
  yours: {
    heading: 'The client owns the record. The program is yours to run.',
    points: [
      { t: 'The rules are yours to set, once.', d: 'Approval chains, rate bands, required documents, time limits, days off. Set at the company, overridden per site when that layer lands.' },
      { t: 'Nobody signs their own.', d: 'The desk that recommends does not decide. The desk that asks does not approve. Segregation is a block, said in a sentence.' },
      { t: 'Every act is written down.', d: 'Who did what, under whose authority, on which record, with the rule cited. Overrides keep the name of whoever gave them.' },
      { t: 'Suppliers are told, never watched.', d: 'A program run on the record means faster approvals, matched bills and fewer spreadsheets for them. Their rates below the rung you pay stay closed.' },
      { t: 'Etyme runs programs too, and places nobody.', d: 'If a client would rather not staff a program office, Etyme’s own can run it on the same record, vendor-neutral. It never supplies a person.' },
    ],
    rowsLabel: 'Two ways to use it',
    rows: [
      ['Etyme as VMS software', 'Your program office runs the program on it'],
      ['Etyme as MSP provider', 'Etyme’s program office runs it for the client, same record'],
      ['Either way', 'The client owns the record and the rules'],
      ['Who may supply', 'Decided at your desk, never by Etyme'],
      ['The price', 'None set; supplier-funded as programs are paid; free while testing'],
    ],
  },
  grow: {
    heading: 'One desk today, several programs on one record tomorrow',
    lede: 'A program office grows by running more programs without more spreadsheets. The seat and the desk are built. The rest is being built, and no date is set.',
    panels: [
      { built: true, label: 'the seat', d: 'A client grants you a desk in its program office. You read its words over its book, every read logged, and you leave nothing behind when the seat ends.' },
      { built: false, label: 'several clients, one view', d: 'Your own view across every program you run: what needs you today across all of them, one list. Not built yet.' },
      { built: false, label: 'the twin at your side', d: 'The nightly helper raising time-limit warnings and bill mismatches is built for one program. Running it across your programs, with your own contract, is next.' },
    ],
  },
  close: {
    heading: 'Set up the desk now. The first program can start the day a client grants the seat.',
    signUp: 'A work email, a password and your firm’s Etyme address. Your desks are the program desks: program manager, supplier manager, coordinator, AP clerk, compliance officer.',
    demo: { title: 'See the program desk in the demo', d: 'A month of work at a demo client, from the program manager’s desk. No card. No sign-up.' },
  },
  signUpHref: '/signup?type=msp',
  demo: { target: { as: 'world-nike', desk: 'programme', screen: '/dashboard/program', seat: 'the program manager' } },
}

export const INTEGRATORS: PartyPage = {
  slug: 'integrators',
  route: '/for/integrators',
  eyebrow: 'For integrators',
  title: 'The client ends the project. Your people are on the bench the same day. Place them before the cost lands.',
  lede:
    'You deliver on the client’s project and carry the people. When it ends, they come off and your payroll does not. Etyme shows who is billing and who is not. Your managers move people between your own projects, with no marketplace. The suppliers and consultants you staff wins with stay ready to say yes.',
  signUpLabel: 'Sign up as an integrator',
  demoLabel: 'See an integrator’s desk in the demo →',
  screen: { ...PROGRAM_DASHBOARD, caption: 'a client’s program desk: who is on site, through which firm, and who ends soon' },
  dayOne: {
    heading: DAY_ONE_HEADING,
    panels: [
      { label: 'Rolling off', title: 'Flagged by the delivery manager, seen by the firm', d: 'The day a client ends a project, the manager flags who comes off and when. They appear on your bench page with skills, place and free date. No client ever sees it.' },
      { label: 'Internal moves', title: 'Reserve, confirm, place', d: 'A manager on another client’s project asks and reserves the person. The releasing manager confirms the date, and the person starts on the new project. HR is told at every step. No submission, no invitation.' },
      { label: 'Your own people, forward', title: 'Submitted as yours, no listing needed', d: 'The employment is the consent. Your employee goes forward to a client’s job request as internal, beside a sub-vendor’s person, on the same request.' },
      { label: 'Both sides of the deal', title: 'Sell up, buy below', d: 'A sell line bills the client on its signed week. A buy line pays a sub-vendor by invoice receipt, or runs payroll for your own employee. One document, its lines.' },
      { label: 'Your job requests', title: 'You are a buyer too', d: 'Post your own job requests to the suppliers you cleared, with a rate band per supplier that no other supplier sees. Interview and award from the row.' },
      { label: 'Partner bench', title: 'Say what you need; see who is offered', d: 'Skills, places and rate range you want. Partner firms and independents offer people by consent; you put them forward to your own request. Existing partners rank first.' },
      { label: 'Suppliers and consultants', title: 'A panel that is ready before the win', d: 'Onboard a supplier through its own link, desk by desk. A consultant consents to be on your bench for as long as they choose. Both are there when the next project starts.' },
      { label: 'Hours, bills, payroll', title: 'Signed once at the top, each rung in turn', d: 'The client signs the week. It reaches you to accept, then your sub-vendor. Your bill up is matched to the signed hours; your employee is paid by period.' },
    ],
  },
  yours: {
    heading: 'The client sees the rung it pays. Your bench, your panel and your margin are yours.',
    points: [
      { t: 'Your bench is seen by your firm only.', d: 'Your managers and HR. Never a client, and never one client’s project to another’s.' },
      { t: 'Your rates below the rung the client pays are closed.', d: 'What you pay a sub-vendor or an employee is never on the client’s screen.' },
      { t: 'Your sub-vendors’ names are yours to keep.', d: 'Disclosure is a term on your agreement with the client, off by default, the client’s to demand at signing.' },
      { t: 'Your supplier panel is yours.', d: 'Who you cleared, at what band, and what you asked partners for. A client does not see your suppliers, and a supplier does not see your client’s rate.' },
      { t: 'Your margin and your utilization are read by you.', d: 'Profitability for each placement and each master contract is your firm’s page. The client never sees it.' },
    ],
    rowsLabel: 'What each party sees of you',
    rows: [
      ['The client', 'Your firm, the people on its sites, the rate it pays you'],
      ['Your sub-vendor', 'The site, its own order and rate; never the client’s rate'],
      ['Your employee', 'Their own week, the whole chain by name, their own pay'],
      ['A consultant on your bench', 'What they consented to, for as long as they chose'],
      ['Another client', 'Nothing of this client’s project'],
      ['Etyme', 'Runs no bench, places nobody, holds no contract for a person'],
    ],
  },
  grow: {
    heading: 'Fewer days on the bench, and a panel that says yes the day the work is won',
    lede: 'An integrator grows by keeping its people billing and staffing wins without carrying bench. The move and the match are built. Utilization and the cross-project view are being built, and no date is set.',
    panels: [
      { built: true, label: 'the move and the match', d: 'A person rolling off in one city is reserved and placed on a project in another, told at each step. A match brings partner bench to your job request, existing partners first, with reasons.' },
      { built: true, label: 'bench profit per person', d: 'What the bench cost against what the placement earned, per person and per period, on your bench page. The admin-cost line is a setting you enter.' },
      { built: false, label: 'utilization across projects', d: 'The share of your people billing against those on the bench, across every client project. Also what an internal move saved, against bench cost or a sub-vendor. Not built yet.' },
    ],
  },
  close: {
    heading: 'Your delivery managers, HR and recruiters can be on the record this week',
    signUp: 'A work email, a password and your firm’s Etyme address. Delivery managers, HR, recruiters, contract managers, AP and payroll, each with its own desk.',
    demo: { title: 'See an integrator’s desk in the demo', d: 'A month of work at a demo client, from the integrator’s delivery desk. No card. No sign-up.' },
  },
  signUpHref: '/signup?type=gsi',
  demo: { target: { as: 'world-teleworld', desk: 'delivery', screen: '/dashboard/bench', seat: 'a delivery manager' } },
}

export const CONTRACTORS: PartyPage = {
  slug: 'contractors',
  route: '/for/contractors',
  eyebrow: 'For contractors and consultants',
  title: 'Your week, your paperwork, your record. Yours wherever you work next.',
  lede:
    'You file your own hours, and nobody else may. You see every firm between you and the client, by name. Your papers are on file once. How long you stay on a bench is your choice.',
  signUpLabel: 'Sign up with your email',
  demoLabel: 'See a contractor’s own page in the demo →',
  screen: { ...TIMESHEETS, caption: 'your week, filed by you, signed by the client, reaching your employer to accept' },
  dayOne: {
    heading: DAY_ONE_HEADING,
    panels: [
      { label: 'Your week', title: 'Filed by you, and only you', d: 'Sunday to Saturday. Weekend hours are hours like any other. A week nobody signs is never billed in your name.' },
      { label: 'The whole chain', title: 'Every firm between you and the client, by name', d: 'The client, the prime, the firm that pays you. Rates of rungs you are not party to stay closed, as they should.' },
      { label: 'What you are owed', title: 'Said only when it is owed', d: 'Once your employer accepts a week the client signed, your page says owed to you, with the date it falls due. Never before.' },
      { label: 'Your paperwork', title: 'Asked for once, held by you', d: 'Your work form, your permit, your certificates, on your own page. Reminded before a date passes.' },
      { label: 'Your pay', title: 'Every hour at the rate in force the day you worked it', d: 'Overtime past the line, as the law sets it, even where the contract says nothing. A raise dated in the past has its back pay put forward for approval.' },
      { label: 'Interviews', title: 'Answered from your own page', d: 'A round is set up by the client; you are told on your own channel and answer there.' },
      { label: 'Your bench', title: 'Say yes, and for how long', d: 'A firm may show you to clients only with your consent. Five days or until you cancel, your choice, changed any time.' },
      { label: 'Your record', title: 'Every read of it is logged', d: 'Who read it, why, and whether it was allowed. You can see that it is logged.' },
    ],
  },
  yours: {
    heading: 'The firms place you. The record is yours.',
    points: [
      { t: 'Nobody files your hours for you.', d: 'No supplier, prime or client desk enters a week in your name.' },
      { t: 'Nobody is shown to a client without your yes.', d: 'A firm that adds you markets you by default inside the firm; nothing reaches past it until you grant it.' },
      { t: 'Your time on site is yours, across every firm.', d: 'Twelve months through one firm and twelve through another is twenty-four. The limit and the break are counted for you, not per firm.' },
      { t: 'Your pay rules follow the law of where you work.', d: 'The US week and its overtime line; state rules in India when an Indian pay line is priced. Said beside the figure, never hidden.' },
      { t: 'Etyme never places anybody.', d: 'It holds no contract for you, bills nobody for you and pays nobody for you. The firms do; the record carries the trail.' },
    ],
    rowsLabel: 'Who sees what about you',
    rows: [
      ['The client', 'Your name, site, months on site, the rate it pays your supplier'],
      ['Your employer', 'Your week, your pay, your paperwork'],
      ['A firm above your employer', 'Your week; never your pay'],
      ['A firm you have not consented to', 'Nothing'],
      ['You', 'All of it, and who read it'],
    ],
  },
  grow: {
    heading: 'A record that travels with you, and work that finds you',
    lede: 'A contractor grows on the record by being findable without being sold. The bench by consent is built. The rest is being built, and no date is set.',
    panels: [
      { built: true, label: 'the bench, by your consent', d: 'You choose which firm may show you, to whom, and for how long. A match brings you to a job request with reasons, never a bare number.' },
      { built: false, label: 'your evidence, not a forwarded CV', d: 'Placements, tenure and paperwork already on the record go forward with you. A client sees what you have done, not a résumé rewritten by someone else. Not built yet.' },
      { built: false, label: 'one record across employers', d: 'Your time on site, your paperwork and your history stay yours when you move from one firm to another. The time limit already counts that way; the rest is next.' },
    ],
  },
  close: {
    heading: 'Sign up once. Your page is ready before your first week.',
    signUp: 'An email and a password. Your own page, your paperwork, your weeks. A firm that places you finds you already there.',
    demo: { title: 'See a contractor’s own page in the demo', d: 'A month of a contractor’s work at a demo client, from their own page. No card. No sign-up.' },
  },
  // The candidate's own form, opened on its tab (?as=candidate, 2026-10-13).
  signUpHref: '/signup?as=candidate',
  demo: { candidate: true },
}

/** The four doors, in the order each footer lists them. */
export const PARTY_PAGES: PartyPage[] = [SUPPLIERS, PROGRAM_OFFICES, INTEGRATORS, CONTRACTORS]

export function partyAt(slug: string): PartyPage | null {
  return PARTY_PAGES.find((p) => p.slug === slug) ?? null
}

/** The other three doors, for a page's footer. */
export function otherDoors(p: PartyPage): { label: string; href: string }[] {
  return PARTY_PAGES.filter((o) => o !== p).map((o) => ({ label: o.eyebrow, href: o.route }))
}

/** What the "How you grow on it" label says, exactly as drawn. */
export function growLabel(panel: { built: boolean; label: string }): string {
  return `${panel.built ? 'Built' : 'Being built'} · ${panel.label}`
}

/** Every word a reader sees on a door, split at the fold, for the guards. */
export function copyOfPartyPage(p: PartyPage): { hero: string[]; body: string[] } {
  return {
    hero: [p.eyebrow, p.title, p.lede],
    body: [
      p.signUpLabel, p.demoLabel, PRICE_NOTE, p.screen.caption, ON_SCREEN,
      'What you get on day one', p.dayOne.heading,
      ...p.dayOne.panels.flatMap((x) => [x.label, x.title, x.d]),
      'What stays yours', p.yours.heading,
      ...p.yours.points.flatMap((x) => [x.t, x.d]),
      p.yours.rowsLabel, ...p.yours.rows.flatMap(([a, b]) => [a, b]), ROWS_NOTE,
      'How you grow on it', p.grow.heading, p.grow.lede,
      ...p.grow.panels.flatMap((x) => [growLabel(x), x.d]),
      p.close.heading, 'Sign up now', p.close.signUp, p.close.demo.title, p.close.demo.d, 'Ask a person', ASK_LINE,
      ...otherDoors(p).map((d) => d.label),
    ],
  }
}
