/**
 * The documentation, public.
 *
 * ── Why it is public ─────────────────────────────────────────────────
 *
 * The founder decided on 2026-09-26 that documentation a buyer can read
 * before buying is half of what makes a product read as one, and a docs
 * link that demands an account reads as a product with something to
 * hide. Nothing here asks for an account, and a test holds that.
 *
 * ── One screen a page. Decided by the founder, 2026-10-15 ────────────
 *
 * "AI slop … no one is reading large content … make it real and make it
 * simple." He said "Build it" on a drawing that cut every public page to
 * one screen. So the documentation is:
 *
 *   - the home, "How Etyme works": the steps, your records, recruiting
 *     and more, each listed once
 *   - five step pages (`./process`): Job, Candidates, Timesheets,
 *     Invoices, and When the work ends
 *   - your records and recruiting (`./topics`), six short pages
 *   - "Who does what": one table that replaced the ten party pages, each
 *     of which had drawn the whole operating model from one party
 *   - time and money, and integrations, each cut to a heading, a line and
 *     a few short lines
 *
 * The drawings, the 13-row stations tables, the "Etyme says" glossaries
 * and the L1 to L4 codes went with the ten party pages. Every old address
 * goes, permanently, to the page that replaced it (`./redirects`).
 *
 * ── Two pages that were rewritten before, for being untrue ───────────
 *
 * Time and money never claims that a contractor and a manager must both
 * approve a week, that a manager cannot approve their own expenses, or
 * that nobody can go past an order's limit: the limit can be passed with
 * a name and a reason (`OVERRIDABLE.PO_BALANCE` in `lib/three-way-match`);
 * a line with no approved week behind it cannot. Integrations claims no
 * named connector, because none is built.
 */

import { STEP_PAGES, stepPageAt, stepRoute, stepEyebrow, STEP_HEADINGS, REFUSAL_KIND } from './process'
import { TOPICS, topicAt, topicRoute, topicsIn, GROUP_TITLE } from './topics'
import { flowWords } from '../flow'

// ── The documentation home ────────────────────────────────────────────

export interface DocLink {
  t: string
  href: string
  /** A few words beside it. */
  d?: string
  /** "Step 1", "After": the small label in front of a step. */
  k?: string
}

/**
 * The documentation home, as the founder's drawing has it, with one
 * change: the line under the title names suppliers, because every public
 * page says what kind of thing this is above the fold (`lib/positioning`,
 * category first) and the drawing's line did not.
 */
export const DOCS_HOME = {
  title: 'How Etyme works',
  lede: 'Four steps from a job to paying your suppliers, one page each. No account needed.',
  groups: [
    {
      heading: 'The steps',
      links: STEP_PAGES.map((p): DocLink => ({ k: p.n ? `Step ${p.n}` : 'After', t: p.title, d: p.home, href: stepRoute(p) })),
    },
    { heading: GROUP_TITLE['master-data'], links: topicsIn('master-data').map((t): DocLink => ({ t: t.title, href: topicRoute(t) })) },
    { heading: GROUP_TITLE.recruiting, links: topicsIn('recruiting').map((t): DocLink => ({ t: t.title, href: topicRoute(t) })) },
    {
      heading: 'More',
      links: [
        { t: 'Who does what', href: '/docs/who-does-what' },
        { t: 'Time and money', href: '/docs/time-and-money' },
        { t: 'Integrations', href: '/docs/integrations' },
        { t: 'Security', href: '/security' },
      ] as DocLink[],
    },
  ],
}

// ── Who does what ─────────────────────────────────────────────────────

/** One company in a deal, on the one table. */
export interface PartyRow {
  who: string
  buysFrom: string
  sellsTo: string
  sees: string
}

/**
 * Every company in a deal, on one table. Replaced the ten party pages on
 * 2026-10-15. The line under the title names the client and its
 * suppliers, because a page names what kind of thing this is before
 * anything else (`lib/positioning`, category first); the drawing's line
 * did not. Two cells differ from the drawing, because the drawing said
 * more than the code does: the job goes out from the program manager or
 * Procurement (not the hiring manager), and a sub-vendor learns the
 * client's name where the prime may share it, rather than never
 * (`lib/distribution`: the end client is described, not named, where the
 * agreement above forbids it).
 */
export const WHO_DOES_WHAT = {
  slug: 'who-does-what',
  title: 'Who does what',
  lede: 'Every company in a deal, from the client to its suppliers, on one table.',
  columns: ['Who', 'Buys from', 'Sells to', 'Sees'] as const,
  rows: [
    { who: 'Client', buysFrom: 'Every supplier', sellsTo: 'Nobody', sees: 'Every contractor on its sites, and the supplier it pays' },
    { who: 'MSP', buysFrom: '—', sellsTo: '—', sees: 'Runs the client’s program from a seat the client gives it. Never supplies a worker.' },
    { who: 'Integrator', buysFrom: 'Sub-vendors, or its own employees', sellsTo: 'The client', sees: 'Its own people and its own rates' },
    { who: 'Prime supplier', buysFrom: 'Sub-vendors, or its own employees', sellsTo: 'The client', sees: 'Its own people and its own rates' },
    { who: 'Sub-vendor', buysFrom: 'Its own employees', sellsTo: 'The prime', sees: 'The work site. The client’s name only where the prime may share it.' },
    { who: 'Bench supplier', buysFrom: 'Workers waiting for a project', sellsTo: 'The firm above', sees: 'Who agreed to be put forward' },
    { who: 'Worker', buysFrom: '—', sellsTo: 'Their time', sees: 'Every firm between them and the client, by name. Their own pay.' },
  ] as PartyRow[],
  closing: 'Rates stay closed at every level. A worker who owns their own company reads both the supplier and the worker row.',
}

// ── Time and money, and integrations ──────────────────────────────────

/** A short reference page: a heading, one line, a few short lines, and a small table where one helps. */
export interface ReferenceDoc {
  slug: string
  title: string
  lede: string
  lines: string[]
  table?: { columns: [string, string]; rows: [string, string][] }
}

export const TIME_AND_MONEY: ReferenceDoc = {
  slug: 'time-and-money',
  title: 'Time and money',
  lede: 'One approved week is the receipt. The client pays from it, and every supplier bills from it.',
  lines: [
    'Only the person who worked the week files it. Nobody else may.',
    'The client approves it first. Then each firm below accepts the same week, in turn.',
    'A supplier sends its invoice only for weeks the client approved, and only for the hours accepted.',
    'A supplier is paid on its matched invoice. An employee is paid by payroll.',
  ],
  table: {
    columns: ['A failed check on an invoice receipt', 'Can a person waive it?'],
    rows: [
      ['No approved week or expense behind a line', 'Never waived'],
      ['A week billed twice, or totals that do not add up', 'Never waived'],
      ['A rate that differs from the contract', 'Never waived. Change the contract instead.'],
      ['Hours under query, or an order being topped up', 'Yes, with a name and a reason'],
    ],
  },
}

export const INTEGRATIONS: ReferenceDoc = {
  slug: 'integrations',
  title: 'Integrations',
  lede: 'What crosses between Etyme and the systems you keep for contractors and suppliers, today.',
  lines: [
    'Journal entries go to your books once. An entry already sent never goes again.',
    'An entry whose account is not mapped is refused, not posted to a holding line.',
    'Webhooks for the events you choose. A failed delivery is shown as failed.',
    'API keys never hold more than the person who issued them.',
    'Every list exports to CSV.',
    'No named connector to any particular accounting, HR, payroll or expense product is built.',
  ],
}

export const REFERENCE: ReferenceDoc[] = [TIME_AND_MONEY, INTEGRATIONS]

export function referenceAt(slug: string): ReferenceDoc | null {
  return REFERENCE.find((r) => r.slug === slug) ?? null
}

/** Every page mounted at /docs/[slug], in reading order: the five step pages, who does what, then the two references. */
export function docSlugs(): string[] {
  return [...STEP_PAGES.map((p) => p.slug), WHO_DOES_WHAT.slug, ...REFERENCE.map((r) => r.slug)]
}

// ── The words, for the guards ─────────────────────────────────────────

/** Every word a reader sees on a docs page, split at the fold. */
export function copyOfDoc(path: string): { hero: string[]; body: string[] } | null {
  const step = stepPageAt(path)
  if (step) {
    return {
      hero: [stepEyebrow(step), step.title, step.lede],
      body: [
        STEP_HEADINGS.flow, ...flowWords(step.flow),
        STEP_HEADINGS.rules, ...step.rules,
        ...(step.more ? [step.more.title, ...step.more.lines] : []),
        STEP_HEADINGS.stops, ...step.stops.flatMap((r) => [REFUSAL_KIND[r.kind], `“${r.says}”`, ...(r.then ? [r.then] : [])]),
      ],
    }
  }
  if (path === WHO_DOES_WHAT.slug) {
    return {
      hero: [WHO_DOES_WHAT.title, WHO_DOES_WHAT.lede],
      body: [
        WHO_DOES_WHAT.columns.join('. ') + '.',
        ...WHO_DOES_WHAT.rows.map((r) => `${r.who}. ${r.buysFrom}. ${r.sellsTo}. ${r.sees}`),
        WHO_DOES_WHAT.closing,
      ],
    }
  }
  const r = referenceAt(path)
  if (r) {
    return {
      hero: [r.title, r.lede],
      body: [
        ...r.lines,
        ...(r.table ? [r.table.columns.join('. ') + '.', ...r.table.rows.map(([a, b]) => `${a}. ${b}`)] : []),
      ],
    }
  }
  const [group, slug, extra] = path.split('/')
  if (slug && !extra) {
    const t = topicAt(group, slug)
    if (t) return { hero: [t.title, t.lede], body: [GROUP_TITLE[t.group], ...t.lines] }
  }
  return null
}

export function copyOfDocsHome(): { hero: string[]; body: string[] } {
  return {
    hero: [DOCS_HOME.title, DOCS_HOME.lede],
    body: DOCS_HOME.groups.flatMap((g) => [g.heading, ...g.links.map((l) => [l.k, l.t, l.d].filter(Boolean).join(' · '))]),
  }
}

/** Every page under /docs, as routes, in reading order. */
export function docRoutes(): string[] {
  return ['/docs', ...docSlugs().map((s) => `/docs/${s}`), ...TOPICS.map(topicRoute)]
}
