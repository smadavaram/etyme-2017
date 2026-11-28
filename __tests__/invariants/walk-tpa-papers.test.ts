import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { contractClearance, sentencePhrases } from '@/lib/contract-clearance'
import { expiresInDays, standingOf, supplierCoverGate } from '@/lib/document-stages'
import { PACKETS } from '@/lib/packets'
import { checkedAtStart, NOT_CHECKED_AT_START } from '@/lib/document-stages/checked-at-start'
import { claimsNoStake } from '@/lib/positioning'

/**
 * The walk of Tapin's first week (tag tpa, 2026-11-14) found four things
 * in regulatory's files. Each is held here in a sentence.
 */

const TODAY = new Date('2026-11-14T15:00:00Z')
const START = new Date('2026-11-16T00:00:00Z')
const DEC_4 = new Date('2026-12-04T00:00:00Z')

describe('an I-9 never claims an E-Verify check the record does not hold', () => {
  it('a start held for an I-9 says "an I-9" and never says it was checked with E-Verify', () => {
    const said = sentencePhrases([{ key: 'I9_EVERIFY', label: 'I-9 and E-Verify' }])
    expect(said).toEqual(['an I-9'])
    expect(said.join(' ')).not.toMatch(/E-Verify/)
  })

  it('proof of right to work and the I-9 read as one paper, "proof of right to work (I-9)", with no E-Verify', () => {
    const said = sentencePhrases([{ key: 'RIGHT_TO_WORK', label: 'Proof of right to work' }, { key: 'I9_EVERIFY', label: 'I-9' }])
    expect(said).toEqual(['proof of right to work (I-9)'])
  })

  it('the refusal at the start says the I-9 is missing and never mentions E-Verify', () => {
    const v = contractClearance({
      personName: 'Ana Ruiz', personVerifications: [], supplierName: 'Brightmoor Staffing',
      supplierCertificates: [], on: TODAY,
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toMatch(/Ana Ruiz cannot start without proof of right to work \(I-9\)/)
    expect(`${v.says} ${v.fix ?? ''}`).not.toMatch(/E-Verify/)
  })

  it('every start packet names the paper "I-9", not "I-9 and E-Verify", and keeps the key I9_EVERIFY', () => {
    const i9s = PACKETS.flatMap((p) => p.items).filter((i) => i.key === 'I9_EVERIFY')
    expect(i9s.length).toBeGreaterThan(0)
    for (const i of i9s) {
      expect(i.label).toBe('I-9')
      expect(`${i.label} ${i.hint}`).not.toMatch(/E-Verify/)
    }
  })
})

describe('a client’s own papers on a line say whether the start checks them', () => {
  it('a client’s master agreement from the default set reads "Asked of the client, not checked at the start"', () => {
    expect(checkedAtStart({ owedBy: 'CUSTOMER', from: 'DEFAULT' })).toBe(false)
    expect(NOT_CHECKED_AT_START).toBe('Asked of the client, not checked at the start')
  })

  it('a client paper somebody wrote on the order is held at the start, so it keeps its word', () => {
    expect(checkedAtStart({ owedBy: 'CUSTOMER', from: 'ORDER' })).toBe(true)
    expect(checkedAtStart({ owedBy: 'CUSTOMER', from: 'LINE' })).toBe(true)
  })

  it('a worker’s and a supplier’s papers on the default set are still checked at the start', () => {
    expect(checkedAtStart({ owedBy: 'WORKER', from: 'DEFAULT' })).toBe(true)
    expect(checkedAtStart({ owedBy: 'SUPPLIER', from: 'DEFAULT' })).toBe(true)
  })

  it('the document-set route sends the row’s words, and the document-set page shows them in place of "Required"', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/documents/requirements/route.ts'), 'utf8')
    expect(route).toMatch(/standingSays: checked \? null : NOT_CHECKED_AT_START/)
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/documents/requirements/page.tsx'), 'utf8')
    expect(page).toMatch(/r\.standingSays \? r\.standingSays/)
  })
})

describe('one date gives one count of days on the placement and on Compliance', () => {
  const cover = [
    { type: 'INSURANCE_GL', status: 'CLEAR', validFrom: new Date('2025-12-04T00:00:00Z'), expiresAt: DEC_4, verifiedAt: new Date('2025-12-04T00:00:00Z') },
    { type: 'INSURANCE_WC', status: 'CLEAR', validFrom: new Date('2026-01-01T00:00:00Z'), expiresAt: new Date('2027-01-01T00:00:00Z'), verifiedAt: new Date('2026-01-01T00:00:00Z') },
  ]

  it('insurance that expires on Dec 4 is 20 days away on Nov 14, counted in calendar days', () => {
    expect(expiresInDays(DEC_4, TODAY)).toBe(20)
  })

  it('the placement (judged today) and Compliance (judged on the start, Nov 16) both say "expires in 20 days"', () => {
    const placement = supplierCoverGate({ supplierName: 'Brightmoor Staffing', certificates: cover, on: TODAY })
    const compliance = supplierCoverGate({ supplierName: 'Brightmoor Staffing', certificates: cover, on: START, today: TODAY })
    const said = (g: ReturnType<typeof supplierCoverGate>) => g.chasing.map((s) => s.says).join(' ')
    expect(said(placement)).toMatch(/expires in 20 days/)
    expect(said(compliance)).toMatch(/expires in 20 days/)
    expect(said(compliance)).not.toMatch(/18 days/)
  })

  it('the whole start check passes the reading day through, so its sentence counts from today', () => {
    const base = { personName: 'Ana Ruiz', personVerifications: [], supplierName: 'Brightmoor Staffing', supplierCertificates: cover }
    const placement = contractClearance({ ...base, on: TODAY })
    const compliance = contractClearance({ ...base, on: START, today: TODAY })
    const said = (c: ReturnType<typeof contractClearance>) => c.cover.chasing.map((s) => s.says).join(' ')
    expect(said(placement)).toMatch(/expires in 20 days/)
    expect(said(compliance)).toMatch(/expires in 20 days/)
  })

  it('a paper that lapses before a start still to come says how many days it has left, and that it runs out before the start', () => {
    const s = standingOf(
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', expiresAt: DEC_4, verifiedAt: TODAY },
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', validMonths: 12 },
      new Date('2026-12-10T00:00:00Z'),
      TODAY,
    )
    expect(s.standing).toBe('EXPIRED')
    expect(s.says).toMatch(/^Certificate of general liability insurance expires in 20 days, before /)
  })

  it('a caller that names no reading day keeps the count it always had', () => {
    const s = standingOf(
      { key: 'INSURANCE_GL', label: 'Cover', expiresAt: DEC_4, verifiedAt: TODAY },
      { key: 'INSURANCE_GL', label: 'Cover', validMonths: 12 },
      START,
    )
    expect(s.says).toBe('Cover expires in 18 days. Ask for the renewal now.')
  })
})

describe('regulatory’s pages never say Etyme runs no bench, supplies no workers or places nobody', () => {
  const words = (path: string) =>
    readFileSync(join(process.cwd(), path), 'utf8')
      .replace(/['`]\s*\+\s*\n\s*['`]/g, '')
      .replace(/\\u2019/g, '’')
      .replace(/\s+/g, ' ')

  it('the census document’s footer, the census agreement, the legal questions and the security posture make no such claim', () => {
    for (const path of ['src/app/legal/census-document.tsx', 'src/lib/legal.ts', 'docs/security-posture.md']) {
      expect(claimsNoStake(words(path)), path).toEqual([])
      expect(words(path), path).not.toMatch(/runs no bench|places nobody|employs no consultant|not a competitor of your suppliers/)
    }
  })

  it('the legal question on agency status says what is true and checkable: every supplier alike, rates never shown to another supplier', () => {
    expect(words('src/lib/legal.ts')).toContain('The product treats every supplier alike, and a supplier’s rates are never shown to another supplier.')
  })

  it('the security posture still says Etyme never issues a verdict about whether a person may work', () => {
    expect(words('docs/security-posture.md')).toContain('Etyme never issues a verdict about whether a person may work.')
  })
})
