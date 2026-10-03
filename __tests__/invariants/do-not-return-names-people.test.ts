import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mergeKnown, matching, notKnownHere } from '@/app/api/blacklist/known'

/**
 * Nobody types a database id, and no form posts a field it knows is
 * empty.
 *
 * Two findings from the release walk, on two screens, with one cause.
 *
 * **F16** — `/dashboard/blacklist` → "Add somebody" asked for **Subject
 * type**, **Subject ID** and **Reason**. Typing a name gave `404
 * "Person not found"` and the page then showed nothing at all. The list
 * underneath printed the same ids back, truncated to `cm8k3p…9x2f`,
 * under a column headed "Subject" — a compliance record about a named
 * person that did not name them.
 *
 * **F26** — "Send this pack" on `/dashboard/outbound-pack` was enabled
 * with the email box empty, posted, and came back `422 "An email
 * address to send this to"`. The overtime reason box two screens over
 * has always had this right: its button is off until a reason is typed.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the do-not-return list names people', () => {
  it('keeps the strongest description of how somebody is known', () => {
    const merged = mergeKnown([
      { id: 'p1', name: 'Helena Marsh', note: 'Put forward by Veritan Talent', rank: 3 },
      { id: 'p1', name: 'Helena Marsh', note: 'On a placement here now', rank: 0 },
      { id: 'p2', name: 'Anders Lund', note: 'On this firm’s bench', rank: 2 },
    ])
    expect(merged).toEqual([
      { id: 'p2', name: 'Anders Lund', note: 'On this firm’s bench' },
      { id: 'p1', name: 'Helena Marsh', note: 'On a placement here now' },
    ])
  })

  it('drops a row with no name rather than offering a blank to click', () => {
    expect(mergeKnown([{ id: 'p1', name: '', note: 'Somewhere', rank: 1 }])).toEqual([])
  })

  it('finds somebody on three letters, in any case, and everybody on none', () => {
    const all = [
      { id: 'a', name: 'Helena Marsh', note: '' },
      { id: 'b', name: 'Chidi Okafor', note: '' },
    ]
    expect(matching(all, 'mar').map((s) => s.id)).toEqual(['a'])
    expect(matching(all, 'OKAF').map((s) => s.id)).toEqual(['b'])
    expect(matching(all, '   ').length).toBe(2)
  })

  it('says why a stranger cannot be barred, naming them and what to do instead', () => {
    const says = notKnownHere('PERSON', 'Aditi Ramaswamy', 'Northbend Athletic')
    expect(says).toContain('Aditi Ramaswamy')
    expect(says).toContain('Northbend Athletic')
    expect(says).toContain('never been put forward')
    expect(says).not.toMatch(/\b(NOT_OURS|403|targetId)\b/)
  })

  it('says the same about a firm, in the language of trading rather than placing', () => {
    const says = notKnownHere('COMPANY', 'Corveldt Partners', 'Northbend Athletic')
    expect(says).toContain('no dealings')
    expect(says).toContain('Corveldt Partners')
  })

  it('has no box on the screen asking a human being for an id', () => {
    // The comment above the picker quotes the old label on purpose, so
    // the labels the reader actually meets are what is checked.
    const page = read('src/app/dashboard/blacklist/page.tsx')
    expect(page).not.toContain('>Subject ID')
    expect(page).not.toContain("'Person ID'")
    expect(page).not.toContain("'Company ID'")
    expect(page).not.toMatch(/Subject ID \*/)
    // And the picker it was replaced with reads the route that decides
    // the same question the POST decides, so the form cannot offer
    // something the route refuses.
    expect(page).toContain('/api/blacklist/subjects')
  })

  it('prints a name on every row, and says so plainly where there is none', () => {
    const page = read('src/app/dashboard/blacklist/page.tsx')
    expect(page).not.toContain('truncateId')
    expect(page).toContain('No longer on Etyme')
  })
})

describe('a submit button is off until the route would accept it', () => {
  it('keeps "Send" off on a screening pack until an email address is typed', () => {
    const page = read('src/app/dashboard/outbound-pack/page.tsx')
    expect(page).toContain('disabled={busy || !email.trim()}')
  })

  it('keeps "Add to the list" off until there is somebody to bar and a reason', () => {
    const page = read('src/app/dashboard/blacklist/page.tsx')
    expect(page).toContain('disabled={submitting || !chosen || !reason.trim()}')
  })

  it('keeps the document request off until it has everything the route asks for', () => {
    // This one was already right, and is pinned so it stays right.
    const page = read('src/app/dashboard/packets/page.tsx')
    expect(page).toContain('!email.trim()')
  })
})
