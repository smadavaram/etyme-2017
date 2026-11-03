import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { grantRefusal } from '@/components/settings/grant-seat'

/**
 * "Grant the seat" with empty fields said nothing (walk 3): the press
 * looked the MSP up, the look-up returned silently on a name under two
 * characters, and the button was enabled whenever a role was picked. Now
 * the press refuses in a sentence that names the field.
 */
const form = readFileSync(join(__dirname, '../../src/components/settings/grant-seat.tsx'), 'utf8')
const role = 'role-1'

describe('granting an MSP a seat says what is missing before it says nothing', () => {
  it('a grant with no MSP named and no reason is refused in one sentence naming both', () => {
    expect(grantRefusal({ name: '', reason: '', roleId: role })).toBe('Name the MSP and say why before you grant a seat.')
    expect(grantRefusal({ name: ' a ', reason: '  ', roleId: role })).toBe('Name the MSP and say why before you grant a seat.')
  })

  it('a grant with no MSP named is refused in a sentence that says how to name it', () => {
    expect(grantRefusal({ name: 'A', reason: 'They run our program', roleId: role })).toBe('Name the MSP before you grant a seat: its name, or its Etyme address.')
  })

  it('a grant with an MSP named and no reason is refused in a sentence that asks why', () => {
    expect(grantRefusal({ name: 'Aptiva', reason: '', roleId: role })).toBe('Say why before you grant a seat. The reason is kept with the seat.')
  })

  it('a grant with no role chosen is refused in a sentence naming the role', () => {
    expect(grantRefusal({ name: 'Aptiva', reason: 'They run our program', roleId: '' })).toBe('Choose the role the MSP holds here before you grant a seat.')
  })

  it('a grant with every field filled goes to the route', () => {
    expect(grantRefusal({ name: 'Aptiva', reason: 'They run our program from January', roleId: role })).toBeNull()
  })

  it('the press shows the sentence, and the button is never silently disabled for a missing field', () => {
    expect(form).toContain('const missing = grantRefusal({ name: word, reason, roleId })')
    expect(form).toContain('if (missing) { setError(missing); return }')
    expect(form).toContain('<button type="submit" disabled={busy} className')
  })

  it('a name typed and never looked up is looked up on the press, and the grant goes on from the same press', () => {
    expect(form).toContain('const firm = office ?? (await find())')
    expect(form).toContain('officeCompanyId: firm.id')
  })

  it('no sentence on the form says "desk" or "program office"', () => {
    for (const s of [grantRefusal({ name: '', reason: '', roleId: role }), grantRefusal({ name: 'x', reason: 'y', roleId: '' })]) {
      expect(s).not.toMatch(/\bdesk\b|program office/i)
    }
  })
})
