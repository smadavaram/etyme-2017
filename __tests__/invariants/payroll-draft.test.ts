import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftRows, draftHash, peopleIn, grossSays, cardQuestion, cardProof, DRAFT_LABEL, type RunDetail } from '@/lib/money/payroll-draft'

const detail = (o: Partial<RunDetail> = {}): RunDetail => ({
  buyContractId: 'b1', buyContractCandidateId: 'c1', personName: 'Leila Farouk', totalHours: 160, grossPay: 1_056_000, currency: 'USD', ...o,
})
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('what a payroll draft keeps of the run’s own calculation', () => {
  it('a payroll draft is built from accepted weeks by the same computation the run uses: it keeps the run’s own figures and works none out', () => {
    const rows = draftRows([detail()])
    expect(rows).toEqual([{ buyContractId: 'b1', buyContractCandidateId: 'c1', person: 'Leila Farouk', hours: 160, grossPay: 1_056_000, currency: 'USD', overtimeHours: 0, held: [] }])
    const agent = src('src/lib/agents/payroll-draft.ts')
    expect(agent).toContain("from '@/lib/money/payroll-run'")
    expect(agent).toMatch(/action: 'calculate'[\s\S]*?dryRun: true/)
    // The draft file does no pay arithmetic of its own.
    expect(src('src/lib/money/payroll-draft.ts')).not.toMatch(/payRate|rateCents|Math\.(round|floor|ceil)|\* ?100/)
  })
  it('the payroll run’s route and the agent call one function, so a draft and a run cannot be worked out two ways', () => {
    expect(src('src/app/api/payroll/run/route.ts')).toContain("from '@/lib/money/payroll-run'")
    expect(src('src/lib/agents/payroll-draft.ts')).toContain("from '@/lib/money/payroll-run'")
  })
  it('a person with nothing left to pay and nothing held is not on a draft, which is how a period already run reads', () => {
    expect(draftRows([detail({ totalHours: 0, grossPay: 0 })])).toEqual([])
  })
  it('a person with a week held is on the draft with the reason in the run’s own words', () => {
    const rows = draftRows([detail({ totalHours: 0, grossPay: 0, exemptHeld: 'Mo Ito’s week of Oct 5 is held until payroll records whether Mo is exempt.' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].held[0]).toMatch(/held until payroll records/)
  })
  it('the same rows hash the same in any order, and a changed figure changes the hash', () => {
    const a = draftRows([detail(), detail({ buyContractCandidateId: 'c2', personName: 'Mo Ito' })])
    const b = draftRows([detail({ buyContractCandidateId: 'c2', personName: 'Mo Ito' }), detail()])
    expect(draftHash(a)).toBe(draftHash(b))
    expect(draftHash(draftRows([detail({ grossPay: 1_056_001 })]))).not.toBe(draftHash(draftRows([detail()])))
  })
  it('two currencies are never added into one total gross', () => {
    const rows = draftRows([detail(), detail({ buyContractCandidateId: 'c2', personName: 'Asha Rao', grossPay: 500_000, currency: 'INR' })])
    expect(grossSays(rows)).toMatch(/5,000\.00.*\$10,560\.00|\$10,560\.00.*5,000\.00/)
    expect(grossSays(rows)).not.toBe('$15,560.00')
  })
})

describe('the card the draft puts on the decision queue', () => {
  const rows = draftRows([detail(), detail({ buyContractCandidateId: 'c2', personName: 'Mo Ito', totalHours: 0, grossPay: 0, exemptHeld: 'held' })])
  it('the draft’s card names the period and the people, and sends the reader to Payroll', () => {
    expect(peopleIn(rows)).toBe(2)
    expect(cardQuestion('October 2026', rows)).toBe('Payroll draft for October 2026 is ready: 2 people. Review and run it in Payroll.')
    expect(cardQuestion('October 2026', rows.slice(0, 1))).toBe('Payroll draft for October 2026 is ready: 1 person. Review and run it in Payroll.')
  })
  it('the draft’s card carries the total gross in its proof, labeled a draft that is not run, and says what a changed draft replaces', () => {
    const proof = cardProof('October 2026', rows, false)
    expect(proof).toContain(DRAFT_LABEL)
    expect(proof).toMatch(/October 2026: 2 people, total gross \$10,560\.00/)
    expect(proof).toMatch(/1 person has a week held off/)
    expect(proof).not.toMatch(/replaces/)
    expect(cardProof('October 2026', rows, true)).toMatch(/replaces an earlier draft/)
  })
})

describe('what the payroll agent is built never to do', () => {
  const agent = src('src/lib/agents/payroll-draft.ts')
  it('the payroll agent never runs or releases payroll: it asks for a calculation only and writes no run, no pay day and no payment', () => {
    expect(agent).not.toMatch(/action: '(approve|process)'/)
    expect(agent).not.toMatch(/automationLog|\.cycle\.|\.payment\.|paymentRun|needsVerifiedOwnerAt|payroll\.run/)
    expect(agent).not.toMatch(/mail-door|sendMail|proposeTask|mayAgentSend/)
  })
  it('the run’s own function refuses a dry run that is not a calculation, and writes nothing in a dry run', () => {
    const run = src('src/lib/money/payroll-run.ts')
    expect(run).toContain("if (dryRun && action !== 'calculate')")
    expect(run).toContain('!dryRun && windows.length > 0')
    expect(run).toMatch(/if \(!dryRun\) \{\s+await tx\.automationLog\.create/)
  })
  it('the payroll screen shows the draft, labeled, from a route that needs the right to read payroll', () => {
    expect(src('src/app/dashboard/payroll/page.tsx')).toContain('<PayrollDrafts />')
    expect(src('src/app/dashboard/payroll/payroll-drafts.tsx')).toContain('/api/payroll/drafts')
    const route = src('src/app/api/payroll/drafts/route.ts')
    expect(route).toContain("'payroll.read'")
    expect(route).toContain('DRAFT_LABEL')
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/)
  })
})
