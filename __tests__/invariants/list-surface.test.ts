import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { globSync } from 'glob'

/**
 * "All tables must have feed and table options, like the contractor
 * table." One component gives every list both, from one description of
 * its rows, and remembers which the reader chose.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const pages = globSync('src/app/dashboard/**/page.tsx')

describe('every list, two ways', () => {
  it('no page draws a bare table any more — a table comes with its feed, or the page has its own toggle', () => {
    const bare = pages.filter((p) => {
      const src = read(p)
      return src.includes("from '@/components/data-table'") && !src.includes('<ViewToggle')
    })
    expect(bare, `these show a table with no feed:\n  ${bare.join('\n  ')}`).toEqual([])
  })
  it('a page that describes its rows once gets the table and the feed from the same columns', () => {
    const src = read('src/components/list-surface.tsx')
    expect(src).toContain("return { title: cols[0], subtitle: cols[1], rest: cols.slice(2) }")
    expect(src).toContain('<ViewToggle view={view} onChange={choose} />')
    expect(src).toContain("view === 'table'")
  })
  it('the reader’s choice is remembered per list, on their device, and never breaks the page when storage is blocked', () => {
    const src = read('src/components/list-surface.tsx')
    expect(src).toContain('window.localStorage.getItem(key)')
    // What matters is that every touch of storage is inside a try, not
    // how it is laid out. This pinned the whole statement on one line
    // and failed the first time it was reformatted, which taught
    // nothing about whether the page still survives blocked storage.
    for (const call of ['getItem(key)', 'setItem(key, v)']) {
      const at = src.indexOf(call)
      expect(at, `${call} is not there at all`).toBeGreaterThan(-1)
      const before = src.slice(0, at)
      const after = src.slice(at)
      expect(before.lastIndexOf('try {'), `${call} is not inside a try`).toBeGreaterThan(before.lastIndexOf('catch {}'))
      expect(after.indexOf('catch {}'), `${call} has no catch after it`).toBeGreaterThan(-1)
    }
  })
  it('at least a dozen list pages use it', () => {
    const users = pages.filter((p) => read(p).includes("from '@/components/list-surface'"))
    expect(users.length).toBeGreaterThanOrEqual(12)
  })
})
