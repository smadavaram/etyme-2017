/**
 * Your records and recruiting: the two parts of the documentation beside
 * the four steps. Decided by the founder, 2026-09-30: "split job
 * requirement and master data like business partner (customer, vendor)
 * and consultant management, and matching, screening, application
 * tracking."
 *
 * Cut to one screen on 2026-10-15, with the rest of the public site (the
 * founder: "make it real and make it simple"): a heading, one line, and
 * at most six short lines. The flow charts, the "read it as one party"
 * links and the product-page links went; the facts a buyer can check
 * stayed. The headings are the drawing's: Customers, Suppliers and
 * Contractors under "Your records"; Who matches a job, Screening and Who
 * applied under "Recruiting". The addresses did not move.
 */

import type { DemoTarget } from '../flow'

export type TopicGroup = 'master-data' | 'recruiting'

export interface TopicPage {
  group: TopicGroup
  slug: string
  title: string
  /** One line under the title. Names contractors or suppliers. */
  lede: string
  /** At most six, one idea each. */
  lines: string[]
  demo?: DemoTarget
}

export const GROUP_TITLE: Record<TopicGroup, string> = {
  'master-data': 'Your records',
  recruiting: 'Recruiting',
}

export const TOPICS: TopicPage[] = [
  // ── Your records ───────────────────────────────────────────────────
  {
    group: 'master-data',
    slug: 'customers',
    title: 'Customers',
    lede: 'The customer is the company that uses contractors from its suppliers. It buys and never sells.',
    lines: [
      'One company is one domain name. Its people sign in through their own company.',
      'It sets its rules once: the time limit, the break in service and the rate ranges.',
      'An agreement (MSA) with a supplier is optional.',
      'An order holds the spending limit. Each line on it is one person at one rate.',
      'It sees the supplier it pays and the rate it pays, and nothing below.',
      'It always sees whether the firm employing a person on its site is insured.',
    ],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/program', seat: 'the program manager' },
  },
  {
    group: 'master-data',
    slug: 'suppliers',
    title: 'Suppliers',
    lede: 'A supplier is approved by four people at the client before it is sent a job.',
    lines: [
      'A department lead confirms the need. Procurement, HR and Finance each check their part.',
      'Whoever recommended the firm decides none of it.',
      'A supplier whose insurance lapsed can put nobody forward until it is renewed.',
      'Prime, sub and bench are positions on a deal, not kinds of company.',
      'A firm that is not on Etyme is outside the record. What it forwards by email, Etyme cannot see.',
    ],
    demo: { as: 'world-nike', desk: 'procurement', screen: '/dashboard/suppliers', seat: 'Procurement' },
  },
  {
    group: 'master-data',
    slug: 'consultants',
    title: 'Contractors',
    lede: 'A contractor is one person on the record, whichever supplier puts them forward.',
    lines: [
      'A supplier puts a person forward only with their consent.',
      'A firm’s own employee is the exception. They are told, not asked.',
      'The contractor’s own page names every firm between them and the client.',
      'Only the contractor files their own week.',
      'At the client, each person has one page: time here, interviews and papers. Every look at it is logged.',
    ],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/people', seat: 'the program manager' },
  },

  // ── Recruiting ─────────────────────────────────────────────────────
  {
    group: 'recruiting',
    slug: 'matching',
    title: 'Who matches a job',
    lede: 'Each supplier scores the people who agreed to be put forward against a job, and every score says why.',
    lines: [
      'A score always says what it used, how sure it is, and what it could not check.',
      'Where no model is available, the score falls back to plain arithmetic.',
      'A score never decides whether someone may legally work.',
      'A client can ask for a person it knows. The ask goes to their supplier, never to the person.',
    ],
  },
  {
    group: 'recruiting',
    slug: 'screening',
    title: 'Screening',
    lede: 'Every person a supplier sends is checked against the same nine checks before a manager sees them.',
    lines: [
      'The rate is within the range this supplier was given.',
      'Nobody else has already put the same person forward.',
      'The work permit fits the job, and the start date is close enough.',
      'The time limit and the client’s own do-not-send list are respected.',
      'A failed check goes back to the supplier with the fix. After two tries, it goes to a person.',
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/submissions', seat: 'the hiring manager' },
  },
  {
    group: 'recruiting',
    slug: 'application-tracking',
    title: 'Who applied',
    lede: 'Every supplier’s candidates for one job sit on one screen, each at its stage.',
    lines: [
      'Submitted, shortlisted, interviewed in rounds, chosen.',
      'The same person from two suppliers: the first one wins, and the second is told.',
      'A rate above the range warns. It does not block.',
      'The client’s interview notes never leave the client.',
      'When the last position is filled, the other suppliers are told.',
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/submissions', seat: 'the hiring manager' },
  },
]

export function topicsIn(group: TopicGroup): TopicPage[] {
  return TOPICS.filter((t) => t.group === group)
}

export function topicAt(group: string, slug: string): TopicPage | null {
  return TOPICS.find((t) => t.group === group && t.slug === slug) ?? null
}

export function topicRoute(t: TopicPage): string {
  return `/docs/${t.group}/${t.slug}`
}
