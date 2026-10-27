import { whyDrawings, FOUR_LINES, type WhyDrawing } from './why-words'

/**
 * Under the Northbend panel on the home page: the two drawings and the
 * four lines (founder, "Build it", 2026-10-27). Each drawing is a named
 * person from the seed and one outcome, drawn as plain inline lines — no
 * image, no library — with one claim under it and one sentence under the
 * claim. The geometry is the drawing's own isometric helpers, ported as
 * they were; the words and figures are `./why-words`, read from the seed.
 *
 * Drawn on the server: nothing here moves or waits.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'
const TEXT_LINK = `text-etyme-action-press underline underline-offset-4 ${FOCUS} rounded-sm`
// ── The drawing's isometric helpers ──────────────────────────────────

type Pt = [number, number]
interface Origin { x: number; y: number; s: number }
const C = Math.cos(Math.PI / 6)
const S = 0.5
const iso = (x: number, y: number, z: number, o: Origin): Pt => [o.x + (x - y) * C * o.s, o.y + (x + y) * S * o.s - z * o.s]
const pts = (a: Pt[]) => a.map((p) => p.map((n) => Math.round(n * 10) / 10).join(',')).join(' ')
const LINE = 'stroke-current'

/** A box with its top, left and right faces. */
function Tile({ o, x, y, w, d, h }: { o: Origin; x: number; y: number; w: number; d: number; h: number }) {
  const top = [iso(x, y, h, o), iso(x + w, y, h, o), iso(x + w, y + d, h, o), iso(x, y + d, h, o)]
  const left = [iso(x, y + d, h, o), iso(x + w, y + d, h, o), iso(x + w, y + d, 0, o), iso(x, y + d, 0, o)]
  const right = [iso(x + w, y, h, o), iso(x + w, y + d, h, o), iso(x + w, y + d, 0, o), iso(x + w, y, 0, o)]
  return (
    <g strokeWidth={1} strokeLinejoin="round">
      <polygon points={pts(left)} className={`fill-etyme-sunk ${LINE}`} />
      <polygon points={pts(right)} className={`fill-etyme-rule ${LINE}`} />
      <polygon points={pts(top)} className={`fill-etyme-surface ${LINE}`} />
    </g>
  )
}

/** A thin paper on a tile, with its word. */
function Card({ o, x, y, z, w, d, text }: { o: Origin; x: number; y: number; z: number; w: number; d: number; text: string }) {
  const top = [iso(x, y, z, o), iso(x + w, y, z, o), iso(x + w, y + d, z, o), iso(x, y + d, z, o)]
  const [cx, cy] = iso(x + w / 2, y + d / 2, z, o)
  return (
    <g>
      <polygon points={pts(top)} strokeWidth={1} className={`fill-etyme-raised ${LINE}`} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} className="fill-current">{text}</text>
    </g>
  )
}

/** An arrow from a to b, in the action color or the attention color. */
function Arrow({ o, a, b, stop }: { o: Origin; a: [number, number, number]; b: [number, number, number]; stop?: boolean }) {
  const [x1, y1] = iso(...a, o)
  const [x2, y2] = iso(...b, o)
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={2}
      className={stop ? 'stroke-etyme-attention' : 'stroke-etyme-action'}
      markerEnd={`url(#${stop ? 'why-stop' : 'why-go'})`}
    />
  )
}

function Drawing({ d }: { d: WhyDrawing }) {
  const o: Origin = { x: 170, y: 70, s: 36 }
  const [lx, ly] = iso(0, -0.8, 0.5, o)
  // The papers drawing has one way out, which stops; the check has two.
  const stopAt: [number, number] = d.ok ? [5.2, 2.3] : [5.2, 1.5]
  const [sx, sy] = iso(stopAt[0], stopAt[1], 0.5, o)
  const [gx, gy] = iso(5.2, 0.9, 0.5, o)
  return (
    <figure className="m-0">
      <svg viewBox="0 0 500 250" role="img" aria-label={d.claim} className="block h-auto w-full max-w-full text-etyme-ink">
        <defs>
          <marker id="why-go" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-etyme-action" />
          </marker>
          <marker id="why-stop" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-etyme-attention" />
          </marker>
        </defs>
        <Tile o={o} x={0} y={0} w={4} d={3} h={0.5} />
        <text x={lx} y={ly} fontSize={12} fontWeight={600} className="fill-current">{d.who[0]}</text>
        <text x={lx} y={ly + 14} fontSize={12} className="fill-etyme-muted">{d.who[1]}</text>
        {d.cards.map((t, i) => <Card key={t} o={o} x={0.3 + i * 1.2} y={0.4} z={0.5} w={1.1} d={1.8} text={t} />)}
        {d.ok && (
          <>
            <text x={gx} y={gy} fontSize={12} fontWeight={600} className="fill-etyme-verified">{d.ok}</text>
            <Arrow o={o} a={[4.2, 0.9, 0.6]} b={[5.1, 0.9, 0.6]} />
          </>
        )}
        <text x={sx} y={sy} fontSize={12} fontWeight={600} className="fill-etyme-attention">{d.stop[0]}</text>
        <text x={sx} y={sy + 16} fontSize={11} className="fill-etyme-muted">{d.stop[1]}</text>
        <Arrow o={o} a={[4.2, stopAt[1], 0.6]} b={[5.1, stopAt[1], 0.6]} stop />
      </svg>
      <figcaption className="mt-2 max-w-[60ch] font-serif text-[17px] leading-snug tracking-[-0.01em] text-etyme-ink">
        {d.claim}
        <small className="mt-1 block font-sans text-[13px] leading-snug text-etyme-muted">{d.sub}</small>
      </figcaption>
    </figure>
  )
}

/** The two drawings, side by side from md, stacked on a phone; then the four lines. */
export function WhyBelow() {
  return (
    <section id="why" aria-label="Why, in two drawings and four lines" className="pb-4 pt-6">
      <div className="grid grid-cols-1 gap-x-6 gap-y-7 md:grid-cols-2">
        {whyDrawings().map((d) => <Drawing key={d.key} d={d} />)}
      </div>
      <div className="mt-8 grid max-w-[70ch] gap-2 text-[14px] leading-snug text-etyme-ink">
        {FOUR_LINES.map((l) => {
          const [before, after] = l.link ? l.text.split(l.link.words) : [l.text, '']
          return (
            <p key={l.lead} className="m-0">
              <b className="font-semibold">{l.lead}</b>{' '}{before}
              {l.link && <a href={l.link.href} className={TEXT_LINK}>{l.link.words}</a>}
              {after}
            </p>
          )
        })}
      </div>
    </section>
  )
}
