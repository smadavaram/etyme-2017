import { describe, it, expect } from 'vitest'
import { entityByKey } from '@/lib/importable'
import {
  parseResponse,
  needsConfirming,
  reviewOf,
  toRows,
  modelAvailable,
  CONFIDENT_ENOUGH,
  type ExtractedField,
  type ExtractedRecord,
} from '@/lib/extract'

/**
 * The alias table was the 2017 shape. It holds forty spellings of "email"
 * and understands none of them: a column called "Primary Contact E-mail
 * Address (work)" scores below the threshold and is silently ignored, and a
 * file whose first row is a title rather than headers fails completely. It
 * cannot read a PDF, a certificate, or an email with the details in prose —
 * which is how most of this actually arrives.
 *
 * These tests hold the two properties that make a reader safe to rely on:
 * confidence and provenance travel with every value, and the fallback is
 * labelled rather than disguised.
 */

const COST_CENTERS = entityByKey('COST_CENTERS')!

function field(over: Partial<ExtractedField> = {}): ExtractedField {
  return { field: 'code', value: 'MFG-100', confidence: 1, foundIn: 'MFG-100', concern: null, ...over }
}

describe('reading the answer', () => {
  it('reads plain JSON', () => {
    const r = parseResponse('{"records":[{"fields":[]}]}')
    expect(r?.records).toHaveLength(1)
  })

  it('reads JSON inside a code fence, because failing on punctuation is silly', () => {
    const r = parseResponse('Here you go:\n```json\n{"records":[{"fields":[]}]}\n```')
    expect(r?.records).toHaveLength(1)
  })

  it('reads JSON with a sentence around it', () => {
    const r = parseResponse('I found 1 record. {"records":[{"fields":[]}]} Let me know.')
    expect(r?.records).toHaveLength(1)
  })

  it('refuses something that is not an answer at all, rather than half-reading it', () => {
    expect(parseResponse('I could not read that file.')).toBeNull()
    expect(parseResponse('{"something":"else"}')).toBeNull()
    expect(parseResponse('')).toBeNull()
  })

  it('refuses malformed JSON rather than throwing', () => {
    expect(parseResponse('{"records":[{"fields":')).toBeNull()
  })
})

describe('which values need a person', () => {
  it('lets a confidently-read value through', () => {
    expect(needsConfirming(field({ confidence: 1 }))).toBe(false)
  })

  it('holds back anything inferred rather than read', () => {
    // Writing an inferred value without confirmation is how a spreadsheet
    // import silently changes somebody's rate.
    expect(needsConfirming(field({ confidence: 0.6 }))).toBe(true)
  })

  it('holds back a confident value that came with a concern', () => {
    // 03/04/2026 read confidently as 3 April is still worth a glance.
    expect(needsConfirming(field({ confidence: 1, concern: 'day and month order is ambiguous' }))).toBe(true)
  })

  it('puts the threshold where an inference stops being a reading', () => {
    expect(needsConfirming(field({ confidence: CONFIDENT_ENOUGH }))).toBe(false)
    expect(needsConfirming(field({ confidence: CONFIDENT_ENOUGH - 0.01 }))).toBe(true)
  })
})

describe('what a person is told they have to do', () => {
  it('counts what needs a look rather than what was read', () => {
    // "23 rows imported" is a number nobody can act on.
    const records: ExtractedRecord[] = [
      { rowNumber: 1, fields: [field(), field({ field: 'name', confidence: 0.5 })], problems: [] },
      { rowNumber: 2, fields: [field(), field({ field: 'name' })], problems: [] },
    ]
    const r = reviewOf(records)
    expect(r.total).toBe(4)
    expect(r.toConfirm).toBe(1)
    expect(r.summary).toMatch(/need a look before anything is written/i)
  })

  it('says so plainly when nothing is ambiguous', () => {
    const r = reviewOf([{ rowNumber: 1, fields: [field(), field({ field: 'name' })], problems: [] }])
    expect(r.summary).toMatch(/nothing ambiguous/i)
  })

  it('says so plainly when nothing was read at all', () => {
    expect(reviewOf([]).summary).toMatch(/nothing was read/i)
  })

  it('surfaces the concern and where it was read from', () => {
    // A reviewer checking one row should not have to hunt for it.
    const r = reviewOf([{
      rowNumber: 1,
      fields: [field({ field: 'amount', concern: 'currency is ambiguous', foundIn: '1,250.00' })],
      problems: [],
    }])
    expect(r.concerns[0]).toEqual({
      field: 'amount', concern: 'currency is ambiguous', foundIn: '1,250.00',
    })
  })
})

describe('handing the result to the import engine', () => {
  it('produces the row shape the existing preview already understands', () => {
    // Deliberately reusing that path. Preview, per-row errors and the
    // idempotent write are right regardless of how the values were read.
    const rows = toRows(
      [{ rowNumber: 1, fields: [field(), field({ field: 'name', value: 'Manufacturing' })], problems: [] }],
      COST_CENTERS
    )
    expect(rows[0]['Code']).toBe('MFG-100')
    expect(rows[0]['Name']).toBe('Manufacturing')
  })

  it('leaves a field the reader did not find empty rather than inventing one', () => {
    // A blank is a fact somebody can act on. A plausible guess is a wrong
    // record that looks right.
    const rows = toRows([{ rowNumber: 1, fields: [field()], problems: [] }], COST_CENTERS)
    expect(rows[0]['GL account']).toBe('')
    expect(rows[0]['Name']).toBe('')
  })

  it('never writes the word null or undefined into a cell', () => {
    const rows = toRows(
      [{ rowNumber: 1, fields: [field({ field: 'glAccount', value: null })], problems: [] }],
      COST_CENTERS
    )
    expect(Object.values(rows[0])).not.toContain('null')
    expect(Object.values(rows[0])).not.toContain('undefined')
  })
})

describe('being honest about which reader ran', () => {
  it('reports whether the model path is available at all', () => {
    // A degraded result presented as a good one is the failure this whole
    // file exists to avoid.
    expect(typeof modelAvailable()).toBe('boolean')
    expect(modelAvailable()).toBe(Boolean(process.env.ANTHROPIC_API_KEY))
  })
})
