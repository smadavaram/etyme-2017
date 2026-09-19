import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The client dashboard, read from Northbend Athletic's program desk: five contractors
 * for three people, $972.80 a month, seven roles waiting when two were
 * open, and "Nothing needs you" over six weeks of unsigned hours. Each
 * was a real number computed the wrong way round.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('what the client desk is told', () => {
  const decisions = read('src/app/api/decisions/route.ts')
  const program = read('src/app/api/program/route.ts')
  const page = read('src/app/dashboard/program/page.tsx')
  const volume = read('src/lib/demo-volume.ts')
  const seed = read('src/lib/seed-programmes.ts')

  it('a submitted week reaches the client desk that signs it, not only the supplier that pays for it', () => {
    expect(decisions).toContain('{ sellContract: endClientFilter(companyId), clientApprovedAt: null }')
    expect(decisions).toContain('{ sellContract: { companyId }, employerAcceptedAt: null }')
  })

  it("a client sees the hours on a sheet, never the rate its supplier's supplier charges", () => {
    expect(decisions).toContain('`${ts.totalHours}h · through ${supplier} · ${period}`')
  })

  it("and never the name of its supplier's supplier either, which is the same walk for the name", () => {
    // This used to pin `paidSupplier.get(ts.personId) ?? sc.company.name`
    // — a lookup of the firm the client pays, falling back where the walk
    // came back empty to the employer, which is the firm two rungs down
    // printed on its own customer's queue. Found by the sweep in
    // `client-facing-names` on 2026-09-17 and routed through the one rule
    // that decides whose name a client may read.
    expect(decisions).toContain("import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'")
    expect(decisions).toContain("seenNames.get(sc.companyId)?.phrase ?? 'a supplier on this site'")
  })

  it('the queue a client approves from prices a week at the contract that client is billed on', () => {
    // A week is filed against the employer's leg, which in a chain is two
    // firms below the reader. Priced there it was blank for the client
    // and, before that, its supplier's supplier's rate. Walked up, Northbend Athletic
    // reads its own $145.
    expect(decisions).toContain("import { payerRung } from '@/lib/chain-top'")
    expect(decisions).toContain('const filed = rungs.find((r) => r.id === sc.id)')
    expect(decisions).toContain('payerRung(filed, rungs)')
    expect(decisions).toContain('paying && (!asClient || paying.clientCompanyId === companyId)')
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

  it('a week that does not fit its contract is flagged in a sentence before anybody signs it', () => {
    expect(decisions).toContain("import { timesheetFlag, periodWord } from '@/lib/timesheet-flag'")
    expect(decisions).toContain('hoursPerWeek: sc.requirement?.hoursPerWeek ?? null')
    expect(decisions).toMatch(/actionUrl: '\/dashboard\/timesheets',\s*amount,\s*flag,/)
  })

  it('the headline counts exceptions; a flagged week is approved anyway only with a reason, and the reason goes on the signature', () => {
    expect(page).toContain("const exceptions = queue.filter((d) => d.flag || d.type === 'BILL_DISPUTED').length")
    expect(page).toContain("{exceptions === 1 ? 'has an exception' : 'have exceptions'}")
    expect(page).toContain('Approve anyway')
    expect(page).toContain("if (reason.trim()) { onApprove(d, reason.trim()); setReasonFor(null) }")
    expect(page).toContain('body: JSON.stringify(note ? { note } : {})')
  })

  it('a clear desk is not an empty page: what was done today is listed under the queue', () => {
    expect(program).toContain("what: 'Hours signed'")
    expect(program).toContain("what: 'Awarded'")
    expect(page).toContain("'Queue clear. Everything below was done today.'")
  })

  it('somebody starting soon shows the paperwork verdict a week early, in the words activation would use', () => {
    expect(program).toContain("contracts.filter((c) => c.state !== 'IN_PROGRESS').slice(0, 5)")
    expect(program).toContain('paperwork: { outcome: papers.outcome, says: papers.says, fix: papers.fix }')
    expect(page).toContain("'Paperwork complete. Nothing stops the start.'")
  })

  it('each supplier carries the standing this client gave it, and a published role with nobody in five days says so', () => {
    expect(program).toContain('standing: tierWord(tierOf.get(v.id), agreed.has(v.id))')
    expect(page).toContain("const quiet = r.status === 'OPEN' && r.submissions === 0 && r.openDays >= 5")
    expect(page).toContain('Widen the release or ask the suppliers.')
  })

  it('a client with nothing on it yet is told what to do first, not shown six zeros', () => {
    expect(page).toContain('Nothing here yet.')
    expect(page).toContain('Post a requirement')
  })

  it("a demo client's book is mostly history — a few dozen open, not a hundred and forty", () => {
    expect(volume).toContain("? [['OPEN', 12], ['FILLED', 48], ['CLOSED', 22], ['CANCELLED', 10], ['DRAFT', 8]]")
  })

  it('the seeded Northbend Athletic desk has one week claimed over the role, so there is an exception to read', () => {
    expect(seed).toContain("rates: [9800, 7400], exceptionHours: 44,")
    expect(seed).toContain('const longHours = awaiting && w === 1 ? pl.exceptionHours ?? null : null')
    // The hours reach the days, not only the total: a sheet that says
    // 44 over five eight-hour days is a figure with nothing behind it.
    expect(seed).toContain('const { start: ws, end: we, days } = week(w, longHours ?? 40)')
    expect(seed).toContain('totalHours: longHours ?? 40,')
  })
})
