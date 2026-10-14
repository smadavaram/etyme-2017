/**
 * The words the shared skeleton draws (`./skeleton`): the line under the
 * panel that shows the product working, the sign-up band with every
 * party's door, the security line and the footer's links. Constants, so
 * the page that draws them and the guard that counts them read one
 * source. The panel's own words are `./story`.
 */

import type { EmbedStep } from '@/lib/sample-seat'
import { storyChromeCopy } from './story'

/** The line under the panel where the reader sits as the program manager: the home page and the product pages. */
export const ON_SCREEN = 'You are the program manager. Every firm on this screen is a demo company, not a customer.'
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
 * The footer: the documentation, every party's door with Clients first,
 * security, the legal pages, contact. Clients is the home page, because
 * the home page is written to the client (founder, 2026-10-14: "Footer
 * is missing clients which links to home page").
 */
export const FOOTER_LINKS: { t: string; href: string }[] = [
  { t: 'Documentation', href: '/docs' },
  { t: 'Clients', href: '/' },
  { t: 'MSPs', href: '/for/program-offices' },
  { t: 'Integrators', href: '/for/integrators' },
  { t: 'Suppliers', href: '/for/suppliers' },
  { t: 'Workers', href: '/for/contractors' },
  { t: 'Security', href: '/security' },
  { t: 'Privacy', href: '/privacy' },
  { t: 'Terms', href: '/terms' },
  { t: 'DPA', href: '/dpa' },
  { t: 'Contact', href: '/contact' },
]

/** The sign-up band's words, the same on every page. */
export const BAND = {
  heading: 'Seen enough? Set up your company.',
  line: 'Two minutes. Your suppliers and contractors go where the sample ones are. Free while we are testing.',
  doorsLead: 'Your door:',
}
/**
 * The band on the contractors' door, the one reader who is not setting up
 * a company (coordinator, 2026-10-14, on the founder's skeleton). Same
 * band, same doors line, its own two lines and the candidate's sign-up.
 */
export const BAND_FOR_SELF = {
  heading: 'Seen enough? Set up your own page.',
  line: 'Two minutes. Your weeks, your pay and your paperwork in one place. Free.',
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
export function copyOfSkeleton(o: { step?: EmbedStep; caption?: string; label?: string; button: string; primary?: { t: string }; band?: BandKind }): string[] {
  const self = o.band === 'SELF'
  return [
    ...storyChromeCopy(),
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

/** The most words a product page or a party door may carry between its header and its footer (founder, 2026-10-14). */
export const MOST_WORDS = 150
