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

// The prompt log is the architect's (lib/model-boundary); its store is
// faked here so the sentence about withholding a leak runs without a
// database. Nothing in Ask Etyme's own answering touches either.
const stored: Array<{ maskedPrompt: string; maskedAnswer: string; model: string; purpose: string }> = []
const noticeCalls: Array<{ op: string; args: any }> = []
const BILL_DB: { approvals: any[]; invoices: any[]; holds: any[]; otherSender: boolean } = { approvals: [], invoices: [], holds: [], otherSender: false }
const UNREAD = [
  { id: 'n-1', type: 'TIMESHEET', title: 'Helena Marsh filed her week', entityId: null, data: null },
  { id: 'n-2', type: 'SYSTEM', title: 'Priya joined Northbend Athletic', entityId: null, data: { href: '/dashboard/settings/users' } },
]
vi.mock('@/lib/db', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(async (args: any) => { noticeCalls.push({ op: 'findMany', args }); return UNREAD }),
      count: vi.fn(async (args: any) => { noticeCalls.push({ op: 'count', args }); return 7 }),
      updateMany: vi.fn(async (args: any) => { noticeCalls.push({ op: 'updateMany', args }); return { count: args.where.id.in.length } }),
    },
    // The supplier's bill (2026-10-18): the questions waiting, the bills
    // the firm sent, and the hold rows, each set by the test that reads it.
    twinApproval: { findMany: vi.fn(async () => BILL_DB.approvals) },
    invoice: { findMany: vi.fn(async () => BILL_DB.invoices) },
    automationLog: { findMany: vi.fn(async () => BILL_DB.holds) },
    // The owner-only exception (2026-10-19), read through the ledger's own
    // waitingQuestions: the shipped role contract, and whether anybody
    // else at the firm sends bills.
    roleContract: { findFirst: vi.fn(async () => null) },
    context: { findFirst: vi.fn(async () => (BILL_DB.otherSender ? { id: 'ctx-ines' } : null)) },
    modelPrompt: { create: vi.fn(async ({ data }: { data: { maskedPrompt: string; maskedAnswer: string; model: string; purpose: string } }) => { stored.push(data); return { id: `mp-${stored.length}` } }) },
  },
}))
vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))
import { recordModelPrompt, WITHHELD } from '@/lib/model-boundary'
import { feedWhere, OWNER_ONLY_EXCEPTION } from '@/lib/twin/ledger'
import { desksHolding } from '@/lib/permissions'
import { newMasker } from '@/app/api/conversations/twin/mask'
import { owedTotal } from '@/app/api/conversations/twin/owed'
import { owedFrom } from '@/lib/owed-count'
import { ONLY_THE_RECORD, NOT_ANOTHER_BOOK, offRecord, knownFirm, firmsByForm } from '@/app/api/conversations/twin/transaction'
import {
  workerToday, respondWorker, isWorkerSeat, owedSays, chainSays, cardsFor, WORKER_QUESTIONS, WORKER_CLOSE, WORKER_BOUNDARY, NEVER_FILES, limitLine,
  FILE_IT_YOURSELF, NOT_THEIR_RATE, ONLY_YOUR_WORK, WORKER_FOOTER, type WorkerFacts, type WorkerAnswer, type SentWeek,
} from '@/app/api/conversations/twin/worker'
import {
  respond, today, othersSay, VOICE_RULES, NO_SWITCH, SMALL_MODEL, MODEL_SYSTEM as SYSTEM, neverAct, matchPerson, boundarySays, readAsk, decisionRequest, varianceBySupplier, spendBySupplier, MODEL_SYSTEM, ASK_THE_DESK, NO_MODEL, payingDesks,
  SUGGESTED_QUESTIONS, FOOTER_LINE, GREETING_CLOSE, seatSays, SINCE_HEADING, DECISIONS_HREF, sinceSays, voiceBreaks,
  FIRM_QUESTIONS, SOLO_QUESTIONS, questionsFor, closeFor, placeholderFor, partyOf, queueFrom, queueCards, queueName, namedNeedsSays,
  threadsSay, whenSays, weekDueOn, billedSays, billingSays, rolloffSays, benchSays, unbilledSays, unpaidSays, OPEN_THE_LIST,
  sentencesOf, type QueueRead,
  billCardTitle, billRows, billFromPayload, billSentSays, billKeptSays, heldBillTitle, heldBillSays, NOT_NOW_REASON,
  NOT_GROUNDED, NOT_YET, REPLACED_NOTE, grounded, cardIdsOf,
  type Answer, type Readers, type WaitingItem, type VarianceReceipt, type LimitEntry, type OtherWaiting, type SpendReceipt,
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
  id: 'entry-442', says: 'Tell the person who pays that an invoice receipt and the accepted hours or the contract rate do not agree.',
  ruleCited: 'Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.',
  rationale: 'Ask Pinnacle Resourcing to bill the hours accepted, or have the AP clerk record why the difference stands. Nothing is paid until the three-way check passes.',
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
    // The company switch on, and the names this reader may read.
    modelOn: vi.fn(async () => true),
    vocabulary: vi.fn(async () => ({ people: ['Helena Marsh', 'Tobias Lindqvist'], firms: ['Pinnacle Resourcing', 'Computer Systems Inc', 'Northbend Athletic'] })),
    // The model sees tokens and answers in tokens: it names the first firm it was given.
    model: vi.fn(async (_system: string, _question: string, context: string) => ({
      text: `${context.match(/FIRM_\d+/)?.[0] ?? 'A supplier'} billed over the hours accepted [entry-442].`,
      model: SMALL_MODEL, tokensIn: 120, tokensOut: 14,
    })),
    logPrompt: vi.fn(async () => undefined),
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
    expect(a.says).toContain('1.5 hours billed over the approved hours')
    // Counted by invoice date, the same day spend counts by; nobody "asked" for the re-check.
    expect(a.says).toContain('Counted by invoice date, and checked just now against the three-way check.')
    expect(a.says).not.toContain('as you asked')

    // A week nobody accepted is never counted as over, and a supplier
    // with no accepted week has no figure rather than a zero.
    const held = varianceBySupplier([
      { invoiceId: 'x', number: 'X-1', supplierName: 'Brightmoor', verdict: 'BLOCKED', lines: [{ hoursBilled: 44, hoursAccepted: null, isHours: true }] },
    ])
    expect(held[0]).toMatchObject({ held: 1, hoursOverAccepted: null, hoursNotAccepted: 44 })
  })

  it('approve and reject in Ask Etyme call the one approval route and never write state themselves; the route keeps only the seat’s own conversation, through its one door', async () => {
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
    expect(noReason.says).toMatch(/^Give a reason/)

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
      'app/api/conversations/twin/worker.ts', 'app/api/conversations/twin/worker-read.ts',
      'app/dashboard/conversations/ask-etyme.tsx', 'components/twin-conversation.tsx',
    ]
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src, f).not.toMatch(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/)
      expect(src, f).not.toMatch(/\$transaction|\bdecideApproval\b|\brequestApproval\b|from '@\/lib\/twin\/ledger'.*\bact\b/)
    }
    const chat = readFileSync(join(root, 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    expect(chat).toContain('decisionRequest(item.approvalId, decision, reason)')
    // The chat reaches four places only: its own route (the greeting and the
    // saved lines, Show earlier, Clear, a card's mark, each question), the
    // one approval route, a decision card's own act on the one route that
    // already performs it, and — for a worker's own Renew — the bench route
    // her Who has you page already renews a stay through.
    expect(chat).toContain("const THREAD = '/api/conversations/twin'")
    expect(chat).toContain("const RENEW = '/api/me/benches'")
    const calls = [...chat.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim())
    expect(calls).toEqual(['THREAD', '`${THREAD}?only=thread&take=1000`', 'THREAD', 'THREAD', 'THREAD', 'url', 'card.act.url', 'RENEW'])
    // After a yes the reply links to the record and to the ledger entry,
    // and only then is the yes recorded on the line that drew the card.
    expect(chat).toContain("{ label: 'See it in the ledger', href: entryHref(entry) }")
    expect(chat.indexOf('await keepCard({ approvalId: item.approvalId, state: decision, turnId, number, said })')).toBeGreaterThan(chat.indexOf('const res = await fetch(url, init)'))
    // "Not now" sends nothing to the approval route: the card reads kept waiting, and its own line remembers.
    expect(chat).toContain("setCards((c) => ({ ...c, [item.approvalId]: { state: 'LATER' } }))")
    expect(chat).toContain("if (turnId) void keepCard({ approvalId: item.approvalId, state: 'LATER', turnId })")
    // The route writes the conversation only through lib/ask-etyme-thread,
    // and keeps a yes or a no only where the record already bears it out.
    const route = readFileSync(join(root, 'app/api/conversations/twin/route.ts'), 'utf8')
    expect(route).toContain("import { readThread, appendTurn, markCard, clearThread, type SavedThread, type SavedTurn, type CardState } from '@/lib/ask-etyme-thread'")
    expect(route).toMatch(/const onRecord = await prisma\.twinApproval\.findUnique\(\{ where: \{ id: approvalId \}, select: \{ decision: true \} \}\)\n\s+if \(onRecord\?\.decision !== state\)/)
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
    expect(weeks.says).toBe('Approve Helena Marsh’s timesheet first; it has waited 2 days. One timesheet is waiting for approval at Northbend Athletic. Checked just now.')
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
      'Two suppliers billed you £1,000.00 and $11,342.50 in Oct 2026, on 4 invoices. ' +
      'Of that, £0.00 and $3,600.00 is paid. Counted by invoice date, and checked just now. ' +
      'One invoice has no invoice date, so no month counts it.'
    )
    expect(spendBySupplier([])).toEqual([])

    // A seat that may not read a figure is told which desk does, in words.
    const refused = await respond('Who is near the time limit?', readers({ limits: async () => ({ ok: false, says: 'Reading who is near the time limit is done by Program Manager at Northbend Athletic.' }) }), { env: NO_KEY })
    expect(refused).toEqual({ kind: 'TEXT', says: 'Reading who is near the time limit is done by Program Manager at Northbend Athletic.', links: undefined })
    expect((await respond('show me invoice variance by supplier this quarter', read, { env: NO_KEY, now: NOW })).kind).toBe('VARIANCE')
    // The twin page's own line, and the way a person repeats it, reach the same rule.
    expect(readAsk('How do invoice receipts compare by supplier?')).toEqual({ kind: 'VARIANCE' })
    expect(readAsk('Compare invoice receipts by supplier')).toEqual({ kind: 'VARIANCE' })
    expect(readAsk('Invoice receipts by supplier')).toEqual({ kind: 'VARIANCE' })
    expect(readAsk('What did we spend by supplier this month?')).toEqual({ kind: 'SPEND' })
    expect((await respond('why entry-442', read, { env: NO_KEY })).kind).toBe('WHY')
    expect((await respond('approve 1', read, { env: NO_KEY })).kind).toBe('CONFIRM')

    const other = await respond('Which supplier is slowest to send its invoice?', read, { env: NO_KEY })
    expect(other).toEqual({ kind: 'TEXT', says: NO_MODEL })
    expect(other.says).toBe('I cannot answer that yet. This question needs the model, and it is not set up here. Try a question below.')
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
    expect(VOICE_RULES).toHaveLength(13)
    // The founder's trade-phrasing rule, 2026-10-14, is one of them.
    expect(VOICE_RULES).toContain('Say it the way a recruiter, hiring manager or AP clerk says it out loud: who applied, approve a timesheet, pay an invoice.')
    expect(ASK_THE_DESK).toBe('I cannot do that; ask the person whose job it is.')
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
    expect(header).toContain('aria-label="Close Ask Etyme"')
    expect(SUGGESTED_QUESTIONS).toEqual(['What needs me today?', 'Who is near the time limit?', 'What did we spend by supplier this month?', 'Which timesheets are waiting?'])
    expect(FOOTER_LINE).toBe('Etyme answers from the record and its rules. It asks before any outside message or money moves, and every act is in the ledger.')
    expect(chat).toContain('{worker ? WORKER_FOOTER : FOOTER_LINE}')
    expect(chat).toContain('placeholder={worker ? placeholderFor(\'WORKER\') : placeholderFor(party)}')
    // The boundary is said on the first screen, and says the truth about the model.
    expect(boundarySays('OFF')).toBe('Your data stays in your company. Every read is logged. Nothing leaves to a model; your company has not turned it on.')
    expect(boundarySays('ON')).toBe('Your data stays in your company. Every read is logged. Free-text questions go to the model your company turned on, masked; every prompt is logged under Settings.')
    expect(boundarySays('NO_KEY')).toBe('Your data stays in your company. Every read is logged. Nothing leaves to a model; it is not set up on this deployment.')
    // The twin's page links to it rather than drawing a second chat.
    expect(readFileSync(join(root, 'components/twin-conversation.tsx'), 'utf8')).toContain("href={'/dashboard/conversations/etyme' as Route}")
  })

  it('on a phone Ask Etyme draws no heading of its own: no back arrow, no title, no boundary line and no close under the header', () => {
    const chat = readFileSync(join(process.cwd(), 'src', 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    const header = chat.slice(chat.indexOf('<header'), chat.indexOf('</header>'))
    // Hidden below md, drawn from md up where the chat sits beside the list.
    expect(header).toMatch(/<header className="hidden [^"]*md:flex"/)
    expect(chat).not.toContain('Back to Conversations')
    // The boundary is no longer in any heading; the greeting says it.
    expect(chat).not.toContain('boundarySays')
  })

  it('the greeting closes on the boundary, once, as its last line, saying what is true about the model for this company', async () => {
    for (const state of ['OFF', 'ON', 'NO_KEY'] as const) {
      const hello = await today(readers(), { now: NOW, greeting: true, model: state })
      const said = hello.kind === 'NEEDS' ? (hello.more ?? []).map((l) => l.says) : []
      expect(said.slice(-2)).toEqual([GREETING_CLOSE, boundarySays(state)])
      expect(said.filter((l) => l === boundarySays(state))).toHaveLength(1)
    }
    // A question to the chat, not the greeting, never repeats it.
    const asked = await today(readers(), { now: NOW, model: 'OFF' })
    expect(asked.kind === 'NEEDS' && (asked.more ?? []).map((l) => l.says)).not.toContain(boundarySays('OFF'))
  })

  it('the greeting says the role and the company, and in the demo that the company is a sample; an MSP says whose program it runs, and a one-person firm is her own company', () => {
    expect(seatSays({ role: 'Hiring Manager', company: 'Northbend Athletic', sample: true })).toBe('You are the hiring manager at Northbend Athletic, a sample company.')
    expect(seatSays({ role: 'Hiring Manager', company: 'Acme Corp', sample: false })).toBe('You are the hiring manager at Acme Corp.')
    // An acronym keeps its capitals; a department reads as where you work.
    expect(seatSays({ role: 'AP Clerk', company: 'Northbend Athletic', sample: true })).toBe('You are the AP clerk at Northbend Athletic, a sample company.')
    expect(seatSays({ role: 'Finance', company: 'Brightmoor', sample: false })).toBe('You are in finance at Brightmoor.')
    expect(seatSays({ role: 'HR', company: 'Brightmoor', sample: false })).toBe('You are in HR at Brightmoor.')
    // No role: where, without a role it does not have. No company: nothing said.
    expect(seatSays({ role: null, company: 'Brightmoor', sample: false })).toBe('You are signed in at Brightmoor.')
    expect(seatSays({ role: 'Owner', company: null, sample: true })).toBeNull()
    // An MSP seated in a client's program says where it sits (founder, 2026-10-19).
    expect(seatSays({ role: 'Owner', company: 'Aptiva Workforce', sample: true, party: 'MSP', seatedAt: 'Cavanaugh Glassworks' }))
      .toBe('You run Cavanaugh Glassworks’ program for Aptiva Workforce, a sample MSP.')
    // A one-person firm: her own company, never "the owner at".
    expect(seatSays({ role: 'Owner', company: 'Byrne Critical Care LLC', sample: true, party: 'SOLO' }))
      .toBe('This is Byrne Critical Care LLC, your own company, a sample.')
    // The chat says it right after "Good evening, Marcus."
    const chat = readFileSync(join(process.cwd(), 'src', 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    expect(chat).toContain("${firstName ? `, ${firstName}` : ''}.${seat ? ` ${seat}` : ''}")
    expect(chat).toContain('sample: session.isDemo')
    expect(chat).toContain('party, seatedAt: desk.seatedAtClient')
  })

  it('the greeting is built from the rules — what waits on you, what waits on somebody else, and who is near the time limit — and never from the model', async () => {
    const read = readers()
    const hello = await today(read, { now: NOW, greeting: true, picture: { onSite: 12, suppliers: 4 } })
    expect(hello).toMatchObject({ kind: 'NEEDS', greeting: true, items: WAITING })
    if (hello.kind !== 'NEEDS') return
    // Recommendation first, the fact second, and when it looked.
    expect(hello.recommend).toEqual({ says: 'Approve PR-2026-0441 from Pinnacle Resourcing; it matches the approved hours and the contract rate.', links: [{ text: 'PR-2026-0441 from Pinnacle Resourcing', href: '/dashboard/invoices/inv-441' }] })
    expect(hello.says).toBe('Etyme is asking you one thing; approve it below, or reject it with a reason. Checked just now.')
    const says = (a: typeof hello) => (a.kind === 'NEEDS' ? (a.more ?? []).map((l) => l.says) : [])
    expect(says(hello)).toEqual([
      'Your AP clerk has two invoice receipts to approve: PR-2026-0441 and IN-XSWQQZ-20260901. They are not yours to approve.',
      'Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.',
      // The program's picture, from /api/program's own counts and this month's invoice receipts, never two currencies added.
      '12 contractors are on site today, through four suppliers.',
      'Suppliers billed £1,000 and $11,342.50 so far in October.',
      GREETING_CLOSE,
    ])
    // Each receipt, the person and each figure link from inside the sentence.
    expect(hello.more!.map((l) => l.links ?? [])).toEqual([
      [{ text: 'PR-2026-0441', href: '/dashboard/invoices/inv-441' }, { text: 'IN-XSWQQZ-20260901', href: '/dashboard/invoices/inv-cs' }],
      [{ text: 'Tobias Lindqvist', href: '/dashboard/people/p-tobias' }],
      [{ text: '12 contractors', href: '/dashboard/people' }],
      [{ text: '£1,000', href: '/dashboard/invoices' }, { text: '$11,342.50', href: '/dashboard/invoices' }],
      [],
    ])
    // No second row repeating the links the sentences already carry.
    expect(hello.links).toBeUndefined()
    // Told, not asked: the paying desk reads the receipt the twin told it about, first, with its link.
    const ap = await today(readers({ told: async () => ({ told: [{ invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', hoursBilled: 41.5, hoursAccepted: 40 }], stale: [] }) }), { now: NOW, greeting: true })
    expect(ap.kind === 'NEEDS' && ap.more![0]).toEqual({
      says: 'PR-2026-0442 bills 41.5 hours against 40 approved; it cannot be paid until Pinnacle Resourcing corrects it.',
      links: [{ text: 'PR-2026-0442', href: '/dashboard/invoices/inv-442' }],
    })
    // At most six lines before the closing sentence, however much is waiting.
    const busy = await today(readers({ othersWaiting: async () => Array.from({ length: 9 }, (_, i) => ({ ...OTHERS[0], title: `R-${i}`, desks: [`Desk ${i}`] })) }), { now: NOW, greeting: true, picture: { onSite: 12, suppliers: 4 } })
    // The recommendation and the headline are two of the six.
    expect(busy.kind === 'NEEDS' && busy.more!.length).toBe(4 + 1)
    // The program manager, on whose authority Etyme asks, reads whom Etyme asked, by name and role, and never "on your authority".
    expect(othersSay(OTHERS.map((o) => ({ ...o, own: true, people: ['Renata Kowal'] }))).map((l) => l.says)).toEqual([
      'Renata Kowal, AP clerk, has two invoice receipts to approve: PR-2026-0441 and IN-XSWQQZ-20260901. Etyme asked Renata; they are not yours to approve.',
    ])
    expect(othersSay([{ ...OTHERS[0], own: true, people: ['Renata Kowal'] }])[0].says)
      .toBe('Renata Kowal, AP clerk, has one invoice receipt to approve: PR-2026-0441. Etyme asked Renata; it is not yours to approve.')
    expect(JSON.stringify(othersSay(OTHERS.map((o) => ({ ...o, own: true }))))).not.toContain('on your authority')
    expect(read.model).not.toHaveBeenCalled()

    // A desk that reads neither what the rules found nor the invoice book is greeted without those lines, not refused.
    const quiet = await today(readers({ waiting: async () => [], othersWaiting: async () => [], limits: async () => ({ ok: false, says: 'no' }), spendIn: async () => ({ ok: false, says: 'no' }) }), { now: NOW, greeting: true })
    expect(quiet).toMatchObject({ kind: 'NEEDS', says: 'Nothing needs you today, and nothing Etyme asked is waiting on anybody. Checked just now.', more: [{ says: GREETING_CLOSE }] })
  })

  it('an act on the never floor asked in the chat is refused in a sentence that names who does it, and never reaches the model', async () => {
    const read = readers()
    const extend = await respond('Please extend Helena Marsh by three months', read, { env: KEY, companyKind: 'VENDOR' })
    expect(extend.kind).toBe('TEXT')
    // One sentence naming the person, and the link opens Contracts, whose line drawer has Extend.
    // The placement page draws no Extend, so it is never the door (release walk, 1716c047f).
    expect(extend.says).toMatch(/^Etyme never extends a contract; your .*Contract Manager.* does it from Helena Marsh’s line on Contracts\.$/)
    expect(extend.says).not.toContain('assignments.write')
    expect(extend).toEqual({ kind: 'TEXT', says: extend.says, links: [{ label: 'Open Contracts', href: '/dashboard/contracts' }] })
    // The founder's own sentence: a first name is enough when one person on the placements carries it.
    const founder = await respond('Extend Helena three months', read, { env: KEY, companyKind: 'CLIENT' })
    expect(founder.says).toMatch(/^Etyme never extends a contract; your .+ does it from Helena Marsh’s line on Contracts\.$/)
    expect(founder).toMatchObject({ links: [{ label: 'Open Contracts', href: '/dashboard/contracts' }] })
    // Ending is the same door: Initiate rolloff sits beside Extend on the line.
    const end = await respond('End Omar Haddad’s placement on Friday', read, { env: KEY, companyKind: 'CLIENT' })
    expect(end).toMatchObject({ links: [{ label: 'Open Contracts', href: '/dashboard/contracts' }] })
    expect(end.says).toMatch(/does it from Omar Haddad’s line on Contracts\.$/)
    // No never-floor act links to a placement page.
    for (const q of ['Extend Helena', 'End Omar Haddad', 'Award the job to Priya', 'Pay PR-2026-0441', 'Run payroll', 'Sign the MSA with Veritan', 'Sign Helena’s week', 'Reject the submission from Brightmoor']) {
      const a = await respond(q, read, { env: KEY, companyKind: 'CLIENT' })
      for (const l of (a as { links?: { href: string }[] }).links ?? []) expect(l.href).not.toMatch(/^\/dashboard\/placements\//)
    }
    // Two Helenas: one question naming both, and no link.
    const twoHelenas = [...ROSTER, { personId: 'p-ruiz', name: 'Helena Ruiz', contractId: 'sc-ruiz' }]
    const which = await respond('Extend Helena three months', readers({ named: async (t) => matchPerson(t, twoHelenas) }), { env: KEY, companyKind: 'CLIENT' })
    expect(which).toEqual({ kind: 'TEXT', says: 'Helena Marsh or Helena Ruiz?', links: [] })
    expect(matchPerson('Extend Helena Marsh three months', twoHelenas)).toEqual({ person: { name: 'Helena Marsh', contractId: 'sc-helena' } })
    expect(matchPerson('extend Haddad', twoHelenas)).toEqual({ person: { name: 'Omar Haddad', contractId: 'sc-omar' } })
    // Nobody named: the list where it is done.
    const anyone = await respond('extend the placement', read, { env: KEY, companyKind: 'VENDOR' })
    expect(anyone).toMatchObject({ links: [{ href: '/dashboard/contracts' }] })
    expect(anyone.says).toMatch(/^Etyme never extends a contract; your .+ does it from the line on Contracts\.$/)

    expect(neverAct('end Omar Haddad’s placement on Friday')).toBe('END')
    expect(neverAct('Award the job to Priya')).toBe('AWARD')
    expect(neverAct('pay PR-2026-0441')).toBe('PAY')
    expect(neverAct('can you run payroll for October')).toBe('PAYROLL')
    expect(neverAct('sign the MSA with Veritan')).toBe('SIGN_AGREEMENT')
    expect(neverAct('sign Helena’s week')).toBe('SIGN_WEEK')
    // Said the trade's way, approving a timesheet is the same act on the floor.
    expect(neverAct('approve Helena’s timesheet')).toBe('SIGN_WEEK')
    expect(neverAct('Approve 1')).toBeNull()
    expect(neverAct('reject the submission from Brightmoor')).toBe('REJECT_SUBMISSION')
    // Not acts: Etyme's own question answered, a question about an act, the timesheets chip.
    expect(neverAct('reject 1 because the hours are over')).toBeNull()
    expect(neverAct('who extended Helena?')).toBeNull()
    expect(neverAct('Which weeks are unsigned?')).toBeNull()
    expect(neverAct('Which timesheets are waiting for approval?')).toBeNull()

    // A seat that holds the role is told it does it itself.
    const own = await respond('extend Helena Marsh', read, { env: KEY, companyKind: 'CLIENT', permissions: ['assignments.write'] })
    expect(own.says).toBe('Etyme never extends a contract; you can, from Helena Marsh’s line on Contracts.')

    const pay = await respond('pay PR-2026-0441', read, { env: KEY, companyKind: 'CLIENT' })
    expect(pay.says).toMatch(/^Etyme never pays an invoice; your .+ does it on PR-2026-0441’s page\.$/)
    expect(pay).toMatchObject({ links: [{ label: 'Open PR-2026-0441', href: '/dashboard/invoices/inv-441' }] })

    // A supplier asked to pay is told the desks that pay out, never Accounts Receivable, which bills.
    const supplierPay = await respond('Pay IN-XSWQQZ-20260901', read, { env: KEY, companyKind: 'VENDOR' })
    expect(supplierPay.says).toMatch(/^Etyme never pays an invoice; your AP & Payroll or Finance does it on /)
    expect(supplierPay.says).not.toContain('Accounts Receivable')
    expect(payingDesks('VENDOR')).toEqual(desksHolding('payments.record', 'VENDOR').filter((d) => d !== 'Accounts Receivable'))
    // An Accounts Receivable seat holds payments.record to record money in; it is not told it pays.
    const arPay = await respond('Pay IN-XSWQQZ-20260901', read, { env: KEY, companyKind: 'VENDOR', permissions: ['invoices.read', 'invoices.issue', 'payments.record'] })
    expect(arPay.says).not.toContain('you can,')
    // Where the one money desk both bills and pays, it is the desk that pays.
    expect(payingDesks('MSP')).toEqual(['AP Clerk'])
    expect(payingDesks('CLIENT')).toEqual(['AP Clerk'])
    expect(read.model).not.toHaveBeenCalled()
  })

  it('free text leaves only when the company switch and the key are both on, masked, and is logged with its answer', async () => {
    const q = 'Which supplier is slowest to send its invoice?'

    // The switch off: the honest reply, nothing read for masking, nothing sent, nothing logged.
    const off = readers({ modelOn: vi.fn(async () => false) })
    expect(await respond(q, off, { env: KEY })).toEqual({ kind: 'TEXT', says: NO_SWITCH })
    expect(NO_SWITCH).toBe('I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
    expect(off.model).not.toHaveBeenCalled()
    expect(off.vocabulary).not.toHaveBeenCalled()
    expect(off.logPrompt).not.toHaveBeenCalled()

    // The switch on and no key on this deployment: the deployment's sentence, and still nothing sent.
    const noKey = readers()
    expect(await respond(q, noKey, { env: NO_KEY })).toEqual({ kind: 'TEXT', says: NO_MODEL })
    expect(noKey.model).not.toHaveBeenCalled()

    // Both on: it leaves masked, the small model answers, the real names come back, and the call is logged.
    const on = readers()
    const a = await respond(q, on, { env: KEY })
    expect(on.model).toHaveBeenCalledTimes(1)
    const [system, sentQuestion, sentLines] = on.model.mock.calls[0] as [string, string, string]
    expect(system).toBe(SYSTEM)
    for (const real of ['Pinnacle Resourcing', 'Pinnacle', 'Helena Marsh', 'Tobias Lindqvist', 'Computer Systems Inc']) {
      expect(sentLines).not.toContain(real)
      expect(sentQuestion).not.toContain(real)
    }
    expect(sentLines).toMatch(/FIRM_\d+/)
    expect(a).toMatchObject({ kind: 'MODEL', says: 'Pinnacle Resourcing billed over the hours accepted [entry-442].' })
    expect(SMALL_MODEL).toBe('claude-haiku-4-5')
    expect(on.logPrompt).toHaveBeenCalledTimes(1)
    const logged = (on.logPrompt as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(logged).toMatchObject({ model: 'claude-haiku-4-5', maskedAnswer: expect.stringMatching(/^FIRM_\d+ billed over/), tokensIn: 120, tokensOut: 14 })
    expect(logged.maskedPrompt).toContain('Question: Which supplier is slowest to send its invoice?')
    expect(logged.maskedPrompt).not.toContain('Pinnacle')
    expect(logged.realValues).toEqual(expect.arrayContaining(['Pinnacle Resourcing']))

    // Figures leave as tokens too: a rate, an amount and a margin percentage.
    const m = newMasker({ people: ['Helena Marsh'], firms: ['Pinnacle Resourcing'] })
    const masked = m.mask('Helena Marsh at $98.00/hr; Pinnacle billed $3,920.00 with an 18% margin. Marsh signed.')
    expect(masked).toMatch(/^PERSON_\d+ at RATE_\d+; FIRM_\d+ billed AMOUNT_\d+ with an RATE_\d+\. PERSON_\d+ signed\.$/)
    const persons = masked.match(/PERSON_\d+/g)!
    expect(persons[0]).toBe(persons[1]) // one person, one token, by full name or by part
    for (const real of ['Helena', 'Marsh', 'Pinnacle', '$98.00/hr', '$3,920.00', '18%']) expect(masked).not.toContain(real)
    // Put back on the way in; a part comes back as the whole name.
    expect(m.unmask(masked)).toBe('Helena Marsh at $98.00/hr; Pinnacle Resourcing billed $3,920.00 with an 18% margin. Helena Marsh signed.')
  })

  it('a leaked real value is withheld by the log', async () => {
    stored.length = 0
    const clean = await recordModelPrompt({
      companyId: 'co-nb', personId: 'p-lorena', provider: 'anthropic', model: SMALL_MODEL,
      maskedPrompt: 'Question: what did FIRM_1 bill?', maskedAnswer: 'FIRM_1 billed AMOUNT_2.',
      purpose: 'ASK_ETYME', realValues: ['Pinnacle Resourcing', '$3,920.00'],
    })
    expect(clean).toMatchObject({ ok: true, withheld: false })
    expect(stored[0]).toMatchObject({ maskedAnswer: 'FIRM_1 billed AMOUNT_2.', model: 'claude-haiku-4-5', purpose: 'ASK_ETYME' })

    const leaked = await recordModelPrompt({
      companyId: 'co-nb', personId: 'p-lorena', provider: 'anthropic', model: SMALL_MODEL,
      maskedPrompt: 'Question: what did FIRM_1 bill?', maskedAnswer: 'Pinnacle Resourcing billed AMOUNT_2.',
      purpose: 'ASK_ETYME', realValues: ['Pinnacle Resourcing', '$3,920.00'],
    })
    expect(leaked).toMatchObject({ ok: true, withheld: true })
    expect(stored[1].maskedAnswer).toBe(WITHHELD)
    expect(stored[1].maskedPrompt).toBe('Question: what did FIRM_1 bill?')
  })

  it('a supplier’s question never sees a client’s people or another supplier’s receipts, and the lines sent never name a company it may not read', async () => {
    // Scoped at the query: a supplier reading a client's twin reads only
    // entries about records it is a party to (lib/twin/ledger's feedWhere).
    const supplier = { company: { id: 'co-pinnacle', kind: 'VENDOR', name: 'Pinnacle Resourcing' }, person: { id: 'p-am' }, permissions: ['invoices.read'] }
    const scope = feedWhere('co-northbend', supplier as never)
    expect(scope).toEqual({ where: { companyId: 'co-northbend', partyCompanyIds: { has: 'co-pinnacle' } }, view: 'PARTY' })
    expect(feedWhere(null, supplier as never)?.where).toEqual({ companyId: { not: 'co-pinnacle' }, partyCompanyIds: { has: 'co-pinnacle' } })

    // Every read Ask Etyme makes goes through that scope or the reader's own company.
    const reads = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/read.ts'), 'utf8')
    expect(reads).toContain('const feed = await ledgerFeed(companyId, caller, { take: 60 })')
    for (const own of ['async spendIn', 'async receiptsIn', 'async unsignedWeeks']) {
      const body = reads.slice(reads.indexOf(own), reads.indexOf(own) + 400)
      expect(body, own).toContain('if (!ownCompany || !company)')
    }
    expect(reads).toContain("where: { companyId: company.id, revokedAt: null }")

    // What the supplier sends, from its own scoped lines and its own vocabulary,
    // names nobody: not the client's people, not another supplier, not itself.
    const pinnacleLines = [{ id: 'entry-442', ts: NOW.toISOString(), says: ENTRY_442.says, outcome: 'PERFORMED', entityType: 'Invoice', entityId: 'inv-442', ruleCited: ENTRY_442.ruleCited, rationale: ENTRY_442.rationale }]
    const read = readers({
      ledgerLines: vi.fn(async () => pinnacleLines),
      vocabulary: vi.fn(async () => ({ people: ['Helena Marsh'], firms: ['Pinnacle Resourcing', 'Northbend Athletic'] })),
      receiptsIn: vi.fn(async () => ({ ok: false as const, says: 'Invoice mismatches are read at the company that pays; switch to it first.' })),
    })
    await respond('Which of my receipts did Northbend flag?', read, { env: KEY, companyKind: 'VENDOR' })
    const sent = (read.model.mock.calls[0] as [string, string, string]).slice(1).join('\n')
    for (const name of ['Tobias Lindqvist', 'Computer Systems', 'Pinnacle', 'Northbend']) expect(sent).not.toContain(name)
    // A client's own answer never prints a firm below the rung it pays: a
    // sub-vendor is masked on the way out and comes back only as the client may read it.
    const forClient = newMasker({ people: [], firms: ['Pinnacle Resourcing'], withheld: [{ name: 'Sahasra Systems', shownAs: 'supplied through Pinnacle Resourcing' }] })
    const out = forClient.mask('Sahasra Systems employs the person Pinnacle Resourcing bills for.')
    expect(out).not.toContain('Sahasra')
    expect(forClient.unmask(out)).toBe('supplied through Pinnacle Resourcing employs the person Pinnacle Resourcing bills for.')
    expect(forClient.realValues()).toContain('Sahasra Systems')
    expect(await respond('Show me invoice variance by supplier this quarter', read, { env: KEY, companyKind: 'VENDOR' })).toEqual({
      kind: 'TEXT', says: 'Invoice mismatches are read at the company that pays; switch to it first.', links: undefined,
    })
  })
})

describe('Ask Etyme carries the number, and the notices the notifications page used to list', () => {
  const NOTICES = {
    shown: [
      { id: 'n-1', title: 'Helena Marsh filed her week', href: '/dashboard/timesheets' },
      { id: 'n-2', title: 'Priya joined Northbend Athletic', href: '/dashboard/settings/users' },
    ],
    older: 0,
  }
  const lines = (a: Awaited<ReturnType<typeof today>>) => (a.kind === 'NEEDS' ? (a.more ?? []).map((l) => l.says) : [])

  it('the greeting’s count of what needs you is the decisions queue’s own total, the figure on the Ask Etyme mark, and the twin’s own questions are said after it as also', async () => {
    const hello = await today(readers(), { now: NOW, greeting: true, needs: async () => 5 })
    expect(hello.kind === 'NEEDS' && hello.says).toBe(
      'Five things need you; open the list to see them, most urgent first. ' +
      'One of them is a question from Etyme; approve it below, or reject it with a reason. Checked just now.')
    // A queue that could not have counted them (fewer than Etyme asks) says them as also.
    const short = await today(readers({ waiting: async () => [WAITING[0], { ...WAITING[0], n: 2, approvalId: 'appr-2' }] }), { now: NOW, greeting: true, needs: async () => 1 })
    expect(short.kind === 'NEEDS' && short.says).toMatch(/Etyme is also asking you two things;/)
    const two = await today(readers({ waiting: async () => [WAITING[0], { ...WAITING[0], n: 2, approvalId: 'appr-2' }] }), { now: NOW, greeting: true, needs: async () => 4 })
    expect(two.kind === 'NEEDS' && two.says).toMatch(/Four things need you; .* Two of them are questions from Etyme; approve each below/)
    expect(hello.kind === 'NEEDS' && hello.saysLinks).toEqual([{ text: 'open the list', href: DECISIONS_HREF }])
    const one = await today(readers({ waiting: async () => [] }), { now: NOW, greeting: true, needs: async () => 1 })
    expect(one.kind === 'NEEDS' && one.says).toBe('One thing needs you; open the list to see it. Checked just now.')
    expect(voiceBreaks(hello.says)).toEqual([])
  })

  it('the greeting never sends anybody to “Needs attention”, which left the menu; it says to open the list, and those words open it', async () => {
    for (const needs of [1, 2, 5]) {
      for (const waiting of [[], WAITING]) {
        const hello = await today(readers({ waiting: async () => waiting }), { now: NOW, greeting: true, needs: async () => needs })
        if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
        expect(hello.says).not.toMatch(/Needs attention|under /)
        for (const l of hello.saysLinks ?? []) {
          expect(hello.says).toContain(l.text)
          expect(l.href).toBe(DECISIONS_HREF)
        }
        expect(voiceBreaks(hello.says)).toEqual([])
      }
    }
    const src = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/ask.ts'), 'utf8')
    expect(src).not.toMatch(/`[^`\n]*under Needs attention/)
  })

  it('a seat the decisions queue owes nothing, and Etyme asks nothing, reads that nothing needs it; a queue that could not be read leaves the headline to the twin’s own questions', async () => {
    const quiet = { waiting: async () => [], othersWaiting: async () => [], limits: async () => ({ ok: false as const, says: 'no' }) }
    const none = await today(readers(quiet), { now: NOW, greeting: true, needs: async () => 0 })
    expect(none.kind === 'NEEDS' && none.says).toBe('Nothing needs you today, and nothing Etyme asked is waiting on anybody. Checked just now.')
    expect(none.kind === 'NEEDS' && none.saysLinks).toBeUndefined()
    // Owing the queue something is never "nothing", whatever the twin asked.
    const owes = await today(readers(quiet), { now: NOW, greeting: true, needs: async () => 3 })
    expect(owes.kind === 'NEEDS' && owes.says).toMatch(/^Three things need you;/)
    const unread = await today(readers(), { now: NOW, greeting: true, needs: async () => { throw new Error('down') } })
    expect(unread.kind === 'NEEDS' && unread.says).toBe('Etyme is asking you one thing; approve it below, or reject it with a reason. Checked just now.')
  })

  it('asking “What needs me today?” reads the same decisions count as the greeting', async () => {
    const asked = await respond('What needs me today?', readers(), { env: NO_KEY, now: NOW, needs: async () => 5 })
    expect(asked.kind === 'NEEDS' && asked.says).toMatch(/^Five things need you;/)
  })

  it('notices not yet read appear under “Since you last looked”, one line each linking to the page the notice opened, after the recommendation, the decisions and the facts, and before the closing line', async () => {
    const hello = await today(readers(), { now: NOW, greeting: true, needs: async () => 5, notices: NOTICES })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.recommend).toBeDefined()
    const said = lines(hello)
    const at = said.indexOf(SINCE_HEADING)
    expect(at).toBeGreaterThan(0)
    expect(said.slice(at)).toEqual([SINCE_HEADING, 'Helena Marsh filed her week.', 'Priya joined Northbend Athletic.', GREETING_CLOSE])
    expect(hello.more!.slice(at + 1, at + 3).map((l) => l.links)).toEqual([
      [{ text: 'Helena Marsh filed her week', href: '/dashboard/timesheets' }],
      [{ text: 'Priya joined Northbend Athletic', href: '/dashboard/settings/users' }],
    ])
    // A question to the chat, not the greeting, never carries the notices.
    const asked = await today(readers(), { now: NOW, notices: NOTICES })
    expect(lines(asked)).not.toContain(SINCE_HEADING)
  })

  it('with no unread notices the greeting draws no “Since you last looked” heading at all', async () => {
    const hello = await today(readers(), { now: NOW, greeting: true, notices: { shown: [], older: 0 } })
    expect(lines(hello)).not.toContain(SINCE_HEADING)
    expect(sinceSays([])).toEqual([])
  })

  it('two notices with the same title and page are one line, never a count in parentheses, and older notices beyond the five shown are said in one line and kept for the next greeting', () => {
    const same = { title: 'A week was filed!', href: '/dashboard/timesheets' }
    expect(sinceSays([{ id: 'a', ...same }, { id: 'b', ...same }], 3).map((l) => l.says)).toEqual([
      SINCE_HEADING, 'A week was filed.', 'Three older updates are waiting; they show the next time you open Ask Etyme.',
    ])
    for (const l of sinceSays([{ id: 'a', ...same }], 1)) expect(voiceBreaks(l.says)).toEqual([])
  })

  it('the greeting reads the reader’s own unread notices at this seat, and marks read only the ones it said and only the reader’s own', async () => {
    const { unreadNotices, markNoticesSeen } = await import('@/app/api/conversations/twin/notices')
    const caller = { person: { id: 'p-dana' }, company: { id: 'c-northbend' } } as any
    noticeCalls.length = 0
    const got = await unreadNotices(caller)
    expect(got.shown.map((n) => ({ id: n.id, title: n.title, href: n.href }))).toEqual([
      { id: 'n-1', title: 'Helena Marsh filed her week', href: '/dashboard/timesheets' },
      { id: 'n-2', title: 'Priya joined Northbend Athletic', href: '/dashboard/settings/users' },
    ])
    // Seven unread, two shown: five wait for the next greeting.
    expect(got.older).toBe(5)
    const where = noticeCalls.find((c) => c.op === 'findMany')!.args.where
    expect(where).toMatchObject({ personId: 'p-dana', status: 'UNREAD', OR: [{ companyId: 'c-northbend' }, { companyId: null }] })
    // A note on a conversation is said as its conversation, not as a notice.
    expect(where.type).toEqual({ not: 'CONVERSATION' })
    // The account's own sign-up and reset mail stays out, as it did on the page.
    expect(where.NOT).toBeDefined()
    expect(await markNoticesSeen(caller, got.shown.map((n) => n.id))).toBe(2)
    expect(noticeCalls.find((c) => c.op === 'updateMany')!.args.where).toEqual({ id: { in: ['n-1', 'n-2'] }, personId: 'p-dana', status: 'UNREAD' })
    expect(await markNoticesSeen(caller, [])).toBe(0)
    // The route marks read after the greeting is composed, from the notices it passed in.
    const route = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
    expect(route.indexOf('markNoticesSeen(caller, notices.shown.map((n) => n.id))')).toBeGreaterThan(route.indexOf('const answer = await today('))
    // And the one write is the notice's own read mark, nothing else.
    const src = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/notices.ts'), 'utf8')
    expect([...src.matchAll(/prisma\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g)].map((m) => `${m[1]}.${m[2]}`)).toEqual(['notification.updateMany'])
  })
})

describe('Ask Etyme at a supplier: the bill it drafted, and a bill the customer put on hold', () => {
  // Brightmoor Staffing's March bill to Northbend Athletic for Rosa
  // Delgado, as the nightly run puts the question (`cardPayload` in
  // lib/money/supplier-bills): 80 hours at $112.00, two signed weeks.
  const ROSA_BILL = {
    customerName: 'Northbend Athletic',
    period: { start: '2026-03-01', end: '2026-03-31', label: 'March 2026' },
    hours: 80,
    totalMinor: 896000,
    currency: 'USD',
    people: [{ personName: 'Rosa Delgado', hours: 80, amountMinor: 896000 }],
    builtFrom: { timesheetIds: ['ts-a', 'ts-b'], weeks: 2, expenses: 0, milestones: 0 },
    dueSays: 'Due May 1, 2026: net 30 from the bill date, as your agreement with Northbend Athletic says.',
    heldBack: null,
    setAside: [],
    invoiceId: 'inv-rosa',
    invoiceNumber: 'INV-0042',
  }
  const askedRow = (over: Record<string, unknown> = {}) => ({
    id: 'appr-bill', needsPermission: 'invoices.issue',
    twinAction: {
      id: 'entry-bill', action: 'bill.send', entityType: 'Invoice', entityId: 'inv-rosa',
      ruleCited: 'Billed monthly, from your agreement with Northbend Athletic. March 2026 ended on Mar 31, 2026, so its bill is due from Apr 1, 2026.',
      rationale: 'Bill INV-0042 to Northbend Athletic for March 2026 is drafted: $8,960.00, 80 hours. Send it?',
      authorityPersonId: 'p-owner',
      payload: { ...ROSA_BILL, engagementId: 'eng-1', sellContractId: 'sc-rosa' },
      ...over,
    },
  })
  const seat = (id: string, permissions: string[]) => ({
    person: { id, name: id }, company: { id: 'c-brightmoor', name: 'Brightmoor Staffing', kind: 'VENDOR' }, permissions,
  }) as any
  const AR = ['invoices.read', 'invoices.issue', 'payments.record']
  const OWNER = ['*']
  const AP_PAYROLL = ['invoices.read', 'payments.record', 'timesheets.approve']

  it('Accounts Receivable sees the bill Ask Etyme drafted as a card with the customer, period, hours, amount, each person, the signed weeks and the due line', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    BILL_DB.approvals = [askedRow()]
    const items = await readersFor(seat('p-ar', AR), 'c-brightmoor').waiting()
    expect(items).toHaveLength(1)
    const [item] = items
    expect(item.action).toBe('bill.send')
    expect(item.title).toBe('INV-0042 to Northbend Athletic')
    expect(item.href).toBe('/dashboard/invoices/inv-rosa')
    expect(item.bill).toEqual(ROSA_BILL)

    expect(billCardTitle(item.bill!)).toBe('Bill ready to send — Northbend Athletic, March 2026')
    expect(billRows(item.bill!)).toEqual([
      { label: 'Hours', value: '80' },
      { label: 'Amount', value: '$8,960.00' },
      { label: 'Person', value: 'Rosa Delgado · 80 hours · $8,960.00' },
      { label: 'Built from', value: '2 signed weeks' },
      { label: 'Due', value: 'May 1, 2026: net 30 from the bill date, as your agreement with Northbend Athletic says.' },
    ])

    // The greeting leads with it, in the words of sending, not approving.
    const hello = await today(readers({ waiting: async () => items, othersWaiting: async () => [], limits: async () => ({ ok: false as const, says: 'no' }) }), { now: NOW, greeting: true, needs: async () => 1 })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.recommend?.says).toBe('Send bill INV-0042 to Northbend Athletic; it is built from weeks Northbend Athletic signed.')
    expect(hello.says).toBe('One thing needs you. It is the bill Etyme drafted; send it below, or say not now. Checked just now.')
    // Every one of them is a card below, so no list is offered.
    expect(hello.saysLinks).toEqual([])
    expect(hello.items[0].bill?.invoiceNumber).toBe('INV-0042')
    for (const line of [hello.recommend!.says, hello.says]) {
      expect(voiceBreaks(line)).toEqual([])
      expect(line).not.toMatch(/invoice receipt|desk|program office|twin/i)
    }
  })

  it('what was left off a bill and terms set aside are said on the card in plain sentences, and expenses and milestones are counted beside the weeks', () => {
    const rows = billRows({
      ...ROSA_BILL,
      builtFrom: { ...ROSA_BILL.builtFrom, weeks: 1, expenses: 1, milestones: 2 },
      heldBack: 'The week of Mar 22 is left off: Northbend Athletic has not signed it.',
      setAside: ['The order’s net 45 was set aside: it gave no reason, so your agreement’s net 30 stands.'],
    })
    expect(rows.find((r) => r.label === 'Built from')?.value).toBe('1 signed week, 1 approved expense and 2 accepted milestones')
    expect(rows.find((r) => r.label === 'Left off')?.value).toMatch(/has not signed it/)
    expect(rows.find((r) => r.label === 'Terms')?.value).toMatch(/set aside/)
  })

  it('a bill question whose figures are not whole is shown as a plain question, never as a card with a blank amount', () => {
    expect(billFromPayload({ ...ROSA_BILL, totalMinor: 8960.5 })).toBeNull()
    expect(billFromPayload({ ...ROSA_BILL, people: [{ personName: 'Rosa Delgado', hours: 80 }] })).toBeNull()
    expect(billFromPayload({ ...ROSA_BILL, period: { label: 'March 2026' } })).toBeNull()
    expect(billFromPayload(ROSA_BILL)).toEqual(ROSA_BILL)
  })

  it('the owner Ask Etyme acts for is not asked to send the bill, and neither is AP & Payroll, who does not send bills', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    BILL_DB.approvals = [askedRow()]
    expect(await readersFor(seat('p-owner', OWNER), 'c-brightmoor').waiting()).toEqual([])
    expect(await readersFor(seat('p-ap', AP_PAYROLL), 'c-brightmoor').waiting()).toEqual([])
    // Finance, who also sends bills, is asked; once, as one card.
    expect((await readersFor(seat('p-finance', AR), 'c-brightmoor').waiting()).map((i) => i.approvalId)).toEqual(['appr-bill'])
    // The owner reads that it waits on whoever sends bills, as a bill, and that it is not theirs to send.
    const line = othersSay([{ title: 'INV-0042', noun: 'bill', desks: ['Accounts Receivable', 'Finance'], own: true, href: '/dashboard/invoices/inv-rosa' }])
    expect(line[0].says).toBe('Accounts Receivable or Finance has one bill to send: INV-0042. Etyme asked Accounts Receivable or Finance; it is not yours to send.')
    // The badge counts what the decisions queue counts: a twin question only where the seat may decide it.
    const queue = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')
    expect(queue).toMatch(/waitingQuestions\(caller\)\)\.filter\(\(q\) => q\.mayDecide\)/)
  })

  // Halcyon Talent's shape: one seat, the Owner, who is also the person
  // Ask Etyme acts for. The question as the ledger writes it under the
  // owner-only exception (founder, 2026-10-19, decision 2).
  const ownerAskedRow = (over: { action?: string; selfApprovalReason?: string | null; needsPermission?: string } = {}) => {
    const r = askedRow(over.action ? { action: over.action } : {})
    return {
      ...r,
      ...(over.needsPermission ? { needsPermission: over.needsPermission } : {}),
      requestedAt: new Date('2026-04-01T06:00:00Z'),
      selfApprovalReason: over.selfApprovalReason === undefined ? OWNER_ONLY_EXCEPTION['bill.send'] : over.selfApprovalReason,
      twinAction: {
        ...r.twinAction, companyId: 'c-brightmoor', twinKind: 'SUPPLIER', actorType: 'TWIN', actorId: 'twin-supplier',
        onAuthorityOfRole: 'Owner', authorityPerson: { name: 'Sade Balogun' },
      },
    }
  }

  it('where nobody but the owner sends bills, the owner reads the twin’s bill card in Ask Etyme with the line saying why they are asked', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    BILL_DB.approvals = [ownerAskedRow()]
    BILL_DB.otherSender = false
    const items = await readersFor(seat('p-owner', OWNER), 'c-brightmoor').waiting()
    expect(items.map((i) => i.approvalId)).toEqual(['appr-bill'])
    const [item] = items
    expect(item.bill).toEqual(ROSA_BILL)
    expect(item.askedYouBecause).toBe('Only you send bills here, so Ask Etyme asks you.')
    expect(voiceBreaks(item.askedYouBecause!)).toEqual([])
    // The card draws it under its title, on the bill card and on the plain question alike.
    const ui = readFileSync(join(process.cwd(), 'src/app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    const card = ui.slice(ui.indexOf('function BillCard('))
    expect(card.indexOf('{item.askedYouBecause')).toBeGreaterThan(card.indexOf('{billCardTitle(b)}'))
    expect(card.indexOf('{item.askedYouBecause')).toBeLessThan(card.indexOf('{rows.map('))
    // The greeting leads with it, in the words of sending, and the list is not offered for a card already below.
    const hello = await today(readers({ waiting: async () => items, othersWaiting: async () => [], limits: async () => ({ ok: false as const, says: 'no' }) }), { now: NOW, greeting: true, needs: async () => 1 })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.recommend?.says).toBe('Send bill INV-0042 to Northbend Athletic; it is built from weeks Northbend Athletic signed.')
    expect(hello.items[0].askedYouBecause).toBe('Only you send bills here, so Ask Etyme asks you.')
    // Somebody else seated who sends bills takes the question back, and the card leaves the owner's screen.
    BILL_DB.otherSender = true
    expect(await readersFor(seat('p-owner', OWNER), 'c-brightmoor').waiting()).toEqual([])
    // And the person who now sends bills reads it with no such line: it was never an exception for them.
    const theirs = await readersFor(seat('p-ines', AR), 'c-brightmoor').waiting()
    expect(theirs.map((i) => i.approvalId)).toEqual(['appr-bill'])
    expect(theirs[0].askedYouBecause).toBeUndefined()
    BILL_DB.otherSender = false
  })

  it('a question asked on the owner’s own authority for any other act stays hidden from the owner', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    const owner = readersFor(seat('p-owner', OWNER), 'c-brightmoor')
    // An invoice receipt asked on the owner's authority, even carrying the bill's reason, is not theirs to answer.
    BILL_DB.approvals = [ownerAskedRow({ action: 'invoice_receipt.approve', needsPermission: 'payments.record' })]
    expect(await owner.waiting()).toEqual([])
    // Nor is a bill the ledger did not put to the owner: no reason recorded, no exception.
    BILL_DB.approvals = [ownerAskedRow({ selfApprovalReason: null })]
    expect(await owner.waiting()).toEqual([])
    // Nor anything on the never floor or that moves money out: the exception names one act.
    for (const action of ['payroll.release', 'payment.record', 'agreement.sign']) {
      BILL_DB.approvals = [ownerAskedRow({ action })]
      expect(await owner.waiting(), action).toEqual([])
    }
    expect(Object.keys(OWNER_ONLY_EXCEPTION)).toEqual(['bill.send'])
  })

  it('a yes on the bill card goes through the one approval route, and "Not now" with no reason still records a reason that says so', () => {
    const yes = decisionRequest('appr-bill', 'APPROVED', null)
    expect(yes.url).toBe('/api/twin/approvals/appr-bill')
    expect(JSON.parse(yes.init.body)).toEqual({ decision: 'APPROVED', surface: 'WEB' })
    const no = decisionRequest('appr-bill', 'REJECTED', NOT_NOW_REASON)
    expect(JSON.parse(no.init.body).reason).toBe(NOT_NOW_REASON)
    expect(billSentSays(ROSA_BILL, 'INV-0042')).toBe('Sent to Northbend Athletic: bill INV-0042.')
    expect(billKeptSays(ROSA_BILL)).toBe('Not sent. Bill INV-0042 stays a draft on the Bills page; send it from there when it is ready.')
    // The card's buttons say exactly what they do.
    const ui = readFileSync(join(process.cwd(), 'src/app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    for (const b of ['Send bill', 'Edit', 'Not now', 'Open bill']) expect(ui.includes(`>${b}<`) || ui.includes(`'${b}'`), b).toBe(true)
  })

  it('a bill the client put on hold reaches the supplier’s Accounts Receivable as a card with the client’s reason, and the notice is not said twice', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    BILL_DB.invoices = [{
      id: 'inv-rosa', number: 'INV-0042',
      engagement: { msa: { vendorId: 'c-brightmoor', clientId: 'c-northbend', vendor: { id: 'c-brightmoor', name: 'Brightmoor Staffing' }, client: { id: 'c-northbend', name: 'Northbend Athletic' } } },
      workOrder: null, invoiceLines: [],
    }]
    BILL_DB.holds = [{ at: new Date('2026-04-03T15:00:00Z'), payload: { invoiceId: 'inv-rosa', number: 'INV-0042', reason: 'The week of Mar 15 shows 44 hours; we approved 40' } }]
    const held = await readersFor(seat('p-ar', AR), 'c-brightmoor').heldBills!()
    expect(held).toEqual([{
      invoiceId: 'inv-rosa', number: 'INV-0042', payerName: 'Northbend Athletic',
      reason: 'The week of Mar 15 shows 44 hours; we approved 40', heldOn: '2026-04-03', href: '/dashboard/invoices/inv-rosa',
    }])
    expect(heldBillTitle(held[0])).toBe('Northbend Athletic put bill INV-0042 on hold')
    expect(heldBillSays(held[0])).toBe('Their reason: The week of Mar 15 shows 44 hours; we approved 40. Nothing is paid on it until Northbend Athletic lifts the hold.')
    // Only the people who send bills are handed the card.
    expect(await readersFor(seat('p-ap', AP_PAYROLL), 'c-brightmoor').heldBills!()).toEqual([])

    const hello = await today(
      readers({ waiting: async () => [], othersWaiting: async () => [], limits: async () => ({ ok: false as const, says: 'no' }), heldBills: async () => held }),
      { now: NOW, greeting: true, needs: async () => 0, notices: { shown: [{ id: 'n-hold', title: 'Northbend Athletic put bill INV-0042 on hold', href: '/dashboard/invoices/inv-rosa' }], older: 0 } },
    )
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.held).toEqual(held)
    expect(hello.recommend?.says).toBe('Open bill INV-0042 and answer Northbend Athletic; they put it on hold.')
    expect(hello.says).toBe('Northbend Athletic put one of your bills on hold. Checked just now.')
    expect((hello.more ?? []).map((l) => l.says)).not.toContain(SINCE_HEADING)
  })
})

describe('Ask Etyme never goes beyond the transaction', () => {
  it('an answer from the model that cites no line of the record is not shown; the person reads “I cannot answer that yet” and where to look', async () => {
    // A fluent paragraph with no line behind it: the model's own knowledge.
    const read = readers({
      model: vi.fn(async () => ({ text: 'Most staffing firms bill at a 25 percent markup over pay.', model: SMALL_MODEL, tokensIn: 90, tokensOut: 12 })),
    })
    const a = await respond('Which supplier is slowest to send its invoice?', read, { env: KEY })
    expect(read.model).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ kind: 'TEXT', says: NOT_GROUNDED, links: [{ label: 'Open the ledger', href: '/dashboard/twin' }] })
    expect(NOT_GROUNDED).toBe('I cannot answer that yet. Open the ledger to read what Etyme checked, or try a question below.')
    expect(voiceBreaks(NOT_GROUNDED)).toEqual([])
    // The log keeps what the model wrote, marked as not shown.
    const logged = (read.logPrompt as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(logged.replaced).toBe(true)
    expect(logged.maskedAnswer).toBe(`${REPLACED_NOTE}Most staffing firms bill at a 25 percent markup over pay.`)

    // A citation that is not one of the lines it was given is no citation.
    const madeUp = readers({ model: vi.fn(async () => ({ text: 'Pinnacle was late [ckinvented1].', model: SMALL_MODEL, tokensIn: 1, tokensOut: 1 })) })
    expect(await respond('Which supplier is slowest to send its invoice?', madeUp, { env: KEY })).toMatchObject({ kind: 'TEXT', says: NOT_GROUNDED })

    // The model's own "cannot answer" reads the same to the person, and is not logged as replaced.
    const honest = readers({ model: vi.fn(async () => ({ text: NOT_YET, model: SMALL_MODEL, tokensIn: 1, tokensOut: 1 })) })
    expect(await respond('Which supplier is slowest to send its invoice?', honest, { env: KEY })).toMatchObject({ kind: 'TEXT', says: NOT_GROUNDED })
    expect((honest.logPrompt as ReturnType<typeof vi.fn>).mock.calls[0][0].replaced).toBeUndefined()

    // The one sentence for any act stands as it is; an answer citing a line it was given is shown.
    expect(grounded(ASK_THE_DESK, [])).toEqual({ show: true, replaced: false })
    expect(grounded('Pinnacle billed over [entry-442].', [{ id: 'entry-442' } as never])).toEqual({ show: true, replaced: false })
  })

  it('a replaced answer is kept in the company’s prompt log under its own purpose, so “what left” shows it was not shown', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    stored.length = 0
    const caller = { person: { id: 'p-lorena', name: 'Lorena' }, company: { id: 'co-nb', name: 'Northbend Athletic', kind: 'CLIENT' }, permissions: ['governance.read'] } as any
    await readersFor(caller, 'co-nb').logPrompt({ model: SMALL_MODEL, maskedPrompt: 'Question: q', maskedAnswer: `${REPLACED_NOTE}FIRM_1 is cheap.`, tokensIn: 1, tokensOut: 1, realValues: [], replaced: true })
    await readersFor(caller, 'co-nb').logPrompt({ model: SMALL_MODEL, maskedPrompt: 'Question: q', maskedAnswer: 'FIRM_1 billed [entry-442].', tokensIn: 1, tokensOut: 1, realValues: [] })
    expect(stored.map((r) => r.purpose)).toEqual(['ASK_ETYME_REPLACED', 'ASK_ETYME'])
    expect(stored[0].maskedAnswer.startsWith(REPLACED_NOTE)).toBe(true)
  })

  it('a general question with no record behind it is refused in one sentence before any model is called', async () => {
    for (const q of ['What is the capital of France?', 'Write a poem about our timesheets', 'Who is the president of Brazil?', 'Tell me a joke', 'How tall is Mount Everest?']) {
      const read = readers()
      const a = await respond(q, read, { env: KEY })
      expect(a, q).toEqual({ kind: 'TEXT', says: ONLY_THE_RECORD })
      expect(read.model, q).not.toHaveBeenCalled()
      expect(read.logPrompt, q).not.toHaveBeenCalled()
    }
    expect(ONLY_THE_RECORD).toBe('I answer only about your company’s own record: jobs, candidates, timesheets, bills, invoice receipts, payroll, papers and people.')
    expect(voiceBreaks(ONLY_THE_RECORD)).toEqual([])
    // It is refused even where the company has the model off: no model would be allowed to answer it.
    const off = readers({ modelOn: vi.fn(async () => false) })
    expect(await respond('What is the capital of France?', off, { env: NO_KEY })).toEqual({ kind: 'TEXT', says: ONLY_THE_RECORD })
  })

  it('a question about another company’s book, or a benchmark across companies, is refused in one sentence before any model is called', async () => {
    for (const q of [
      'What do other companies pay their contractors?',
      'What is the market rate for a Java developer?',
      'How do our rates compare with our competitors?',
      'How much did Halden Systems Inc bill last month?',
    ]) {
      const read = readers()
      expect(await respond(q, read, { env: KEY }), q).toEqual({ kind: 'TEXT', says: NOT_ANOTHER_BOOK })
      expect(read.model, q).not.toHaveBeenCalled()
    }
    expect(NOT_ANOTHER_BOOK).toBe('I answer only about your company’s own jobs, timesheets, bills and people, never another company’s book or rates.')
    expect(voiceBreaks(NOT_ANOTHER_BOOK)).toEqual([])
    // A firm this company trades with, named by its legal form, is its own book.
    expect(firmsByForm('Did Computer Systems Inc bill us twice?')).toEqual(['Did Computer Systems Inc'])
    expect(knownFirm('Did Computer Systems Inc', { people: [], firms: ['Computer Systems Inc'] })).toBe(true)
    const own = readers()
    await respond('Did Computer Systems Inc bill us twice?', own, { env: KEY })
    expect(own.model).toHaveBeenCalledTimes(1)
    // "Our other clients" is the reader's own book.
    expect(await offRecord('Which of our other clients pay late?', { named: async () => ({}), names: async () => ({ people: [], firms: [] }) })).toBeNull()
  })

  it('a question in the trade’s words, or one that names somebody on the record, reaches the rules and then the model', async () => {
    const byName = readers()
    await respond('How is Helena Marsh doing?', byName, { env: KEY })
    expect(byName.model).toHaveBeenCalledTimes(1)
    const byWords = readers()
    await respond('Which supplier is slowest to send its invoice?', byWords, { env: KEY })
    expect(byWords.model).toHaveBeenCalledTimes(1)
    // The trade's words decide without reading anybody's name.
    expect(byWords.vocabulary).toHaveBeenCalledTimes(1) // masking, once, as before
    const nobody = readers({ named: vi.fn(async () => ({})) })
    expect(await respond('How is Barnaby doing?', nobody, { env: KEY })).toEqual({ kind: 'TEXT', says: ONLY_THE_RECORD })
    expect(nobody.model).not.toHaveBeenCalled()
  })

  it('an answer keeps its cards by their question ids, so a reload draws them answered', () => {
    expect(cardIdsOf({ kind: 'NEEDS', says: 'One thing.', items: WAITING })).toEqual(['appr-441'])
    expect(cardIdsOf({ kind: 'CONFIRM', says: 'Approve?', decision: 'APPROVED', reason: null, item: WAITING[0] })).toEqual(['appr-441'])
    expect(cardIdsOf({ kind: 'TEXT', says: 'No card.' })).toEqual([])
  })
})

// ── Ask Etyme for a worker (founder, 2026-10-16: the same Ask Etyme, inside her own pages) ──

/** Helena Marsh, on Techpeple's bench, on site at Northbend Athletic through Computer Systems Inc, read on Monday Oct 19, 2026. */
function helena(over: Partial<WorkerFacts> = {}): WorkerFacts {
  const week = (id: string, start: string, end: string, stage: SentWeek['stage'], o: Partial<SentWeek> = {}): SentWeek => ({
    id, periodStart: start, periodEnd: end, hours: 40, stage, waitingOn: null, client: 'Northbend Athletic', employer: 'Techpeple',
    approvedBy: null, stillOwedMinor: null, owedHours: null, currency: null, dueOn: null, overdue: false, paidOn: null, ...o,
  })
  return {
    seat: 'CONSULTANT', seatAt: 'Techpeple',
    placements: [{
      site: 'Northbend Athletic', through: ['Computer Systems Inc'], employer: 'Techpeple', tie: 'EMPLOYED', live: true, endDate: '2027-03-28',
      payRateMinor: 9000, payCurrency: 'USD', rateNote: null,
    }],
    toFile: [
      { periodStart: '2026-10-11', periodEnd: '2026-10-17', site: 'Northbend Athletic', ended: true, wholeWeek: true, expectedHours: 40, dueOn: '2026-10-19' },
      // This week, still running: hers to file as she goes, not a thing to chase.
      { periodStart: '2026-10-18', periodEnd: '2026-10-19', site: 'Northbend Athletic', ended: false, wholeWeek: false, expectedHours: null, dueOn: null },
    ],
    returned: [],
    sent: [
      // Signed by the client, not yet accepted by her employer: waiting, never owed.
      week('ts-oct4', '2026-10-04', '2026-10-10', 'WAITING_FOR_EMPLOYER', { waitingOn: 'Computer Systems Inc' }),
      // Accepted by Techpeple, the firm that pays her: owed, with its pay day.
      week('ts-sep27', '2026-09-27', '2026-10-03', 'OWED', { stillOwedMinor: 360000, owedHours: 40, currency: 'USD', dueOn: '2026-11-09' }),
      week('ts-sep20', '2026-09-20', '2026-09-26', 'PAID', { paidOn: '2026-10-09' }),
    ],
    ownCompanyBills: null,
    weeksWithNoRate: 0,
    papers: [],
    runningOut: [],
    interviews: [],
    stays: [],
    consent: { benches: [{ firm: 'Techpeple', since: 'Mar 2, 2026', stay: 'You stay on Techpeple’s bench until you cancel.' }], asking: [], employers: [] },
    unread: [],
    ...over,
  }
}

/** Every word an answer says, in reading order, cards and table included. */
function everything(a: WorkerAnswer): string {
  return [
    ...(a.where ?? []), a.recommend?.says, a.says,
    ...a.cards.flatMap((c) => [c.title, c.says, c.button]), a.note,
    ...(a.table ? a.table.rows.flatMap((r) => r.cells) : []),
    ...a.more.map((l) => l.says),
    a.papers?.says, ...(a.papers?.cards ?? []).flatMap((c) => [c.title, c.says, c.button]),
    ...(a.tail ?? []).map((l) => l.says),
  ].filter(Boolean).join(' ')
}

describe('Ask Etyme for a worker: her own work, from her own pages, by rules', () => {
  it('a worker’s greeting opens on her chain in one line, then her week, what is owed and when, and names every firm in the chain and no rate but her own', () => {
    const a = workerToday(helena(), { greeting: true })
    expect(a.kind).toBe('WORKER')
    expect(a.greeting).toBe(true)
    // The chain by name, every firm, no rate.
    expect(a.where).toEqual(['You work at Northbend Athletic through Computer Systems Inc, employed by Techpeple.'])
    // What needs her: the week that ended and is not filed, first.
    expect(a.recommend?.says).toBe('File your week of Oct 11–17 for Northbend Athletic.')
    expect(a.says).toBe('One thing needs you. Checked just now.')
    expect(a.cards.map((c) => [c.title, c.says, c.button, c.href])).toEqual([
      ['Your week of Oct 11–17 isn’t filed yet.', '40 hours are expected; file it when you are ready. It is due Oct 19.', 'File my week', '/dashboard/my-work'],
    ])
    // "Etyme never files a week for you" left the greeting (founder, 2026-10-19); the card opens her own page.
    expect(a.note).toBeUndefined()
    expect(everything(a)).not.toContain(NEVER_FILES)
    // Where her weeks stand, then what is owed and when, then the rule; the close and the boundary come last.
    expect(a.more.map((l) => l.says)).toEqual([
      'Your week of Oct 4–10 is signed by Northbend Athletic. It waits for Computer Systems Inc to accept it, then Techpeple.',
      '$3,600.00 is owed to you, for 40 hours Techpeple accepted and has not paid yet.',
      'A week is owed to you once Techpeple accepts it, not when the client signs it.',
    ])
    expect((a.tail ?? []).map((l) => l.says)).toEqual([WORKER_CLOSE, WORKER_BOUNDARY])
    // No rate of any rung: not hers ($90 an hour, said only when she asks), and never a firm's.
    const said = everything(a)
    expect(said).not.toMatch(/\$90|\$118|\$145|an hour|per hour|bill rate/)
    for (const line of [a.recommend!.says, a.says, ...a.more.map((l) => l.says), ...(a.tail ?? []).map((l) => l.says), ...a.cards.map((c) => `${c.title} ${c.says}`)]) {
      expect(voiceBreaks(line), line).toEqual([])
    }
    // Never the two words nobody uses.
    expect(said).not.toMatch(/\bdesk\b|program office/i)
  })

  it('a week still running is not put to her as unfiled, and the hours expected are said only for a whole week from the job’s own hours', () => {
    const now = helena({ toFile: [{ periodStart: '2026-10-18', periodEnd: '2026-10-19', site: 'Northbend Athletic', ended: false, wholeWeek: false, expectedHours: null, dueOn: null }] })
    expect(cardsFor(now)).toEqual([])
    expect(workerToday(now).says).toBe('Nothing needs you today. Checked just now.')
    // A week the placement covers only in part: no figure is invented for it.
    const part = helena({ toFile: [{ periodStart: '2026-10-14', periodEnd: '2026-10-17', site: 'Northbend Athletic', ended: true, wholeWeek: false, expectedHours: null, dueOn: null }] })
    expect(cardsFor(part)[0].says).toBe('File it when you are ready.')
  })

  it('Ask Etyme never files a worker’s week; the card opens her own page', async () => {
    const facts = vi.fn(async () => helena())
    for (const q of ['File my week', 'Submit my hours for last week', 'Log 40 hours for me']) {
      const a = await respondWorker(q, { facts })
      expect(a.says, q).toBe(FILE_IT_YOURSELF)
      expect(a.cards.map((c) => [c.act, c.button, c.href]), q).toEqual([['FILE_WEEK', 'File my week', '/dashboard/my-work']])
    }
    // Nothing to file: said, with the page.
    const none = await respondWorker('File my week', { facts: async () => helena({ toFile: [] }) })
    expect(none.says).toBe(`${FILE_IT_YOURSELF} Every week you can file is filed.`)
    expect(none.links).toEqual([{ label: 'Open Your work', href: '/dashboard/my-work' }])
    // Signing is the client's and her employer's, never Etyme's.
    expect((await respondWorker('Approve my timesheet', { facts })).says).toBe('Etyme never signs a week; Northbend Athletic signs it, then Techpeple accepts it.')
    // And no file under Ask Etyme writes a week: no POST to her filing route, no timesheet written.
    const root = join(process.cwd(), 'src')
    for (const f of ['app/api/conversations/twin/worker.ts', 'app/api/conversations/twin/worker-read.ts', 'app/api/conversations/twin/route.ts', 'app/dashboard/conversations/ask-etyme.tsx']) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src, f).not.toMatch(/POST as (myWork|createTimesheet|submitTimesheet)|timesheets\/[^'"`]*submit|prisma\.timesheet\.(create|update)/)
      expect(src, f).not.toMatch(/fetch\(['"`]\/api\/(me\/work|timesheets)/)
    }
  })

  it('a worker asks what she is owed and reads the employer’s acceptance, never the client’s signature, as the moment it became owed', async () => {
    const a = await respondWorker('What am I owed?', { facts: async () => helena() })
    expect(a.says).toBe('$3,600.00 is owed to you, for 40 hours Techpeple accepted and has not paid yet. Checked just now.')
    expect(a.more.map((l) => l.says)).toEqual([
      'The next pay day for it is Nov 9.',
      'One week you sent, 40 hours, is not owed yet. It waits for Computer Systems Inc.',
      'A week is owed to you once Techpeple accepts it, not when the client signs it.',
    ])
    // The week the client signed is in no amount; the accepted one is, with its pay day; the paid one says paid.
    expect(a.table?.rows.map((r) => r.cells)).toEqual([
      ['Sep 27–Oct 3', '40', '$3,600.00', 'Nov 9'],
      ['Sep 20–26', '40', 'Paid', 'Oct 9'],
    ])
    // A client's signature alone owes her nothing.
    const signedOnly = await respondWorker('When do I get paid?', {
      facts: async () => helena({ sent: helena().sent.filter((w) => w.stage === 'WAITING_FOR_EMPLOYER') }),
    })
    expect(signedOnly.says).toBe('Nothing is owed to you right now. Checked just now.')
    // A part already paid is not owed again: the amount is for the unpaid hours.
    const part = owedSays({ ...helena(), sent: [{ ...helena().sent[1], stillOwedMinor: 144000, owedHours: 16 }] })
    expect(part.says).toBe('$1,440.00 is owed to you, for 16 hours Techpeple accepted and has not paid yet.')
  })

  it('a worker is told only her own rate, and what one firm charges another for her is refused in one sentence', async () => {
    const facts = async () => helena()
    expect((await respondWorker('What is my rate?', { facts })).says).toBe('At Northbend Athletic, Techpeple pays you $90.00 an hour.')
    for (const q of ['What does Northbend pay for me?', 'What is the bill rate for me?', 'What markup does Computer Systems make on me?']) {
      expect((await respondWorker(q, { facts })).says, q).toBe(NOT_THEIR_RATE)
    }
    expect((await respondWorker('What is the capital of France?', { facts })).says).toBe(ONLY_YOUR_WORK)
    // The chain, asked: every firm by name, no rate.
    const chain = await respondWorker('Who employs me?', { facts })
    expect(chain.says).toBe(chainSays(helena().placements[0]))
    expect(chain.more.map((l) => l.says)).toEqual(['You see every firm in your chain. What one firm charges another stays between them.'])
  })

  it('an interview waiting on her answer and a bench stay running out are cards that open her own pages, and a paper that does not stop her work comes after them as one line with an Upload card', () => {
    const f = helena({
      toFile: [],
      papers: [{ id: 'doc-1', name: 'Non-disclosure agreement', todo: 'sign', askedBy: 'Northbend Athletic', dueOn: '2026-10-23', stopsWork: false, href: '/dashboard/my-work/paperwork' }],
      interviews: [{ id: 'iv-1', role: 'ERP finance lead', with: 'Cavanaugh Glassworks', round: 1, waitingOnYou: true, booked: false }],
      stays: [{ listingId: 'bl-1', firm: 'Techpeple', endsOn: '2026-10-25', ended: false, days: 60 }],
    })
    const a = workerToday(f)
    expect(a.cards.map((c) => [c.act, c.title, c.button, c.href])).toEqual([
      ['INTERVIEW', 'Cavanaugh Glassworks asked to interview you for ERP finance lead.', 'Answer interview', '/dashboard/my-work'],
      ['RENEW', 'Your stay on Techpeple’s bench ends on Oct 25.', 'Renew for 60 days', '/dashboard/my-benches'],
    ])
    expect(a.cards[1].listingId).toBe('bl-1')
    expect(a.papers?.says).toBe('One paper is asked of you: your non-disclosure agreement.')
    expect(a.papers?.cards.map((c) => [c.act, c.title, c.button, c.href])).toEqual([
      ['PAPER', 'Non-disclosure agreement for Northbend Athletic', 'Sign', '/dashboard/my-work/paperwork'],
    ])
    expect(a.recommend?.says).toBe('Answer Cavanaugh Glassworks’ interview request for ERP finance lead.')
    expect(a.says).toBe('Three things need you. Checked just now.')
    // A paper that stops her work stays with the week, first.
    const stops = workerToday(helena({ toFile: [], papers: [{ ...f.papers[0], stopsWork: true }] }))
    expect(stops.cards.map((c) => c.act)).toEqual(['PAPER'])
    expect(stops.papers).toBeUndefined()
    // The screen gives a paper card Upload and Later; Later changes nothing on the record.
    const chat = readFileSync(join(process.cwd(), 'src', 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    expect(chat).toContain('{onLater && <button type="button" className="btn-secondary text-[13px]" onClick={onLater}>Later</button>}')
    expect(chat).toContain('It stays on Your paperwork.')
    // No card files a week here, so the line about filing is not said.
    expect(a.note).toBeUndefined()
  })

  it('a renewal card renews her stay through the bench route she already uses, on her own press; nothing in the worker’s chat asks the approval route or adds an act', () => {
    const chat = readFileSync(join(process.cwd(), 'src', 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    const renew = chat.slice(chat.indexOf('const renew = async'), chat.indexOf('// "Not now" changes nothing'))
    expect(renew).toContain("const res = await fetch(RENEW, {\n        method: 'PATCH',")
    expect(renew).toContain('body: JSON.stringify({ renew: card.listingId }),')
    expect(renew).not.toContain('decisionRequest')
    // The worker's module asks nothing of the twin's ledger.
    for (const f of ['app/api/conversations/twin/worker.ts', 'app/api/conversations/twin/worker-read.ts']) {
      const src = readFileSync(join(process.cwd(), 'src', f), 'utf8')
      expect(src, f).not.toMatch(/@\/lib\/twin\/|requestApproval|decideApproval|\bact\(/)
    }
  })

  it('a part of her record that could not be read is said, never answered as nothing', async () => {
    const a = workerToday(helena({ toFile: [], sent: [], unread: ['weeks'] }))
    expect(a.more[0].says).toBe('Etyme could not read your weeks and pay just now, so they are not in this list. Staff have been told.')
    const owed = await respondWorker('What am I owed?', { facts: async () => helena({ unread: ['weeks'] }) })
    expect(owed.says).toBe('Etyme could not read your weeks and pay just now, so they are not in this list. Staff have been told.')
    expect(owed.table).toBeUndefined()
  })

  it('a worker’s seat is somebody on a firm’s bench, or a firm’s own employee with only the reads of their own work; a seat with a desk reads the firm’s Ask Etyme', () => {
    expect(isWorkerSeat({ contextType: 'CONSULTANT', permissions: [] })).toBe(true)
    expect(isWorkerSeat({ contextType: 'EMPLOYEE', permissions: ['assignments.read', 'timesheets.read'] })).toBe(true)
    expect(isWorkerSeat({ contextType: 'EMPLOYEE', permissions: ['invoices.read', 'payments.record'] })).toBe(false)
    expect(isWorkerSeat({ contextType: 'EMPLOYEE', permissions: ['*'] })).toBe(false)
    expect(isWorkerSeat({ contextType: 'CONSULTANT', permissions: [], readOnly: true })).toBe(false)
    expect(isWorkerSeat({ contextType: 'EMPLOYEE', permissions: [], isService: true })).toBe(false)
  })

  it('a worker’s chips are her five questions, the box and the line under it are about her work, and her greeting closes on what Etyme never does for her', () => {
    expect(WORKER_QUESTIONS).toEqual(['What needs me today?', 'Is my week signed?', 'What am I owed?', 'What papers are due?', 'Who has my consent?'])
    const chat = readFileSync(join(process.cwd(), 'src', 'app/dashboard/conversations/ask-etyme.tsx'), 'utf8')
    expect(chat).toContain("{(worker || party === 'WORKER' ? WORKER_QUESTIONS : questionsFor(party)).map((q) => (")
    expect(chat).toContain('if (body?.data?.worker === true) setWorker(true)')
    expect(WORKER_CLOSE).toBe('Ask me about your weeks, your pay, your papers and your consent. I never file or sign anything for you.')
    expect(WORKER_BOUNDARY).toBe('Your record stays yours. Every read is logged. Nothing you type leaves to a model.')
    // The line under her box is hers too: never the firm's line about outside messages and money.
    expect(WORKER_FOOTER).toBe('Etyme answers from your own record. It never files, signs or sends anything for you.')
    // A saved worker answer is drawn again on a reload, as a worker answer.
    expect(chat).toContain("'MODEL', 'WORKER', 'LIST']")
    const asAnswer: Answer = workerToday(helena())
    expect(cardIdsOf(asAnswer)).toEqual([])
  })

  it('the mark’s count for a worker is her greeting’s cards, read without marking anything seen', async () => {
    // Three things need her: a week sent back, a week saved and never sent, a week to file.
    const three = helena({
      returned: [{ periodStart: '2026-09-13', periodEnd: '2026-09-19', site: 'Northbend Athletic', reason: 'Tuesday reads 14 hours' }],
      sent: [{
        id: 'ts-draft', periodStart: '2026-09-06', periodEnd: '2026-09-12', hours: 40, stage: 'NOT_SENT', waitingOn: null, client: 'Northbend Athletic',
        employer: 'Techpeple', approvedBy: null, stillOwedMinor: null, owedHours: null, currency: null, dueOn: null, overdue: false, paidOn: null,
      }],
    })
    expect(cardsFor(three)).toHaveLength(3)
    expect(workerToday(three, { greeting: true }).says).toBe('Three things need you. Checked just now.')

    noticeCalls.length = 0
    const needs = vi.fn(async () => 9)
    const total = await owedTotal({ worker: true, facts: async () => three, needs })
    expect(total).toBe(3)
    // The firm's decisions queue owes a worker nothing, so it is not asked.
    expect(needs).not.toHaveBeenCalled()
    // Read without a write: no notice read or marked seen.
    expect(noticeCalls).toEqual([])
    // The answer's shape is the one the mark already reads off the decisions queue.
    expect(owedFrom({ data: { total } })).toBe(3)

    // A firm's seat reads the greeting's own headline figure, the decisions total; never a guess.
    const facts = vi.fn(async () => three)
    expect(await owedTotal({ worker: false, facts, needs: async () => 5 })).toBe(5)
    expect(await owedTotal({ worker: false, facts, needs: async () => null })).toBeNull()
    expect(await owedTotal({ worker: false, facts, needs: async () => { throw new Error('down') } })).toBeNull()
    expect(facts).not.toHaveBeenCalled()
    expect(owedFrom({ data: { total: null } })).toBeNull()

    // The route answers it before any greeting, and that branch marks nothing, keeps nothing.
    const route = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
    const branch = route.indexOf("if (request.nextUrl.searchParams.get('only') === 'owed') return owedCount(caller, request)")
    expect(branch).toBeGreaterThan(0)
    expect(branch).toBeLessThan(route.indexOf('if (asWorker(caller)) return workerGreeting(caller, request)'))
    const body = route.slice(route.indexOf('async function owedCount('), route.indexOf("/** The worker's greeting and her saved thread."))
    expect(body).toContain('return NextResponse.json({ data: { total } })')
    expect(body).not.toMatch(/markNoticesSeen|unreadNotices|appendTurn|markCard|clearThread|prisma\./)
    const owedSrc = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/owed.ts'), 'utf8')
    expect(owedSrc).not.toMatch(/markNoticesSeen|unreadNotices|appendTurn|prisma/)
  })
})


describe('every first screen names a person and the step in front of them (founder, 2026-10-19)', () => {
  // Northbend Athletic's program manager, as GET /api/decisions answers her:
  // a start the paperwork will refuse and a supplier with no agreement.
  const NORTHBEND_QUEUE = {
    data: {
      total: 2,
      decisions: [
        {
          type: 'START_HELD', title: 'Ingrid Sørensen — through Pinnacle Resourcing', named: { whose: 'Ingrid Sørensen', what: 'start', whats: 'starts' },
          subtitle: 'Cannot start without an I-9 (proof of right to work). Get it on file, then activate.',
          entityType: 'SELL_CONTRACT', entityId: 'sc-ingrid', dueDate: '2026-10-22T00:00:00.000Z', actionUrl: '/dashboard/placements/sc-ingrid',
        },
        {
          type: 'NO_AGREEMENT', title: 'Teleworld Solutions', named: { whose: 'Teleworld Solutions', what: 'missing agreement', whats: 'missing agreements' },
          subtitle: '2 people are on site through Teleworld Solutions, and no agreement with them is on file. Put one on file.',
          entityType: 'COMPANY', entityId: 'c-teleworld', dueDate: null, actionUrl: '/dashboard/program/agreements',
        },
      ],
    },
  }
  const quiet = { waiting: async () => [], othersWaiting: async () => [], limits: async () => ({ ok: false as const, says: 'no' }), spendIn: async () => ({ ok: false as const, says: 'no' }) }

  it('the greeting’s first line is the decisions queue’s own sentence with the names in it — the one the mark and the program page read — then “Open the list” and when it looked', async () => {
    const queue = queueFrom({ data: { ...NORTHBEND_QUEUE.data, says: 'Two things need you: Ingrid Sørensen’s start, and Teleworld Solutions’ missing agreement.' } })!
    expect(queue.total).toBe(2)
    const hello = await today(readers(quiet), { now: NOW, greeting: true, needs: async () => queue })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.says).toBe('Two things need you: Ingrid Sørensen’s start, and Teleworld Solutions’ missing agreement. Open the list. Checked just now.')
    expect(hello.saysLinks).toEqual([{ text: OPEN_THE_LIST, href: DECISIONS_HREF }])
    expect(voiceBreaks(hello.says)).toEqual([])
    // Never a count with no names, where the queue gave its rows.
    expect(hello.says).not.toMatch(/; open the list to see/)
    // The cards under it still name the step: who cannot start, on which day, without which paper.
    expect(hello.queue!.map((c) => c.title)).toEqual([
      'Ingrid Sørensen cannot start on Oct 22 without an I-9.',
      'Teleworld Solutions has two people on site with no agreement on file.',
    ])
  })

  it('where the queue gives its rows and no sentence, the greeting names them itself: the person, the day and the paper; the supplier and how many it has on site', async () => {
    const queue = queueFrom(NORTHBEND_QUEUE)!
    const hello = await today(readers(quiet), { now: NOW, greeting: true, needs: async () => queue })
    if (hello.kind !== 'NEEDS') throw new Error('not a greeting')
    expect(hello.says).toBe(
      'Two things need you: Ingrid Sørensen cannot start on Oct 22 without an I-9; ' +
      'Teleworld Solutions has two people on site with no agreement on file. Open the list. Checked just now.')
    expect(voiceBreaks(hello.says)).toEqual([])
  })

  it('past three things, the first three are named and the rest are said as “and n more”', () => {
    const rows: QueueRead = {
      total: 5,
      items: ['Helena Marsh', 'Omar Haddad', 'Lucía Fernández', 'Tobias Lindqvist', 'Priya Raman'].map((name, i) => ({
        type: 'TIMESHEET_APPROVAL', title: `Approve timesheet — ${name}`, whose: name, subtitle: '40h · through Pinnacle Resourcing · Oct 11 – Oct 17', entityId: `ts-${i}`,
      })),
    }
    expect(namedNeedsSays(rows, [])!.says).toBe(
      'Five things need you: Helena Marsh’s timesheet waits for your approval; Omar Haddad’s timesheet waits for your approval; ' +
      'Lucía Fernández’s timesheet waits for your approval; and two more. Open the list.')
    expect(namedNeedsSays({ total: 0, items: [] }, [])).toBeNull()
  })

  it('every decision in the count is a card: a week or an expense is approved or accepted on the one route that already does it, and anything else opens its own page', () => {
    const cards = queueCards({
      total: 5,
      items: [
        { type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Helena Marsh', subtitle: '40h · through Pinnacle Resourcing · Oct 11 – Oct 17', entityId: 'ts-1', actionUrl: '/dashboard/timesheets?id=ts-1' },
        { type: 'TIMESHEET_APPROVAL', title: 'Accept timesheet — Omar Haddad', subtitle: '45h · from Brightmoor Staffing · week of Oct 11 · signed above you', entityId: 'ts-2', actionUrl: '/dashboard/timesheets?id=ts-2' },
        { type: 'EXPENSE_APPROVAL', title: 'Review expense — Priya Raman', subtitle: '$790.40 · TRAVEL · Billable · Computer Systems Inc', entityId: 'ex-1', actionUrl: '/dashboard/expenses' },
        { type: 'EXPENSE_ACCEPTANCE', title: 'Accept expense — Rosa Delgado', subtitle: '$234.00 · Travel · from Brightmoor Staffing', entityId: 'ex-2', actionUrl: '/dashboard/expenses' },
        ...queueFrom(NORTHBEND_QUEUE)!.items,
        // The twin's own question is drawn as its own card, with Yes and Not now, never twice.
        { type: 'TWIN_QUESTION', title: 'Approve a supplier’s invoice receipt', entityId: 'appr-441', actionUrl: '/dashboard/conversations/etyme' },
      ],
    })
    expect(cards.map((c) => [c.title, c.fact, c.act?.label ?? 'Open', c.act?.url ?? c.href])).toEqual([
      ['Helena Marsh’s timesheet waits for your approval.', '40 hours, through Pinnacle Resourcing, Oct 11 – Oct 17.', 'Approve timesheet', '/api/timesheets/ts-1/approve'],
      ['Omar Haddad’s timesheet waits for you to accept it.', '45 hours, from Brightmoor Staffing, week of Oct 11, signed above you.', 'Accept timesheet', '/api/timesheets/ts-2/approve'],
      ['Priya Raman’s expense waits for your approval.', '$790.40, Travel, Billable, Computer Systems Inc.', 'Approve expense', '/api/expenses/actions'],
      ['Rosa Delgado’s expense waits for you to accept it.', '$234.00, Travel, from Brightmoor Staffing.', 'Accept expense', '/api/expenses/ex-2/accept'],
      ['Ingrid Sørensen cannot start on Oct 22 without an I-9.', 'Cannot start without an I-9 (proof of right to work). Get it on file, then activate.', 'Open', '/dashboard/placements/sc-ingrid'],
      ['Teleworld Solutions has two people on site with no agreement on file.', 'Put one on file.', 'Open', '/dashboard/program/agreements'],
    ])
    // The bodies are the ones the decisions page and Timesheets already send.
    expect(cards[2].act!.body).toEqual({ action: 'approve', expenseIds: ['ex-1'] })
    expect(cards[3].act!.body).toEqual({ decision: 'accept' })
    // No card reaches a route of its own: the approve, the expense actions and the accept, and nothing else.
    for (const c of cards) if (c.act) expect(c.act.url).toMatch(/^\/api\/(timesheets\/[^/]+\/approve|expenses\/actions|expenses\/[^/]+\/accept)$/)
  })

  it('a flagged week is never a one-tap card: it opens the week, where the reason is asked, and the card says why', () => {
    const [card] = queueCards({ total: 1, items: [{ type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Lucía Fernández', subtitle: '44h · through Brightmoor Staffing · Oct 4 – Oct 10', flag: '44 hours against a 40-hour job', entityId: 'ts-l', actionUrl: '/dashboard/timesheets?id=ts-l' }] })
    expect(card.act).toBeNull()
    expect(card.href).toBe('/dashboard/timesheets?id=ts-l')
    expect(card.fact).toBe('44 hours, through Brightmoor Staffing, Oct 4 – Oct 10. 44 hours against a 40-hour job. Open it to approve with a reason.')
  })

  it('“Since you last looked” says who and what — the weeks to approve by a day with the names in it, and a worker’s week by its dates — and never a count in parentheses', () => {
    const monday = '2026-10-19T00:00:00.000Z'
    const due = (id: string, who: string, kind = 'TIMESHEET_APPROVE') => ({
      id, title: `${kind === 'TIMESHEET_APPROVE' ? 'Hours to approve' : 'Hours due'} — in 3 days`, href: '/dashboard/timesheets', type: 'CYCLE_DUE',
      body: `${who} at Northbend Athletic — Oct 19, 2026`, cycleKind: kind, dueOn: monday,
    })
    const thursday = new Date('2026-10-15T15:00:00Z')
    const five = ['Helena Marsh', 'Omar Haddad', 'Lucía Fernández', 'Tobias Lindqvist', 'Priya Raman'].map((w, i) => due(`n-${i}`, w))
    expect(sinceSays(five, 0, { now: thursday }).map((l) => l.says)).toEqual([
      SINCE_HEADING, 'You have five weeks to approve by Monday: Helena Marsh, Omar Haddad, Lucía Fernández and two more.',
    ])
    expect(sinceSays([due('n-1', 'Helena Marsh')], 0, { now: thursday }).map((l) => l.says)[1]).toBe('You have Helena Marsh’s week to approve by Monday.')
    // To the worker herself: her week, by its days, and where she files it.
    const hers = sinceSays([due('n-9', 'Helena Marsh', 'TIMESHEET_SUBMIT')], 0, { now: thursday, worker: true })
    expect(hers.map((l) => l.says)).toEqual([SINCE_HEADING, 'Your week of Oct 11–17 is due on Monday. You file it on Your work.'])
    expect(hers[1].links).toEqual([{ text: 'Your work', href: '/dashboard/my-work' }])
    for (const l of [...sinceSays(five, 0, { now: thursday }), ...hers]) {
      expect(l.says).not.toMatch(/\(\d+ times\)|— in \d+ days/)
      expect(voiceBreaks(l.says)).toEqual([])
    }
    expect(whenSays('2026-10-16', thursday)).toBe('tomorrow')
    expect(whenSays('2026-10-30', thursday)).toBe('Oct 30')
    expect(weekDueOn('2026-10-26')).toBe('Oct 18–24')
    expect(weekDueOn('2026-10-27')).toBeNull()
  })

  it('a conversation another company or a candidate wrote on is one line naming who wrote and about what, at most three, then the rest in one line that opens Conversations', () => {
    const t = (id: string, who: string, whoKind: 'FIRM' | 'CANDIDATE' | 'COLLEAGUE', about: string | null) => ({ conversationId: id, who, whoKind, about, href: `/dashboard/conversations?open=${id}` })
    const lines = threadsSay([
      t('c1', 'Brightmoor Staffing', 'FIRM', 'the HCM integration lead job'),
      t('c2', 'Jonas Whitaker', 'CANDIDATE', 'the HCM integration lead job'),
      t('c3', 'Marcus Oyelaran', 'COLLEAGUE', null),
    ], 2)
    expect(lines.map((l) => l.says)).toEqual([
      'Brightmoor Staffing wrote to you about the HCM integration lead job.',
      'Jonas Whitaker, a candidate, wrote to you about the HCM integration lead job.',
      'Marcus Oyelaran wrote to you.',
      'And two more conversations have new messages.',
    ])
    expect(lines[0].links).toEqual([{ text: 'Brightmoor Staffing', href: '/dashboard/conversations?open=c1' }])
    expect(lines[3].links).toEqual([{ text: 'two more conversations', href: '/dashboard/conversations' }])
    // In the greeting they come first under "Since you last looked", and the route marks only their notes read.
    const since = sinceSays([], 0, { threads: [t('c1', 'Brightmoor Staffing', 'FIRM', 'the HCM integration lead job')] })
    expect(since.map((l) => l.says)).toEqual([SINCE_HEADING, 'Brightmoor Staffing wrote to you about the HCM integration lead job.'])
    const route = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
    expect(route).toContain('markNoticesSeen(caller, threads.noticeIds)')
    const notices = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/notices.ts'), 'utf8')
    expect(notices).toContain("where: { id: { in: order }, archivedAt: null, ...(me ? { OR: [{ companyId: me }, { withCompanyId: me }] } : {}) }")
  })

  it('the closing line, the four chips and the box are the party’s own: a client and an MSP ask about contractors, a supplier about its people and money, a one-person firm about her own work', () => {
    expect(partyOf({ companyKind: 'CLIENT' })).toBe('CLIENT')
    expect(partyOf({ companyKind: 'MSP', seatedAt: 'Cavanaugh Glassworks' })).toBe('MSP')
    expect(partyOf({ companyKind: 'VENDOR' })).toBe('FIRM')
    expect(partyOf({ companyKind: 'GSI' })).toBe('FIRM')
    expect(partyOf({ companyKind: 'CONSULTANT_CORP' })).toBe('SOLO')
    expect(partyOf({ companyKind: 'VENDOR', worker: true })).toBe('WORKER')
    expect(closeFor('CLIENT')).toBe('Ask me about your jobs, candidates, timesheets and invoice receipts. I answer from the record, and I never move money without a person.')
    expect(closeFor('MSP', 'Cavanaugh Glassworks')).toBe('Ask me about Cavanaugh Glassworks’ jobs, candidates, timesheets and invoice receipts. I answer from the record, and I never move money without a person.')
    expect(closeFor('FIRM')).toBe('Ask me about our people, our bench, our weeks and our bills. I answer from the record, and I never move money without a person.')
    expect(closeFor('SOLO')).toBe('Ask me about your weeks, your bills, your papers and your contract. I never file or sign anything for you.')
    expect(GREETING_CLOSE).toBe(closeFor('CLIENT'))
    for (const p of ['CLIENT', 'MSP', 'FIRM', 'SOLO'] as const) expect(closeFor(p)).not.toMatch(/anything about the program/)
    expect(questionsFor('FIRM')).toEqual(['Who rolls off in the next 30 days?', 'Who is on the bench?', 'Which weeks are signed and not billed?', 'Which bills are unpaid?'])
    expect(questionsFor('SOLO')).toEqual(['Is my week signed?', 'What have I billed and not been paid?', 'What papers are due?', 'When does my contract end?'])
    expect(questionsFor('MSP')).toEqual(SUGGESTED_QUESTIONS)
    expect(FIRM_QUESTIONS.concat(SOLO_QUESTIONS)).not.toContain('Who is near the time limit?')
    expect([placeholderFor('CLIENT'), placeholderFor('MSP'), placeholderFor('FIRM'), placeholderFor('SOLO'), placeholderFor('WORKER')])
      .toEqual(['Ask Etyme about your contractors…', 'Ask Etyme about your contractors…', 'Ask Etyme about our people…', 'Ask Etyme about your work…', 'Ask Etyme about your work…'])
    // Every firm chip and every solo chip is read by a rule, never left to the model.
    for (const q of FIRM_QUESTIONS) expect(readAsk(q).kind).not.toBe('ASK')
    expect(readAsk('What have I billed and not been paid?').kind).toBe('UNPAID')
  })

  it('a firm’s money line reads only the firm’s own sell lines, never a line scoped by the site it works at, so no rung’s rate in a chain reaches it', () => {
    const billing = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/billing.ts'), 'utf8')
    expect(billing).toContain("where: andAll({ companyId: company.id, state: 'IN_PROGRESS' }, wall.where),")
    expect(billing).not.toMatch(/endClientFilter|clientCompanyId|endClientCompanyId/)
    // The reads scoped by a site carry no rate at all.
    const read = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/read.ts'), 'utf8')
    expect(read).toContain('endClientFilter(')
    expect(read).not.toMatch(/billRate|payRate/)
  })

  it('a client’s money line names both figures, a firm’s names what its people bill and what its sub-vendors billed it, and a figure the record cannot price is left out', async () => {
    const rows = spendBySupplier([{ invoiceId: 'i', number: 'N', supplier: 'S', currency: 'USD', totalMinor: 4258700, paidMinor: 0 }])
    const oct = new Date('2026-10-01T00:00:00Z')
    expect(billedSays(rows, 'Oct 2026', { from: oct, monthly: { minor: 13520000, currency: 'USD' } })!.says)
      .toBe('Suppliers billed $42,587 so far in October; current rates come to $135,200 a month.')
    // Where the dashboard could not price every seat, the rates clause is left out rather than guessed.
    expect(billedSays(rows, 'Oct 2026', { from: oct, monthly: null })!.says).toBe('Suppliers billed $42,587 so far in October.')
    expect(billingSays({ people: 3, monthlyMinor: 5968000, currency: 'USD' })).toBe('Three people are billing: $59,680 a month at current rates.')
    expect(billingSays({ people: 3, monthlyMinor: null, currency: null })).toBe('Three people are billing today.')
    const firm = await today(readers({
      ...quiet,
      spendIn: async () => ({ ok: true as const, receipts: [{ invoiceId: 'i', number: 'N', supplier: 'S', currency: 'USD', totalMinor: 1392000, paidMinor: 0 }], undated: 0 }),
      billing: async () => ({ people: 3, monthlyMinor: 5968000, currency: 'USD' }),
    }), { now: NOW, greeting: true, party: 'FIRM' })
    expect(firm.kind === 'NEEDS' && firm.more!.map((l) => l.says)[0]).toBe('Three people are billing: $59,680 a month at current rates. Sub-vendors billed you $13,920 so far in October.')
    expect(firm.kind === 'NEEDS' && firm.more!.map((l) => l.says)).toContain(closeFor('FIRM'))
  })

  it('a supplier asks who rolls off, who is on the bench, which weeks are signed and not billed and which bills are unpaid, and each is answered from the record in a sentence over a table', async () => {
    const book = readers({
      rollingOff: async () => ({ ok: true as const, rows: [{ personId: 'p-f', person: 'Felix Brenner', site: 'Northbend Athletic', endsOn: '2026-11-06', daysLeft: 18, href: '/dashboard/contracts/sc-f' }] }),
      bench: async () => ({ ok: true as const, rows: [{ personId: 'p-k', person: 'Karthik Menon', free: 'Free now', skills: ['Validation'] }] }),
      unbilledWeeks: async () => ({ ok: true as const, rows: [{ timesheetId: 'ts-h', person: 'Helena Marsh', customer: 'Computer Systems Inc', periodStart: '2026-09-20', periodEnd: '2026-09-26', hours: 40, signedOn: '2026-09-28', href: '/dashboard/weeks/ts-h' }] }),
      unpaidBills: async () => ({ ok: true as const, rows: [{ invoiceId: 'inv-1', number: 'IN-1', customer: 'Corveldt Aerospace', dueMinor: 9500000, currency: 'USD', dueOn: '2026-10-08', held: false, href: '/dashboard/invoices/inv-1' }] }),
    })
    const said = async (q: string) => {
      const a = await respond(q, book, { env: NO_KEY, now: NOW, companyKind: 'GSI', party: 'FIRM' })
      expect(a.kind, q).toBe('LIST')
      if (a.kind !== 'LIST') return ''
      expect(a.table?.rows.length).toBe(1)
      for (const s of sentencesOf(a.says)) expect(voiceBreaks(s), s).toEqual([])
      return a.says
    }
    expect(await said('Who rolls off in the next 30 days?')).toBe('Plan Felix Brenner’s next job now; Felix Brenner rolls off at Northbend Athletic on Nov 6, 2026. One person rolls off in the next 30 days. Checked just now.')
    expect(await said('Who is on the bench?')).toBe('One person is on your bench: Karthik Menon. Checked just now.')
    expect(await said('Which weeks are signed and not billed?')).toBe('Bill Computer Systems Inc for Helena Marsh’s week of Sep 20–26 first; it was signed 14 days ago. One signed week is on no bill yet. Checked just now.')
    expect(await said('Which bills are unpaid?')).toBe('Chase bill IN-1 first; Corveldt Aerospace is 4 days past the due date. One bill is unpaid: $95,000.00 in all. Checked just now.')
    // With nothing on the record, each says so.
    expect(rolloffSays([])).toBe('Nobody on your contracts rolls off in the next 30 days. Checked just now.')
    expect(benchSays([])).toBe('Nobody is on your bench today. Checked just now.')
    expect(unbilledSays([], NOW)).toBe('Every signed week is on a bill. Checked just now.')
    expect(unpaidSays([], NOW)).toBe('Every bill you sent is paid. Checked just now.')
    // A seat with no such read is not answered by a guess: the question goes to the rest of the rules.
    expect((await respond('Who is on the bench?', readers(), { env: NO_KEY, now: NOW })).says).toBe(NO_MODEL)
  })

  it('a one-person firm asks when her contract ends and reads it from her own placement', async () => {
    const a = await respondWorker('When does my contract end?', { facts: async () => helena() })
    expect(a.says).toBe('Your contract at Northbend Athletic ends on Mar 28, 2027. Checked just now.')
    // The route sends her week, her papers and her contract to her own pages, and what she billed to the firm's book.
    const route = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
    expect(route).toContain("const solo = who.party === 'SOLO' && readAsk(text).kind !== 'UNPAID'")
  })

  it('a worker’s greeting ends on where she stands against the client’s time limit, in whole months, after the papers', () => {
    const a = workerToday(helena({ limits: [{ site: 'Northbend Athletic', months: 6, capMonths: 18, past: false }] }), { greeting: true })
    expect(a.tail![0].says).toBe('You are six months into Northbend Athletic’s eighteen-month time limit.')
    expect(limitLine({ site: 'Northbend Athletic', months: 18, capMonths: 18, past: true })).toBe('You have reached Northbend Athletic’s eighteen-month time limit.')
    expect(limitLine({ site: 'Talvern Medical', months: 0, capMonths: 12, past: false })).toBe('You are under a month into Talvern Medical’s twelve-month time limit.')
  })

  it('the greeting starts every read at once — the queue, the program’s picture, the notices, the saved thread — rather than one after another', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/route.ts'), 'utf8')
    const greet = route.slice(route.indexOf('// Every read starts at once'), route.indexOf('return NextResponse.json({ data: { answer, model, party'))
    expect(greet).toContain('const thread = threadFor(caller, take)')
    expect(greet).toContain('const picture = pictureFor(request)')
    expect(greet).not.toContain('picture: await pictureFor(request)')
    expect(greet).toMatch(/await Promise\.all\(\[\s+unreadNotices\(caller\), unreadThreads\(caller\), modelSwitchFor\(company\.id\), partyFor\(caller\),/)
    // The paying clerk's receipts are each checked at the same time, not in turn.
    const read = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/read.ts'), 'utf8')
    expect(read).toContain('const verdicts = await Promise.all(flagged.map((f) => invoiceVerdict(f.entityId, rules)))')
  })
})
