/**
 * The four steps, shown working: the words and figures of the panel every
 * public page that sells the product draws (`./story-panel`).
 *
 * ── Decided by the founder, 2026-10-14 ───────────────────────────────
 *
 * "Build it", on the drawing that replaced the big live frame: one
 * compact panel that plays the four steps as an Ask Etyme conversation —
 * a question, an answer, a decision card that presses itself — beside the
 * table that answer changes. The four steps are Job, Candidates,
 * Timesheets and Invoices: the four nouns a buyer already has on their
 * own desk. Every line is the trade's phrasing.
 *
 * ── Every name and figure is the seeded demo's ───────────────────────
 *
 * The panel never waits on a frame, a reseed or a network call, so it
 * cannot be blank; and it says nothing the demo does not hold. Every
 * person, firm, job, rate, hour count and invoice number here is read
 * against the seed by `__tests__/invariants/story-panel.test.ts`
 * (lib/seed-programmes, the world seed, the twin's invoice seed). Where
 * the drawing carried a figure the seed does not hold, the seed's is
 * used, and the test file lists each one.
 *
 * Plain data, with no import of the seed itself: the seed reaches the
 * database, and this file is drawn in the browser.
 */

import type { EmbedStep } from '@/lib/sample-seat'
import { formatDay } from '@/lib/format-date'
import { weekStart } from '@/lib/overtime'

export type Pill = 'ok' | 'wait' | 'att' | 'mute'

/** A status pill. With `then`, it flips to that pill the moment the step's card presses. */
export interface PillCell {
  pill: Pill
  t: string
  then?: { pill: Pill; t: string }
}

/**
 * A week, said as its days once the page is live ("Oct 11–17"): the
 * Sunday-to-Saturday week `week` weeks before the last whole week before
 * today. Before the page is live — and for a reader with no script — it
 * reads as `WEEK_WORDS`, so the server and the browser draw the same
 * first frame whatever day the page was built on.
 */
export interface WeekCell { week: number }

/** One cell: plain text, a status pill, or a week. */
export type Cell = string | PillCell | WeekCell

export interface Column {
  t: string
  /** Right-aligned figures. */
  right?: boolean
  /** Left off on a phone, so the table never scrolls sideways. */
  wide?: boolean
}

export interface Message {
  /** The reader ("me") or Ask Etyme. */
  who: 'me' | 'etyme'
  text: string
  /** A decision card inside the answer, with Yes and Not now. */
  card?: { t: string; s: string; yes: string }
  /**
   * A status inside the answer that flips where a card would press: the
   * step whose person waits on somebody else draws no card of its own, and
   * the panel shows the wait ending instead (Helena's week, signed).
   */
  status?: PillCell & { then: { pill: Pill; t: string } }
}

export interface StoryStep {
  n: 1 | 2 | 3 | 4
  /** The step's name, on the chip and everywhere public. */
  chip: string
  /** The sample screen this step is (the machine name of the step). */
  embed: Exclude<EmbedStep, 'overview'>
  /**
   * The person in front of this step, by name and job, drawn on the bar
   * beside the company (founder, 2026-10-19: "every first screen names a
   * person and the step in front of them").
   */
  who: string
  /**
   * The bar on a phone, where the company and `who` do not fit one line at
   * 375 even as a name and a job: the job alone after the company's name
   * (2026-10-20). The line under the panel names the person in full, and
   * from md up the bar does too. Absent where `who` fits.
   */
  phone?: string
  chat: Message[]
  /**
   * The table the answer changes. `added` is a row that appears when the
   * card presses (the job sent, at the foot of the contractors). `flash`
   * is the row that lights, counted over `rows` and then `added`.
   */
  table: { title: string; head: Column[]; rows: Cell[][]; added?: Cell[]; flash: number }
  /** The footer line: one figure, then what it means. */
  sum: { big: string; rest: string }
}

/** Whose program this is, said on the bar, and how big it is. */
export const STORY_BAR = {
  company: 'Northbend Athletic',
  rest: 'a sample company · 7 contractors · 4 suppliers',
} as const

/** The label over the conversation. */
export const ASK_ETYME = 'Ask Etyme'

/** What the Yes button says once it has been pressed, and the second button. */
export const STORY_DONE = 'Done ✓'
export const STORY_NOT_NOW = 'Not now'

/** The four chips' group, for a screen reader. */
export const STORY_STEPS_LABEL = 'The four steps'

/** How long each step plays, in milliseconds, before the next. */
export const STORY_STEP_MS = 5200

// ── Weeks, said as their days ─────────────────────────────────────────

/** A week before the page is live: the words a reader with no script reads. */
export const WEEK_WORDS = ['Last week', '2 weeks ago', '3 weeks ago', '4 weeks ago'] as const

const DAY = 86_400_000

/**
 * "Oct 11–17", or "Sep 27–Oct 3" across a month: the Sunday-to-Saturday
 * week `back` weeks before the last whole week before `today` (an ISO
 * day). The last whole week before Monday, Oct 19 is Oct 11–17, and so it
 * is on the Saturday, Oct 24; on Sunday, Oct 25 it is Oct 18–24. The
 * week is the one the product judges hours in (`weekStart` in
 * lib/overtime) and the days are printed by the one date formatter.
 */
export function weekLabel(today: string, back = 0): string {
  const t = new Date(`${today}T00:00:00.000Z`)
  // The last Saturday before today: two days back on a Monday, a whole
  // week back on a Saturday, one day back on a Sunday.
  const toSaturday = (t.getUTCDay() + 1) % 7 || 7
  const to = new Date(t.getTime() - (toSaturday + 7 * back) * DAY)
  const from = new Date(`${weekStart(to.toISOString().slice(0, 10))}T00:00:00.000Z`)
  const a = formatDay(from, { year: false })
  const b = formatDay(to, { year: false })
  const sameMonth = a.split(' ')[0] === b.split(' ')[0]
  return `${a}–${sameMonth ? b.split(' ')[1] : b}`
}

/** What a cell reads: a pill's words, a week's words before the page is live, or the text. */
export function cellText(c: Cell, today: string | null = null): string {
  if (typeof c === 'string') return c
  if ('week' in c) return today ? weekLabel(today, c.week) : WEEK_WORDS[c.week] ?? `${c.week + 1} weeks ago`
  return c.t
}

// ── Northbend Athletic: three people on one morning ───────────────────
//
// The founder's drawing of 2026-10-19
// (https://claude.ai/artifact/X4CBNEAHcEE1dnQB8gdHuw): the panel opens on
// the headline's own question and names the person in front of each step
// — Marcus Oyelaran, the hiring manager, for the job and the candidates;
// Helena Marsh, the contractor, waiting on her week; Renata Kowal, the AP
// clerk, paying what matched. Three people, four steps, one morning.
//
// Where the drawing and the seed disagree the seed is said, and
// `__tests__/invariants/story-panel.test.ts` lists each one. The two that
// matter: the month is $135,200 for the seven contractors the seed puts
// on site, not $60,000 for three, because the question is "across every
// supplier"; and Helena's week is accepted next by Computer Systems Inc
// and then by her employer, who pays her — Computer Systems Inc is not
// her employer, and the client never learns the firm below it.

/**
 * The person in front of each Northbend step, as the bar names them. Short
 * enough that "Northbend Athletic · Helena Marsh, contractor" is one line
 * at 375 (founder, 2026-10-20, on a phone): the firm she is placed through
 * is said in her conversation, where there is room for it.
 */
export const NORTHBEND_PEOPLE = {
  hiring: 'Marcus Oyelaran, hiring manager',
  worker: 'Helena Marsh, contractor',
  ap: 'Renata Kowal, AP clerk',
} as const

/** Helena's week, waiting on Marcus and then signed: the home page's step 3, and her own door's. */
const HELENAS_WEEK: StoryStep = {
  n: 3,
  chip: 'Timesheets',
  embed: 'approve',
  who: NORTHBEND_PEOPLE.worker,
  chat: [
    { who: 'me', text: 'Is my week signed yet? My pay waits on it.' },
    {
      who: 'etyme',
      text: 'Not yet. Your 40 hours are with Marcus Oyelaran, who signs them. They are due by Wednesday, and they are on his list.',
      status: { pill: 'wait', t: 'Waiting for Marcus Oyelaran', then: { pill: 'ok', t: 'Signed by Marcus Oyelaran ✓' } },
    },
    {
      who: 'etyme',
      text: 'Signed, just now. Computer Systems Inc accepts the same 40 hours next, then your employer, who pays you. Nobody types your week in again.',
    },
  ],
  table: {
    title: 'Helena’s weeks',
    head: [{ t: 'Week' }, { t: 'Hours', right: true }, { t: 'Signed by', wide: true }, { t: 'Status', right: true }],
    rows: [
      [{ week: 0 }, '40', 'Marcus Oyelaran', { pill: 'wait', t: 'Waiting', then: { pill: 'ok', t: 'Signed' } }],
      [{ week: 1 }, '40', 'Marcus Oyelaran', { pill: 'ok', t: 'Accepted' }],
      [{ week: 2 }, '40', 'Marcus Oyelaran', { pill: 'ok', t: 'Accepted' }],
    ],
    flash: 0,
  },
  sum: { big: '1', rest: 'week, signed once at the top; every firm below accepts the same week' },
}

export const STORY: StoryStep[] = [
  {
    n: 1,
    chip: 'Job',
    embed: 'source',
    who: NORTHBEND_PEOPLE.hiring,
    chat: [
      { who: 'me', text: 'What am I paying across every supplier this month?' },
      {
        who: 'etyme',
        text: '$135,200 a month: 7 contractors through 4 suppliers, at current rates. Lucía Fernández has 14 months here across two suppliers. The limit is 18.',
      },
      {
        who: 'etyme',
        text: 'Send the HCM integration lead job to your 3 approved suppliers? It is within budget, so it needs no approval.',
        card: {
          t: 'HCM integration lead · 12 months · Tualatin, OR',
          s: 'Computer Systems Inc, Brightmoor Staffing, Pinnacle Resourcing · $120–140 an hour',
          yes: 'Send',
        },
      },
    ],
    table: {
      title: 'Contractors on site · 3 of 7',
      head: [{ t: 'Contractor' }, { t: 'Supplier', wide: true }, { t: 'Rate', right: true }, { t: 'Months here', right: true }],
      rows: [
        ['Helena Marsh', 'Computer Systems Inc', '$145', '6'],
        ['Omar Haddad', 'Brightmoor Staffing', '$132', '1'],
        ['Lucía Fernández', 'Pinnacle Resourcing', '$98', { pill: 'att', t: '14 of 18 · 2 suppliers' }],
      ],
      added: ['HCM integration lead (open)', '3 suppliers', '$120–140', { pill: 'ok', t: 'Sent' }],
      flash: 3,
    },
    sum: { big: '$135,200', rest: 'a month across every supplier, from current rates, in one answer' },
  },
  {
    n: 2,
    chip: 'Candidates',
    embed: 'submit',
    who: NORTHBEND_PEOPLE.hiring,
    chat: [
      { who: 'me', text: 'Who applied for the HCM integration lead job?' },
      {
        who: 'etyme',
        text: '3 candidates from 3 suppliers. Daniel Okafor passed the first interview. Rajesh Iyer’s interview is booked.',
        card: {
          t: 'Schedule a second interview with Daniel Okafor?',
          s: 'Computer Systems Inc · $131 an hour · passed round one',
          yes: 'Schedule',
        },
      },
    ],
    table: {
      title: 'Candidates · HCM integration lead',
      head: [{ t: 'Candidate' }, { t: 'Supplier', wide: true }, { t: 'Rate', right: true }, { t: 'Status', right: true }],
      rows: [
        ['Rajesh Iyer', 'Brightmoor Staffing', '$134', { pill: 'wait', t: 'Interview booked' }],
        ['Mei-Lin Chao', 'Pinnacle Resourcing', '$128', { pill: 'mute', t: 'Submitted' }],
        ['Daniel Okafor', 'Computer Systems Inc', '$131', { pill: 'ok', t: 'Round 1 passed' }],
      ],
      flash: 2,
    },
    sum: { big: '3', rest: 'candidates side by side, with their suppliers and rates' },
  },
  HELENAS_WEEK,
  {
    n: 4,
    chip: 'Invoices',
    embed: 'pay',
    who: NORTHBEND_PEOPLE.ap,
    chat: [
      { who: 'me', text: 'Which of Pinnacle Resourcing’s invoices can we pay today?' },
      {
        who: 'etyme',
        text: 'PR-2026-0441: 40 approved hours at the contract rate of $98. The hours, the invoice receipt and the rate agree.',
        card: {
          t: 'Pay invoice PR-2026-0441 for $3,920?',
          s: '40 approved hours × $98 · Pinnacle Resourcing',
          yes: 'Pay',
        },
      },
      { who: 'etyme', text: 'PR-2026-0442 is on hold. It bills 41.5 hours; 40 were approved. Nobody pays the 1.5 hours until somebody signs them.' },
    ],
    table: {
      title: 'Invoice receipts',
      head: [{ t: 'Invoice receipt' }, { t: 'Billed', right: true }, { t: 'Approved', right: true }, { t: 'Check', right: true }],
      rows: [
        ['PR-2026-0441', '40 h', '40 h', { pill: 'ok', t: 'Paid' }],
        ['PR-2026-0442', '41.5 h', '40 h', { pill: 'att', t: 'On hold: 1.5 h over' }],
      ],
      flash: 0,
    },
    sum: { big: '1', rest: 'invoice receipt paid; the one billing more hours than were approved is on hold' },
  },
]

/** The step a page's frame used to open at, as the panel's index. The overview is the first step. */
export function storyIndex(step: EmbedStep | undefined): number {
  const i = STORY.findIndex((s) => s.embed === step)
  return i < 0 ? 0 : i
}

/** The four step names, in order: the one spine, on every public page. */
export const STEP_NAMES = STORY.map((s) => s.chip) as ['Job', 'Candidates', 'Timesheets', 'Invoices']

/**
 * ── The MSP's story, told from Aptiva Workforce's seat ───────────────
 *
 * The founder, on /for/program-offices, 2026-10-15: "use a sample MSP
 * company". The Northbend story is a client's own program manager, so an
 * MSP reading it saw a client. The MSP door plays the same four steps
 * from the one seat the seed gives an MSP in somebody else's program:
 * Cavanaugh Glassworks hands its whole program to Aptiva Workforce and
 * seats Aptiva in Cavanaugh's OWN Program Manager role
 * (`program-office-seat` in lib/seed-world). Every row is Cavanaugh's
 * book, as Aptiva reads it from that seat.
 *
 * One card per step, and only an act that seat may take. Cavanaugh's
 * Program Manager role sends a job to suppliers and sets up an interview
 * (`requirements.distribute`, `requirements.write`); it does not approve a
 * timesheet — the hiring manager does — and it does not pay — the AP clerk
 * does. So the Timesheets and Invoices steps answer and say who acts, and
 * draw no card: a card the seat would be refused on is a card that lies.
 *
 * Every name and figure is read against the seed by
 * `__tests__/invariants/story-panel.test.ts`, the file that reads the
 * Northbend story. What the seed does not fix is not said: Cavanaugh's
 * invoice numbers and per-month totals come from the day the world was
 * born and from a record id, so no number is named; the hours, and the
 * one bill whose amount is fixed, are.
 */
export const APTIVA_BAR = {
  company: 'Aptiva Workforce',
  rest: 'an MSP running Cavanaugh Glassworks’ program · 5 contractors · 5 suppliers',
} as const

/** The client whose program Aptiva runs: whose book every table is. */
export const APTIVA_BOOK = 'Cavanaugh Glassworks'

/** The person in Aptiva's seat: its program manager, the first seat the seed gives Aptiva. */
export const APTIVA_WHO = 'Rashida Coleman, program manager'
/** Her job alone, for the bar on a phone: "Aptiva Workforce · Rashida Coleman, program manager" is three pixels past 375. */
export const APTIVA_PHONE = 'program manager'

export const APTIVA_STORY_STEPS: StoryStep[] = [
  {
    n: 1,
    chip: 'Job',
    embed: 'source',
    who: APTIVA_WHO,
    phone: APTIVA_PHONE,
    chat: [
      { who: 'me', text: 'Send the environmental health and safety lead job to Cavanaugh’s approved suppliers. Bill rate $90 to $110 an hour.' },
      {
        who: 'etyme',
        text: 'Sent to Cavanaugh’s 3 approved suppliers. It is within budget, so it needed no approval.',
        card: {
          t: 'Environmental health and safety lead · 12 months · Elmira, NY',
          s: 'Vertex Global, Halcyon Talent, Arcadia Tech Group',
          yes: 'Send',
        },
      },
    ],
    table: {
      title: 'Jobs',
      head: [{ t: 'Job' }, { t: 'Suppliers', right: true, wide: true }, { t: 'Bill rate', right: true }, { t: 'Status', right: true }],
      rows: [
        ['Environmental health and safety lead', '3', '$90–110', { pill: 'ok', t: 'Open' }],
        ['Automation engineers (6)', '—', 'up to $115', { pill: 'wait', t: 'Waiting for the VP' }],
      ],
      flash: 0,
    },
    sum: { big: '1', rest: 'job sent to 3 approved suppliers, no approval needed' },
  },
  {
    n: 2,
    chip: 'Candidates',
    embed: 'submit',
    who: APTIVA_WHO,
    phone: APTIVA_PHONE,
    chat: [
      { who: 'me', text: 'Who applied for the environmental health and safety lead job?' },
      {
        who: 'etyme',
        text: '2 candidates from 2 suppliers. Yuki Tanaka’s interview is proposed and waits for Arcadia Tech Group to confirm. Priyanka Rao has no interview yet.',
        card: {
          t: 'Schedule an interview with Priyanka Rao?',
          s: 'Vertex Global · $99 an hour · submitted',
          yes: 'Schedule',
        },
      },
    ],
    table: {
      title: 'Candidates · Environmental health and safety lead',
      head: [{ t: 'Candidate' }, { t: 'Supplier', wide: true }, { t: 'Rate', right: true }, { t: 'Status', right: true }],
      rows: [
        ['Yuki Tanaka', 'Arcadia Tech Group', '$106', { pill: 'wait', t: 'Interview proposed' }],
        ['Priyanka Rao', 'Vertex Global', '$99', { pill: 'mute', t: 'Submitted' }],
      ],
      flash: 1,
    },
    sum: { big: '2', rest: 'candidates side by side, with their suppliers and rates' },
  },
  {
    n: 3,
    chip: 'Timesheets',
    embed: 'approve',
    who: APTIVA_WHO,
    phone: APTIVA_PHONE,
    chat: [
      { who: 'me', text: 'Which timesheets are waiting at Cavanaugh?' },
      {
        who: 'etyme',
        text: '2 timesheets are waiting, 40 hours each, within their contracts. Derek Halvorsen, Cavanaugh’s hiring manager, approves them.',
      },
      { who: 'etyme', text: 'Cavanaugh’s orders approve a week by themselves after 5 days with no answer.' },
    ],
    table: {
      title: 'Timesheets',
      head: [{ t: 'Contractor' }, { t: 'Supplier', wide: true }, { t: 'Hours', right: true }, { t: 'Status', right: true }],
      rows: [
        ['Tomasz Nowak', 'Vertex Global', '40', { pill: 'wait', t: 'Waiting' }],
        ['Felix Brandt', 'Arcadia Tech Group', '40', { pill: 'wait', t: 'Waiting' }],
        ['Aisha Bello', 'Halcyon Talent', '40', { pill: 'ok', t: 'Approved' }],
      ],
      flash: 0,
    },
    sum: { big: '2', rest: 'timesheets waiting for the hiring manager, who approves them' },
  },
  {
    n: 4,
    chip: 'Invoices',
    embed: 'pay',
    who: APTIVA_WHO,
    phone: APTIVA_PHONE,
    chat: [
      { who: 'me', text: 'Which invoice receipt is ready to pay?' },
      {
        who: 'etyme',
        text: 'Wrenfield Technical’s invoice bills Elsa Thornquist’s 40 approved hours at her contract rate of $96: $3,840. Patrice Boyd, Cavanaugh’s AP clerk, pays it.',
      },
    ],
    table: {
      title: 'Invoice receipts by supplier',
      head: [{ t: 'Supplier' }, { t: 'Contractor', wide: true }, { t: 'Billed', right: true }, { t: 'Status', right: true }],
      rows: [
        ['Wrenfield Technical', 'Elsa Thornquist', '40 h', { pill: 'wait', t: 'Waiting for AP' }],
        ['Vertex Global', 'Tomasz Nowak', '120 h', { pill: 'wait', t: 'Waiting for AP' }],
        ['Halcyon Talent', 'Aisha Bello', '80 h', { pill: 'ok', t: 'Paid' }],
      ],
      flash: 0,
    },
    sum: { big: '$3,840', rest: 'ready for Cavanaugh’s AP clerk: 40 approved hours at the contract rate' },
  },
]

// ── The doors: each party's own person, at the step that party acts on ─
//
// The founder, 2026-10-19 (CLAUDE.md, "And the public pages speak as the
// party's own person"): the Suppliers, Integrators and Workers doors stop
// playing Northbend's program manager and play their own named person
// from the seed. One step each, the one that party acts on, so the panel
// plays it once and holds it; the MSPs' door keeps Aptiva's four.
//
// Every name and figure is read against the seed by
// `__tests__/invariants/story-panel.test.ts`. Where the seed holds a
// state one step short of the drawing's — a week waiting on the firm
// above the reader, where the drawing has it waiting on the reader — the
// panel plays that step forward, the way the home page's Timesheets step
// signs the week the seed leaves with Marcus; the names, hours and rates
// stay the seed's. Where the seed holds no figure, none is said.

/** Brightmoor Staffing's account manager, at Northbend's open job. */
export const BRIGHTMOOR_STORY: Story = {
  bar: { company: 'Brightmoor Staffing', rest: 'a sample supplier · 3 people billing' },
  book: 'Brightmoor Staffing',
  steps: [
    {
      n: 2,
      chip: 'Candidates',
      embed: 'submit',
      who: 'Marisa Delacroix, account manager',
      phone: 'account manager',
      chat: [
        { who: 'me', text: 'Who applied for Northbend’s HCM integration lead job from us?' },
        { who: 'etyme', text: 'Rajesh Iyer, at $134 an hour. His interview with Marcus Oyelaran is booked.' },
        {
          who: 'etyme',
          text: 'Jonas Whitaker on your bench matches the job too. His work papers are not on file yet.',
          card: {
            t: 'Ask Jonas Whitaker for his work papers?',
            s: 'On your bench · HCM integration, REST APIs · Tualatin, OR',
            yes: 'Ask',
          },
        },
      ],
      table: {
        title: 'Your candidates · HCM integration lead',
        head: [{ t: 'Candidate' }, { t: 'From', wide: true }, { t: 'Rate', right: true }, { t: 'Status', right: true }],
        rows: [
          ['Rajesh Iyer', 'Applied', '$134', { pill: 'wait', t: 'Interview booked' }],
          ['Jonas Whitaker', 'Your bench', '$122–134', { pill: 'mute', t: 'Papers missing', then: { pill: 'wait', t: 'Papers asked' } }],
        ],
        flash: 1,
      },
      sum: { big: '2', rest: 'people for one job: one who applied, one from your bench' },
    },
  ],
}

/** Techpeple's owner, accepting the week the firms above signed. */
export const TECHPEPLE_SUB_STORY: Story = {
  bar: { company: 'Techpeple', rest: 'a sample supplier' },
  book: 'Techpeple',
  steps: [
    {
      n: 3,
      chip: 'Timesheets',
      embed: 'approve',
      who: 'Bhavesh Nair, owner',
      chat: [
        { who: 'me', text: 'Which weeks are waiting for us to accept?' },
        {
          who: 'etyme',
          text: 'Helena Marsh’s 40 hours at Northbend Athletic. Marcus Oyelaran signed them, and Computer Systems Inc accepted them.',
          card: {
            t: 'Accept Helena Marsh’s week?',
            s: '40 hours · $3,600 to pay her',
            yes: 'Accept',
          },
        },
        { who: 'etyme', text: 'Accepted. Bill Computer Systems Inc for the same 40 hours at $118: $4,720.' },
      ],
      table: {
        title: 'Helena Marsh’s weeks',
        head: [{ t: 'Week' }, { t: 'Hours', right: true }, { t: 'Her pay', right: true, wide: true }, { t: 'Status', right: true }],
        rows: [
          [{ week: 0 }, '40', '$3,600', { pill: 'wait', t: 'Waiting for you', then: { pill: 'ok', t: 'Accepted' } }],
          [{ week: 1 }, '40', '$3,600', { pill: 'ok', t: 'Accepted' }],
          [{ week: 2 }, '40', '$3,600', { pill: 'ok', t: 'Accepted' }],
        ],
        flash: 0,
      },
      sum: { big: '$4,720', rest: 'to bill Computer Systems Inc, from the same 40 signed hours' },
    },
  ],
}

/** Techpeple's recruiter, on the bench its partners can see. */
export const TECHPEPLE_BENCH_STORY: Story = {
  bar: { company: 'Techpeple', rest: 'a sample supplier with a bench' },
  book: 'Techpeple',
  steps: [
    {
      n: 2,
      chip: 'Candidates',
      embed: 'submit',
      who: 'Linnea Qadri, recruiter',
      chat: [
        { who: 'me', text: 'Who on our bench can our partners see?' },
        { who: 'etyme', text: 'Grace Lindqvist and Peter Halloran. Each said yes to being shown to the firms we sell to.' },
        {
          who: 'etyme',
          text: 'Ifeoma Balogun is put forward to Computer Systems Inc for an Epic Beaker analyst job. Her phone screen is booked. Her I-9 is not signed yet.',
          card: {
            t: 'Remind Ifeoma Balogun to sign her I-9?',
            s: 'Asked, not signed yet · phone screen booked',
            yes: 'Remind',
          },
        },
      ],
      table: {
        title: 'Our bench',
        head: [{ t: 'Person' }, { t: 'Skills', wide: true }, { t: 'Status', right: true }],
        rows: [
          ['Grace Lindqvist', 'ERP finance, General ledger', { pill: 'ok', t: 'Shown to partners' }],
          ['Peter Halloran', 'Teamcenter, PLM', { pill: 'ok', t: 'Shown to partners' }],
          ['Ifeoma Balogun', 'Epic, Beaker, LIS', { pill: 'att', t: 'I-9 not signed', then: { pill: 'wait', t: 'Reminded' } }],
        ],
        flash: 2,
      },
      sum: { big: '2', rest: 'people shown to your partners, each by their own yes' },
    },
  ],
}

/** Teleworld Solutions' delivery manager, staffing a client's job from its own people. */
export const TELEWORLD_STORY: Story = {
  bar: { company: 'Teleworld Solutions', rest: 'a sample integrator and supplier · 4 people on site' },
  book: 'Teleworld Solutions',
  steps: [
    {
      n: 2,
      chip: 'Candidates',
      embed: 'submit',
      who: 'Sunil Raghavan, delivery manager',
      phone: 'delivery manager',
      chat: [
        { who: 'me', text: 'Who on our bench matches Corveldt Aerospace’s DO-178C verification engineer job?' },
        {
          who: 'etyme',
          text: 'Karthik Menon. His project at Corveldt has ended: DO-178C, LDRA, Embedded C. He is your own employee, so no bench consent is needed.',
          card: {
            t: 'Put Karthik Menon forward?',
            s: 'DO-178C verification engineer · Corveldt Aerospace · Wichita, KS',
            yes: 'Put forward',
          },
        },
        { who: 'etyme', text: 'Felix Brenner comes off Northbend Athletic’s project first, then Amara Nwosu a week later. Ingrid Solberg flagged them both.' },
      ],
      table: {
        title: 'Our bench',
        head: [{ t: 'Person' }, { t: 'Project', wide: true }, { t: 'Skills' }, { t: 'Status', right: true }],
        rows: [
          ['Karthik Menon', 'Between projects', 'DO-178C, LDRA', { pill: 'mute', t: 'Free now', then: { pill: 'ok', t: 'Put forward' } }],
          ['Felix Brenner', 'Northbend Athletic', 'ERP finance', { pill: 'wait', t: 'Rolling off' }],
          ['Amara Nwosu', 'Northbend Athletic', 'Data pipelines, SQL', { pill: 'wait', t: 'Kept by Ingrid' }],
        ],
        flash: 0,
      },
      sum: { big: '3', rest: 'of your own people, free now or soon, before you buy from outside' },
    },
  ],
}

/** Helena Marsh's own Ask Etyme: the home page's Timesheets step, as she reads it. */
export const HELENA_STORY: Story = {
  bar: { company: 'Northbend Athletic', rest: 'a sample company' },
  book: 'Northbend Athletic',
  steps: [HELENAS_WEEK],
}

/** Colleen Byrne, an ICU travel nurse billing through her own company. */
export const BYRNE_STORY: Story = {
  bar: { company: 'Byrne Critical Care LLC', rest: 'a sample one-person supplier' },
  book: 'Byrne Critical Care LLC',
  steps: [
    {
      n: 4,
      chip: 'Invoices',
      embed: 'pay',
      who: 'Colleen Byrne, owner',
      chat: [
        { who: 'me', text: 'Can I bill Halcyon Talent for last week?' },
        {
          who: 'etyme',
          text: 'Yes. Harlow Health signed your 36 hours, and Halcyon Talent accepted them. You bill Halcyon only for hours it accepted.',
          card: {
            t: 'Bill Halcyon Talent $3,312?',
            s: '36 accepted hours × $92 · Byrne Critical Care LLC',
            yes: 'Send',
          },
        },
        { who: 'etyme', text: 'Sent. Halcyon checks it against the same 36 hours, so nobody types them in again.' },
      ],
      table: {
        title: 'Your weeks',
        head: [{ t: 'Week' }, { t: 'Hours', right: true }, { t: 'Amount', right: true }, { t: 'Status', right: true }],
        rows: [
          [{ week: 0 }, '36', '$3,312', { pill: 'wait', t: 'Ready to bill', then: { pill: 'ok', t: 'Billed' } }],
          [{ week: 1 }, '36', '$3,312', { pill: 'ok', t: 'Accepted' }],
          [{ week: 2 }, '36', '$3,312', { pill: 'ok', t: 'Accepted' }],
        ],
        flash: 0,
      },
      sum: { big: '$3,312', rest: 'billed to Halcyon Talent: 36 accepted hours at the agreed $92' },
    },
  ],
}

/** One story the panel can play: whose seat, whose book, and its steps. */
export interface Story {
  bar: { readonly company: string; readonly rest: string }
  /** Whose program the tables are: the client's, even where the reader sits for an MSP. */
  book: string
  /** Four for a program; one for a door, the step its person acts on. */
  steps: StoryStep[]
}

export type StoryKey = 'northbend' | 'aptiva' | 'brightmoor' | 'techpeple-sub' | 'techpeple-bench' | 'teleworld' | 'helena' | 'byrne'

export const STORIES: Record<StoryKey, Story> = {
  northbend: { bar: STORY_BAR, book: STORY_BAR.company, steps: STORY },
  aptiva: { bar: APTIVA_BAR, book: APTIVA_BOOK, steps: APTIVA_STORY_STEPS },
  brightmoor: BRIGHTMOOR_STORY,
  'techpeple-sub': TECHPEPLE_SUB_STORY,
  'techpeple-bench': TECHPEPLE_BENCH_STORY,
  teleworld: TELEWORLD_STORY,
  helena: HELENA_STORY,
  byrne: BYRNE_STORY,
}

/** Every public page plays Northbend's story unless it names another. */
export const DEFAULT_STORY: StoryKey = 'northbend'

/**
 * Where a story starts, given the step a page opens at (as the index of
 * that step in the Northbend story, which is what a page hands the
 * panel): the story's own step with the same screen, else its first.
 */
export function startOf(story: Story, start: number): number {
  const embed = STORY[start]?.embed
  const i = story.steps.findIndex((s) => s.embed === embed)
  return i < 0 ? 0 : i
}

/** Every word one story draws. */
function copyOfStory(story: Story): string[] {
  const pills = (c: Cell): string[] => (typeof c === 'string' ? [c] : 'week' in c ? [cellText(c)] : [c.t, ...(c.then ? [c.then.t] : [])])
  return [
    story.bar.company, story.bar.rest, story.book,
    ...story.steps.flatMap((s) => [
      s.who, ...(s.phone ? [s.phone] : []),
      ...s.chat.flatMap((m) => [
        m.text,
        ...(m.card ? [m.card.t, m.card.s, m.card.yes] : []),
        ...(m.status ? [m.status.t, m.status.then.t] : []),
      ]),
      s.table.title, ...s.table.head.map((h) => h.t),
      ...s.table.rows.flatMap((r) => r.flatMap(pills)), ...(s.table.added ?? []).flatMap(pills),
      `${s.sum.big} ${s.sum.rest}`,
    ]),
  ]
}

/** Every word the panel draws, in every story it can play, for the guards that read public words. */
export function storyCopy(): string[] {
  return [
    ASK_ETYME, STORY_STEPS_LABEL, STORY_NOT_NOW,
    // The chips, together, as the bar draws them.
    ...STORY.map((s) => s.chip),
    ...Object.values(STORIES).flatMap(copyOfStory),
  ]
}

/**
 * The words of the panel that stay put while it plays, for a page's word
 * ceiling: the bar, the person in front of the first step, and the chips.
 * What changes as it plays — each step's conversation, table and footer
 * line, and on the home page the person on the bar — is the product shown
 * working, the way the frame's screens were, and is not counted against a
 * page's words. Every one of those words is read by the positioning
 * guards through `storyCopy`.
 */
export function storyChromeCopy(key: StoryKey = DEFAULT_STORY): string[] {
  const story = STORIES[key]
  // The four chips, always: a door's one step among the other three.
  return [story.bar.company, story.bar.rest, story.steps[0].who, ...STORY.map((s) => s.chip)]
}
