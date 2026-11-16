import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { needsVerifiedOwner, ownerOnlyLine, GATED_ACT_WORDS, PROVE_OWNERSHIP_HREF } from '@/lib/owner-gate'

/**
 * Layer 7 money review, second pass, 2026-11-16. Payroll and the bench
 * reserve pay people, so they wait for a verified Owner like every act
 * that pays; their screens draw no Process or Run the route will refuse,
 * and their refusals say payroll's words, never "paying a firm".
 *
 * The routes' refusals and rows are walked on the seeded world in
 * __integration__/a-bill-prints-the-account-a-payment-goes-to.test.ts;
 * this file holds the screens to the routes they call.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const GATED = { name: 'Northwind Staffing', ownerProofRequiredAt: new Date('2026-11-01T00:00:00Z'), ownerVerifiedAt: null }

describe('payroll waits for a verified Owner in its own words, and draws no button the route refuses', () => {
  it('a payroll refusal says paying your people waits until the company has a verified Owner, never paying a firm', () => {
    expect(needsVerifiedOwner(GATED, 'PAY_PEOPLE')).toEqual({
      ok: false,
      says: 'Paying your people waits until Northwind Staffing has a verified Owner. Prove ownership under Setup → Prove ownership.',
      href: PROVE_OWNERSHIP_HREF,
      step: 'OWNERSHIP',
    })
    expect(GATED_ACT_WORDS.PAY_PEOPLE).not.toMatch(/firm/i)
    expect(ownerOnlyLine({ ...GATED, ownerVerifiedAt: new Date() }, 'PAY_PEOPLE').says).toBe('Only the Owner, or a role the Owner gives, runs payroll.')
  })

  it('every payroll door asks the gate for paying people, and none asks it for paying a firm', () => {
    for (const route of ['run', 'off-cycle', 'commissions', 'reserve']) {
      const src = read(`src/app/api/payroll/${route}/route.ts`)
      expect(src, route).toContain("needsVerifiedOwnerAt(companyId, 'PAY_PEOPLE')")
      expect(src, route).not.toContain("needsVerifiedOwnerAt(companyId, 'PAY')")
    }
  })

  it('a bench week paid from a reserve and a reserve settled on leaving are refused before anything is posted, with the refusal kept first', () => {
    const src = read('src/app/api/payroll/reserve/route.ts')
    const post = src.slice(src.indexOf('export async function POST'))
    const gate = post.indexOf("needsVerifiedOwnerAt(companyId, 'PAY_PEOPLE')")
    expect(gate).toBeGreaterThan(0)
    expect(post.slice(gate - 120, gate)).toContain("if (action === 'draw' || action === 'exit')")
    const logged = post.indexOf("door: action === 'draw' ? 'RESERVE_DRAW' : 'RESERVE_EXIT'")
    expect(logged).toBeGreaterThan(gate)
    expect(logged).toBeLessThan(post.indexOf('return NextResponse.json(gateRefusal(owner), { status: 403 })'))
    expect(gate).toBeLessThan(post.indexOf('await postReserve('))
  })

  it('the Payroll page draws Process only where the company may pay its people, and says the gate’s sentence with its link otherwise', () => {
    expect(read('src/app/api/payroll/route.ts')).toContain("payWaits: await payWaitsAt(companyId, 'PAY_PEOPLE'),")
    const PAGE = read('src/app/dashboard/payroll/page.tsx')
    expect(PAGE).toContain('{runsHere && stats.calculated > 0 && !payWaits && (')
    expect(PAGE).toContain('<OwnerGateLine line={payWaits} />')
    // Process is the page's only act that pays, and it is the one drawn behind the line.
    expect(PAGE.match(/handleRunPayroll\('(approve|process)'\)/g)).toEqual(["handleRunPayroll('process')"])
  })

  it('Commissions offers Run only where the company may pay its people, and says the gate’s sentence with its link otherwise', () => {
    const ROUTE = read('src/app/api/payroll/commissions/route.ts')
    expect(ROUTE).toContain("const payWaits = runs ? await payWaitsAt(companyId, 'PAY_PEOPLE') : null")
    expect(ROUTE).toContain('mayRun: runs && !payWaits,')
    const PAGE = read('src/app/dashboard/payroll/commissions/page.tsx')
    expect(PAGE).toContain('<OwnerGateLine line={payWaits} />')
    expect(PAGE).toContain('{mayRun && (\n        <form')
  })
})
