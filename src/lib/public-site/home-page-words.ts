/**
 * The home page's words, the owner-approved design of 2026-11-18
 * (`prototypes/homepage/approved-2026-11-18.html`). Plain data with no seed
 * in it, so a test can read every line. The sample company's figures are
 * not here: they are the seed's, in `./home-sample`.
 *
 * Where the approved file said "desk" or "req" the words here are the
 * trade's ("role" is not used either: the plain-words guard keeps it off
 * public pages) (CLAUDE.md, "Two words nobody uses"). The
 * section's id stays `desks`, a machine name.
 */

export const HOME_TITLE = 'Etyme | Enterprise contingent workforce management'
export const HOME_BADGE = 'Enterprise contingent workforce management.'

export const HOME_NAV: readonly { t: string; href: string }[] = [
  { t: 'Who it is for', href: '#desks' },
  { t: 'Ask Etyme', href: '#ask' },
  { t: 'Price', href: '#price' },
]
export const START_FREE = { t: 'Start free', href: '/signup' } as const

export const HERO = {
  line1: 'Every contractor. Every supplier.',
  line2: 'One record.',
  sub: 'Not clever automation. Intelligent control — one explainable record for every contingent worker, supplier, timesheet, and invoice, so every decision can be defended, not just done.',
  offer: 'Free for the first five firms. No card, no contract — we set it up with you.',
  seeRole: 'See who it is for',
  micro: 'Set up with you, on your own contractors. Suppliers and contractors join at no cost.',
  stats: [
    { b: 'No spreadsheet', s: 'Rates, papers and approvals live on one record — not in five tabs and an inbox.' },
    { b: 'No Friday chase', s: 'Timesheets arrive matched. You sign. The invoice writes itself from the signed week.' },
    { b: 'No side hires', s: 'Every contractor comes through the same door, whoever asked for them.' },
  ],
} as const

export const ROLES = {
  kicker: 'Start where you sit',
  heading: 'Which one are you?',
  lead: 'Etyme is bought by the people who feel the mess first — not just the person who signs off at the end. Pick yours.',
  link: 'See this one',
  cards: [
    { h: 'Hiring manager', p: "Friday's hours arrive already matched — the rate, the papers, the invoice check done. You just sign.", ask: 'limit' },
    { h: 'Recruiter / supplier', p: 'Jobs arrive clear. Submissions are tracked on the record. The invoice writes itself from the signed week — no Friday timesheet chase.', ask: 'held' },
    { h: 'Program manager', p: 'Every supplier, every rate, every contractor — one record, so nothing is hired off the side.', ask: 'pay' },
  ],
  cta: 'Get started',
  ctaLine: 'Whichever one is yours, it starts with your own contractors on the record.',
} as const

export const ASK = {
  kicker: 'Ask Etyme',
  heading: 'Ask a plain question. Get the record behind it.',
  lead: "No dashboards to learn, no report to build. Ask the question you'd ask in the hallway — and check the rows behind the answer.",
  title: 'Ask Etyme — sample',
  tag: 'Demo — not a customer',
  cfoShow: 'See the CFO view',
  cfoNote: 'The CFO view is one view of the same record — the cards above run the work day to day. Demo figures — not a customer.',
  cta: 'See it with your numbers',
  ctaLine: 'Same questions, answered from your own record.',
} as const

export const GUARANTEE = {
  kicker: 'The guarantee',
  heading: 'You never pay for hours nobody signed.',
  sub: 'Payment is not a hope that three documents agree. In Etyme, they have to — on the record, where anyone can check.',
  items: [
    'The order, the signed week and the invoice must agree before anyone pays.',
    'A mismatch is flagged to the supplier with the reason, on the record — an invoice that disagrees is held and flagged, never silently paid.',
    'Nobody starts without papers — documents are asked for, sent and checked before day one.',
  ],
  cta: 'Get started',
  ctaLine: 'Put your next invoice through all three checks.',
} as const

export const FEATURES =
  'In it: Jobs · Submissions · Timesheets · Invoices · Papers · Tenure · Suppliers. Suppliers and contractors join at no cost. Signs in with your work account. Exports to your accounting system.'

/** Said on a door Etyme has not built yet: a public sentence is something the reader can check. */
export const DOOR_SOON = 'Not live yet'

export const DOORS = {
  kicker: 'No new app to learn',
  heading: 'Works where you work',
  items: [
    { mark: 'T', h: 'Microsoft Teams', p: 'Approvals and alerts inside Teams, signed in through your work account.', soon: false },
    { mark: 'G', h: 'Google Chat', p: 'The same record in Google Chat, signed in through your work account.', soon: true },
    { mark: 'W', h: 'WhatsApp', p: 'Timesheet reminders and approvals where contractors actually reply.', soon: true },
  ],
  noteLead: 'The same record, in the chat your firm already uses.',
  note: 'Client tenants sign in only through their own identity provider — no password back door.',
  cta: 'Get started',
  ctaLine: 'Tell us your stack in the form — we set up your door first.',
} as const

export const PRICE = {
  kicker: 'Founding firms',
  heading: 'Price',
  body: 'Free for the first five firms. No card, no contract — we set it up with you. Founding firms keep their terms when pricing starts. No cost for suppliers and contractors to join.',
  button: 'Claim a founding spot — Start free',
  notHeading: "What Etyme doesn't do yet",
  not: [
    { b: 'No SOC 2 yet.', t: "We're a small team building in the open — ask us what we do today before you rely on us." },
    { b: 'Not payroll.', t: 'Etyme tracks and matches the work; your suppliers still pay their people.' },
    { b: 'Not a job board.', t: 'No marketplace of strangers — only your suppliers and your contractors.' },
    { b: 'Not for thousands of contractors.', t: "Built for firms running contractors across many suppliers. If we are not the right fit, we'll tell you honestly." },
  ],
} as const

export const START = {
  kicker: 'Founding firms · 5 spots',
  heading: 'Start with your own contractors.',
  lead: 'Tell us the shape of your firm. We set up your tenant with you — your suppliers, your rates, your door — on your real contractors, not a demo.',
  points: [
    'No card, no contract to start',
    'We do the setup with you — suppliers invited at no cost to them',
    'Founding firms keep their terms when pricing starts',
  ],
  talkLead: 'Prefer to talk first? Email',
  talkTail: '— one sentence is enough.',
  address: 'support@etyme.com',
  panelHeading: 'Open your company',
  panelLine: 'Sign up with your work account. It takes a minute, and the company works at once.',
} as const

export const SAMPLE_NOTE = 'Demo and sample companies are labeled as such. They are not customers.'

/** The headline as one line, the way a reader says it. */
export const HOME_HEADLINE = `${HERO.line1} ${HERO.line2}`

/** The hero's lines, in reading order: the badge first, then the headline and what follows it. */
export function homeHeroLines(): string[] {
  return [HOME_BADGE, HOME_HEADLINE, HERO.sub, HERO.offer, START_FREE.t, HERO.seeRole, HERO.micro, ...HERO.stats.flatMap((s) => [s.b, s.s])]
}

/** Every line below the hero that is the page's own text, in reading order; the sample's lines go where the Ask panel is. */
export function homeBodyLines(sample: string[] = []): string[] {
  return [
    ROLES.kicker, ROLES.heading, ROLES.lead, ...ROLES.cards.flatMap((c) => [c.h, c.p, ROLES.link]), ROLES.cta, ROLES.ctaLine,
    ASK.kicker, ASK.heading, ASK.lead, ASK.title, ASK.tag, ...sample, ASK.cfoShow, ASK.cfoNote, ASK.cta, ASK.ctaLine,
    GUARANTEE.kicker, GUARANTEE.heading, GUARANTEE.sub, ...GUARANTEE.items, GUARANTEE.cta, GUARANTEE.ctaLine,
    FEATURES,
    DOORS.kicker, DOORS.heading, ...DOORS.items.flatMap((d) => [d.h, d.p]), DOORS.noteLead, DOORS.note, DOORS.cta, DOORS.ctaLine,
    PRICE.kicker, PRICE.heading, PRICE.body, PRICE.button, PRICE.notHeading, ...PRICE.not.flatMap((n) => [n.b, n.t]),
    START.kicker, START.heading, START.lead, ...START.points, `${START.talkLead} ${START.address} ${START.talkTail}`,
    START.panelHeading, START.panelLine, START_FREE.t,
    SAMPLE_NOTE,
  ]
}
