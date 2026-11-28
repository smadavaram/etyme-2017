/**
 * Every document action, both ways, as one table.
 *
 * The founder, 2026-11-01: "Simulate documents to attach, sign or fill
 * for positive and negative cases." One row per document kind and
 * action; one column per outcome; a count in every cell, and beside each
 * negative case the route's own sentence, so the table says what the
 * rule said rather than what a station hoped it would say.
 *
 *   accepted   the route took it, and the paper counts
 *   held       the route took it, and the record says it holds nothing
 *              yet (a certificate that begins later, a license already
 *              run out): a fact about an examination, not a pass
 *   sent back  the firm that asked looked at it and returned it, with a
 *              reason
 *   refused    the route said no, in a sentence
 *
 * The six documents of the founder's walk of a worker starting through
 * Brightmoor come first, in his order. A negative a station expected and
 * the route did not give is kept as a rule that did not hold, never
 * counted. A case the routes have no rule for is a finding with its
 * owner, never an invented refusal.
 *
 * Owned by regulatory. Pure: the station records into it, the report
 * prints it.
 */
import type { Res } from '../../actors'

export const ACTIONS = ['attach a file', 'sign or countersign', 'fill a form from fields'] as const
export type DocAction = (typeof ACTIONS)[number]

export const OUTCOMES = ['accepted', 'held', 'sent back', 'refused'] as const
export type DocOutcome = (typeof OUTCOMES)[number]

/** The founder's six, in his order (2026-11-01). */
export const NAMED = [
  'Proof of right to work',
  'I-9 and E-Verify',
  'Background check',
  'Signed NDA and confidentiality undertaking',
  'Drug screening',
  'Certificate of good standing',
] as const

export interface MatrixRow {
  kind: string
  action: DocAction
  counts: Record<DocOutcome, number>
  /** Each negative case's own sentence, the first per rule. */
  negatives: { rule: string; sentence: string }[]
  /** A positive case, in a line, the first per rule. */
  positives: string[]
  /** Negatives expected and not given: the rule did not hold. */
  notHeld: string[]
}

export interface Finding {
  kind: string
  says: string
  owner: string
}

export class DocMatrix {
  readonly rows = new Map<string, MatrixRow>()
  readonly findings: Finding[] = []
  readonly notTried: string[] = []

  private row(kind: string, action: DocAction): MatrixRow {
    const k = `${kind}|${action}`
    let r = this.rows.get(k)
    if (!r) {
      r = { kind, action, counts: { accepted: 0, held: 0, 'sent back': 0, refused: 0 }, negatives: [], positives: [], notHeld: [] }
      this.rows.set(k, r)
    }
    return r
  }

  /** A positive case: the route took it. */
  took(kind: string, action: DocAction, res: Pick<Res, 'ok' | 'status' | 'sentence'>, line: string, opts: { held?: boolean } = {}): boolean {
    const r = this.row(kind, action)
    if (!res.ok) {
      r.notHeld.push(`${line}: expected to be taken, answered ${res.status}${res.sentence ? ` — “${res.sentence}”` : ''}`)
      return false
    }
    r.counts[opts.held ? 'held' : 'accepted'] += 1
    if (!r.positives.includes(line)) r.positives.push(line)
    return true
  }

  /** A paper sent back by the firm that asked, with its reason. */
  sentBack(kind: string, action: DocAction, res: Pick<Res, 'ok' | 'status' | 'sentence'>, reason: string): boolean {
    const r = this.row(kind, action)
    if (!res.ok) {
      r.notHeld.push(`sending it back (${reason}) answered ${res.status}${res.sentence ? ` — “${res.sentence}”` : ''}`)
      return false
    }
    r.counts['sent back'] += 1
    if (!r.negatives.some((n) => n.rule === 'sent back')) r.negatives.push({ rule: 'sent back', sentence: reason })
    return true
  }

  /**
   * A negative case: the route was expected to say no with these words.
   * Counted only where the refusal came, as a 4xx carrying the phrase.
   * A 2xx where the record says it holds nothing is counted as held.
   */
  refused(kind: string, action: DocAction, res: Pick<Res, 'ok' | 'status' | 'sentence'>, phrase: string | RegExp, rule: string): boolean {
    const r = this.row(kind, action)
    const sentence = res.sentence ?? ''
    const carries = typeof phrase === 'string' ? sentence.includes(phrase) : phrase.test(sentence)
    if (res.status >= 400 && res.status < 500 && carries) {
      r.counts.refused += 1
      if (!r.negatives.some((n) => n.rule === rule)) r.negatives.push({ rule, sentence })
      return true
    }
    r.notHeld.push(`${rule} (answered ${res.status}${sentence ? ` — “${sentence}”` : ''})`)
    return false
  }

  /** A negative case the route answers by taking it and saying it holds nothing. */
  held(kind: string, action: DocAction, says: string | null, ok: boolean, rule: string, phrase: string | RegExp): boolean {
    const r = this.row(kind, action)
    const s = says ?? ''
    const carries = typeof phrase === 'string' ? s.includes(phrase) : phrase.test(s)
    if (ok && carries) {
      r.counts.held += 1
      if (!r.negatives.some((n) => n.rule === rule)) r.negatives.push({ rule, sentence: s })
      return true
    }
    r.notHeld.push(`${rule} (${ok ? `taken, and the record said “${s}”` : `refused: “${s}”`})`)
    return false
  }

  /** The routes have no rule for this: a finding with its owner, never an invented refusal. */
  finding(kind: string, says: string, owner: string): void {
    if (!this.findings.some((f) => f.kind === kind && f.says === says)) this.findings.push({ kind, says, owner })
  }

  /** A case this run could not set up, and why. */
  skipped(line: string): void {
    if (!this.notTried.includes(line)) this.notTried.push(line)
  }
}

/** One matrix for the run. */
export const docMatrix = new DocMatrix()

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** The order rows are printed in: the founder's six in his order, then the rest by kind. Pure. */
export function orderedRows(m: DocMatrix): MatrixRow[] {
  const rank = (kind: string) => {
    const i = (NAMED as readonly string[]).indexOf(kind)
    return i === -1 ? NAMED.length : i
  }
  return [...m.rows.values()].sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind) || ACTIONS.indexOf(a.action) - ACTIONS.indexOf(b.action)
  )
}

/** The table, as markdown lines. Pure. */
export function matrixTable(m: DocMatrix): string[] {
  const L: string[] = []
  L.push('| Document | Action | Accepted | Held | Sent back | Refused | What the route said on the negative case |')
  L.push('|---|---|---|---|---|---|---|')
  for (const r of orderedRows(m)) {
    const neg = r.negatives.map((n) => `${n.rule}: “${n.sentence}”`).join(' · ')
    const missing = r.notHeld.length ? ` · DID NOT HOLD: ${r.notHeld.join(' · ')}` : ''
    L.push(
      `| ${cell(r.kind)} | ${r.action} | ${r.counts.accepted} | ${r.counts.held} | ${r.counts['sent back']} | ${r.counts.refused} | ${cell((neg || '—') + missing)} |`
    )
  }
  return L
}

/** Findings and cases not tried, as lines under the table. Pure. */
export function matrixNotes(m: DocMatrix): string[] {
  return [
    ...m.findings.map((f) => `- Finding (${f.owner}): ${f.kind} — ${f.says}`),
    ...m.notTried.map((l) => `- Not tried this run: ${l}`),
  ]
}
