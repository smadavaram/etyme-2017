import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * A placement page shows the weeks its bill was priced on, wherever in the
 * chain the worker filed them (the founder's tester, 2026-11-08: Helena
 * Marsh's placement at Computer Systems read "No weeks filed yet" beside
 * 200 hours billed).
 */
describe('a placement shows the weeks filed at the bottom rung', () => {
  it('a placement page reads its weeks through money’s one reader, never the weeks hanging on its own line', () => {
    const src = readFileSync('src/app/api/placements/[id]/route.ts', 'utf8')
    expect(src).toContain('where: await weeksWhere([placement.id])')
    expect(src).not.toContain('placement.timesheets')
  })

})
