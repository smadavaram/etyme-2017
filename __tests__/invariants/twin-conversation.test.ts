/**
 * Ask Etyme, the twin's second door (CLAUDE.md, "The job twin"), a chat
 * inside Conversations since the founder's prototype of 2026-10-12:
 * rules first, the model second, and the chat never writes state itself.
 *
 * One file, by the founder's testing rule for the twin. The rules are
 * tested through `respond` and `today` with the record's reads faked, so
 * a test is about what the chat answers and not about a seed; the "never
 * writes" sentence also reads the chat's own source, because a write
 * added tomorrow is a line of code, not a behavior a fake would show.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  respond, today, othersSay, VOICE_RULES, neverAct, matchPerson, boundarySays, readAsk, decisionRequest, varianceBySupplier, spendBySupplier, MODEL_SYSTEM, ASK_THE_DESK, NO_MODEL,
  SUGGESTED_QUESTIONS, FOOTER_LINE, GREETING_CLOSE,
  type Readers, type WaitingItem, type VarianceReceipt, type LimitEntry, type OtherWaiting, type SpendReceipt,
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
  action: 'invoice_receipt.approve',
}]

const ENTRY_442 = {
  id: 'entry-442', says: 'Tell the desk that pays that an invoice receipt and the accepted hours or the contract rate do not agree.',
  ruleCited: 'Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.',
  rationale: 'Ask Pinnacle Resourcing to bill the hours accepted, or have the paying desk record why the difference stands. Nothing is paid until the three-way check passes.',
  entityType: 'Invoice', entityId: 'inv-442',
}

// Tobias Lindqvist, sixty days from the limit on the day the world is
// born, as the twin's nightly run records him; an older warning for him
// is superseded by the newer one.
const LIMITS: LimitEntry[] = [
  { personId: 'p-tobias', personName: 'Tobias Lindqvist', limitOn: '2026-12-11T00:00:00.000Z', capMonths: 18, suppliers: ['Pinnacle Resourcing'], recordedAt: '2026-10-12T02:00:00.000Z' },
  { personId: 'p-tobias', personName: 'Tobias Lindqvist', limitOn: '2026-12-12T00:00:00.000Z', capMonths: 18, suppliers: ['Pinnacle Resourcing'], recordedAt: '2026-09-12T02:00:00.000Z' },
]

// What the program manager reads as waiting on somebody else: the
// receipts the AP clerk approves.
const OTHERS: OtherWaiting[] = [
  { title: 'PR-2026-0441', noun: 'invoice receipt', desks: ['AP Clerk'], own: false, href: '/dashboard/invoices/inv-441' },
  { title: 'IN-XSWQQZ-20260901', noun: 'invoice receipt', desks: ['AP Clerk'], own: false, href: '/dashboard/invoices/inv-cs' },
]

const SPEND: SpendReceipt[] = [
  { invoiceId: 'inv-441', number: 'PR-2026-0441', supplier: 'Pinnacle Resourcing', currency: 'USD', totalMinor: 380000, paidMinor: 0 },
  { invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', currency: 'USD', totalMinor: 394250, paidMinor: 0 },
  { invoiceId: 'inv-cs', number: 'IN-XSWQQZ-20260901', supplier: 'Computer Systems', currency: 'USD', totalMinor: 360000, paidMinor: 360000 },
  { invoiceId: 'inv-uk', number: 'UK-1', supplier: 'Computer Systems', currency: 'GBP', totalMinor: 100000, paidMinor: 0 },
]

// The people on Northbend's placements, newest placement first.
const ROSTER = [
  { personId: 'p-helena', name: 'Helena Marsh', contractId: 'sc-helena' },
  { personId: 'p-helena', name: 'Helena Marsh', contractId: 'sc-helena-old' },
  { personId: 'p-omar', name: 'Omar Haddad', contractId: 'sc-omar' },
  { personId: 'p-tobias', name: 'Tobias Lindqvist', contractId: 'sc-tobias' },
]

function readers(over: Partial<Readers> = {}): Readers & { model: ReturnType<typeof vi.fn> } {
  return {
    waiting: vi.fn(async () => WAITING),
    othersWaiting: vi.fn(async () => OTHERS),
    limits: vi.fn(async () => ({ ok: true as const, entries: LIMITS })),
    unsignedWeeks: vi.fn(async () => ({
      ok: true as const, total: 1, company: 'Northbend Athletic',
      rows: [{ timesheetId: 'ts-1', personId: 'p-helena', person: 'Helena Marsh', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 44, waitingDays: 2, href: '/dashboard/weeks/ts-1' }],
    })),
    spendIn: vi.fn(async () => ({ ok: true as const, receipts: SPEND, undated: 1 })),
    told: vi.fn(async () => ({ told: [], stale: [] })),
    named: vi.fn(async (text: string) => ({
      ...matchPerson(text, ROSTER),
      ...(/PR-2026-0441/.test(text) ? { receipt: { number: 'PR-2026-0441', invoiceId: 'inv-441' } } : {}),
    })),
    entry: vi.fn(async (ref: string) => (ref === 'entry-442' || ref === 'PR-2026-0442' || ref === 'entry-441' ? (ref === 'entry-441' ? { ...ENTRY_442, id: 'entry-441', ruleCited: WAITING[0].ruleCited, rationale: WAITING[0].rationale } : ENTRY_442) : null)),
    receiptsIn: vi.fn(async () => ({ ok: true as const, receipts: NORTHBEND_RECEIPTS })),
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
    // Counted by the day each was billed, the same day spend counts by; nobody "asked" for the re-check.
    expect(a.says).toContain('Counted by the day each was billed, and checked just now against the three-way check.')
    expect(a.says).not.toContain('as you asked')

    // A week nobody accepted is never counted as over, and a supplier
    // with no accepted week has no figure rather than a zero.
    const held = varianceBySupplier([
      { invoiceId: 'x', number: 'X-1', supplierName: 'Brightmoor', verdict: 'BLOCKED', lines: [{ hoursBilled: 44, hoursAccepted: null, isHours: true }] },
    ])
    expect(held[0]).toMatchObject({ held: 1, hoursOverAccepted: null, hoursNotAccepted: 44 })
  })

  it('approve and reject in Ask Etyme call the one approval route and never write state themselves', async () => {
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

    // The request the chat sends: the one approval route, from the web.
    const req = decisionRequest('appr-441', 'REJECTED', 'the hours are over what we signed')
    expect(req.url).toBe('/api/twin/approvals/appr-441')
    expect(req.init.method).toBe('POST')
    expect(JSON.parse(req.init.body)).toEqual({ decision: 'REJECTED', reason: 'the hours are over what we signed', surface: 'WEB' })

    // And nothing in the chat, its route or its reads writes the record.
    const root = join(process.cwd(), 'src')
    const files = [
      'app/api/conversations/twin/route.ts', 'app/api/conversations/twin/ask.ts', 'app/api/conversations/twin/read.ts',
      'app/dashboard/conversations/ask-etyme.tsx', 'components/twin-conversation.tsx',
    ]
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src, f).not.toMatch(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/)
      expect(src, f).not.toMatch(/\$transaction|\bdecideApproval\b|\brequestApproval\b|from '@\/lib\/twin\/ledger'.*\bact\b/)
    }
    const chat = readFileSync(join(root, 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    expect(chat).toContain('decisionRequest(item.approvalId, decision, reason)')
    // The chat reaches two places only: its own question route (the
    // greeting and each question), and the one approval route.
    const calls = [...chat.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim())
    expect(calls).toEqual(["'/api/conversations/twin'", "'/api/conversations/twin'", 'url'])
    // After a yes the reply links to the record and to the ledger entry.
    expect(chat).toContain("{ label: 'See it in the ledger', href: entryHref(entry) }")
    // "Not now" changes nothing: it is the chat's own state, never a request.
    expect(chat).toContain("const later = (item: WaitingItem) => setCards((c) => ({ ...c, [item.approvalId]: { state: 'LATER' } }))")
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

  it('with no model key Ask Etyme still answers the rule-based questions and says the model is not configured', async () => {
    const read = readers()

    expect((await respond('What needs me?', read, { env: NO_KEY })).kind).toBe('NEEDS')

    // The four chips are each answered by rules.
    const [needs, limit, spend, weeks] = await Promise.all(SUGGESTED_QUESTIONS.map((q) => respond(q, read, { env: NO_KEY, now: NOW })))
    expect(needs.kind).toBe('NEEDS')
    expect(limit).toMatchObject({ kind: 'TIME_LIMIT', rows: [{ personId: 'p-tobias', daysToLimit: 60, limitOn: '2026-12-11' }] })
    expect(limit.says).toContain('Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.')
    expect(weeks).toMatchObject({ kind: 'WEEKS', rows: [{ person: 'Helena Marsh', hours: 44 }] })
    expect(weeks.says).toBe('Sign Helena Marsh’s week first; it has waited 2 days. One week waits for a signature at Northbend Athletic. Checked just now.')
    expect(spend.kind).toBe('SPEND')
    if (spend.kind !== 'SPEND') return
    // This month, read by the calendar; never two currencies added.
    expect(read.spendIn).toHaveBeenCalledWith(new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))
    expect(spend.rows.map((r) => [r.supplier, r.currency, r.billedMinor, r.paidMinor])).toEqual([
      ['Computer Systems', 'GBP', 100000, 0],
      ['Pinnacle Resourcing', 'USD', 774250, 0],
      ['Computer Systems', 'USD', 360000, 360000],
    ])
    expect(spend.says).toBe(
      'Two suppliers billed you £1,000.00 and $11,342.50 in Oct 2026, on 4 invoice receipts. ' +
      'Of that, £0.00 and $3,600.00 is paid. Counted by the day each was billed, and checked just now. ' +
      'One invoice receipt has no billing date, so no month counts it.'
    )
    expect(spendBySupplier([])).toEqual([])

    // A seat that may not read a figure is told which desk does, in words.
    const refused = await respond('Who is near the time limit?', readers({ limits: async () => ({ ok: false, says: 'Reading who is near the time limit is done by Program Manager at Northbend Athletic.' }) }), { env: NO_KEY })
    expect(refused).toEqual({ kind: 'TEXT', says: 'Reading who is near the time limit is done by Program Manager at Northbend Athletic.', links: undefined })
    expect((await respond('show me invoice variance by supplier this quarter', read, { env: NO_KEY, now: NOW })).kind).toBe('VARIANCE')
    expect((await respond('why entry-442', read, { env: NO_KEY })).kind).toBe('WHY')
    expect((await respond('approve 1', read, { env: NO_KEY })).kind).toBe('CONFIRM')

    const other = await respond('Which supplier is slowest to send its invoice?', read, { env: NO_KEY })
    expect(other).toEqual({ kind: 'TEXT', says: NO_MODEL })
    expect(other.says).toBe('I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
    expect(read.model).not.toHaveBeenCalled()

    // With a key, only that question goes to the model, which is told it
    // may describe the record and must send every act to the desk.
    const withKey = await respond('Which supplier is slowest to send its invoice?', read, { env: KEY })
    expect(read.model).toHaveBeenCalledTimes(1)
    expect(withKey).toMatchObject({ kind: 'MODEL', links: [{ href: '/dashboard/invoices/inv-442' }] })
    expect(MODEL_SYSTEM).toContain(ASK_THE_DESK)
    // Where the model is on, the voice guide is its instruction, word for word, and the guide on disk says the same.
    const guide = readFileSync(join(process.cwd(), 'docs/ask-etyme-voice.md'), 'utf8')
    for (const rule of VOICE_RULES) {
      expect(MODEL_SYSTEM).toContain(rule)
      expect(guide).toContain(rule)
    }
    expect(VOICE_RULES).toHaveLength(12)
    expect(ASK_THE_DESK).toBe('I cannot do that; ask the desk.')
    expect(readAsk('please approve the receipt for me')).toEqual({ kind: 'ASK', text: 'please approve the receipt for me' })
  })

  it('Ask Etyme is the first conversation in the list and opens as a chat', () => {
    const root = join(process.cwd(), 'src')
    const list = readFileSync(join(root, 'app/dashboard/conversations/page.tsx'), 'utf8')
    // Pinned above every thread, with the Etyme mark and "Always here", opening on its own address.
    const pinned = list.indexOf('<Chip tone="action">Always here</Chip>')
    expect(pinned).toBeGreaterThan(-1)
    expect(pinned).toBeLessThan(list.indexOf('{filtered.map((c) => ('))
    expect(list).toContain("const ASK_ETYME_HREF = '/dashboard/conversations/etyme'")
    expect(list).toContain('<EtymeMark size={22} />')
    expect(list).toContain('<AskEtyme />')
    // On a phone one screen at a time: an open chat hides the list.
    expect(list).toContain("${activeConvo || askOpen ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[340px]")
    expect(readFileSync(join(root, 'app/dashboard/conversations/etyme/page.tsx'), 'utf8')).toContain('return <ConversationsPage />')

    // A chat: the header says "Ask Etyme" and never "twin", four chips, the box, the footer line.
    const chat = readFileSync(join(root, 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    const header = chat.slice(chat.indexOf('<header'), chat.indexOf('</header>'))
    expect(header).toContain('Ask Etyme</h1>')
    expect(header).not.toMatch(/\btwin\b(?!’s ledger)/i)
    expect(header).toContain('aria-label="Back to Conversations"')
    expect(header).toContain('aria-label="Close Ask Etyme"')
    expect(SUGGESTED_QUESTIONS).toEqual(['What needs me today?', 'Who is near the time limit?', 'What did we spend by supplier this month?', 'Which weeks are unsigned?'])
    expect(FOOTER_LINE).toBe('Etyme answers from the record and its rules. It asks before any outside message or money moves, and every act is in the ledger.')
    expect(chat).toContain('{FOOTER_LINE}')
    expect(chat).toContain('placeholder="Ask Etyme about your program…"')
    // The boundary is said on the first screen, and says the truth about the model.
    expect(chat).toContain('{boundarySays(modelOn)}')
    expect(boundarySays(false)).toBe('Your data stays in your company. Every read is logged. Nothing leaves to a model unless your company turns it on.')
    expect(boundarySays(true)).toBe('Your data stays in your company. Every read is logged. Free-text questions go to the model turned on for this deployment; the rules answer first.')
    // The twin's page links to it rather than drawing a second chat.
    expect(readFileSync(join(root, 'components/twin-conversation.tsx'), 'utf8')).toContain("href={'/dashboard/conversations/etyme' as Route}")
  })

  it('the greeting is built from the rules — what waits on you, what waits on another desk, and who is near the time limit — and never from the model', async () => {
    const read = readers()
    const hello = await today(read, { now: NOW, greeting: true, picture: { onSite: 12, suppliers: 4 } })
    expect(hello).toMatchObject({ kind: 'NEEDS', greeting: true, items: WAITING })
    if (hello.kind !== 'NEEDS') return
    // Recommendation first, the fact second, and when it looked.
    expect(hello.recommend).toEqual({ says: 'Approve PR-2026-0441 from Pinnacle Resourcing; it passes the three-way check.', links: [{ text: 'PR-2026-0441 from Pinnacle Resourcing', href: '/dashboard/invoices/inv-441' }] })
    expect(hello.says).toBe('Etyme is asking you one thing; approve it below, or reject it with a reason. Checked just now.')
    const says = (a: typeof hello) => (a.kind === 'NEEDS' ? (a.more ?? []).map((l) => l.says) : [])
    expect(says(hello)).toEqual([
      'Two invoice receipts wait for the AP Clerk: PR-2026-0441 and IN-XSWQQZ-20260901. Neither is yours to sign.',
      'Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.',
      // The program's picture, from /api/program's own counts and this month's invoice receipts, never two currencies added.
      '12 contractors are on site today, through four suppliers.',
      'Suppliers billed you £1,000.00 and $11,342.50 so far in Oct 2026.',
      GREETING_CLOSE,
    ])
    // Each receipt, the person and each figure link from inside the sentence.
    expect(hello.more!.map((l) => l.links ?? [])).toEqual([
      [{ text: 'PR-2026-0441', href: '/dashboard/invoices/inv-441' }, { text: 'IN-XSWQQZ-20260901', href: '/dashboard/invoices/inv-cs' }],
      [{ text: 'Tobias Lindqvist', href: '/dashboard/people/p-tobias' }],
      [{ text: '12 contractors', href: '/dashboard/people' }],
      [{ text: '£1,000.00', href: '/dashboard/invoices' }, { text: '$11,342.50', href: '/dashboard/invoices' }],
      [],
    ])
    // No second row repeating the links the sentences already carry.
    expect(hello.links).toBeUndefined()
    // Told, not asked: the paying desk reads the receipt the twin told it about, first, with its link.
    const ap = await today(readers({ told: async () => ({ told: [{ invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', hoursBilled: 41.5, hoursAccepted: 40 }], stale: [] }) }), { now: NOW, greeting: true })
    expect(ap.kind === 'NEEDS' && ap.more![0]).toEqual({
      says: 'PR-2026-0442 bills 41.5 hours against 40 accepted; it cannot be paid until Pinnacle Resourcing corrects it.',
      links: [{ text: 'PR-2026-0442', href: '/dashboard/invoices/inv-442' }],
    })
    // At most six lines before the closing sentence, however much is waiting.
    const busy = await today(readers({ othersWaiting: async () => Array.from({ length: 9 }, (_, i) => ({ ...OTHERS[0], title: `R-${i}`, desks: [`Desk ${i}`] })) }), { now: NOW, greeting: true, picture: { onSite: 12, suppliers: 4 } })
    // The recommendation and the headline are two of the six.
    expect(busy.kind === 'NEEDS' && busy.more!.length).toBe(4 + 1)
    // The program manager, on whose authority Etyme asks, reads why none of it is theirs.
    expect(othersSay(OTHERS.map((o) => ({ ...o, own: true }))).map((l) => l.says)).toEqual([
      'Two invoice receipts wait for the AP Clerk: PR-2026-0441 and IN-XSWQQZ-20260901. Neither is yours to sign: Etyme asked on your authority.',
    ])
    expect(read.model).not.toHaveBeenCalled()

    // A desk that reads neither what the rules found nor the invoice book is greeted without those lines, not refused.
    const quiet = await today(readers({ waiting: async () => [], othersWaiting: async () => [], limits: async () => ({ ok: false, says: 'no' }), spendIn: async () => ({ ok: false, says: 'no' }) }), { now: NOW, greeting: true })
    expect(quiet).toMatchObject({ kind: 'NEEDS', says: 'Nothing needs you today, and nothing Etyme asked waits on anybody. Checked just now.', more: [{ says: GREETING_CLOSE }] })
  })

  it('an act on the never floor asked in the chat is refused in a sentence that names who does it, and never reaches the model', async () => {
    const read = readers()
    const extend = await respond('Please extend Helena Marsh by three months', read, { env: KEY, companyKind: 'VENDOR' })
    expect(extend.kind).toBe('TEXT')
    // One sentence, and the link opens the placement the question names.
    expect(extend.says).toMatch(/^Etyme never extends a placement; your .*Contract Manager.* does it on Helena Marsh’s placement page\.$/)
    expect(extend.says).not.toContain('assignments.write')
    expect(extend).toMatchObject({ links: [{ label: 'Open Helena Marsh’s placement', href: '/dashboard/placements/sc-helena' }] })
    // The founder's own sentence: a first name is enough when one person on the placements carries it.
    const founder = await respond('Extend Helena three months', read, { env: KEY, companyKind: 'CLIENT' })
    expect(founder.says).toMatch(/^Etyme never extends a placement; your .+ does it on Helena Marsh’s placement page\.$/)
    expect(founder).toMatchObject({ links: [{ label: 'Open Helena Marsh’s placement', href: '/dashboard/placements/sc-helena' }] })
    // Two Helenas: one question naming both, and no link.
    const twoHelenas = [...ROSTER, { personId: 'p-ruiz', name: 'Helena Ruiz', contractId: 'sc-ruiz' }]
    const which = await respond('Extend Helena three months', readers({ named: async (t) => matchPerson(t, twoHelenas) }), { env: KEY, companyKind: 'CLIENT' })
    expect(which).toEqual({ kind: 'TEXT', says: 'Helena Marsh or Helena Ruiz?', links: [] })
    expect(matchPerson('Extend Helena Marsh three months', twoHelenas)).toEqual({ person: { name: 'Helena Marsh', contractId: 'sc-helena' } })
    expect(matchPerson('extend Haddad', twoHelenas)).toEqual({ person: { name: 'Omar Haddad', contractId: 'sc-omar' } })
    // Nobody named: the list where it is done.
    const anyone = await respond('extend the placement', read, { env: KEY, companyKind: 'VENDOR' })
    expect(anyone).toMatchObject({ links: [{ href: '/dashboard/contracts' }] })
    expect(anyone.says).toMatch(/^Etyme never extends a placement; your .+ does it on the placement page\.$/)

    expect(neverAct('end Omar Haddad’s placement on Friday')).toBe('END')
    expect(neverAct('Award the job to Priya')).toBe('AWARD')
    expect(neverAct('pay PR-2026-0441')).toBe('PAY')
    expect(neverAct('can you run payroll for October')).toBe('PAYROLL')
    expect(neverAct('sign the MSA with Veritan')).toBe('SIGN_AGREEMENT')
    expect(neverAct('sign Helena’s week')).toBe('SIGN_WEEK')
    expect(neverAct('reject the submission from Brightmoor')).toBe('REJECT_SUBMISSION')
    // Not acts: Etyme's own question answered, a question about an act, the unsigned-weeks chip.
    expect(neverAct('reject 1 because the hours are over')).toBeNull()
    expect(neverAct('who extended Helena?')).toBeNull()
    expect(neverAct('Which weeks are unsigned?')).toBeNull()

    // A seat that holds the desk is told it does it itself.
    const own = await respond('extend Helena Marsh', read, { env: KEY, companyKind: 'CLIENT', permissions: ['assignments.write'] })
    expect(own.says).toBe('Etyme never extends a placement; you hold that desk, so do it on Helena Marsh’s placement page.')

    const pay = await respond('pay PR-2026-0441', read, { env: KEY, companyKind: 'CLIENT' })
    expect(pay.says).toMatch(/^Etyme never pays an invoice receipt; your .+ does it on PR-2026-0441’s page\.$/)
    expect(pay).toMatchObject({ links: [{ label: 'Open PR-2026-0441', href: '/dashboard/invoices/inv-441' }] })
    expect(read.model).not.toHaveBeenCalled()
  })
})
