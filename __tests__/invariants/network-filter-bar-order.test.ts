import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NETWORK_FILTERS, filterOrderFor } from '@/lib/network-filters'

/**
 * The shared Network filter bar draws its chips in the reader's order, so
 * the client's Candidates page (which reads Favorites first) can use it
 * rather than a copy of its own. And the menu's note on that page says
 * what the page does: it opens on the first filter with rows.
 */
const root = join(__dirname, '../..')
const bar = readFileSync(join(root, 'src/components/network-view.tsx'), 'utf8')
const nav = readFileSync(join(root, 'src/lib/nav-table.ts'), 'utf8')

describe('the Network filter bar follows the reader’s order', () => {
  it('the shared filter bar takes the reader’s order of the chips, and keeps the fixed order where none is given', () => {
    expect(bar).toContain('order = NETWORK_FILTERS')
    expect(bar).toContain('order?: readonly NetworkFilter[]')
    expect(bar).toContain('options={order.filter((f) => counts[f] !== undefined)')
  })

  it('a client’s order puts Favorites first, and every other reader keeps the fixed order', () => {
    expect(filterOrderFor('CLIENT')[0]).toBe('FAVORITES')
    expect([...filterOrderFor('CLIENT')].sort()).toEqual([...NETWORK_FILTERS].sort())
  })

  it('the menu’s note on the client’s Candidates says it opens on the first filter with rows, not on Everyone', () => {
    expect(nav).not.toContain('Opens on\n  // Everyone')
    expect(nav).toContain('the first filter in the reader’s order that has rows, Favorites first'.replace('’', "'"))
  })
})
