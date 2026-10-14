import type { EmbedStep } from '@/lib/sample-seat'
import type { DemoTarget } from './flow'
import { copyOfSkeleton, ON_SCREEN_DOOR } from './skeleton-words'

/**
 * The four party doors: suppliers and bench firms, program offices,
 * integrators, and contractors.
 *
 * ── Decided 2026-10-13 (CLAUDE.md, "Nine decisions", item 2) ─────────
 *
 * The home page is written to the client, and stays that way. Every other
 * party reads over the client's shoulder, and some need a page of their
 * own to be sent to. These four are those doors, reached by link or
 * advertising and from the home page's sign-up band, never from the
 * header's menus.
 *
 * ── One skeleton, decided by the founder 2026-10-14 ──────────────────
 *
 * "Make sure even the sub pages and doors follow the same structure." A
 * door is now the home page's shape: one question in that party's words
 * and the line under it; the same live frame, opened at the screen that
 * party's work reaches (a supplier's and an integrator's people arrive
 * at Submit, a program office releases at Source, a contractor's week
 * waits at Approve); at most three short lines; the same sign-up band,
 * whose filled button is this party's own sign-up; one security line and
 * the footer. About a hundred and fifty words at most, checked by a test.
 *
 * Cut that day: the screenshot, the eight day-one panels, the five rules
 * and the who-sees-what table, the three growth panels, and the
 * three-card close. What survives is what a reader can check in the
 * frame or behind the button under it, which seats them at their own
 * desk in the full demo.
 *
 * The frame shows the client's program manager's screens, because those
 * are the sample's; a door says so in its caption, in one line.
 *
 * A door never reads as aimed at a supplier, and `lib/positioning` reads
 * each one for it.
 */

export type PartySlug = 'suppliers' | 'program-offices' | 'integrators' | 'contractors'

export interface PartyPage {
  slug: PartySlug
  route: `/for/${PartySlug}`
  /** The party, said the way they say it: the tab's title. */
  eyebrow: string
  /** The headline: one question, in this party's words. */
  question: string
  /** The one line under it: what this page is for. Names contractors or suppliers. */
  purpose: string
  /** The frame's starting screen: the one this party's work reaches. */
  step: EmbedStep
  /** One line saying whose screen the frame shows, for a reader who is not the client. */
  caption: string
  /** What you do here, who is involved, what happens next. */
  lines: [string, string, string]
  /** The sign-up band's filled button: this party's own form. */
  signUp: { t: string; href: string }
  /** The button under the frame, and the desk it seats the reader at. A contractor's opens a person's own page. */
  demoLabel: string
  demo: { target: DemoTarget } | { candidate: true }
}

export const SUPPLIERS: PartyPage = {
  slug: 'suppliers',
  route: '/for/suppliers',
  eyebrow: 'For suppliers and bench firms',
  question: 'Your client is on Etyme. What changes for you?',
  purpose: 'For suppliers, and firms with workers waiting for a project.',
  step: 'submit',
  caption: 'Your client’s screen, where your people arrive.',
  lines: [
    'Submit people who agreed, or your own employees.',
    'Your rates and your sub-vendors’ names stay yours.',
    'You bill from the week the client signed. Etyme never places anybody.',
  ],
  signUp: { t: 'Sign up as a supplier', href: '/signup' },
  demoLabel: 'Open a supplier’s desk, no account',
  demo: { target: { as: 'world-brightmoor', desk: 'account', screen: '/dashboard', seat: 'the account manager' } },
}

export const PROGRAM_OFFICES: PartyPage = {
  slug: 'program-offices',
  route: '/for/program-offices',
  eyebrow: 'For program offices',
  question: 'Can one desk run a whole contractor program?',
  purpose: 'For program offices: every supplier on one record.',
  step: 'source',
  caption: 'Your desk’s screen for job requests.',
  lines: [
    'Decide who may supply, and at what band.',
    'You act in a seat the client grants, every read logged.',
    'Etyme as VMS software: you run it. Etyme as MSP provider: Etyme’s own program office runs it.',
  ],
  signUp: { t: 'Sign up as a program office', href: '/signup?type=msp' },
  demoLabel: 'Open the program desk, no account',
  demo: { target: { as: 'world-nike', desk: 'programme', screen: '/dashboard/program', seat: 'the program manager' } },
}

export const INTEGRATORS: PartyPage = {
  slug: 'integrators',
  route: '/for/integrators',
  eyebrow: 'For integrators',
  question: 'A client project ends. Where do your people go next?',
  purpose: 'For integrators: your employees and your suppliers’ people, side by side.',
  step: 'submit',
  caption: 'A client’s screen, where your people arrive.',
  lines: [
    'Flag who rolls off. Your own managers see them; no client does.',
    'Submit your own employee beside a sub-vendor’s person.',
    'You bill up and pay down from one signed week.',
  ],
  signUp: { t: 'Sign up as an integrator', href: '/signup?type=gsi' },
  demoLabel: 'Open an integrator’s desk, no account',
  demo: { target: { as: 'world-teleworld', desk: 'delivery', screen: '/dashboard/bench', seat: 'a delivery manager' } },
}

export const CONTRACTORS: PartyPage = {
  slug: 'contractors',
  route: '/for/contractors',
  eyebrow: 'For contractors and consultants',
  question: 'Who signs your week, and when are you paid?',
  purpose: 'For contractors: your week, your papers, and every firm above you.',
  step: 'approve',
  caption: 'The client’s screen, where your week waits.',
  lines: [
    'Only you file your week.',
    'See every firm between you and the client, by name. Etyme never places anybody.',
    'Once your employer accepts a signed week, your page says what you are owed.',
  ],
  // The candidate's own form, opened on its tab (?as=candidate, 2026-10-13).
  signUp: { t: 'Sign up with your email', href: '/signup?as=candidate' },
  demoLabel: 'Open a contractor’s page, no account',
  demo: { candidate: true },
}

/** The four doors, in the order the footer lists them. */
export const PARTY_PAGES: PartyPage[] = [SUPPLIERS, PROGRAM_OFFICES, INTEGRATORS, CONTRACTORS]

export function partyAt(slug: string): PartyPage | null {
  return PARTY_PAGES.find((p) => p.slug === slug) ?? null
}

/**
 * Every word a reader sees between the header and the footer, split at
 * the fold: the question and its line, then the three lines and what the
 * shared skeleton draws around them, with this door's caption, its button
 * under the frame and its own sign-up (`./skeleton-words`).
 */
export function copyOfPartyPage(p: PartyPage): { hero: string[]; body: string[] } {
  return {
    hero: [p.question, p.purpose],
    body: [...p.lines, ...copyOfSkeleton({ caption: p.caption, label: ON_SCREEN_DOOR, button: p.demoLabel, primary: p.signUp })],
  }
}
