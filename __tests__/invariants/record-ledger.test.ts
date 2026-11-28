/**
 * The record ledger (2026-11-21 → 107): every act on a record carries
 * three stamps written at the time, and nothing changes a row after.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ledger from '@/lib/record-ledger'
import { stampRefusal } from '@/lib/record-ledger'

const act = { action: 'OPENED', summary: 'Opened a decision.', personId: 'p1', heldAs: 'Accounts' }

describe('the record ledger', () => {
  it('every record action carries the entity, the person and the role she held', () => {
    expect(stampRefusal({ ...act, actingEntityId: 'e1' }, ['e1'])).toBeNull()
    expect(stampRefusal({ ...act, personId: '', actingEntityId: 'e1' }, ['e1'])).toMatch(/person/)
    expect(stampRefusal({ ...act, heldAs: ' ', actingEntityId: 'e1' }, ['e1'])).toMatch(/role or queue/)
  })

  it('a record action cannot name another company’s legal entity', () => {
    expect(stampRefusal({ ...act, actingEntityId: 'someone-elses' }, ['e1'])).toMatch(/not one of this company’s own/)
  })

  it('a company with legal entities must say which one an act is done for', () => {
    expect(stampRefusal({ ...act, actingEntityId: null }, ['e1'])).toMatch(/Choose which one/)
  })

  it('a company with no legal entity writes an act with no entity', () => {
    expect(stampRefusal({ ...act, actingEntityId: null }, [])).toBeNull()
  })

  it('the ledger offers no way to change or remove a row', () => {
    const names = Object.keys(ledger)
    expect(names.filter((n) => /update|delete|remove|edit|change|upsert/i.test(n))).toEqual([])
    const src = readFileSync(join(process.cwd(), 'src/lib/record-ledger.ts'), 'utf8')
    expect(src).not.toMatch(/recordAction\.(update|updateMany|delete|deleteMany|upsert)/)
  })

  it('nothing in the app changes or removes a ledger row', () => {
    const { execSync } = require('child_process')
    const hits = execSync("grep -rlE 'recordAction\\.(update|updateMany|delete|deleteMany|upsert)' src || true", { encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })

  it('a row on a payroll record is left out at the query for a reader who does not read payroll, on every read of the firm’s ledger', () => {
    expect(ledger.PAYROLL_RECORD).toBe('MoneyChain')
    const src = readFileSync(join(process.cwd(), 'src/lib/record-ledger.ts'), 'utf8')
    // Unless the caller says the reader reads payroll, the rows are excluded in the where-clause, never filtered after the read.
    expect(src).toContain("reader: { readsPayroll: boolean } = { readsPayroll: false }")
    expect(src).toContain('reader.readsPayroll ? { companyId } : { companyId, NOT: await payrollRows(companyId, db) }')
    const agents = readFileSync(join(process.cwd(), 'src/app/api/decision-items/agents/route.ts'), 'utf8')
    expect(agents).toContain("firmLedger(seat.companyId, page, undefined, { readsPayroll })")
    expect(agents).toContain('hasPermission(seat.caller.permissions, PAYROLL_LEDGER_READS)')
    expect(ledger.PAYROLL_LEDGER_READS).toBe('payroll.read')
  })

  it('a decision is about payroll where its proof points at a consultant’s month', () => {
    expect(ledger.aboutPayroll([{ recordType: 'MoneyChain', recordId: 'm1' }])).toBe(true)
    expect(ledger.aboutPayroll([{ recordType: 'Invoice', recordId: 'i1' }])).toBe(false)
    expect(ledger.aboutPayroll([])).toBe(false)
    expect(ledger.aboutPayroll(null)).toBe(false)
  })

  it('a seat that does not read payroll is told in one sentence how many acts on payroll records it is not shown', () => {
    expect(ledger.payrollRowsHiddenSays(0)).toBeNull()
    expect(ledger.payrollRowsHiddenSays(1)).toBe('1 act on a payroll record is not shown here. A seat that reads payroll reads it.')
    expect(ledger.payrollRowsHiddenSays(9)).toBe('9 acts on payroll records are not shown here. A seat that reads payroll reads them.')
  })
})
