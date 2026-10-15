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

export type Pill = 'ok' | 'wait' | 'att' | 'mute'

/** One cell: plain text, or a status pill. */
export type Cell = string | { pill: Pill; t: string }

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
}

export interface StoryStep {
  n: 1 | 2 | 3 | 4
  /** The step's name, on the chip and everywhere public. */
  chip: string
  /** The sample screen this step is (the machine name of the step). */
  embed: Exclude<EmbedStep, 'overview'>
  chat: Message[]
  /** The table the answer changes. */
  table: { title: string; head: Column[]; rows: Cell[][]; flash: number }
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

export const STORY: StoryStep[] = [
  {
    n: 1,
    chip: 'Job',
    embed: 'source',
    chat: [
      { who: 'me', text: 'Send the HCM integration lead job to our approved suppliers. Bill rate $120 to $140 an hour.' },
      {
        who: 'etyme',
        text: 'Sent to your 3 approved suppliers. It is within budget, so it needed no approval.',
        card: {
          t: 'HCM integration lead · 12 months · Tualatin, OR',
          s: 'Computer Systems Inc, Brightmoor Staffing, Pinnacle Resourcing',
          yes: 'Send',
        },
      },
    ],
    table: {
      title: 'Jobs',
      head: [{ t: 'Job' }, { t: 'Suppliers', right: true, wide: true }, { t: 'Bill rate', right: true }, { t: 'Status', right: true }],
      rows: [
        ['HCM integration lead', '3', '$120–140', { pill: 'ok', t: 'Open' }],
        ['Supply-planning consultants (4)', '—', 'up to $130', { pill: 'wait', t: 'Waiting for the VP' }],
      ],
      flash: 0,
    },
    sum: { big: '1', rest: 'job sent to 3 approved suppliers, no approval needed' },
  },
  {
    n: 2,
    chip: 'Candidates',
    embed: 'submit',
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
  {
    n: 3,
    chip: 'Timesheets',
    embed: 'approve',
    chat: [
      {
        who: 'etyme',
        text: '3 timesheets are waiting for your approval. Two are over the hours on the contract.',
        card: {
          t: 'Approve Helena Marsh’s timesheet?',
          s: '40 hours · Computer Systems Inc · matches her contract',
          yes: 'Approve',
        },
      },
      { who: 'etyme', text: 'Lucía Fernández submitted 44 hours on a 40-hour contract. Check with Pinnacle Resourcing before you approve it.' },
    ],
    table: {
      title: 'Timesheets to approve',
      head: [{ t: 'Contractor' }, { t: 'Supplier', wide: true }, { t: 'Hours', right: true }, { t: 'Status', right: true }],
      rows: [
        ['Helena Marsh', 'Computer Systems Inc', '40', { pill: 'ok', t: 'Approved' }],
        ['Lucía Fernández', 'Pinnacle Resourcing', '44', { pill: 'att', t: '4 hours over' }],
        ['Omar Haddad', 'Brightmoor Staffing', '45', { pill: 'att', t: '5 hours over' }],
      ],
      flash: 0,
    },
    sum: { big: '1', rest: 'tap to approve a timesheet; the ones over their hours wait, with the reason' },
  },
  {
    n: 4,
    chip: 'Invoices',
    embed: 'pay',
    chat: [
      { who: 'me', text: 'Which of Pinnacle Resourcing’s invoices can we pay today?' },
      {
        who: 'etyme',
        text: 'PR-2026-0441 matches the approved hours and the contract rate. PR-2026-0442 does not: it bills 41.5 hours, but 40 were approved.',
        card: {
          t: 'Pay invoice PR-2026-0441 for $3,920?',
          s: '40 approved hours × $98 · hours, invoice receipt and rate match',
          yes: 'Pay',
        },
      },
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

export const APTIVA_STORY_STEPS: StoryStep[] = [
  {
    n: 1,
    chip: 'Job',
    embed: 'source',
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

/** One story the panel can play: whose seat, whose book, and the four steps. */
export interface Story {
  bar: { readonly company: string; readonly rest: string }
  /** Whose program the tables are: the client's, even where the reader sits for an MSP. */
  book: string
  steps: StoryStep[]
}

export type StoryKey = 'northbend' | 'aptiva'

export const STORIES: Record<StoryKey, Story> = {
  northbend: { bar: STORY_BAR, book: STORY_BAR.company, steps: STORY },
  aptiva: { bar: APTIVA_BAR, book: APTIVA_BOOK, steps: APTIVA_STORY_STEPS },
}

/** Every public page plays Northbend's story unless it names another. */
export const DEFAULT_STORY: StoryKey = 'northbend'

/** Every word one story draws. */
function copyOfStory(story: Story): string[] {
  const cell = (c: Cell) => (typeof c === 'string' ? c : c.t)
  return [
    story.bar.company, story.bar.rest, story.book,
    ...story.steps.flatMap((s) => [
      ...s.chat.flatMap((m) => [m.text, ...(m.card ? [m.card.t, m.card.s, m.card.yes] : [])]),
      s.table.title, ...s.table.head.map((h) => h.t), ...s.table.rows.flatMap((r) => r.map(cell)),
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
 * ceiling: the bar and the chips. What changes as it plays — each step's
 * conversation, table and footer line — is the product shown working,
 * the way the frame's screens were, and is not counted against a page's
 * hundred and fifty words. Every one of those words is read by the
 * positioning guards through `storyCopy`.
 */
export function storyChromeCopy(key: StoryKey = DEFAULT_STORY): string[] {
  const story = STORIES[key]
  return [story.bar.company, story.bar.rest, ...story.steps.map((s) => s.chip)]
}
