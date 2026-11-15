import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { approvalWords, NO_TEAM_RULES, type ApprovalCount } from '@/app/api/settings/approval-words'
import { evaluateRequisition, type RequisitionFacts, type ApprovalRuleFacts } from '@/lib/requisition-approval'
import { noCalendarSays } from '@/app/api/settings/no-calendar'
import { NOTHING_CHANGED, CHOOSE_A_SUNDAY } from '@/components/settings/panel-bits'
import { FIRST_PAY_DAY_ID } from '@/components/settings/payroll-panel'
import { FIRST_DAY_HREF } from '@/lib/money/pay-periods'

/**
 * The fix list of 2026-11-14, E4 and the Settings half of E5.
 *
 * E4: Approvals said every job request clears; Cost centers said every
 * job request is routed for approval. Both now come from one count, and
 * each sentence is checked here against the engine that decides
 * (`evaluateRequisition`, read only), for a firm with no rules and no cost
 * centers, with rules and none, and with both.
 *
 * E5: the first-pay-day box has one address, and a greyed Save says why.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const settings = read('src/app/dashboard/settings/page.tsx')
const panel = read('src/components/settings/payroll-panel.tsx')
const week = read('src/components/settings/week-panel.tsx')
const rulesRoute = read('src/app/api/settings/approval-rules/route.ts')
const settingsRoute = read('src/app/api/settings/route.ts')
const requisitionsRoute = read('src/app/api/requisitions/route.ts')
const words = read('src/app/api/settings/approval-words.ts')

// Rules are company-wide unless the case says how many are scoped to one department.
const count = (c: Partial<ApprovalCount>): ApprovalCount => {
  const rules = c.rules ?? 0
  const scoped = c.scoped ?? 0
  return { rules, companyWide: rules - scoped, everything: 0, contacts: 0, scoped, costCenters: 0, ownedCostCenters: 0, ...c }
}
const job = (f: Partial<RequisitionFacts> = {}): RequisitionFacts => ({
  annualValueCents: 120_000_00, headcount: 1, billMaxCents: null, skillMedianCents: null, costCenter: null, months: 12, raisedById: 'p-raiser', ...f,
})
const EVERYTHING: ApprovalRuleFacts = { id: 'r-all', name: 'Program manager', approverId: 'p-pm', approverName: 'Dana Whitfield', thresholdCents: null, rank: 1, kind: 'VALUE' }
const ABOVE_200K: ApprovalRuleFacts = { id: 'r-200', name: 'Above $200,000', approverId: 'p-fin', approverName: 'Ngozi Okoro', thresholdCents: 200_000_00, rank: 1, kind: 'VALUE' }
const OWNED_CC = { id: 'cc-1', code: 'NW-4100', approvedHeads: null, committedHeads: 0, annualBudgetCents: null, committedSpendCents: 0 }

describe('Approvals and Cost centers say one thing, from one count', () => {
  it('a firm with no approval rules and no cost centers clears a job request by itself with a note, and both tabs say so', () => {
    const d = evaluateRequisition(job(), [])
    expect(d.state).toBe('AUTO_APPROVED')
    expect(d.summary).toMatch(/^Cleared automatically — Nobody is named/)
    const w = approvalWords(count({}))
    expect(w.approvals).toBe('No approval rules. A job request with no cost center clears by itself, with a note on it, because no approval rule names a person to ask.')
    expect(w.costCenters).toBe('None yet. A job request with no cost center clears by itself, with a note on it, because no approval rule names a person to ask.')
  })

  it('the Cost centers page never says every job request is routed for approval when no rule names anybody', () => {
    for (const c of [count({}), count({ rules: 1 }), count({ costCenters: 2 })]) {
      expect(approvalWords(c).costCenters).not.toMatch(/routed for approval|routes everything/)
    }
    expect(settings).not.toContain('Every job request will be routed for approval')
    expect(settings).not.toContain('which is why a company with none routes everything to a human')
  })

  it('a firm with one rule that applies to everything and no cost centers sends the job request to that rule’s person, and both tabs say so', () => {
    const d = evaluateRequisition(job(), [EVERYTHING])
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.route.map((r) => r.approverName)).toEqual(['Dana Whitfield'])
    const w = approvalWords(count({ rules: 1, everything: 1 }))
    expect(w.approvals).toBe('One rule. A job request waits for a person when it matches one. A job request with no cost center goes to the person your approval rules name.')
    expect(w.costCenters).toBe('None yet. A job request with no cost center goes to the person your approval rules name.')
  })

  it('a firm with only a value rule and no cost centers asks that person above the value and clears below it with a note, and both tabs say so', () => {
    expect(evaluateRequisition(job({ annualValueCents: 250_000_00 }), [ABOVE_200K]).route.map((r) => r.approverName)).toEqual(['Ngozi Okoro'])
    expect(evaluateRequisition(job({ annualValueCents: 120_000_00 }), [ABOVE_200K]).state).toBe('AUTO_APPROVED')
    const said = 'A job request with no cost center goes to a person only when its value is above one of your approval rules. Otherwise it clears by itself, with a note on it.'
    expect(approvalWords(count({ rules: 1 })).approvals).toContain(said)
    expect(approvalWords(count({ rules: 1 })).costCenters).toBe(`None yet. ${said}`)
  })

  it('a firm with rules and a cost center that has an owner sends a job request charged to it that needs a yes to that owner, and both tabs say so', () => {
    const d = evaluateRequisition(job({ costCenter: OWNED_CC, lead: { personId: 'p-owner', name: 'Imani Osei' } }), [ABOVE_200K])
    expect(d.state).toBe('PENDING_APPROVAL')
    expect(d.route.map((r) => r.approverName)).toContain('Imani Osei')
    const w = approvalWords(count({ rules: 1, costCenters: 1, ownedCostCenters: 1 }))
    const owners = 'A job request charged to a cost center with an owner goes to that owner when it needs a yes.'
    expect(w.approvals).toContain(owners)
    expect(w.costCenters).toContain(owners)
    expect(w.costCenters).not.toContain('None yet.')
  })

  it('Approvals and Cost centers give the same answer for the same firm, because both routes read one count', () => {
    for (const c of [count({}), count({ rules: 2, everything: 1 }), count({ rules: 1 }), count({ contacts: 1, rules: 1 }), count({ costCenters: 3, ownedCostCenters: 1 })]) {
      const w = approvalWords(c)
      const shared = w.costCenters.replace(/^None yet\. /, '')
      expect(w.approvals.endsWith(shared)).toBe(true)
    }
    expect(rulesRoute).toContain('summary: approvalWords(await readApprovalCount(companyId)).approvals')
    expect(settingsRoute).toContain('approvalWords: approvalWords(await readApprovalCount(companyId))')
  })

  it('a firm whose only rule applies to everything but is set for one department clears a job request with no cost center by itself, and both tabs say so', () => {
    // The requisitions route loads only company-wide rules for a job naming no team, so the engine sees none.
    expect(evaluateRequisition(job(), []).state).toBe('AUTO_APPROVED')
    const w = approvalWords(count({ rules: 1, scoped: 1 }))
    const clears = 'A job request with no cost center clears by itself, with a note on it, because no rule for the whole company names a person to ask.'
    const scoped = 'One rule is set for one department. It applies only to job requests for that department.'
    expect(w.approvals).toBe(`One rule. A job request waits for a person when it matches one. ${clears} ${scoped}`)
    expect(w.costCenters).toBe(`None yet. ${clears} ${scoped}`)
    expect(w.approvals).not.toContain('goes to the person your approval rules name')
  })

  it('an HR or Procurement contact set for one department does not make a job request with no cost center wait, and both tabs say so', () => {
    const w = approvalWords(count({ rules: 2, scoped: 2 }))
    expect(w.costCenters).toContain('clears by itself')
    expect(w.costCenters).toContain('2 rules are set for one department each. Each applies only to job requests for its department.')
  })

  it('a company-wide rule that applies to everything still sends a job request to its person when another rule is set for one department', () => {
    expect(evaluateRequisition(job(), [EVERYTHING]).state).toBe('PENDING_APPROVAL')
    const w = approvalWords(count({ rules: 2, scoped: 1, everything: 1 }))
    expect(w.costCenters).toBe('None yet. A job request with no cost center goes to the person your approval rules name. One rule is set for one department. It applies only to job requests for that department.')
  })

  it('the count and the requisitions route read one filter for a job request that names no team', () => {
    expect(NO_TEAM_RULES).toEqual({ orgUnitId: null })
    // The route's company-wide branch, and the count's three company-wide reads.
    expect(requisitionsRoute).toMatch(/OR: \[\s*\/\/ Company-wide: the central functions\.\s*\{ orgUnitId: null \},/)
    expect(words.match(/\.\.\.NO_TEAM_RULES/g)?.length).toBe(3)
  })

  it('the Approvals page says its no-rules sentence once, and each tab links to the other', () => {
    expect(settings).not.toContain('No rules. Every job request clears without approval.')
    expect(settings).toContain('<TabLink to="Cost centers" openTab={openTab}>See Cost centers</TabLink>')
    expect(settings).toContain('<TabLink to="Approvals" openTab={openTab}>See Approvals</TabLink>')
    // Both tabs are drawn for every kind of firm that reads Settings.
    expect(settings).toContain("TABS.filter((t) => t !== 'Bench pay' || BENCH_KINDS.includes(company.kind))")
  })

  it('the Cost centers subtitle no longer says a bill export posts straight into an accounting system', () => {
    expect(settings).not.toContain('the coded bill export posts straight into it')
    expect(settings).toContain('Use the same code your own accounting system uses.')
  })
})

describe('The first-pay-day box has one address', () => {
  it('the field carries the id the address names, and money’s address is that page and that id', () => {
    expect(FIRST_PAY_DAY_ID).toBe('first-pay-day')
    expect(FIRST_DAY_HREF).toBe('/dashboard/settings?tab=cycles#first-pay-day')
    expect(panel).toContain('id={FIRST_PAY_DAY_ID}')
    expect(read('src/components/ui/form.tsx')).toContain('id: id ?? `${base}-input`')
  })

  it('arriving at the address opens Cycles, scrolls to the box and puts the cursor in it', () => {
    expect(settings).toContain("return TABS.find((t) => t.toLowerCase().replace(/\\s+/g, '-') === want.toLowerCase())")
    expect(panel).toContain("const go = () => { if (window.location.hash === `#${FIRST_PAY_DAY_ID}`) goToFirstPayDay() }")
    expect(panel).toContain("box.scrollIntoView?.({ block: 'center' })")
    expect(panel).toContain('focus?.({ preventScroll: true })')
  })

  it('a greyed Save payroll says why in words, and never suggests a Sunday', () => {
    expect(CHOOSE_A_SUNDAY).toBe('Choose a Sunday to save.')
    expect(NOTHING_CHANGED).toBe('Nothing has changed.')
    expect(panel).toContain('? CHOOSE_A_SUNDAY')
    // Defaults never saved may be saved as they stand (the press walk l2a, 2026-11-15).
    expect(panel).toContain(': !mayPress ? NOTHING_CHANGED : null')
    expect(panel).toContain('<SaveWhy id="payroll-save-why" says={busy ? null : saveWhy} />')
    expect(panel).not.toMatch(/December (6|13|27)/)
  })

  it('every other greyed Save on the Cycles tab says why too', () => {
    expect(week).toContain('<SaveWhy id="week-save-why" says={!changed && !busy ? NOTHING_CHANGED : null} />')
  })

  it('the no-calendar line about the first Sunday scrolls to the box for a seat that may set it, and names who sets it for any other', () => {
    const base = { companyName: 'Northwind Staffing', fallbackLabel: 'US IT', offer: null, payroll: 'FIRST_DAY_NEEDED' as const }
    const owner = noCalendarSays({ ...base, canEdit: true })
    expect(owner.firstDayAt).not.toBeNull()
    expect(owner.says[owner.firstDayAt!]).toMatch(/cannot be recorded by hand until/)
    const hr = noCalendarSays({ ...base, canEdit: false })
    expect(hr.firstDayAt).toBeNull()
    expect(hr.says.join(' ')).toContain('The Owner or an Admin sets it in the Payroll box below.')
    expect(noCalendarSays({ ...base, payroll: 'NONE', canEdit: true }).firstDayAt).toBeNull()
    expect(settings).toContain('{data.noCalendar?.firstDayAt === i && (')
    expect(settings).toContain("goToFirstPayDay() }}")
  })
})
