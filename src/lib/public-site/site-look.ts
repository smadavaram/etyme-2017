import { readContrast } from './contrast'
import { FONT_PAIRINGS, SITE_TEMPLATES, approvalHolds, isSiteTemplate, type Branding, type SitePage, type SiteTemplateKey } from '@/lib/site-settings'

/**
 * Record 111, one engine: a tenant's public site is drawn from what is stored
 * on its record, never from a build of its own. Record 79: a template is a
 * layout and never a look. So this file keeps the two apart.
 *
 * - `orderFor` and `layoutOf` decide the layout. They move and frame the
 *   same sections; they never add, drop or reword one.
 * - `lookFor` decides the look: the colors, font pairing and logo the Owner
 *   saved, shown exactly as saved and only while the Owner's yes still covers
 *   them. Nothing is darkened, lightened or corrected.
 * - `lookWarnings` says in a sentence where a saved color is hard to read on
 *   the page it will sit on. It warns; it never changes a color.
 *
 * Pure: no database, no React.
 */

/** The page's own backgrounds: the canvas and the card surface (brand kit tokens). */
export const SITE_CANVAS = '#F0EEE6'
export const SITE_SURFACE = '#FBFAF7'

/** Every section a page can carry. Which of them appear is the record's decision, never the template's. */
export type SectionKey =
  | 'ask' | 'contact' | 'comingFree' | 'openPositions' | 'reputation'
  | 'track' | 'skills' | 'courses' | 'learn' | 'joinBench' | 'credentials'

const ASK_FIRST_ORDER: SectionKey[] = ['ask', 'contact', 'comingFree', 'openPositions', 'reputation', 'track', 'skills', 'courses', 'learn', 'joinBench', 'credentials']
const FEED_ORDER: SectionKey[] = ['comingFree', 'openPositions', 'reputation', 'track', 'skills', 'courses', 'learn', 'joinBench', 'ask', 'contact', 'credentials']

/** The order a template reads the sections in. A template never removes one that is present. */
export function orderFor(template: SiteTemplateKey, present: SectionKey[]): SectionKey[] {
  const order = template === 'ASK_FIRST' ? ASK_FIRST_ORDER : FEED_ORDER
  return order.filter((k) => present.includes(k))
}

export type Layout = { columns: 1 | 2; framed: boolean; wide: SectionKey[] }

/** One column with rules between (Ask first, Feed) or cards in two columns (Board). */
export function layoutOf(template: SiteTemplateKey): Layout {
  return template === 'BOARD'
    ? { columns: 2, framed: true, wide: ['comingFree', 'openPositions', 'ask', 'joinBench'] }
    : { columns: 1, framed: false, wide: [] }
}

const STACKS = {
  serif: "'Iowan Old Style', Palatino, Georgia, serif",
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
}
const FONTS: Record<keyof typeof FONT_PAIRINGS, { head: string; body: string }> = {
  SERIF_SANS: { head: STACKS.serif, body: STACKS.sans },
  SANS_SANS: { head: STACKS.sans, body: STACKS.sans },
  SERIF_SERIF: { head: STACKS.serif, body: STACKS.serif },
}

export type SiteLook = {
  template: SiteTemplateKey
  /** True only where the Owner's yes covers the values stored now. Otherwise the neutral default is drawn. */
  branded: boolean
  primary: string | null
  secondary: string | null
  headFont: string | null
  bodyFont: string | null
  /** An https address only; a stored file id has no public address here and is not drawn. */
  logoUrl: string | null
  pages: SitePage[]
}

export type StoredSite = {
  siteTemplate?: string | null
  siteLogoRef?: string | null
  sitePrimaryColor?: string | null
  siteSecondaryColor?: string | null
  siteFontPairing?: string | null
  sitePages?: unknown
  siteBrandingApprovedAt?: Date | null
  siteBrandingApprovedHash?: string | null
}

export function storedBranding(c: StoredSite): Branding {
  return { logoRef: c.siteLogoRef ?? null, primaryColor: c.sitePrimaryColor ?? null, secondaryColor: c.siteSecondaryColor ?? null, fontPairing: c.siteFontPairing ?? null }
}

function pagesOf(v: unknown): SitePage[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((p) => {
    const r = p as Record<string, unknown>
    return typeof r?.slug === 'string' && typeof r?.title === 'string'
      ? [{ slug: r.slug, title: r.title, body: typeof r.body === 'string' ? r.body : '' }]
      : []
  })
}

/**
 * What the site is drawn with. The layout always applies; the look applies
 * only while the Owner's yes still covers the saved values (record 79: a
 * look is adopted on the Owner's yes). Pages are words, not a look.
 */
export function lookFor(c: StoredSite): SiteLook {
  const template: SiteTemplateKey = isSiteTemplate(c.siteTemplate) ? c.siteTemplate : 'ASK_FIRST'
  const b = storedBranding(c)
  const branded = approvalHolds(c.siteBrandingApprovedAt, c.siteBrandingApprovedHash, b)
  const font = branded && b.fontPairing && b.fontPairing in FONTS ? FONTS[b.fontPairing as keyof typeof FONTS] : null
  return {
    template,
    branded,
    primary: branded ? b.primaryColor : null,
    secondary: branded ? b.secondaryColor : null,
    headFont: font?.head ?? null,
    bodyFont: font?.body ?? null,
    logoUrl: branded && b.logoRef && /^https:\/\//i.test(b.logoRef) ? b.logoRef : null,
    pages: pagesOf(c.sitePages),
  }
}

/** The inline styles the look puts on the page. Empty where nothing is branded, so the default page is unchanged. */
export function styleOf(look: SiteLook) {
  return {
    page: look.bodyFont ? { fontFamily: look.bodyFont } : undefined,
    heading: look.primary || look.headFont ? { ...(look.primary ? { color: look.primary } : {}), ...(look.headFont ? { fontFamily: look.headFont } : {}) } : undefined,
    accent: look.secondary ?? look.primary,
  }
}

/**
 * Sentences for the Owner, one per saved color that is hard to read where the
 * page uses it. The primary color is the headline color, on the page
 * background and on a card; the secondary color is the accent line, shown on
 * a card. The colors are kept as saved; there is no corrected value to offer.
 */
export function lookWarnings(b: Pick<Branding, 'primaryColor' | 'secondaryColor'>): string[] {
  const out: string[] = []
  const check = (label: string, text: string | null, on: string, where: string) => {
    if (!text) return
    const r = readContrast(text, on)
    if (r.warns) out.push(`Your ${label} color ${where}. ${r.warns}`)
  }
  check('primary', b.primaryColor, SITE_CANVAS, 'is used for headlines on the page background')
  check('primary', b.primaryColor, SITE_SURFACE, 'is used for headlines on cards')
  check('secondary', b.secondaryColor, SITE_SURFACE, 'is used for accent lines on cards')
  return out
}

export { SITE_TEMPLATES }
