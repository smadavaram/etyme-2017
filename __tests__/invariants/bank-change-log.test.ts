import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { bankLogRow, type BankWrite } from '@/app/api/settings/remit-to/bank-log'
import { bankChange } from '@/lib/money/remit-change'

/**
 * The one row a write to a firm's payment details leaves in the activity
 * log (money's review, 2026-11-16). Where money arrives is the edit an
 * attacker wants most, so the row says what moved in the words a screen
 * shows, and never more digits than a screen shows.
 */

const before = { bankName: 'Harborline Savings', accountName: 'Northwind Staffing LLC', accountLast4: '4410', routingLast4: '0210' }

const write = (over: Partial<BankWrite> = {}): BankWrite => {
  const after = { bankName: 'Harborline Credit Union', accountName: 'Northwind Staffing LLC', accountLast4: '7731' }
  return {
    companyId: 'c1', remitToId: 'r1', legalName: 'Northwind Staffing LLC', byName: 'Dana Whitfield',
    added: false, door: 'SETTINGS', after, change: bankChange(before, after), ...over,
  }
}

describe('the activity log row a bank change writes', () => {
  it('shows the bank, the account name and the last four digits, and no longer number', () => {
    const row = bankLogRow(write())
    expect(row.summary).toBe('Dana Whitfield changed payment details for Northwind Staffing LLC: Harborline Credit Union · Northwind Staffing LLC · ending 7731.')
    expect(row.payload).toMatchObject({ bankName: 'Harborline Credit Union', accountName: 'Northwind Staffing LLC', accountLast4: '7731' })
    expect(JSON.stringify(row)).not.toMatch(/\d{5,}/)
    // The routing digits are not on the log; the log is read more widely than the details.
    expect(JSON.stringify(row.payload)).not.toContain('0210')
  })

  it('is never offered as undone from the activity log', () => {
    expect(bankLogRow(write()).reversible).toBe(false)
    expect(bankLogRow(write({ added: true, change: bankChange(null, write().after) })).reversible).toBe(false)
  })

  it('says the check was cleared only when the bank itself changed', () => {
    const moved = bankLogRow(write())
    expect(moved.action).toBe('REMIT_TO_CHANGED')
    expect(moved.reason).toBe('Edited in settings. The bank changed, so the check on it was cleared.')
    expect(moved.payload).toMatchObject({ checkCleared: true, changed: ['bankName', 'accountLast4'] })
    const label = bankLogRow(write({ after: before, change: bankChange(before, {}) }))
    expect(label.reason).toBe('Edited in settings')
    expect(label.payload).toMatchObject({ checkCleared: false, changed: [] })
  })

  it('names the door it came through, Settings or Setup', () => {
    expect(bankLogRow(write({ door: 'SETUP' })).reason).toBe('Entered in setup. The bank changed, so the check on it was cleared.')
    const added = bankLogRow(write({ added: true, madeDefault: true, change: bankChange(null, write().after) }))
    expect(added.action).toBe('REMIT_TO_ADDED')
    expect(added.reason).toBe('Added in settings')
    expect(added.summary).toMatch(/, and made them the default\.$/)
  })

  it('shows an account with no name of its own under the legal name, as the screen does', () => {
    const row = bankLogRow(write({ after: { bankName: 'Harborline Savings', accountName: null, accountLast4: '4410' } }))
    expect(row.summary).toContain('Harborline Savings · Northwind Staffing LLC · ending 4410')
  })

  it('both doors that write bank details write this one row, and neither writes its own', () => {
    for (const f of ['src/app/api/settings/remit-to/route.ts', 'src/app/api/settings/setup/[item]/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).toContain('recordBankWrite(')
      expect(src, f).not.toMatch(/action:\s*'REMIT_TO_/)
    }
  })
})
