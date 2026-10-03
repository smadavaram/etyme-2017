import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * What the alumni page says before it knows anything.
 *
 * The architect built a proper denied state, which took the literal
 * ellipsis off a refused caller's screen — and it survived for a
 * *seated* one as a loading state. `data?.client.name ?? '…'` meant a
 * program manager opening her own alumni page read "Institutional
 * memory at … ." until the fetch returned, and the heading above it
 * read "0 people have worked here", which is not a placeholder but a
 * wrong number about her own program.
 *
 * Loading is its own state, not a half-drawn heading.
 *
 * Checked at source, in the style of my-work-papers.test.ts, because
 * the behavior lives in a client component with no route handler to
 * call.
 */

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/alumni/page.tsx'), 'utf8')

describe('The alumni page before the answer is in', () => {

  it('a page withholds a sentence about a company until it knows the company’s name, rather than printing a placeholder in its place', () => {
    // The placeholder, gone. No ellipsis stands in for a company name.
    expect(PAGE).not.toContain("data?.client.name ?? '…'")
    expect(PAGE).not.toMatch(/Institutional memory at \{[^}]*\?\?/)

    // The sentence is drawn only where there is a name to put in it.
    expect(PAGE).toContain('const clientName = data?.client?.name ?? null')
    expect(PAGE).toMatch(/\{clientName && \(/)
    expect(PAGE).toContain('Institutional memory at {clientName}')
  })

  it('a heading does not count somebody’s workforce before it has been told the number', () => {
    // "0 people have worked here" during the fetch is a wrong number
    // about the reader's own program, not an empty state.
    expect(PAGE).toMatch(/\{data \? \(/)
    const head = PAGE.slice(PAGE.indexOf('page-head'), PAGE.indexOf('{/* Stats */}'))
    expect(head).toContain('people have')
    expect(head).toContain('{data ? (')
    // The count sits inside the branch that has data, not outside it.
    expect(head.indexOf('{data ? (')).toBeLessThan(head.indexOf('people have'))
  })

  it('the section it belongs to is named while it loads, because a label asserts nothing', () => {
    // The eyebrow says where the reader is. It is true before any fetch
    // returns, so it stays, and the page says plainly what it is doing.
    const head = PAGE.slice(PAGE.indexOf('page-head'), PAGE.indexOf('{/* Stats */}'))
    expect(head).toContain('<p className="eyebrow">Program</p>')
    expect(head.indexOf('eyebrow')).toBeLessThan(head.indexOf('{data ? ('))
    expect(head).toContain('Reading everyone who has worked here…')
  })
})
