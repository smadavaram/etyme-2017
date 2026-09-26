/**
 * Every page somebody can read without signing in, in one list.
 *
 * ── Why a list ───────────────────────────────────────────────────────
 *
 * `lib/positioning` is the guard on public words, and until 2026-09-26
 * it read the pages somebody remembered to hand it: the home page, the
 * census, two dashboard pages. A page it does not read is a page it
 * cannot catch, and the marketing site was about to grow by two dozen
 * pages at once. So the guard now reads this list, and
 * `__tests__/invariants/public-pages.test.ts` walks `src/app` for every
 * page outside the dashboard and fails on one that is in neither this
 * list nor the short list of pages that are not marketing at all. A new
 * public page cannot be added outside the guard; it can only be added
 * to it.
 *
 * ── The route is recorded separately from the words ──────────────────
 *
 * The words of the module pages, the documentation and the company pages
 * live in `lib/public-site`, which is the market's. The route files that
 * mount them live under `src/app`, and a new top-level folder there has
 * no owner in `lib/domains` until the architect gives it one. So each
 * entry names the route file it is mounted by, and the test reports the
 * ones still waiting for their route by name, rather than a page built
 * and silently unreachable.
 */

export type PageKind =
  /** The front door. */
  | 'HOME'
  /** A door that asks for something: the census, the demo. */
  | 'DOOR'
  /** One of the eight stations of the product. */
  | 'MODULE'
  /** The operating model, party by party. */
  | 'DOCS'
  /** About, contact, the security position. */
  | 'COMPANY'
  /** Terms, privacy, the DPA — regulatory's words, read by the guard for price and AI only. */
  | 'LEGAL'

export interface PublicPage {
  route: string
  title: string
  kind: PageKind
  /** The file Next mounts at `route`. */
  routeFile: string
}

export const MODULE_ROUTES = [
  '/requisitions', '/submissions', '/contracts', '/timesheets',
  '/invoices', '/compliance', '/chain', '/governance',
] as const

export const DOCS_SLUGS = [
  'client', 'systems-integrator', 'msp-program-office', 'prime-vendor',
  'sub-vendor', 'bench-vendor', 'self-employed', 'candidate',
  'candidate-independent', 'candidate-employee',
  'time-and-money', 'integrations',
] as const

export type DocsSlug = (typeof DOCS_SLUGS)[number]

/**
 * Where the new pages are mounted. A route group, so the URLs read
 * `/requisitions` and `/docs/client` and the whole marketing site sits
 * under one folder a single ownership line can give to the market.
 */
export const SITE_GROUP = 'src/app/(site)'

export const PUBLIC_PAGES: PublicPage[] = [
  { route: '/', title: 'Home', kind: 'HOME', routeFile: 'src/app/page.tsx' },
  { route: '/census', title: 'Free contractor spend audit', kind: 'DOOR', routeFile: 'src/app/census/page.tsx' },
  { route: '/demo', title: 'Open the example program', kind: 'DOOR', routeFile: 'src/app/demo/page.tsx' },

  ...MODULE_ROUTES.map((route) => ({
    route,
    title: route.slice(1),
    kind: 'MODULE' as const,
    routeFile: `${SITE_GROUP}${route}/page.tsx`,
  })),

  { route: '/docs', title: 'Documentation', kind: 'DOCS', routeFile: `${SITE_GROUP}/docs/page.tsx` },
  ...DOCS_SLUGS.map((slug) => ({
    route: `/docs/${slug}`,
    title: slug,
    kind: 'DOCS' as const,
    routeFile: `${SITE_GROUP}/docs/[slug]/page.tsx`,
  })),

  { route: '/security', title: 'Security position', kind: 'COMPANY', routeFile: `${SITE_GROUP}/security/page.tsx` },
  { route: '/about', title: 'About Etyme', kind: 'COMPANY', routeFile: `${SITE_GROUP}/about/page.tsx` },
  { route: '/contact', title: 'Contact', kind: 'COMPANY', routeFile: `${SITE_GROUP}/contact/page.tsx` },

  { route: '/terms', title: 'Terms of service', kind: 'LEGAL', routeFile: 'src/app/terms/page.tsx' },
  { route: '/privacy', title: 'Privacy policy', kind: 'LEGAL', routeFile: 'src/app/privacy/page.tsx' },
  { route: '/dpa', title: 'Data processing addendum', kind: 'LEGAL', routeFile: 'src/app/dpa/page.tsx' },
]

/**
 * Pages under `src/app` that are reachable without signing in and are
 * not marketing, each with the reason. The test fails on a page that is
 * in neither list, so this is where somebody has to write down why a
 * public page is exempt from the guard.
 */
export const NOT_MARKETING: { prefix: string; why: string }[] = [
  { prefix: 'src/app/dashboard', why: 'Behind sign-in, and held to the dashboard’s own rules.' },
  { prefix: 'src/app/(auth)', why: 'The sign-in screens themselves; they name the sign-in providers, which is what a sign-in button is for.' },
  { prefix: 'src/app/welcome/', why: 'A private welcome link for somebody invited to a seat.' },
  { prefix: 'src/app/ready', why: 'The deployment’s own readiness board, for staff.' },
  { prefix: 'src/app/site/', why: 'A company’s own generated site, held to lib/site-voice rather than to Etyme’s positioning.' },
  { prefix: 'src/app/c/', why: 'A consultant’s own page, in their words.' },
  { prefix: 'src/app/apply/', why: 'A supplier’s private onboarding link.' },
  { prefix: 'src/app/packet/', why: 'A private document request link.' },
  { prefix: 'src/app/answer/', why: 'A private reply link.' },
  { prefix: 'src/app/reply/', why: 'A private reply link.' },
  { prefix: 'src/app/claim/', why: 'A private claim link.' },
  { prefix: 'src/app/bench-invite/', why: 'A private bench invitation link.' },
  { prefix: 'src/app/legal/', why: 'Regulatory’s agreements, reached from the census; read for price and AI with the other legal pages.' },
]

/** The page a route is registered under, or null. */
export function pageAt(route: string): PublicPage | null {
  return PUBLIC_PAGES.find((p) => p.route === route) ?? null
}
