import type { EmbedStep } from '@/lib/sample-seat'
import type { DemoTarget, PersonTarget } from './flow'
import { CATEGORY, copyOfSkeleton, ON_SCREEN_DOOR, OPEN_DEMO, watching, type BandKind } from './skeleton-words'
import type { StoryKey } from './story'

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
 * door is now the home page's shape: one headline in that party's words
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
 * The frame showed the client's program manager's screens, because those
 * were the sample's, and a door said so in its caption. Since 2026-10-19
 * each door plays its own person (below), and the caption is gone.
 *
 * A door never reads as aimed at a supplier, and `lib/positioning` reads
 * each one for it.
 *
 * ── Four doors, two with tabs, decided by the founder 2026-10-16 ─────
 *
 * "Build it", on the four-doors drawing
 * (https://claude.ai/artifact/NMSKv7vLFfZaxQRcKjbAWU, version 4). The
 * words below are his, as drawn. Three things changed with it:
 *
 *   - A door's headline is a statement, not a question. He chose it.
 *   - Suppliers carry three tabs (Prime vendor, Sub-vendor, Bench vendor)
 *     and Workers two (Worker, Solopreneur). A tab is a link to its own
 *     address (`?tab=sub`), drawn on the server, so an advertisement can
 *     open a tab and the page works with no script. The first tab is the
 *     door's own address and needs no `?tab`.
 *   - A tab swaps the headline, the line under it, the three lines and
 *     the sign-up.
 *
 * ── Each door and tab plays its own person, decided 2026-10-19 ───────
 *
 * "Build it", on the drawing of every public page
 * (https://claude.ai/artifact/A91ZWwSnKqEgD5DyxotzcN, the Doors tab): a
 * door stops playing Northbend's program manager and plays its own party's
 * named person from the seed, at the step that party acts on, and the line
 * under the panel names them. So a tab now swaps the panel too: Marisa
 * Delacroix at Brightmoor Staffing for a prime vendor, Bhavesh Nair at
 * Techpeple for a sub-vendor, Linnea Qadri on Techpeple's bench, Sunil
 * Raghavan at Teleworld Solutions, Helena Marsh for a worker, Colleen
 * Byrne for a solopreneur; the MSPs' door keeps Aptiva Workforce and names
 * Rashida Coleman. The caption that said "your client's screen" is gone
 * with the client's screen; the line names whose screen it is. The words
 * of every headline, line, band and button are unchanged.
 */

export type PartySlug = 'suppliers' | 'program-offices' | 'integrators' | 'contractors'

/** One tab on a door: its own headline, the line under it, three lines and, where it differs, its own sign-up. */
export interface DoorTab {
  /** The address's `?tab=` value. The first tab's is never written in a link. */
  key: string
  /** The tab's label, in the founder's words. */
  label: string
  headline: string
  purpose: string
  lines: [string, string, string]
  /** The sign-up band's filled button, where this tab's reader signs up somewhere else. */
  signUp?: { t: string; href: string }
  /** The band, where this tab's reader is not setting up what the door's first tab is. */
  band?: BandKind
  /** The story the panel plays on this tab: this tab's own person. */
  story?: StoryKey
  /** The panel's starting step on this tab: the one its person acts on. */
  step?: EmbedStep
  /** The line under the panel on this tab, naming its person. */
  panelLabel?: string
  /** The seat the button under the panel opens on this tab: the person the panel plays. */
  demo?: PartyPage['demo']
}

export interface PartyPage {
  slug: PartySlug
  route: `/for/${PartySlug}`
  /** The party, said the way they say it: the tab's title. */
  eyebrow: string
  /** The headline: one statement in this party's words (founder, 2026-10-16: statements, not questions). */
  headline: string
  /** The one line under it. */
  purpose: string
  /** The frame's starting screen: the one this party's work reaches. */
  step: EmbedStep
  /** One line saying whose screen the frame shows, where the line under the panel does not. */
  caption?: string
  /** What you do here, who is involved, what happens next. */
  lines: [string, string, string]
  /** The sign-up band's filled button: this party's own form. */
  signUp: { t: string; href: string }
  /**
   * The desk the button under the frame seats the reader at. A contractor's
   * opens a person's own page. The button's words are the home page's one
   * label, `OPEN_DEMO`, on every door and tab (founder, 2026-10-20: the
   * door labels wrapped to two lines on a phone); the bar and the line under
   * the panel already say who the reader opens as.
   */
  demo: { target: DemoTarget | PersonTarget } | { candidate: true }
  /** The sign-up band: a company's unless said; a contractor's is a person's own. */
  band?: BandKind
  /** Which story the panel plays: Northbend Athletic's program manager unless said. */
  story?: StoryKey
  /** The line under the panel, where the door seats its reader somewhere of its own. Ends on `ON_SCREEN_DOOR`. */
  label?: string
  /** The door's tabs, the first its default. The words at the top of this object are the first tab's. */
  tabs?: DoorTab[]
}

/** A door whose top-level words are its first tab's, so a reader of the door without a tab reads the default. */
function withTabs(door: Omit<PartyPage, 'headline' | 'purpose' | 'lines' | 'tabs'>, tabs: DoorTab[]): PartyPage {
  return { ...door, ...tabWords(door, tabs[0]), tabs }
}

/** What one tab changes on its door: the words, the sign-up, and the panel's person. */
function tabWords(door: Pick<PartyPage, 'signUp' | 'band' | 'story' | 'step' | 'label' | 'demo'>, tab: DoorTab) {
  return {
    headline: tab.headline,
    purpose: tab.purpose,
    lines: tab.lines,
    signUp: tab.signUp ?? door.signUp,
    band: tab.band ?? door.band,
    story: tab.story ?? door.story,
    step: tab.step ?? door.step,
    label: tab.panelLabel ?? door.label,
    demo: tab.demo ?? door.demo,
  }
}

const SUPPLIER_SIGN_UP = { t: 'Sign up as a supplier', href: '/signup' }

export const SUPPLIERS: PartyPage = withTabs({
  slug: 'suppliers',
  route: '/for/suppliers',
  eyebrow: 'For suppliers and bench firms',
  step: 'submit',
  signUp: SUPPLIER_SIGN_UP,
  demo: { target: { as: 'world-brightmoor', desk: 'account', screen: '/dashboard', seat: 'the account manager' } },
}, [
  {
    key: 'prime',
    label: 'Prime vendor',
    headline: 'Fill your client’s jobs through every sub-vendor at once, and keep your client yours.',
    purpose: 'Each sub-vendor sees its own rate. Your client’s name is yours to share.',
    story: 'brightmoor',
    step: 'submit',
    // Her job is on the bar straight above; the line under the panel names
    // her and her firm, so this tab stays within the 165 words once the
    // category line joined the top (2026-10-20).
    panelLabel: watching('Marisa Delacroix', 'at Brightmoor Staffing'),
    lines: [
      'Send a client’s job to all your sub-vendors in one go, each with its own rate range.',
      'Your account manager, and your sub-vendors with their insurance and papers checked.',
      'Bill your client on the week it approves. Pay each sub-vendor only what matches.',
    ],
  },
  {
    key: 'sub',
    label: 'Sub-vendor',
    headline: 'Bill from the same approved week as your prime.',
    purpose: 'Your rates and your people stay yours.',
    story: 'techpeple-sub',
    step: 'approve',
    panelLabel: watching('Bhavesh Nair, owner', 'of Techpeple'),
    // Techpeple's first seat, its owner: the demo door seats a firm's first seat when no desk is named.
    demo: { target: { as: 'world-techpeple', desk: '', screen: '/dashboard/timesheets', seat: 'Techpeple’s owner' } },
    lines: [
      'Put your people forward. Accept the week your prime approved, then bill from it.',
      'Your prime and your people.',
      'Your invoice is checked against the same approved hours, so nobody retypes them.',
    ],
  },
  {
    key: 'bench',
    label: 'Bench vendor',
    headline: 'Your whole bench in front of every firm you sell to, at once.',
    purpose: 'Each person by their own consent.',
    story: 'techpeple-bench',
    step: 'submit',
    panelLabel: watching('Linnea Qadri, recruiter', 'at Techpeple'),
    demo: { target: { as: 'world-techpeple', desk: 'recruiter', screen: '/dashboard/bench', seat: 'Techpeple’s recruiter' } },
    lines: [
      'Mark who is shown to your partners. Each person says yes first.',
      'You, and every firm you sell to.',
      'They see who is free, tell you what they need, and ask for people.',
    ],
  },
])

export const PROGRAM_OFFICES: PartyPage = {
  slug: 'program-offices',
  route: '/for/program-offices',
  eyebrow: 'For MSPs',
  headline: 'Every supplier, every worker, every invoice, across every program you run.',
  purpose: 'Your clients stay yours.',
  step: 'source',
  lines: [
    'Send jobs, compare candidates, and see every week and invoice across the client’s suppliers.',
    'The client gives you a seat in its own program. Every look at a person is logged.',
    'The client’s hiring manager approves the weeks, and its AP clerk pays.',
  ],
  signUp: { t: 'Sign up as an MSP', href: '/signup?type=msp' },
  // The founder, on this door, 2026-10-15: "use a sample MSP company".
  // The panel plays Aptiva Workforce in the seat Cavanaugh Glassworks
  // granted it (its own Program Manager role, lib/seed-world
  // 'program-office-seat'), and the button opens the same seat: Aptiva's
  // first seat, which the demo door seats with no desk named and opens on
  // the client's program because Aptiva holds a live seat there
  // (`seatedAt` in app/api/demo, `consoleHome` in lib/console-home).
  story: 'aptiva',
  label: `You are watching Rashida Coleman, program manager at Aptiva Workforce, in Cavanaugh Glassworks’ program. ${ON_SCREEN_DOOR}`,
  demo: { target: { as: 'world-aptiva', desk: '', screen: '/dashboard/program', seat: 'Aptiva Workforce’s program manager' } },
}

export const INTEGRATORS: PartyPage = {
  slug: 'integrators',
  route: '/for/integrators',
  eyebrow: 'For integrators',
  headline: 'Staff your next project with your own people first.',
  purpose: 'Buy outside only for the gap.',
  step: 'submit',
  story: 'teleworld',
  label: watching('Sunil Raghavan, delivery manager', 'at Teleworld Solutions'),
  lines: [
    'Flag who rolls off, and when. Another manager reserves them for an open seat.',
    'Your project managers. HR is told of every move.',
    'Place them on your next project, or put them forward on a client’s job as your own employee.',
  ],
  signUp: { t: 'Sign up as an integrator', href: '/signup?type=gsi' },
  demo: { target: { as: 'world-teleworld', desk: 'delivery', screen: '/dashboard/bench', seat: 'a delivery manager' } },
}

export const CONTRACTORS: PartyPage = withTabs({
  slug: 'contractors',
  route: '/for/contractors',
  eyebrow: 'For contractors and consultants',
  step: 'approve',
  // The candidate's own form, opened on its tab (?as=candidate, 2026-10-13).
  signUp: { t: 'Sign up with your email', href: '/signup?as=candidate' },
  band: 'SELF',
  demo: { candidate: true },
}, [
  {
    key: 'worker',
    label: 'Worker',
    headline: 'Your hours, pay, papers and history, in one place that moves with you.',
    purpose: 'Yours, not the agency’s.',
    story: 'helena',
    step: 'approve',
    panelLabel: watching('Helena Marsh, a contractor', 'at Northbend Athletic'),
    demo: { target: { person: 'helena-marsh', seat: 'Helena Marsh' } },
    lines: [
      'File your week once.',
      'You, and every firm between you and the client, by name.',
      'See what you are owed, and when, once your employer accepts the week.',
    ],
  },
  {
    key: 'solo',
    label: 'Solopreneur',
    headline: 'What a 50-person firm runs on: timesheets, bills, papers. For a firm of one.',
    purpose: 'File your week, bill your client, get paid.',
    story: 'byrne',
    step: 'pay',
    panelLabel: watching('Colleen Byrne, ICU travel nurse and owner', 'of Byrne Critical Care LLC'),
    demo: { target: { person: 'colleen-byrne', seat: 'Colleen Byrne' } },
    lines: [
      'File your week, bill your client, and keep your company papers current.',
      'Just you, and your client.',
      'Your client approves the week, and you bill from it.',
    ],
    // A one-person company sets up a company: the company form, opened on
    // the one-person kind (`?type=solo`, the sign-up page's own link).
    signUp: { t: 'Sign up', href: '/signup?type=solo' },
    band: 'COMPANY',
  },
])

/** The four doors, in the order the footer lists them. */
export const PARTY_PAGES: PartyPage[] = [SUPPLIERS, PROGRAM_OFFICES, INTEGRATORS, CONTRACTORS]

export function partyAt(slug: string): PartyPage | null {
  return PARTY_PAGES.find((p) => p.slug === slug) ?? null
}

/** The address of one tab: the door's own for the first, `?tab=` for the rest. */
export function tabHref(p: PartyPage, key: string): string {
  return !p.tabs || p.tabs[0].key === key ? p.route : `${p.route}?tab=${key}`
}

/**
 * The door as a reader of one tab meets it: the tab's words, and the
 * tab's own person in the panel. An absent or unknown tab is the first, so an old link or
 * a mistyped one still opens the door rather than a missing page.
 */
export function doorTab(p: PartyPage, key?: string | null): PartyPage & { tab: DoorTab | null } {
  if (!p.tabs) return { ...p, tab: null }
  const tab = p.tabs.find((t) => t.key === key) ?? p.tabs[0]
  return { ...p, ...tabWords(p, tab), tab }
}

/** Every way a door can be read: one view per tab, or the door itself where it has none. */
export function everyDoorView(): (PartyPage & { tab: DoorTab | null; href: string })[] {
  return PARTY_PAGES.flatMap((p) =>
    (p.tabs ?? [null]).map((t) => ({ ...doorTab(p, t?.key), href: t ? tabHref(p, t.key) : p.route })))
}

/**
 * Every word a reader sees between the header and the footer on one tab,
 * split at the fold: the category line (2026-10-20), the tab labels and
 * the headline and its line, then
 * the three lines and what the shared skeleton draws around them, with
 * this door's caption, the home page's one button label and its own sign-up
 * (`./skeleton-words`).
 */
export function copyOfPartyPage(door: PartyPage, tab?: string | null): { hero: string[]; body: string[] } {
  const p = doorTab(door, tab)
  return {
    hero: [CATEGORY, ...(door.tabs ?? []).map((t) => t.label), p.headline, p.purpose],
    body: [...p.lines, ...copyOfSkeleton({ step: p.step, caption: p.caption, label: p.label ?? ON_SCREEN_DOOR, button: OPEN_DEMO, primary: p.signUp, band: p.band, story: p.story })],
  }
}
