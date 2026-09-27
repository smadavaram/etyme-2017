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
  /** A screen from the seeded demo, drawn under the words. */
  screen?: { img: string; alt: string; caption: string; from: string; capturedAt: string }
}

/**
 * The four questions a client cannot answer about its own workforce, each
 * answered in a line that names the screen answering it.
 *
 * On the home page until 2026-09-27, when it became five bands; here
 * since, word for word, beside the long form of why nobody can answer
 * them today. `route` is the screen it opens, and the test checks the
 * folder is really there. Tenure is the fourth of four and gets one line:
 * it is the moat, not the wedge.
 */
export const FOUR_ANSWERS: { q: string; screen: string; route: string; etyme: string }[] = [
  {
    q: 'How many contractors are on our sites right now?',
    screen: 'Workforce',
    route: 'people',
    etyme: 'The Workforce screen lists every contractor on site today, across every supplier.',
  },
  {
    q: 'What are we spending on them this quarter, and with whom?',
    screen: 'Program',
    route: 'program',
    etyme: 'The Program screen shows this month by supplier, and the Invoices screen what each one billed.',
  },
  {
    q: 'Are we paying two suppliers different money for the same work?',
    screen: 'Rates',
    route: 'rate-history',
    etyme: 'The Program screen puts two suppliers’ rates for one role side by side. The Rates screen keeps who agreed each.',
  },
  {
    q: 'Who has been here longest?',
    screen: 'Tenure',
    route: 'tenure',
    etyme: 'The Tenure screen counts each person’s days on your sites across every supplier, once per day.',
  },
]

/**
 * The two ways to run a program on the record, in the founder's two
 * labels (decided 2026-09-20). On the home page until 2026-09-27, which
 * now offers the service in one quiet sentence and links here.
 *
 * The MSP card says what the client gets, not that Etyme would run it:
 * About already makes the offer once, under #neutral, and a page that
 * offers it twice has stopped offering and started pitching.
 */
export const TWO_WAYS: { label: string; says: string }[] = [
  {
    label: 'VMS software',
    says: 'Your own program office runs the program on Etyme. Your people hold the seats. Etyme holds the record and the rules.',
  },
  {
    label: 'MSP provider',
    says: 'Etyme staff sit in seats your company grants them, work to your rules, and every read they make is logged.',
  },
]

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
        // The note under the header's Industries menu, kept when the menu
        // went on 2026-09-27. Horizontal, never vertical.
        'One product serves every industry. There is no industry-specific version to buy.',
        // The hero's span line, 2026-09-27. Naming every station once, in
        // the trade's order, is what stops any one of them reading as the
        // product.
        'Requisition, suppliers, submissions, screening, interviews, onboarding, timesheets, invoices, compliance. ' +
          'One record holds all of it, and each desk opens the part that is its own.',
      ],
    },
    // ── Four blocks moved from the home page, 2026-09-27 ──────────────
    //
    // The founder asked for the home page to read like a Microsoft or SAP
    // product page rather than an essay. It was 3,771 words. What was on
    // it and belonged to no one station came here, word for word where
    // the words had already been read against the code: why nobody can
    // answer the four questions (#gap's long form), how one hire moves
    // (#lifecycle), what it sits beside (#alongside), and what is settled
    // about the money (#why). `positioning.test.ts` finds each phrase
    // here, so a section cannot fall off both pages.
    {
      id: 'unanswered',
      title: 'Why nobody can answer the four questions today',
      paragraphs: [
        'You can name every employee on your payroll. Nobody can name every contractor on your sites.',
        'A supplier hired almost all of them. Sometimes a supplier’s subcontractor did. ' +
          'They badge in on Monday and turn up on a bill at the end of the month. No system you own counts them the same way twice.',
        'A CFO, an auditor or a board member asks how many contractors you have. The program manager says: let me come back to you. ' +
          'Then three weeks of asking every supplier for a spreadsheet, and procurement chasing the two that do not reply.',
        'No supplier can add that up, and no supplier is hiding anything. Each one sees only its own contractors. ' +
          'A VMS sees inside one program. You cannot get the total by asking, because nobody you could ask is holding all of it.',
      ],
      items: [
        { t: 'How many contractors are on our sites right now?', d: 'Each supplier counts its own contractors. Nobody adds the counts up, and two attempts give two totals.' },
        { t: 'What are we spending on them this quarter, and with whom?', d: 'Bills arrive on different dates into different inboxes. The quarter ends before the number is assembled.' },
        { t: 'Are we paying two suppliers different money for the same work?', d: 'Rates sit on invitations and in email. Putting them side by side means asking each supplier what it charges.' },
        { t: 'Who has been here longest?', d: 'Time through one supplier and time through another read as two contractors, each with less time than the person has.' },
      ],
    },
    // ── Moved from the home page's #gap band, 2026-09-27 ─────────────
    //
    // The home page keeps one hook line in its hero. The answers, the
    // one screen that is hardest to believe from prose, and the sentence
    // about what the client sees below its supplier are here, one click
    // from why nobody can answer today.
    {
      id: 'answered',
      title: 'Etyme shows every contractor on your sites, whoever placed them',
      paragraphs: [
        'You see the person, and whether the firm that employs them is insured and authorized. ' +
          'What your supplier arranges below that stays its own, unless your agreement with it says otherwise.',
      ],
      items: FOUR_ANSWERS.map((a) => ({ t: a.q, d: a.etyme })),
      screen: {
        img: '/screens/contractors.png',
        alt: 'A contractors table: one row per person, with the supplier that sent them, their status, where they are and their months on site.',
        caption: 'Every contractor at Northbend Athletic, an invented company in the example program, whichever supplier sent them.',
        from: '/dashboard/people, table view, as the program manager',
        capturedAt: '2026-09-21T15:17:41Z',
      },
    },
    {
      id: 'hire',
      title: 'One hire moves through six milestones, and three of them can stop it',
      paragraphs: [
        'The hiring manager raises it, HR reads the role, procurement audits the suppliers, and the lead who owns the cost center signs the money.',
        'The supplier submits, you award, compliance clears the start, the plant signs the week, and accounts payable pays what matched. Nobody signs their own.',
        'Raised, awarded and cleared can stop the deal. Released, working and ended record what happened. ' +
          'Each product page quotes the sentence its screen shows when it stops something.',
        'Inside, a placement moves through more states than six. Nobody using it has to learn any of them. ' +
          'It is one record, end to end, for one company or for nine of them in a chain.',
      ],
      items: [
        { t: 'Raised', d: 'A manager needs somebody, with a budget and a rate band. It can stop here.' },
        { t: 'Released', d: 'To the suppliers your program office cleared.' },
        { t: 'Awarded', d: 'One person, one seat, and the order that pays for it. It can stop here.' },
        { t: 'Cleared', d: 'Work authorization, checks and insurance, before day one. It can stop here.' },
        { t: 'Working', d: 'Hours signed, bills matched, everybody paid.' },
        { t: 'Ended', d: 'Notice, handover, and the days on site keep counting.' },
      ],
    },
    {
      id: 'alongside',
      title: 'Keep your ATS, your VMS and every supplier you already use',
      paragraphs: [
        'Etyme sits in front of the systems you already use and replaces none of them. ' +
          'There is nothing to switch off and no supplier to drop. ' +
          'Your suppliers submit and bill on Etyme, and what Etyme adds is the one record across all of them.',
      ],
      items: [
        {
          t: 'Work arrives the way it already does',
          d: 'Paste in a forwarded email, a role description, or five of them at once. They come back as seats, with duplicates already merged. Nobody has to change how they send you work.',
        },
        {
          t: 'Your suppliers do not need to sign up first',
          d: 'Paste the distribution list you already use. You can send a role today to every firm on it, whether or not it has an Etyme account. A hop to a company that is not on Etyme leaves the record, and the screen says so.',
        },
        {
          t: 'What is yours stays yours',
          d: 'Your rates, your suppliers and your contractors’ records stay yours. Every list exports to CSV from the screen it is on. Anybody this system holds data about can ask for a copy of it, or ask to be forgotten, from their own page.',
        },
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
    // ── Moved from the home page's #ways band, 2026-09-27 ────────────
    {
      id: 'ways',
      title: 'The record is the product, and your own people run the program on it',
      paragraphs: [
        'Most clients staff the program office themselves. The record is the same either way and it stays yours.',
        'In either way, Etyme never supplies a contractor and never runs a bench, so it has no reason to favor one supplier. ' +
          'Your people keep the decisions that are yours: which roles to open, who to hire, and what to approve.',
        'If you are a staffing supplier, you are on it because your client is. ' +
          'Your rates and your sub-vendors’ names stay private, and your client stays your client. ' +
          'Where Etyme runs a client’s program, approvals come back faster and your bills are matched and paid without chasing.',
      ],
      items: TWO_WAYS.map((w) => ({ t: w.label, d: w.says })),
    },
    {
      id: 'neutral',
      title: 'Etyme never runs a bench and never places anybody',
      paragraphs: [
        'The record sits between a company and every supplier it uses, so it can only work if no supplier has to compete with it. ' +
          'It has no contractors of its own to sell. It is built into how this works, not a policy we might change.',
        'If you would rather not staff a program office, Etyme can run it for you on the same record. ' +
          'You keep every decision that is yours: who may supply, at what band, and who is chosen.',
      ],
    },
    // Moved from the home page's #why, 2026-09-27. The home page keeps one
    // line near its close — no price because none is settled, free while
    // we prove it out — and links here for the rest. The percentage
    // sentence is said once on the whole site, here, because it is a fact
    // a supplier will read and must not discover later.
    {
      id: 'price',
      title: 'There is no price yet, because we have not settled one',
      paragraphs: [
        'Etyme is free while we prove it out with the first five firms. ' +
          'Founding firms keep the terms we agree with them, in writing, before they start. ' +
          'We will not put a number on this site that we would have to take back later.',
        'Where Etyme runs the program, it is paid the way program offices are paid: ' +
          'a percentage the suppliers pay on their billings, disclosed to every supplier when they join.',
      ],
      items: [
        {
          t: 'Governance is never a paid tier',
          d: 'Tenure caps, approval chains and the record of who approved what are included for everybody. Any company with two hiring managers needs them. Charging extra for them loses the deal before the negotiation starts.',
        },
        {
          t: 'Looking around costs nothing and needs no card',
          d: 'You get a live workspace with a worked example in it, and you can change anything in there. If it is not useful in there, a price was never going to fix that.',
        },
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
      ...(b.screen ? [b.screen.caption] : []),
    ]),
  }
}
