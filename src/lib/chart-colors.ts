/**
 * The colors a chart is allowed to use, and the job each one does.
 *
 * Every set here is measured rather than chosen by eye, and the
 * measurement is written out beside it. Three jobs, three sets, and they
 * are not interchangeable:
 *
 *   SEVERITY  an ordered band — invoice age, a countdown. One hue,
 *             light to dark, so "worse" reads as "darker" without a
 *             legend. Never categorical hues: an age band is ordered
 *             and coloring it by identity throws that away.
 *   SERIES    identity — this client, that state. A fixed order, never
 *             cycled; the color follows the entity, so filtering a
 *             series out never repaints the survivors.
 *   STATUS    good, warning, serious. Reserved: never "series four".
 *
 * What this replaced, and why it is written down: the AR page drew
 * 31–60 and 61–90 days in the same clay (ΔE 0.0 — the validator's worst
 * possible score, two bands nobody could tell apart), the invoices page
 * drew the same five buckets in four unrelated Tailwind reds, and the
 * report's pipeline bar put a green segment beside a gray one at ΔE 5.6
 * for normal vision, below the floor of 15. All three looked fine.
 *
 * ---------------------------------------------------------------------------
 * How the figures below were obtained, 2026-09-26.
 *
 * The comments used to quote `node scripts/validate_palette.js`. That script
 * is not in this tree and is not in any commit in this repository's history,
 * so the runs could not be reproduced and the numbers beside them could not be
 * checked — which is the same failure mode as the "the 2017 cycle engine is
 * correct" claim CLAUDE.md records: a figure nobody could re-derive, steering
 * work for months.
 *
 * So the quotes are replaced with arithmetic that can be re-run here. The
 * contrast figures are the WCAG relative-luminance ratio that
 * __tests__/invariants/chart-colors.test.ts itself computes, so a number in
 * this file and a number in that test cannot disagree. The separation figures
 * are CIEDE2000 in CIE Lab from sRGB at D65, with color-blind vision simulated
 * by the Machado (2009) matrices at full severity for protanopia,
 * deuteranopia and tritanopia. Floors, from the September audit: 3:1 against
 * the surface, ΔE00 15 for normal vision, and no CVD pair worse than the
 * palette already tolerates.
 * ---------------------------------------------------------------------------
 */

/**
 * Ordered severity, light → dark. Untouched by the brand kit — the kit does
 * not move the clay, and this whole ramp is the clay's own hue.
 *
 *   L*         63.2 · 52.0 · 44.5 · 36.6 · 28.5   monotone, ΔL* 7.5–11.2
 *   contrast   2.73 · 4.00 · 5.24 · 7.02 · 9.46   on #FBFAF7, light end 2.73
 *   ΔE00       worst step 7.0 normal, 5.7 protan, 6.8 deutan, 7.4 tritan
 *
 * An ordered ramp is read by its lightness, not by its hue, which is why a
 * step separation below the categorical floor is correct here and would be a
 * bug in SERIES. The brand's clay is step two, so the ramp reads as Etyme's
 * own.
 */
export const SEVERITY = ['#CE8A50', '#C0622E', '#A85026', '#8C401E', '#6F3116'] as const

/**
 * Identity, in fixed order. The brand kit moved the first color and nothing
 * else, 2026-09-26: the action token went from blue #2B47E5 to violet
 * #5228FF, and SERIES[0] is the action color, so it moves with it.
 *
 * #5228FF and not the deeper #4421D6, because a chart segment is a fill. The
 * founder's split gives fills the brighter violet and small text the deeper
 * one; SERIES is only ever a fill — four status colors on a stacked bar in
 * reports/page.tsx and one legend swatch — and the counts sit in the legend
 * rather than inside a segment, so no SERIES color is ever set as text.
 *
 * The swap was measured before it was made, not after:
 *
 *   contrast on #FBFAF7   #5228FF 6.48 (blue was 6.42) · clay 4.00 ·
 *                         teal 3.55 · magenta 4.94 · olive 4.71 — floor 3
 *   L* band               38.8 … 55.4, spread 16.6
 *   chroma floor          39.4 (the teal)
 *   worst pair, normal    #5228FF/#AE3FA8 20.0   (was clay/olive 22.4)
 *   worst pair, protan    #C0622E/#8A6D00  6.4   unchanged
 *   worst pair, deutan    #C0622E/#8A6D00  5.3   unchanged
 *   worst pair, tritan    #C0622E/#8A6D00 12.4   unchanged
 *
 * So the palette's binding constraint is the clay against the olive, under
 * every kind of color blindness, and the kit moves neither — the separation a
 * color-blind reader gets is identical before and after, to the decimal. Every
 * pair involving the violet improved under protan (8.1 → 11.1) and deutan
 * (12.0 → 14.5).
 *
 * One thing did move and is recorded because it is the honest figure: under
 * normal vision the worst pair is no longer the clay and the olive but the
 * violet and the magenta, 22.4 → 20.0. Both are above the floor of 15, and
 * the reason is simply that violet sits nearer magenta than blue did. If a
 * sixth hue is ever wanted, that pair is the one with the least room.
 *
 * A sixth series is never a generated hue: it folds into "Other", or the
 * chart becomes small multiples.
 */
export const SERIES = ['#5228FF', '#C0622E', '#00967F', '#AE3FA8', '#8A6D00'] as const

/** Reserved for state, never for identity. Each ships with a word beside it. */
export const STATUS = {
  good: '#4F6F52',
  warning: '#C0622E',
  serious: '#B83A3A',
  neutral: '#6B6862',
} as const

/**
 * The five invoice-age bands, in the order a book is read.
 *
 * Current is not an age band at all — it is the part of the book that
 * is fine — so it wears the good status color, and the four overdue
 * bands wear the severity ramp. Whoever is chasing money sees one green
 * block and a darkening tail.
 */
export const AGE_BANDS = [STATUS.good, ...SEVERITY.slice(0, 4)] as const

/** The gap between two fills in a stacked bar. A border would add a line the data does not have. */
export const SEGMENT_GAP = '2px'

/**
 * A stacked bar's segments, sized and separated.
 *
 * The gap is drawn in the surface color rather than as a border, and
 * the last segment does not carry one — so the bar ends where the data
 * does.
 */
export function segmentStyle(share: number, color: string, last: boolean): React.CSSProperties {
  return {
    width: `${share * 100}%`,
    background: color,
    ...(last ? {} : { marginRight: SEGMENT_GAP }),
  }
}
