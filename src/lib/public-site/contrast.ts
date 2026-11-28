/**
 * Record 79, "a template is a layout, never a look": the colors a tenant
 * chose are warned about when they fail contrast, and never changed.
 * Pure: no database. The stored branding it will read does not exist yet
 * (it waits on the architect's schema step), so this takes two colors as
 * typed and answers in a sentence.
 */

export const MIN_TEXT_CONTRAST = 4.5 // WCAG AA, normal text

/** "#RGB" or "#RRGGBB" to [r,g,b] 0-255, or null where it is not a color. */
export function parseHex(v: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio, 1 to 21; null where either color cannot be read. */
export function contrastRatio(a: string, b: string): number | null {
  const x = parseHex(a), y = parseHex(b)
  if (!x || !y) return null
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

export interface ContrastReading {
  ratio: number | null
  /** True only where both colors were read and the ratio is enough. */
  passes: boolean
  /** A warning sentence for the Owner, or null. Never a changed color. */
  warns: string | null
}

/** Is the text color readable on the background. Warns; never blocks, never edits. */
export function readContrast(text: string, background: string): ContrastReading {
  const ratio = contrastRatio(text, background)
  if (ratio === null) return { ratio: null, passes: false, warns: 'One of these colors is not a color we can read, so we cannot check it. Use a code like #1F3A5F.' }
  const r = Math.round(ratio * 10) / 10
  return ratio >= MIN_TEXT_CONTRAST
    ? { ratio: r, passes: true, warns: null }
    : { ratio: r, passes: false, warns: `This text is hard to read on this color (${r} to 1; ${MIN_TEXT_CONTRAST} to 1 is the least that is comfortable). Your colors are kept as you chose them.` }
}
