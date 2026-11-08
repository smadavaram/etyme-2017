import { describe, it, expect } from 'vitest'
import { titleOf, TITLE_LENGTH } from '@/lib/ask-etyme-thread'

describe('A kept Ask Etyme conversation is titled by its first question (2026-11-08)', () => {
  it('a short question is the title, word for word, on one line', () => {
    expect(titleOf('  Which bills\n are unpaid? ')).toBe('Which bills are unpaid?')
  })

  it('a long question is cut at a word with an ellipsis and never runs past the title length', () => {
    const q = 'Which of the weeks Helena Marsh filed in October are signed by Northbend Athletic and not yet billed by us'
    const t = titleOf(q)!
    expect(t.length).toBeLessThanOrEqual(TITLE_LENGTH)
    expect(t.endsWith('…')).toBe(true)
    expect(q.startsWith(t.slice(0, -1))).toBe(true)
    expect(t.slice(0, -1).endsWith(' ')).toBe(false)
  })

  it('a question with no words gives no title', () => {
    expect(titleOf('   \n ')).toBeNull()
  })
})
