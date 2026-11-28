import { describe, it, expect } from 'vitest'
import { costObjectTypeOf, codingBlock, vendorNumberFor, poLineNumber, savedColumns, judgeMayMaintainCodes } from '@/lib/money/client-codes'
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

describe('who maintains the client’s own codes', () => {
  const seat = (personId: string, roleName: string, permissions: string[]) => ({ personId, name: personId, roleName, permissions })
  const owner = seat('o', 'Owner', ['*'])
  const admin = seat('a', 'Admin', ['team.manage', 'settings.manage', 'payments.record'])
  const clerk = seat('c', 'AP Clerk', ['payments.record'])
  const finance = seat('f', 'Finance', ['payments.record'])
  const as = (s: ReturnType<typeof seat>) => ({ personId: s.personId, permissions: s.permissions })

  it('an Admin, who is IT and people, does not set the client’s codes, even holding payments.record', () => {
    expect(judgeMayMaintainCodes(as(admin), [owner, admin, clerk])).toMatchObject({ may: false })
  })
  it('an Admin the Owner has granted codes.manage may', () => {
    expect(judgeMayMaintainCodes({ personId: 'a', permissions: [...admin.permissions, 'codes.manage'] }, [owner, admin])).toEqual({ may: true })
  })
  it('the client’s Finance seat corrects a contract’s coding, and the AP clerk beside it does not', () => {
    expect(judgeMayMaintainCodes(as(finance), [owner, finance, clerk])).toEqual({ may: true })
    expect(judgeMayMaintainCodes(as(clerk), [owner, finance, clerk])).toEqual({ may: false, says: 'Your Finance team or the Owner sets these.' })
  })
  it('where a client has no Finance seat, its AP clerk corrects the coding', () => {
    expect(judgeMayMaintainCodes(as(clerk), [owner, admin, clerk])).toEqual({ may: true })
    expect(judgeMayMaintainCodes(as(admin), [owner, admin, clerk])).toEqual({ may: false, says: 'Your AP clerk or the Owner sets these.' })
  })
  it('the Owner may always, even where a Finance seat exists and the role row predates the permission', () => {
    expect(judgeMayMaintainCodes(as(seat('o2', 'Owner', ['settings.manage'])), [seat('o2', 'Owner', ['settings.manage']), finance])).toEqual({ may: true })
  })
  it('the refusal names only seats the firm has filled', () => {
    const none = judgeMayMaintainCodes(as(admin), [admin])
    expect(none).toEqual({ may: false, says: 'Nobody at your company sets these yet. Give a seat the Finance or AP Clerk role first.' })
    expect(judgeMayMaintainCodes(as(admin), [owner, admin])).toEqual({ may: false, says: 'Your Owner sets these.' })
  })
})
