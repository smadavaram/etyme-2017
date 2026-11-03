import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONSULTANTS_PAGE, consultantsPageUrl, pagesAfterFirst } from '@/lib/consultant-portfolio/list-pages'

/**
 * The third screen walk, 2026-11-03, S1: Priyanka, just added at
 * Brightmoor, was missing from Consultants ("25 of 32 shown", search said
 * nothing matched, Next disabled), and no screen drew her sign-in line,
 * because she was listed and not placed.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const page = read('src/app/dashboard/consultants/page.tsx')
const route = read('src/app/api/consultants/route.ts')
const bench = read('src/app/dashboard/bench/page.tsx')

describe('a person a firm adds appears on Consultants at once, and the count, the search and the paging agree', () => {
  it('Consultants reads the list a hundred at a time, the most the route serves', () => {
    expect(CONSULTANTS_PAGE).toBe(100)
    expect(route).toMatch(/Math\.min\(100,/)
    expect(consultantsPageUrl(1)).toBe('/api/consultants?limit=100&page=1')
  })

  it('every page after the first is read, so a firm of 32 or of 2,000 holds every record before it counts, searches or pages', () => {
    expect(pagesAfterFirst(1)).toEqual([])
    expect(pagesAfterFirst(3)).toEqual([2, 3])
    expect(pagesAfterFirst(20)).toHaveLength(19)
  })

  it('a route that does not say how many pages it has is read as one page, never guessed', () => {
    expect(pagesAfterFirst(undefined)).toEqual([])
    expect(pagesAfterFirst('3')).toEqual([])
  })

  it('the page reads the first page and every page after it, and searches and pages only over what it read', () => {
    expect(page).toMatch(/fetch\(consultantsPageUrl\(1\)\)/)
    expect(page).toMatch(/pagesAfterFirst\(body\.data\?\.pagination\?\.pages\)\.map/)
    expect(page).not.toMatch(/fetch\('\/api\/consultants'\)/)
  })

  it('adding somebody reads the list again, so they are on it the moment the ask goes', () => {
    expect(page).toMatch(/onCreated=\{\(says\) => \{ setAdded\(says\); fetchConsultants\(\) \}\}/)
  })

  it('two people of one name keep their order between pages, so nobody is skipped or read twice', () => {
    expect(route).toMatch(/orderBy: \[\{ person: \{ name: 'asc' \} \}, \{ id: 'asc' \}\]/)
  })
})

describe('the sign-in line is drawn for a person the firm lists but has not placed', () => {
  it('the Consultants drawer draws the sign-in line for every person on the list, placed or not', () => {
    expect(page).toMatch(/<SignInLink personId=\{consultant\.personId\}/)
  })

  it('on Bench, somebody asked and not answered gets the sign-in line beside Resend and Copy link', () => {
    expect(bench).toMatch(/\{a\.consent === 'INVITED' && <SignInLink personId=\{a\.personId\}/)
    expect(bench).toMatch(/personId: r\.personId, name: r\.name, consent: r\.consent/)
  })
})
