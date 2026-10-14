/**
 * The words the shared skeleton draws (`./skeleton`): the frame's strip
 * and its line, the four chips, the sign-up band with every party's door,
 * the security line and the footer's links. Constants, so the page that
 * draws them and the guard that counts them read one source.
 */

/** The four chips under the product. Each moves the frame to its step. */
export const CHIPS: { t: string; href: string }[] = [
  { t: 'Source', href: '/embed/demo/source' },
  { t: 'Submit', href: '/embed/demo/submit' },
  { t: 'Approve', href: '/embed/demo/approve' },
  { t: 'Pay', href: '/embed/demo/pay' },
]
export const CHIPS_LABEL = 'The four steps'

/**
 * The frame the product sits in. The chrome strip says whose screens
 * these are; the line under the frame says every firm on them is a demo
 * company, not a customer, and is always visible (the founder's label,
 * 2026-09-27). Read together by `public-example-names.test.ts`.
 */
export const FRAME = {
  name: 'home-demo',
  title: 'Live demo of Northbend Athletic, a demo company, not a customer: the program manager’s screens',
  chrome: 'Live demo · Northbend Athletic, a sample company',
  fallback: { t: 'The demo did not load here.', link: 'Open it on its own page' },
}
/** The line under the frame where the reader sits as the program manager: the home page and the product pages. */
export const ON_SCREEN = 'You are the program manager. Every firm on this screen is a demo company, not a customer.'
/** The line under the frame on a party door, whose reader is not the program manager. */
export const ON_SCREEN_DOOR = 'Every firm on this screen is a demo company, not a customer.'
/** The button under the frame. */
export const OPEN_DEMO = 'Open the demo, no account'

/** Every party's door, on one small line in the sign-up band. Clients first. */
export const DOORS: { t: string; href: string }[] = [
  { t: 'Clients', href: '/signup' },
  { t: 'Program offices', href: '/for/program-offices' },
  { t: 'Integrators', href: '/for/integrators' },
  { t: 'Suppliers', href: '/for/suppliers' },
  { t: 'Workers', href: '/for/contractors' },
]

/** The footer: the documentation, the four doors, security, the legal pages, contact. */
export const FOOTER_LINKS: { t: string; href: string }[] = [
  { t: 'Documentation', href: '/docs' },
  { t: 'Program offices', href: '/for/program-offices' },
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
  audit: 'Get a free contractor spend audit',
}
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
 * for the guard that counts a page: the frame's strip and its line, the
 * chips, the button under the frame, the band and the security line.
 */
export function copyOfSkeleton(o: { caption?: string; label?: string; button: string; primary?: { t: string } }): string[] {
  return [
    FRAME.chrome,
    ...(o.caption ? [o.caption] : []),
    o.label ?? ON_SCREEN,
    CHIPS_LABEL, ...CHIPS.map((c) => c.t),
    o.button,
    BAND.heading, BAND.line, BAND.doorsLead, ...DOORS.map((d) => d.t),
    (o.primary ?? CLIENT_SIGN_UP).t, BAND.audit,
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
