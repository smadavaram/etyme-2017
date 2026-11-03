import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * Two things a browser walk of the placement page found about how the
 * pay line sits in its card, at 1280px and at 390px.
 */

const page = readFileSync('src/app/dashboard/placements/[id]/page.tsx', 'utf8')

describe("the placement's pay line", () => {
  it('each overtime choice fits its card at any width: full width of the card, never a fixed width wider than a phone', () => {
    // Drawn through the shared form set's Select since 2026-10-10.
    const selects = [...page.matchAll(/<Select[\s\S]*?className="([^"]+)"/g)].map((m) => m[1])
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

  it('the placement page draws the Activate panel and the pay-line panel, each drawing only what its route allows', () => {
    expect(page).toContain("import { ActivatePanel } from '@/app/dashboard/contracts/activate-panel'")
    expect(page).toContain("import { PayLinePanel } from '@/app/dashboard/contracts/pay-line-panel'")
    // Activate sits in Station 5, after the paperwork chips; the pay line in
    // Station 4, after the two rates.
    const s4 = page.indexOf('<Station n={4}')
    const s5 = page.indexOf('n={5}')
    const s6 = page.indexOf('n={6}')
    const payLine = page.indexOf('<PayLinePanel contractId={p.id} />')
    const activate = page.indexOf('<ActivatePanel contractId={p.id} />')
    expect(payLine).toBeGreaterThan(s4)
    expect(payLine).toBeLessThan(s5)
    expect(activate).toBeGreaterThan(page.indexOf('supplierCover.map', s5))
    expect(activate).toBeLessThan(s6)
    // Each panel asks its own route and draws from the answer: the pay line
    // draws nothing unless the route answered with something to say, and
    // Activate draws from the start's own preflight.
    const payPanel = readFileSync('src/app/dashboard/contracts/pay-line-panel.tsx', 'utf8')
    expect(payPanel).toContain('/pay-line`)')
    expect(payPanel).toContain('if (live && res.ok) setView(body.data)')
    expect(payPanel).toContain('if (!view?.says) return null')
    const activatePanel = readFileSync('src/app/dashboard/contracts/activate-panel.tsx', 'utf8')
    expect(activatePanel).toContain('/activate`)')
    expect(activatePanel).toContain('res.ok ? viewBefore(body.data as StartPreflight) : viewBefore(null)')
  })
})
