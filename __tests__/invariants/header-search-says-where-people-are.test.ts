import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { noPageMatchSays, reachablePagesFor, type SaidPart } from '@/components/shell/header'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The header's search box finds pages, and says so (fix list, 2026-11-15:
 * a tester typed a person's name, read "No results" and thought the
 * person was missing). Where no page matches, it says where a person or a
 * company is found: the reader's own lists, by the names its menu gives
 * them, each a link, and never a list the reader's seat cannot open. And
 * the box is empty on every new page, however the reader got there.
 */

const role = (kind: 'VENDOR' | 'CLIENT', name: string) => rolesFor(kind).find((r) => r.name === name)!.permissions
const pages = (kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT', permissions: readonly string[]) =>
  reachablePagesFor(kind, false, { worker: false, permissions })
const sentence = (parts: SaidPart[]) => parts.map((p) => (typeof p === 'string' ? p : p.label)).join('')
const links = (parts: SaidPart[]) => parts.filter((p): p is { label: string; href: string } => typeof p !== 'string')

describe('what the search box says when no page matches', () => {
  it('a supplier who types a name no page has is told to search on Candidates or Companies, each a link to its list', () => {
    const said = noPageMatchSays('Dana Whitlock', pages('VENDOR', role('VENDOR', 'Recruiter')))
    expect(sentence(said)).toBe('No page matches “Dana Whitlock”. To find a person or a company, search on Candidates or Companies.')
    expect(links(said)).toEqual([
      { label: 'Candidates', href: '/dashboard/consultants' },
      { label: 'Companies', href: '/dashboard/companies' },
    ])
  })

  it('a client is told to search on Candidates or Suppliers, because a client keeps suppliers and has no Companies page', () => {
    const said = noPageMatchSays('Harborline', pages('CLIENT', role('CLIENT', 'Program Manager')))
    expect(sentence(said)).toBe('No page matches “Harborline”. To find a person or a company, search on Candidates or Suppliers.')
    expect(links(said).map((l) => l.href)).toEqual(['/dashboard/people', '/dashboard/suppliers'])
  })

  it('an MSP, which keeps no candidates, is told to search on Companies for a company and nothing about a person', () => {
    const said = noPageMatchSays('Northwind', pages('MSP', role('VENDOR', 'Owner')))
    expect(sentence(said)).toBe('No page matches “Northwind”. To find a company, search on Companies.')
  })

  it('a seat that cannot open Candidates is never pointed at it: Accounts Receivable is told about Companies alone', () => {
    const said = noPageMatchSays('Dana', pages('VENDOR', role('VENDOR', 'Accounts Receivable')))
    expect(sentence(said)).toBe('No page matches “Dana”. To find a company, search on Companies.')
    expect(links(said).map((l) => l.label)).toEqual(['Companies'])
  })

  it('a seat with neither list on its menu reads only that no page matches', () => {
    const said = noPageMatchSays('Dana', pages('CLIENT', role('CLIENT', 'Member')))
    expect(sentence(said)).toBe('No page matches “Dana”.')
    expect(links(said)).toEqual([])
  })

  it('the typed words are said back without the spaces around them', () => {
    expect(sentence(noPageMatchSays('  Dana  ', []))).toBe('No page matches “Dana”.')
  })
})

describe('the search box on a new page', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/shell/header.tsx'), 'utf8')

  it('the typed words are cleared whenever the page changes, not only when a result is picked', () => {
    expect(src).toMatch(/const pathname = usePathname\(\)\s*\n\s*useEffect\(\(\) => \{\s*\n\s*setSearchQuery\(''\)\s*\n\s*setSearchFocused\(false\)\s*\n\s*\}, \[pathname\]\)/)
  })

  it('the empty result is the sentence that names the lists, and the old "No results" line is gone', () => {
    expect(src).toContain('noPageMatchSays(searchQuery, reachablePages)')
    expect(src).not.toContain('No results for')
  })
})
