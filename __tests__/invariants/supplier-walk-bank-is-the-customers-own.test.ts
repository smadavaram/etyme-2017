import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Record 86 and 87: each paying customer confirms a supplier's bank for
 * itself. The supplier walk's Finance item goes through the same writer
 * money uses, so the customer's own BankCheck row is what is written.
 */
const route = readFileSync(join(__dirname, '..', '..', 'src/app/api/supplier-requests/[id]/route.ts'), 'utf8')
const marking = route.slice(route.indexOf("if (key === 'BANK')"), route.indexOf("if (action === 'decline')"))

describe('the supplier walk bank item is the paying customer’s own check', () => {
  it('a customer’s Finance marking the bank checked on the supplier walk confirms it for that customer only', () => {
    // Written by money's own writer, as this customer, never straight onto the shared columns.
    expect(marking).toMatch(/checkPayeeBank\(\{ payer: \{ id: companyId,/)
    expect(marking).not.toMatch(/remitTo\.update\(\{ where: \{ id: bank\.remitToId/)
    // A waived item never reaches the writer: it has no remitToId.
    expect(marking).toMatch(/if \(bank\?\.remitToId && firmId\)/)
  })

  it('reopening the bank item clears only that customer’s check', () => {
    expect(marking).toMatch(/bankCheck\.deleteMany\(\{ where: \{ payerCompanyId: companyId, remitTo: \{ companyId: firmId \} \} \}\)/)
    expect(marking).toMatch(/remitTo\.updateMany\(\{ where: \{ companyId: firmId, verifiedByCompanyId: companyId \}/)
  })
})
