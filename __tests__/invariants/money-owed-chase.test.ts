import { describe, it, expect } from 'vitest'
import {
  owedCents, daysPastDue, moneyChaseQuestion, moneyChaseLetter, moneyChaseHeldSays, moneyChaseNoOwnerSays, PROPOSED_MONEY_CHASE, PROPOSED_MONEY_CHASE_PLAN, CHASEABLE_STATUSES,
  PROPOSED_FINAL_NOTICE_PLAN, FINAL_NOTICE_TEMPLATE, finalNoticeQuestion, finalNoticeLetter,
} from '@/lib/money/money-owed-chase'
import { nextLetter } from '@/lib/notify/timesheet-chase-agent'

const OFF = [0, 6]
const d = (s: string) => new Date(`${s}T12:00:00Z`)

describe('chasing money owed, as arithmetic and words', () => {
  it('the proposed plan is one letter, two reminders, five working days apart, closing when the bill is paid in full', () => {
    expect(PROPOSED_MONEY_CHASE).toEqual({ letters: 1, retries: 2, workingDaysApart: 5 })
    expect(PROPOSED_MONEY_CHASE_PLAN.closesWhen).toBe('the bill is paid in full')
  })
  it('what is owed is the total less the cents of the payments placed on it', () => {
    expect(owedCents({ total: '1000.00', currency: 'USD' }, [{ amount: '250.50', currency: 'USD' }, { amount: '100.00', currency: 'USD' }])).toBe(64_950)
  })
  it('a payment of another currency is never subtracted', () => {
    expect(owedCents({ total: '1000.00', currency: 'USD' }, [{ amount: '1000.00', currency: 'EUR' }])).toBe(100_000)
  })
  it('a bill paid to the cent owes nothing', () => {
    expect(owedCents({ total: '1000.00', currency: 'USD' }, [{ amount: '1000.00', currency: 'USD' }])).toBe(0)
  })
  it('days past due count whole days after the due date, and a bill due today is not past', () => {
    expect(daysPastDue(d('2026-11-01'), d('2026-11-23'))).toBe(22)
    expect(daysPastDue(d('2026-11-23'), d('2026-11-23'))).toBe(0)
  })
  it('only a sent bill is chased, never one held or disputed by the customer', () => {
    expect([...CHASEABLE_STATUSES]).toEqual(['SUBMITTED', 'PARTIALLY_PAID'])
  })
  it('the card names the customer, the bill, the amount owed, the due date and the days past, and says the plan is a proposal', () => {
    const q = moneyChaseQuestion({ customer: 'Northbend Athletic', number: 'IN-1042', owedMinor: 64_950, currency: 'USD', dueAt: d('2026-11-01'), daysPast: 22 })
    expect(q).toMatch(/Northbend Athletic owes \$649\.50 on bill IN-1042, due Nov 1, 2026, 22 days past it/)
    expect(q).toMatch(/one letter, then up to 2 reminders, 5 working days apart, closing when the bill is paid in full/)
    expect(q).toMatch(/proposals; the Owner can change them in Agent control/)
  })
  it('a reminder waits five working days, then goes', () => {
    expect(nextLetter(PROPOSED_MONEY_CHASE_PLAN, 1, d('2026-11-16'), d('2026-11-20'), OFF).act).toBe('WAIT')
    expect(nextLetter(PROPOSED_MONEY_CHASE_PLAN, 1, d('2026-11-16'), d('2026-11-23'), OFF)).toEqual({ act: 'SEND', attempt: 2 })
  })
  it('reminders spent end the task and open nothing', () => {
    expect(nextLetter(PROPOSED_MONEY_CHASE_PLAN, 3, d('2026-11-02'), d('2026-11-23'), OFF)).toEqual({ act: 'END' })
  })
  const base = { supplierName: 'Brightmoor Staffing', customerName: 'Northbend Athletic', contactName: 'Ana Rao', number: 'IN-1042', owedMinor: 64_950, currency: 'USD', dueAt: d('2026-11-01'), daysPast: 22, link: 'https://x.example/answer/bill/T', linkClosed: false, attempt: 1,
    weeks: [{ person: 'Priya Shah', periodStart: d('2026-10-04'), periodEnd: d('2026-10-10'), hours: 40, signedAt: d('2026-10-13') }] }
  it('the letter names the bill, the amount owed and the due date, and carries the bill link and its signed weeks', () => {
    const l = moneyChaseLetter(base)
    expect(l.subject).toBe('Bill IN-1042: $649.50 owed, due Nov 1, 2026')
    expect(l.text).toMatch(/bill IN-1042 to Northbend Athletic\. \$649\.50 is still owed\. It was due on Nov 1, 2026, 22 days ago/)
    expect(l.text).toContain('https://x.example/answer/bill/T')
    expect(l.text).toMatch(/Priya Shah, Oct 4 to Oct 10: 40 hours, signed Oct 13, 2026/)
  })
  it('a reminder says it is a reminder', () => {
    expect(moneyChaseLetter({ ...base, attempt: 2 }).subject).toMatch(/^Reminder: /)
  })
  it('the letter never threatens, promises a date, writes off or holds pay', () => {
    const t = moneyChaseLetter({ ...base, attempt: 3 }).text.toLowerCase()
    for (const w of ['final notice', 'write off', 'write-off', 'hold', 'legal', 'collections', 'we will pay', 'promise']) expect(t).not.toContain(w)
  })
  it('a link that has stopped opening is not printed, and the letter offers to send it again', () => {
    const l = moneyChaseLetter({ ...base, link: null, linkClosed: true })
    expect(l.text).not.toContain('answer/bill')
    expect(l.text).toMatch(/stopped opening/)
  })
})

describe('saying why a bill was not chased, in words', () => {
  it('the held line names the bill, the customer and the open payment question, and says the chase is proposed once that question is recorded', () => {
    const t = moneyChaseHeldSays({ number: 'IN-1042', customer: 'Northbend Athletic', })
    expect(t).toBe('Bill IN-1042 to Northbend Athletic was not chased, and nothing was sent: a payment question about it is still open. Once that question is recorded, the next run proposes the chase.')
  })
  it('the held line for an approved chase says the letters are paused, not that a chase is proposed', () => {
    const t = moneyChaseHeldSays({ number: 'IN-7', customer: 'Northbend Athletic', paused: true })
    expect(t).toMatch(/Letters about bill IN-7 to Northbend Athletic are paused, and nothing was sent: a payment question about it is still open\. Once that question is recorded, the letters go on as approved\./)
  })
  it('no held line shows a record code to the person reading it', () => {
    expect(moneyChaseHeldSays({ number: 'A', customer: 'B' })).not.toMatch(/\(|c[a-z0-9]{20,}/)
  })
  it('no held line ever says reconciliation', () => {
    expect(moneyChaseHeldSays({ number: 'A', customer: 'B' }).toLowerCase()).not.toContain('reconcil')
    expect(moneyChaseHeldSays({ number: 'A', customer: 'B', paused: true }).toLowerCase()).not.toContain('reconcil')
  })
  it('the no-owner line says how many late bills were not chased, names one, and says which seats to fill', () => {
    expect(moneyChaseNoOwnerSays(3, 'IN-9')).toBe('3 bills past due were not chased, such as bill IN-9: no Accounts Receivable, Finance or Owner seat is working. Fill one and the next run proposes them.')
    expect(moneyChaseNoOwnerSays(1, 'IN-9')).toBe('1 bill past due was not chased, such as bill IN-9: no Accounts Receivable, Finance or Owner seat is working. Fill one and the next run proposes it.')
  })
})

describe('a final notice is drafted for a person and never sent by the agent', () => {
  const f = { supplierName: 'Brightmoor Staffing', customerName: 'Northbend Athletic', contactName: 'Ana Rao', number: 'IN-1042', owedMinor: 64_950, currency: 'USD', dueAt: d('2026-11-01'), daysPast: 30,
    link: null, weeks: [{ person: 'Priya Shah', periodStart: d('2026-10-04'), periodEnd: d('2026-10-10'), hours: 40, signedAt: d('2026-10-13') }], lettersSentOn: [d('2026-11-10'), d('2026-11-17'), d('2026-11-24')] }
  it('the final notice plan sends nothing, is never sent again and closes when a person has decided', () => {
    expect(PROPOSED_FINAL_NOTICE_PLAN.sendsNothing).toBe(true)
    expect(PROPOSED_FINAL_NOTICE_PLAN.messages).toEqual([])
    expect(PROPOSED_FINAL_NOTICE_PLAN.retries).toBe(0)
  })
  it('the final notice card names the customer, the bill, the amount owed, the days past due and the letters already sent', () => {
    const q = finalNoticeQuestion(f)
    expect(q).toMatch(/Northbend Athletic still owes \$649\.50 on bill IN-1042, due Nov 1, 2026, 30 days past it/)
    expect(q).toMatch(/3 letters were sent, on Nov 10, Nov 17 and Nov 24/)
  })
  it('the final notice card says a person sends this and Etyme sent nothing', () => {
    expect(finalNoticeQuestion(f)).toContain('A person sends this; Etyme sent nothing.')
  })
  it('the final notice letter carries the signed weeks and the dates of the earlier letters', () => {
    const l = finalNoticeLetter(f)
    expect(l.subject).toBe('Final notice: bill IN-1042, $649.50 owed')
    expect(l.text).toMatch(/Priya Shah, Oct 4 to Oct 10: 40 hours, signed Oct 13, 2026/)
    expect(l.text).toMatch(/We wrote on Nov 10, Nov 17 and Nov 24/)
    expect(l.text).toMatch(/reply to this letter and tell us which/)
  })
  it('the final notice letter carries the bill link when it has one, and never invents one', () => {
    expect(finalNoticeLetter({ ...f, link: 'https://x.example/answer/bill/T' }).text).toContain('https://x.example/answer/bill/T')
    expect(finalNoticeLetter(f).text).not.toContain('http')
  })
  it('the final notice letter and card carry no fee, interest, deadline, threat or word about anyone\u2019s pay', () => {
    const all = `${finalNoticeQuestion(f)}\n${finalNoticeLetter(f).subject}\n${finalNoticeLetter(f).text}`.toLowerCase()
    for (const w of ['fee', 'interest', 'deadline', 'within', 'legal', 'lawyer', 'attorney', 'collections', 'sue', 'consequence', 'payroll', 'wage', 'salary', 'write-off', 'write off', 'hold']) expect(all).not.toContain(w)
    expect(all).not.toMatch(/\bby (nov|dec|jan|monday|friday|\d)/)
  })
  it('the final notice template is its own name, never the chase template', () => {
    expect(FINAL_NOTICE_TEMPLATE).toBe('money-owed-final-notice')
  })
})
