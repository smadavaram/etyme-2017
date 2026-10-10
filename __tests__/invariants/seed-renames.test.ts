import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RENAMED_FIRMS, renamedEmail, renameInText, renamePairs } from '@/lib/seed-renames'

/**
 * The demo firm whose name belonged to a real company, renamed in place.
 * The database half is `__integration__/retired-demo-firm-renamed.test.ts`;
 * this is the arithmetic on the words and the addresses.
 */

const firm = RENAMED_FIRMS[0]
const PREFIX = 'world-'
const DOMAIN = 'demo.etyme.local'
const old = PREFIX + firm.fromSlug

describe('A retired demo firm is renamed to the founder’s choice', () => {
  it('the demo firm is now called Techpeple, at world-techpeple, for the reason the founder gave', () => {
    expect(firm.toName).toBe('Techpeple')
    expect(firm.toSlug).toBe('techpeple')
    expect(firm.on).toBe('2026-10-04')
    expect(firm.why).toBe('a real company of that name asked for its own tenancy, 2026-10-04')
  })

  it('the world seed seats the firm under the new slug and the new name, and never the old', () => {
    const seed = readFileSync(join(process.cwd(), 'src/lib/seed-world.ts'), 'utf8')
    expect(seed).toMatch(/slug: 'techpeple',\s+name: 'Techpeple'/)
    expect(seed.toLowerCase()).not.toContain(firm.fromSlug)
  })
})

describe('A seeded address moves to the new slug, and nobody real is touched', () => {
  it('the firm’s owner address moves to the new slug', () => {
    expect(renamedEmail(`${old}@${DOMAIN}`, firm, PREFIX, DOMAIN)).toBe(`world-techpeple@${DOMAIN}`)
  })

  it('a desk at the firm keeps its desk name and moves to the new slug', () => {
    expect(renamedEmail(`${old}-ap@${DOMAIN}`, firm, PREFIX, DOMAIN)).toBe(`world-techpeple-ap@${DOMAIN}`)
  })

  it('an address at any other domain is somebody real and is never moved', () => {
    expect(renamedEmail(`${old}@gmail.com`, firm, PREFIX, DOMAIN)).toBeNull()
    expect(renamedEmail(`ravi@${firm.fromSlug}.com`, firm, PREFIX, DOMAIN)).toBeNull()
  })

  it('another seeded firm whose slug merely starts the same way is never moved', () => {
    expect(renamedEmail(`${old}x@${DOMAIN}`, firm, PREFIX, DOMAIN)).toBeNull()
    expect(renamedEmail(`world-computer-systems@${DOMAIN}`, firm, PREFIX, DOMAIN)).toBeNull()
  })
})

describe('Every spelling of the old name in a sentence becomes the new one', () => {
  it('the old name, its capitalized and upper-case forms, the slug and the address all read as Techpeple', () => {
    const upper = firm.fromName.toUpperCase()
    const capital = firm.fromName[0] + firm.fromName.slice(1).toLowerCase()
    const said = renameInText(
      `${firm.fromName} sells to Computer Systems. ${capital} Systems. ${upper}-1. ` +
        `Sign in as ${old}-ap@${DOMAIN}. The slug is ${firm.fromSlug}.`,
      firm,
      PREFIX
    )
    expect(said).toBe(
      `Techpeple sells to Computer Systems. Techpeple Systems. TECHPEPLE-1. ` +
        `Sign in as world-techpeple-ap@${DOMAIN}. The slug is techpeple.`
    )
    expect(said.toLowerCase()).not.toContain(firm.fromSlug)
  })

  it('reads the address before the bare name, so world-techpeple is never half renamed', () => {
    expect(renamePairs(firm, PREFIX)[0]).toEqual([old, 'world-techpeple'])
  })

  it('a sentence that never named the firm is left exactly as it was', () => {
    const s = 'Computer Systems sells to Northbend Athletic at $138.'
    expect(renameInText(s, firm, PREFIX)).toBe(s)
  })
})
