/**
 * The public site's header and footer, as data. Every public page draws
 * this header, the home page included.
 *
 * ── Product, Solutions, Resources, Company. Decided 2026-09-27 ────────
 *
 * The founder, after reviewing the marketing thread one last time: "The
 * header section seemed better organized in that thread." It was. The
 * live header was Products · Industries · Compliance · Why Etyme, which
 * listed the eight parts flat, grew an Industries menu whose four items
 * all led to the same place, and split compliance across a menu and a
 * module. The thread's static site (`index.html` on the old repository's
 * `development` branch) grouped the same eight parts by the stage a hire
 * reaches them in, gave each reader a way in by their role, and put what
 * a buyer reads and what a buyer tries under one Resources menu.
 *
 * So the structure is the thread's, and the words are ours wherever ours
 * are more accurate:
 *
 *   - its Documentation line said "behind sign-in". The documentation is
 *     public, decided 2026-09-26, and the line says so.
 *   - its invoices line said a bill with "no room on the order" is not
 *     paid. A named person can override the order's balance with a
 *     reason (`OVERRIDABLE.PO_BALANCE` in `lib/three-way-match`); the
 *     missing signed week is the one nobody can waive. The live line says
 *     only that.
 *   - its Industries menu is gone. It had four items leading to one
 *     place. The sentence under it — one product, no industry-specific
 *     version — is kept on About, where it is a fact about the company.
 *   - its "Start free" button is not brought across. See `./funnel`.
 *
 * ── Every role leads to something written for that reader ────────────
 *
 * The thread linked each role to an anchor on its home page that did
 * not exist. Here each leads to the section of the documentation drawn
 * from that desk, or to the module page section that speaks to it, and
 * the test opens each destination and finds the anchor. Six roles, six
 * real destinations; none was dropped.
 *
 * ── The spend audit is the census ────────────────────────────────────
 *
 * "Free contractor spend audit" is the census door, `/census`, and
 * nothing else. The test holds every link carrying those words to that
 * route, so a second, rebuilt audit cannot appear beside it.
 */

import { SEE_IT, GET_THE_AUDIT, ASK_A_PERSON } from './funnel'

export interface NavItem {
  t: string
  d?: string
  href: string
}

export interface NavGroup {
  heading: string
  items: NavItem[]
}

export interface NavMenu {
  label: string
  groups: NavGroup[]
}

/**
 * The eight parts of the product, grouped by the stage a hire reaches
 * them in. The home page's module band draws these same four groups, so
 * the menu and the page teach one map.
 *
 * One sentence per line, since 2026-09-28. Each line describes what the
 * part does, in words a reader can check on its page; none promises a
 * result. The home page drew these as a band of tiles for one day and
 * dropped them again the same evening, on the founder's go-to-market
 * list: they repeated the four steps and this menu.
 *
 * Plain words, defined once (CLAUDE.md, the same list): a job request,
 * not a requisition; a bill, never an invoice. "Bills & the three-way
 * check" carries the check's definition as its line, because the header
 * is where most readers meet the term first. The routes keep their
 * addresses — `/requisitions`, `/invoices` — because an address is not a
 * word anybody reads.
 */
export const PRODUCT_STAGES: NavGroup[] = [
  {
    heading: 'Source',
    items: [
      { t: 'Job requests & suppliers', d: 'Sent only to the suppliers Procurement cleared.', href: '/requisitions' },
      { t: 'Submissions & screening', d: 'Every supplier’s people for one job, side by side.', href: '/submissions' },
    ],
  },
  {
    heading: 'Start',
    items: [
      { t: 'Contracts & onboarding', d: 'Written by the award, papers checked before day one.', href: '/contracts' },
    ],
  },
  {
    heading: 'Work and pay',
    items: [
      { t: 'Timesheets & expenses', d: 'The worker files the week; nobody approves their own.', href: '/timesheets' },
      { t: 'Bills & the three-way check', d: 'The three-way check: the hours, the bill, and the contract rate must all agree.', href: '/invoices' },
    ],
  },
  {
    heading: 'Govern',
    items: [
      { t: 'Compliance & tenure', d: 'Time on site per person, across every supplier.', href: '/compliance' },
      { t: 'The chain', d: 'Each firm sees its own level; insurance shows at every depth.', href: '/chain' },
      { t: 'Governance', d: 'Blocks where the law is behind it; warns elsewhere.', href: '/governance' },
    ],
  },
]

/** The eight parts in the order a hire moves through them. */
export const PRODUCT_ITEMS: NavItem[] = PRODUCT_STAGES.flatMap((g) => g.items)

/**
 * A way in for each reader, and where it leads.
 *
 * Each destination is the part of the site written from that desk: the
 * client documentation is drawn lane by lane, one lane per desk, and its
 * sections are the stages each desk works in. The line under a role says
 * what that reader will find, in the product's own terms. The HR line
 * carries the one claim about good standing the header makes, and the
 * positioning test reads it against the two doors that refuse it.
 */
export const ROLES: NavItem[] = [
  { t: 'The program office', d: 'One hire walked from every desk, and who acts at each.', href: '/docs/client#one-hire' },
  { t: 'Procurement', d: 'Procurement audits the suppliers, and a job goes only to the ones it cleared.', href: '/docs/client#l1-1' },
  { t: 'HR and compliance', d: 'Two gates before day one. A lapsed certificate of insurance or good standing stops a submission and a start.', href: '/docs/client#l1-2' },
  { t: 'Finance', d: 'Seven steps from a filed week to a paid bill, and which checks can be waived.', href: '/docs/time-and-money' },
  { t: 'Hiring managers', d: 'The worker files the week and you sign it. A week over the hours is flagged first.', href: '/docs/client#l1-3' },
  { t: 'Suppliers', d: 'What a prime, a sub and a bench vendor, a firm with workers waiting for a project, each see, and what stays theirs.', href: '/chain#down-the-chain' },
]

export const DOCS_LINK: NavItem = {
  t: 'Documentation',
  d: 'Every flow, party by party, desk by desk. Public, with no sign-in.',
  href: '/docs',
}

export const SPEND_AUDIT: NavItem = {
  t: 'Free contractor spend audit',
  d: GET_THE_AUDIT.d,
  href: GET_THE_AUDIT.href,
}

export const NAV_MENUS: NavMenu[] = [
  { label: 'Product', groups: PRODUCT_STAGES },
  { label: 'Solutions', groups: [{ heading: 'By role', items: ROLES }] },
  {
    label: 'Resources',
    groups: [
      {
        heading: 'Read',
        items: [
          DOCS_LINK,
          { t: 'Security position', d: 'What is done, what is not, and when.', href: '/security' },
          { t: 'Data processing addendum', d: 'Retention by category, and who processes what.', href: '/dpa' },
        ],
      },
      {
        heading: 'Try',
        items: [
          { t: 'Open the example program', d: SEE_IT.d, href: SEE_IT.href },
          { t: ASK_A_PERSON.t, d: ASK_A_PERSON.d, href: ASK_A_PERSON.href },
          SPEND_AUDIT,
        ],
      },
    ],
  },
  {
    label: 'Company',
    groups: [
      {
        heading: 'Company',
        items: [
          { t: 'About Etyme', d: 'What we build, how we work, where we are.', href: '/about' },
          { t: 'Contact', d: 'Durham, North Carolina. A person answers.', href: '/contact' },
        ],
      },
    ],
  },
]

/** The filled button on the right of every header. */
export const PRIMARY = SEE_IT

/** Every item in one menu, across its groups. */
export function itemsOf(menu: NavMenu): NavItem[] {
  return menu.groups.flatMap((g) => g.items)
}

export interface FooterGroup {
  heading: string
  links: { label: string; href: string }[]
  note?: string
}

export const FOOTER: FooterGroup[] = [
  {
    heading: 'Product',
    links: PRODUCT_ITEMS.map((i) => ({ label: i.t, href: i.href })),
  },
  {
    heading: 'Read',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Time and money', href: '/docs/time-and-money' },
      { label: 'Integrations', href: '/docs/integrations' },
      { label: 'Security position', href: '/security' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Etyme', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: SPEND_AUDIT.t, href: SPEND_AUDIT.href },
      { label: 'Open the example program', href: '/demo' },
      { label: 'Sign in', href: '/login' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
      { label: 'Data processing addendum', href: '/dpa' },
    ],
    // Moved from the home page's own footer with the home page onto this
    // one, 2026-09-27. Said before somebody clicks, not after.
    note: 'Drafts, written from the code itself and not yet reviewed by a lawyer. Each one says so on its face.',
  },
]

/** Where Etyme is, said once, on every page. */
export const ADDRESS = {
  company: 'Etyme Inc.',
  street: '3201 Yorktown Ave, Ste. 110B',
  city: 'Durham, NC 27713',
  phone: '919-228-9961',
  email: 'support@etyme.com',
}

/** Every href the header and footer draw, for the test. */
export function everyFrameLink(): string[] {
  return [
    ...NAV_MENUS.flatMap((m) => itemsOf(m).map((i) => i.href)),
    PRIMARY.href,
    '/login',
    ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
  ]
}

/** Every word the header and footer show. */
export function frameCopy(): string[] {
  return [
    ...NAV_MENUS.flatMap((m) => [
      m.label,
      ...m.groups.flatMap((g) => [g.heading, ...g.items.flatMap((i) => [i.t, i.d ?? ''])]),
    ]),
    PRIMARY.t,
    'Sign in',
    ...FOOTER.flatMap((g) => [g.heading, ...g.links.map((l) => l.label), g.note ?? '']),
  ].filter(Boolean)
}

/**
 * Every label on something a reader presses in the header, for the
 * guard that refuses a button promising an account.
 */
export function frameButtons(): string[] {
  return [PRIMARY.t, 'Sign in', ...NAV_MENUS.map((m) => m.label)]
}
