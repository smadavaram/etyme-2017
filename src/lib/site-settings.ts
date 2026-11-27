import { createHash } from 'crypto'

/**
 * A tenant's site settings (records 111, 79, 121): the template is a layout,
 * never a look; the branding is stored on the tenant's record; the Owner's yes
 * approves exactly the values stored when she gave it.
 *
 * Pure. The routes read and write; this file decides.
 */

export const SITE_TEMPLATES = ['ASK_FIRST', 'FEED', 'BOARD'] as const
export type SiteTemplateKey = (typeof SITE_TEMPLATES)[number]

/** Plain names an Owner reads, never the machine key. */
export const SITE_TEMPLATE_NAMES: Record<SiteTemplateKey, string> = {
  ASK_FIRST: 'Ask first',
  FEED: 'Feed',
  BOARD: 'Board',
}

/** The font pairings on offer: a headline face and a body face. The list is the whole choice. */
export const FONT_PAIRINGS = {
  SERIF_SANS: 'Serif headlines, sans-serif body',
  SANS_SANS: 'Sans-serif throughout',
  SERIF_SERIF: 'Serif throughout',
} as const
export type FontPairingKey = keyof typeof FONT_PAIRINGS

export type Branding = {
  logoRef: string | null
  primaryColor: string | null
  secondaryColor: string | null
  fontPairing: string | null
}

export const NO_BRANDING: Branding = { logoRef: null, primaryColor: null, secondaryColor: null, fontPairing: null }

export function isSiteTemplate(v: unknown): v is SiteTemplateKey {
  return (SITE_TEMPLATES as readonly unknown[]).includes(v)
}

const HEX = /^#[0-9a-fA-F]{6}$/

function colorOf(v: unknown, label: string): { value: string | null; error?: string } {
  if (v == null || v === '') return { value: null }
  if (typeof v !== 'string' || !HEX.test(v.trim())) return { value: null, error: `The ${label} color is written like #2B47E5: a hash and six letters or digits.` }
  return { value: v.trim().toUpperCase() }
}

/** A logo is an https address or the id of a file already stored; nothing else is accepted. */
function logoOf(v: unknown): { value: string | null; error?: string } {
  if (v == null || v === '') return { value: null }
  if (typeof v !== 'string') return { value: null, error: 'The logo is an https address.' }
  const t = v.trim()
  if (t.length > 500) return { value: null, error: 'The logo address is too long.' }
  if (/^https:\/\/[^\s]+$/i.test(t) || /^[a-z0-9]{20,40}$/i.test(t)) return { value: t }
  return { value: null, error: 'The logo is an https address.' }
}

/** Pure: the branding as typed, checked. Every field is optional; null is the neutral default. */
export function checkBranding(input: unknown): { ok: true; value: Branding } | { ok: false; says: string } {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const errors: string[] = []
  const logo = logoOf(i.logoRef)
  const p = colorOf(i.primaryColor, 'primary')
  const s = colorOf(i.secondaryColor, 'secondary')
  for (const r of [logo, p, s]) if (r.error) errors.push(r.error)
  let font: string | null = null
  if (i.fontPairing != null && i.fontPairing !== '') {
    if (typeof i.fontPairing === 'string' && i.fontPairing in FONT_PAIRINGS) font = i.fontPairing
    else errors.push(`Pick a font pairing from the list: ${Object.values(FONT_PAIRINGS).join('; ')}.`)
  }
  if (errors.length) return { ok: false, says: errors.join(' ') }
  return { ok: true, value: { logoRef: logo.value, primaryColor: p.value, secondaryColor: s.value, fontPairing: font } }
}

/** Pure: the fingerprint the Owner's yes is tied to. Same values, same fingerprint; any change, a new one. */
export function brandingFingerprint(b: Branding): string {
  const norm = [b.logoRef ?? '', (b.primaryColor ?? '').toUpperCase(), (b.secondaryColor ?? '').toUpperCase(), b.fontPairing ?? ''].join('\u0001')
  return createHash('sha256').update(norm).digest('hex').slice(0, 32)
}

/** Pure: whether anything the yes covers differs between two sets of values. */
export function brandingChanged(a: Branding, b: Branding): boolean {
  return brandingFingerprint(a) !== brandingFingerprint(b)
}

/** Pure: is there anything stored for a yes to approve. A bare yes over nothing is refused. */
export function brandingIsStored(b: Branding): boolean {
  return Boolean(b.primaryColor)
}

/**
 * Pure: the yes counts only while the values stored now are the values it was
 * given over. A yes with no fingerprint (the bare dated yes of before the
 * values were stored) never counts.
 */
export function approvalHolds(approvedAt: Date | null | undefined, approvedHash: string | null | undefined, stored: Branding): boolean {
  return Boolean(approvedAt && approvedHash && approvedHash === brandingFingerprint(stored))
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Pure: the WCAG contrast ratio of two #RRGGBB colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Pure: sentences warning about colors that are hard to read. Never changes a color (record 79). */
export function contrastWarnings(b: Branding): string[] {
  const out: string[] = []
  for (const [label, c] of [['primary', b.primaryColor], ['secondary', b.secondaryColor]] as const) {
    if (c && contrastRatio(c, '#FFFFFF') < 4.5) out.push(`Your ${label} color is hard to read as text on white (contrast ${contrastRatio(c, '#FFFFFF').toFixed(1)}; 4.5 is the minimum). It is kept as you set it.`)
  }
  return out
}

export type SitePage = { slug: string; title: string; body: string }
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Pure: the page list as typed, checked. A page is a slug, a title and its words. */
export function checkPages(input: unknown): { ok: true; value: SitePage[] } | { ok: false; says: string } {
  if (!Array.isArray(input)) return { ok: false, says: 'Send the pages as a list.' }
  if (input.length > 12) return { ok: false, says: 'A site has at most 12 pages.' }
  const seen = new Set<string>()
  const out: SitePage[] = []
  for (const p of input as Array<Record<string, unknown>>) {
    const slug = typeof p?.slug === 'string' ? p.slug.trim().toLowerCase() : ''
    const title = typeof p?.title === 'string' ? p.title.trim() : ''
    const body = typeof p?.body === 'string' ? p.body.trim() : ''
    if (!SLUG.test(slug) || slug.length > 40) return { ok: false, says: 'Each page needs an address of lowercase words joined by dashes, like about-us.' }
    if (!title || title.length > 120) return { ok: false, says: 'Each page needs a title of up to 120 characters.' }
    if (body.length > 8000) return { ok: false, says: `The page "${title}" is over 8,000 characters. Shorten it.` }
    if (seen.has(slug)) return { ok: false, says: `Two pages share the address ${slug}. Each page needs its own.` }
    seen.add(slug)
    out.push({ slug, title, body })
  }
  return { ok: true, value: out }
}
