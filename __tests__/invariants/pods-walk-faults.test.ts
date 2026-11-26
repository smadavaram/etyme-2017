import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startRule, amountsRule, offerRule, teamCreatedSays, peopleToAdd, NOT_ON_YOUR_BOOKS_SAYS, notYourFirmSays } from '@/lib/pods'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('marking a deliverable started', () => {
  it('a planned deliverable that has not started may be marked started', () => {
    expect(startRule({ status: 'PENDING' }, null)).toBeNull()
  })
  it('a deliverable already started is refused in a sentence, so the start date is set once', () => {
    expect(startRule({ status: 'PENDING' }, new Date())).toBe('That deliverable is already marked started.')
  })
  it('a submitted, accepted, rejected or cancelled deliverable cannot be marked started', () => {
    for (const status of ['DELIVERED', 'ACCEPTED', 'INVOICED', 'REJECTED', 'CANCELLED']) {
      expect(startRule({ status }, null)).toMatch(/can only be marked started while it is planned/)
    }
  })
  it('the start route sits behind the seat, the plugin gate and the write permission, and sets the date once', () => {
    const src = read('src/app/api/pods/projects/[id]/deliverables/[deliverableId]/start/route.ts')
    expect(src).toContain("pluginGate(caller, 'PODS')")
    expect(src).toContain('podWriteRefusal')
    expect(src).toContain('podStaffOnly')
    expect(src).toContain('startRule')
    expect(src).toMatch(/updateMany\(\{[^}]*startedAt: null/)
  })
  it('the supplier view draws Mark started only on a planned deliverable and only for a seat that may write', () => {
    const page = read('src/app/dashboard/pods/page.tsx')
    expect(page).toContain('Mark started')
    expect(page).toMatch(/mayWrite && d\.state === 'planned'/)
    expect(read('src/lib/pods/read.ts')).toContain('deliverables:')
  })
})

describe('every amount a person reads is money, not cents', () => {
  it('a deliverables total that does not match is said in dollars in the team currency', () => {
    const says = amountsRule(2900000, [1000000, 1800000], 'USD')!
    expect(says).toContain('$28,000.00')
    expect(says).toContain('$29,000.00')
    expect(says).not.toMatch(/cents/)
  })
  it('the same refusal through the offer reads the offer currency', () => {
    const r = offerRule({ clientCompanyId: 'c', acceptorEmail: 'a@b.example', kind: 'FIXED_PRICE', priceCents: 2900000, currency: 'EUR', projectName: 'Data platform build', deliverables: [{ name: 'Build', amountCents: 2800000 }] })
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.says).toContain('€'); expect(r.says).not.toMatch(/cents/) }
  })
})

describe('creating a team says what comes next', () => {
  it('a team with no roles says to add its roles next', () => {
    expect(teamCreatedSays('Data team', 0)).toBe('Data team is created with 0 roles. Add its roles next.')
  })
  it('a team created with roles says to add its members next', () => {
    expect(teamCreatedSays('Data team', 2)).toBe('Data team is created with 2 roles. Add its members next.')
    expect(teamCreatedSays('Data team', 1)).toBe('Data team is created with 1 role. Add its members next.')
  })
  it('the create route uses that sentence', () => {
    expect(read('src/app/api/pods/route.ts')).toContain('teamCreatedSays')
  })
})

describe('the team on the page', () => {
  it('Sold to the client is said once: the offer line yields to the project row once the sale is made', () => {
    expect(read('src/app/dashboard/pods/page.tsx')).toMatch(/decision !== 'APPROVED'/)
  })
  it('the member picker leaves out everybody already on the team, in any role', () => {
    const people = [{ personId: 'a', name: 'A' }, { personId: 'b', name: 'B' }, { personId: 'c', name: 'C' }]
    expect(peopleToAdd(people, [{ members: [{ personId: 'a' }] }, { members: [{ personId: 'c' }] }]).map((p) => p.personId)).toEqual(['b'])
  })
  it('the page uses that rule rather than filtering one role', () => {
    expect(read('src/app/dashboard/pods/page.tsx')).toContain('peopleToAdd(')
  })
})

describe('a refusal never names somebody the firm does not hold', () => {
  it('a bare person id that is neither an employee nor on the bench reads nothing about her', () => {
    const src = read('src/lib/pods/read.ts')
    const fn = src.slice(src.indexOf('export async function rosterFacts'), src.indexOf('export async function eligiblePeople'))
    expect(fn.indexOf('person.findUnique')).toBeGreaterThan(fn.indexOf('if (!seat && listings.length === 0) return null'))
  })
  it('the refusal says only that she is not on the bench and does not work for the firm', () => {
    expect(NOT_ON_YOUR_BOOKS_SAYS).toBe('That person is not on your bench and does not work for you.')
    expect(read('src/app/api/pods/[id]/route.ts')).toContain('NOT_ON_YOUR_BOOKS_SAYS')
  })
})

describe('who may read a sold team’s margin', () => {
  it('the margin route is passed by a seat that holds margin.read although it does not read jobs', () => {
    const src = read('src/app/api/pods/projects/[id]/margin/route.ts')
    expect(src).toContain('podMarginReadRefusal')
    expect(src).not.toContain('podReadRefusal(')
    const caller = read('src/lib/pods/caller.ts')
    expect(caller).toMatch(/podMarginReadRefusal[\s\S]*margin\.read/)
  })
})

describe('somebody with no company seat', () => {
  it('is told the page is for the firm’s own people, not that she is signed out', () => {
    expect(notYourFirmSays()).toBe('This page is for your firm’s own people. Your own work is under Your work.')
    for (const f of ['src/app/api/pods/route.ts', 'src/app/api/pods/[id]/route.ts', 'src/app/api/pods/[id]/offer/route.ts', 'src/app/api/pods/projects/[id]/margin/route.ts']) {
      expect(read(f)).toContain('podStaffOnly')
      expect(read(f)).not.toMatch(/\bstaffOnly\(/)
    }
  })
})
