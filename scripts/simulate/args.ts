/**
 * The run's flags, read once. Pure, so a test can hold the defaults.
 *
 *   --placements N    placements the run aims for (50)
 *   --weeks W         weeks each placement works (12)
 *   --concurrency C   calls at once inside a stage (20)
 *   --only a,b        only these stations, by name
 *   --drop            drop the run's database at the end (kept by default)
 *   --no-build        use the existing build even if it looks stale
 *   --rebuild         build again even if the build looks current
 *   --template NAME   copy this template database instead of today's world
 *   --scale           copy today's generated world at the founder's scale
 *                     (lib/seed-scale), building it on the base world first
 *   --timeout MS      per call (60000)
 */
import { STAGE_ORDER, type Options } from './stage'

export interface Args extends Options {
  drop: boolean
  build: 'auto' | 'never' | 'always'
  template?: string
  /** Run on the generated world at the founder's scale rather than the base world. */
  scale: boolean
  timeoutMs: number
}

function positiveInt(name: string, v: string | undefined): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} takes a whole number above nought; it was given "${v ?? ''}".`)
  return n
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { placements: 50, weeks: 12, concurrency: 20, only: [], drop: false, build: 'auto', scale: false, timeoutMs: 60_000 }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=', 2)
    const value = () => inline ?? argv[++i]
    switch (flag) {
      case '--': break
      case '--placements': a.placements = positiveInt('placements', value()); break
      case '--weeks': a.weeks = positiveInt('weeks', value()); break
      case '--concurrency': a.concurrency = positiveInt('concurrency', value()); break
      case '--timeout': a.timeoutMs = positiveInt('timeout', value()); break
      case '--only': a.only = String(value() ?? '').split(',').map((s) => s.trim()).filter(Boolean); break
      case '--drop': a.drop = true; break
      case '--no-build': a.build = 'never'; break
      case '--rebuild': a.build = 'always'; break
      case '--template': a.template = value(); break
      case '--scale': a.scale = true; break
      default: throw new Error(`There is no flag ${flag}. The flags are --placements, --weeks, --concurrency, --only, --drop, --no-build, --rebuild, --template, --scale and --timeout.`)
    }
  }
  const unknown = a.only.filter((s) => !(STAGE_ORDER as readonly string[]).includes(s))
  if (unknown.length) throw new Error(`No station called ${unknown.join(', ')}. The stations are: ${STAGE_ORDER.join(', ')}.`)
  return a
}
