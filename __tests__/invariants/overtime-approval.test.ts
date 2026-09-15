import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The desk where overtime is decided, checked where it is wired.
 *
 * The arithmetic is proven in `overtime.test.ts` and `time-off.test.ts`.
 * What those cannot prove is the ordering inside the route, and the
 * ordering is where this feature would quietly fail: a signature written
 * before the question is asked, a balance read before the row is locked,
 * a decision written in its own transaction and orphaned by a rollback.
 *
 * Reading the route's source is a poor substitute for running it against
 * a database, and it is a great deal better than not checking at all.
 * The integration walk lives in `__integration__` and needs Postgres;
 * these four sentences hold on every commit.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const APPROVE = read('src/app/api/timesheets/[id]/approve/route.ts')

/** Where a fragment first appears, so "before" is a number and not a feeling. */
const at = (needle: string) => {
  const i = APPROVE.indexOf(needle)
  expect(i, `the approval route no longer contains ${needle}`).toBeGreaterThan(-1)
  return i
}

describe('a week over the threshold cannot be approved until somebody says what happens to the overtime', () => {
  it('the refusal is returned before any signature is written', () => {
    expect(at("code: 'OVERTIME_UNDECIDED'")).toBeLessThan(at('workAssertion.create'))
    expect(at("code: 'OVERTIME_UNDECIDED'")).toBeLessThan(at('prisma.$transaction'))
  })

  it('the refusal carries the sentence and the weeks, so the screen can ask rather than only report', () => {
    expect(APPROVE).toContain('saysAwaiting(')
    expect(APPROVE).toContain('weeks: unanswered.map(')
  })
})

describe('the decision is written at approval and nowhere else', () => {
  it('the decision and the signature are written in one transaction, so neither can land alone', () => {
    const tx = at('prisma.$transaction')
    expect(APPROVE.indexOf('overtimeDecision.upsert')).toBeGreaterThan(tx)
    expect(APPROVE.indexOf('tx.timesheet.update')).toBeGreaterThan(tx)
  })

  it('no other route in the app writes an overtime decision', () => {
    // A second writer is how a decision appears with nobody's signature
    // behind it. If one is ever needed, it goes through this route.
    const others = [
      'src/app/api/timesheets/route.ts',
      'src/app/api/program/budget/route.ts',
    ].filter((f) => read(f).includes('overtimeDecision.create') || read(f).includes('overtimeDecision.upsert'))
    expect(others).toEqual([])
  })
})

describe('a drawn balance never goes negative', () => {
  it('the person’s rows are locked before the balance is read, not after', () => {
    expect(at('FOR UPDATE')).toBeLessThan(at('tx.timeOffEntry.findMany'))
  })

  it('the refusal names the hours rather than a code, and rolls the whole approval back', () => {
    expect(APPROVE).toContain('throw new Refusal(draw.says)')
    expect(APPROVE).toContain('err instanceof Refusal')
  })

  it('a decision banks its hours once, however many times approval runs', () => {
    // Keyed on the decision, which is unique on the entry.
    expect(APPROVE).toContain('where: { decisionId: row.id }')
  })
})

describe('what the invoice is told', () => {
  it('the sheet’s value is priced from the decisions, never from the contract multiplier', () => {
    // At the rate of the leg that was answered — which on a direct
    // placement is the contract the hours are filed against, and in a
    // chain is the answering firm's own.
    expect(APPROVE).toContain('valueOf(finalSplit, deciding.billRate)')
    expect(APPROVE).toContain('const billAmount = value.totalCents / 100')
    // The old line, which multiplied every hour by the rate whatever
    // anybody had decided about the week.
    expect(APPROVE).not.toContain('hours * timesheet.sellContract.billRate / 100')
  })

  it('the prior answer goes on the event, so a decision cannot be changed without trace', () => {
    expect(APPROVE).toContain('replaced: w.priorWas')
  })
})

describe('in a chain, nobody decides their own leg', () => {
  it('the decision is written against the leg the approver buys on, never the leg the hours are filed against', () => {
    expect(APPROVE).toContain('sellContractId: leg.sellContractId,')
    // The old line, which put every answer — the client's included — on
    // the contract the person's employer files hours against.
    expect(APPROVE).not.toContain('sellContractId: timesheet.sellContractId,\n            weekOf:')
    expect(at('decidingLeg(')).toBeLessThan(at('overtimeDecision.upsert'))
  })

  it('the threshold and the rate come from the leg being answered, so nobody is quoted a rate they are not a party to', () => {
    expect(APPROVE).toContain('const policy = policyOf(deciding)')
    expect(APPROVE).toContain('valueOf(finalSplit, deciding.billRate)')
    expect(APPROVE).toContain('rateCents: deciding.billRate,')
    expect(APPROVE).not.toContain('policyOf(timesheet.sellContract)')
  })

  it('what was already answered is read from this leg alone, never from the one underneath it', () => {
    expect(APPROVE).toContain(
      'const ownLeg = timesheet.overtimeDecisions.filter((d) => d.sellContractId === leg.sellContractId)'
    )
    expect(APPROVE).toContain('const prior = ownLeg.find(')
  })

  it('whether the caller may answer is asked about their own leg, not about somebody else’s', () => {
    expect(APPROVE).toContain('employerCompanyId: deciding.companyId,')
    expect(APPROVE).toContain('clientCompanyId: deciding.clientCompanyId,')
  })

  it('only the leg the hours are filed on can put an hour into the consultant’s bank', () => {
    // Two firms in a chain both answering "bank it" would otherwise owe
    // the consultant ten hours for five worked.
    expect(APPROVE).toContain('const banking = leg.onHoursLeg ? writing : []')
    expect(APPROVE).toContain('const hoursBanked = leg.onHoursLeg')
  })

  it('a row carrying a figure is filed under a company entitled to read it', () => {
    expect(APPROVE).toContain(
      'const moneyCompanyId = leg.onHoursLeg ? timesheet.sellContract.companyId : caller.company!.id'
    )
    expect(APPROVE).toContain('companyId: moneyCompanyId,')
  })

  it('a direct placement asks the database nothing extra, because the walk stops where nobody bought', () => {
    // One query for the rung above, which returns nothing, and the walk
    // ends. The ordinary case stays the ordinary case.
    expect(APPROVE).toContain('if (wanted.length === 0) break')
    expect(APPROVE).toContain('for (let depth = 0; depth < 8 && frontier.length > 0; depth++)')
  })
})
