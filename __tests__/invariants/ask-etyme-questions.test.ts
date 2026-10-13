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
 * words. The model is off throughout, as it is by default.
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

/** What the program manager reads as waiting on another desk: asked on her own authority. */
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
  id: 'entry-442', says: 'Tell the desk that pays that an invoice receipt and the accepted hours or the contract rate do not agree.',
  ruleCited: 'Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.',
  rationale: 'Ask Pinnacle Resourcing to bill the hours accepted, or have the paying desk record why the difference stands.',
  entityType: 'Invoice', entityId: 'inv-442',
}

// ── The four desks ───────────────────────────────────────────────────

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
      ? { ok: false as const, says: 'Your client signs those weeks; the ones you accept are on Timesheets.', links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }] }
      : !has('timesheets.read') && !has('timesheets.approve')
        ? { ok: false as const, says: deskRefusal('reads the weeks waiting for a signature', 'timesheets.approve', kind) }
        : { ok: true as const, rows: WEEKS, total: WEEKS.length, company, maySign: has('timesheets.approve') }),
    spendIn: async () => (!has('invoices.read')
      ? { ok: false as const, says: deskRefusal('reads what suppliers billed you', 'invoices.read', kind) }
      : { ok: true as const, receipts: kind === 'CLIENT' ? SPEND : [], undated: 0 }),
    receiptsIn: async () => (!has('invoices.read')
      ? { ok: false as const, says: deskRefusal('reads invoice variance by supplier', 'invoices.read', kind) }
      : { ok: true as const, receipts: kind === 'CLIENT' ? RECEIPTS : [] }),
    entry: async (ref) => (ref === 'PR-2026-0442' || ref === 'entry-442' ? ENTRY_442
      : ref === 'entry-441' ? { ...ENTRY_442, id: 'entry-441', says: APPROVE_441.says, ruleCited: APPROVE_441.ruleCited, rationale: APPROVE_441.rationale, entityId: 'inv-441' }
      : null),
    ledgerLines: async () => [],
    model: async () => { throw new Error('The model is off: no question may reach it.') },
  }
  return { kind, permissions, read }
}

/** Everything a reply says, in reading order: the recommendation, the headline, the lines under it. */
function spoken(a: Answer): string {
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
  it('the program manager asks “What needs me today?” and the rules answer it', async () => {
    await check('PM', 'What needs me today?', 'ANSWERED',
      'Ask Renata Kowal, AP Clerk, to approve PR-2026-0441 and IN-XSWQQZ-20260901. Nothing from Etyme waits on you. Checked just now. Two invoice receipts wait for the AP Clerk: PR-2026-0441 and IN-XSWQQZ-20260901. Neither is yours to sign: Etyme asked on your authority. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.')
  })

  it('the program manager asks “Anything waiting on me?” and the rules answer it', async () => {
    await check('PM', 'Anything waiting on me?', 'ANSWERED',
      'Ask Renata Kowal, AP Clerk, to approve PR-2026-0441 and IN-XSWQQZ-20260901. Nothing from Etyme waits on you. Checked just now. Two invoice receipts wait for the AP Clerk: PR-2026-0441 and IN-XSWQQZ-20260901. Neither is yours to sign: Etyme asked on your authority. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026.')
  })

  it('the program manager asks “Who is near the time limit?” and the rules answer it', async () => {
    await check('PM', 'Who is near the time limit?', 'ANSWERED',
      'Plan Tobias Lindqvist’s end date or break now. One person is inside a time-limit warning, counted across every supplier. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026. Checked just now.')
  })

  it('the program manager asks “Is anyone close to 18 months?” and the rules answer it', async () => {
    await check('PM', 'Is anyone close to 18 months?', 'ANSWERED',
      'Plan Tobias Lindqvist’s end date or break now. One person is inside a time-limit warning, counted across every supplier. Tobias Lindqvist reaches the 18-month time limit in 60 days, on Dec 11, 2026. Checked just now.')
  })

  it('the program manager asks “What did we spend by supplier this month?” and the rules answer it', async () => {
    await check('PM', 'What did we spend by supplier this month?', 'ANSWERED',
      'Three suppliers billed you $42,587.00 in Oct 2026, on 3 invoice receipts. Of that, $21,120.00 is paid. Counted by the day each was billed, and checked just now.')
  })

  it('the program manager asks “How much have suppliers billed us this month?” and the rules answer it', async () => {
    await check('PM', 'How much have suppliers billed us this month?', 'ANSWERED',
      'Three suppliers billed you $42,587.00 in Oct 2026, on 3 invoice receipts. Of that, $21,120.00 is paid. Counted by the day each was billed, and checked just now.')
  })

  it('the program manager asks “Which weeks are unsigned?” and the rules answer it', async () => {
    await check('PM', 'Which weeks are unsigned?', 'ANSWERED',
      'Sign Helena Marsh’s week first; it has waited 2 days. Three weeks wait for a signature at Northbend Athletic. Checked just now.')
  })

  it('the program manager asks “Show me invoice variance by supplier this quarter” and the rules answer it', async () => {
    await check('PM', 'Show me invoice variance by supplier this quarter', 'ANSWERED',
      'Pay PR-2026-0442 only after Pinnacle Resourcing corrects it. Three invoice receipts from two suppliers were billed in Q4 2026. One receipt is not clean: 1.5 hours billed over what was accepted. Counted by the day each was billed, and checked just now against the three-way check. Last night’s check called PR-2026-0441 not clean; it is clean now.')
  })

  it('the program manager asks “Which invoice receipts don\'t match?” and the rules answer it', async () => {
    await check('PM', 'Which invoice receipts don\'t match?', 'ANSWERED',
      'Pay PR-2026-0442 only after Pinnacle Resourcing corrects it. Three invoice receipts from two suppliers were billed in Q4 2026. One receipt is not clean: 1.5 hours billed over what was accepted. Counted by the day each was billed, and checked just now against the three-way check. Last night’s check called PR-2026-0441 not clean; it is clean now.')
  })

  it('the program manager asks “Extend Helena three months” and is refused in one sentence that names the door', async () => {
    await check('PM', 'Extend Helena three months', 'REFUSED',
      'Etyme never extends a placement; you hold that desk, so do it on Helena Marsh’s placement page.')
  })

  it('the program manager asks “End Omar Haddad\'s placement on Friday” and is refused in one sentence that names the door', async () => {
    await check('PM', 'End Omar Haddad\'s placement on Friday', 'REFUSED',
      'Etyme never ends a placement; you hold that desk, so do it on Omar Haddad’s placement page.')
  })

  it('the program manager asks “Sign the MSA with Veritan Talent” and is refused in one sentence that names the door', async () => {
    await check('PM', 'Sign the MSA with Veritan Talent', 'REFUSED',
      'Etyme never signs an agreement; you hold that desk, so do it on the agreement’s page.')
  })

  it('the program manager asks “What markup is Pinnacle making on Helena?” and is refused in one sentence that names the door', async () => {
    await check('PM', 'What markup is Pinnacle making on Helena?', 'REFUSED',
      'Etyme never shows a firm’s margin to anybody else; your dashboard shows what you pay each supplier.')
  })

  it('the program manager asks “How many open job requests do we have?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'How many open job requests do we have?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the program manager asks “Which documents expire this month?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'Which documents expire this month?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the program manager asks “What is our average bill rate for data engineers?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'What is our average bill rate for data engineers?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the program manager asks “Who starts next week?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('PM', 'Who starts next week?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

})

describe('Renata, AP clerk at Northbend Athletic', () => {
  it('the AP clerk asks “What needs me today?” and the rules answer it', async () => {
    await check('AP', 'What needs me today?', 'ANSWERED',
      'Approve PR-2026-0441 from Pinnacle Resourcing; it passes the three-way check. Etyme is asking you one thing; approve it below, or reject it with a reason. Checked just now. PR-2026-0442 bills 41.5 hours against 40 accepted; it cannot be paid until Pinnacle Resourcing corrects it.')
  })

  it('the AP clerk asks “Approve 1” and the rules answer it', async () => {
    await check('AP', 'Approve 1', 'ANSWERED',
      'Approve PR-2026-0441 from Pinnacle Resourcing? Your yes goes in the twin’s ledger under your name.')
  })

  it('the AP clerk asks “Reject 1” and the rules answer it', async () => {
    await check('AP', 'Reject 1', 'ANSWERED',
      'Say why, so whoever reads the twin’s ledger knows: “Reject 1 because …”.')
  })

  it('the AP clerk asks “Reject 1 because the hours are over what we signed” and the rules answer it', async () => {
    await check('AP', 'Reject 1 because the hours are over what we signed', 'ANSWERED',
      'Reject PR-2026-0441 from Pinnacle Resourcing, because “the hours are over what we signed”? Etyme does nothing, and your reason goes in the twin’s ledger.')
  })

  it('the AP clerk asks “Why is PR-2026-0442 not clean?” and the rules answer it', async () => {
    await check('AP', 'Why is PR-2026-0442 not clean?', 'ANSWERED',
      'Tell the desk that pays that an invoice receipt and the accepted hours or the contract rate do not agree.')
  })

  it('the AP clerk asks “Why 1” and the rules answer it', async () => {
    await check('AP', 'Why 1', 'ANSWERED',
      'Approve a supplier’s invoice receipt that cleared the three-way check, so it can be paid.')
  })

  it('the AP clerk asks “Pay PR-2026-0442” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Pay PR-2026-0442', 'REFUSED',
      'Etyme never pays an invoice receipt; you hold that desk, so do it on PR-2026-0442’s page.')
  })

  it('the AP clerk asks “Run payroll” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Run payroll', 'REFUSED',
      'Etyme never runs payroll; your Owner does it on Payroll.')
  })

  it('the AP clerk asks “Who is near the time limit?” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Who is near the time limit?', 'REFUSED',
      'Your Program Manager or Approver reads who is near the time limit; ask them.')
  })

  it('the AP clerk asks “Which weeks are unsigned?” and is refused in one sentence that names the door', async () => {
    await check('AP', 'Which weeks are unsigned?', 'REFUSED',
      'Your Hiring Manager reads the weeks waiting for a signature; ask them.')
  })

  it('the AP clerk asks “Which invoice receipts are due this week?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('AP', 'Which invoice receipts are due this week?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the AP clerk asks “How much did we pay Computer Systems last quarter?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('AP', 'How much did we pay Computer Systems last quarter?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the AP clerk asks “What can you do?” and the rules answer it', async () => {
    await check('AP', 'What can you do?', 'ANSWERED',
      'I answer these from the record: what needs you, the time limit, spend, unsigned weeks and invoice variance. I also answer “Why 1”, “Approve 1” and “Reject 1 because …”.')
  })

})

describe('the hiring manager at Northbend Athletic', () => {
  it('the hiring manager asks “What needs me today?” and the rules answer it', async () => {
    await check('HM', 'What needs me today?', 'ANSWERED',
      'Nothing needs you today, and nothing Etyme asked waits on anybody. Checked just now.')
  })

  it('the hiring manager asks “Which timesheets are waiting for me to sign?” and the rules answer it', async () => {
    await check('HM', 'Which timesheets are waiting for me to sign?', 'ANSWERED',
      'Sign Helena Marsh’s week first; it has waited 2 days. Three weeks wait for a signature at Northbend Athletic. Checked just now.')
  })

  it('the hiring manager asks “Any hours waiting for approval?” and the rules answer it', async () => {
    await check('HM', 'Any hours waiting for approval?', 'ANSWERED',
      'Sign Helena Marsh’s week first; it has waited 2 days. Three weeks wait for a signature at Northbend Athletic. Checked just now.')
  })

  it('the hiring manager asks “Award the data engineer job to Priya” and is refused in one sentence that names the door', async () => {
    await check('HM', 'Award the data engineer job to Priya', 'REFUSED',
      'Etyme never awards a job; you hold that desk, so do it on the submission.')
  })

  it('the hiring manager asks “Reject the submission from Brightmoor” and is refused in one sentence that names the door', async () => {
    await check('HM', 'Reject the submission from Brightmoor', 'REFUSED',
      'Etyme never rejects a submission; you hold that desk, so do it on the submission.')
  })

  it('the hiring manager asks “Sign Helena\'s week” and is refused in one sentence that names the door', async () => {
    await check('HM', 'Sign Helena\'s week', 'REFUSED',
      'Etyme never signs a week of hours; you hold that desk, so do it on Timesheets.')
  })

  it('the hiring manager asks “What did we spend this month?” and is refused in one sentence that names the door', async () => {
    await check('HM', 'What did we spend this month?', 'REFUSED',
      'Your Program Manager or AP Clerk reads what suppliers billed you; ask them.')
  })

  it('the hiring manager asks “How many candidates were submitted for the data engineer job?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('HM', 'How many candidates were submitted for the data engineer job?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the hiring manager asks “When is Omar Haddad\'s interview?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('HM', 'When is Omar Haddad\'s interview?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('the hiring manager asks “Who is ending in the next 30 days?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('HM', 'Who is ending in the next 30 days?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

})

describe('the account manager at Pinnacle Resourcing', () => {
  it('a supplier’s account manager asks “What needs me today?” and the rules answer it', async () => {
    await check('SUPPLIER', 'What needs me today?', 'ANSWERED',
      'Nothing needs you today, and nothing Etyme asked waits on anybody. Checked just now.')
  })

  it('a supplier’s account manager asks “Which weeks are unsigned?” and is refused in one sentence that names the door', async () => {
    await check('SUPPLIER', 'Which weeks are unsigned?', 'REFUSED',
      'Your client signs those weeks; the ones you accept are on Timesheets.')
  })

  it('a supplier’s account manager asks “Who is near the time limit?” and is refused in one sentence that names the door', async () => {
    await check('SUPPLIER', 'Who is near the time limit?', 'REFUSED',
      'Your client counts the time limit across every supplier; its program office reads it.')
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
      'Nothing from Etyme waits on you, so there is nothing to answer.')
  })

  it('a supplier’s account manager asks “Which of my invoices to Northbend are unpaid?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'Which of my invoices to Northbend are unpaid?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('a supplier’s account manager asks “Did Northbend sign Helena\'s week?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'Did Northbend sign Helena\'s week?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('a supplier’s account manager asks “How many of my people are on site at Northbend?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'How many of my people are on site at Northbend?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

  it('a supplier’s account manager asks “Can you send Pinnacle a reminder about PR-2026-0442?” and is told honestly that Etyme cannot answer it yet', async () => {
    await check('SUPPLIER', 'Can you send Pinnacle a reminder about PR-2026-0442?', 'NOT_YET',
      'I cannot answer that yet. Free text needs the model, and the model is off for this deployment. Try a question below.')
  })

})
