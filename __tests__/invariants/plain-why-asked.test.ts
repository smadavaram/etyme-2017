import { describe, it, expect } from 'vitest'
import { outstandingItems, plainAsked } from '@/lib/document-request'
import { SHAPE_SAYS } from '@/lib/document-requirements'

/**
 * Helena Marsh's paperwork page, walked by a tester on 2026-10-03, said
 * her non-disclosure agreement was asked because of "The default for a
 * W2 start". A worker reads why she is asked, not the name of a table.
 */

describe('why a worker is asked for a document', () => {
  it('tells an employee her non-disclosure agreement is asked of every employee, never "the default for a W2 start"', () => {
    const [nda] = outstandingItems({
      items: [{
        key: 'NDA', label: 'Non-disclosure agreement', required: true, owedBy: 'WORKER', owedByName: null,
        blocks: false, waived: false, waivedSays: null, says: SHAPE_SAYS.W2,
      }],
      owedBy: ['WORKER'],
      on: new Date('2026-10-03T00:00:00Z'),
    })
    expect(nda.asked).toBe('asked of every employee as standard paperwork')
    expect(nda.asked).not.toMatch(/default|W2/)
  })

  it('says every default reason without the words default, W2 or corp-to-corp', () => {
    for (const words of Object.values(SHAPE_SAYS)) {
      expect(plainAsked(words)).not.toMatch(/default|W2|corp-to-corp/i)
    }
  })

  it('leaves a reason that already names who asked exactly as it was', () => {
    const said = 'required by Northbend Athletic’s order PO-2026-8QMD'
    expect(plainAsked(said)).toBe(said)
  })
})
