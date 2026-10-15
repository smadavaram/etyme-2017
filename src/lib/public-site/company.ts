/**
 * About, contact and the security position, as data.
 *
 * ── One screen each. Decided by the founder, 2026-10-15 ──────────────
 *
 * "AI slop … no one is reading large content. Read all the public pages
 * like security documentation etc; make it real and make it simple." He
 * said "Build it" on a drawing of every public page cut to one screen,
 * and About and Security are written here as drawn:
 *
 *   - About was ten sections and 1,600 words: the four questions and why
 *     nobody can answer them, one hire in six milestones, what it sits
 *     beside, how we work, the two ways, neutrality and the price, all
 *     moved there from the home page on 2026-09-27. It is five lines now:
 *     what we build, what we never do, the two ways, the price, where we
 *     are. The rest left the site on purpose; the home page's panel
 *     answers the four questions by showing them.
 *   - Security was 630 words. It is what is done, what is not done yet,
 *     what comes next in order with no date, and how to report a problem.
 *     The drawing had a link to "the long version, for a security
 *     review". The long version is `docs/security-posture.md`, which is
 *     not published anywhere a reader can open it, so the link is not
 *     drawn rather than pointing at nothing.
 *
 * Contact is unchanged.
 *
 * ── What each line stands on ─────────────────────────────────────────
 *
 * Every security line is a claim `docs/security-posture.md` makes with
 * the file behind it. The drawing named the two sign-in providers; no
 * public page names a company (`lib/positioning`), so the line says "your
 * company's work account", which is what `lib/auth` signs in with once a
 * deployment has the keys (`/ready` says whether it does). Nothing here
 * has a date, because no date is contracted.
 */

import { ADDRESS } from './nav'

export interface Block {
  id: string
  title: string
  paragraphs?: string[]
  items?: { t: string; d: string }[]
  /**
   * Short lines, one fact each, with a dot: done (`ok`) or not done
   * (`no`). A line may open on a bold lead, as About's do.
   */
  lines?: { lead?: string; t: string }[]
  tone?: 'ok' | 'no'
  /** A numbered list, in the order the things in it will happen. */
  ordered?: string[]
  /** One small line under the block. */
  note?: string
}

/**
 * The two ways to run a program on the record, in the founder's two
 * labels (decided 2026-09-20). About names both in one line; the census
 * letter reads the labels from here.
 */
export const TWO_WAYS: { label: string; says: string }[] = [
  {
    label: 'VMS software',
    says: 'Your own program manager runs the program on Etyme. Your people hold the seats. Etyme holds the record and the rules.',
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
  title: 'About Etyme',
  lede: 'One list of every contractor, across every supplier.',
  blocks: [
    {
      id: 'about',
      title: '',
      tone: 'ok',
      lines: [
        // The drawing's line began "Software a company uses"; the word reads
        // as software staffing to the horizontal guard (lib/positioning),
        // which a buyer of travel nurses must not read. "A system" says the
        // same thing.
        { lead: 'What we build.', t: 'A system a company uses to manage contractors from all its suppliers: jobs, candidates, timesheets and invoices.' },
        { lead: 'What we never do.', t: 'Etyme never supplies workers and never runs a bench. So it has no reason to favor any supplier.' },
        { lead: 'Two ways to use it.', t: `Your team runs it: Etyme as ${TWO_WAYS[0].label}. Or Etyme runs it for you: Etyme as ${TWO_WAYS[1].label}.` },
        // The second half brought back by the founder, 2026-10-15: how Etyme
        // is paid when it runs the program, said once on the site (CLAUDE.md,
        // "Etyme runs the program": supplier-funded, a percentage on
        // billings, no number yet). Kept on the price line, so the offer to
        // run the program is still made once.
        { lead: 'Price.', t: 'Free while we test with our first companies. No number until we have one. As your MSP, Etyme would be paid by suppliers, as a share of what they bill.' },
        { lead: 'Where we are.', t: `${ADDRESS.company}, ${ADDRESS.street}, ${ADDRESS.city}. ${ADDRESS.phone}.` },
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
  eyebrow: 'Security',
  title: 'Security',
  // The drawing's line was "What is done, and what is not done yet." It
  // names the records it is about, because every public page says what
  // kind of thing this is above the fold (lib/positioning, category first).
  lede: 'What is done to protect your contractor and supplier records, and what is not done yet.',
  blocks: [
    {
      id: 'done',
      title: 'Done',
      tone: 'ok',
      lines: [
        { t: 'A company sees only its own records. The database filters them, not the screen.' },
        { t: 'Sign in with your company’s work account, or a password.' },
        { t: 'Every look at a person’s record is logged, and so is every refusal.' },
        { t: 'Nobody approves their own hours, their own job request or a supplier they recommended.' },
        { t: 'A person can download or erase their own data. Signed hours and amounts stay.' },
        { t: 'When something fails, our staff get an email.' },
      ],
    },
    {
      id: 'not',
      title: 'Not done yet',
      tone: 'no',
      lines: [
        { t: 'No SOC 2 report, no ISO 27001 certificate, no penetration test.' },
        { t: 'Two-step sign-in comes from your company’s account. Etyme does not enforce it.' },
        { t: 'Restoring from backup has not been tested. No disaster recovery plan.' },
        { t: 'Encryption is the hosting provider’s. Etyme has not checked it.' },
        { t: 'No named security officer.' },
      ],
    },
    {
      // The order of the attestations, decided 2026-10-13 (CLAUDE.md,
      // "Nine decisions", item 1): the test first, because a report
      // written over controls nobody has attacked is the wrong way round.
      id: 'next',
      title: 'Next, in this order',
      ordered: ['Penetration test', 'SOC 2 Type I', 'SOC 2 Type II, then ISO 27001'],
      note: 'No dates yet, because none is contracted. A date goes here when one is.',
    },
    {
      id: 'report',
      title: 'Found a problem?',
      paragraphs: [`Write to ${ADDRESS.email}. Test only on the demo. It holds no real people and no real money.`],
    },
  ],
}

export const COMPANY_PAGES: CompanyPage[] = [ABOUT, CONTACT, SECURITY]

/** Every word a reader sees on a company page, split at the fold. */
export function copyOfCompanyPage(p: CompanyPage): { hero: string[]; body: string[] } {
  return {
    hero: [p.title, p.lede],
    body: p.blocks.flatMap((b) => [
      ...(b.title ? [b.title] : []),
      ...(b.paragraphs ?? []),
      ...(b.items ?? []).flatMap((i) => [i.t, i.d]),
      ...(b.lines ?? []).map((l) => (l.lead ? `${l.lead} ${l.t}` : l.t)),
      ...(b.ordered ?? []).map((o) => `${o}.`),
      ...(b.note ? [b.note] : []),
    ]),
  }
}
