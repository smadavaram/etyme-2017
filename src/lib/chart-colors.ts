/**
 * The colors a chart is allowed to use, and the job each one does.
 *
 * Every set here was run through the palette validator rather than
 * chosen by eye, and the run is quoted beside it. Three jobs, three
 * sets, and they are not interchangeable:
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
 */

/**
 * Ordered severity, light → dark.
 *
 *   node scripts/validate_palette.js "#CE8A50,#C0622E,#A85026,#8C401E,#6F3116" \
 *     --ordinal --mode light --surface "#FBFAF7"
 *   PASS lightness monotone · PASS adjacent ΔL · PASS light-end contrast
 *   2.73:1 · PASS single hue (spread 17°)
 *
 * The brand's clay is step two, so the ramp reads as Etyme's own.
 */
export const SEVERITY = ['#CE8A50', '#C0622E', '#A85026', '#8C401E', '#6F3116'] as const

/**
 * Identity, in fixed order.
 *
 *   node scripts/validate_palette.js "#2B47E5,#C0622E,#00967F,#AE3FA8,#8A6D00" \
 *     --mode light --surface "#FBFAF7"
 *   PASS lightness band · PASS chroma floor · PASS CVD separation
 *   (worst adjacent ΔE 9.1 deutan) · PASS normal-vision floor (22.5)
 *   · PASS contrast vs surface
 *
 * Action blue and attention clay first, so the common two-series chart
 * is the brand's own pair. A sixth series is never a generated hue: it
 * folds into "Other", or the chart becomes small multiples.
 */
export const SERIES = ['#2B47E5', '#C0622E', '#00967F', '#AE3FA8', '#8A6D00'] as const

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
