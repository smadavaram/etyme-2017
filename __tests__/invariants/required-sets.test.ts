/**
 * The papers a new company requires per party, before it writes a rule
 * of its own: the shipped sets, read per party for the "Papers you
 * require" step of setup (founder, 2026-10-20).
 */

import { describe, it, expect } from 'vitest'
import { defaultRequiredSets } from '@/lib/document-stages/required-sets'
import { defaultItemsFor } from '@/lib/document-requirements'

const keys = (kind: string, party: string) =>
  defaultRequiredSets(kind).find((s) => s.party === party)?.items.map((i) => i.key)

describe('papers you require', () => {
  it('a new company\'s default paper sets per party are the shipped sets, with work authorization never waivable', () => {
    const sets = defaultRequiredSets('VENDOR')
    expect(sets.map((s) => s.party)).toEqual(['WORKERS_W2', 'CORP_TO_CORP', 'SUB_VENDORS', 'CUSTOMERS'])
    expect(keys('VENDOR', 'WORKERS_W2')).toEqual(defaultItemsFor('W2').map((i) => i.key))
    expect(keys('VENDOR', 'CORP_TO_CORP')).toEqual(defaultItemsFor('CORP_TO_CORP').map((i) => i.key))
    expect(keys('VENDOR', 'SUB_VENDORS')).toEqual(defaultItemsFor('SUB_VENDOR').map((i) => i.key))
    expect(keys('VENDOR', 'CUSTOMERS')).toEqual(defaultItemsFor('CUSTOMER').map((i) => i.key))

    const all = sets.flatMap((s) => s.items)
    for (const i of all.filter((i) => i.key === 'I9_EVERIFY' || i.key === 'RIGHT_TO_WORK')) expect(i.waivable, i.key).toBe(false)
    for (const i of all.filter((i) => i.key !== 'I9_EVERIFY' && i.key !== 'RIGHT_TO_WORK')) expect(i.waivable, i.key).toBe(true)
  })

  it('every default item says what it is for, who owes it, and whether it is asked before or after an offer', () => {
    const w2 = defaultRequiredSets('VENDOR')[0].items
    const i9 = w2.find((i) => i.key === 'I9_EVERIFY')!
    expect(i9).toMatchObject({ purpose: 'COMPLIANCE', owedBy: 'WORKER', stage: 'ENGAGEMENT' })
    const bg = w2.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(bg).toMatchObject({ owedBy: 'US', stage: 'ENGAGEMENT' })
    const msa = defaultRequiredSets('VENDOR')[3].items.find((i) => i.key === 'MSA')!
    expect(msa).toMatchObject({ purpose: 'AGREEMENT', owedBy: 'CUSTOMER', stage: 'APPLICATION' })
  })

  it('a client\'s default sets cover its suppliers and never a worker\'s I-9', () => {
    const sets = defaultRequiredSets('CLIENT')
    expect(sets.map((s) => s.party)).toEqual(['SUB_VENDORS', 'CORP_TO_CORP'])
    expect(sets.flatMap((s) => s.items).some((i) => i.key === 'I9_EVERIFY')).toBe(false)
  })

  it('an MSP and a one-person firm ask only of the customers they serve, because neither employs a worker', () => {
    expect(defaultRequiredSets('MSP').map((s) => s.party)).toEqual(['CUSTOMERS'])
    expect(defaultRequiredSets('CONSULTANT_CORP').map((s) => s.party)).toEqual(['CUSTOMERS'])
  })

  it('a company of a kind nobody named reads as a supplier, never as one that requires nothing', () => {
    expect(defaultRequiredSets(null).map((s) => s.party)).toEqual(defaultRequiredSets('VENDOR').map((s) => s.party))
  })
})
