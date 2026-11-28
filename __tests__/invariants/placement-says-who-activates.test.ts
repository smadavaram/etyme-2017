import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixWithWho, whoFrom } from '@/app/dashboard/placements/[id]/activate-who'

const page = readFileSync(join(__dirname, '../../src/app/dashboard/placements/[id]/page.tsx'), 'utf8')
const line = 'Get an I-9 and E-Verify on file, then activate.'

describe('the placement page says who activates', () => {
  it('the placement page says who activates where the start’s route names them, and keeps its line as it is where it names nobody', () => {
    expect(fixWithWho(line, whoFrom({ who: ['HR'] }))).toBe('Get an I-9 and E-Verify on file, then HR activates.')
    expect(fixWithWho(line, whoFrom({ who: ['HR', 'Owner'] }))).toBe('Get an I-9 and E-Verify on file, then HR or the Owner activates.')
    expect(fixWithWho(line, whoFrom({ who: 'Account Manager' }))).toBe('Get an I-9 and E-Verify on file, then the Account Manager activates.')
    expect(fixWithWho(line, whoFrom({ who: [{ name: 'HR' }, { name: 'Admin' }, { name: 'Owner' }] }))).toBe('Get an I-9 and E-Verify on file, then HR, the Admin or the Owner activates.')
    // No `who` yet, or an empty one: the line as it is.
    expect(fixWithWho(line, whoFrom({ may: true }))).toBe(line)
    expect(fixWithWho(line, whoFrom({ who: [] }))).toBe(line)
    expect(fixWithWho(line, whoFrom(null))).toBe(line)
    // A fix that does not end on "then activate." is never rewritten.
    expect(fixWithWho('Ask the supplier for its certificate.', ['HR'])).toBe('Ask the supplier for its certificate.')
    expect(fixWithWho(null, ['HR'])).toBeNull()
    // The page draws the line through it, from the start's own route.
    expect(page).toContain('fixWithWho(p.checklist.fix, who)')
    expect(page).toContain('setWho(whoFrom(body?.data))')
  })
})
