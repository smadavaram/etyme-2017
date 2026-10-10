/**
 * A process drawn as boxes and arrows, with who does each box.
 *
 * ── Why a chart first. Decided 2026-09-30 ────────────────────────────
 *
 * The founder: "less prose, practical daily English, and neat flow
 * charts". A process is shown as a flow chart first, with short lines
 * under it, never as paragraphs. So every step page and every process
 * page in the documentation opens on one of these.
 *
 * It is HTML, not a picture: every word is text in the page, a screen
 * reader reads it as an ordered list, and a test can read what it says.
 * On a phone it stacks top to bottom with arrows pointing down; from a
 * wide screen up it runs left to right. The arrows are decoration and
 * hidden from a screen reader, because the list's order already says
 * what comes next.
 *
 * The colors are the brand's tokens, and each party keeps one color on
 * every chart: the client in the action violet (as text, `#4421D6`), a
 * supplier in clay, the worker in the verified green, the program office
 * and the rules in the passive gray.
 */

import { ACTOR_LABEL, ACTOR_CHIP, type FlowBox } from './flow'

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-full flex h-7 w-5 -translate-x-1/2 items-center justify-center
                 text-etyme-faint lg:left-full lg:top-1/2 lg:h-5 lg:w-6 lg:-translate-y-1/2 lg:translate-x-0"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" className="lg:-rotate-90" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" />
      </svg>
    </span>
  )
}

/**
 * The chart. `label` names it for a screen reader ("Job request to
 * award, in six steps"); the boxes are the steps, in order.
 */
export function FlowChart({ label, boxes }: { label: string; boxes: FlowBox[] }) {
  // From a wide screen up, one row with as many columns as boxes.
  const cols: Record<number, string> = {
    3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6', 7: 'lg:grid-cols-7',
  }
  return (
    <figure className="flow-chart rounded-xl border border-etyme-rule bg-etyme-surface p-4 sm:p-5" data-flow-chart="">
      <figcaption className="sr-only">{label}</figcaption>
      <ol
        aria-label={label}
        className={`grid grid-cols-1 gap-y-7 lg:gap-x-6 lg:gap-y-0 ${cols[boxes.length] ?? 'lg:grid-cols-6'}`}
      >
        {boxes.map((b, i) => (
          <li
            key={`${i}-${b.t}`}
            className="relative flex flex-col rounded-lg border border-etyme-rule bg-etyme-raised px-3.5 py-3 shadow-sm"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-etyme-faint">{i + 1}</span>
              {b.who && <span className={`chip ${ACTOR_CHIP[b.who]}`}>{ACTOR_LABEL[b.who]}</span>}
            </span>
            <span className="mt-2 text-[14px] leading-snug text-etyme-ink">{b.t}</span>
            {i < boxes.length - 1 && <Arrow />}
          </li>
        ))}
      </ol>
    </figure>
  )
}

/** Short lines under a chart: one idea per line, never a paragraph. */
export function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="max-w-[68ch] list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-etyme-ink marker:text-etyme-faint">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  )
}
