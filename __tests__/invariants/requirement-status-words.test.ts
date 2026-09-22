/**
 * A role says what it is in words, on both ends of the deal.
 *
 * The release walk of 2026-09-22 opened a supplier's Requirements list
 * and read `OPEN` and `FILLED` in chips — the database's own column,
 * printed at a recruiter, on a row the client three screens away reads
 * as "Published". CLAUDE.md: "Their words, not the system's... Never an
 * internal state name."
 *
 * The words live in one file (`app/dashboard/requirements/words`) so the
 * chip, the filter tab, the footer count and the role's own page cannot
 * drift apart, and so a status added to the schema fails a test here
 * rather than appearing raw on a screen.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { STATUS_WORDS, statusWord, statusWordLower } from '@/app/dashboard/requirements/words'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

const LIST = read('src/app/dashboard/requirements/page.tsx')
const DETAIL = read('src/app/dashboard/requirements/[id]/page.tsx')
const SCHEMA = read('prisma/schema.prisma')

describe('A role reads as words on a supplier’s list, never as its column', () => {

  it('a published role reads Published to the supplier, the same word the client reads', () => {
    expect(statusWord('OPEN')).toBe('Published')
  })

  it('a filled role reads Filled', () => {
    expect(statusWord('FILLED')).toBe('Filled')
  })

  it('a closed role reads Closed — finished, and never "Draft"', () => {
    expect(statusWord('CLOSED')).toBe('Closed')
    expect(statusWord('CLOSED')).not.toBe('Draft')
  })

  it('a role nobody has sent anywhere yet reads Draft', () => {
    expect(statusWord('DRAFT')).toBe('Draft')
  })

  it('a role the client called off reads Cancelled', () => {
    expect(statusWord('CANCELLED')).toBe('Cancelled')
  })

  it('the word fits inside a sentence as well as on a chip', () => {
    expect(`No ${statusWordLower('OPEN')} requirements.`).toBe('No published requirements.')
  })

  it('a status nobody has given a word to is shown as it stands rather than hidden', () => {
    // A blank where a value exists is worse than an ugly one: nobody
    // audits a row that says nothing. The test below is what stops this
    // branch being reached for a status the product actually writes.
    expect(statusWord('ON_HOLD')).toBe('ON_HOLD')
  })
})

describe('Every status a requirement can hold has a word somebody would say', () => {

  it('the schema names the statuses, and every one of them has a word here', () => {
    // Read the statuses off the model itself, so a status added to the
    // column fails this test on the commit that adds it rather than
    // appearing raw on a screen a release later.
    const model = SCHEMA.slice(SCHEMA.indexOf('model Requirement {'))
    const line = model.split('\n').find((l) => /^\s*status\s+String/.test(l))
    expect(line, 'Requirement.status is not where it was').toBeTruthy()
    const named = (line!.split('//')[1] ?? '')
      .split('·')
      .map((w) => w.trim())
      .filter((w) => /^[A-Z_]+$/.test(w))
    expect(named.length, 'the schema comment no longer lists the statuses').toBeGreaterThan(3)

    const haveWords = STATUS_WORDS.map(([s]) => s)
    for (const status of named) {
      expect(haveWords, `${status} has no word on the requirements list`).toContain(status)
    }
  })

  it('CANCELLED has a word too, though the schema comment leaves it out', () => {
    // POST /api/requisitions/:id/cancel writes CANCELLED and the comment
    // on the column does not mention it. The word is here either way;
    // the comment is the architect's to correct.
    expect(STATUS_WORDS.map(([s]) => s)).toContain('CANCELLED')
  })

  it('no two statuses share a word, so a filter means one thing', () => {
    const words = STATUS_WORDS.map(([, w]) => w)
    expect(new Set(words).size).toBe(words.length)
  })
})

describe('One vocabulary across the screens that show a role', () => {

  it('the requirements list prints no raw status at a reader', () => {
    for (const word of ['OPEN', 'FILLED', 'CLOSED', 'DRAFT', 'CANCELLED']) {
      // Between a closing angle bracket and the next tag, with no quote
      // and no brace in between — which is where rendered text sits,
      // and where a raw column would show. A comparison against the
      // string (`row.status === 'OPEN'`) is the code doing its job.
      expect(code(LIST), `the list prints ${word} at a reader`)
        .not.toMatch(new RegExp(`>[^<>\\n{'"]*\\b${word}\\b`))
    }
    expect(code(LIST)).not.toContain('{row.status}')
  })

  it('the filter tabs say the same word as the chip on the row', () => {
    expect(code(LIST)).toContain("label: statusWord('OPEN')")
    expect(code(LIST)).toContain("label: statusWord('FILLED')")
    expect(code(LIST)).toContain("label: statusWord('CLOSED')")
  })

  it('the role’s own page says the same word as the list it was opened from', () => {
    expect(code(DETAIL)).toContain('statusWord(s)')
    expect(code(DETAIL)).not.toContain("text: 'Open' }")
  })

  it('a supplier searching for "published" finds the published roles', () => {
    expect(code(LIST)).toContain('statusWordLower(row.status).includes(q)')
  })
})
