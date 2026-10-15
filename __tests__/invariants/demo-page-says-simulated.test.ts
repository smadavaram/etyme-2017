import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The founder, 2026-09-29: the demo page must say, where nobody can miss
 * it, that the companies and people on it are not real — so a visitor
 * knows they are looking at simulated data before they read a single name.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the demo page says it is simulated data', () => {
  const page = read('src/app/demo/page.tsx')
  const doors = read('src/app/demo/desk-picker.tsx')

  it('says under the heading, before any company is named, that these are demo companies and not customers', () => {
    // Since the one-screen drawing (2026-10-15) the note is the one line
    // under "Pick a company and a role".
    const note = page.indexOf('Demo companies, not customers.')
    expect(note, 'the note is on the page').toBeGreaterThan(-1)
    expect(page).toContain('Nothing you change touches anything real.')
    // Before the first door; no company is named in the page itself.
    expect(note).toBeLessThan(page.indexOf('<ProgramDoors'))
    expect(page).not.toContain('Northbend Athletic')
  })

  it('marks the page as a demo once, with the chip the product uses, beside that line', () => {
    expect(page).toContain("import { DemoChip } from '@/components/shell/demo-chip'")
    expect(page.match(/<DemoChip \/>/g)?.length).toBe(1)
    expect(page.indexOf('<DemoChip />')).toBeLessThan(page.indexOf('Demo companies, not customers.'))
    // The doors carry no chip of their own: one line says it for the page.
    expect(doors).not.toContain('<DemoChip')
  })
})
