import { describe, it, expect } from 'vitest'
import { newChecklist, withOrderedItems, suppliedByWords, optionalWord } from '@/lib/supplier-onboarding'

/**
 * Two lines on the HR desk's supplier checklist said two things at once
 * (tester, 2026-09-30): "Signed agreement · optional — Required by
 * Northbend Athletic’s orders", and "Vendor screening (sanctions,
 * litigation) · this desk", as if HR rendered a screening company's
 * verdict itself.
 */
describe('the supplier checklist says one true thing per line', () => {
  const ordered = [{ key: 'NDA', label: 'NDA', purpose: 'AGREEMENT', required: true }] as never
  const list = withOrderedItems(newChecklist(), ordered, 'Northbend Athletic')

  it('never reads "optional" on an item a client’s orders require', () => {
    for (const item of list.filter((i) => i.says)) expect(optionalWord(item)).toBeNull()
  })

  it('says an agreement the orders require is needed before the first placement, not to finish onboarding', () => {
    const nda = list.find((i) => i.key === 'NDA')!
    expect(nda.says).toBe(
      'Northbend Athletic’s orders require it before this firm’s first placement. Onboarding can finish without it.'
    )
  })

  it('names a screening company as the one whose result the sanctions and litigation screening is, never the desk', () => {
    const screening = list.find((i) => i.key === 'VENDOR_SCREENING')!
    expect(suppliedByWords(screening)).toBe('a screening company’s result, recorded by this desk')
    expect(suppliedByWords(screening)).not.toBe('this desk')
  })
})
