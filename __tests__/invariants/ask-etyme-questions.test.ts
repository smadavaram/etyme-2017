/**
 * Ask Etyme's fifty questions — the score the founder reads every day
 * (CLAUDE.md, "The model boundary, and the four weeks", week 1).
 *
 * Fifty questions a program manager, an AP clerk, a hiring manager and a
 * supplier's account manager actually ask, each in the person's own
 * words, run against one in-memory record of the Northbend Athletic
 * program. Each asserts the exact reply the rules give: an answer, an
 * honest refusal that names the door, or "I cannot answer that yet." where
 * the rules have nothing. The not-yet ones are the to-do list: when one
 * becomes answerable, its sentence changes here in the same commit.
 *
 * Every reply is also held to the voice (docs/ask-etyme-voice.md): no
 * apology or hedge, no exclamation mark, every sentence under twenty
 * words. The company's model switch is off throughout, as it is by
 * default, so a question the rules cannot answer says so.
 *
 * Since 2026-10-19 four more hold the transaction (founder, 2026-10-18,
 * "ensure no conversation goes beyond environment and transaction"): a
 * general question and another company's book are refused by rule in one
 * sentence, before the switch is even read, because no model would be
 * allowed to answer them.
 *
 * The one new test file the founder approved with the plan.
 */

import { describe, it, expect, afterAll } from 'vitest'
import {
  respond, deskRefusal, matchPerson, voiceBreaks, NOT_YET, LIMIT_IS_THE_CLIENTS,
  type Answer, type Readers, type WaitingItem, type VarianceReceipt, type SpendReceipt, type OtherWaiting,
  type LimitEntry, type WeekRow, type ToldReceipt, type RosterEntry,
} from '@/app/api/conversations/twin/ask'
import { OWNER_DESKS } from '@/lib/twin/readers'
import { ONLY_THE_RECORD, NOT_ANOTHER_BOOK } from '@/app/api/conversations/twin/transaction'
import { respondWorker, type WorkerFacts, type WorkerAnswer } from '@/app/api/conversations/twin/worker'

const NOW = new Date('2026-10-12T15:00:00Z')
const NO_KEY = {}

// ── The record: Northbend Athletic, read on Oct 12, 2026 ───────────────

const ROSTER: RosterEntry[] = [
  { personId: 'p-helena', name: 'Helena Marsh', contractId: 'sc-helena' },
  { personId: 'p-omar', name: 'Omar Haddad', contractId: 'sc-omar' },
  { personId: 'p-tobias', name: 'Tobias Lindqvist', contractId: 'sc-tobias' },
  { personId: 'p-lucia', name: 'Lucía Fernández', contractId: 'sc-lucia' },
]

/** The one clean receipt the twin asks the AP clerk to approve. */
const APPROVE_441: WaitingItem = {
  n: 1, approvalId: 'appr-441', entryId: 'entry-441', action: 'invoice_receipt.approve',
  says: 'Approve a supplier’s invoice receipt that cleared the three-way check, so it can be paid.',
  title: 'PR-2026-0441 from Pinnacle Resourcing',
  ruleCited: 'Hours 40 against 40 accepted, at the contract’s $98.00/hr.',
  rationale: 'Nothing to decide: it matches the signed hours and the contract rate, and it can be paid.',
  href: '/dashboard/invoices/inv-441',
}

/** What the program manager reads as waiting on somebody else: asked on her own authority. */
const FOR_AP: OtherWaiting[] = [
  { title: 'PR-2026-0441', noun: 'invoice receipt', desks: ['AP Clerk'], own: true, href: '/dashboard/invoices/inv-441', people: ['Renata Kowal'] },
  { title: 'IN-XSWQQZ-20260901', noun: 'invoice receipt', desks: ['AP Clerk'], own: true, href: '/dashboard/invoices/inv-cs', people: ['Renata Kowal'] },
]

/** Checked now; PR-2026-0441 was not clean last night and is clean now. */
const RECEIPTS: VarianceReceipt[] = [
  { invoiceId: 'inv-cs', number: 'IN-XSWQQZ-20260901', supplierName: 'Computer Systems Inc', verdict: 'CLEAN', nightly: 'CLEAN', lines: [{ hoursBilled: 40, hoursAccepted: 40, isHours: true }] },
  { invoiceId: 'inv-441', number: 'PR-2026-0441', supplierName: 'Pinnacle Resourcing', verdict: 'CLEAN', nightly: 'MISMATCH', lines: [{ hoursBilled: 40, hoursAccepted: 40, isHours: true }] },
  { invoiceId: 'inv-442', number: 'PR-2026-0442', supplierName: 'Pinnacle Resourcing', verdict: 'MISMATCH', nightly: 'MISMATCH', lines: [{ hoursBilled: 41.5, hoursAccepted: 40, isHours: true }] },
]

const SPEND: SpendReceipt[] = [
  { invoiceId: 'inv-bm', number: 'IN-VF2LKH-20260901', supplier: 'Brightmoor Staffing', currency: 'USD', totalMinor: 2112000, paidMinor: 2112000 },
  { invoiceId: 'inv-cs', number: 'IN-XSWQQZ-20260901', supplier: 'Computer Systems Inc', currency: 'USD', totalMinor: 1740000, paidMinor: 0 },
  { invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', currency: 'USD', totalMinor: 406700, paidMinor: 0 },
]

const TOBIAS: LimitEntry = { personId: 'p-tobias', personName: 'Tobias Lindqvist', limitOn: '2026-12-11T00:00:00.000Z', capMonths: 18, suppliers: ['Pinnacle Resourcing'], recordedAt: NOW.toISOString() }

const WEEKS: WeekRow[] = [
  { timesheetId: 'ts-helena', personId: 'p-helena', person: 'Helena Marsh', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 40, waitingDays: 2, href: '/dashboard/weeks/ts-helena' },
  { timesheetId: 'ts-omar', personId: 'p-omar', person: 'Omar Haddad', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 45, waitingDays: 2, href: '/dashboard/weeks/ts-omar' },
  { timesheetId: 'ts-lucia', personId: 'p-lucia', person: 'Lucía Fernández', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 44, waitingDays: 1, href: '/dashboard/weeks/ts-lucia' },
]

const TOLD_442: ToldReceipt = { invoiceId: 'inv-442', number: 'PR-2026-0442', supplier: 'Pinnacle Resourcing', hoursBilled: 41.5, hoursAccepted: 40 }

const ENTRY_442 = {
  id: 'entry-442', says: 'Tell the person who pays that an invoice receipt and the accepted hours or the contract rate do not agree.',
  ruleCited: 'Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.',
  rationale: 'Ask Pinnacle Resourcing to bill the hours accepted, or have the AP clerk record why the difference stands.',
  entityType: 'Invoice', entityId: 'inv-442',
}

// ── The four roles ───────────────────────────────────────────────────

type Desk = 'PM' | 'AP' | 'HM' | 'SUPPLIER'

interface Seat { kind: string; permissions: string[]; read: Readers }

function seat(desk: Desk): Seat {
  const kind = desk === 'SUPPLIER' ? 'VENDOR' : 'CLIENT'
  const permissions = {
    PM: ['governance.read', 'assignments.write', 'assignments.terminate', 'timesheets.approve', 'timesheets.read', 'invoices.read', 'requirements.write', 'rates.write'],
    AP: ['invoices.read', 'payments.record'],
    HM: ['requirements.write', 'timesheets.approve', 'timesheets.read'],
    SUPPLIER: ['invoices.read', 'submissions.create', 'rates.read'],
  }[desk]
  const has = (p: string) => permissions.includes(p)
  const owner = permissions.some((p) => (OWNER_DESKS as readonly string[]).includes(p))
  const company = desk === 'SUPPLIER' ? 'Pinnacle Resourcing' : 'Northbend Athletic'
  const read: Readers = {
    waiting: async () => (desk === 'AP' ? [APPROVE_441] : []),
    othersWaiting: async () => (desk === 'PM' ? FOR_AP : []),
    limits: async () => (kind !== 'CLIENT'
      ? { ok: false as const, says: LIMIT_IS_THE_CLIENTS }
      : owner
        ? { ok: true as const, entries: [TOBIAS], stale: [] }
        : { ok: false as const, says: deskRefusal('reads who is near the time limit', OWNER_DESKS, kind) }),
    told: async () => (has('payments.record') ? { told: [TOLD_442], stale: [] } : { told: [], stale: [] }),
    named: async (text) => ({
      ...matchPerson(text, desk === 'SUPPLIER' ? [] : ROSTER),
      ...(/PR-2026-0442/.test(text) && desk !== 'SUPPLIER' ? { receipt: { number: 'PR-2026-0442', invoiceId: 'inv-442' } } : {}),
    }),
    unsignedWeeks: async () => (kind !== 'CLIENT'
      ? { ok: false as const, says: 'Your client approves those timesheets; the ones you accept are on Timesheets.', links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }] }
      : !has('timesheets.read') && !has('timesheets.approve')
        ? { ok: false as const, says: deskRefusal('reads the timesheets waiting for approval', 'timesheets.approve', kind) }
        : { ok: true as const, rows: WEEKS, total: WEEKS.length, company, maySign: has('timesheets.approve') }),
    spendIn: async () => (!has('invoices.read')
      ? { ok: false as const, says: deskRefusal('reads what suppliers billed you', 'invoices.read', kind) }
      : { ok: true as const, receipts: kind === 'CLIENT' ? SPEND : [], undated: 0 }),
    receiptsIn: async () => (!has('invoices.read')
      ? { ok: false as const, says: deskRefusal('reads invoice mismatches by supplier', 'invoices.read', kind) }
      : { ok: true as const, receipts: kind === 'CLIENT' ? RECEIPTS : [] }),
    entry: async (ref) => (ref === 'PR-2026-0442' || ref === 'entry-442' ? ENTRY_442
      : ref === 'entry-441' ? { ...ENTRY_442, id: 'entry-441', says: APPROVE_441.says, ruleCited: APPROVE_441.ruleCited, rationale: APPROVE_441.rationale, entityId: 'inv-441' }
      : null),
    ledgerLines: async () => [],
    // The company's switch is off, as it is by default: nothing may reach the model.
    modelOn: async () => false,
    vocabulary: async () => { throw new Error('The model is off: nothing is masked because nothing leaves.') },
    model: async () => { throw new Error('The model is off: no question may reach it.') },
    logPrompt: async () => { throw new Error('The model is off: nothing is logged because nothing left.') },
    // A firm's own book (2026-10-19): the supplier's own bills; a client is sent to its dashboard for who leaves its sites.
    rollingOff: async () => (kind === 'CLIENT'
      ? { ok: false as const, says: 'Your dashboard lists who leaves your sites, under Ending soon.', links: [{ label: 'Open the dashboard', href: '/dashboard/program' }] }
      : { ok: true as const, rows: [] }),
    unpaidBills: async () => (kind === 'CLIENT'
      ? { ok: false as const, says: 'Your suppliers bill you; what you owe them is under Invoice receipts.' }
      : { ok: true as const, rows: [{ invoiceId: 'inv-442', number: 'PR-2026-0442', customer: 'Northbend Athletic', dueMinor: 406700, currency: 'USD', dueOn: '2026-11-11', held: false, href: '/dashboard/invoices/inv-442' }] }),
  }
  return { kind, permissions, read }
}

/** Everything a reply says, in reading order: the recommendation, the headline, the lines under it. */
function spoken(a: Answer): string {
  if (a.kind === 'WORKER') return [a.recommend?.says, a.says, ...a.more.map((l) => l.says), a.papers?.says, ...(a.tail ?? []).map((l) => l.says)].filter(Boolean).join(' ')
  if (a.kind === 'NEEDS') return [a.recommend?.says, a.says, ...(a.more ?? []).map((l) => l.says)].filter(Boolean).join(' ')
  return a.says
}

async function ask(desk: Desk, question: string): Promise<Answer> {
  const s = seat(desk)
  return respond(question, s.read, { env: NO_KEY, now: NOW, companyKind: s.kind, permissions: s.permissions })
}

type Outcome = 'ANSWERED' | 'REFUSED' | 'NOT_YET'
const score: Record<Outcome, number> = { ANSWERED: 0, REFUSED: 0, NOT_YET: 0 }

/** One question: the exact reply, which kind of reply it is, and the voice. */
async function check(desk: Desk, question: string, outcome: Outcome, expected: string) {
  const a = await ask(desk, question)
  const said = spoken(a)
  expect(said).toBe(expected)
  if (outcome === 'NOT_YET') expect(said.startsWith(NOT_YET)).toBe(true)
  else expect(said.startsWith(NOT_YET)).toBe(false)
  if (outcome === 'REFUSED') expect(a.kind).toBe('TEXT')
  // The voice, on every reply. A "why" quotes the ledger's own act, so its length is the ledger's.
  const breaks = voiceBreaks(said)
  expect(a.kind === 'WHY' ? breaks.filter((b) => b.startsWith('uses')) : breaks).toEqual([])
  score[outcome]++
}

afterAll(() => {
  const asked = score.ANSWERED + score.REFUSED + score.NOT_YET
  console.log(`Ask Etyme: ${asked} asked, ${score.ANSWERED} answered by rules, ${score.REFUSED} honest refusals, ${score.NOT_YET} not yet`)
})


describe('Lorena, program manager at Northbend Athletic', () => {
  it('the program manager asks “What needs me today?” and reads who Etyme asked, by name and role, never “on your authority”', async () => {
    await check('PM', 'What needs me today?', 'ANSWERED',
      'Ask Renata Kowal, AP clerk, to approve PR-2026-0441 and IN-XSWQQZ-20260901. Nothing from Etyme is waiting on you. Checked just now. Renata Kowal, AP clerk, has two invoice receipts to approve: PR-2026-0441 and IN-XSWQQZ-20260901. Etyme asked Renata; they are not yours to approve. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.')
  })

  it('the program manager asks “Anything waiting on me?” and the rules answer it', async () => {
    await check('PM', 'Anything waiting on me?', 'ANSWERED',
      'Ask Renata Kowal, AP clerk, to approve PR-2026-0441 and IN-XSWQQZ-20260901. Nothing from Etyme is waiting on you. Checked just now. Renata Kowal, AP clerk, has two invoice receipts to approve: PR-2026-0441 and IN-XSWQQZ-20260901. Etyme asked Renata; they are not yours to approve. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.')
  })

  it('the program manager asks “Who is near the time limit?” and the rules answer it', async () => {
    await check('PM', 'Who is near the time limit?', 'ANSWERED',
      'Plan Tobias Lindqvist’s end date or break in service now. One contractor is near the time limit, counted across every supplier. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026. Checked just now.')
  })

  it('the program manager asks “Is anyone close to 18 months here?” and the rules answer it', async () => {
    await check('PM', 'Is anyone close to 18 months here?', 'ANSWERED',
      'Plan Tobias Lindqvist’s end date or break in service now. One contractor is near the time limit, counted across every supplier. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026. Checked just now.')
  })

  it('the program manager asks “What did we spend by supplier this month?” and the rules answer it', async () => {
    await check('PM', 'What did we spend by supplier this month?', 'ANSWERED',
      'Three suppliers billed you $42,587.00 in Oct 2026, on 3 invoices. Of that, $21,120.00 is paid. Counted by invoice date, and checked just now.')
  })

  it('the program manager asks “How much have suppliers billed us this month?” and the rules answer it', async () => {
    await check('PM', 'How much have suppliers billed us this month?', 'ANSWERED',
      'Three suppliers billed you $42,587.00 in Oct 2026, on 3 invoices. Of that, $21,120.00 is paid. Counted by invoice date, and checked just now.')
  })

  it('the program manager asks “Which timesheets are waiting for approval?” and the rules answer it', async () => {
    await check('PM', 'Which timesheets are waiting for approval?', 'ANSWERED',
      'Approve Helena Marsh’s timesheet first; it has waited 2 days. Three timesheets are waiting for approval at Northbend Athletic. Checked just now.')
  })

  it('the program manager asks “Show me invoice mismatches by supplier this quarter” and the rules answer it', async () => {
    await check('PM', 'Show me invoice mismatches by supplier this quarter', 'ANSWERED',
      'Pay PR-2026-0442 only after Pinnacle Resourcing corrects it. Three invoices from two suppliers were received in Q4 2026. One invoice does not match: 1.5 hours billed over the approved hours. Counted by invoice date, and checked just now against the three-way check. Last night’s check said PR-2026-0441 did not match; it matches now.')
  })

  it('the program manager asks “Which invoices don\'t match the timesheets?” and the rules answer it', async () => {
    await check('PM', 'Which invoices don\'t match the timesheets?', 'ANSWERED',
      'Pay PR-2026-0442 only after Pinnacle Resourcing corrects it. Three invoices from two suppliers were received in Q4 2026. One invoice does not match: 1.5 hours billed over the approved hours. Counted by invoice date, and checked just now against the three-way check. Last night’s check said PR-2026-0441 did not match; it matches now.')
  })

  it('the program manager asks “Extend Helena Marsh\'s contract by three months” and is refused in one sentence that names the door', async () => {
    await check('PM', 'Extend Helena Marsh\'s contract by three months', 'REFUSED',
      'Etyme never extends a contract; you can, from Helena Marsh’s line on Contracts.')
  })

  it('the program manager asks “End Omar Haddad\'s contract on Friday” and is refused in one sentence that names the door', async () => {
    await check('PM', 'End Omar Haddad\'s contract on Friday', 'REFUSED',
      'Etyme never ends a contract; you can, from Omar Haddad’s line on Contracts.')
  })

  it('the program manager asks “Sign the MSA with Veritan Talent” and is refused in one sentence that names the door', async () => {
    await check('PM', 'Sign the MSA with Veritan Talent', 'REFUSED',
      'Etyme never signs an agreement; you can, on the agreement’s page.')
  })

  it('the program manager asks “What markup is Pinnacle making on Helena?” and is refused in one sentence that names the door', async () => {
    await check('PM', 'What markup is Pinnacle making on Helena?', 'REFUSED',
      'Etyme never shows a firm’s margin to anybody else; your dashboard shows what you pay each supplier.')
  })

  it('the program manager asks “How many open jobs do we have?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'How many open jobs do we have?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the program manager asks “Which documents expire this month?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'Which documents expire this month?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the program manager asks “What is our average bill rate for data engineers?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'What is our average bill rate for data engineers?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the program manager asks “What is the capital of France?” and is refused in one sentence that says what Ask Etyme helps with', async () => {
    await check('PM', 'What is the capital of France?', 'REFUSED', ONLY_THE_RECORD)
  })

  it('the program manager asks “What do other companies pay for a data engineer?” and is refused in one sentence, because another company’s book is not hers', async () => {
    await check('PM', 'What do other companies pay for a data engineer?', 'REFUSED', NOT_ANOTHER_BOOK)
  })

  it('the program manager asks “Who starts next week?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'Who starts next week?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

})

describe('Renata, AP clerk at Northbend Athletic', () => {
  it('the AP clerk asks “What needs me today?” and the rules answer it', async () => {
    await check('AP', 'What needs me today?', 'ANSWERED',
      'Approve PR-2026-0441 from Pinnacle Resourcing; it matches the approved hours and the contract rate. Etyme is asking you one thing; approve it below, or reject it with a reason. Checked just now. PR-2026-0442 bills 41.5 hours against 40 approved. Ask Pinnacle Resourcing to correct it, or record an exception with a reason on its page.')
  })

  it('the AP clerk asks “Approve 1” and the rules answer it', async () => {
    await check('AP', 'Approve 1', 'ANSWERED',
      'Approve PR-2026-0441 from Pinnacle Resourcing? Your approval is recorded under your name.')
  })

  it('the AP clerk asks “Reject 1” and the rules answer it', async () => {
    await check('AP', 'Reject 1', 'ANSWERED',
      'Give a reason, so it is on the record: “Reject 1 because …”.')
  })

  it('the AP clerk asks “Reject 1 because the hours are over what we approved” and the rules answer it', async () => {
    await check('AP', 'Reject 1 because the hours are over what we approved', 'ANSWERED',
      'Reject PR-2026-0441 from Pinnacle Resourcing, because “the hours are over what we approved”? Nothing else happens, and your reason is recorded under your name.')
  })

  it('the AP clerk asks “Why doesn\'t PR-2026-0442 match?” and the rules answer it', async () => {
    await check('AP', 'Why doesn\'t PR-2026-0442 match?', 'ANSWERED',
      'Tell the person who pays that an invoice receipt and the accepted hours or the contract rate do not agree.')
  })

  it('the AP clerk asks “Why 1” and the rules answer it', async () => {
    await check('AP', 'Why 1', 'ANSWERED',
      'Approve a supplier’s invoice receipt that cleared the three-way check, so it can be paid.')
  })

  it('the AP clerk asks “Pay PR-2026-0442” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Pay PR-2026-0442', 'REFUSED',
      'Etyme never pays an invoice; you can, on PR-2026-0442’s page.')
  })

  it('the AP clerk asks “Run payroll” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Run payroll', 'REFUSED',
      'Etyme never runs payroll; your Owner does it on Payroll.')
  })

  it('the AP clerk asks “Who is near the time limit?” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Who is near the time limit?', 'REFUSED',
      'Your Program Manager or Approver reads who is near the time limit; ask them.')
  })

  it('the AP clerk asks “Which timesheets still need approval?” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Which timesheets still need approval?', 'REFUSED',
      'Your Hiring Manager reads the timesheets waiting for approval; ask them.')
  })

  it('the AP clerk asks “Which invoices are due this week?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('AP', 'Which invoices are due this week?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the AP clerk asks “How much did we pay Computer Systems last quarter?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('AP', 'How much did we pay Computer Systems last quarter?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the AP clerk asks “What can you do?” and the rules answer it', async () => {
    await check('AP', 'What can you do?', 'ANSWERED',
      'I answer from the record: what needs you, the time limit, spend, timesheets to approve and invoice mismatches. I also answer “Why 1”, “Approve 1” and “Reject 1 because …”.')
  })

})

describe('the hiring manager at Northbend Athletic', () => {
  it('the hiring manager asks “What needs me today?” and the rules answer it', async () => {
    await check('HM', 'What needs me today?', 'ANSWERED',
      'Nothing needs you today, and nothing Etyme asked is waiting on anybody. Checked just now.')
  })

  it('the hiring manager asks “Which timesheets are waiting for me to approve?” and the rules answer it', async () => {
    await check('HM', 'Which timesheets are waiting for me to approve?', 'ANSWERED',
      'Approve Helena Marsh’s timesheet first; it has waited 2 days. Three timesheets are waiting for approval at Northbend Athletic. Checked just now.')
  })

  it('the hiring manager asks “Any hours waiting for approval?” and the rules answer it', async () => {
    await check('HM', 'Any hours waiting for approval?', 'ANSWERED',
      'Approve Helena Marsh’s timesheet first; it has waited 2 days. Three timesheets are waiting for approval at Northbend Athletic. Checked just now.')
  })

  it('the hiring manager asks “Hire Priya for the data engineer job” and is refused in one sentence that names the door', async () => {
    await check('HM', 'Hire Priya for the data engineer job', 'REFUSED',
      'Etyme never selects a candidate; you can, on the candidate’s submission.')
  })

  it('the hiring manager asks “Reject Brightmoor\'s candidate” and is refused in one sentence that names the door', async () => {
    await check('HM', 'Reject Brightmoor\'s candidate', 'REFUSED',
      'Etyme never rejects a candidate; you can, on the candidate’s submission.')
  })

  it('the hiring manager asks “Approve Helena\'s timesheet” and is refused in one sentence that names the door', async () => {
    await check('HM', 'Approve Helena\'s timesheet', 'REFUSED',
      'Etyme never approves a timesheet; you can, on Timesheets.')
  })

  it('the hiring manager asks “What did we spend this month?” and is refused in one sentence that names the door', async () => {
    await check('HM', 'What did we spend this month?', 'REFUSED',
      'Your Program Manager or AP Clerk reads what suppliers billed you; ask them.')
  })

  it('the hiring manager asks “Who applied for the data engineer job?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('HM', 'Who applied for the data engineer job?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the hiring manager asks “When is Omar Haddad\'s interview?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('HM', 'When is Omar Haddad\'s interview?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('the hiring manager asks “Write a poem about our timesheets” and is refused in one sentence that says what Ask Etyme helps with', async () => {
    await check('HM', 'Write a poem about our timesheets', 'REFUSED', ONLY_THE_RECORD)
  })

  it('the hiring manager asks “Who rolls off in the next 30 days?” and is sent to Ending soon on the dashboard in one sentence', async () => {
    await check('HM', 'Who rolls off in the next 30 days?', 'REFUSED',
      'Your dashboard lists who leaves your sites, under Ending soon.')
  })

})

describe('the account manager at Pinnacle Resourcing', () => {
  it('a supplier’s account manager asks “What needs me today?” and the rules answer it', async () => {
    await check('SUPPLIER', 'What needs me today?', 'ANSWERED',
      'Nothing needs you today, and nothing Etyme asked is waiting on anybody. Checked just now.')
  })

  it('a supplier’s account manager asks “Which timesheets are waiting for approval?” and is refused in one sentence that names the door', async () => {
    await check('SUPPLIER', 'Which timesheets are waiting for approval?', 'REFUSED',
      'Your client approves those timesheets; the ones you accept are on Timesheets.')
  })

  it('a supplier’s account manager asks “Who is near the time limit?” and is refused in one sentence that names the door', async () => {
    await check('SUPPLIER', 'Who is near the time limit?', 'REFUSED',
      'Your client counts the time limit across every supplier; its program manager reads it.')
  })

  it('a supplier’s account manager asks “What did we spend by supplier this month?” and the rules answer it', async () => {
    await check('SUPPLIER', 'What did we spend by supplier this month?', 'ANSWERED',
      'No supplier billed you in Oct 2026. Checked just now.')
  })

  it('a supplier’s account manager asks “What margin do other suppliers make at Northbend?” and is refused in one sentence that names the door', async () => {
    await check('SUPPLIER', 'What margin do other suppliers make at Northbend?', 'REFUSED',
      'Etyme never shows a firm’s margin to anybody else; your own rates are on your contracts.')
  })

  it('a supplier’s account manager asks “Approve my invoice PR-2026-0442” and the rules answer it', async () => {
    await check('SUPPLIER', 'Approve my invoice PR-2026-0442', 'ANSWERED',
      'Nothing from Etyme is waiting on you, so there is nothing to answer.')
  })

  it('a supplier’s account manager asks “What is the market rate for a Java developer?” and is refused in one sentence, because no benchmark crosses companies', async () => {
    await check('SUPPLIER', 'What is the market rate for a Java developer?', 'REFUSED', NOT_ANOTHER_BOOK)
  })

  it('a supplier’s account manager asks “Which of my invoices to Northbend are unpaid?” and the rules answer it from the bills it sent', async () => {
    await check('SUPPLIER', 'Which of my invoices to Northbend are unpaid?', 'ANSWERED',
      'One bill is unpaid: $4,067.00 in all. Checked just now.')
  })

  it('a supplier’s account manager asks “Did Northbend approve Helena\'s timesheet?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'Did Northbend approve Helena\'s timesheet?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('a supplier’s account manager asks “How many of my consultants are on site at Northbend?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'How many of my consultants are on site at Northbend?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

  it('a supplier’s account manager asks “Can you send Pinnacle a reminder about PR-2026-0442?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'Can you send Pinnacle a reminder about PR-2026-0442?', 'NOT_YET',
      'I cannot answer that yet. This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.')
  })

})

describe('Sade, owner of Halcyon Talent, where nobody else sends bills', () => {
  // A one-person firm: the Owner is the only seat, and the person Ask
  // Etyme acts for. Its drafted bill is put to her under the owner-only
  // exception (founder, 2026-10-19, decision 2), and the item says why.
  const BILL_0042: WaitingItem = {
    n: 1, approvalId: 'appr-bill', entryId: 'entry-bill', action: 'bill.send',
    says: 'Send a bill Ask Etyme drafted from signed weeks.',
    title: 'INV-0042 to Northbend Athletic',
    ruleCited: 'Billed monthly, from your agreement with Northbend Athletic.',
    rationale: 'Bill INV-0042 to Northbend Athletic for March 2026 is drafted: $8,960.00, 80 hours. Send it?',
    href: '/dashboard/invoices/inv-0042',
    bill: {
      customerName: 'Northbend Athletic',
      period: { start: '2026-03-01', end: '2026-03-31', label: 'March 2026' },
      hours: 80, totalMinor: 896000, currency: 'USD',
      people: [{ personName: 'Rosa Delgado', hours: 80, amountMinor: 896000 }],
      builtFrom: { timesheetIds: ['ts-a', 'ts-b'], weeks: 2, expenses: 0, milestones: 0 },
      dueSays: 'Due May 1, 2026: net 30 from the bill date.',
      heldBack: null, setAside: [], invoiceId: 'inv-0042', invoiceNumber: 'INV-0042',
      // Money's due-on-sending number (lib/money/supplier-bills), spread so the
      // literal reads the same before and after that field lands.
      ...{ pastDue: null },
    },
    askedYouBecause: 'Only you send bills here, so Ask Etyme asks you.',
  }

  async function askOwner(question: string): Promise<Answer> {
    const s = seat('SUPPLIER')
    return respond(question, { ...s.read, waiting: async () => [BILL_0042] }, { env: NO_KEY, now: NOW, companyKind: 'VENDOR', permissions: ['*'] })
  }

  it('the owner of a one-person firm asks “What needs me today?” and the rules answer it with the bill Ask Etyme drafted, which says why she is asked', async () => {
    const a = await askOwner('What needs me today?')
    const said = spoken(a)
    expect(said).toBe('Send bill INV-0042 to Northbend Athletic; it is built from weeks Northbend Athletic signed. ' +
      'Etyme drafted one bill for you to send; send it below, or say not now. Checked just now.')
    expect(a.kind).toBe('NEEDS')
    if (a.kind !== 'NEEDS') return
    expect(a.items.map((i) => [i.title, i.askedYouBecause])).toEqual([['INV-0042 to Northbend Athletic', 'Only you send bills here, so Ask Etyme asks you.']])
    expect(voiceBreaks(said)).toEqual([])
    score.ANSWERED++
  })
})


describe('Helena Marsh, a worker on Techpeple’s bench, on site at Northbend Athletic', () => {
  // Read on Monday Oct 19, 2026, from her own pages: one week ended and not
  // filed, one week the client signed and the firms below have not
  // accepted, one week Techpeple accepted and owes her, one paid.
  const HELENA: WorkerFacts = {
    seat: 'CONSULTANT', seatAt: 'Techpeple',
    placements: [{ site: 'Northbend Athletic', through: ['Computer Systems Inc'], employer: 'Techpeple', tie: 'EMPLOYED', live: true, endDate: '2027-03-28', payRateMinor: 9000, payCurrency: 'USD', rateNote: null }],
    toFile: [{ periodStart: '2026-10-11', periodEnd: '2026-10-17', site: 'Northbend Athletic', ended: true, wholeWeek: true, expectedHours: 40, dueOn: '2026-10-19' }],
    returned: [],
    sent: [
      { id: 'ts-oct4', periodStart: '2026-10-04', periodEnd: '2026-10-10', hours: 40, stage: 'WAITING_FOR_EMPLOYER', waitingOn: 'Computer Systems Inc', client: 'Northbend Athletic', employer: 'Techpeple', approvedBy: null, stillOwedMinor: null, owedHours: null, currency: null, dueOn: null, overdue: false, paidOn: null },
      { id: 'ts-sep27', periodStart: '2026-09-27', periodEnd: '2026-10-03', hours: 40, stage: 'OWED', waitingOn: null, client: 'Northbend Athletic', employer: 'Techpeple', approvedBy: null, stillOwedMinor: 360000, owedHours: 40, currency: 'USD', dueOn: '2026-11-09', overdue: false, paidOn: null },
      { id: 'ts-sep20', periodStart: '2026-09-20', periodEnd: '2026-09-26', hours: 40, stage: 'PAID', waitingOn: null, client: 'Northbend Athletic', employer: 'Techpeple', approvedBy: null, stillOwedMinor: null, owedHours: null, currency: null, dueOn: null, overdue: false, paidOn: '2026-10-09' },
    ],
    ownCompanyBills: null, weeksWithNoRate: 0,
    papers: [{ id: 'doc-nda', name: 'Non-disclosure agreement', todo: 'sign', askedBy: 'Northbend Athletic', dueOn: null, stopsWork: false, href: '/dashboard/my-work/paperwork' }],
    runningOut: [], interviews: [], stays: [],
    consent: { benches: [{ firm: 'Techpeple', since: 'Mar 2, 2026', stay: 'You stay on Techpeple’s bench until you cancel.' }], asking: [], employers: [] },
    unread: [],
  }

  async function worker(question: string, outcome: Outcome, expected: string) {
    const a: WorkerAnswer = await respondWorker(question, { facts: async () => HELENA })
    const said = spoken(a)
    expect(said).toBe(expected)
    expect(said.startsWith(NOT_YET)).toBe(outcome === 'NOT_YET')
    if (outcome === 'REFUSED') expect(a.table).toBeUndefined()
    expect(voiceBreaks(said)).toEqual([])
    // Her own rate is said only when she asks for it; no firm's rate, ever.
    expect(JSON.stringify(a)).not.toMatch(/\$118|\$145|11800|14500/)
    score[outcome]++
  }

  it('a worker asks “What needs me today?” and reads the week to file first, then where her weeks stand and when one is owed, and the paper that does not stop her work last', async () => {
    await worker('What needs me today?', 'ANSWERED',
      'File your week of Oct 11–17 for Northbend Athletic. Two things need you: your week of Oct 11–17 and your non-disclosure agreement. Checked just now. Your week of Oct 4–10 is signed by Northbend Athletic. It waits for Computer Systems Inc to accept it, then Techpeple. $3,600.00 is owed to you, for 40 hours Techpeple accepted and has not paid yet. A week is owed to you once Techpeple accepts it, not when the client signs it. One paper is asked of you: your non-disclosure agreement.')
  })

  it('a worker asks “Is my week signed?” and reads who signed it and who has still to accept it', async () => {
    await worker('Is my week signed?', 'ANSWERED',
      'Your week of Oct 4–10 is signed by Northbend Athletic. It waits for Computer Systems Inc to accept it, then Techpeple. Checked just now.')
  })

  it('a worker asks “Did Northbend approve my hours?” and the rules answer it', async () => {
    await worker('Did Northbend approve my hours?', 'ANSWERED',
      'Your week of Oct 4–10 is signed by Northbend Athletic. It waits for Computer Systems Inc to accept it, then Techpeple. Checked just now.')
  })

  it('a worker asks “What am I owed?” and reads the employer’s acceptance, never the client’s signature, as the moment it became owed', async () => {
    await worker('What am I owed?', 'ANSWERED',
      '$3,600.00 is owed to you, for 40 hours Techpeple accepted and has not paid yet. Checked just now. The next pay day for it is Nov 9. One week you sent, 40 hours, is not owed yet. It waits for Computer Systems Inc. A week is owed to you once Techpeple accepts it, not when the client signs it.')
  })

  it('a worker asks “When do I get paid?” and the rules answer it', async () => {
    await worker('When do I get paid?', 'ANSWERED',
      '$3,600.00 is owed to you, for 40 hours Techpeple accepted and has not paid yet. Checked just now. The next pay day for it is Nov 9. One week you sent, 40 hours, is not owed yet. It waits for Computer Systems Inc. A week is owed to you once Techpeple accepts it, not when the client signs it.')
  })

  it('a worker asks “What papers are due?” and the rules answer it', async () => {
    await worker('What papers are due?', 'ANSWERED',
      'Sign your Non-disclosure agreement for Northbend Athletic. One paper is asked of you. Checked just now.')
  })

  it('a worker asks “Who has my consent?” and the rules answer it', async () => {
    await worker('Who has my consent?', 'ANSWERED',
      'One firm holds your consent to put you forward: Techpeple. Checked just now. You stay on Techpeple’s bench until you cancel.')
  })

  it('a worker asks “Who employs me?” and reads every firm in her chain by name', async () => {
    await worker('Who employs me?', 'ANSWERED',
      'You work at Northbend Athletic through Computer Systems Inc, employed by Techpeple. You see every firm in your chain. What one firm charges another stays between them.')
  })

  it('a worker asks “What is my rate?” and reads her own pay and nobody else’s', async () => {
    await worker('What is my rate?', 'ANSWERED', 'At Northbend Athletic, Techpeple pays you $90.00 an hour.')
  })

  it('a worker asks “What does Northbend pay for me?” and is refused in one sentence', async () => {
    await worker('What does Northbend pay for me?', 'REFUSED', 'Etyme shows you your own pay only; what one firm charges another stays between them.')
  })

  it('a worker asks “File my week” and is told Etyme never files it; the card opens her own page', async () => {
    await worker('File my week', 'REFUSED', 'Etyme never files your week; you file it on Your work.')
  })

  it('a worker asks “Approve my timesheet” and is told who signs it', async () => {
    await worker('Approve my timesheet', 'REFUSED', 'Etyme never signs a week; Northbend Athletic signs it, then Techpeple accepts it.')
  })

  it('a worker asks “What is the capital of France?” and is refused in one sentence that says what Ask Etyme helps with', async () => {
    await worker('What is the capital of France?', 'REFUSED',
      'I answer only about your own work: your weeks, your pay, your papers, your interviews and your consent.')
  })

  it('a worker asks “What do other consultants earn here?” and is refused, because another person’s pay is not hers', async () => {
    await worker('What do other consultants earn here?', 'REFUSED', 'I answer only about your own work, never another person’s pay or a firm’s rates.')
  })

  it('a worker asks “How many vacation days do I have left?” and is told honestly that Etyme cannot answer it yet', async () => {
    await worker('How many vacation days do I have left?', 'NOT_YET',
      'I cannot answer that yet. Ask about what needs you, your signed weeks, your pay, your papers or your consent.')
  })
})
