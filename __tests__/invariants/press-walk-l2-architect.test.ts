import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_PAY_RHYTHM, payrollLineSays, type PayRhythm } from '@/lib/pay-dates'
import { reversibleHere, readRow, undoneElsewhere } from '@/lib/autonomy'
import { ruleRowSays, NOT_A_CLIENT_RULES } from '@/app/api/settings/approval-words'
import { workEndsAt, addressCell, ON_ETYME_NO_PAGE } from '@/lib/counterparty'
import { afterClientSays, approvalWords, signaturesSeen, type Reader, type SignatureRow, type WeekChain } from '@/lib/week-approval'
import { teamsLinkAsk, TEAMS_LINK_ASK, TEAMS_LINK_WHERE } from '@/lib/team-structure/directory/words'

/**
 * The press walk of a small staffing firm's money chain, 2026-11-15
 * (walkers l2a and l2b), the faults in etyme-architect's files. Sentences
 * that were not true, presses that did nothing, blocks with no link.
 * No figure, rate or date rule moved.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/

describe('Settings > Cycles, payroll with no Sunday set', () => {
  const noSunday: PayRhythm = { ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payFirstPeriodStart: null }

  it('with no Sunday set, the line under the payroll choices says the rule in words and never a date, so no Sunday is suggested', () => {
    for (const today of [new Date('2026-11-15T12:00:00Z'), new Date('2027-03-03T12:00:00Z')]) {
      const said = payrollLineSays(noSunday, today)
      expect(said).toBe('Pay is worked out 4 days after a period ends and paid 6 days after a period ends.')
      expect(said).not.toMatch(MONTHS)
    }
    expect(payrollLineSays({ ...noSunday, payPeriod: 'WEEKLY', payCalcOffsetDays: 0, payDayOffsetDays: 1 }, new Date('2026-11-15T12:00:00Z')))
      .toBe('Pay is worked out the day a period ends and paid 1 day after a period ends.')
  })

  it('payroll defaults never saved can be saved as they stand, so every other week is saved with nothing else changed', () => {
    const panel = src('src/components/settings/payroll-panel.tsx')
    expect(panel).toContain('const mayPress = (changed || neverSaved) && firstCheck.ok')
    expect(panel).toContain('disabled={!mayPress}')
    expect(panel).not.toContain('disabled={!changed || !firstCheck.ok}')
  })

  it('the Cycles subtitle says when bills can be raised, never when bills generate', () => {
    const page = src('src/app/dashboard/settings/page.tsx')
    expect(page).toContain('when bills can be raised')
    expect(page).not.toContain('when bills generate')
  })
})

describe('Settings > Activity log, an extension of a company', () => {
  it('an extension or a removal of a position is never offered for undo on the activity log, old rows written reversible included', () => {
    for (const action of ['COMPANY_EXTENDED', 'COMPANY_POSITION_REMOVED']) {
      expect(reversibleHere({ action, reversible: true })).toBe(false)
      expect(undoneElsewhere(action)).not.toBeNull()
    }
    expect(reversibleHere({ action: 'ROLLOFF_CLAIMED', reversible: true })).toBe(true)
  })

  it('the opened row says where the undo is, never "Already undone" for a company whose position did not change', () => {
    expect(readRow({ action: 'COMPANY_EXTENDED', reversible: true, reversedAt: new Date('2026-11-15T10:00:00Z') }).undo)
      .toBe('Undo this from the company’s History on Companies, not from this log.')
    expect(readRow({ action: 'COMPANY_POSITION_REMOVED', reversible: true, reversedAt: null }).undo)
      .toBe('To put this back, extend the company again on Companies.')
  })

  it('the reverse route refuses an act on a company position in that sentence before it marks anything undone', () => {
    const route = src('src/app/api/automation/[id]/reverse/route.ts')
    const refusedAt = route.indexOf('const elsewhere = undoneElsewhere(entry.action)')
    expect(refusedAt).toBeGreaterThan(0)
    expect(refusedAt).toBeLessThan(route.indexOf('data: { reversedAt: now }'))
  })

  it('extending a company and taking a position off are written with an honest reversible flag of false', () => {
    const extend = src('src/app/api/companies/[id]/extend/route.ts')
    expect(extend).toMatch(/action: 'COMPANY_EXTENDED'[\s\S]*?reversible: false/)
    expect(extend).toMatch(/action: 'COMPANY_POSITION_REMOVED'[\s\S]*?reversible: false/)
    expect(extend).not.toMatch(/reversible: true/)
  })

  it('the "can be undone" tile and the Reversible chip read the route’s verdict, which never counts an act undone on Companies', () => {
    const route = src('src/app/api/automation/route.ts')
    expect(route).toContain('reversible: reversibleHere(e),')
    expect(route).toContain("where.AND = [{ action: { notIn: Object.keys(UNDONE_ON_COMPANIES) } }]")
  })

  it('on the activity log a person’s own press never reads "By a rule", and no machine name or raw payload is drawn', () => {
    const page = src('src/app/dashboard/automation/page.tsx')
    expect(page).toContain("{entry.kind !== 'ATTRIBUTED' && (\n                      <Chip title={entry.decidedSays}>")
    expect(page).toContain("if (act.basis === 'RULE' && act.kind !== 'ATTRIBUTED') ruleCount += count")
    expect(page).not.toContain('JSON.stringify(entry.payload')
    expect(page).not.toContain('{entry.action}</p>')
  })
})

describe('Settings > Approvals', () => {
  it('a rule set for one department names its department and its kind, and never reads "applies to everything"', () => {
    const ops = { name: 'Operations' }
    expect(ruleRowSays({ kind: 'HR', thresholdDollars: null, orgUnit: ops })).toBe('HR contact · job requests for Operations only')
    expect(ruleRowSays({ kind: 'PROCUREMENT', thresholdDollars: null, orgUnit: null })).toBe('Procurement contact · job requests for the whole company')
    expect(ruleRowSays({ kind: 'VALUE', thresholdDollars: null, orgUnit: ops })).toBe('every job request for Operations')
    expect(ruleRowSays({ kind: 'VALUE', thresholdDollars: 50000, orgUnit: ops })).toBe('above $50,000 · Operations only')
    expect(ruleRowSays({ kind: 'VALUE', thresholdDollars: null, orgUnit: null })).toBe('applies to everything')
  })

  it('a client seat that may write rules gets one link to Program team, where rules are made, and a supplier is told what its rules apply to', () => {
    const route = src('src/app/api/settings/approval-rules/route.ts')
    expect(route).toContain("addHref: caller!.company!.kind === 'CLIENT' && hasPermission(caller!.permissions, 'governance.write') && mayOpen(RULES_ARE_MADE_AT, caller!.permissions)")
    expect(route).toContain("(caller!.company!.kind === 'CLIENT' ? '' : ` ${NOT_A_CLIENT_RULES}`)")
    expect(NOT_A_CLIENT_RULES.split(/\s+/).length).toBeLessThanOrEqual(25)
    const page = src('src/app/dashboard/settings/page.tsx')
    expect(page).toContain('<Link href={addHref as Route} className="text-etyme-action-press underline">Add or change rules under Program team</Link>')
    expect(page).toContain("{r.says ?? ''}")
  })
})

describe('Companies, an Undo refused while work hangs off the position', () => {
  const none = { orders: 0, lines: 0, bills: 0, signedAgreement: false, submissions: 0, openInvitations: 0, supplierRequests: 0 }

  it('an open job invitation carries a link to Jobs, where the job is cancelled, for a seat that may cancel a job', () => {
    expect(workEndsAt({ ...none, openInvitations: 1 }, ['requirements.write'])).toEqual({
      href: '/dashboard/requisitions', words: 'Open Jobs to cancel the job you sent them',
    })
    expect(workEndsAt({ ...none, openInvitations: 1 }, ['requirements.read'])).toBeNull()
    expect(workEndsAt({ ...none, lines: 2 }, ['*'])).toBeNull()
  })

  it('the link is drawn beside the refusal on the row and in the drawer', () => {
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain('<WorkEndsAt link={pressed.link} />')
    expect(page).toContain('<WorkEndsAt link={r.link} />')
    const route = src('src/app/api/companies/[id]/extend/route.ts')
    expect(route).toContain("verdict.code === 'STILL_IN_USE' ? endsAt(caller, work) : null")
  })

  it('a firm on Etyme with no page of its own reads "On Etyme, no page", never its machine name', () => {
    expect(addressCell({ slug: 'world-demo-firm', onEtyme: true, hasPage: false })).toEqual({ slug: null, note: ON_ETYME_NO_PAGE })
    expect(ON_ETYME_NO_PAGE).toBe('On Etyme, no page')
    expect(addressCell({ slug: 'ferngate', onEtyme: true, hasPage: true })).toEqual({ slug: 'ferngate', note: null })
  })

  it('the company drawer says once that the Kind does not make a company a supplier or customer', () => {
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain("{!read.may.setKind && <p className=\"mt-1 text-[12px] text-etyme-muted\">What kind of company it is.")
  })
})

describe('Integrations', () => {
  it('an Owner or an Admin is never told to ask "your Owner or an Admin"; anybody else is', () => {
    expect(teamsLinkAsk('Owner')).toBe(TEAMS_LINK_WHERE)
    expect(teamsLinkAsk('Admin')).toBe(TEAMS_LINK_WHERE)
    expect(teamsLinkAsk('AP & Payroll')).toBe(TEAMS_LINK_ASK)
    expect(src('src/app/dashboard/integrations/page.tsx')).toContain('teamsLinkAsk(session.roleName)')
  })
})

describe('the week page and the words for an attached approval', () => {
  const L = 'larkspur', F = 'ferngate'
  const direct = {
    ladder: [{ sellContractId: 'line', companyId: F, clientCompanyId: L }],
    employerId: F,
    clientId: L,
    clientName: 'Larkspur Freight',
    names: new Map([[L, 'Larkspur Freight'], [F, 'Ferngate Staffing']]),
    week: { personId: 'amara' },
  } as unknown as WeekChain

  it('on a direct W-2 placement, the week says the firm the client pays accepts it next, never the firms below', () => {
    expect(afterClientSays(direct)).toBe('approved by Larkspur Freight; Ferngate Staffing accepts it next')
    const chain = { ...direct, ladder: [...direct.ladder, { sellContractId: 'below', companyId: 'sub', clientCompanyId: F }] } as WeekChain
    expect(afterClientSays(chain)).toBe('approved by Larkspur Freight; the firms below accept it in turn')
  })

  it('an approval attached as a file reads the record’s words, "Approved by email: <name>, <day> — evidence attached", also where the client is not on Etyme', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    const on = new Date('2026-11-13T12:00:00Z')
    const words = (clientOffPlatform: boolean) => approvalWords({
      approverName: 'Noor Castell', approverEmail: 'noor@larkspur-freight.example', clientName: 'Larkspur Freight',
      clientOffPlatform, on, how: 'EVIDENCE', now,
    })
    expect(words(false)).toBe('Approved by email: Noor Castell, Nov 13 — evidence attached')
    expect(words(true)).toBe('Approved by email: Noor Castell, Nov 13 — evidence attached — Larkspur Freight was not on Etyme')
  })

  it('a signature that came from an attached file reads "evidence attached", never "by email" alone', () => {
    const row = (emailHow: string): SignatureRow => ({
      role: 'CLIENT_APPROVAL', companyId: L, at: new Date('2026-11-13T12:00:00Z'), byName: null, auto: false,
      note: null, emailApprover: 'Noor Castell', emailHow,
    })
    const reader: Reader = { personId: 'ap', personName: 'Reader', companyId: F, permissions: [] } as Reader
    const now = new Date('2026-11-15T12:00:00Z')
    expect(signaturesSeen(reader, direct, [row('EVIDENCE')], now).shown[0].says).toBe('Approved by Noor Castell, Larkspur Freight, Nov 13 — evidence attached')
    expect(signaturesSeen(reader, direct, [row('LINK')], now).shown[0].says).toBe('Approved by Noor Castell, Larkspur Freight, Nov 13 — by email')
  })

  it('the attach form offers the contacts recorded at the client as a pick that fills the approver’s name and email, and typing stays open', () => {
    const page = src('src/app/dashboard/weeks/[id]/page.tsx')
    expect(page).toContain('if (c) setForm({ ...form, approverName: c.name, approverEmail: c.email })')
    expect(page).toContain('<option value="">Pick from your contacts, or type below</option>')
    expect(page).toContain('placeholder={`Approver at ${w.clientName}`}')
    expect(src('src/lib/week-approval.ts')).toContain("contacts: who.as !== 'WORKER' && r.companyId")
  })

  it('after an approval is attached, the bill line reads the week again without a reload', () => {
    const page = src('src/app/dashboard/weeks/[id]/page.tsx')
    expect(page).toContain('<BillThisWeek key={billRead} timesheetId={id} />')
    expect(page).toContain('setBillRead((n) => n + 1)')
  })
})
