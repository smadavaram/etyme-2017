/**
 * The home page's vertical rhythm, in one place. Decided 2026-09-30, on
 * the founder's "symmetricize home page blocks so the scrolls look neat
 * and nice".
 *
 * The page settles on a band when the reader stops scrolling
 * (`./settle`). A settle only looks right when the band it lands on
 * fills the screen under the header and no more, so every band is:
 *
 *   - at least one screen tall, less the sticky header — 61 pixels on a
 *     phone and 69 from `lg`, the same two numbers the header sets as
 *     the scroll padding (`./frame`), so a settled band's top sits under
 *     the header and its bottom at the foot of the screen;
 *   - its content centered in that screen, so a short band reads as a
 *     whole screen rather than a strip with the next band's top under it;
 *   - the same padding above and below, one value on a phone and one
 *     from `md`;
 *   - the same column: the same maximum width, the same gutter, so every
 *     band's first letter sits on one left edge;
 *   - one hairline between two bands, drawn on the upper band's bottom
 *     edge, so a settled band shows the header's line and no second one.
 *
 * Two bands are taller than a phone's screen and cannot be otherwise
 * without cutting words: the four steps with their screen, and the eight
 * parts. They take the same padding and column, grow past one screen,
 * and the settle lands on their top like any other.
 *
 * Backgrounds alternate strictly, plain then tinted: the hero on the
 * canvas, the steps on the surface, the parts on the canvas, the
 * founder's line on the ink, the close on the canvas, the footer on the
 * surface. `home-rhythm.test.ts` holds all of this against the source.
 */

/** A band: one screen under the sticky header, its content centered. */
export const SCREEN =
  'flex min-h-[calc(100svh-61px)] flex-col justify-center lg:min-h-[calc(100svh-69px)]'

/** The one hairline between two bands, on the upper band's bottom edge. */
export const EDGE = 'border-b border-etyme-rule'

/** The same padding above and below every band. */
export const PAD = 'py-10 md:py-14'

/** The same column in every band: one width, one gutter, one left edge. */
export const COLUMN = 'mx-auto max-w-6xl w-full px-4 sm:px-6'

/** A band's column with its padding. */
export const BAND = `${COLUMN} ${PAD}`

/** Every section heading under the hero, one size. */
export const H2 =
  'max-w-[30ch] text-balance font-serif text-[30px] leading-[1.12] tracking-[-0.02em] text-etyme-ink md:text-[40px]'

/** The space between a band's heading and what it introduces. */
export const UNDER_HEADING = 'mt-6 md:mt-10'
