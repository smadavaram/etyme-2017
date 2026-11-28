import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DRAWS_NOTHING, BILL_NOT_SENT } from '@/lib/money/bill-state'

/**
 * Money's a15098ea1: a bill raised and never sent is owed by nobody on
 * every screen, through DRAWS_NOTHING. Ask Etyme's spend read the same
 * receipts through its own list, which still counted a raised, unsent
 * bill (ISSUED) as spend. It now reads money's list.
 */
const read = readFileSync(join(__dirname, '../../src/app/api/conversations/twin/read.ts'), 'utf8')

describe('Ask Etyme’s spend reads the bills the screens read', () => {
  it('Ask Etyme’s spend never counts a bill its supplier raised and has not sent', () => {
    // The one list every screen reads holds the raised, unsent status.
    expect(BILL_NOT_SENT).toContain('ISSUED')
    expect(DRAWS_NOTHING).toEqual(expect.arrayContaining([...BILL_NOT_SENT]))
    // Ask Etyme's spend filter is that list, not a copy of its own.
    expect(read).toMatch(/import \{ DRAWS_NOTHING \} from '@\/lib\/money\/bill-state'/)
    expect(read).toMatch(/const NOT_SPEND = \[\.\.\.DRAWS_NOTHING\]/)
    expect(read).not.toMatch(/const NOT_SPEND = \['/)
    expect(read).toMatch(/status: \{ notIn: NOT_SPEND \}/)
  })
})
