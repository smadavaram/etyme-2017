/**
 * The public site's header and footer, as data.
 *
 * ── The four menus stay ──────────────────────────────────────────────
 *
 * The live home page's menu is Products · Industries · Compliance · Why
 * Etyme, and the founder has read it. The static marketing site on the
 * old repository used Source · Read · Company instead, which he has not.
 * So the new pages are mapped into the four he has seen, rather than the
 * four being replaced: the eight module pages under Products, the
 * compliance pages under Compliance, and About and Contact under Why
 * Etyme. Documentation gets an entry of its own beside them, because
 * documentation a buyer can read before signing anything is half of
 * what makes an enterprise product read as one.
 *
 * ── Industries is still one product ──────────────────────────────────
 *
 * Industries does not grow vertical pages. The core stays horizontal and
 * the note under the menu says so; its items lead to the one lifecycle
 * that serves all four.
 *
 * ── The spend audit is the census ────────────────────────────────────
 *
 * "Free contractor spend audit" is the census door, `/census`, and
 * nothing else. The test holds every link carrying those words to that
 * route, so a second, rebuilt audit cannot appear beside it.
 */

export interface NavItem {
  t: string
  d?: string
  href: string
}

export interface NavMenu {
  label: string
  items: NavItem[]
  note?: string
}

export const SPEND_AUDIT: NavItem = {
  t: 'Free contractor spend audit',
  d: 'Ten minutes, no card. Your numbers back in 24 hours.',
  href: '/census',
}

export const NAV_MENUS: NavMenu[] = [
  {
    label: 'Products',
    items: [
      { t: 'Requisitions & suppliers', d: 'Raised, cleared by rule or by a desk, released to the suppliers Procurement named.', href: '/requisitions' },
      { t: 'Submissions & screening', d: 'Every supplier against the same role, on one screen, each at its own rate.', href: '/submissions' },
      { t: 'Contracts & onboarding', d: 'The award writes the contract. The papers are checked before day one.', href: '/contracts' },
      { t: 'Timesheets & expenses', d: 'Filed once, signed twice, flagged first. Nobody approves their own.', href: '/timesheets' },
      { t: 'Invoices & the three-way match', d: 'An invoice with no signed week behind it is not paid.', href: '/invoices' },
      { t: 'Compliance & tenure', d: 'Counted per person across suppliers, warned at three quarters, blocked at your cap.', href: '/compliance' },
      { t: 'The chain', d: 'Each firm sees its own level. Insurance and authorization are visible at every depth.', href: '/chain' },
      { t: 'Governance', d: 'Blocks where the law is behind it, warns everywhere else, records even a pass.', href: '/governance' },
    ],
  },
  {
    label: 'Industries',
    items: [
      { t: 'Manufacturing & quality', href: '/#lifecycle' },
      { t: 'Healthcare & clinical', href: '/#lifecycle' },
      { t: 'Skilled trades & field services', href: '/#lifecycle' },
      { t: 'Professional & corporate services', href: '/#lifecycle' },
    ],
    note: 'One product. No industry-specific version to buy.',
  },
  {
    label: 'Compliance',
    items: [
      { t: 'Work authorization', d: 'Blocked, not warned, where the law is behind it.', href: '/contracts' },
      { t: 'Co-employment & time on site', d: 'Counted per person across suppliers, not per assignment.', href: '/compliance' },
      { t: 'Insurance & good standing', d: 'A lapsed certificate of insurance or good standing stops a submission and a start.', href: '/governance' },
      { t: 'Security position', d: 'What is done, what is not, and when.', href: '/security' },
      { t: 'Data processing addendum', d: 'Retention by category, and who processes what.', href: '/dpa' },
    ],
  },
  {
    label: 'Why Etyme',
    items: [
      { t: 'About Etyme', d: 'What we build, how we work, where we are.', href: '/about' },
      { t: 'Never runs a bench, never places anybody', href: '/about#neutral' },
      { t: 'Governance is never a paid tier', href: '/governance' },
      { t: 'Free while we prove it out', href: '/#why' },
      { t: 'Contact', d: 'Durham, North Carolina. A person answers.', href: '/contact' },
    ],
  },
]

export const DOCS_LINK: NavItem = {
  t: 'Documentation',
  d: 'Every flow, party by party, desk by desk. No sign-in.',
  href: '/docs',
}

export interface FooterGroup {
  heading: string
  links: { label: string; href: string }[]
}

export const FOOTER: FooterGroup[] = [
  {
    heading: 'Product',
    links: NAV_MENUS[0].items.map((i) => ({ label: i.t, href: i.href })),
  },
  {
    heading: 'Read',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Time and money', href: '/docs/time-and-money' },
      { label: 'Integrations', href: '/docs/integrations' },
      { label: 'Security position', href: '/security' },
      { label: 'Data processing addendum', href: '/dpa' },
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
    ...NAV_MENUS.flatMap((m) => m.items.map((i) => i.href)),
    DOCS_LINK.href,
    SPEND_AUDIT.href,
    '/login',
    ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
  ]
}

/** Every word the header and footer show. */
export function frameCopy(): string[] {
  return [
    ...NAV_MENUS.flatMap((m) => [m.label, ...m.items.flatMap((i) => [i.t, i.d ?? '']), m.note ?? '']),
    DOCS_LINK.t, DOCS_LINK.d ?? '',
    SPEND_AUDIT.t, SPEND_AUDIT.d ?? '',
    ...FOOTER.flatMap((g) => [g.heading, ...g.links.map((l) => l.label)]),
  ].filter(Boolean)
}
