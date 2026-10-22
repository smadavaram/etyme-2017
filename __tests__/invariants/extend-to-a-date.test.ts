import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extensionEnd, LONGEST_EXTENSION_MONTHS } from '@/lib/money/extension-end'

/**
 * Extending a placement to the day somebody chose.
 *
 * Found by the screen walk of 2026-10-22 ("Papers at every stage, walked
 * on screens"): the Extend button in the contracts drawer offered three
 * months and nothing else, asked for no reason, and showed the route's
 * refusal as a toast that vanished. The route already read the papers
 * that must last to the new end; the screen never reached them.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const today = day('2026-10-22')

describe('the day an extension ends', () => {
  it('an extension may end on any day the person picks after the current end', () => {
    const r = extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: '2027-02-17' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.newEnd.toISOString().slice(0, 10)).toBe('2027-02-17')
    expect(r.months).toBeNull()
  })

  it('the chosen day is the day stored, read as a calendar day and never shifted by a time zone', () => {
    const r = extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: '2027-03-01' })
    expect(r.ok && r.newEnd.toISOString()).toBe('2027-03-01T00:00:00.000Z')
  })

  it('an end on or before the current last day is refused in a sentence, because that is shortening and not extending', () => {
    for (const d of ['2026-12-31', '2026-11-30']) {
      const r = extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: d })
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.field).toBe('newEndDate')
      expect(r.message).toMatch(/after Dec 31, 2026/)
      expect(r.message).toMatch(/rolloff/i)
    }
  })

  it('an end more than two years past the current last day is refused, naming the furthest day allowed', () => {
    const r = extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: '2029-01-01' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toMatch(/Dec 31, 2028/)
    expect(LONGEST_EXTENSION_MONTHS).toBe(24)
    // The furthest day itself is allowed.
    expect(extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: '2028-12-31' }).ok).toBe(true)
  })

  it('a date that is not a calendar day is refused rather than rolled into the next month', () => {
    for (const d of ['2027-02-30', '2027-13-01', 'next friday', '']) {
      const r = extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: d })
      expect(r.ok, d).toBe(false)
    }
  })

  it('a placement with no last day is extended from today, and an end on or before today is refused', () => {
    expect(extensionEnd({ oldEnd: null, today, newEndDate: '2027-01-15' }).ok).toBe(true)
    const r = extensionEnd({ oldEnd: null, today, newEndDate: '2026-10-22' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/after today/)
  })

  it('a number of months is still accepted, so a screen that offers three months keeps working', () => {
    const r = extensionEnd({ oldEnd: day('2026-12-31'), today, months: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.months).toBe(3)
    expect(r.newEnd.getTime()).toBeGreaterThan(day('2027-03-30').getTime())
    // And nothing at all still means three months, as it always did.
    const d = extensionEnd({ oldEnd: day('2026-12-31'), today })
    expect(d.ok && d.months).toBe(3)
  })

  it('a number of months outside one to twenty-four is refused', () => {
    for (const m of [0, 25, -1, '3']) {
      expect(extensionEnd({ oldEnd: day('2026-12-31'), today, months: m }).ok, String(m)).toBe(false)
    }
  })

  it('the extension says its new end as a day a person reads, never an ISO date', () => {
    const r = extensionEnd({ oldEnd: day('2026-12-31'), today, newEndDate: '2027-02-17' })
    expect(r.ok && r.says).toBe('Extended to Feb 17, 2027.')
  })
})

describe('the Extend dialog in the contracts drawer', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/extend-dialog.tsx'), 'utf8')
  const drawer = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')

  it('offers a day to pick, not a fixed three months', () => {
    expect(page).toMatch(/type="date"/)
    expect(page).toMatch(/newEndDate/)
    expect(drawer).not.toMatch(/extensionMonths/)
    expect(drawer).not.toMatch(/by 3 months/)
  })

  it('takes a reason, and sends it as the answer to a warning only after the route has said that warning', () => {
    expect(page).toMatch(/<textarea/)
    // The general reason travels as the note on every extension.
    expect(page).toMatch(/note:/)
    // The two reasons the route asks for are only sent once asked.
    expect(page).toMatch(/asked\.reason/)
    expect(page).toMatch(/asked\.limitReason/)
  })

  it('shows the route’s own sentence when a paper stops the extension, inside the dialog rather than in a toast', () => {
    expect(page).toMatch(/role="alert"/)
    expect(page).toMatch(/PAPERS_BLOCK/)
  })
})
