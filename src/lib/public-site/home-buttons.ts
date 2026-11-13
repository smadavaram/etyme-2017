/**
 * The home page's two button shapes, as plain strings.
 *
 * They live in a file with no 'use client' on purpose. The home page is
 * drawn on the server, and a value imported from a client file reaches the
 * server as a reference, not a string: inside a template literal it prints
 * "[object Object]", and the hero's Start free was drawn as plain text on a
 * phone (found on the first photographs, 2026-11-13). Both the page and the
 * client parts read the strings from here.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

/** The filled button, at least 44 pixels high. */
export const FILLED =
  `inline-flex min-h-11 items-center justify-center rounded-lg bg-etyme-action px-5 py-2.5 text-center text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${FOCUS}`
/** The outline button beside it, at least 44 pixels high. */
export const OUTLINE =
  `inline-flex min-h-11 items-center justify-center rounded-lg border border-etyme-rule bg-etyme-surface px-5 py-2.5 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-action ${FOCUS}`

/**
 * On the ink panels (the glance, the strip, the last call). The reference
 * draws them on its own dark green; ours are the brand kit's ink, and the
 * filled button on them is the kit's raised white with ink text, so a
 * dark panel never carries a second violet button beside the header's.
 */
export const FILLED_ON_INK =
  `inline-flex min-h-11 items-center justify-center rounded-lg bg-etyme-raised px-5 py-2.5 text-center text-[15px] font-semibold text-etyme-ink transition-opacity hover:opacity-90 ${FOCUS} focus-visible:ring-offset-etyme-ink`
export const OUTLINE_ON_INK =
  `inline-flex min-h-11 items-center justify-center rounded-lg border border-etyme-canvas/60 px-5 py-2.5 text-center text-[15px] font-semibold text-etyme-canvas transition-colors hover:border-etyme-canvas ${FOCUS} focus-visible:ring-offset-etyme-ink`
