import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidedBy, readRow } from '@/lib/autonomy'

/**
 * How much of this product is AI, answered rather than asserted.
 *
 * Buyers ask, and the only answer worth giving is measured. Most of what
 * the system does unprompted is plain arithmetic, and saying so is a
 * feature — but a match is one of the few actions that genuinely could
 * be either, because the engine scores with the model where there is a
 * key and with rules where there is not, and falls back to rules when
 * the call fails.
 *
 * Until now the row could not say which, so the product said "a model
 * may have done this work and the row does not say which. We will not
 * guess." That is the honest fallback and not the right answer.
 *
 * The fact was never missing. It was written to the agent-run ledger and
 * did not reach the automation row.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const MATCHES = read('src/app/api/requirements/[id]/matches/route.ts')

describe('a match row says whether a model or arithmetic scored it', () => {
  it('a match scored by the model says so, and one scored by arithmetic says that instead', () => {
    expect(decidedBy('MATCH_RUN', { decidedBy: 'MODEL' }).by).toBe('MODEL')
    expect(decidedBy('MATCH_RUN', { decidedBy: 'RULE' }).by).toBe('RULE')
    expect(decidedBy('MATCH_RUN', { decidedBy: 'MODEL' }).says).toContain('the row says so')
    expect(decidedBy('MATCH_RUN', { decidedBy: 'RULE' }).says).toContain('fell back to arithmetic')
  })

  it('a match row no longer has to say it does not know', () => {
    // The sentence the product used to show for every match run.
    const blank = decidedBy('MATCH_RUN', { basis: 'Deterministic scoring against 4 required skills' })
    expect(blank.by).toBe('UNRECORDED')
    // And the row the route now writes, read the way the screen reads it.
    const row = readRow({
      action: 'MATCH_RUN',
      payload: { requirementId: 'r1', matchCount: 3, decidedBy: 'RULE' },
      reversible: true,
    })
    expect(row.decided.by).toBe('RULE')
    expect(row.decided.says).not.toContain('We will not guess')
  })

  it('the run writes the answer into the row it already writes, in the spelling the reader expects', () => {
    expect(MATCHES).toContain("const decidedBy: 'MODEL' | 'RULE' = byModel > 0 ? 'MODEL' : 'RULE'")
    expect(MATCHES).toContain('          decidedBy,\n          forceRefresh:')
  })

  it('the answer is read from what the engine recorded, never sniffed out of the basis sentence', () => {
    // Looking for the word "Deterministic" in prose would be a guess
    // dressed as an answer, and the prose is the engine's to change.
    expect(MATCHES).not.toMatch(/basis.*includes\(/)
    expect(MATCHES).not.toContain("'Deterministic'")
    expect(MATCHES).toContain('prisma.agentRun.count(')
    expect(MATCHES).toContain("agent: 'match.score',")
    expect(MATCHES).toContain('model: { not: null },')
  })

  it('only this run counts, so yesterday’s model pass cannot make today’s arithmetic look clever', () => {
    expect(MATCHES).toContain('const startedAt = new Date()')
    expect(MATCHES).toContain('at: { gte: startedAt },')
    expect(MATCHES.indexOf('const startedAt')).toBeLessThan(MATCHES.indexOf('runMatchEngine('))
  })

  it('a run the model attempted and failed counts as arithmetic, because arithmetic is what scored it', () => {
    // The engine records the failed call with verdict ERROR and scores
    // the batch with rules. Counting PASS rows only is what makes a week
    // with a bad key read as a week of rules rather than a week of AI.
    expect(MATCHES).toContain("verdict: 'PASS',")
  })

  it('the reader is told on the screen as well as in the log', () => {
    expect(MATCHES).toContain('        decidedBy,\n        matches: result.matches.map(')
  })
})
