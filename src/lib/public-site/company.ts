/**
 * About, contact and the security position, as data.
 *
 * ── Where each came from ─────────────────────────────────────────────
 *
 * About and Contact are the static site's (`about.html`, `contact.html`
 * on the old repository's `development` branch), kept where they were
 * checkable and cut where they were not:
 *
 *   - "we respond within 24 hours" is a promise nobody has made, and
 *     `SECURITY.md` already refuses to invent a response time for the
 *     same reason. Contact says a person reads every message, which is
 *     true, and says it without a clock.
 *   - "Questions about pricing?" is gone. The price is not set, and a
 *     mailbox labeled for it invites the question the page cannot answer.
 *   - "A manager never approves their own expenses" is gone. Nothing in
 *     `lib/expense-approval` refuses it, and a rule claimed and not
 *     enforced is the worst kind of claim a governance product can make.
 *
 * ── The security position was not on the static site ─────────────────
 *
 * `audit.html` looked like it, and is the spend-audit landing page:
 * "Average cost found $180K", "11 days saved", "Find hidden costs in
 * your supplier network". Three invented numbers and a sentence aimed at
 * suppliers. It is not brought across; the spend audit is `/census`.
 *
 * So the security position is written here from `docs/security-posture.md`,
 * which names the file behind every claim, and from the assurance
 * decision of 2026-09-22 in CLAUDE.md. What is done, what is not, and
 * the order the rest comes in, with no date where none is committed.
 * A figure that changes whenever somebody adds a route — how many route
 * files write an access log — is described rather than counted, so the
 * page cannot go stale on another agent's commit.
 */

import { ADDRESS } from './nav'

export interface Block {
  id: string
  title: string
  paragraphs?: string[]
  items?: { t: string; d: string }[]
}

export interface CompanyPage {
  route: '/about' | '/contact' | '/security'
  eyebrow: string
  title: string
  lede: string
  blocks: Block[]
}

export const ABOUT: CompanyPage = {
  route: '/about',
  eyebrow: 'About Etyme',
  title: 'One record for every contractor. That is the whole company.',
  lede:
    'Etyme builds the system a program office uses to see every contractor on its sites, which supplier sent them, and what they cost. ' +
    'It also builds the rules that keep that record honest.',
  blocks: [
    {
      id: 'build',
      title: 'What we build',
      paragraphs: [
        'Companies that use staffing suppliers know their employees by name and their contractors by invoice. ' +
          'Etyme keeps one record across that gap.',
        'The role that was raised, the supplier that filled it, the contract it wrote, the weeks that were signed, the invoices that matched, and the papers checked before day one. ' +
          'Eight areas, in the order the work happens.',
        'Nobody sees a rate that is not theirs, and everybody sees what is waiting on them.',
      ],
    },
    {
      id: 'work',
      title: 'How we work',
      items: [
        { t: 'Rules before people', d: 'A requirement clears by rule first and goes to a person only when a rule fails. Where the law is behind a rule, the product blocks.' },
        { t: 'Nobody signs their own', d: 'A contractor never approves their own week, and whoever raised a requisition cannot approve it. An invoice with no signed week behind it is not paid.' },
        { t: 'Nothing we would take back', d: 'No borrowed customer logos, no analyst quadrant, and no price we have not settled. What is on this site is checkable today.' },
        { t: 'Free while testing', d: 'Etyme is free while it is tested with its first firms. Governance is part of every program and never a paid tier.' },
      ],
    },
    {
      id: 'neutral',
      title: 'Etyme never runs a bench and never places anybody',
      paragraphs: [
        'The record sits between a company and every supplier it uses, so it can only work if no supplier has to compete with it. ' +
          'It has no contractors of its own to sell.',
        'Your suppliers keep their clients, their rates and their sub-vendors’ names. ' +
          'What they get from the record is faster approvals, invoices matched and paid, and fewer spreadsheets.',
        'If you would rather not staff a program office, Etyme can run it for you on the same record. ' +
          'You keep every decision that is yours: who may supply, at what band, and who is chosen.',
      ],
    },
    {
      id: 'where',
      title: 'Where we are',
      paragraphs: [
        `${ADDRESS.company}, ${ADDRESS.street}, ${ADDRESS.city}.`,
        `${ADDRESS.phone} · ${ADDRESS.email}`,
      ],
    },
  ],
}

export const CONTACT: CompanyPage = {
  route: '/contact',
  eyebrow: 'Contact',
  title: 'A person answers.',
  lede:
    'Questions about contractors, suppliers or the example program go to a person at Etyme in Durham, North Carolina. ' +
    'Nobody here is a bot, and nothing you send starts a sequence of emails.',
  blocks: [
    {
      id: 'office',
      title: 'Headquarters',
      paragraphs: [
        ADDRESS.company,
        ADDRESS.street,
        ADDRESS.city,
        ADDRESS.phone,
      ],
    },
    {
      id: 'write',
      title: 'Write to us',
      items: [
        { t: ADDRESS.email, d: 'Help with an account, the example program, or the documentation.' },
        { t: 'sales@etyme.com', d: 'Anything about running your own program on Etyme, or having Etyme run it.' },
      ],
    },
    {
      id: 'ask',
      title: 'Or leave a sentence',
      paragraphs: [
        'An email address and a sentence are enough. A person reads it and writes back, and your address is used for that reply and nothing else.',
      ],
    },
  ],
}

export const SECURITY: CompanyPage = {
  route: '/security',
  eyebrow: 'Security position',
  title: 'What is done, what is not, and when.',
  lede:
    'Etyme holds contractors’ immigration status, onboarding papers and pay, for companies and every supplier they use. ' +
    'This page is written for the person reviewing that, and it lists the gaps as plainly as the controls.',
  blocks: [
    {
      id: 'today',
      title: 'Where Etyme stands today',
      paragraphs: [
        'Etyme has no SOC 2 report, no ISO 27001 certificate and no third-party penetration test. ' +
          'A security page with no gaps on it is a page nobody checked.',
        'A longer version exists for a security review, and it names the file behind every claim below.',
      ],
    },
    {
      id: 'done',
      title: 'What is done',
      items: [
        { t: 'Walls at the query', d: 'A record belonging to another company is excluded by the database query, not hidden on the screen after it arrives.' },
        { t: 'Sign-in through your own tenant', d: 'Business users sign in through their own company’s sign-in. A personal email address cannot register a company.' },
        { t: 'A role for every seat, in the trade’s words', d: 'Account manager, contract manager, accounts receivable, AP and payroll, compliance officer. Each sees what its job needs.' },
        { t: 'Every read of a person, logged', d: 'The routes that read a named person write who read it, why, and whether it was allowed. Refusals are logged as carefully as reads.' },
        { t: 'Segregation of duties, enforced', d: 'Nobody approves their own hours or their own requisition, and whoever recommended a supplier cannot decide it. Each refusal is a sentence.' },
        { t: 'Attestations, not verdicts', d: 'A check is recorded as who ran it, when, and when it expires. Etyme never declares a person cleared to work.' },
        { t: 'Automation on a declared ladder', d: 'Everything the system does on its own carries a level from L0 to L5, a plain-English reason, and an honest flag for whether it can be undone.' },
        { t: 'Erasure that keeps the books', d: 'A person can export and erase their own data. Erasure anonymizes the person and leaves signed hours and amounts as they were.' },
        { t: 'Retention as code', d: 'Each category is kept for a period with the rule that requires it cited. Where no rule can be cited, the schedule says so rather than inventing one.' },
        { t: 'Somebody is told when it breaks', d: 'A failure in any API route writes an incident and emails staff, and the daily job reports that it ran even on a day nothing broke.' },
      ],
    },
    {
      id: 'not',
      title: 'What is not done',
      items: [
        { t: 'Attestation', d: 'No SOC 2 Type I or Type II, no ISO 27001, and no penetration test, ever.' },
        { t: 'At the edge', d: 'No rate limiting, no firewall rules and no bot protection in the application, and no content security policy configured.' },
        { t: 'Sign-in', d: 'Multi-factor sign-in is inherited from your corporate tenant, not enforced by Etyme. SSO enforcement and automated provisioning are not built.' },
        { t: 'Recovery', d: 'No documented backup and restore procedure, no restore tested, and no disaster recovery plan.' },
        { t: 'Encryption', d: 'Encryption at rest and in transit is what the hosting providers supply. It is not configured or verified by Etyme.' },
        { t: 'People', d: 'No named security officer, and no formal access review of Etyme’s own staff.' },
        { t: 'Disclosure', d: 'The vulnerability disclosure policy is written. Its mailbox is not live yet.' },
      ],
    },
    {
      id: 'when',
      title: 'When',
      paragraphs: [
        'The order is decided. A penetration test comes first, because an attestation written over controls nobody has attacked is the wrong way round.',
        'Then a SOC 2 Type I assessment of how the controls are designed, and then the Type II observation window, which commonly runs six months and cannot be shortened later. ISO 27001 follows the same evidence.',
        'No date is published here, because none is contracted. When one is, it goes on this page.',
      ],
    },
    {
      id: 'report',
      title: 'Reporting a vulnerability',
      paragraphs: [
        'Please report privately, and stop as soon as you have proved a flaw is possible. Test on the example program, which holds no real people and no real money.',
        'Until the security mailbox is live, send a report to the person at Etyme who gave you access, or to the address on the contact page.',
      ],
    },
  ],
}

export const COMPANY_PAGES: CompanyPage[] = [ABOUT, CONTACT, SECURITY]

/** Every word a reader sees on a company page, split at the fold. */
export function copyOfCompanyPage(p: CompanyPage): { hero: string[]; body: string[] } {
  return {
    hero: [p.title, p.lede],
    body: p.blocks.flatMap((b) => [
      b.title,
      ...(b.paragraphs ?? []),
      ...(b.items ?? []).flatMap((i) => [i.t, i.d]),
    ]),
  }
}
