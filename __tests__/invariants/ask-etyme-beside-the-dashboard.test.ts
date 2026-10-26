/**
 * Ask Etyme runs beside the dashboard, never apart from it (the founder's
 * walk of fifteen seats, 2026-10-22: "does Ask Etyme run parallel to the
 * dashboard?" — the verdict was no). Each sentence here is one place the
 * chat and a page disagreed, and now read the same rule.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { respond, unbilledSays, unbilledTable, type Readers, type UnbilledRow } from '@/app/api/conversations/twin/ask'
import { anotherFirmsMoney, asksAboutFirmMoney, NOT_ANOTHER_BOOK } from '@/app/api/conversations/twin/transaction'

const NOW = new Date('2026-10-12T15:00:00Z')
const NO_KEY = {} as Record<string, string | undefined>
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const TECHPEPLE = {
  people: ['Helena Marsh', 'Linnea Qadri'],
  firms: ['Techpeple', 'Computer Systems Inc', 'Brightmoor Staffing', 'Northbend Athletic'],
}

/** A reader with nothing on it, and a model that must never be asked. */
function readers(over: Partial<Readers> = {}): Readers {
  return {
    waiting: async () => [], entry: async () => null,
    receiptsIn: async () => ({ ok: true as const, receipts: [] }), othersWaiting: async () => [],
    limits: async () => ({ ok: true as const, entries: [] }), told: async () => ({ told: [], stale: [] }),
    named: async () => ({}), unsignedWeeks: async () => ({ ok: true as const, rows: [], total: 0, company: 'Techpeple', maySign: false }),
    spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }), ledgerLines: async () => [],
    modelOn: async () => true, vocabulary: async () => TECHPEPLE,
    model: async () => { throw new Error('the model was asked') }, logPrompt: async () => {},
    ...over,
  }
}

describe('signed weeks not billed: the chat reads the Today figure, so it never asks for a week to be billed twice', () => {
  it('the chat reads its signed-and-not-billed weeks from the same list the Today page counts, never a second rule', () => {
    const read = src('src/app/api/conversations/twin/read.ts')
    const body = read.slice(read.indexOf('async unbilledWeeks()'), read.indexOf('async unpaidBills()'))
    expect(body).toContain('firmTuesday(company.id)')
    expect(body).toContain('signedNotBilled.weeks')
    // No list of its own: the chat does not read invoice lines to decide what is billed.
    expect(body).not.toContain('invoiceLines')
  })

  it('an account manager behind an account wall reads only the weeks on their own accounts, and never a week Today does not count', () => {
    const read = src('src/app/api/conversations/twin/read.ts')
    const body = read.slice(read.indexOf('async unbilledWeeks()'), read.indexOf('async unpaidBills()'))
    expect(body).toContain('weeks = weeks.filter((w) => ids.has(w.sellContractId))')
  })

  const helena: UnbilledRow = {
    timesheetId: 'ts-h', person: 'Helena Marsh', customer: 'Computer Systems Inc', periodStart: '2026-09-20', periodEnd: '2026-09-26',
    hours: 40, signedOn: '2026-09-28', href: '/dashboard/weeks/ts-h', amountMinor: 472000, currency: 'USD', draft: null,
  }

  it('a week held by a draft bill nobody has sent is told as "send the draft", not "bill it"', () => {
    const onDraft = { ...helena, draft: 'INV-D41' }
    expect(unbilledSays([onDraft], NOW)).toBe(
      'Send draft bill INV-D41 to Computer Systems Inc for Helena Marsh’s week of Sep 20–26 first; it was signed 14 days ago. ' +
      'One signed week is on no sent bill yet. It is on a draft bill nobody has sent. Checked just now.')
  })

  it('the table says what each week bills, as Today prices it, and which draft holds it', () => {
    const t = unbilledTable([helena, { ...helena, timesheetId: 'ts-2', amountMinor: null, draft: 'INV-D41' }])
    expect(t.head).toEqual(['Person', 'Week', 'Hours', 'Customer', 'Bills'])
    expect(t.rows[0].cells[4]).toBe('$4,720.00')
    expect(t.rows[1].cells[4]).toBe('— · draft INV-D41')
  })
})

describe('another company’s book is refused in one sentence, before any model', () => {
  it('"What does Brightmoor Staffing pay Helena Marsh?" asked at Techpeple is refused as another company’s book, and the model is never considered', async () => {
    const a = await respond('What does Brightmoor Staffing pay Helena Marsh?', readers(), { env: NO_KEY, now: NOW, ownCompany: 'Techpeple', party: 'FIRM' })
    expect(a).toEqual({ kind: 'TEXT', says: NOT_ANOTHER_BOOK })
  })

  it('"What does Northbend Athletic pay Pinnacle Resourcing?" asked at a firm that is neither is refused the same way', async () => {
    const a = await respond('What does Northbend Athletic pay Pinnacle Resourcing?', readers(), { env: NO_KEY, now: NOW, ownCompany: 'Techpeple', party: 'FIRM' })
    expect(a).toEqual({ kind: 'TEXT', says: NOT_ANOTHER_BOOK })
  })

  it('a firm’s rates named by another firm, and money "paid by" another firm, are refused too', () => {
    expect(anotherFirmsMoney('What are Brightmoor Staffing’s bill rates?', 'Techpeple', TECHPEPLE)).toBe(true)
    expect(anotherFirmsMoney('How much is Helena Marsh paid by Brightmoor Staffing?', 'Techpeple', TECHPEPLE)).toBe(true)
  })

  it('what a firm pays or owes the reader is the reader’s own book and is not refused', () => {
    expect(anotherFirmsMoney('What does Computer Systems Inc owe us?', 'Techpeple', TECHPEPLE)).toBe(false)
    expect(anotherFirmsMoney('What does Northbend Athletic pay Techpeple?', 'Techpeple', TECHPEPLE)).toBe(false)
    expect(anotherFirmsMoney('What does Northbend Athletic pay Pinnacle Resourcing?', 'Northbend Athletic', TECHPEPLE)).toBe(false)
    expect(anotherFirmsMoney('What do we pay Helena Marsh?', 'Techpeple', TECHPEPLE)).toBe(false)
  })

  it('what a person on the record earns is not read as a firm’s book by this rule', () => {
    expect(anotherFirmsMoney('What does Helena Marsh earn?', 'Techpeple', TECHPEPLE)).toBe(false)
  })

  it('a question with no firm’s money in it costs no read of the names', () => {
    expect(asksAboutFirmMoney('Who is on the bench?')).toBe(false)
    expect(asksAboutFirmMoney('What does Brightmoor Staffing pay Helena Marsh?')).toBe(true)
    // The reader's own spend, and "other companies" (the benchmark rule's), are settled by the words alone.
    expect(asksAboutFirmMoney('What did we spend by supplier this month?', 'Northbend Athletic')).toBe(false)
    expect(asksAboutFirmMoney('What do other companies pay for a data engineer?', 'Northbend Athletic')).toBe(false)
    expect(asksAboutFirmMoney('What is our average bill rate for data engineers?', 'Northbend Athletic')).toBe(false)
  })
})
