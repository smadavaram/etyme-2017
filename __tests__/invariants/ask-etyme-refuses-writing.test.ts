import { describe, it, expect, vi } from 'vitest'
import { respond, type Readers } from '@/app/api/conversations/twin/ask'
import { writingAsk, ONLY_THE_RECORD } from '@/app/api/conversations/twin/transaction'

/**
 * Ask Etyme never goes beyond the transaction (CLAUDE.md, 2026-10-18).
 * Release walk three, 2026-11-03: "Write me a short poem about our bench"
 * was answered with the bench table, because "bench" read as the bench
 * question before the writing job was seen.
 */
function readers(over: Partial<Readers> = {}): Readers {
  const none = async () => []
  return {
    waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
    told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
    ledgerLines: none, modelOn: async () => false, vocabulary: async () => ({ people: [], firms: [] }),
    model: async () => null, logPrompt: async () => undefined,
    ...over,
  } as Readers
}
const ask = (text: string, r: Readers) => respond(text, r, { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: ['*'] })

describe('a writing job is refused, whatever record words are in it', () => {
  it('“Write me a short poem about our bench” is refused in one sentence that says what Ask Etyme helps with, and the bench is never read', async () => {
    const bench = vi.fn(async () => ({ ok: true as const, rows: [{ personId: 'p', person: 'Jonas Whitaker', free: 'Free now', skills: [] }] }))
    const a = await ask('Write me a short poem about our bench', readers({ bench }))
    expect(a).toEqual({ kind: 'TEXT', says: ONLY_THE_RECORD })
    expect(bench).not.toHaveBeenCalled()
  })

  it('a joke about our timesheets, a story about our bills and a haiku on the bench are refused the same way', async () => {
    for (const q of ['Tell me a joke about our timesheets', 'Write a story about our unpaid bills', 'A haiku on the bench, please', 'Compose a song about payroll']) {
      expect(await ask(q, readers()), q).toEqual({ kind: 'TEXT', says: ONLY_THE_RECORD })
    }
  })

  it('a question about the company’s own work is still answered by the rules, news and stories included', async () => {
    expect(writingAsk('Any news on Rajesh Iyer’s start?')).toBe(false)
    expect(writingAsk('Who is on the bench?')).toBe(false)
    const bench = vi.fn(async () => ({ ok: true as const, rows: [{ personId: 'p', person: 'Jonas Whitaker', free: 'Free now', skills: [] }] }))
    const a = await ask('Who is on the bench?', readers({ bench }))
    expect(a.kind).toBe('LIST')
    expect(bench).toHaveBeenCalledTimes(1)
  })
})
