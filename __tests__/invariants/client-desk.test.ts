import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The client dashboard, read from Nike's program desk: five contractors
 * for three people, $972.80 a month, seven roles waiting when two were
 * open, and "Nothing needs you" over six weeks of unsigned hours. Each
 * was a real number computed the wrong way round.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('what the client desk is told', () => {
  const decisions = read('src/app/api/decisions/route.ts')
  const program = read('src/app/api/program/route.ts')
  const page = read('src/app/dashboard/program/page.tsx')

  it('a submitted week reaches the client desk that signs it, not only the supplier that pays for it', () => {
    expect(decisions).toContain('{ sellContract: endClientFilter(companyId), clientApprovedAt: null }')
    expect(decisions).toContain('{ sellContract: { companyId }, employerAcceptedAt: null }')
  })

  it("a client sees the hours on a sheet, never the rate its supplier's supplier charges", () => {
    expect(decisions).toContain('const amount = !asClient || sc.clientCompanyId === companyId')
    expect(decisions).toContain('`${ts.totalHours}h · through ${supplier} · ${period}`')
    expect(decisions).toContain('const supplier = paidSupplier.get(ts.personId) ?? sc.company.name')
  })

  it('the dashboard counts the contracts the client pays — the top of every chain — and only people working now', () => {
    expect(program).toContain('const contracts = chainTop(everyRung)')
    expect(program).toContain("const onSite = contracts.filter((c) => c.state === 'IN_PROGRESS')")
    expect(program).toContain('activeContractors: new Set(onSite.map((c) => c.personId)).size')
  })

  it('monthly spend is in cents like every other figure, so the page formats it once', () => {
    expect(program).toContain('onSite.reduce((sum, c) => sum + (c.billRate ?? 0) * 160, 0)')
    expect(program).not.toContain('/ 100, // cents to dollars')
    expect(page).toContain('compact(s.monthlySpend)')
  })

  it('a week the client has signed leaves the client’s approvals; it is the employer’s to accept now', () => {
    expect(program).toMatch(/status: 'SUBMITTED',\s*clientApprovedAt: null,/)
    expect(page).toContain('approvalQueue: cur.approvalQueue.filter((a) => a.id !== d.entityId)')
  })

  it('when nothing is on this desk but work is waiting at another, the page says whose', () => {
    expect(page).toContain('waiting on the hiring managers who own them')
  })

  it('the headline is a sentence about the reader, not a label', () => {
    expect(page).toContain("'Nothing needs you today.'")
    expect(page).toMatch(/need\{queue\.length === 1 \? 's' : ''\} you\./)
  })
})
