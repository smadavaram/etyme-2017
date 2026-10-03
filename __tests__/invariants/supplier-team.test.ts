import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rolesFor, RENAMED_ROLES } from '@/lib/company-defaults'

/**
 * "Can Brightmoor add or onboard their team — account managers, HR,
 * recruiters, contract managers, finance — so it is easy to
 * coordinate?" Yes: the roles in the trade's words, an invitation by
 * email that seats them before they arrive, and the client's Contacts
 * page filling with the people who work its account.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const supplier = rolesFor('VENDOR')
const role = (n: string) => supplier.find((r) => r.name === n)!

describe('a staffing firm’s team, in its own words', () => {
  it('offers Owner, Admin, Recruiter, Resource Manager, Account Manager, HR, Contract Manager, Accounts Receivable, AP & Payroll, Finance and Compliance Officer', () => {
    expect(supplier.map((r) => r.name)).toEqual(['Owner', 'Admin', 'Recruiter', 'Resource Manager', 'Account Manager', 'HR', 'Contract Manager', 'Accounts Receivable', 'AP & Payroll', 'Finance', 'Compliance Officer'])
  })
  it('Accounts Receivable bills the client and records what came in, and never accepts hours for pay or runs payroll', () => {
    const p = role('Accounts Receivable').permissions
    expect(p).toContain('invoices.issue'); expect(p).toContain('payments.record'); expect(p).toContain('timesheets.read')
    expect(p).not.toContain('timesheets.approve'); expect(p).not.toContain('payroll.run'); expect(p).not.toContain('pnl.read')
  })
  it('AP & Payroll pays the consultant or the sub-vendor — accepts hours, runs payroll, settles bills — and never issues a client invoice', () => {
    const p = role('AP & Payroll').permissions
    expect(p).toContain('timesheets.approve'); expect(p).toContain('payroll.run'); expect(p).toContain('payments.record')
    expect(p).not.toContain('invoices.issue'); expect(p).not.toContain('pnl.read')
  })
  it('Finance is the whole desk at a small firm: both sides and the month-end', () => {
    const p = role('Finance').permissions
    expect(p).toContain('invoices.issue'); expect(p).toContain('payroll.run'); expect(p).toContain('pnl.read')
  })
  it('the account manager sees rates and what was billed, submits people, and never runs payroll or reads P&L', () => {
    const p = role('Account Manager').permissions
    expect(p).toContain('rates.read'); expect(p).toContain('invoices.read'); expect(p).toContain('submissions.create')
    expect(p).not.toContain('payroll.run'); expect(p).not.toContain('pnl.read'); expect(p).not.toContain('consultants.cost')
  })
  it('HR keeps the firm’s own people’s paperwork and sees no money at all', () => {
    const p = role('HR').permissions
    expect(p).toContain('consultants.write'); expect(p).toContain('governance.read')
    expect(p.some((x) => /invoices|payroll|rates|pnl|cost/.test(x))).toBe(false)
  })
  it('the contract manager owns agreements, extensions and rates, and neither submits people nor pays anyone', () => {
    const p = role('Contract Manager').permissions
    expect(p).toContain('assignments.write'); expect(p).toContain('rates.write')
    expect(p).not.toContain('submissions.create'); expect(p).not.toContain('payments.record')
  })
  it('Accountant is called Finance now, and a firm that already had an Accountant keeps the seat under the new name', () => {
    expect(RENAMED_ROLES['Accountant']).toBe('Finance')
    expect(role('Finance').permissions).toContain('payments.record')
    expect(read('src/lib/company-roles.ts')).toContain("prisma.role.updateMany({ where: { companyId, name: was }, data: { name: now } })")
  })
  it('a company formed before a role existed gets it the next time somebody opens Users & permissions', () => {
    expect(read('src/app/api/roles/route.ts')).toContain('await ensureDefaultRoles(caller.company.id, caller.company.kind)')
    expect(read('src/lib/company-roles.ts')).toContain('if (have.has(seed.name)) continue')
  })
})

describe('inviting the team', () => {
  it('Users & permissions has the form: name, work email, what they do here', () => {
    const page = read('src/app/dashboard/access/page.tsx')
    expect(page).toContain('Invite a teammate')
    expect(page).toContain("fetch('/api/access/invite'")
    expect(page).toContain('<option value="">What they do here…</option>')
  })
  it('the invitation is emailed and says when the seat becomes theirs', () => {
    const route = read('src/app/api/access/invite/route.ts')
    expect(route).toContain("channel: 'EMAIL'")
    expect(route).toContain('The seat is theirs when they sign in with ${email}.')
  })
})
