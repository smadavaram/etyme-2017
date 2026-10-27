/**
 * The words the shared skeleton draws (`./skeleton`): the line under the
 * panel that shows the product working, the sign-up band with every
 * party's door, the security line and the footer's links. Constants, so
 * the page that draws them and the guard that counts them read one
 * source. The panel's own words are `./story`.
 */

import type { EmbedStep } from '@/lib/sample-seat'
import { storyChromeCopy, type StoryKey } from './story'

/**
 * The category: the first line of every page that sells the product, the
 * home page, the four step pages and every door and tab, drawn once by
 * `CategoryLine` in `./skeleton` so the words cannot drift (founder,
 * 2026-10-20, reading every door on a phone: "Did you establish the
 * category on all parties and doors?"). The category and nothing else:
 * never "vendor management system", never AI. Reference pages (the
 * documentation, security, About, Contact, the demo, the legal pages and
 * sign-in) do not draw it.
 */
export const CATEGORY = 'Enterprise contingent workforce management'

/**
 * The line under the home page's panel: who the reader is watching, and
 * that every firm on it is a demo company (founder's drawing, 2026-10-19).
 * The panel names each of the three on its bar as their step plays.
 * One line at 1280 since the founder read it wrapping, the same day: the
 * label says "demo companies, not customers", the plural of his label,
 * which the guard in `public-example-names.test.ts` reads either way.
 */
export const ON_SCREEN = 'Three people at Northbend Athletic on one morning: a hiring manager, a contractor, an AP clerk. All demo companies, not customers.'

/**
 * The line under a panel that plays one named person: "You are watching
 * Marcus Oyelaran, hiring manager at Northbend Athletic, a demo company,
 * not a customer." The firm is named once, with the label in the same
 * sentence, as every example firm on a public page is.
 */
export function watching(person: string, at: string): string {
  return `You are watching ${person} ${at}, a demo company, not a customer.`
}
/** The line under the panel on a party door, whose reader is not the program manager. */
export const ON_SCREEN_DOOR = 'Every firm on this screen is a demo company, not a customer.'
/** The button in the panel's footer. */
export const OPEN_DEMO = 'Open the demo, no account'

/** Every party's door, on one small line in the sign-up band. Clients first. */
export const DOORS: { t: string; href: string }[] = [
  { t: 'Clients', href: '/signup' },
  { t: 'MSPs', href: '/for/program-offices' },
  { t: 'Integrators', href: '/for/integrators' },
  { t: 'Suppliers', href: '/for/suppliers' },
  { t: 'Workers', href: '/for/contractors' },
]

/**
 * The footer: every party's door in the order of the chain — Clients,
 * MSPs, Integrators, Suppliers, Workers (founder, 2026-10-14: "in
 * sequence") — then the demo, the documentation, About, security, the
 * legal pages, contact. The demo and About joined on 2026-10-19, when the
 * header's menu left and the footer took what it carried (founder: "it
 * can be on the footer"). Clients is the home page, because
 * the home page is written to the client (founder, 2026-10-14: "Footer
 * is missing clients which links to home page").
 */
export const FOOTER_LINKS: { t: string; href: string }[] = [
  { t: 'Clients', href: '/' },
  { t: 'MSPs', href: '/for/program-offices' },
  { t: 'Integrators', href: '/for/integrators' },
  { t: 'Suppliers', href: '/for/suppliers' },
  { t: 'Workers', href: '/for/contractors' },
  { t: 'Demo', href: '/demo' },
  { t: 'Documentation', href: '/docs' },
  { t: 'About', href: '/about' },
  { t: 'Security', href: '/security' },
  { t: 'Privacy', href: '/privacy' },
  { t: 'Terms', href: '/terms' },
  { t: 'DPA', href: '/dpa' },
  { t: 'Contact', href: '/contact' },
]

/**
 * The sign-up band's words, the same on every page.
 *
 * "Two minutes." left both lines on 2026-10-27 (release walk): it is a
 * promised speed, which the page may not make, and nothing on the page
 * lets a reader check it.
 */
export const BAND = {
  heading: 'Seen enough? Set up your company.',
  line: 'Your suppliers and contractors go where the sample ones are. Free while we are testing.',
  doorsLead: 'Your door:',
}
/**
 * The band on the contractors' door, the one reader who is not setting up
 * a company (coordinator, 2026-10-14, on the founder's skeleton). Same
 * band, same doors line, its own two lines and the candidate's sign-up.
 */
export const BAND_FOR_SELF = {
  heading: 'Seen enough? Set up your own page.',
  line: 'Your weeks, your pay and your paperwork in one place. Free.',
}

/** Which band a page draws: a company's, or a person's own. */
export type BandKind = 'COMPANY' | 'SELF'

/** The client's sign-up, the band's filled button unless a door names its own. */
export const CLIENT_SIGN_UP = { t: 'Sign up', href: '/signup' }

/** The one security line. */
export const SECURITY = {
  line: 'Security: what is done, and what is next in order.',
  link: 'Read the security position',
  docs: 'Documentation',
}

/**
 * Every word the shared pieces draw between the header and the footer,
 * for the guard that counts a page: the panel's bar and its chips
 * (`storyChromeCopy`), the button, the lines under the panel, the band
 * and the security line. What the panel plays — each step's
 * conversation, table and footer line — is the product shown working, as
 * the frame's screens were, and is not counted. `step` is kept so a page
 * says which step it opens at, for the reader of this call.
 */
export function copyOfSkeleton(o: { step?: EmbedStep; caption?: string; label?: string; button: string; primary?: { t: string }; band?: BandKind; story?: StoryKey }): string[] {
  const self = o.band === 'SELF'
  return [
    ...storyChromeCopy(o.story),
    o.button,
    ...(o.caption ? [o.caption] : []),
    o.label ?? ON_SCREEN,
    self ? BAND_FOR_SELF.heading : BAND.heading, self ? BAND_FOR_SELF.line : BAND.line,
    BAND.doorsLead, ...DOORS.map((d) => d.t),
    (o.primary ?? CLIENT_SIGN_UP).t,
    SECURITY.line, SECURITY.link, SECURITY.docs,
  ]
}

/**
 * The words a reader reads, counted the plain way: every run of letters
 * or digits between spaces. A dot between two links is not a word.
 */
export function countWords(strings: string[]): number {
  return strings.join(' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
}

/**
 * The most words a party door, or one of its tabs, may carry between its
 * header and its footer: 150 on 2026-10-14, raised to 165 by the founder
 * on 2026-10-16 ("up to 165 words is fine") so his door lines stand whole.
 */
export const MOST_WORDS = 165

/**
 * The most a step page may carry. The founder's drawing of 2026-10-15
 * adds "Today" beside "With Etyme" and Previous and Next to the home
 * page's skeleton, about thirty words more; the four pages carry 172 to
 * 181 words when this was set, the skeleton's eighty included.
 */
export const MOST_STEP_WORDS = 190
