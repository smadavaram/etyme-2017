import { describe, it, expect } from 'vitest'
import {
  planFor, mayReverse, logLine, afterReversal, stageOf, type Sheet,
} from '@/lib/timesheet-reversal'

/**
 * Hours get approved that should not have been. A contractor logs a day
 * on the wrong assignment, a manager approves forty when it was
 * thirty-two, a client signs off a week that was already billed.
 *
 * 2017 did not solve this. retire_on_reject_seq posted a reversal to a
 * Sequence blockchain ledger, its only call site was commented out, and
 * Sequence shut down in 2021. There was nothing to port.
 *
 * The rule: never edit history. A reversal is a new record correcting an
 * old one, and both stay.
 */

const NOW = new Date('2026-08-29T10:00:00Z')

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: 'ts-1',
    personName: 'Rohan Menon',
    totalHours: 40,
    periodLabel: '1–7 August',
    stage: 'SUBMITTED',
    invoiceNumber: null,
    invoicePaid: false,
    payrollExportedAt: null,
    ...over,
  }
}

describe('the same mistake at each stage', () => {
  it('just reopens one nobody has signed', () => {
    const p = planFor(sheet())
    expect(p.remedy).toBe('REOPEN')
    expect(p.immediate).toBe(true)
    expect(p.says).toBe('Nobody has signed this yet. Reopening it costs nothing.')
  })

  it('takes the signature off one approved but not billed', () => {
    const p = planFor(sheet({ stage: 'CLIENT_APPROVED' }))
    expect(p.remedy).toBe('WITHDRAW_APPROVAL')
    expect(p.immediate).toBe(true)
    expect(p.says).toMatch(/nothing has left the building/)
  })

  it('will not change one that is on an invoice already sent', () => {
    // A timesheet cannot change underneath a document somebody has read.
    const p = planFor(sheet({ stage: 'INVOICED', invoiceNumber: 'INV-2026-014' }))
    expect(p.remedy).toBe('CREDIT_NOTE')
    expect(p.immediate).toBe(false)
    expect(p.steps[0]).toBe('Raise a credit note against INV-2026-014.')
    expect(p.says).toMatch(/it needs a credit note first/)
  })

  it('calls a paid one a conversation, not a button', () => {
    const p = planFor(sheet({ stage: 'PAID', invoiceNumber: 'INV-2026-014', invoicePaid: true }))
    expect(p.remedy).toBe('ADJUST_NEXT_CYCLE')
    expect(p.tellThem).toContain('the client')
    expect(p.says).toMatch(/Nothing here can be unwound quietly/)
  })

  it('will not reach into a payroll run', () => {
    const p = planFor(sheet({ stage: 'EXPORTED_TO_PAYROLL', payrollExportedAt: NOW }))
    expect(p.steps[0]).toBe('Check with payroll whether the run has been processed.')
    expect(p.says).toMatch(/this is a phone call first/)
  })
})

describe('what it always insists on', () => {
  it('needs a reason at every stage, without exception', () => {
    for (const stage of ['SUBMITTED', 'CLIENT_APPROVED', 'INVOICED', 'PAID'] as const) {
      expect(planFor(sheet({ stage })).needsReason).toBe(true)
    }
  })

  it('refuses a reversal with no explanation', () => {
    // Somebody will ask in three months, with less context than whoever
    // did it, and "no reason given" is not an answer.
    const v = mayReverse(sheet(), 'oops', true, false)
    expect(v.ok).toBe(false)
    expect(v.says).toMatch(/"no reason given" is not an answer/)
  })

  it('takes it once there is one', () => {
    expect(mayReverse(sheet(), 'Two days were logged against the wrong assignment.', true, false).ok)
      .toBe(true)
  })

  it('refuses somebody who is not party to the contract', () => {
    expect(mayReverse(sheet(), 'A perfectly good reason here.', false, false).ok).toBe(false)
  })

  it('lets only the employer touch hours already in a payroll run', () => {
    const s = sheet({ stage: 'EXPORTED_TO_PAYROLL', payrollExportedAt: NOW })
    expect(mayReverse(s, 'Two days on the wrong assignment.', true, false).says).toBe(
      'These hours are in a payroll run. Only the employer can correct that.'
    )
    expect(mayReverse(s, 'Two days on the wrong assignment.', false, true).ok).toBe(true)
  })
})

describe('what the sheet looks like afterwards', () => {
  it('clears both signatures on a withdrawal', () => {
    const a = afterReversal(sheet(), 'WITHDRAW_APPROVAL')
    expect(a.status).toBe('OPEN')
    expect(a.clearsClientApproval).toBe(true)
    expect(a.clearsEmployerAcceptance).toBe(true)
  })

  it('leaves an invoiced sheet exactly where it is until the credit exists', () => {
    // A timesheet that reopens while its invoice still stands is a
    // reconciliation somebody spends a day on.
    const a = afterReversal(sheet({ stage: 'INVOICED' }), 'CREDIT_NOTE')
    expect(a.status).toBe('HELD')
    expect(a.clearsClientApproval).toBe(false)
  })
})

describe('the line in the log', () => {
  it('reads cold, months later, without opening anything else', () => {
    const line = logLine(
      {
        sheetId: 'ts-1', reason: 'Two days were logged against the wrong assignment.',
        byId: 'u1', at: NOW, remedy: 'CREDIT_NOTE', hoursBefore: 40, hoursAfter: 24,
      },
      sheet({ stage: 'INVOICED', invoiceNumber: 'INV-2026-014' })
    )
    expect(line).toBe(
      'Rohan Menon, 1–7 August: 40 hours corrected to 24. Two days were logged against ' +
      'the wrong assignment. A credit note is needed against INV-2026-014.'
    )
  })

  it('says withdrawn where the new number is not known yet', () => {
    const line = logLine(
      { sheetId: 'ts-1', reason: 'Wrong week.', byId: 'u1', at: NOW, remedy: 'REOPEN', hoursBefore: 40, hoursAfter: null },
      sheet()
    )
    expect(line).toBe('Rohan Menon, 1–7 August: 40 hours withdrawn. Wrong week.')
  })
})

describe('working out how far it got', () => {
  it('reads the stage from what is on the record', () => {
    expect(stageOf({ clientApprovedAt: null, employerAcceptedAt: null, invoiceNumber: null, invoicePaid: false, payrollExportedAt: null })).toBe('SUBMITTED')
    expect(stageOf({ clientApprovedAt: NOW, employerAcceptedAt: null, invoiceNumber: null, invoicePaid: false, payrollExportedAt: null })).toBe('CLIENT_APPROVED')
    expect(stageOf({ clientApprovedAt: NOW, employerAcceptedAt: NOW, invoiceNumber: null, invoicePaid: false, payrollExportedAt: null })).toBe('EMPLOYER_ACCEPTED')
    expect(stageOf({ clientApprovedAt: NOW, employerAcceptedAt: NOW, invoiceNumber: 'INV-1', invoicePaid: false, payrollExportedAt: null })).toBe('INVOICED')
    expect(stageOf({ clientApprovedAt: NOW, employerAcceptedAt: NOW, invoiceNumber: 'INV-1', invoicePaid: true, payrollExportedAt: null })).toBe('PAID')
  })

  it('puts payroll above everything, because that is where a person got money', () => {
    expect(stageOf({ clientApprovedAt: NOW, employerAcceptedAt: NOW, invoiceNumber: 'INV-1', invoicePaid: true, payrollExportedAt: NOW })).toBe('EXPORTED_TO_PAYROLL')
  })
})
