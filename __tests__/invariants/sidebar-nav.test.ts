import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The founder's own words: "apps on client side seems to be duplicating
 * candidates and people and too many organized links."
 *
 * Two real bugs, traced to this one file. This pins the fix so neither
 * comes back the next time somebody adds a nav item without reading the
 * section it lands in.
 */

const SOURCE = readFileSync(
  join(__dirname, '../../src/components/shell/sidebar.tsx'),
  'utf8'
)

function extractArray(name: string): string {
  const decl = `const ${name}: NavSection[] = [`
  const start = SOURCE.indexOf(decl)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  // Walk bracket depth from the opening `[` to its matching close. Start
  // the search past the declaration itself — "NavSection[]" carries its
  // own `[` earlier on the same line.
  let depth = 0
  let i = start + decl.length - 1
  const open = i
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '[') depth++
    if (SOURCE[i] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  return SOURCE.slice(open, i + 1)
}

describe('a client viewing People never sees the same human twice under two different names', () => {
  const clientNav = extractArray('CLIENT_NAV')

  it('has no nav item pointing at the raw, one-row-per-submission feed', () => {
    // The raw feed put every vendor's submission of the same person on
    // its own row with the name repeated — that IS the duplication the
    // founder saw. It still exists as a route; it just is not a front
    // door into the client's people register any more.
    const candidatesToRawFeed =
      /label:\s*'Candidates',\s*href:\s*'\/dashboard\/submissions'/.test(clientNav)
    expect(candidatesToRawFeed).toBe(false)
  })

  it('offers exactly one entry point for people, and it is the merged register', () => {
    const peopleMatches = clientNav.match(/href:\s*'\/dashboard\/people'/g) ?? []
    expect(peopleMatches.length).toBe(1)
  })
})

describe('the vendor Operate section reads as three named clusters, not one wall of links', () => {
  const vendorNav = extractArray('VENDOR_NAV')
  const operateStart = vendorNav.indexOf("label: 'Operate'")
  const growStart = vendorNav.indexOf("label: 'Grow'")
  const operate = vendorNav.slice(operateStart, growStart)

  it('gives every Operate item except the queue at the top a named group', () => {
    const itemLines = operate
      .split('\n')
      .filter((l) => /href:\s*'\/dashboard\//.test(l))
    // Loose ends is deliberately ungrouped — it is a queue, sitting above
    // the clusters, not inside one.
    const ungrouped = itemLines.filter((l) => !/group:\s*'/.test(l))
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0]).toContain('Loose ends')
  })

  it('keeps each group as one contiguous block, so its header prints once', () => {
    const groups = [...operate.matchAll(/group:\s*'([^']+)'/g)].map((m) => m[1])
    const seen = new Set<string>()
    let previous: string | null = null
    for (const g of groups) {
      if (g !== previous) {
        expect(
          seen.has(g),
          `group "${g}" reappears after another group started — its header would print twice`
        ).toBe(false)
        seen.add(g)
      }
      previous = g
    }
  })
})
