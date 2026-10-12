/**
 * The twin's conversation, Door 2 (CLAUDE.md, "The job twin"): rules
 * first, the model second, and the panel never writes state itself.
 *
 * One file, by the founder's testing rule for the twin. The rules are
 * tested through `respond` with the record's reads faked, so a test is
 * about what the panel answers and not about a seed; the "never writes"
 * sentence also reads the panel's own source, because a write added
 * tomorrow is a line of code, not a behavior a fake would show.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  respond, readAsk, decisionRequest, varianceBySupplier, MODEL_SYSTEM, ASK_THE_DESK, NO_MODEL,
  type Readers, type WaitingItem, type VarianceReceipt,
} from '@/app/api/conversations/twin/ask'

const NOW = new Date('2026-10-12T15:00:00Z')

// Northbend Athletic's three receipts, as the twin's demo seed writes them.
const NORTHBEND_RECEIPTS: VarianceReceipt[] = [
  { invoiceId: 'inv-cs', number: null, supplierName: 'Computer Systems', verdict: 'CLEAN', lines: [{ hoursBilled: 40, hoursAccepted: 40, isHours: true }] },
  { invoiceId: 'inv-441', number: 'PR-2026-0441', supplierName: 'Pinnacle Resourcing', verdict: 'CLEAN', lines: [{ hoursBilled: 40, hoursAccepted: 40, isHours: true }] },
  { invoiceId: 'inv-442', number: 'PR-2026-0442', supplierName: 'Pinnacle Resourcing', verdict: 'MISMATCH', lines: [{ hoursBilled: 41.5, hoursAccepted: 40, isHours: true }] },
]

const WAITING: WaitingItem[] = [{
  n: 1, approvalId: 'appr-441', entryId: 'entry-441',
  says: 'Approve a supplier’s invoice receipt that cleared the three-way check, so it can be paid.',
  title: 'PR-2026-0441 from Pinnacle Resourcing',
  ruleCited: 'Hours 40 against 40 accepted, at the contract’s $95.00/hr.',
  rationale: 'Nothing to decide: it matches the signed hours and the contract rate, and it can be paid.',
  href: '/dashboard/invoices/inv-441',
}]

const ENTRY_442 = {
  id: 'entry-442', says: 'Tell the desk that pays that an invoice receipt and the accepted hours or the contract rate do not agree.',
  ruleCited: 'Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.',
  rationale: 'Ask Pinnacle Resourcing to bill the hours accepted, or have the paying desk record why the difference stands. Nothing is paid until the three-way check passes.',
  entityType: 'Invoice', entityId: 'inv-442',
}

function readers(over: Partial<Readers> = {}): Readers & { model: ReturnType<typeof vi.fn> } {
  return {
    waiting: vi.fn(async () => WAITING),
    entry: vi.fn(async (ref: string) => (ref === 'entry-442' || ref === 'PR-2026-0442' || ref === 'entry-441' ? (ref === 'entry-441' ? { ...ENTRY_442, id: 'entry-441', ruleCited: WAITING[0].ruleCited, rationale: WAITING[0].rationale } : ENTRY_442) : null)),
    receiptsIn: vi.fn(async () => NORTHBEND_RECEIPTS),
    ledgerLines: vi.fn(async () => [{ id: 'entry-442', ts: NOW.toISOString(), says: ENTRY_442.says, outcome: 'PERFORMED', entityType: 'Invoice', entityId: 'inv-442', ruleCited: ENTRY_442.ruleCited, rationale: ENTRY_442.rationale }]),
    model: vi.fn(async () => 'One receipt is over the hours accepted [entry-442].'),
    ...over,
  } as Readers & { model: ReturnType<typeof vi.fn> }
}

const NO_KEY = {}
const KEY = { ANTHROPIC_API_KEY: 'sk-test' }

describe('the twin’s conversation answers from the ledger by rules before any model', () => {
  it('the variance question is answered from the ledger by rules, with one row per supplier and the hours over accepted', async () => {
    const read = readers()
    const a = await respond('Show me invoice variance by supplier this quarter', read, { env: KEY, now: NOW })

    expect(a.kind).toBe('VARIANCE')
    if (a.kind !== 'VARIANCE') return
    expect(read.model).not.toHaveBeenCalled()
    // This quarter, read by the calendar: October 1 to January 1.
    expect(read.receiptsIn).toHaveBeenCalledWith(new Date('2026-10-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
    expect(a.period.label).toBe('Q4 2026')

    expect(a.rows.map((r) => r.supplier)).toEqual(['Pinnacle Resourcing', 'Computer Systems'])
    const pinnacle = a.rows[0]
    expect(pinnacle).toMatchObject({ receipts: 2, clean: 1, mismatch: 1, held: 0, hoursOverAccepted: 1.5 })
    expect(pinnacle.receiptLinks.map((l) => l.href)).toEqual(['/dashboard/invoices/inv-441', '/dashboard/invoices/inv-442'])
    expect(a.rows[1]).toMatchObject({ receipts: 1, clean: 1, mismatch: 0, hoursOverAccepted: 0 })
    expect(a.says).toContain('1.5 hours billed over what was accepted')

    // A week nobody accepted is never counted as over, and a supplier
    // with no accepted week has no figure rather than a zero.
    const held = varianceBySupplier([
      { invoiceId: 'x', number: 'X-1', supplierName: 'Brightmoor', verdict: 'BLOCKED', lines: [{ hoursBilled: 44, hoursAccepted: null, isHours: true }] },
    ])
    expect(held[0]).toMatchObject({ held: 1, hoursOverAccepted: null, hoursNotAccepted: 44 })
  })

  it('approve and reject in the panel call the one approval route and never write state themselves', async () => {
    const read = readers()

    const yes = await respond('approve 1', read, { env: NO_KEY })
    expect(yes.kind).toBe('CONFIRM')
    if (yes.kind !== 'CONFIRM') return
    expect(yes.item.approvalId).toBe('appr-441')
    expect(yes.decision).toBe('APPROVED')

    const byNumber = await respond('Approve PR-2026-0441.', read, { env: NO_KEY })
    expect(byNumber.kind === 'CONFIRM' && byNumber.item.approvalId).toBe('appr-441')

    const noReason = await respond('reject 1', read, { env: NO_KEY })
    expect(noReason).toMatchObject({ kind: 'TEXT' })
    expect(noReason.says).toMatch(/^Say why/)

    const no = await respond('reject 1 because the hours are over what we signed', read, { env: NO_KEY })
    expect(no).toMatchObject({ kind: 'CONFIRM', decision: 'REJECTED', reason: 'the hours are over what we signed' })

    // The request the panel sends: the one approval route, from the web.
    const req = decisionRequest('appr-441', 'REJECTED', 'the hours are over what we signed')
    expect(req.url).toBe('/api/twin/approvals/appr-441')
    expect(req.init.method).toBe('POST')
    expect(JSON.parse(req.init.body)).toEqual({ decision: 'REJECTED', reason: 'the hours are over what we signed', surface: 'WEB' })

    // And nothing in the panel, its route or its reads writes the record.
    const root = join(process.cwd(), 'src')
    const files = ['app/api/conversations/twin/route.ts', 'app/api/conversations/twin/ask.ts', 'app/api/conversations/twin/read.ts', 'components/twin-conversation.tsx']
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src, f).not.toMatch(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/)
      expect(src, f).not.toMatch(/\$transaction|\bdecideApproval\b|\brequestApproval\b|from '@\/lib\/twin\/ledger'.*\bact\b/)
    }
    const panel = readFileSync(join(root, 'components/twin-conversation.tsx'), 'utf8')
    expect(panel).toContain('decisionRequest(item.approvalId, decision, reason)')
    // The panel posts to two places only: its own question route, and the one approval route.
    const posts = [...panel.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim())
    expect(posts).toEqual(["'/api/conversations/twin'", 'url'])
  })

  it('why on an entry answers with the ledger’s own rule and rationale', async () => {
    const read = readers()

    const a = await respond('Why entry-442?', read, { env: NO_KEY })
    expect(a).toMatchObject({ kind: 'WHY', ruleCited: ENTRY_442.ruleCited, rationale: ENTRY_442.rationale })
    if (a.kind !== 'WHY') return
    expect(a.links.map((l) => l.href)).toEqual(['/dashboard/twin#entry-entry-442', '/dashboard/invoices/inv-442'])

    // "Why 1" is the first thing waiting, read through its own entry.
    const first = await respond('why 1', read, { env: NO_KEY })
    expect(first).toMatchObject({ kind: 'WHY', ruleCited: WAITING[0].ruleCited, rationale: WAITING[0].rationale })
    expect(read.entry).toHaveBeenLastCalledWith('entry-441')

    const none = await respond('why nothing-here', read, { env: NO_KEY })
    expect(none.kind).toBe('TEXT')
    expect(none.says).toContain('There is no ledger entry')
    expect(read.model).not.toHaveBeenCalled()
  })

  it('with no model key the panel still answers the rule-based questions and says the model is not configured', async () => {
    const read = readers()

    expect((await respond('What needs me?', read, { env: NO_KEY })).kind).toBe('NEEDS')
    expect((await respond('show me invoice variance by supplier this quarter', read, { env: NO_KEY, now: NOW })).kind).toBe('VARIANCE')
    expect((await respond('why entry-442', read, { env: NO_KEY })).kind).toBe('WHY')
    expect((await respond('approve 1', read, { env: NO_KEY })).kind).toBe('CONFIRM')

    const other = await respond('Which supplier is slowest to send its invoice?', read, { env: NO_KEY })
    expect(other).toEqual({ kind: 'TEXT', says: NO_MODEL })
    expect(other.says).toMatch(/^The model is not set up on this deployment/)
    expect(read.model).not.toHaveBeenCalled()

    // With a key, only that question goes to the model, which is told it
    // may describe the record and must send every act to the desk.
    const withKey = await respond('Which supplier is slowest to send its invoice?', read, { env: KEY })
    expect(read.model).toHaveBeenCalledTimes(1)
    expect(withKey).toMatchObject({ kind: 'MODEL', links: [{ href: '/dashboard/invoices/inv-442' }] })
    expect(MODEL_SYSTEM).toContain(ASK_THE_DESK)
    expect(ASK_THE_DESK).toBe('I cannot do that; ask the desk.')
    expect(readAsk('please approve the receipt for me')).toEqual({ kind: 'ASK', text: 'please approve the receipt for me' })
  })
})
