import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { signaturesSeen, type SignatureRow, type Reader, type WeekChain } from '@/lib/week-approval'
import { SHAPE_SAYS } from '@/lib/document-requirements'
import { deskFrom, DESK_ROLES, DESKS } from '@/lib/demo-desks'
import { INTEGRATOR_SEATS } from '@/app/demo/seats'
import { getNavForKind } from '@/components/shell/sidebar'
import { dashboardReads } from '@/lib/dashboard-reads'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Work the coordinator relayed from regulatory, supply and both testers,
 * on 2026-10-03, as sentences.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// Northbend Athletic buys Helena from Computer Systems, which buys her from CloudEPA.
const N = 'northbend', CS = 'computer-systems', CE = 'cloudepa'
const chain = {
  ladder: [
    { sellContractId: 'top', companyId: CS, clientCompanyId: N },
    { sellContractId: 'bottom', companyId: CE, clientCompanyId: CS },
  ],
  clientId: N,
  names: new Map([[N, 'Northbend Athletic'], [CS, 'Computer Systems Inc'], [CE, 'CloudEPA']]),
  week: { personId: 'helena' },
} as unknown as WeekChain
const reader = (companyId: string | null, personId = `someone-at-${companyId}`): Reader =>
  ({ personId, personName: 'Reader', companyId, permissions: [] })
const at = new Date('2026-09-28T15:00:00Z')
const now = new Date('2026-10-03T12:00:00Z')
const rows: SignatureRow[] = [
  { role: 'CLIENT_APPROVAL', companyId: N, at, byName: 'Dana Whitfield', auto: false, note: 'Release weekend, agreed with the team', emailApprover: null },
  { role: 'PASS_THROUGH', companyId: CS, at, byName: 'Victor Hale', auto: false, note: 'Accepted as the client signed it', emailApprover: null },
  { role: 'EMPLOYER_ACCEPTANCE', companyId: CE, at, byName: 'Bhavesh Nair', auto: false, note: null, emailApprover: null },
]

describe('the week page shows who signed, and why a flagged week was signed', () => {
  it('the client reads its own signature with the reason it gave, and its supplier’s without one', () => {
    const { shown } = signaturesSeen(reader(N), chain, rows, now)
    expect(shown.map((s) => s.firm)).toEqual(['Northbend Athletic', 'Computer Systems Inc'])
    expect(shown[0].says).toBe('Approved by Dana Whitfield, Northbend Athletic, Sep 28 — reason: Release weekend, agreed with the team')
    expect(shown[1].reason).toBeNull()
  })

  it('the client is never shown the sub-vendor’s signature, and the withholding is logged', () => {
    const { shown, logged } = signaturesSeen(reader(N), chain, rows, now)
    expect(JSON.stringify(shown)).not.toContain('CloudEPA')
    expect(logged.map((l) => l.allowed)).toEqual([true, true, false])
  })

  it('the firm directly below the client reads the client’s reason; the firm two rungs down does not', () => {
    const cs = signaturesSeen(reader(CS), chain, rows, now).shown
    expect(cs.find((s) => s.role === 'CLIENT_APPROVAL')!.reason).toBe('Release weekend, agreed with the team')
    const ce = signaturesSeen(reader(CE), chain, rows, now).shown
    expect(ce.find((s) => s.role === 'PASS_THROUGH')!.reason).toBe('Accepted as the client signed it')
    expect(ce.every((s) => s.role !== 'CLIENT_APPROVAL' || s.reason === null)).toBe(true)
  })

  it('an automatic approval says nobody looked, and names nobody', () => {
    const auto: SignatureRow = { role: 'CLIENT_APPROVAL', companyId: N, at, byName: null, auto: true, note: null, emailApprover: null }
    const [s] = signaturesSeen(reader(N), chain, [auto], now).shown
    expect(s.says).toBe('Approved automatically — nobody looked · Northbend Athletic, Sep 28')
    expect(s.signedBy).toBeNull()
  })

  it('a signature given by email names the approver and keeps the email’s own sentence out of the reason', () => {
    const email: SignatureRow = { role: 'CLIENT_APPROVAL', companyId: N, at, byName: null, auto: false, note: 'Approved by email: Marcus Oyelaran, Sep 28', emailApprover: 'Marcus Oyelaran' }
    const [s] = signaturesSeen(reader(N), chain, [email], now).shown
    expect(s.says).toBe('Approved by Marcus Oyelaran, Northbend Athletic, Sep 28 — by email')
    expect(s.reason).toBeNull()
  })

  it('a signature on the page never carries a rate', () => {
    for (const s of signaturesSeen(reader(CS), chain, rows, now).shown) {
      expect(Object.keys(s).filter((k) => /rate|cents/i.test(k))).toEqual([])
    }
  })

  it('the week page draws a Signed panel above the approvals given outside Etyme', () => {
    const page = src('src/app/dashboard/weeks/[id]/page.tsx')
    expect(page.indexOf('>Signed<')).toBeGreaterThan(0)
    expect(page.indexOf('>Signed<')).toBeLessThan(page.indexOf('Approved outside Etyme'))
  })
})

describe('a default document says who it is asked of', () => {
  it('every default reason says who it is asked of, as standard paperwork, never "the default for a W2 start"', () => {
    expect(SHAPE_SAYS.W2).toBe('asked of every employee as standard paperwork')
    for (const words of Object.values(SHAPE_SAYS)) {
      expect(words).toMatch(/^asked of .+standard paperwork$/)
      expect(words).not.toMatch(/default|W2|corp-to-corp/i)
    }
  })
})

describe('a placement’s header says started only of a contract that started', () => {
  it('the header prints the route’s start words, and the route asks startWords with the sell contract’s own state', () => {
    expect(src('src/app/dashboard/placements/[id]/page.tsx')).toContain('p.startSays')
    expect(src('src/app/dashboard/placements/[id]/page.tsx')).not.toContain('` · started ${day(p.startDate)}`')
    const route = src('src/app/api/placements/[id]/route.ts')
    expect(route).toMatch(/startSays: startWords\(\{[\s\S]{0,200}state: placement\.state/)
  })
})

describe('the integrator’s moves can be walked from /demo', () => {
  it('a delivery manager is a desk the demo door seats, by the role it holds', () => {
    expect(DESKS).toContain('delivery')
    expect(deskFrom('delivery')).toBe('delivery')
    expect(DESK_ROLES.delivery).toEqual(['Delivery Manager'])
  })

  it('Teleworld Solutions offers its delivery manager’s desk beside the owner’s', () => {
    const teleworld = INTEGRATOR_SEATS.find((f) => f.slug === 'world-teleworld')!
    expect(teleworld.desks?.map((d) => d.desk)).toEqual(['delivery', ''])
  })

  it('the delivery manager lands on the firm’s own people', () => {
    expect(src('src/app/api/demo/route.ts')).toContain("delivery: '/dashboard/bench?scope=payroll'")
  })
})

describe('the menu and the seller’s dashboard say what is the firm’s and what is the reader’s', () => {
  it('the scorecard is the firm’s, so the menu calls it "Our scorecard"', () => {
    for (const kind of ['VENDOR', 'GSI'] as const) {
      const labels = getNavForKind(kind, false).flatMap((s) => s.items.map((i) => i.label))
      expect(labels).toContain('Our scorecard')
      expect(labels).not.toContain('Your scorecard')
    }
  })

  const perms = (name: string) => rolesFor('VENDOR').find((r) => r.name === name)!.permissions as readonly string[]

  it('the submissions target is shown to the desks that submit, and not to finance', () => {
    expect(dashboardReads(perms('Recruiter')).target).toBe(true)
    expect(dashboardReads(perms('Finance')).target).toBe(false)
  })

  it('the Pipeline tile is shown only to a seat that reads margin', () => {
    expect(dashboardReads(perms('Owner')).pipeline).toBe(true)
    expect(dashboardReads(perms('Recruiter')).pipeline).toBe(false)
  })

  it('the finance desk, shown Bench for its profit, is not sent to the people list it cannot read', () => {
    expect(dashboardReads(perms('Finance')).bench).toBe(false)
  })
})
