import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DocMatrix, NAMED, matrixNotes, matrixTable, orderedRows } from '../../scripts/simulate/stages/regulatory/doc-matrix'

/**
 * The founder, 2026-11-01: "Simulate documents to attach, sign or fill
 * for positive and negative cases." One table: document kind × action ×
 * outcome, a count in each cell, the route's own sentence beside every
 * negative, his six documents first in his order.
 */

const refusal = (sentence: string, status = 422) => ({ ok: false, status, sentence })
const taken = { ok: true, status: 200, sentence: null }

describe('the document matrix', () => {
  it('prints the founder’s six documents first, in his order, then the rest', () => {
    const m = new DocMatrix()
    m.took('W-9', 'attach a file', taken, 'a PDF')
    for (const k of [...NAMED].reverse()) m.took(k, 'fill a form from fields', taken, 'taken')
    expect(orderedRows(m).map((r) => r.kind)).toEqual([...NAMED, 'W-9'])
  })

  it('counts a refusal only where the route said no with the words the case expected', () => {
    const m = new DocMatrix()
    expect(m.refused('W-9', 'attach a file', refusal('A PDF, a photograph or a Word document.'), 'A PDF, a photograph', 'a file nobody can open')).toBe(true)
    expect(m.refused('W-9', 'attach a file', refusal('Something else entirely.'), 'A PDF, a photograph', 'a file nobody can open')).toBe(false)
    const row = orderedRows(m)[0]
    expect(row.counts.refused).toBe(1)
    expect(row.notHeld[0]).toContain('a file nobody can open (answered 422')
  })

  it('a negative the route took instead of refusing is kept as a rule that did not hold, never counted', () => {
    const m = new DocMatrix()
    m.refused('Proof of right to work', 'attach a file', taken, 'cannot be accepted', 'an undated paper accepted')
    const line = matrixTable(m)[2]
    expect(line).toContain('| 0 | 0 | 0 | 0 |')
    expect(line).toContain('DID NOT HOLD: an undated paper accepted (answered 200)')
  })

  it('a paper taken that holds nothing yet is counted as held, with the record’s own sentence', () => {
    const m = new DocMatrix()
    m.held('Certificate of good standing', 'attach a file', 'It does not start until Dec 1, 2026, so it covers nobody before then.', true, 'a certificate that begins after the start', /does not start until/)
    const row = orderedRows(m)[0]
    expect(row.counts.held).toBe(1)
    expect(matrixTable(m)[2]).toContain('a certificate that begins after the start: “It does not start until Dec 1, 2026')
  })

  it('every negative case carries the route’s own sentence beside it, and a paper sent back carries its reason', () => {
    const m = new DocMatrix()
    m.sentBack('Proof of right to work', 'attach a file', taken, 'No date printed on it.')
    m.refused('Proof of right to work', 'attach a file', refusal('Proof of right to work runs out, so it cannot be accepted without the date printed on it.'), 'cannot be accepted', 'undated')
    const line = matrixTable(m)[2]
    expect(line).toContain('sent back: “No date printed on it.”')
    expect(line).toContain('undated: “Proof of right to work runs out')
  })

  it('a case the routes have no rule for is a finding with its owner, and a case not set up says why', () => {
    const m = new DocMatrix()
    m.finding('Background check authorization', 'nothing tells a copy the worker signed from one the firm made', 'regulatory')
    m.skipped('no corp-to-corp line was running')
    expect(matrixNotes(m)).toEqual([
      '- Finding (regulatory): Background check authorization — nothing tells a copy the worker signed from one the firm made',
      '- Not tried this run: no corp-to-corp line was running',
    ])
  })

  it('the extend station prints the matrix as a second table under its own heading', () => {
    const extend = readFileSync(join(process.cwd(), 'scripts/simulate/stages/regulatory/extend.ts'), 'utf8')
    expect(extend).toContain('await bothWays(ctx)')
    expect(extend).toContain('#### Every document both ways')
  })

  it('every case presses a route as a seat and never writes a row', () => {
    const cases = readFileSync(join(process.cwd(), 'scripts/simulate/stages/regulatory/both-ways.ts'), 'utf8')
    expect(cases).not.toMatch(/\.(create|update|upsert|delete)(Many)?\(/)
    expect(cases).toContain('ctx.expectRefusal')
  })
})
