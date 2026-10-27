import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sideFromQuery, sideHref, answerFits, rowsOfSide } from '@/lib/money/contract-side'
import { afterHeader, mayPinToOrder } from '@/lib/money/order-first-line'
import { linesForReader, ownLineSide } from '@/lib/money/order-lines-read'
import { readAgreementTerms, mayRecordAgreement, isPlaceholder, readByTheCascade, type ExistingAgreement } from '@/lib/money/agreement-record'
import { termsFor } from '@/lib/money/order-terms'

/**
 * The onboarding fix wave from the 2026-10-27 release walk, money's four
 * faults: a sub-vendor could not record its agreement with a prime, could
 * not record the order the prime gave it, read Sell contracts under the
 * Buy contracts tab, and raised orders with no lines.
 */

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('the Sell and Buy contracts tabs', () => {
  it('the Buy contracts tab shows buy lines and the Sell contracts tab sell lines, never the other', () => {
    expect(sideFromQuery('buy')).toBe('buy')
    expect(sideFromQuery('sell')).toBe('sell')
    expect(sideFromQuery(null)).toBe('sell')
    expect(sideHref('buy')).toBe('/dashboard/contracts?side=buy')
    expect(sideHref('sell')).toBe('/dashboard/contracts?side=sell')
    const rows = [{ id: 'a', side: 'sell' }, { id: 'b', side: 'buy' }]
    expect(rowsOfSide(rows, 'buy').map((r) => r.id)).toEqual(['b'])
    expect(rowsOfSide(rows, 'sell').map((r) => r.id)).toEqual(['a'])
  })

  it('an answer for the side that is no longer on screen is dropped rather than drawn under the other side\u2019s heading', () => {
    expect(answerFits('sell', 'buy')).toBe(false)
    expect(answerFits('buy', 'buy')).toBe(true)
  })

  it('the contracts page reads its side from the address on every render, so a tab link moves it without a reload', () => {
    const page = read('src/app/dashboard/contracts/page.tsx')
    expect(page).toContain("sideFromQuery(searchParams.get('side'))")
    // Seeding the side into state once is the fault: a tab link keeps
    // the page mounted and the state keeps the side it was born with.
    expect(page).not.toMatch(/useState<ViewTab>\(/)
    expect(page).toContain('answerFits(')
  })
})

describe('an order and its first line', () => {
  it('an order raised by hand asks for its first line or says where lines come from', () => {
    for (const end of ['BUYER', 'SELLER'] as const) {
      const next = afterHeader({ end, counterpartyName: 'Computer Systems', noun: 'order', number: 'PO-1', linesAttached: 0 })
      expect(['ASK_FIRST_LINE', 'LINES_FROM_AWARD']).toContain(next.kind)
      expect(next.says.length).toBeGreaterThan(20)
    }
  })

  it('an order a supplier records from the paper it was handed asks for its first line: the person, the rate, the site and the dates', () => {
    const next = afterHeader({ end: 'SELLER', counterpartyName: 'Computer Systems', noun: 'sales order', number: 'CS-PO-77', linesAttached: 0 })
    expect(next.kind).toBe('ASK_FIRST_LINE')
    expect(next.says).toContain('who works on it, at what rate, at which site, from when')
  })

  it('an order a buyer raises says its lines come from the award, naming the supplier', () => {
    const next = afterHeader({ end: 'BUYER', counterpartyName: 'Techpeple', noun: 'purchase order', number: 'PO-9', linesAttached: 0 })
    expect(next.kind).toBe('LINES_FROM_AWARD')
    expect(next.says).toContain('Lines come from the award')
    expect(next.says).toContain('Techpeple')
  })

  it('an order that picked up running placements says they are its lines now and asks for nothing', () => {
    const next = afterHeader({ end: 'BUYER', counterpartyName: 'Techpeple', noun: 'purchase order', number: 'PO-9', linesAttached: 2 })
    expect(next.kind).toBe('HAS_LINES')
    expect(next.says).toContain('2 placements')
  })

  it('a line pinned to an order lands on that order, and an order between other firms, or closed, is refused in a sentence', () => {
    const line = { sellerId: 'sub', sellerName: 'Techpeple', buyerId: 'prime', buyerName: 'Computer Systems' }
    const order = { id: 'o', number: 'CS-PO-77', issuedById: 'prime', issuedToId: 'sub', status: 'OPEN', issuedByName: 'Computer Systems' }
    expect(mayPinToOrder(order, line).ok).toBe(true)
    const notOurs = mayPinToOrder({ ...order, issuedToId: 'someone' }, line)
    expect(notOurs.ok).toBe(false)
    if (!notOurs.ok) expect(notOurs.says).toContain('not an order Techpeple received')
    const otherClient = mayPinToOrder({ ...order, issuedById: 'x', issuedByName: 'Northbend' }, line)
    if (!otherClient.ok) expect(otherClient.says).toContain('from Northbend, not from Computer Systems')
    else throw new Error('should refuse')
    const closed = mayPinToOrder({ ...order, status: 'CLOSED' }, line)
    if (!closed.ok) expect(closed.says).toContain('closed')
    else throw new Error('should refuse')
    expect(mayPinToOrder(null, line).ok).toBe(false)
  })
})

describe('one order read from both ends', () => {
  const lines = [
    { id: 's1', side: 'SELL' as const, personId: 'omar', rate: 9000 },
    { id: 'b1', side: 'BUY' as const, personId: 'omar', rate: 9000 },
    { id: 'b2', side: 'BUY' as const, personId: 'jonas', rate: 8500 },
  ]

  it('a person on both ends of one order is one line to each reader, read from the reader\u2019s own end', () => {
    expect(ownLineSide('SELLER')).toBe('SELL')
    expect(ownLineSide('BUYER')).toBe('BUY')
    const seller = linesForReader(lines, 'SELLER', () => true)
    expect(seller.map((l) => l.id)).toEqual(['s1', 'b2'])
    expect(seller.find((l) => l.id === 's1')?.fromOtherEnd).toBe(false)
    expect(seller.find((l) => l.id === 'b2')?.fromOtherEnd).toBe(true)
    const buyer = linesForReader(lines, 'BUYER', () => true)
    expect(buyer.map((l) => l.id)).toEqual(['b1', 'b2'])
  })

  it('a line from the other end of the order shows its rate only to a desk that may read that bill rate', () => {
    const seller = linesForReader(lines, 'SELLER', () => false)
    const jonas = seller.find((l) => l.id === 'b2')!
    expect(jonas.rate).toBeNull()
    expect(jonas.payWithheld).toBe(true)
    // The reader's own line is untouched by the other end's gate.
    expect(seller.find((l) => l.id === 's1')?.rate).toBe(9000)
  })
})

describe('recording an agreement', () => {
  const stub: ExistingAgreement = {
    id: 'ma1', createdAt: new Date('2026-09-01T00:00:00Z'), paymentTerms: 30, paymentTermsFrom: 'PERIOD_END',
    billFrequency: null, effectiveDate: null, expiresAt: null, signedAt: null, executedFileName: null,
    signatures: 0, versions: 0,
  }
  const sub = { id: 'sub', name: 'Techpeple' }
  const prime = { id: 'prime', name: 'Computer Systems', claimedAt: new Date('2026-01-01') }

  it('a sub-vendor records its agreement with a prime from Companies, and both firms read it', () => {
    const v = mayRecordAgreement({ caller: sub, other: prime, callerSells: true, relationshipExists: true, existing: null })
    expect(v.ok).toBe(true)
    if (v.ok) {
      // The sub sells to the prime: the sub is the vendor on the row the prime also reads.
      expect(v.vendorId).toBe('sub')
      expect(v.clientId).toBe('prime')
      expect(v.says).toContain('Both firms read it')
    }
    const theOtherWay = mayRecordAgreement({ caller: { id: 'prime', name: 'Computer Systems' }, other: { ...sub, claimedAt: new Date() }, callerSells: false, relationshipExists: true, existing: null })
    if (theOtherWay.ok) expect([theOtherWay.vendorId, theOtherWay.clientId]).toEqual(['sub', 'prime'])
    else throw new Error('the prime may record it too')
  })

  it('an agreement with a firm on Etyme is recorded only where the two already trade, and the refusal says so', () => {
    const v = mayRecordAgreement({ caller: sub, other: prime, callerSells: true, relationshipExists: false, existing: null })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('do not trade here yet')
    const shell = mayRecordAgreement({ caller: sub, other: { ...prime, claimedAt: null }, callerSells: true, relationshipExists: false, existing: null })
    expect(shell.ok).toBe(true)
    if (shell.ok) expect(shell.says).toContain('not on Etyme')
  })

  it('a second agreement between the same two firms is refused and names the one on file; an unsigned placeholder is filled in instead', () => {
    expect(isPlaceholder(stub)).toBe(true)
    const fill = mayRecordAgreement({ caller: sub, other: prime, callerSells: true, relationshipExists: true, existing: stub })
    expect(fill.ok && fill.fillId).toBe('ma1')
    const signed = { ...stub, signatures: 1 }
    expect(isPlaceholder(signed)).toBe(false)
    const second = mayRecordAgreement({ caller: sub, other: prime, callerSells: true, relationshipExists: true, existing: signed })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.says).toContain('already on file, since 2026-09-01')
    expect(isPlaceholder({ ...stub, paymentTerms: 45 })).toBe(false)
    expect(isPlaceholder({ ...stub, versions: 2 })).toBe(false)
  })

  it('an agreement\u2019s terms are refused in a sentence when the net days, what they run from, the rhythm, the currency or the signed copy\u2019s link are not ones anything can use', () => {
    const ok = readAgreementTerms({ paymentTerms: '45', paymentTermsFrom: 'invoice_date', billFrequency: 'weekly', currency: 'usd', executedFileUrl: 'https://files.example/msa-techpeple.pdf' })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.terms).toMatchObject({ paymentTerms: 45, paymentTermsFrom: 'INVOICE_DATE', billFrequency: 'WEEKLY', currency: 'USD', executedFileName: 'msa-techpeple.pdf' })
    }
    // What the agreement records is what every bill between the two reads.
    if (ok.ok) {
      const follows = termsFor('SELL', {}, readByTheCascade(ok.terms, 'USD'))
      expect([follows.frequency, follows.paymentTermsDays, follows.paymentTermsFrom]).toEqual(['WEEKLY', 45, 'INVOICE_DATE'])
      expect(follows.source.frequency).toBe('AGREEMENT')
    }
    // Blank is silence, never a default nobody chose.
    const silent = readAgreementTerms({})
    if (silent.ok) expect(silent.terms).toMatchObject({ paymentTerms: null, paymentTermsFrom: null, billFrequency: null, currency: null })
    for (const [body, field] of [
      [{ paymentTerms: '-3' }, 'paymentTerms'],
      [{ paymentTerms: '12.5' }, 'paymentTerms'],
      [{ paymentTermsFrom: 'WHENEVER' }, 'paymentTermsFrom'],
      [{ billFrequency: 'DAILY' }, 'billFrequency'],
      [{ currency: 'dollars' }, 'currency'],
      [{ executedFileUrl: 'C:\\msa.pdf' }, 'executedFileUrl'],
      [{ executedFileName: 'msa.pdf' }, 'executedFileUrl'],
      [{ effectiveDate: '2026-10-01', expiresAt: '2026-09-01' }, 'expiresAt'],
    ] as const) {
      const r = readAgreementTerms(body as Record<string, unknown>)
      expect(r.ok, JSON.stringify(body)).toBe(false)
      if (!r.ok) {
        expect(r.field).toBe(field)
        // A sentence a person reads, never a code.
        expect(r.says).toMatch(/^[A-Z][a-z]* .+\.$/)
      }
    }
  })
})
