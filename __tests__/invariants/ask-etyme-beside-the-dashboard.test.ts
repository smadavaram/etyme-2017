/**
 * Ask Etyme runs beside the dashboard, never apart from it (the founder's
 * walk of fifteen seats, 2026-10-22: "does Ask Etyme run parallel to the
 * dashboard?" — the verdict was no). Each sentence here is one place the
 * chat and a page disagreed, and now read the same rule.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { respond, unbilledSays, unbilledTable, toldSays, type Readers, type UnbilledRow } from '@/app/api/conversations/twin/ask'
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

describe('every decision in the count is a card, and none offers to pay what fails the check', () => {
  it('a card no single route can say yes to — a held start, a missing agreement, a roll-off — still has Not now beside Open', () => {
    const tsx = src('src/app/dashboard/conversations/ask-etyme.tsx')
    const view = tsx.slice(tsx.indexOf('function QueueCardView('), tsx.indexOf('function QueueCardView(') + 4000)
    const open = view.slice(view.indexOf('className="btn-primary text-[13px]">Open</Link>'))
    expect(open.slice(0, 400)).toContain('onClick={() => onLater(card)}>Not now</button>')
  })

  it('an invoice receipt that bills more hours than were approved is never put up to pay; the paying desk reads who corrects it, and the exception it may record with a reason', () => {
    const line = toldSays([{ invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', hoursBilled: 41.5, hoursAccepted: 40 }])
    expect(line?.says).toBe('PR-2026-0442 bills 41.5 hours against 40 approved. Ask Pinnacle Resourcing to correct it, or record an exception with a reason on its page.')
  })

  it('a receipt off the contract rate is not offered an exception, because a rate is changed on the contract and never waived on a receipt', () => {
    const line = toldSays([{ invoiceId: 'inv-9', number: 'PR-9', supplier: 'Pinnacle Resourcing', hoursBilled: null, hoursAccepted: null }])
    expect(line?.says).toBe('PR-9 does not match the approved hours or the contract rate; it cannot be paid until Pinnacle Resourcing corrects it.')
  })
})

// ── A worker and a one-person firm ────────────────────────────────────

import { respondWorker, workerToday, cardsFor, readWorkerAsk, type WorkerFacts } from '@/app/api/conversations/twin/worker'
import { withOwnPapers, queueCards, namedNeedsSays } from '@/app/api/conversations/twin/ask'

function colleen(over: Partial<WorkerFacts> = {}): WorkerFacts {
  return {
    seat: 'CONSULTANT', seatAt: 'Byrne Critical Care LLC',
    placements: [{ site: 'Harlow Health', through: ['Halcyon Talent'], employer: 'Byrne Critical Care LLC', tie: 'PAID', live: true, endDate: '2026-12-10', payRateMinor: null, payCurrency: null, rateNote: null }],
    toFile: [{ periodStart: '2026-10-18', periodEnd: '2026-10-24', site: 'Harlow Health', ended: true, wholeWeek: true, expectedHours: 36, dueOn: '2026-10-26' }],
    returned: [], sent: [], ownCompanyBills: null, weeksWithNoRate: 0,
    papers: [{
      id: 'p-lic', name: 'Professional license (RN 154-882, WI)', todo: 'open', askedBy: 'Halcyon Talent', dueOn: '2026-12-06',
      stopsWork: false, href: '/packet/abc', renews: { name: 'Professional license', runsOutOn: '2026-11-15' },
    }],
    runningOut: [], interviews: [], stays: [],
    consent: { benches: [], asking: [], employers: [] },
    unread: [],
    ...over,
  }
}

describe('a worker’s first screen names what needs her, and every answer is her own record’s', () => {
  it('the headline names the things that need her, never only their count', () => {
    expect(workerToday(colleen()).says).toBe('Two things need you: your week of Oct 18–24 and your professional license. Checked just now.')
  })

  it('“File my week” opens Your work at that week', async () => {
    const a = await respondWorker('File my week', { facts: async () => colleen() })
    expect(a.cards[0].href).toBe('/dashboard/my-work?week=2026-10-18')
  })

  it('a license renewal is said by the day the license she holds runs out, not the request’s later due date', () => {
    const card = cardsFor(colleen()).find((c) => c.act === 'PAPER')!
    expect(card.says).toBe('Open it from your paperwork. Your professional license runs out on Nov 15; send the new one before then.')
    expect(card.says).not.toContain('Dec 6')
  })

  it('a paper with nothing it renews keeps its own due date', () => {
    const card = cardsFor(colleen({ papers: [{ ...colleen().papers[0], renews: null }] })).find((c) => c.act === 'PAPER')!
    expect(card.says).toBe('Open it from your paperwork. It is due Dec 6.')
  })

  it('“Extend my contract” is refused in one sentence that says who extends it', async () => {
    expect(readWorkerAsk('Extend my contract')).toBe('EXTEND')
    const a = await respondWorker('Extend my contract', { facts: async () => colleen() })
    expect(a.says).toBe('Etyme never extends a contract; Byrne Critical Care LLC extends yours with Harlow Health. Ask Byrne Critical Care LLC.')
  })

  it('“When was I last paid?” is answered from her own paid weeks', async () => {
    const paid = colleen({
      sent: [
        { id: 'w1', periodStart: '2026-09-27', periodEnd: '2026-10-03', hours: 36, stage: 'PAID', waitingOn: null, client: 'Harlow Health', employer: 'Byrne Critical Care LLC', approvedBy: null, stillOwedMinor: 0, owedHours: 0, currency: 'USD', dueOn: null, overdue: false, paidOn: '2026-10-10' },
        { id: 'w2', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 36, stage: 'PAID', waitingOn: null, client: 'Harlow Health', employer: 'Byrne Critical Care LLC', approvedBy: null, stillOwedMinor: 0, owedHours: 0, currency: 'USD', dueOn: null, overdue: false, paidOn: '2026-10-17' },
      ] as WorkerFacts['sent'],
    })
    const a = await respondWorker('When was I last paid?', { facts: async () => paid })
    expect(a.says).toBe('You were last paid on Oct 17, for your week of Oct 4–10, by Byrne Critical Care LLC. Checked just now.')
  })

  it('“Is there a job for me?” says which firm put her forward and for what, and never offers a job Etyme found', async () => {
    const f = colleen({ putForward: [{ role: 'ICU nurse, nights', by: 'Halcyon Talent', says: 'With Harlow Health for review.', live: true }] })
    const a = await respondWorker('Is there a job for me?', { facts: async () => f })
    expect(a.says).toBe('Halcyon Talent put you forward for ICU nurse, nights. It is still open. Checked just now.')
    expect(a.more.map((m) => m.says)).toContain('Etyme never places anybody; the firms that hold your consent put you forward.')
  })
})

describe('a one-person firm’s own paper is in her one queue', () => {
  const card = () => cardsFor(colleen()).filter((c) => c.act === 'PAPER')

  it('a paper asked of her as the worker is counted and named in her greeting, and is a card that opens her paperwork with Not now', () => {
    const q = withOwnPapers({ total: 1, items: [{ type: 'INVOICE_OVERDUE', title: 'Overdue — IN-7YYZVO', entityId: 'inv-1' }] }, card())!
    expect(q.total).toBe(2)
    expect(namedNeedsSays(q, [])!.says).toBe('Two things need you: Bill IN-7YYZVO is overdue; Your professional license is asked of you. Open the list.')
    const own = queueCards(q).find((c) => c.type === 'OWN_PAPER')!
    expect(own.href).toBe('/packet/abc')
    expect(own.act).toBeNull()
  })

  it('a queue that could not be read stays unread, rather than counting only her papers', () => {
    expect(withOwnPapers(null, card())).toBeNull()
  })
})

// ── The trade's plain questions, by rules, and chips that never refuse ──

import { readAsk, questionsFor, payableSays, acceptSays, i9Rows, i9Says, runsOutThisMonth, expiringSays, appliedSays } from '@/app/api/conversations/twin/ask'

describe('plain trade questions are read by rules, never sent to the model', () => {
  it('each question is read as the record question it is', () => {
    expect(readAsk('Who applied for the HCM integration lead job?')).toEqual({ kind: 'APPLIED', job: 'HCM integration lead' })
    expect(readAsk('Who applied for my jobs?')).toEqual({ kind: 'APPLIED', job: null })
    expect(readAsk('Which invoice receipts can I pay?')).toEqual({ kind: 'PAYABLE' })
    expect(readAsk('Which weeks do I need to accept?')).toEqual({ kind: 'ACCEPT' })
    expect(readAsk('Who is missing an I-9?')).toEqual({ kind: 'I9' })
    expect(readAsk('Whose papers run out this month?')).toEqual({ kind: 'EXPIRING' })
    expect(readAsk('Who is available?')).toEqual({ kind: 'BENCH' })
  })

  it('the questions that were answered before keep their meaning', () => {
    expect(readAsk('Which timesheets are waiting?').kind).toBe('WEEKS')
    expect(readAsk('Which weeks are signed and not billed?').kind).toBe('UNBILLED')
    expect(readAsk('Which bills are unpaid?').kind).toBe('UNPAID')
    expect(readAsk('Who is on the bench?').kind).toBe('BENCH')
  })

  it('who applied is said with the job and the names', () => {
    const rows = [
      { person: 'Ana Ruiz', job: 'HCM integration lead', from: 'Brightmoor Staffing', status: 'SUBMITTED', sentOn: '2026-10-20', href: '/x' },
      { person: 'Ben Ode', job: 'HCM integration lead', from: 'Veritan Talent', status: 'SHORTLISTED', sentOn: '2026-10-21', href: '/x' },
    ]
    expect(appliedSays('HCM integration lead', rows, 2)).toBe('Two candidates applied for the HCM integration lead job: Ana Ruiz and Ben Ode. Checked just now.')
    expect(appliedSays('HCM integration lead', [], 0)).toBe('Nobody has applied for the HCM integration lead job yet. Checked just now.')
  })

  it('what may be paid is the queue’s own Pay rows, and a seat that does not pay is told who does', async () => {
    const q = { total: 1, items: [{ type: 'INVOICE_RECEIPT_TO_PAY', title: 'Pay — Veritan Talent', subtitle: 'Invoice VT-12 · $4,800.00', entityId: 'inv-1', dueDate: '2026-10-30' }] }
    expect(payableSays(q.items)).toBe('Pay Veritan Talent’s invoice receipt first; it passes the check. One invoice receipt is ready to pay. Checked just now.')
    const hm = await respond('Which invoice receipts can I pay?', readers(), { env: NO_KEY, now: NOW, companyKind: 'CLIENT', permissions: ['requirements.write'], needs: async () => q })
    expect(hm.kind).toBe('TEXT')
    expect(hm.says).toMatch(/pays invoice receipts; ask them\.$/)
  })

  it('which weeks to accept is the queue’s own Accept rows', () => {
    const rows = [{ type: 'TIMESHEET_APPROVAL', title: 'Accept timesheet — Helena Marsh', whose: 'Helena Marsh', entityId: 'ts-1' }]
    expect(acceptSays(rows)).toBe('Accept Helena Marsh’s timesheet first. One timesheet waits for you to accept it. Checked just now.')
  })

  it('who is missing an I-9 is who cannot start without one, said with the day', () => {
    const rows = i9Rows([
      { personId: 'p1', name: 'Ingrid Sørensen', startsOn: '2026-10-28', missing: ['I-9 and E-Verify'], href: '/x' },
      { personId: 'p2', name: 'Felix Brenner', startsOn: '2026-11-02', missing: ['Background check'], href: '/y' },
    ])
    expect(rows.map((r) => r.name)).toEqual(['Ingrid Sørensen'])
    expect(i9Says(rows)).toBe('Ingrid Sørensen cannot start on Oct 28 without an I-9. One start is held for one. Checked just now.')
  })

  it('whose papers run out this month counts from today to the month’s end only', () => {
    const rows = runsOutThisMonth([
      { whose: 'Veritan Talent', paper: 'Certificate of insurance', runsOutOn: '2026-10-05', href: '/a' },
      { whose: 'Helena Marsh', paper: 'Professional license', runsOutOn: '2026-10-25', href: '/b' },
      { whose: 'Linnea Qadri', paper: 'Visa', runsOutOn: '2026-11-03', href: '/c' },
    ], NOW)
    expect(rows.map((r) => r.whose)).toEqual(['Helena Marsh'])
    expect(expiringSays(rows)).toBe('Renew Helena Marsh’s Professional license first; it runs out on Oct 25. One paper runs out this month. Checked just now.')
  })
})

describe('the chips are the desk’s own, so no chip refuses the seat it is shown to', () => {
  it('a hiring manager is offered neither the time limit nor spend', () => {
    const hm = questionsFor('CLIENT', ['requirements.write', 'requirements.read', 'timesheets.approve'], 'CLIENT')
    expect(hm).not.toContain('Who is near the time limit?')
    expect(hm).not.toContain('What did we spend by supplier this month?')
    expect(hm).toEqual(['What needs me today?', 'Who applied for my jobs?', 'Which timesheets are waiting?'])
  })

  it('an AP clerk is offered what she can pay', () => {
    expect(questionsFor('CLIENT', ['payments.record', 'invoices.read'], 'CLIENT')).toContain('Which invoice receipts can I pay?')
  })

  it('an integrator’s delivery manager is offered who is on the bench, and a firm’s account manager is not offered payroll’s questions', () => {
    expect(questionsFor('FIRM', ['assignments.write'], 'GSI')).toContain('Who is on the bench?')
    expect(questionsFor('FIRM', ['requirements.read', 'submissions.create'], 'VENDOR')).not.toContain('Which weeks do I need to accept?')
  })

  it('without the seat’s permissions, the party’s own four are drawn as before', () => {
    expect(questionsFor('FIRM')).toEqual(['Who rolls off in the next 30 days?', 'Who is on the bench?', 'Which weeks are signed and not billed?', 'Which bills are unpaid?'])
  })
})

describe('a job’s name is never cut', () => {
  it('a job request whose own name has a dash is named whole on its card', () => {
    const cards = queueCards({ total: 1, items: [{ type: 'REQUISITION_APPROVAL', title: 'Approve job request — Planning transformation — four supply-planning consultants', entityId: 'r1' }] })
    expect(cards[0].title).toBe('The Planning transformation — four supply-planning consultants job request waits for your approval.')
  })
})

// ── Pay an invoice receipt (2026-10-26) ───────────────────────────────

import { payQuestion, paidSays, decisionRequest, itemsAskSays, NEEDS_BANK_REFERENCE as CHAT_NEEDS_REF, RECEIPT_PAY, type WaitingItem } from '@/app/api/conversations/twin/ask'
import { NEEDS_BANK_REFERENCE } from '@/lib/twin/performers'
import { invoiceTitle, approvalActions, readCardAction, PAY_REFERENCE_NEEDED } from '@/lib/teams/cards'
import { answerCardAction } from '@/lib/teams/actions'

const PAY_ITEM: WaitingItem = {
  n: 1, approvalId: 'appr-pay-1', entryId: 'e1', says: 'Pay an invoice receipt that passed the three-way check.',
  title: 'PR-2026-0451 from Pinnacle Resourcing', ruleCited: 'Three-way check', rationale: 'Hours and rate match.',
  href: '/dashboard/invoices/inv-451', action: RECEIPT_PAY, pay: { supplier: 'Pinnacle Resourcing', number: 'PR-2026-0451' },
}

describe('Ask Etyme pays an invoice receipt on a yes with the bank reference', () => {
  it('the card asks “Pay Pinnacle Resourcing’s invoice PR-2026-0451?”', () => {
    expect(payQuestion(PAY_ITEM.pay!)).toBe('Pay Pinnacle Resourcing’s invoice PR-2026-0451?')
  })

  it('a yes posts to the one approval route with the bank reference and the method as the answer', () => {
    const { url, init } = decisionRequest('appr-pay-1', 'APPROVED', null, { reference: ' ACH-0451 ', method: 'ACH' })
    expect(url).toBe('/api/twin/approvals/appr-pay-1')
    expect(JSON.parse(init.body)).toEqual({ decision: 'APPROVED', surface: 'WEB', answer: { reference: 'ACH-0451', method: 'ACH' } })
  })

  it('Not now sends no answer, and a question with nothing typed sends none either', () => {
    expect(JSON.parse(decisionRequest('a', 'REJECTED', 'Not now', { reference: 'X' }).init.body).answer).toBeUndefined()
    expect(JSON.parse(decisionRequest('a', 'APPROVED', null).init.body).answer).toBeUndefined()
  })

  it('the sentence beside a blank box is the route’s own refusal, word for word, in the chat and in Teams', () => {
    expect(CHAT_NEEDS_REF).toBe(NEEDS_BANK_REFERENCE)
    expect(PAY_REFERENCE_NEEDED).toBe(NEEDS_BANK_REFERENCE)
    expect(NEEDS_BANK_REFERENCE).toBe('Enter the bank reference so the AP clerk can reconcile it.')
  })

  it('the screen draws a Bank reference box, an optional method, Yes and Not now on the pay card, and refuses a blank box before sending', () => {
    const tsx = src('src/app/dashboard/conversations/ask-etyme.tsx')
    const card = tsx.slice(tsx.indexOf('function PayCard('), tsx.indexOf('function PayCard(') + 4000)
    expect(card).toContain('>Bank reference</label>')
    expect(card).toContain('Method (optional)')
    expect(card).toContain("'Yes, pay it'")
    expect(card).toContain('>Not now</button>')
    expect(card).toContain('{NEEDS_BANK_REFERENCE}')
    expect(card).toContain("onDecide(item, 'APPROVED', null, { reference: reference.trim(), method: method || null })")
  })

  it('after the yes the chat says it was paid, with the reference', () => {
    expect(paidSays(PAY_ITEM.pay!, 'ACH-0451')).toBe('Paid Pinnacle Resourcing’s invoice PR-2026-0451, bank reference ACH-0451. Recorded under your name.')
  })

  it('the recommendation for a receipt to pay says pay, not approve', () => {
    expect(itemsAskSays([PAY_ITEM])?.says).toBe('Pay PR-2026-0451 from Pinnacle Resourcing; it passes the three-way check.')
  })

  it('a receipt holding both a pay and an approve question is one card: the approve question is not drawn beside it', () => {
    const read = src('src/app/api/conversations/twin/read.ts')
    expect(read).toContain('if (r.twinAction.action === RECEIPT_APPROVE && toPay.has(r.twinAction.entityId)) return false')
    const digest = src('src/lib/teams/digest.ts')
    expect(digest).toContain("asked.filter((a) => !(a.twinAction.action === INVOICE_APPROVE && toPay.has(a.twinAction.entityId)))")
  })
})

describe('in Teams, the same question is a card with a box for the bank reference', () => {
  const f = {
    approvalId: 'appr-pay-1', number: 'PR-2026-0451', supplierName: 'Pinnacle Resourcing', contractors: ['Helena Marsh'],
    periodStart: null, periodEnd: null, amountMinor: 480000, currency: 'USD', dueAt: null, variances: [],
    ruleCited: 'Three-way check', rationale: 'Hours and rate match.', pay: true,
  }

  it('the card asks the same question as the chat', () => {
    expect(invoiceTitle(f)).toBe('Pay Pinnacle Resourcing’s invoice PR-2026-0451?')
  })

  it('Pay opens a required bank reference box and an optional method, and its yes is marked as a payment', () => {
    const actions = approvalActions(f) as any[]
    expect(actions.map((a) => a.title)).toEqual(['Pay', 'Not now', 'Why?'])
    const body = actions[0].card.body
    expect(body[0]).toMatchObject({ type: 'Input.Text', id: 'reference', isRequired: true, errorMessage: NEEDS_BANK_REFERENCE })
    expect(body[1]).toMatchObject({ type: 'Input.Text', id: 'method' })
    expect(actions[0].card.actions[0].data).toEqual({ etyme: 'twin.approval', approvalId: 'appr-pay-1', decision: 'APPROVED', as: 'pay' })
  })

  it('an approve question on a typed-in receipt keeps Approve and Reject', () => {
    expect((approvalActions({ ...f, pay: false }) as any[]).map((a) => a.title)).toEqual(['Approve', 'Reject', 'Why?'])
  })

  it('the typed reference and method come back from the card as the same answer the chat sends', () => {
    expect(readCardAction({ etyme: 'twin.approval', approvalId: 'appr-pay-1', decision: 'APPROVED', as: 'pay', reference: ' ACH-0451 ', method: '' })).toEqual({
      etyme: 'twin.approval', approvalId: 'appr-pay-1', decision: 'APPROVED', as: 'pay', answer: { reference: 'ACH-0451', method: null },
    })
  })

  it('Yes in Teams goes to the one approval door with the answer, and the reply says it was paid with the reference', async () => {
    const seen: any[] = []
    const out = await answerCardAction(
      { etyme: 'twin.approval', approvalId: 'appr-pay-1', decision: 'APPROVED', as: 'pay', answer: { reference: 'ACH-0451', method: 'ACH' } },
      { personId: 'p', personName: 'Renata Kowal', companyId: 'c', companyKind: 'CLIENT', companyName: 'Northbend Athletic', permissions: ['payments.record'] } as any,
      { decide: async (args) => { seen.push(args); return { ok: true, outcome: 'PERFORMED', entryId: 'e' } }, why: async () => null },
    )
    expect(seen[0]).toMatchObject({ approvalId: 'appr-pay-1', decision: 'APPROVED', surface: 'TEAMS', answer: { reference: 'ACH-0451', method: 'ACH' } })
    expect(out.says).toBe('Paid, bank reference ACH-0451. It is recorded under your name, from Teams.')
  })

  it('a blank reference in Teams is refused by the door in its own sentence, and nothing is paid', async () => {
    const out = await answerCardAction(
      { etyme: 'twin.approval', approvalId: 'appr-pay-1', decision: 'APPROVED', as: 'pay', answer: { reference: null, method: null } },
      { personId: 'p', personName: 'Renata Kowal', companyId: 'c', companyKind: 'CLIENT', companyName: 'Northbend Athletic', permissions: ['payments.record'] } as any,
      { decide: async () => ({ ok: false, status: 422, says: NEEDS_BANK_REFERENCE }), why: async () => null },
    )
    expect(out.says).toBe(NEEDS_BANK_REFERENCE)
  })
})
