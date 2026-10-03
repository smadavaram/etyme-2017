import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * Two things a browser walk of the placement page found about how the
 * pay line sits in its card, at 1280px and at 390px.
 */

const page = readFileSync('src/app/dashboard/placements/[id]/page.tsx', 'utf8')

describe("the placement's pay line", () => {
  it('each overtime choice fits its card at any width: full width of the card, never a fixed width wider than a phone', () => {
    const selects = [...page.matchAll(/<select[\s\S]*?className="([^"]+)"/g)].map((m) => m[1])
    expect(selects.length).toBe(2)
    for (const c of selects) {
      expect(c).toMatch(/\bw-full\b/)
      expect(c).toMatch(/\bmin-w-0\b/)
      expect(c).not.toMatch(/max-w-\[\d+px\]/)
    }
    // A grid item is as wide as its widest child unless told otherwise.
    expect(page).toContain('<div className="card min-w-0">')
  })

  it('each Change link sits on its own line under its sentence, not at the end of it', () => {
    const changes = [...page.matchAll(/<button[^>]*onClick=\{\(\) => setOpen\(true\)\}>\s*Change\s*<\/button>/g)]
    expect(changes.length).toBe(2)
    for (const m of changes) {
      expect(m[0]).toMatch(/\bblock\b/)
      expect(m[0]).not.toMatch(/\bml-2\b/)
      // Not inside the sentence's paragraph.
      const before = page.slice(0, m.index)
      expect(before.lastIndexOf('</p>')).toBeGreaterThan(before.lastIndexOf('<p>'))
    }
  })
})
