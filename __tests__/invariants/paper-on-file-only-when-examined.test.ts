import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paperWord, waitsToBeExamined } from '@/lib/document-request'

/**
 * The second screen walk (2026-11-03): Paperwork said "On file" for a
 * paper nobody examined. A paper that arrived reads as arrived; "On file"
 * waits for an acceptance or a provider's verdict on the record.
 */
describe('Paperwork says a paper is on file only once somebody examined it', () => {
  it('a paper that arrived and nobody examined reads "Arrived, not examined", never "On file"', () => {
    expect(paperWord({ status: 'UPLOADED', examinedAt: null })).toBe('Arrived, not examined')
    expect(paperWord({ status: 'SIGNED', examinedAt: null })).toBe('Signed, not examined')
    expect(paperWord({ status: 'KEPT', examinedAt: null })).toBe('On file, not examined')
    expect(waitsToBeExamined({ status: 'UPLOADED' })).toBe(true)
  })

  it('a paper reads "On file" after an acceptance or a provider’s verdict is on the record', () => {
    expect(paperWord({ status: 'UPLOADED', examinedAt: '2026-11-02T10:00:00Z' })).toBe('On file')
    expect(paperWord({ status: 'UPLOADED', verdictRecorded: true })).toBe('On file')
    expect(paperWord({ status: 'SIGNED', examinedAt: new Date() })).toBe('Signed and accepted')
    expect(waitsToBeExamined({ status: 'UPLOADED', examinedAt: new Date() })).toBe(false)
  })

  it('a paper still asked for keeps its own word', () => {
    expect(paperWord({ status: 'SENT' })).toBe('Asked for')
    expect(paperWord({ status: 'PENDING' })).toBe('Not asked yet')
  })

  it('the Paperwork screen draws the chip from what is on the record, and an unexamined paper is never green', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/documents/page.tsx'), 'utf8')
    expect(page).toContain('{paperWord(r)}')
    expect(page).not.toContain('{statusWord(r.status)}')
    expect(page).toMatch(/waitsToBeExamined\(r\) \? 'attention'/)
  })
})
