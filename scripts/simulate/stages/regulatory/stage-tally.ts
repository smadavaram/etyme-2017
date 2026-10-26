/**
 * The paperwork of a placement, counted by the stage of the trade it
 * belongs to, and said as one table the founder can read.
 *
 * The founder, 2026-10-22: "Can you simulate request of documents at
 * every stage and give me a test script." Seven stages, in his order:
 * onboarding, company registration, worker registration, shortlisting,
 * interview, hiring, contract and extension. Every station of
 * regulatory's counts what it moved here as it moves it; the last one
 * (extend) hands the table back as its station's `table`, printed in the
 * run's report under the station's name.
 *
 * Owned by regulatory. Pure.
 */
import type { Actor, Res } from '../../actors'
import type { Ctx } from '../../stage'

export const DOC_STAGES = [
  'onboarding',
  'company registration',
  'worker registration',
  'shortlisting',
  'interview',
  'hiring',
  'contract and extension',
] as const
export type DocStage = (typeof DOC_STAGES)[number]

export interface StageRow {
  stage: DocStage
  /** What was asked for, in the trade's words. */
  what: Set<string>
  /** Of whom. */
  ofWhom: Set<string>
  asked: number
  answered: number
  examined: number
  sentBack: number
  /** Refusals that held where a station expected the rule to say no. */
  refused: number
  /** Expected refusals that did not come: the rule did not hold. */
  notHeld: string[]
  /** Every refusal sentence that held, first one kept per rule. */
  sentences: string[]
  /** The sentence chosen to show the rule, where a station named one. */
  best: string | null
  /** A line about this stage that is not a count (what is not built). */
  note: string | null
}

export class StageTally {
  readonly rows = new Map<DocStage, StageRow>()

  constructor() {
    for (const s of DOC_STAGES) {
      this.rows.set(s, {
        stage: s, what: new Set(), ofWhom: new Set(), asked: 0, answered: 0, examined: 0, sentBack: 0,
        refused: 0, notHeld: [], sentences: [], best: null, note: null,
      })
    }
  }

  private row(s: DocStage): StageRow {
    return this.rows.get(s)!
  }

  /** What this stage asks for and of whom (said once, however often it is asked). */
  names(s: DocStage, what: string, ofWhom: string): void {
    this.row(s).what.add(what)
    for (const who of ofWhom.split('; ')) this.row(s).ofWhom.add(who)
  }
  asked(s: DocStage, n = 1): void { this.row(s).asked += n }
  answered(s: DocStage, n = 1): void { this.row(s).answered += n }
  examined(s: DocStage, n = 1): void { this.row(s).examined += n }
  sentBack(s: DocStage, n = 1): void { this.row(s).sentBack += n }
  note(s: DocStage, line: string): void { this.row(s).note = line }

  /**
   * A refusal the station expected. Counted where it came with a sentence
   * carrying the expected words; otherwise kept as a rule that did not
   * hold, so the table never claims a refusal the route did not give.
   */
  refusal(s: DocStage, res: Pick<Res, 'status' | 'sentence'>, phrase: string | RegExp, opts: { best?: boolean; rule?: string } = {}): boolean {
    const r = this.row(s)
    const sentence = res.sentence ?? ''
    const carries = typeof phrase === 'string' ? sentence.includes(phrase) : phrase.test(sentence)
    const held = res.status >= 400 && res.status < 500 && carries
    if (held) {
      r.refused += 1
      if (!r.sentences.includes(sentence)) r.sentences.push(sentence)
      if (opts.best && !r.best) r.best = sentence
    } else {
      r.notHeld.push(`${opts.rule ?? String(phrase)} (answered ${res.status}${sentence ? `: ${sentence}` : ''})`)
    }
    return held
  }

  /** The best sentence for a stage: the one a station named, else the first that held. */
  bestOf(s: DocStage): string | null {
    const r = this.row(s)
    return r.best ?? r.sentences[0] ?? null
  }
}

/** One tally for the whole run, across regulatory's three stations. */
export const tally = new StageTally()

/**
 * `ctx.expectRefusal`, counted against a stage. The report's own table of
 * expected rules still gets its row; this adds the stage's count.
 */
export async function expectAt(
  ctx: Ctx,
  stage: DocStage,
  seat: Actor,
  call: (a: Actor) => Promise<Res>,
  phrase: string | RegExp,
  opts: { best?: boolean; rule?: string } = {}
): Promise<Res> {
  const res = await ctx.expectRefusal(seat, call, phrase)
  tally.refusal(stage, res, phrase, opts)
  return res
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const listed = (xs: Set<string>) => [...xs].join('; ') || '—'

/** The founder's table: one row per stage. Pure. */
export function stageTable(t: StageTally): string {
  const L: string[] = []
  L.push('| Stage | What was asked | Of whom | Asked | Answered | Examined | Sent back | Refused | The refusal that shows the rule |')
  L.push('|---|---|---|---|---|---|---|---|---|')
  for (const s of DOC_STAGES) {
    const r = t.rows.get(s)!
    const best = t.bestOf(s)
    const what = r.note ? `${listed(r.what)}. ${r.note}` : listed(r.what)
    L.push(
      `| ${s.charAt(0).toUpperCase() + s.slice(1)} | ${cell(what)} | ${cell(listed(r.ofWhom))} | ${r.asked} | ${r.answered} | ` +
        `${r.examined} | ${r.sentBack} | ${r.refused} | ${best ? `“${cell(best)}”` : '—'} |`
    )
  }
  return L.join('\n')
}

/** Every rule a station expected to hold and that did not, by stage. Pure. */
export function notHeldLines(t: StageTally): string[] {
  const out: string[] = []
  for (const s of DOC_STAGES) for (const n of t.rows.get(s)!.notHeld) out.push(`- ${s}: ${n}`)
  return out
}
