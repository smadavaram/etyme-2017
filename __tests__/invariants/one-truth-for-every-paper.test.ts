import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { acceptedItemStands, heldFromAcceptedItems, standsOnACheck } from '@/lib/document-stages/paper-record'
import { examineBody, examineFields, examineNeedsOf } from '@/lib/document-stages/examine-form'
import { reportRunsOutOn } from '@/lib/attestation'

/**
 * One truth for every paper (the founder's tester, production 2026-11-03):
 * a background check, a drug screen, an NDA and a confidentiality
 * undertaking accepted on Paperwork read "on file" there and "needed" on
 * the placement, while a fresh request said everything was on file. The
 * walk itself is `__integration__/one-truth-for-every-paper.test.ts`;
 * these are the rules it stands on.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('one truth for every paper', () => {
  it('a background check, a drug screen, an I-9 and a supplier’s certificate stand on the record behind them, never on the acceptance alone', () => {
    for (const key of ['BACKGROUND_CHECK', 'DRUG_SCREENING', 'I9_EVERIFY', 'PASSPORT', 'INSURANCE_GL', 'GOOD_STANDING']) {
      expect(standsOnACheck(key), key).toBe(true)
      expect(acceptedItemStands({ key, state: 'ACCEPTED', verificationId: null }), key).toBe(false)
    }
  })

  it('an NDA or a company’s own undertaking accepted through a request is held from the acceptance', () => {
    for (const key of ['NDA', 'NCA', 'PRODUCT_CONFIDENTIALITY', 'W9']) {
      expect(acceptedItemStands({ key, state: 'ACCEPTED' }), key).toBe(true)
    }
    const held = heldFromAcceptedItems([
      { key: 'NDA', state: 'ACCEPTED', validUntil: new Date('2027-11-01T00:00:00Z') },
      { key: 'BACKGROUND_CHECK', state: 'ACCEPTED', validUntil: new Date('2027-11-01T00:00:00Z') },
      { key: 'NCA', state: 'RECEIVED', validUntil: null },
    ])
    expect(held).toEqual([{ key: 'NDA', validFrom: null, expiresAt: new Date('2027-11-01T00:00:00Z'), accepted: true }])
  })

  it('a paper that arrived and nobody accepted is held by nobody', () => {
    expect(acceptedItemStands({ key: 'NDA', state: 'RECEIVED' })).toBe(false)
  })

  it('accepting a background check posts the screening company’s report and no end of its own', () => {
    const needs = examineNeedsOf('BACKGROUND_CHECK', false)
    expect(needs.end).toBe(false)
    expect(examineFields(needs)).toEqual(['provider', 'reference', 'renderedOn', 'outcome', 'providerSays'])
    expect(examineBody(needs, { provider: ' Sterling ', reference: 'ST-4471', renderedOn: '2026-10-28', outcome: 'CLEAR', providerSays: 'Clear.' })).toEqual({
      verdict: 'ACCEPT', provider: 'Sterling', reference: 'ST-4471', renderedOn: '2026-10-28', outcome: 'CLEAR', providerSays: 'Clear.',
    })
  })

  it('a screening company’s report counts for its twelve months from the day it reported', () => {
    expect(reportRunsOutOn('BACKGROUND_CHECK', new Date('2026-10-28T00:00:00Z'))?.toISOString().slice(0, 10)).toBe('2027-10-28')
    expect(reportRunsOutOn('PASSPORT', new Date('2026-10-28T00:00:00Z'))).toBeNull()
  })

  it('a packet request reads what is held the way the start reads it, through the clearance’s own reading', () => {
    const route = read('src/app/api/packets/route.ts')
    expect(route).toContain('heldFrom(verifications)')
    expect(route).toContain('heldFromAcceptedItems(priorItems)')
    const clearance = read('src/lib/contract-clearance.ts')
    expect(clearance.match(/acceptedRequestPapers\(/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('the backfill route answers only the cron secret', () => {
    expect(read('src/app/api/packets/backfill/route.ts')).toContain('cronAuthorized(request)')
  })
})
