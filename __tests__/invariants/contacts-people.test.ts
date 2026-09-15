import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { kindOfRole } from '@/lib/contacts'

/**
 * "Why is the People tab on Contacts empty? People are the contacts
 * within vendor companies." The tab used to list only what somebody
 * typed in. Now it is the people seated at the firms you trade with.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the people at the firms you trade with', () => {
  it('a seat at the other firm sorts into the same chips as a contact typed by hand', () => {
    expect(kindOfRole('Recruiter')).toBe('RECRUITING')
    expect(kindOfRole('Accountant')).toBe('AP')
    expect(kindOfRole('Owner')).toBe('EXECUTIVE')
    expect(kindOfRole('Resource Manager')).toBe('DELIVERY')
    expect(kindOfRole('Hiring Manager')).toBe('HIRING_MANAGER')
    expect(kindOfRole('Procurement Lead')).toBe('PROCUREMENT')
    expect(kindOfRole('Account Manager')).toBe('EXECUTIVE')
    expect(kindOfRole('Contract Manager')).toBe('PROCUREMENT')
    expect(kindOfRole('HR')).toBe('DELIVERY')
    expect(kindOfRole('Finance')).toBe('AP')
    expect(kindOfRole('Accounts Receivable')).toBe('AP')
    expect(kindOfRole('AP & Payroll')).toBe('AP')
    expect(kindOfRole(null)).toBe('OTHER')
  })
  it('a client sees the whole team at each supplier it buys from — register, agreement or contract', () => {
    const src = read('src/app/api/contacts/route.ts')
    expect(src).toContain("prisma.counterparty.findMany({ where: { companyId, relationship: 'SUPPLIER' }")
    expect(src).toContain("prisma.masterAgreement.findMany({ where: { clientId: companyId }")
    expect(src).toContain("type: { in: ['EMPLOYEE', 'PARTNER'] }")
  })
  it('a supplier sees only the people at a client it has dealt with — who raised a role it was invited to, its hiring manager, who signs its hours, who wrote to it — never a client’s whole staff', () => {
    const src = read('src/app/api/contacts/route.ts')
    expect(src).toContain("prisma.requirementInvitation.findMany({ where: { toCompanyId: companyId }")
    expect(src).toContain("want(c.hiringManagerId, c.clientCompany.id, `Hiring manager for ${c.person.name}`)")
    expect(src).toContain("want(t.clientApprovedById, t.sellContract.clientCompany.id, 'Signs your hours')")
    expect(src).toContain("'On a thread with you'")
    expect(src).toContain('if (wanted.size === 0) return rows')
  })
  it('somebody typed in by hand who also holds a seat is one person, not two', () => {
    expect(read('src/app/api/contacts/route.ts')).toContain("seated.filter((p) => !p.email || !known.has(p.email.toLowerCase()))")
  })
  it('the page says how each person is known', () => {
    expect(read('src/app/dashboard/contacts/page.tsx')).toContain('{c.via && <p className="mt-1 text-[12px] text-etyme-muted">{c.via}</p>}')
  })
})
