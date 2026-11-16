import { describe, it, expect } from 'vitest'
import { costObjectTypeOf, codingBlock, vendorNumberFor, poLineNumber, savedColumns } from '@/lib/money/client-codes'
import { DEFAULT_RECEIPT_COLUMNS } from '@/lib/money/receipt-file'

describe('the client codes the invoice-lines file reads', () => {
  it('a cost center reads as a cost center and an order reads by its kind', () => {
    expect(costObjectTypeOf({ internalOrder: null })).toBe('COST_CENTER')
    expect(costObjectTypeOf({ internalOrder: { kind: 'WBS_ELEMENT' } })).toBe('WBS_ELEMENT')
    expect(costObjectTypeOf({ internalOrder: { kind: 'PROJECT_CODE' } })).toBe('PROJECT_CODE')
    expect(costObjectTypeOf({ internalOrder: { kind: 'MATERIAL_CODE' } })).toBe('MATERIAL_CODE')
  })
  it('a row from before kinds existed reads as an internal order', () => {
    expect(costObjectTypeOf({ internalOrder: { kind: null } })).toBe('INTERNAL_ORDER')
    expect(costObjectTypeOf({ internalOrder: { kind: 'something else' } })).toBe('INTERNAL_ORDER')
  })
  it('a company code and a profit center are empty cells where nobody set them', () => {
    expect(codingBlock(null, null)).toEqual({ companyCode: '', profitCenter: '' })
    expect(codingBlock({ companyCode: ' 1000 ' }, { profitCenter: 'PC-7' })).toEqual({ companyCode: '1000', profitCenter: 'PC-7' })
  })
  it('a supplier number is read only from the payer’s own register row', () => {
    const rows = [
      { companyId: 'other', otherCompanyId: 's1', relationship: 'SUPPLIER', vendorNumber: '999' },
      { companyId: 'payer', otherCompanyId: 's1', relationship: 'SUPPLIER', vendorNumber: ' 4410 ' },
    ]
    expect(vendorNumberFor(rows, 'payer', 's1')).toBe('4410')
    expect(vendorNumberFor(rows, 'payer', 's2')).toBeNull()
    expect(vendorNumberFor([{ ...rows[1], vendorNumber: '  ' }], 'payer', 's1')).toBeNull()
  })
  it('a PO line number is the line’s place in the order, counted 10, 20, 30 from the oldest', () => {
    const lines = [
      { id: 'b', createdAt: new Date('2026-02-01T00:00:00Z') },
      { id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'c', createdAt: new Date('2026-03-01T00:00:00Z') },
    ]
    expect(poLineNumber(lines, 'a')).toBe('10')
    expect(poLineNumber(lines, 'c')).toBe('30')
    expect(poLineNumber(lines, 'zz')).toBeNull()
    expect(poLineNumber(lines, null)).toBeNull()
  })
  it('saved columns come back in the order saved, and every column where none were saved', () => {
    expect(savedColumns(['amount', 'person'])).toEqual(['amount', 'person'])
    expect(savedColumns([])).toEqual([...DEFAULT_RECEIPT_COLUMNS])
    expect(savedColumns(null)).toEqual([...DEFAULT_RECEIPT_COLUMNS])
  })
  it('a saved column that no longer exists falls back to every column rather than a broken file', () => {
    expect(savedColumns(['amount', 'gone'])).toEqual([...DEFAULT_RECEIPT_COLUMNS])
  })
})
