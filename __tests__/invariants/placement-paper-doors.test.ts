import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Every required paper on a placement carries its door for the seat
 * reading it (the founder's tester, 2026-11-08), and the demo picker
 * counts no days it cannot keep true.
 */
describe('a placement’s papers carry their doors', () => {
  it('the placement route reads each paper’s door through regulatory’s paperDoorsForLine, for the caller’s own company and permissions', () => {
    const src = readFileSync('src/app/api/placements/[id]/route.ts', 'utf8')
    expect(src).toContain("from '@/lib/document-stages/arrived-papers'")
    expect(src).toMatch(/paperDoorsForLine\(\{\s*contractId: placement\.id,\s*caller: \{ companyId: mine, permissions: caller\.permissions \}/)
    expect(src).toMatch(/cover: checklist\.cover\.outcome,\s*paperDoors,/)
  })

  it('the placement page draws the door beside each paper and, after it acts, says the route’s sentence and reads itself again', () => {
    const src = readFileSync('src/app/dashboard/placements/[id]/page.tsx', 'utf8')
    expect(src).toContain("import { PaperDoorButtons } from '@/app/dashboard/documents/paper-doors'")
    expect(src).toMatch(/<PaperDoorButtons doors=\{doors\} onDone=\{\(says\) => \{ setPaperSays\(says\); setReads\(\(n\) => n \+ 1\) \}\} \/>/)
    expect(src).toContain('[id, session.company?.kind, session.company?.name, reads]')
  })

  it('the demo picker never says how many days a supplier’s insurance has left, because the count goes stale the day after seeding', () => {
    const src = readFileSync('src/app/demo/seats.ts', 'utf8')
    expect(src).not.toMatch(/runs out in \d+ days/)
  })
})
