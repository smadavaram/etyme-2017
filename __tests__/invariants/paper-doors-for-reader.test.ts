import { describe, it, expect } from 'vitest'
import { doorsForReader } from '@/app/api/placements/[id]/paper-doors-for-reader'

/**
 * A sub-vendor's name is the prime's to keep (CLAUDE.md, 2026-09-17), on a
 * placement's paper doors too (release pass 41).
 */
describe('a client reading a placement’s paper doors never reads the firm below its supplier', () => {
  const hidden = [{ id: 'co-techpeple', name: 'Techpeple' }]

  it('a sentence naming the firm below says the supplier’s supplier instead', () => {
    const out = doorsForReader({ DRUG_SCREENING: { doors: [], says: 'Techpeple orders Drug screening from a screening company and records what it says.' } }, hidden, 'Computer Systems Inc’s supplier')
    expect(out.DRUG_SCREENING.says).toBe('Computer Systems Inc’s supplier orders Drug screening from a screening company and records what it says.')
    expect(JSON.stringify(out)).not.toContain('Techpeple')
  })

  it('a door that carries the firm below, by name or by id, is not sent', () => {
    const out = doorsForReader({ NDA: { doors: [{ kind: 'ASK', label: 'Ask Priya', at: 'co-techpeple' } as any], says: null } }, hidden, 'x')
    expect(out.NDA.doors).toEqual([])
  })

  it('a supplier reading its own doors, with nobody hidden, reads them as they are', () => {
    const doors = { NDA: { doors: [], says: 'Techpeple asks Priya for Signed non-disclosure agreement.' } }
    expect(doorsForReader(doors, [], 'x')).toBe(doors)
  })
})
