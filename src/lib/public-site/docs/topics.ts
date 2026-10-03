/**
 * Master data and recruiting: the two parts of the documentation beside
 * the process. Decided by the founder, 2026-09-30: "split job
 * requirement and master data like business partner (customer, vendor)
 * and consultant management, and matching, screening, application
 * tracking."
 *
 * Each page is the same shape as a process page: a flow chart first,
 * then short lines, then the rest of its group with "you are here". Each
 * line says something the product already does, and names the page or
 * the file where a reader can check it on the site.
 */

import type { DemoTarget, FlowBox } from '../flow'

export type TopicGroup = 'master-data' | 'recruiting'

export interface TopicPage {
  group: TopicGroup
  slug: string
  title: string
  /** One line under the title. Names contractors or suppliers. */
  lede: string
  flow: FlowBox[]
  lines: string[]
  /** The party pages this reads well beside. */
  parties: string[]
  /** The product page that shows it, if one does. */
  product?: string
  demo?: DemoTarget
}

export const GROUP_TITLE: Record<TopicGroup, string> = {
  'master-data': 'Master data',
  recruiting: 'Recruiting',
}

export const GROUP_LEDE: Record<TopicGroup, string> = {
  'master-data': 'The business partners — customers and suppliers — and the consultants every process runs on.',
  recruiting: 'How people are matched to a job, screened on arrival, and tracked to an award.',
}

export const TOPICS: TopicPage[] = [
  // ── Master data ────────────────────────────────────────────────────
  {
    group: 'master-data',
    slug: 'customers',
    title: 'Customers',
    lede: 'The customer is the company that uses contractors from its suppliers. It buys and never sells.',
    flow: [
      { who: 'CLIENT', t: 'The company signs in with its own domain' },
      { who: 'CLIENT', t: 'It sets its policy: time limit, break, rate bands' },
      { who: 'CLIENT', t: 'It names its desks' },
      { who: 'CLIENT', t: 'It signs an agreement with a supplier, if it wants one' },
      { who: 'CLIENT', t: 'It raises orders: a header, and a line per person' },
    ],
    lines: [
      'One company is one domain name. Its staff sign in through their company’s own sign-in.',
      'The policy is set once: the time limit, the break in service and the rate bands.',
      'HR and Procurement are named per business unit. The nearest one decides.',
      'Where no lead is named yet, the program office stands in.',
      'The agreement (MSA) is optional. A customer with one order and one contractor never needs one first.',
      'The agreement can require a supplier to name the firms below it. That is off unless the customer asks at signing.',
      'An order holds the ceiling. Each line holds one person and one rate.',
      'Papers the customer requires are set on the order. Every line under it inherits them.',
      'The customer sees the supplier it pays, and the rate it pays, and nothing below.',
      'It always sees whether the firm employing a person on its site is insured and authorized.',
    ],
    parties: ['client', 'msp-program-office'],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/program', seat: 'the program manager' },
  },
  {
    group: 'master-data',
    slug: 'suppliers',
    title: 'Suppliers',
    lede: 'A supplier walks four desks at the client before it may be sent a job.',
    flow: [
      { who: 'CLIENT', t: 'Somebody recommends the firm' },
      { who: 'CLIENT', t: 'Their department lead confirms the need' },
      { who: 'CLIENT', t: 'Procurement qualifies the firm' },
      { who: 'CLIENT', t: 'HR clears its compliance' },
      { who: 'CLIENT', t: 'Finance checks the tax form and bank details' },
      { who: 'SUPPLIER', t: 'The firm is an approved supplier' },
    ],
    lines: [
      'The firm gets a link of its own to send its side. No sign-in is needed.',
      'What the firm sends is received, never verified, until the desk says so.',
      'Procurement reads its experience, references, revenue, delivery proofs, proposal and a business credit report.',
      'HR clears the certificate of insurance and a sanctions and litigation screening.',
      'Finance verifies the tax form and the bank details, and says the last yes.',
      'Each desk verifies its own items. Nobody decides two desks.',
      'Whoever recommended the firm decides none of it.',
      'Bank details are kept to the bank, the account name and the last four digits.',
      'A supplier’s standing is probation, approved or preferred.',
      'A supplier whose insurance lapsed can submit nobody until it is back in date.',
      'A supplier brings its own team: account managers, recruiters, HR, contract managers and finance.',
      'A client can star a firm it would use again, or block one.',
    ],
    parties: ['prime-vendor', 'sub-vendor', 'bench-vendor', 'systems-integrator', 'self-employed'],
    product: '/requisitions',
    demo: { as: 'world-nike', desk: 'procurement', screen: '/dashboard/suppliers', seat: 'Procurement' },
  },
  {
    group: 'master-data',
    slug: 'consultants',
    title: 'Consultants',
    lede: 'A contractor is one person on the record, whichever supplier puts them forward.',
    flow: [
      { who: 'SUPPLIER', t: 'A supplier adds the consultant' },
      { who: 'SUPPLIER', t: 'They are marketed by default, unless the firm keeps them' },
      { who: 'WORKER', t: 'The consultant agrees to be put forward' },
      { who: 'SUPPLIER', t: 'The supplier submits them to a job' },
      { who: 'RULES', t: 'Time on site counts per person at the client' },
    ],
    lines: [
      'A firm submits a person only with their consent: a bench listing they granted.',
      'A firm’s own W2 employee is the exception. The employee is told, not asked.',
      'Nothing about the consultant reaches past the firm until the consultant grants it.',
      'Consultants sign in with an email link. No company domain is needed.',
      'The consultant’s own page names every firm between them and the client.',
      'Rates at levels the consultant is not part of stay closed.',
      'Only the worker files their own week.',
      'At the client, each person has one page: time here, submissions, interviews and paperwork.',
      'Every read of that page is logged.',
      'A client can star a person it would take again, or block one.',
    ],
    parties: ['candidate', 'candidate-independent', 'candidate-employee', 'self-employed'],
    product: '/compliance',
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/people', seat: 'the program manager' },
  },

  // ── Recruiting ─────────────────────────────────────────────────────
  {
    group: 'recruiting',
    slug: 'matching',
    title: 'Matching',
    lede: 'Each supplier scores the people on its bench against a job, and every score says why.',
    flow: [
      { who: 'CLIENT', t: 'A job is released to the supplier' },
      { who: 'SUPPLIER', t: 'Its bench is read against the job' },
      { who: 'RULES', t: 'Each person gets a score with its reasons' },
      { who: 'SUPPLIER', t: 'The supplier chooses whom to put forward' },
    ],
    lines: [
      'Only people with an active bench listing are scored.',
      'A score always carries its factors, what it is based on, how sure it is, and what it could not check.',
      'A bare number with no reasons is treated as a fault.',
      'Where no model is available, the score falls back to plain arithmetic.',
      'A score never decides whether someone may legally work.',
      'A client can ask for a person it knows. The ask goes to the supplier holding their consent.',
    ],
    parties: ['bench-vendor', 'prime-vendor'],
    product: '/submissions',
  },
  {
    group: 'recruiting',
    slug: 'screening',
    title: 'Screening',
    lede: 'Every person a supplier submits is read against the same nine checks before a manager sees them.',
    flow: [
      { who: 'SUPPLIER', t: 'The supplier submits a person' },
      { who: 'RULES', t: 'Nine checks run' },
      { who: 'SUPPLIER', t: 'A failed check goes back to the supplier, with the fix' },
      { who: 'CLIENT', t: 'A passed person reaches the hiring manager' },
    ],
    lines: [
      'Within budget: at or under the rate band the supplier was given.',
      'Already submitted: the same person from another supplier.',
      'Work authorization: the permit matches what the job needs.',
      'Can start: close enough to when the work starts.',
      'Supplier engaged: this supplier was actually sent the job.',
      'Governance: the time limit and the break in service.',
      'Not barred: not on the client’s own do-not-submit list.',
      'Skills evidenced: the skills claimed are in the résumé.',
      'Worked here before: never a failure. It tells the client something useful.',
      'A failed check does not mean the person is unsuitable. The submission waits until the supplier fixes it.',
      'After two tries, it goes to a person.',
    ],
    parties: ['client', 'prime-vendor'],
    product: '/submissions',
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/submissions', seat: 'the hiring manager' },
  },
  {
    group: 'recruiting',
    slug: 'application-tracking',
    title: 'Application tracking',
    lede: 'Every supplier’s candidates for one job sit on one screen, each at its stage.',
    flow: [
      { who: 'SUPPLIER', t: 'Submitted' },
      { who: 'CLIENT', t: 'Shortlisted' },
      { who: 'CLIENT', t: 'Interviewed, in rounds' },
      { who: 'CLIENT', t: 'Awarded' },
      { who: 'RULES', t: 'The other suppliers are stood down' },
    ],
    lines: [
      'The same person twice on a job: the first submission wins, and the second firm is told.',
      'A rate above the ceiling warns. It does not block.',
      'Interviews run in rounds, in turn. The supplier and the candidate are told on their own channels.',
      'Only whoever is hiring may set up or decide a round.',
      'The client’s interview notes never leave the client.',
      'A supplier can decline an invitation, and whoever is hiring is told.',
      'A client writes to a supplier on the thread for the job, and the supplier answers there.',
      'Only the client can award. When the last position is filled, the other suppliers are stood down.',
      'A paused job refuses new submissions, in a sentence.',
    ],
    parties: ['client', 'prime-vendor', 'bench-vendor'],
    product: '/submissions',
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
