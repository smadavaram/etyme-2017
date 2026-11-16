import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SAML_NOT_BUILT, SAML_STATE } from '@/lib/identity/saml-words'
import { SAML_NOT_AVAILABLE } from '@/components/settings/settings-says'
import { SAML_NOT_BUILT as FROM_DIRECTORY } from '@/lib/identity/directory'
import { connectionSays, accessGivenSays, TEAMS_NOT_CONFIRMED } from '@/lib/team-structure/directory/words'
import { mapColumnsFor, IMPORTABLE } from '@/lib/importable'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('Layer 7, first slice: each control says only what is true', () => {
  it('a company that stored a SAML directory reads "Stored, not built yet", never "On"', () => {
    const page = read('src/app/dashboard/settings/sign-in/page.tsx')
    expect(page).toContain("o.directory.type === 'SAML' ? SAML_STATE : o.directory.enabled ? 'On' : 'Off'")
    expect(SAML_STATE).not.toMatch(/\bOn\b/)
  })

  it('the SAML sentence on the screen and the sign-in refusal are one sentence from one place', () => {
    expect(SAML_NOT_AVAILABLE).toBe(SAML_NOT_BUILT)
    expect(FROM_DIRECTORY).toBe(SAML_NOT_BUILT)
    expect(SAML_NOT_BUILT).toContain('sign in another way')
  })

  it('a directory with access given never reads "Connected", and says it is read only when somebody presses read', () => {
    expect(accessGivenSays('northwind-staffing.example')).not.toMatch(/connected/i)
    expect(accessGivenSays('northwind-staffing.example')).toContain('only when somebody presses read')
  })

  it('a directory read says when it was last read, how many people it returned, and that a read is on request', () => {
    const says = connectionSays({ domain: 'harborline-tech.example', connectedBy: 'Dana Reyes', connectedDay: 'Nov 3', lastReadDay: 'Nov 9', lastReadCount: 42 })
    expect(says).toContain('Last read Nov 9: 42 people.')
    expect(says).toContain('read only when somebody presses read')
    expect(says).not.toMatch(/connected/i)
  })

  it('a directory never read says "Not read yet" and claims no failure the record does not keep', () => {
    const says = connectionSays({ domain: 'harborline-tech.example', connectedBy: null, connectedDay: 'Nov 3', lastReadDay: null, lastReadCount: null })
    expect(says).toContain('Not read yet.')
    expect(says).not.toMatch(/fail/i)
  })

  it('the Teams link says notices are posted and that Teams does not confirm they arrived, on Integrations and on Settings', () => {
    expect(TEAMS_NOT_CONFIRMED).toBe('Notices are posted to the channel. Teams does not confirm they arrived.')
    expect(read('src/app/dashboard/integrations/page.tsx')).toContain('{TEAMS_NOT_CONFIRMED}')
    expect(read('src/app/dashboard/settings/page.tsx')).toContain('{TEAMS_LINK_HOW_TO} {TEAMS_NOT_CONFIRMED}')
  })

  it('a contract type column on the people sheet says it is not read there and where a W2 row becomes an employee', () => {
    const spec = IMPORTABLE.find((s) => s.key === 'CONSULTANTS')!
    const col = mapColumnsFor(spec, ['Name', 'Email', 'Contract type']).columns.find((c) => c.column === 'Contract type')!
    expect(col.field).toBeNull()
    expect(col.note).toContain('A W2 row becomes your own employee')
    expect(col.note).not.toBe('Not used')
  })
})
