import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DocMatrix, matrixTable } from '../../scripts/simulate/stages/regulatory/doc-matrix'
import { degreeSaid, printedFields, DEGREE_KIND } from '../../scripts/simulate/stages/regulatory/education'

/** The education cases the founder's decision names (2026-11-03), in the document matrix. */
const src = readFileSync(join(process.cwd(), 'scripts/simulate/stages/regulatory/education.ts'), 'utf8')

describe('the documents matrix carries the education cases', () => {
  it('the seven education cases are each walked through the real routes as the real seats', () => {
    for (const rule of [
      'every field right',
      'warned: a graduation year that has not come yet',
      'warned: a year the résumé contradicts',
      'The certificate is in the name Anita Desai',
      'warned: the same file already filed for somebody else',
      'WES’s verification recorded verbatim',
      'told in words',
    ]) expect(src, rule).toContain(rule)
    expect(src).toContain("'/api/compliance/verifications'")
    expect(src).toContain('examineAt(')
    expect(src).not.toMatch(/ctx\.read\.[a-zA-Z]+\.(create|update|upsert|delete)/)
    expect(readFileSync(join(process.cwd(), 'scripts/simulate/stages/regulatory/both-ways.ts'), 'utf8')).toContain("['education', () => education(")
  })

  it('a warned degree is counted as held, never as refused, because nothing about a degree stops a start', () => {
    const m = new DocMatrix()
    m.held(DEGREE_KIND, 'fill a form from fields', 'The certificate says 2028, which has not come yet (it is 2026).', true, 'warned: a graduation year that has not come yet', /has not come yet/)
    const row = [...m.rows.values()][0]
    expect(row.counts).toEqual({ accepted: 0, held: 1, 'sent back': 0, refused: 0 })
    expect(matrixTable(m)[2]).toContain('Degree certificate')
  })

  it('the sentence beside the paper is read from the route’s own answer, and HR records what is printed', () => {
    expect(degreeSaid({ ok: true, json: { data: { degree: { says: 'The certificate says 2028…' } } } })).toBe('The certificate says 2028…')
    expect(degreeSaid({ ok: true, json: { data: {} } })).toBeNull()
    expect(printedFields({ name: 'Priya Raman', school: 'University of Pune', qualification: 'B.E.', year: 2016 }))
      .toEqual({ institution: 'University of Pune', qualification: 'B.E.', nameOnDocument: 'Priya Raman', year: '2016' })
  })
})
