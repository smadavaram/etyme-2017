import { describe, it, expect } from 'vitest'
import { withoutOwnFirmAcceptance } from '@/lib/money/own-firm-acceptance'
import { signingOrder, type WeekSigner } from '@/lib/consultant-portfolio'

/**
 * A one-person firm is never asked to accept its own week (2026-10-20,
 * shipped 2026-10-21). The second production walk, 2026-10-26, found
 * Colleen Byrne's page still reading "Then Halcyon Talent and Byrne
 * Critical Care LLC accept them". This is the one rule every list of who
 * signs her week reads, the same rule the approve route stands on.
 */

const colleen: WeekSigner[] = [
  { companyId: 'harlow', name: 'Harlow Health', role: 'CLIENT_APPROVAL' },
  { companyId: 'halcyon', name: 'Halcyon Talent', role: 'PASS_THROUGH' },
  { companyId: 'byrne', name: 'Byrne Critical Care LLC', role: 'EMPLOYER_ACCEPTANCE' },
]

describe('a one-person firm is never asked to accept its own week', () => {
  it('a one-person firm is never asked to accept its own week', () => {
    const asked = withoutOwnFirmAcceptance(colleen, new Set(['byrne']))
    expect(asked.map((s) => s.name)).toEqual(['Harlow Health', 'Halcyon Talent'])
    expect(signingOrder(asked)).toBe('After you send, Harlow Health approves them first. Then Halcyon Talent accepts them.')
  })

  it('a firm with somebody besides the worker to accept hours still accepts the week, last', () => {
    expect(withoutOwnFirmAcceptance(colleen, new Set())).toEqual(colleen)
  })

  it('the client’s signature and every firm between are never dropped, whoever the worker is', () => {
    const asked = withoutOwnFirmAcceptance(colleen, new Set(['harlow', 'halcyon', 'byrne']))
    expect(asked.map((s) => s.role)).toEqual(['CLIENT_APPROVAL', 'PASS_THROUGH'])
  })
})
