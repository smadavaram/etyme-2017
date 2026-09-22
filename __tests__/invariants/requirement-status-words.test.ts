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
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { STATUS_WORDS, statusWord, statusWordLower } from '@/app/dashboard/requirements/words'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

/** Every TypeScript file under src, once. */
function sources(dir = 'src', out: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = join(dir, entry)
    if (statSync(join(process.cwd(), rel)).isDirectory()) sources(rel, out)
    else if (/\.tsx?$/.test(rel)) out.push(rel)
  }
  return out
}

/**
 * The values the product actually writes into one column of `Requirement`.
 *
 * Read off the writes themselves rather than off a list somebody keeps,
 * because a list somebody keeps is the thing that went wrong. A window
 * runs from a `requirement.create/update/upsert` call to the next
 * database call, so the submission update three lines below an award does
 * not get read as a requirement status.
 */
function written(field: 'status' | 'approvalState'): Map<string, string> {
  const call = /\b(?:prisma|db|tx)\.requirement\.(?:create|update|updateMany|upsert)\(/g
  const nextCall = /\b(?:prisma|db|tx)\.\w+\./g
  const found = new Map<string, string>()
  for (const file of sources()) {
    const src = read(file)
    call.lastIndex = 0
    let at: RegExpExecArray | null
    while ((at = call.exec(src))) {
      const from = at.index + at[0].length
      nextCall.lastIndex = from
      const next = nextCall.exec(src)
      const window = src.slice(from, Math.min(next ? next.index : src.length, from + 800))
      const assignment = new RegExp(`\\b${field}:\\s*'([A-Z_]+)'`, 'g')
      let value: RegExpExecArray | null
      while ((value = assignment.exec(window))) {
        if (!found.has(value[1])) found.set(value[1], file)
      }
    }
  }
  return found
}

/** The values named in the trailing comment on a column of `Requirement`. */
function documented(field: string): string[] {
  const model = SCHEMA.slice(SCHEMA.indexOf('model Requirement {'))
  const line = model.split('\n').find((l) => new RegExp(`^\\s*${field}\\s+String`).test(l))
  expect(line, `Requirement.${field} is not where it was`).toBeTruthy()
  return (line!.split('//')[1] ?? '')
    .split('·')
    .map((w) => w.trim())
    .filter((w) => /^[A-Z_]+$/.test(w))
}

/** The members of a union type declared on one line, e.g. `nextState:`. */
function unionOf(src: string, field: string): string[] {
  const line = src.split('\n').find((l) => new RegExp(`^\\s*${field}:\\s*'`).test(l))
  expect(line, `${field} is no longer declared as a union of literals`).toBeTruthy()
  return [...line!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
}

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
    const named = documented('status')
    expect(named.length, 'the schema comment no longer lists the statuses').toBeGreaterThan(3)

    const haveWords = STATUS_WORDS.map(([s]) => s)
    for (const status of named) {
      expect(haveWords, `${status} has no word on the requirements list`).toContain(status)
    }
  })

  it('a role the client called off has a word, and the schema comment names it too', () => {
    // POST /api/requisitions/:id/cancel writes CANCELLED. The word has
    // always been here; the comment left it out until 2026-09-22, and the
    // two tests below are what stop that happening a third time.
    expect(STATUS_WORDS.map(([s]) => s)).toContain('CANCELLED')
    expect(documented('status')).toContain('CANCELLED')
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

/**
 * `status` and `approvalState` are strings with a documented value set
 * rather than enums, so the comment beside each column is the only place
 * the set is written down — and it has been wrong twice. `CANCELLED` was
 * missing from one and `CHANGES_REQUESTED` from the other, which is
 * exactly the pair `stageOf` needs to tell a called-off role and a role
 * handed back for changes apart from a role nobody has raised. It falls
 * through to DRAFT for anything it does not name, so a comment that lies
 * is a screen that lies.
 *
 * The decision not to make them enums is recorded beside `status` in the
 * schema, and it rests on these two tests existing: an enum would not
 * have caught either drift — both values were legal — and it would have
 * bought a migration against a paying client's data instead.
 */
describe('The comment beside a string column is the only place its values are written down', () => {

  it('the comment on Requirement.status names every status the product writes', () => {
    const named = documented('status')
    for (const [value, file] of written('status')) {
      expect(named, `${file} writes status ${value} and the schema comment does not name it`)
        .toContain(value)
    }
  })

  it('the comment on Requirement.status names the two statuses the approval chain sets', () => {
    // An approved chain opens the role; a chain that closes it closes the
    // role. Neither is a literal at the write site — the route sets
    // whatever `advanceApproval` returns — so the union is where they are.
    const named = documented('status')
    for (const value of unionOf(read('src/lib/requisition-approval.ts'), 'nextStatus')) {
      expect(named, `the approval chain sets status ${value} and the schema comment does not name it`)
        .toContain(value)
    }
  })

  it('the comment on Requirement.approvalState names every state a desk can leave it in', () => {
    const named = documented('approvalState')
    const chain = unionOf(read('src/lib/requisition-approval.ts'), 'nextState')
    for (const value of [...chain, ...written('approvalState').keys()]) {
      expect(named, `approvalState ${value} is written and the schema comment does not name it`)
        .toContain(value)
    }
  })

  it('a desk sending a role back for changes is named in the comment, not only in the code', () => {
    // The drift that cost the walk: lib/requisition-approval returns
    // CHANGES_REQUESTED, the approve route writes it, the chain screen
    // reads it as "sent back", and the schema said the column held five
    // values, none of them this one.
    expect(documented('approvalState')).toContain('CHANGES_REQUESTED')
  })

  it('every state named in the comments is one the stage rule knows what to do with', () => {
    // The other direction: a value written down but unhandled reads as a
    // draft on every list, which is the branch stageOf falls through to.
    const stage = read('src/lib/requisition-stage.ts')
    const handled = new Set([...stage.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]))
    for (const value of documented('status')) {
      if (value === 'DRAFT') continue // the fall-through branch is DRAFT itself
      expect(handled, `stageOf does not name status ${value}, so it reads as a draft`)
        .toContain(value)
    }
    for (const value of documented('approvalState')) {
      if (['DRAFT', 'APPROVED', 'AUTO_APPROVED', 'REJECTED'].includes(value)) continue
      expect(handled, `stageOf does not name approvalState ${value}, so it reads as a draft`)
        .toContain(value)
    }
  })
})
