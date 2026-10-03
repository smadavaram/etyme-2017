/**
 * The mural under the founder's line, "Join forces with global teams
 * around the world". Replaced 2026-09-27.
 *
 * The first drawing here was a Y of three strokes beside the words, and
 * the founder circled it on his phone: "I thought you will create a
 * mural." Then he said what it should show — "orchestration between
 * companies and people, integrating and streamlining."
 *
 * So it is drawn in the house mural style from the brand kit
 * (`brand-kit/logo/mural-band.svg`): a wide band, flat line work of one
 * weight, round-headed figures, ring circles on a timeline, small cards,
 * a table panel, and a ruled baseline with ticks running edge to edge.
 *
 * What it says, read from either edge inward:
 *   - firms on both sides, each with its people beside it — a supplier
 *     and a sub-vendor further out on the left, two clients on the right,
 *     and neither side larger than the other
 *   - four lanes of work leave each firm broken, wavering and knotted,
 *     with paper scattered across them: the way it is today
 *   - nearer the middle the same lanes run straight and evenly spaced,
 *     their stations aligned in columns and the paper squared up above
 *   - and they pass through one shared record, a lane to a row. The
 *     record keeps them in step; it is not where they end
 *   - two clock faces set to different hours, and one faint arc across
 *     the top, are all that says "around the world"
 *
 * Drawn for a dark band since 2026-09-28, when the founder asked for the
 * band to read like a second hero: the line work is the canvas color on
 * the brand's ink, and every shape drawn hollow is filled with the ink so
 * the ground shows through it. It is recolored, not the light drawing
 * placed on a dark ground, which would have left canvas-filled cards
 * glaring off the band. Two small accents in the kit's colors: a violet
 * lane on the supply side and an orange one on the demand side, meeting
 * as two row markers inside the record. On the ink they are the kit's
 * brighter violet (`--violet`, 2.5 to 1 against the ink; the deeper
 * text violet would be 1.9) and its orange (`--orange`, 4.8 to 1). The
 * violet is under the 3 to 1 a meaningful graphic needs; it is not
 * meaningful here — the lane is decoration, and the drawing's content is
 * in its label. Colors go through the kit's CSS variables, never
 * hand-typed. It does not move.
 *
 * On a phone it does not shrink to a sliver: the band keeps a fixed
 * height and the drawing is cropped to its middle (`xMidYMid slice`), so
 * the record and the straightened lanes stay at a readable size.
 *
 * ── "I don't see the mural", 2026-09-28 ─────────────────────────────
 *
 * Measured on `next start` the same day, it drew at both widths: 1440 by
 * 384 on a desktop, 390 by 210 on a phone, in ink, directly under the
 * heading and its two sentences. What a reader could fairly call "not
 * there": on a phone the crop keeps only the middle half of the drawing,
 * so no firm and no person is in it and it reads as a strip of lines;
 * and above the phone width the drawing had no intrinsic size, only a
 * viewBox, so its height depended on the browser inferring one. The
 * `width` and `height` attributes now give it the 15:4 ratio every
 * browser honors under `h-auto`; CSS still sets the size it is drawn at.
 */

const W = 2400
const H = 640
const GROUND = 560
const LANES = [200, 260, 320, 380]
/** Stations on the straightened lanes, one column per step, both sides. */
const STEPS_L = [700, 790, 880]
const STEPS_R = [1520, 1610, 1700]
const REC = { x: 940, y: 100, w: 520, h: 320 }

/** Ink is the drawing's default fill, set once on the root; a stroked shape says so. */
const line = (w: number) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: w })
/**
 * The ground the drawing sits on, which is also the fill of every shape
 * drawn hollow — a card, a firm, the record — so the band shows through
 * them. The ink since 2026-09-28, when the band went dark.
 */
const GROUND_FILL = { fill: 'var(--ink)' }

/** One of the kit's figures: a round head over a rounded body, standing on the ground. */
function Figure({ x, big }: { x: number; big?: boolean }) {
  const bw = big ? 72 : 56
  const bh = big ? 96 : 66
  const r = big ? 21 : 17
  return (
    <g>
      <circle cx={x + bw / 2} cy={GROUND - bh - 6 - r} r={r} />
      <rect x={x} y={GROUND - bh} width={bw} height={bh} rx={big ? 22 : 18} />
    </g>
  )
}

/** A firm: an outline block with rows of window ticks, on the ground. */
function Firm({ x, top, w, roof }: { x: number; top: number; w: number; roof?: 'peak' | 'step' }) {
  const cols = Math.floor((w - 24) / 42)
  const rows = Math.floor((GROUND - top - 50) / 40)
  return (
    <g>
      <rect x={x} y={top} width={w} height={GROUND - top} rx={6} {...line(5)} style={GROUND_FILL} />
      {roof === 'peak' && <path d={`M ${x - 8} ${top + 8} L ${x + w / 2} ${top - 42} L ${x + w + 8} ${top + 8}`} {...line(5)} />}
      {roof === 'step' && <rect x={x + w / 2 - 35} y={top - 28} width={70} height={28} rx={4} {...line(5)} />}
      {Array.from({ length: rows }).map((_, j) => (
        <line key={j} x1={x + 25} x2={x + 41 + (cols - 1) * 42} y1={top + 33 + j * 40} y2={top + 33 + j * 40}
          {...line(6)} strokeDasharray="16 26" />
      ))}
    </g>
  )
}

/** A small card or form: an outline with a heading bar and two lines. */
function Paper({ x, y, turn = 0 }: { x: number; y: number; turn?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn} 22 28)`}>
      <rect width={44} height={56} rx={5} {...line(4)} style={GROUND_FILL} />
      <rect x={9} y={11} width={20} height={6} rx={3} />
      <line x1={9} y1={29} x2={35} y2={29} {...line(3)} />
      <line x1={9} y1={40} x2={29} y2={40} {...line(3)} />
    </g>
  )
}

/** A clock face at some hour; two of them, set apart, are the time zones. */
function Clock({ x, y, hour }: { x: number; y: number; hour: number }) {
  const a = ((hour % 12) / 12) * 2 * Math.PI
  return (
    <g>
      <circle cx={x} cy={y} r={26} {...line(4)} />
      <line x1={x} y1={y} x2={x + Math.sin(a) * 13} y2={y - Math.cos(a) * 13} {...line(4)} />
      <line x1={x} y1={y} x2={x} y2={y - 19} {...line(3)} />
    </g>
  )
}

/** A station on a straightened lane: a ring, or a solid dot, in the kit's timeline style. */
function Station({ x, y, solid }: { x: number; y: number; solid?: boolean }) {
  return solid
    ? <circle cx={x} cy={y} r={9} />
    : <g><circle cx={x} cy={y} r={9} {...line(4)} style={GROUND_FILL} /><circle cx={x} cy={y} r={3} /></g>
}

/**
 * A lane as it is today: broken and wavering between a firm and the
 * point where it straightens. `from` greater than `to` draws it from the
 * right edge, so the right side is the left side mirrored.
 */
function Messy({ from, to, y, i }: { from: number; to: number; y: number; i: number }) {
  const d = (to - from) / 4
  const wob = [18, -22, 14, -16][i]
  const p = `M ${from} ${y + wob} C ${from + d} ${y - wob}, ${from + 2 * d} ${y + wob * 1.3}, ${from + 3 * d} ${y - wob * 0.4} S ${to - d * 0.3} ${y}, ${to} ${y}`
  return <path d={p} {...line(4)} strokeDasharray={i % 2 ? '10 12' : '26 14'} />
}

export function JoinMural() {
  const midL = REC.x
  const midR = REC.x + REC.w
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="A wide line drawing. Firms stand on both sides with their people beside them: a supplier and a smaller sub-vendor on the left, two clients on the right. From each side four lanes of work start out broken and tangled, with papers scattered across them, then straighten, evenly spaced and with their steps aligned, as they reach one shared record in the middle, and pass through it a lane to a row. Two clocks set to different hours sit above the firms."
      className="block h-[210px] w-full sm:h-auto"
      fill="currentColor"
      strokeLinecap="round"
      style={{ color: 'var(--canvas)', background: 'var(--ink)' }}
    >
      {/* The faint arc of a horizon, and the ruled ground with its ticks, edge to edge. */}
      <path d={`M 0 40 Q ${W / 2} -40 ${W} 40`} {...line(2)} opacity={0.25} />
      <rect x={0} y={GROUND} width={W} height={3} />
      <line x1={22.5} x2={W} y1={GROUND + 30} y2={GROUND + 30} stroke="currentColor" strokeWidth={12} strokeLinecap="butt" strokeDasharray="3 45" />

      {/* Lanes, today: broken, wavering, one knotted on each side, paper strewn. */}
      {LANES.map((y, i) => <Messy key={`ml${y}`} from={356} to={640} y={y} i={i} />)}
      {LANES.map((y, i) => <Messy key={`mr${y}`} from={2044} to={1760} y={y} i={3 - i} />)}
      <path d="M 452 268 c 34 -44 70 6 26 22 c -34 12 -26 -42 8 -34 c 18 4 26 18 40 22" {...line(4)} />
      <path d="M 1948 316 c -34 -44 -70 6 -26 22 c 34 12 26 -42 -8 -34 c -18 4 -26 18 -40 22" {...line(4)} />
      <Paper x={404} y={110} turn={-14} />
      <Paper x={548} y={286} turn={17} />
      <Paper x={590} y={118} turn={7} />
      <Paper x={1808} y={112} turn={-9} />
      <Paper x={1852} y={228} turn={-19} />
      <Paper x={1950} y={118} turn={12} />

      {/* Lanes, in step: straight, evenly spaced, the same stations in columns,
          the paper squared up above them. One violet lane from the supply
          side, one orange from the demand side. */}
      {LANES.map((y, i) => (
        <g key={`s${y}`}>
          <line x1={640} y1={y} x2={midL} y2={y}
            {...line(i === 1 ? 5 : 4)} style={i === 1 ? { stroke: 'var(--violet)' } : undefined} />
          <line x1={midR} y1={y} x2={1760} y2={y}
            {...line(i === 2 ? 5 : 4)} style={i === 2 ? { stroke: 'var(--orange)' } : undefined} />
          {STEPS_L.map((x, k) => <Station key={x} x={x} y={y} solid={(i + k) % 2 === 0} />)}
          {STEPS_R.map((x, k) => <Station key={x} x={x} y={y} solid={(i + k) % 2 === 1} />)}
        </g>
      ))}
      {[...STEPS_L, ...STEPS_R].map((x) => <Paper key={`p${x}`} x={x - 22} y={112} />)}

      {/* The one record, a lane to a row, with the two accents meeting in it. */}
      <rect x={REC.x} y={REC.y} width={REC.w} height={REC.h} rx={18} {...line(5)} style={GROUND_FILL} />
      <rect x={REC.x + 32} y={REC.y + 26} width={180} height={14} rx={7} />
      <rect x={REC.x + REC.w - 82} y={REC.y + 26} width={50} height={14} rx={7} />
      <line x1={REC.x + 32} y1={REC.y + 70} x2={REC.x + REC.w - 32} y2={REC.y + 70} {...line(3)} />
      {LANES.map((y, i) => (
        <g key={`r${y}`}>
          {i > 0 && <line x1={REC.x + 32} y1={y - 30} x2={REC.x + REC.w - 32} y2={y - 30} {...line(3)} />}
          <circle cx={REC.x + 46} cy={y} r={8}
            style={i === 1 ? { fill: 'var(--violet)' } : i === 2 ? { fill: 'var(--orange)' } : undefined} />
          <rect x={REC.x + 72} y={y - 5} width={[230, 170, 200, 150][i]} height={10} rx={5} />
          <rect x={REC.x + REC.w - 150} y={y - 3} width={36} height={6} rx={3} />
          <rect x={REC.x + REC.w - 100} y={y - 3} width={60} height={6} rx={3} />
        </g>
      ))}

      {/* Supply side: a sub-vendor further out, a supplier, their people. */}
      <Firm x={20} top={330} w={104} roof="peak" />
      <line x1={124} y1={420} x2={206} y2={420} {...line(4)} strokeDasharray="10 10" />
      <Figure x={134} />
      <Firm x={206} top={170} w={150} roof="step" />
      <Clock x={281} y={92} hour={3} />
      <Figure x={372} big />
      <Figure x={458} />

      {/* Demand side: two clients and their people. */}
      <Firm x={2044} top={170} w={150} roof="step" />
      <Clock x={2119} y={92} hour={9} />
      <Figure x={1956} big />
      <Figure x={1886} />
      <Firm x={2276} top={300} w={104} />
      <Figure x={2212} />
    </svg>
  )
}
