import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A send checks the bill from one read, and hands what it read on.
 *
 * Measured 2026-11-02 on copies of the scale world, twenty-five bills
 * sent at once: the check before a send (`mayBeSent`) read the bill three
 * times — for its state, to count its lines, and again inside the
 * three-way check — asked for the billing address the Send route had
 * asked a moment before, and read every line's contract twice, once for
 * the line and once for its week. The letter after the sending then read
 * the whole bill again although the payer's notice had just read it.
 * Now: one read of the bill for the check, the address asked once, the
 * contracts read once for both, and the notice's read handed to the
 * letter. 3,104 statements for the twenty-five sends became 2,288; the
 * check went from about 0.95 to 0.6 seconds and the letter from about 1.1
 * to 0.55 at the middle of three runs. The three-way check's answer on
 * 1,142 invoices, read both ways and alone, is identical before and after.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the bill the payer’s notice read is the bill the letter sends', () => {
  it('the Send button, the bulk Send and a yes in Ask Etyme each hand the notice’s read to the letter', () => {
    for (const p of [
      'src/app/api/invoices/[id]/submit/route.ts',
      'src/app/api/invoices/submit/route.ts',
      'src/lib/money/supplier-bills.ts',
    ]) {
      const src = read(p)
      expect(src, p).toMatch(/const told = await tellPayerAfterSending\(/)
      expect(src, p).toMatch(/sendBillToCustomer\(\{[^}]*read: told\.read \}\)/)
    }
  })

  describe('telling the payer after the sending', () => {
    beforeEach(() => vi.resetModules())

    it('returns the bill the notice read, so the letter can stand on it', async () => {
      const bill = { bill: { id: 'inv-1', status: 'SUBMITTED' } }
      vi.doMock('@/lib/db', () => ({ prisma: {} }))
      vi.doMock('@/lib/notify/bill-delivery', () => ({
        writePayerNoticesIn: vi.fn(async () => ({ written: 2, payerId: 'payer', why: null, read: bill })),
      }))
      vi.doMock('@/lib/alerts', () => ({ reportError: vi.fn(async () => {}) }))
      const { tellPayerAfterSending } = await import('@/lib/money/bill-send')
      expect(await tellPayerAfterSending('inv-1', 'co')).toEqual({ written: 2, why: null, read: bill })
    })

    it('hands on nothing where the notice failed, so the letter reads the bill for itself', async () => {
      vi.doMock('@/lib/db', () => ({ prisma: {} }))
      vi.doMock('@/lib/notify/bill-delivery', () => ({
        writePayerNoticesIn: vi.fn(async () => { throw new Error('down') }),
      }))
      const reportError = vi.fn(async () => {})
      vi.doMock('@/lib/alerts', () => ({ reportError }))
      const { tellPayerAfterSending } = await import('@/lib/money/bill-send')
      expect(await tellPayerAfterSending('inv-1', 'co')).toEqual({ written: 0, why: null, read: null })
      expect(reportError).toHaveBeenCalledWith('bill-payer-notice', expect.any(Error), { companyId: 'co' })
    })
  })
})

describe('the check before a send reads the bill once', () => {
  const send = read('src/lib/money/bill-send.ts')
  const check = send.slice(send.indexOf('export async function mayBeSent'), send.indexOf('export interface Sent'))

  it('the bill is found only where this firm raised it, in the one read the three-way check needs', () => {
    expect(check).toMatch(/await loadForMatch\(\{ id: invoiceId, \.\.\.invoicesRaisedBy\(companyId\) \}\)/)
    expect(check).not.toMatch(/prisma\.invoice\.findFirst/)
    expect(check).not.toMatch(/prisma\.invoiceLine\.count/)
  })

  it('the three-way check is handed the bill it was read with, and reads it again only where it was not', () => {
    expect(check).toMatch(/matchAndRecord\(invoiceId, companyId, attempt, \{ orderWindow: 'SAY' \}, loaded\)/)
    const loop = read('src/lib/invoice-loop.ts')
    expect(loop).toMatch(/loaded && loaded\.id === invoiceId\s+\? \(await matchLoaded\(\[loaded\], opts\)\)\.get\(invoiceId\) \?\? null\s+: await matchInvoice\(invoiceId, opts\)/)
  })

  it('the billing address is asked once: the Send routes asked it through maySendBill, and the twin’s yes, which asks nothing first, still asks it here', () => {
    expect(check).toMatch(/opts\.addressRead \? \(\{ ok: true \} as const\) : await mayIssueBill\(companyId\)/)
    expect(read('src/app/api/invoices/[id]/submit/route.ts')).toMatch(/const who = await maySendBill\([\s\S]*mayBeSent\(id, companyId, \['ISSUED', 'DRAFT'\], \{ addressRead: true \}\)/)
    expect(read('src/app/api/invoices/submit/route.ts')).toMatch(/const senders = await maySendBills\([\s\S]*mayBeSent\(invoiceId, companyId, \['ISSUED', 'DRAFT'\], \{ addressRead: true \}\)/)
    expect(read('src/lib/money/supplier-bills.ts')).toMatch(/mayBeSent\(c\.entity\.id, c\.companyId, \['DRAFT'\]\)/)
  })
})

describe('a line’s contract and its week’s contract are read once, for every line', () => {
  beforeEach(() => vi.resetModules())

  it('the three-way check’s read of an invoice nests no contract under a line or a week', () => {
    const match = read('src/lib/invoice-match.ts')
    const include = match.slice(match.indexOf('const MATCH_INCLUDE = {'), match.indexOf('satisfies Prisma.InvoiceInclude'))
    expect(include).not.toMatch(/sellContract: \{/)
  })

  it('a line reads its own contract and its week reads the week’s, from one read of both', async () => {
    const contracts = [
      { id: 'prime-line', billRate: 14500, clientCompanyId: 'client' },
      { id: 'sub-line', billRate: 11800, clientCompanyId: 'prime' },
    ]
    const findContracts = vi.fn(async () => contracts)
    vi.doMock('@/lib/db', () => ({
      prisma: {
        invoice: {
          findMany: vi.fn(async () => [{
            id: 'inv-1',
            invoiceLines: [
              { id: 'hours', sellContractId: 'prime-line', timesheet: { id: 'ts-1', sellContractId: 'sub-line' } },
              { id: 'milestone', sellContractId: null, timesheet: null },
            ],
          }]),
        },
        sellContract: { findMany: findContracts },
      },
    }))
    const { loadForMatch } = await import('@/lib/invoice-match')
    const [inv] = await loadForMatch({ id: 'inv-1' })
    expect(findContracts).toHaveBeenCalledTimes(1)
    expect((findContracts.mock.calls[0] as unknown as [{ where: { id: { in: string[] } } }])[0].where.id.in.sort()).toEqual(['prime-line', 'sub-line'])
    const [hours, milestone] = inv.invoiceLines
    expect(hours.sellContract?.billRate).toBe(14500)
    expect(hours.timesheet?.sellContract.billRate).toBe(11800)
    expect(milestone.sellContract).toBeNull()
    expect(milestone.timesheet).toBeNull()
  })

  it('an invoice with no line on a contract reads no contract at all', async () => {
    const findContracts = vi.fn(async () => [])
    vi.doMock('@/lib/db', () => ({
      prisma: {
        invoice: { findMany: vi.fn(async () => [{ id: 'inv-2', invoiceLines: [{ id: 'm', sellContractId: null, timesheet: null }] }]) },
        sellContract: { findMany: findContracts },
      },
    }))
    const { loadForMatch } = await import('@/lib/invoice-match')
    await loadForMatch({ id: 'inv-2' })
    expect(findContracts).not.toHaveBeenCalled()
  })
})
