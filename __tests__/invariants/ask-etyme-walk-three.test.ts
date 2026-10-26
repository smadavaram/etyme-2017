/**
 * The second production browser walk (deploy fd050ca52, 2026-10-26)
 * found twelve faults in what Ask Etyme says. One sentence each, read
 * against the pure rules in app/api/conversations/twin and, where the
 * fault was in the wiring, against the route's own source.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  today, respond, queueCards, carriedByTwin, payYesSays, deskRefusal, namedNeedsSays, withOwnPapers, withoutOwnWeek,
  sinceSays, lastPaidNotHere, readAsk, questionsFor, othersSay, sendCards, voiceBreaks,
  type Readers, type WaitingItem, type QueueRead, type OtherWaiting, type NoticeLine,
} from '@/app/api/conversations/twin/ask'
import { readWorkerAsk, respondWorker, weekStandsSays, stageWord, type WorkerFacts, type SentWeek } from '@/app/api/conversations/twin/worker'
import { anotherFirmsMoney } from '@/app/api/conversations/twin/transaction'
import { mismatchSays, MISMATCH_TITLE } from '@/app/api/conversations/twin/notices'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-10-26T15:00:00Z')

const PAY_ITEM: WaitingItem = {
  n: 1, approvalId: 'ap-pay', entryId: 'e-pay', says: 'Pay a supplier’s invoice receipt',
  title: 'IN-FMDSDT-20260901 from Computer Systems Inc', ruleCited: 'Three-way check', rationale: 'Approve it for payment: it matches the signed hours and the contract rate.',
  href: '/dashboard/invoices/inv-fm', action: 'invoice_receipt.pay', entity: { type: 'Invoice', id: 'inv-fm' },
  pay: { supplier: 'Computer Systems Inc', number: 'IN-FMDSDT-20260901' },
}

const AP_QUEUE: QueueRead = {
  total: 2,
  items: [
    { type: 'INVOICE_RECEIPT_TO_PAY', title: 'Pay — Pinnacle Resourcing', whose: 'Pinnacle Resourcing', subtitle: 'Invoice PR-2026-0441 · $3,920.00', entityId: 'inv-441' },
    { type: 'INVOICE_RECEIPT_TO_PAY', title: 'Pay — Computer Systems Inc', whose: 'Computer Systems Inc', subtitle: 'Invoice IN-FMDSDT-20260901 · $17,400.00', entityId: 'inv-fm', twinApprovalId: 'ap-pay' },
  ],
}

function readers(over: Partial<Readers> = {}): Readers {
  return {
    waiting: vi.fn(async () => []),
    othersWaiting: vi.fn(async () => []),
    limits: vi.fn(async () => ({ ok: true as const, entries: [] })),
    unsignedWeeks: vi.fn(async () => ({ ok: true as const, total: 0, company: 'Cavanaugh Glassworks', rows: [], maySign: false })),
    spendIn: vi.fn(async () => ({ ok: true as const, receipts: [], undated: 0 })),
    told: vi.fn(async () => ({ told: [], stale: [] })),
    named: vi.fn(async () => ({})),
    entry: vi.fn(async () => null),
    receiptsIn: vi.fn(async () => ({ ok: true as const, receipts: [] })),
    ledgerLines: vi.fn(async () => []),
    modelOn: vi.fn(async () => false),
    vocabulary: vi.fn(async () => ({ people: ['Ruben Ortega'], firms: ['Halcyon Talent', 'Arcadia Tech Group'] })),
    model: vi.fn(async () => null),
    logPrompt: vi.fn(async () => undefined),
    ...over,
  } as Readers
}

describe('a clean invoice receipt is one card in Ask Etyme (walk three, item 1)', () => {
  it('the pay card replaces the queue’s pay item for the same receipt, and the other receipt keeps its own card', () => {
    const cards = queueCards(AP_QUEUE, [PAY_ITEM])
    expect(cards.map((c) => c.key)).toEqual(['INVOICE_RECEIPT_TO_PAY:inv-441'])
    expect(carriedByTwin(AP_QUEUE.items[1], [PAY_ITEM])).toBe(true)
  })

  it('a receipt the queue did not fold is still matched to the pay card by the invoice it is about', () => {
    const row = { ...AP_QUEUE.items[1], twinApprovalId: null }
    expect(carriedByTwin(row, [PAY_ITEM])).toBe(true)
    expect(carriedByTwin(row, [])).toBe(false)
  })

  it('the greeting draws the pay card and not the pay item for the receipt it asks about', async () => {
    const a = await today(readers({ waiting: vi.fn(async () => [PAY_ITEM]) }), { now: NOW, needs: async () => AP_QUEUE, greeting: true })
    if (a.kind !== 'NEEDS') throw new Error(a.kind)
    expect(a.items.map((i) => i.approvalId)).toEqual(['ap-pay'])
    expect((a.queue ?? []).some((c) => c.key.endsWith('inv-fm'))).toBe(false)
  })
})

describe('the pay card says what its yes does (walk three, item 2)', () => {
  it('the line under “Pay …?” says the yes records the payment under the reader’s name with the bank reference, never “Approve it for payment”', () => {
    const says = payYesSays(PAY_ITEM.pay!)
    expect(says).toBe('Yes records this payment to Computer Systems Inc under your name, with the bank reference below.')
    expect(voiceBreaks(says)).toEqual([])
    const card = src('src/app/dashboard/conversations/ask-etyme.tsx')
    const pay = card.slice(card.indexOf('function PayCard'), card.indexOf('function QueueCardView'))
    expect(pay).toContain('payYesSays(item.pay!)')
    expect(pay).not.toContain('{item.rationale}')
    expect(pay).toContain('NEEDS_BANK_REFERENCE')
  })
})

describe('a seated MSP reads its client’s program, not its own book (walk three, items 3, 4 and 6)', () => {
  it('“Since you last looked” for a seated firm reads only notices written at the client’s program or at no company', () => {
    const route = src('src/app/api/conversations/twin/route.ts')
    expect(route).toMatch(/unreadNotices\(caller, \{ program: seat\?\.clientCompany\.id \?\? null \}\)/)
    const notices = src('src/app/api/conversations/twin/notices.ts')
    expect(notices).toMatch(/if \(opts\.program\)[\s\S]{0,400}\{ OR: \[\{ companyId: null \}, \{ companyId: opts\.program \}\] \}/)
  })

  it('the time limit is read from the program the firm is seated in, under the seat’s role, as the program page reads it', () => {
    const read = src('src/app/api/conversations/twin/read.ts')
    const limits = read.slice(read.indexOf('async limits()'), read.indexOf('async unsignedWeeks()'))
    expect(limits).toContain('const program = seated ? seat!.clientCompany.id : companyId')
    expect(limits).toContain('actingInSeat(caller, seat!).permissions, OWNER_DESKS')
    expect(limits).toContain('tenureWarnings(program,')
  })

  it('an MSP asking “Who is available?” is told it has no bench and what it may ask instead, from its own chips', async () => {
    const a = await respond('Who is available?', readers(), {
      env: {}, companyKind: 'CLIENT', ownKind: 'MSP', party: 'MSP',
      permissions: ['consultants.read', 'assignments.read', 'timesheets.read', 'vendors.read', 'governance.read', 'privacy.manage'],
    })
    expect(a).toEqual({ kind: 'TEXT', says: 'An MSP places nobody, so it has no bench. Ask “Which timesheets are waiting?” instead.' })
    expect(questionsFor('MSP', ['consultants.read', 'timesheets.read', 'governance.read'], 'MSP')).toContain('Which timesheets are waiting?')
  })

  it('a seated MSP asking what another client spends is refused in a sentence, never answered as “you”', async () => {
    const a = await respond('What is Northbend Athletic spending on contractors?', readers(), {
      env: {}, companyKind: 'CLIENT', ownKind: 'MSP', party: 'MSP', permissions: ['invoices.read'],
      ownCompany: 'Aptiva Workforce', client: 'Cavanaugh Glassworks',
    })
    expect(a.kind).toBe('TEXT')
    expect((a as { says: string }).says).toMatch(/never another company’s book/)
  })

  it('the same question about the program it is seated in is its own book, and spend says the client’s name, not “you”', async () => {
    expect(anotherFirmsMoney('What is Cavanaugh Glassworks spending on contractors?', ['Aptiva Workforce', 'Cavanaugh Glassworks'], { people: [], firms: [] })).toBe(false)
    const a = await respond('What is Cavanaugh Glassworks spending on contractors?', readers({ spendIn: vi.fn(async () => ({ ok: true as const, receipts: [], undated: 0, whom: 'Cavanaugh Glassworks' })) }), {
      env: {}, now: NOW, companyKind: 'CLIENT', ownKind: 'MSP', party: 'MSP', permissions: ['invoices.read'],
      ownCompany: 'Aptiva Workforce', client: 'Cavanaugh Glassworks',
    })
    expect((a as { says: string }).says).toBe('No supplier billed Cavanaugh Glassworks in Oct 2026. Checked just now.')
  })
})

describe('nobody is told to ask themselves (walk three, item 5)', () => {
  it('a refusal never names the reader’s own role as the desk to ask', () => {
    expect(deskRefusal('accepts timesheets', 'timesheets.approve', 'MSP', { self: 'Owner' }))
      .toBe('Your seat here does not hold that; Users & permissions sets what each role may do.')
    expect(deskRefusal('accepts timesheets', 'timesheets.approve', 'MSP')).toBe('Your Owner accepts timesheets; ask them.')
  })

  it('a seated firm is told the client’s desk by the client’s name, never “your”', () => {
    expect(deskRefusal('reads what suppliers billed it', 'invoices.read', 'CLIENT', { book: 'Cavanaugh Glassworks', self: 'Owner' }))
      .not.toMatch(/^Your /)
  })

  it('a program asking which weeks to accept is answered as the weeks waiting for approval, which is what it signs', async () => {
    const a = await respond('Which weeks do I need to accept?', readers(), {
      env: {}, companyKind: 'CLIENT', ownKind: 'MSP', party: 'MSP', permissions: ['timesheets.read'], role: 'Owner', client: 'Cavanaugh Glassworks',
    })
    expect(a.kind).toBe('WEEKS')
    expect((a as { says: string }).says).toBe('No timesheet is waiting for approval at Cavanaugh Glassworks. Checked just now.')
  })
})

describe('a question for somebody about somebody else’s pay is refused in a sentence (walk three, item 6)', () => {
  it('a worker asking “What does Lucía earn?” is refused, never told “I cannot answer that yet”', async () => {
    expect(readWorkerAsk('What does Lucía earn?')).toBe('ANOTHER')
    expect(readWorkerAsk('How much is Omar paid?')).toBe('ANOTHER')
    expect(readWorkerAsk('What is my pay rate?')).toBe('MY_RATE')
    const a = await respondWorker('What does Lucía earn?', { facts: async () => { throw new Error('not read') } })
    expect(a.says).toBe('I answer only about your own work, never another person’s pay or a firm’s rates.')
  })
})

describe('a recommendation names the reader’s own work only (walk three, item 7)', () => {
  it('compliance and HR are not recommended to ask the AP clerk to approve a receipt; who else is asked stays a fact', async () => {
    const other: OtherWaiting = { title: 'IN-FMDSDT-20260901', noun: 'invoice receipt', desks: ['AP Clerk'], own: false, href: '/dashboard/invoices/inv-fm', people: ['Renata Kowal'] }
    const a = await today(readers({ othersWaiting: vi.fn(async () => [other]) }), { now: NOW, needs: async () => ({ total: 0, items: [] }) })
    if (a.kind !== 'NEEDS') throw new Error(a.kind)
    expect(a.recommend).toBeUndefined()
    expect((a.more ?? []).map((l) => l.says)).toContain('Renata Kowal, AP clerk, has one invoice receipt to approve: IN-FMDSDT-20260901. It is not yours to approve.')
  })
})

describe('a firm’s seat asking when it was last paid is answered or refused with who may (walk three, item 8)', () => {
  it('“When was I last paid?” is a rule question, never “needs the model”', () => {
    expect(readAsk('When was I last paid?')).toEqual({ kind: 'LAST_PAID' })
  })

  it('AP & Payroll at a supplier, with no pay of its own on Etyme, reads what payroll here pays and where it is', async () => {
    const a = await respond('When was I last paid?', readers(), {
      env: {}, companyKind: 'VENDOR', party: 'FIRM', permissions: ['payroll.run', 'timesheets.approve'], ownCompany: 'Brightmoor Staffing', role: 'AP & Payroll',
      ownPay: async () => null,
    })
    expect(a).toEqual({ kind: 'TEXT', says: 'No pay to you is on Etyme. Payroll here pays the people Brightmoor Staffing places; each run is on Payroll.', links: [{ label: 'Open Payroll', href: '/dashboard/payroll' }] })
  })

  it('a seat that does not run payroll is told the desk that does, and never its own', () => {
    expect(lastPaidNotHere({ company: 'Brightmoor Staffing', companyKind: 'VENDOR', permissions: [], self: 'Recruiter' }).says)
      .toBe('No pay to you is on Etyme. Your AP & Payroll or Finance runs payroll at Brightmoor Staffing; ask them about your own pay.')
  })

  it('a seat paid through payroll on Etyme reads its own last pay day', async () => {
    const own = { kind: 'TEXT' as const, says: 'You were last paid on Oct 9.' }
    const a = await respond('When was I last paid?', readers(), { env: {}, companyKind: 'GSI', party: 'FIRM', permissions: [], ownPay: async () => own })
    expect(a).toBe(own)
  })
})

describe('the mismatch notice names the receipt and the supplier (walk three, item 9)', () => {
  it('“An invoice receipt does not match what was accepted” is said with the receipt’s number and who sent it', () => {
    expect(MISMATCH_TITLE).toBe('An invoice receipt does not match what was accepted')
    expect(mismatchSays('PR-2026-0442', 'Pinnacle Resourcing')).toBe('PR-2026-0442 from Pinnacle Resourcing does not match what was accepted')
    expect(src('src/app/api/conversations/twin/notices.ts')).toContain('title: named.get(n.id) ?? n.title')
  })
})

const week = (over: Partial<SentWeek>): SentWeek => ({
  id: 'ts', periodStart: '2026-09-27', periodEnd: '2026-10-03', hours: 40, stage: 'OWED', waitingOn: null, client: 'Northbend Athletic',
  employer: 'Techpeple', approvedBy: null, stillOwedMinor: 144000, owedHours: 16, currency: 'USD', dueOn: '2026-11-09', overdue: false, paidOn: null, ...over,
})

describe('a worker’s jobs and split weeks (walk three, item 10)', () => {
  it('a job the worker got is never “still open”', () => {
    const read = src('src/app/api/conversations/twin/worker-read.ts')
    expect(read).toContain("live: !['REJECTED', 'WITHDRAWN', 'CLOSED', 'PLACED', 'AWARDED', 'HIRED'].includes(String(x.status).toUpperCase())")
  })

  it('a week split over two pay days says the hours already paid and when, beside what is owed for the rest', () => {
    const w = week({ partPaid: { hours: 24, on: '2026-10-09' } })
    expect(weekStandsSays(w)).toBe('Your week of Sep 27–Oct 3 is accepted by Techpeple. 24 hours were paid on Oct 9; $1,440.00 for the other 16 hours is owed to you, due Nov 9.')
    expect(stageWord(w)).toBe('Owed to you, due Nov 9; 24 hours paid Oct 9')
  })
})

const COLLEEN: WorkerFacts = {
  seat: 'EMPLOYEE', seatAt: 'Byrne Critical Care LLC', ownFirm: 'Byrne Critical Care LLC',
  placements: [{ site: 'Harlow Health', through: ['Halcyon Talent'], employer: 'Byrne Critical Care LLC', tie: 'PAID', live: true, endDate: '2026-12-03', payRateMinor: null, payCurrency: null, rateNote: null }],
  toFile: [], returned: [],
  sent: [week({ id: 'ts-oct4', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 36, stage: 'WAITING_FOR_EMPLOYER', waitingOn: 'Halcyon Talent', client: 'Harlow Health', employer: 'Byrne Critical Care LLC', stillOwedMinor: null, owedHours: null, currency: null, dueOn: null })],
  ownCompanyBills: null, weeksWithNoRate: 0, papers: [], runningOut: [], interviews: [], stays: [],
  consent: { benches: [], asking: [], employers: [] }, unread: [],
}

describe('a one-person firm is spoken to as herself (walk three, item 11)', () => {
  it('her own week in “Since you last looked” is “your week”, never her name in the third person, and she is never asked to approve it', () => {
    const notices: NoticeLine[] = [
      { id: 'n1', title: 'Hours to approve — in 2 days', href: '/dashboard/timesheets', cycleKind: 'TIMESHEET_APPROVE', dueOn: '2026-10-28', body: 'Colleen Byrne at Harlow Health — Oct 28' },
      { id: 'n2', title: 'Hours due — today', href: '/dashboard/timesheets', cycleKind: 'TIMESHEET_SUBMIT', dueOn: '2026-10-26', body: 'Colleen Byrne at Harlow Health — Oct 26' },
      { id: 'n3', title: 'Bill to raise — Nov 2', href: '/dashboard/invoices', cycleKind: 'INVOICE_GENERATE', dueOn: '2026-11-02', body: 'Colleen Byrne at Harlow Health — Nov 2' },
    ]
    const said = sinceSays(notices, 0, { now: NOW, self: 'Colleen Byrne' }).map((l) => l.says)
    expect(said).toEqual([
      'Since you last looked:',
      'Your week of Oct 18–24 is due today. You file it on Your work.',
      'Bill to raise on Nov 2, for your own work.',
    ])
    expect(said.join(' ')).not.toMatch(/Colleen Byrne|to approve/)
  })

  it('a paper of her own inside the headline reads “your professional license”, never a capital mid-sentence', () => {
    const q = withOwnPapers({ total: 0, items: [] }, [{ key: 'p1', name: 'your professional license', title: 'Professional license', says: 'Open it from your paperwork.', href: '/dashboard/my-work/paperwork' }])!
    expect(namedNeedsSays(q, [])!.says).toBe('One thing needs you: your professional license is asked of you. Open the list.')
  })

  it('her queue holds no week of her own to accept, and its count drops with it', () => {
    const q = withoutOwnWeek({ total: 2, items: [
      { type: 'TIMESHEET_APPROVAL', title: 'Accept timesheet — Colleen Byrne', whose: 'Colleen Byrne', entityId: 'ts-1' },
      { type: 'INVOICE_OVERDUE', title: 'Overdue — IN-1', entityId: 'inv-1' },
    ] }, 'Colleen Byrne')!
    expect(q.total).toBe(1)
    expect(q.items.map((d) => d.type)).toEqual(['INVOICE_OVERDUE'])
  })

  it('her week never says her own firm still has to accept it', () => {
    expect(weekStandsSays(COLLEEN.sent[0], COLLEEN.ownFirm)).toBe('Your week of Oct 4–10 is signed by Harlow Health. It waits for Halcyon Talent to accept it.')
    expect(weekStandsSays({ ...COLLEEN.sent[0], waitingOn: 'Byrne Critical Care LLC' }, COLLEEN.ownFirm))
      .toBe('Your week of Oct 4–10 is signed by Harlow Health and accepted by every firm above you.')
  })

  it('asked when she was last paid, she reads her customer’s last payment to her firm, never “your employer’s payroll”', async () => {
    const paid = await respondWorker('When was I last paid?', {
      facts: async () => COLLEEN,
      firmPaid: async () => ({ on: '2026-10-09', amountMinor: 993600, currency: 'USD', from: 'Halcyon Talent', bill: 'IN-DVYLFL-20260901' }),
    })
    expect(paid.says).toBe('Halcyon Talent last paid Byrne Critical Care LLC $9,936.00 on Oct 9, on bill IN-DVYLFL-20260901. Checked just now.')
    const none = await respondWorker('When was I last paid?', { facts: async () => COLLEEN, firmPaid: async () => null })
    expect(none.says).toBe('No payment to Byrne Critical Care LLC is on Etyme yet. Ask “What have I billed and not been paid?” to see what is due.')
    expect(none.says).not.toMatch(/employer/)
  })
})

describe('a bill the reader may send is offered with Send, from money’s one rule (walk three, item 12)', () => {
  it('a drafted bill the owner may send is a card whose button is the Bills page’s own Send, never “not yours to send”', async () => {
    const bill: OtherWaiting = { title: 'IN_9PQV02_001', noun: 'bill', desks: ['Accounts Receivable', 'Finance'], own: true, href: '/dashboard/invoices/inv-9', send: { invoiceId: 'inv-9', because: null } }
    const a = await today(readers({ othersWaiting: vi.fn(async () => [bill]) }), { now: NOW, needs: async () => ({ total: 0, items: [] }), party: 'FIRM' })
    if (a.kind !== 'NEEDS') throw new Error(a.kind)
    expect(a.recommend?.says).toBe('Send bill IN_9PQV02_001; it is built from signed weeks.')
    expect(a.says).toBe('Bill IN_9PQV02_001 is drafted; send it below, or say not now. Checked just now.')
    expect(a.queue).toEqual(sendCards([bill]))
    expect(a.queue![0].act).toEqual({ label: 'Send bill', url: '/api/invoices/inv-9/submit', body: {}, done: 'Sent, and recorded under your name.' })
    expect(JSON.stringify(a)).not.toMatch(/not yours to send/)
  })

  it('where money’s rule refuses the reader, its sentence is said word for word', () => {
    const says = 'Imelda Santoro or Rosalind Tay sends this bill. Ask Etyme drafted it on your authority, so you send it only where nobody else at the firm sends bills.'
    const lines = othersSay([{ title: 'IN_9PQV02_001', noun: 'bill', desks: ['Accounts Receivable'], own: true, href: '/dashboard/invoices/inv-9', sendRefused: says }])
    expect(lines).toEqual([{ says: `IN_9PQV02_001: ${says}`, links: [{ text: 'IN_9PQV02_001', href: '/dashboard/invoices/inv-9' }] }])
  })

  it('who may send is read from maySendBills in lib/money/bill-send, the rule the Today page and the send route read', () => {
    const read = src('src/app/api/conversations/twin/read.ts')
    expect(read).toContain("import { maySendBills } from '@/lib/money/bill-send'")
    expect(read).toContain('send: { invoiceId: q.entityId, because: verdict.ownerException }')
    expect(read).toContain('sendRefused: verdict.says')
  })
})
