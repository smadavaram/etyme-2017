/**
 * The documentation, public.
 *
 * ── Why it is public ─────────────────────────────────────────────────
 *
 * The static site put the documentation "behind sign-in". The founder
 * decided otherwise on 2026-09-26: documentation a buyer can read before
 * buying is half of what makes the large enterprise suites read as
 * products, and a docs link that demands an account reads as a product
 * with something to hide. Nothing here asks for an account, and the test
 * holds that.
 *
 * ── What is here ─────────────────────────────────────────────────────
 *
 * Ten party pages — the operating model drawn from each desk — converted
 * from the static site (see the header of each file for what the
 * conversion took out and why), and three pages written here:
 *
 *   - the documentation home, which lists them
 *   - time and money, rewritten because the static page claimed three
 *     rules the code does not enforce: that a contractor and a manager
 *     must both approve a week, that a manager cannot approve their own
 *     expenses, and that nobody can override an invoice past the order's
 *     ceiling. The last one is overridable with a name and a reason
 *     (`OVERRIDABLE.PO_BALANCE` in `lib/three-way-match`); the missing
 *     signed week is the one nobody can waive.
 *   - integrations, rewritten because the static page listed named ERP,
 *     HCM and expense products as "Connected". None of those connectors
 *     exists. What exists is a journal export that sends each entry once,
 *     API keys that cannot outrank the person who issued them, webhooks,
 *     statement reconciliation, and CSV from every list.
 *
 * ── Plain English, 2026-09-29 ────────────────────────────────────────
 *
 * The founder asked for words a reader in India, the US, the UK or
 * Australia reads without effort, native or not. Each party page opens
 * on short lines, not paragraphs: its position on a deal, what the
 * drawings show from that desk, and how to read a drawing. No sentence
 * runs past twenty-five words, and a test counts them.
 *
 * The party pages' HTML is hand-edited here; it is not generated. The
 * drawings are: `docs/lanes/streams.mjs` draws them and
 * `docs/lanes/render-model.mjs` writes `public/model/*.png`. So a
 * station's words live in two places, and a test fails when the stations
 * table here says something the drawing's source does not. Change both,
 * then run `node docs/lanes/build-all.mjs && node docs/lanes/render-model.mjs`.
 *
 * ── What was held back ───────────────────────────────────────────────
 *
 * "Held for everybody" (`docs-held-for-everybody.html`) is not brought
 * across. It is a list of test sentences extracted by machine and cut off
 * mid-phrase — "the seat you pick is the seat you get › a buyer" — naming
 * demo firms, and it is not documentation a buyer can read. Nothing
 * links to it.
 */

import { DOC as client } from './client'
import { DOC as systemsIntegrator } from './systems-integrator'
import { DOC as mspProgramOffice } from './msp-program-office'
import { DOC as primeVendor } from './prime-vendor'
import { DOC as subVendor } from './sub-vendor'
import { DOC as benchVendor } from './bench-vendor'
import { DOC as selfEmployed } from './self-employed'
import { DOC as candidate } from './candidate'
import { DOC as candidateIndependent } from './candidate-independent'
import { DOC as candidateEmployee } from './candidate-employee'

export interface PartyDoc {
  slug: string
  eyebrow: string
  title: string
  lede: string
  /** The page's own sections, for the side menu. */
  thisParty: { href: string; label: string }[]
  /**
   * The body, as HTML written in this repository. Trusted: nothing a user
   * typed reaches it, and the test reads every word of it.
   */
  html: string
}

/** The ten parties, in the order the operating model numbers them. */
export const PARTIES: { n: string; doc: PartyDoc }[] = [
  { n: '1', doc: client },
  { n: '2', doc: systemsIntegrator },
  { n: '3', doc: mspProgramOffice },
  { n: '4', doc: primeVendor },
  { n: '5', doc: subVendor },
  { n: '6', doc: benchVendor },
  { n: '7', doc: selfEmployed },
  { n: '8A', doc: candidate },
  { n: '8B', doc: candidateIndependent },
  { n: '8C', doc: candidateEmployee },
]

/** A page written here rather than converted: prose blocks and an optional screen. */
export interface ReferenceDoc {
  slug: string
  eyebrow: string
  title: string
  lede: string
  screen?: { img: string; alt: string; caption: string }
  blocks: { id: string; title: string; paragraphs?: string[]; items?: { t: string; d: string }[] }[]
}

export const TIME_AND_MONEY: ReferenceDoc = {
  slug: 'time-and-money',
  eyebrow: 'Documentation · Reference',
  title: 'Time and money',
  lede:
    'From an hour a contractor worked to the bill a client pays and the invoice a supplier is paid on. ' +
    'One signed week is the receipt, and every firm in the chain bills from it.',
  screen: {
    img: '/screens/timesheets.png',
    alt: 'A timesheets screen at a client: weeks waiting for a signature and weeks approved, one of them a 44-hour week over the hours.',
    caption:
      'The hiring manager at Northbend Athletic, a demo company — not a customer. Weeks waiting for a signature sit beside weeks already signed, at their bill rates.',
  },
  blocks: [
    {
      id: 'steps',
      title: 'Seven steps',
      items: [
        { t: '1 · The week is filed', d: 'By the person who worked it and by nobody else, the supplier that employs them included, against the contract. Never twice for one period, and submitting locks it.' },
        { t: '2 · It is read before anyone signs', d: 'Over twelve hours a day, over sixty a week, over the job’s hours, or past the contract’s end is flagged and shown first. Flags warn; they never block.' },
        { t: '3 · The client signs', d: 'The manager who owns the work approves it. The person who filed it cannot, and a rejection needs a reason.' },
        { t: '4 · The employer accepts', d: 'The firm that pays the person says what it will pay for. That is a second signature, because it is a different statement. In a chain the signed week goes down it, and each firm accepts it in turn, never before the firm above it has.' },
        { t: '5 · The supplier sends its invoice', d: 'Only from weeks the client already signed. The same week travels up the chain, and each firm bills it at its own rate.' },
        { t: '6 · The supplier’s invoice is matched', d: 'A signed week behind every line, the hours billed against the hours approved, the rate against the contract, and room left on the order.' },
        { t: '7 · Money moves two ways', d: 'A supplier is paid against its matched invoice. An employee is paid by payroll, and sees what they are paid, never a rate above it.' },
      ],
    },
    {
      id: 'waivable',
      title: 'What can be waived, and what cannot',
      paragraphs: [
        'A check that fails on a supplier’s invoice is either waivable with a name and a reason, or not waivable at all. The screen says which.',
      ],
      items: [
        { t: 'Never waived', d: 'A line with no signed week or approved expense behind it. A week billed twice. Arithmetic that does not add up. A rate that differs from the contract.' },
        { t: 'Waived with a name and a reason', d: 'Hours under query, a week approved after the cut-off, a part period, an order being raised after the fact, and an order being topped up.' },
        { t: 'A different rate is a contract change', d: 'It is amended on the contract, from the day it changed, by somebody with the authority. It is never a note on one bill.' },
      ],
    },
    {
      id: 'words',
      title: 'Three words, named by who issues each',
      items: [
        { t: 'Bill', d: 'What a firm sends its customer. The party who issues a document names it, and the firm is the one billing.' },
        { t: 'Invoice receipt', d: 'A supplier’s invoice, received and matched. The supplier issues it; the buyer receives it.' },
        { t: 'Payroll', d: 'How an employee is paid. Never billed and never invoiced.' },
      ],
    },
  ],
}

export const INTEGRATIONS: ReferenceDoc = {
  slug: 'integrations',
  eyebrow: 'Documentation · Reference',
  title: 'Integrations',
  lede:
    'Etyme keeps the record for contractors and suppliers, and your ERP, HCM and expense systems keep theirs. ' +
    'This page says what crosses between them today, and what does not yet.',
  blocks: [
    {
      id: 'today',
      title: 'What crosses today',
      items: [
        { t: 'Journal export, once', d: 'The journal entries waiting to go to your books are exported and stamped as sent in one step. An entry already sent never goes again, so nothing posts twice.' },
        { t: 'Refused on an unmapped account', d: 'An entry whose account is not mapped is refused, rather than posted to a suspense line somebody chases next month.' },
        { t: 'Webhooks', d: 'Subscribe to the events you want. A delivery that fails is shown as failed, never dropped quietly.' },
        { t: 'API keys', d: 'Issued by somebody who may manage the team, and never holding more than the person who issued them.' },
        { t: 'Statement reconciliation', d: 'Paste a counterparty’s statement and it is matched against what was billed in the period. Every break is named and kept.' },
        { t: 'CSV from every list', d: 'Every list in the product exports what it shows.' },
      ],
    },
    {
      id: 'not-yet',
      title: 'What is not built',
      paragraphs: [
        'No named connector to a particular ERP, HCM, payroll, expense, signature or background-check product is built.',
        'In the drawings, a station marked ERP, HCM or Expenses is where a document would cross to that system. Today it crosses as an export, a webhook or a call to the API.',
      ],
    },
    {
      id: 'signin',
      title: 'Sign-in',
      paragraphs: [
        'Business users sign in through their own company’s sign-in, and the verified corporate domain is the company. ' +
          'Candidates sign in with an email link.',
      ],
    },
  ],
}

export const REFERENCE: ReferenceDoc[] = [TIME_AND_MONEY, INTEGRATIONS]

export const DOCS_HOME = {
  eyebrow: 'Documentation',
  title: 'How contractors and suppliers move through Etyme',
  lede:
    'Every flow, station by station, drawn from each party’s desk. It includes the stations not built yet. ' +
    'It is public, and none of it needs an account.',
  inside: [
    { t: 'Job request to start', d: 'A hiring manager raises a job request, and three desks clear it in order. Only the suppliers Procurement approved see it. The award writes the contract.', href: '/docs/client#l1-1' },
    { t: 'Time and money', d: 'The signed week is the receipt. One row of hours runs through the chain, then the three-way check, and payroll for employees.', href: '/docs/time-and-money' },
    { t: 'The autonomy ladder', d: 'Everything the system does on its own has a level, from L0 observe to L5 autonomous within policy. A row says whether it can be undone.', href: '/security#done' },
  ],
  example:
    'The example program is the same flows with a month of data in them. Open it at any desk, with no account.',
}

export type AnyDocSlug = string

/** Every page under /docs, with its slug, in the order the side menu lists them. */
export function docSlugs(): string[] {
  return [...PARTIES.map((p) => p.doc.slug), ...REFERENCE.map((r) => r.slug)]
}

export function partyAt(slug: string): PartyDoc | null {
  return PARTIES.find((p) => p.doc.slug === slug)?.doc ?? null
}

export function referenceAt(slug: string): ReferenceDoc | null {
  return REFERENCE.find((r) => r.slug === slug) ?? null
}

/** The words of an HTML body, for the guard. Tags out, entities as the reader sees them. */
export function textOfHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<\/(p|li|td|th|h2|h3|figcaption|b)>/g, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rarr;/g, '→')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every word a reader sees on a docs page, split at the fold. */
export function copyOfDoc(slug: string): { hero: string[]; body: string[] } | null {
  const p = partyAt(slug)
  if (p) return { hero: [p.eyebrow, p.title, p.lede], body: [textOfHtml(p.html)] }
  const r = referenceAt(slug)
  if (r) {
    return {
      hero: [r.title, r.lede],
      body: [
        ...(r.screen ? [r.screen.caption] : []),
        ...r.blocks.flatMap((b) => [b.title, ...(b.paragraphs ?? []), ...(b.items ?? []).flatMap((i) => [i.t, i.d])]),
      ],
    }
  }
  return null
}

export function copyOfDocsHome(): { hero: string[]; body: string[] } {
  return {
    hero: [DOCS_HOME.title, DOCS_HOME.lede],
    body: [...DOCS_HOME.inside.flatMap((i) => [i.t, i.d]), DOCS_HOME.example],
  }
}
