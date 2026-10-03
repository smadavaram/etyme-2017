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

  it('says at the top, before any company is named, that everything on it is made up', () => {
    const note = page.indexOf('Simulated data.')
    expect(note, 'the note is on the page').toBeGreaterThan(-1)
    expect(page).toContain('Every company, person and')
    expect(page).toContain('demo companies, not')
    // Before the first door and before the first company name.
    expect(note).toBeLessThan(page.indexOf('<ProgramDoors'))
    expect(note).toBeLessThan(page.indexOf('Northbend Athletic'))
  })

  it('marks every company and every person it offers as a demo, with the chip the product uses', () => {
    expect(doors).toContain("import { DemoChip } from '@/components/shell/demo-chip'")
    // One chip on each kind of door: client programs, supplying firms, people.
    expect(doors.match(/<DemoChip \/>/g)?.length).toBe(3)
  })
})
