import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Walk 7, 2026-11-08, and its open line after fda026207: a receipt held only
 * on the supplier's bank details was told as "does not match what was
 * accepted", and the chat said it "waits for you to pay it" with Pay. A
 * notice is now read against the receipt on the day it is said, and the
 * chat says a bank-held receipt in the queue row's own sentence.
 */

const db = vi.hoisted(() => ({
  invoices: [] as unknown[],
  verdicts: new Map<string, unknown>(),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: { findMany: vi.fn(async () => db.invoices) },
    vendorBill: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@/lib/twin/rules/invoice', async (actual) => {
  const real = await actual<typeof import('@/lib/twin/rules/invoice')>()
  return {
    ...real,
    invoiceRulesFor: vi.fn(async () => real.DEFAULT_INVOICE_RULES),
    invoiceVerdict: vi.fn(async (id: string) => db.verdicts.get(id) ?? null),
  }
})

import { receiptNoticeToday, receiptNoticesToday, isReceiptFlagNotice, MISMATCH_TITLE } from '@/app/api/conversations/twin/receipt-notices'
import { queueCards, queueName, queueFrom, namedNeedsSays, respond, type QueueItem, type QueueRead, type Readers } from '@/app/api/conversations/twin/ask'
import { CHECK_THE_BANK, OPEN_THE_RECEIPT } from '@/app/api/conversations/twin/held-receipt'
import { bankHeldReceiptDecision } from '@/app/api/decisions/receipt-to-pay'

const BANK_SAYS = 'Pinnacle Resourcing’s bank details are not checked. Rosalind Tay checks them on this invoice receipt, then it can be paid.'
const CLIENT = 'c-northbend'
const PINNACLE = { id: 'v-pinnacle', name: 'Pinnacle Resourcing' }
const NORTHBEND = { id: CLIENT, name: 'Northbend Athletic' }

function invoiceRow(id: string, number: string) {
  return {
    id, number,
    engagement: { msa: { vendorId: PINNACLE.id, clientId: CLIENT, vendor: PINNACLE, client: NORTHBEND } },
    workOrder: null,
  }
}
const oldNotice = (id: string, entityId: string, title = 'PR-2026-0441 from Pinnacle Resourcing does not match what was accepted') => ({
  id, title, entityId, data: { twinAction: 'invoice_receipt.flag_mismatch', entityType: 'Invoice', entityId },
})

beforeEach(() => {
  db.invoices = []
  db.verdicts = new Map()
})

describe('an old notice about a receipt is said as it stands today', () => {
  it('a notice written before fda026207 about a receipt held only on its bank is said as the hold, never as a mismatch', async () => {
    db.invoices = [invoiceRow('inv-441', 'PR-2026-0441')]
    db.verdicts.set('inv-441', { verdict: 'CLEAN', payable: false, heldOn: 'BANK', rationale: BANK_SAYS })
    const got = await receiptNoticesToday([oldNotice('n1', 'inv-441')], CLIENT)
    expect(got.titles.get('n1')).toEqual({
      title: 'PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked',
      body: BANK_SAYS,
    })
    expect(got.titles.get('n1')!.title).not.toMatch(/does not match/)
  })

  it('the old generic title is read the same way, so no seat still reads “An invoice receipt does not match” over a bank hold', async () => {
    db.invoices = [invoiceRow('inv-441', 'PR-2026-0441')]
    db.verdicts.set('inv-441', { verdict: 'CLEAN', payable: false, heldOn: 'BANK', rationale: BANK_SAYS })
    const got = await receiptNoticesToday([{ id: 'n2', title: MISMATCH_TITLE, entityId: 'inv-441', data: null }], CLIENT)
    expect(got.titles.get('n2')!.title).toBe('PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked')
  })

  it('a receipt whose hours still do not match keeps saying so, by number and supplier', async () => {
    db.invoices = [invoiceRow('inv-442', 'PR-2026-0442')]
    db.verdicts.set('inv-442', { verdict: 'MISMATCH', payable: false, heldOn: null, rationale: '41.5 hours billed against 40 accepted.' })
    const got = await receiptNoticesToday([oldNotice('n3', 'inv-442', MISMATCH_TITLE)], CLIENT)
    expect(got.titles.get('n3')!.title).toBe('PR-2026-0442 from Pinnacle Resourcing does not match what was accepted')
  })

  it('a receipt nothing holds any more is not said again, and its notice is closed with the rest', async () => {
    db.invoices = [invoiceRow('inv-441', 'PR-2026-0441')]
    db.verdicts.set('inv-441', { verdict: 'CLEAN', payable: true, heldOn: null, rationale: 'Clean.' })
    const got = await receiptNoticesToday([oldNotice('n4', 'inv-441')], CLIENT)
    expect(got.closed.has('n4')).toBe(true)
    expect(got.titles.has('n4')).toBe(false)
  })

  it('a receipt the reader is not paying keeps the title it was written with', async () => {
    db.invoices = [invoiceRow('inv-441', 'PR-2026-0441')]
    db.verdicts.set('inv-441', { verdict: 'CLEAN', payable: false, heldOn: 'BANK', rationale: BANK_SAYS })
    const got = await receiptNoticesToday([oldNotice('n5', 'inv-441')], PINNACLE.id)
    expect(got.titles.size).toBe(0)
    expect(got.closed.size).toBe(0)
  })

  it('where the receipt cannot be read today, it is named as it was said and never guessed into a hold', () => {
    expect(receiptNoticeToday(null, { number: 'PR-2026-0441', supplier: 'Pinnacle Resourcing' })).toBeNull()
  })

  it('a receipt held for something other than the bank is said as held, with what holds it', () => {
    expect(receiptNoticeToday(
      { verdict: 'CLEAN', payable: false, heldOn: null, rationale: 'A week on it is not accepted yet.' },
      { number: 'PR-2026-0443', supplier: 'Pinnacle Resourcing' },
    )).toEqual({ kind: 'SAY', title: 'PR-2026-0443 from Pinnacle Resourcing is held', body: 'A week on it is not accepted yet.' })
  })

  it('only the twin’s line about a receipt is read this way, never another notice', () => {
    expect(isReceiptFlagNotice(oldNotice('n', 'inv'))).toBe(true)
    expect(isReceiptFlagNotice({ title: 'Helena Marsh filed her week', entityId: 'ts1', data: { twinAction: 'timesheet.remind' } })).toBe(false)
  })

  it('the greeting reads every receipt notice through this one reader', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/notices.ts'), 'utf8')
    expect(src).toContain('receiptNoticesToday(rows, caller.company?.id ?? null)')
    expect(src).not.toContain('mismatchTitles(')
  })
})

// ── The chat's held line ──────────────────────────────────────────────

/** The row demand writes for a receipt held on the bank, to a reader who is not the checker. */
const heldRow = (over: Partial<QueueItem> = {}): QueueItem => ({
  type: 'INVOICE_RECEIPT_HELD',
  title: 'Held: bank details not checked — Pinnacle Resourcing',
  whose: 'Pinnacle Resourcing',
  subtitle: 'Invoice PR-2026-0441 · $4,160.00 · Bank details not checked. Ask Rosalind Tay to check them, then pay.',
  entityId: 'inv-441',
  entityType: 'INVOICE',
  actionUrl: '/dashboard/invoices/inv-441',
  ...over,
})

describe('a receipt held on the bank, in the chat', () => {
  it('the card says the row’s own reason and names who checks, and is never a Pay card', () => {
    const [card] = queueCards({ total: 1, items: [heldRow()] })
    expect(card.title).toBe('PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked.')
    expect(card.fact).toBe('Bank details not checked. Ask Rosalind Tay to check them, then pay.')
    expect(card.act).toBeNull()
    expect(card.open).toBe(OPEN_THE_RECEIPT)
    expect(card.open).not.toBe('Pay')
    expect(`${card.title} ${card.fact}`).not.toMatch(/waits for you to pay/)
  })

  it('for the seat that checks, the card opens the check on the invoice receipt', () => {
    const mine = heldRow({ subtitle: 'Invoice PR-2026-0441 · $4,160.00 · Bank details not checked. Check them, then pay.' })
    const [card] = queueCards({ total: 1, items: [mine] })
    expect(card.open).toBe(CHECK_THE_BANK)
    expect(card.href).toBe('/dashboard/invoices/inv-441')
    expect(card.fact).toBe('Bank details not checked. Check them, then pay.')
  })

  it('the row the queue really writes is read the same way: Rosalind Tay is told to check, everybody else to ask her', () => {
    const r = { id: 'inv-441', number: 'PR-2026-0441', vendorName: 'Pinnacle Resourcing', outstandingCents: 416000, currency: 'USD', dueAt: new Date('2026-11-20T00:00:00Z'), receivedAt: null }
    const now = new Date('2026-11-08T00:00:00Z')
    const row = (says: string, mayCheck: boolean) => queueFrom({ data: { total: 1, decisions: [{ type: 'INVOICE_RECEIPT_HELD', named: { whose: 'Pinnacle Resourcing' }, ...bankHeldReceiptDecision(r, { says, mayCheck }, now) }] } })!
    const [theirs] = queueCards(row('Bank details not checked. Ask Rosalind Tay to check them, then pay.', false))
    expect(theirs.fact).toBe('Bank details not checked. Ask Rosalind Tay to check them, then pay.')
    expect(theirs.open).toBe(OPEN_THE_RECEIPT)
    const [hers] = queueCards(row('Bank details not checked. Check them, then pay.', true))
    expect(hers.open).toBe(CHECK_THE_BANK)
    expect(hers.href).toBe('/dashboard/invoices/inv-441#pay')
    for (const c of [theirs, hers]) expect(c.open).not.toBe('Pay')
  })

  it('where the queue says who checks in a field of its own, the chat takes the queue’s word', () => {
    const q = queueFrom({ data: { total: 1, decisions: [{ ...heldRow(), named: { whose: 'Pinnacle Resourcing' }, mayCheck: true, reason: 'Bank details not checked. Check them, then pay.' }] } })!
    const [card] = queueCards(q)
    expect(card.open).toBe(CHECK_THE_BANK)
    expect(card.fact).toBe('Bank details not checked. Check them, then pay.')
  })

  it('the greeting names the held receipt as the hold, never as waiting to be paid', () => {
    const q: QueueRead = { total: 1, items: [heldRow()] }
    expect(queueName(heldRow())).toBe('PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked')
    expect(namedNeedsSays(q, [])!.says).not.toMatch(/waits for you to pay/)
  })

  it('a receipt held because the hours do not match keeps its own title, and is still never Pay', () => {
    const hours = heldRow({ title: 'Held: hours don’t match — Pinnacle Resourcing', subtitle: 'Invoice PR-2026-0442 · $4,980.00 · 41.5 hours billed, 40 signed · it can be paid once Pinnacle Resourcing corrects it' })
    const [card] = queueCards({ total: 1, items: [hours] })
    expect(card.title).toBe('Held: hours don’t match — Pinnacle Resourcing.')
    expect(card.open).not.toBe('Pay')
  })

  it('“Which invoice receipts can I pay?” says a bank-held receipt in its own sentence and offers it no Pay row', async () => {
    const q: QueueRead = { total: 1, items: [heldRow()] }
    const none = async () => []
    const read = {
      waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
      told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
      entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
      ledgerLines: none, modelOn: async () => false, vocabulary: async () => ({ people: [], firms: [] }),
      model: async () => null, logPrompt: async () => undefined,
    } as unknown as Readers
    const a = await respond('Which invoice receipts can I pay?', read, {
      env: {}, party: 'CLIENT', companyKind: 'CLIENT', ownCompany: 'Northbend Athletic', permissions: ['*'], needs: async () => q,
    })
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.says).toContain('No invoice receipt is ready for you to pay.')
    expect(a.says).toContain('PR-2026-0441 from Pinnacle Resourcing is held: the bank details are not checked. Ask Rosalind Tay to check them, then pay.')
    expect(a.table).toBeUndefined()
  })
})
