import { describe, it, expect } from 'vitest'
import { degreeNotWhatTheJobAsks } from '@/lib/notify/degree-and-start'

/**
 * Walk 8, item 7 (2026-11-09): HR read "this certificate is no
 * qualification printed" beside a degree that showed no qualification at
 * all. The sentence is conversation's; when the paper is read is
 * regulatory's. The words read right whatever the reader passes for
 * "nothing printed": nothing, an empty string, or the placeholder it
 * passed before.
 */
describe('a degree that shows no qualification', () => {
  it('a degree with no qualification on the record is said as nothing recorded, never as “this certificate is no qualification printed”', () => {
    const want = 'No qualification is recorded for this certificate, and the ICU nurse job asks for Bachelor of Science in Nursing. Ask for the right certificate, or send it back.'
    for (const onPaper of [undefined, null, '', '  ', 'no qualification printed', 'No qualification']) {
      const said = degreeNotWhatTheJobAsks({ jobTitle: 'ICU nurse', required: 'Bachelor of Science in Nursing', onPaper })
      expect(said).toBe(want)
      expect(said).not.toMatch(/is no qualification/)
    }
  })

  it('a degree that shows another qualification still names both, in the words HR already reads', () => {
    expect(degreeNotWhatTheJobAsks({ jobTitle: 'ICU nurse', required: 'Bachelor of Science in Nursing', onPaper: 'Bachelor of Arts in History' }))
      .toBe('The ICU nurse job asks for Bachelor of Science in Nursing; this certificate is Bachelor of Arts in History. Ask for the right certificate, or send it back.')
  })
})
