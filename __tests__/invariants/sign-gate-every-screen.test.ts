import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { readJson } from '@/lib/read-response'
import { refusalLine, needsVerifiedOwner, PROVE_OWNERSHIP_HREF } from '@/lib/owner-gate'
import { gateRefusal } from '@/lib/owner-proof'

/**
 * Every screen that records an agreement's signature reads the gate the
 * sign route reads.
 *
 * Walk, 2026-11-14: two screens call POST /api/program/agreements/[id]/sign
 * (Today → Agreements, and Contracts → POs → Agreements). The gate was
 * drawn on the first only, so at a company waiting for a verified Owner
 * the second still drew "Record a signature", and its refusal dropped the
 * "Prove ownership" link. A screen that calls the route is found here by
 * the route's address, so a third copy is held the day it is written.
 */

const ROOT = process.cwd()

function screensIn(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...screensIn(p))
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const SIGN_CALL = /\/api\/program\/agreements\/\$\{[^}]+\}\/sign/
const SCREENS = screensIn(join(ROOT, 'src/app'))
  .filter((p) => SIGN_CALL.test(readFileSync(p, 'utf8')))
  .map((p) => relative(ROOT, p))

describe('every screen that records an agreement signature reads the gate the sign route reads', () => {
  it('both screens that record a signature are found by the route they call', () => {
    expect(SCREENS).toEqual(expect.arrayContaining([
      'src/app/dashboard/program/agreements/page.tsx',
      'src/app/dashboard/purchase-orders/agreements.tsx',
    ]))
  })

  it('every such screen keeps signWaits from the agreements read and draws its sentence and link in place of the button', () => {
    const missing = SCREENS.filter((p) => {
      const src = readFileSync(join(ROOT, p), 'utf8')
      return !(src.includes('signWaits') && /<OwnerGateLine line=\{signWaits\}/.test(src))
    })
    expect(missing).toEqual([])
  })

  it('every such screen keeps the route’s link under a refused signature', () => {
    const missing = SCREENS.filter((p) => !readFileSync(join(ROOT, p), 'utf8').includes('refusalLine({ message: e.message, code: e.code'))
    expect(missing).toEqual([])
  })

  it('a refusal read through readJson still carries the Prove ownership link, from the route’s own code', async () => {
    const gate = needsVerifiedOwner({ name: 'Larchmere', ownerProofRequiredAt: new Date(), ownerVerifiedAt: null }, 'SIGN')
    expect(gate.ok).toBe(false)
    if (gate.ok) return
    const res = new Response(JSON.stringify(gateRefusal(gate)), { status: 403, headers: { 'Content-Type': 'application/json' } })
    const e: any = await readJson(res).catch((x) => x)
    const line = refusalLine({ message: e.message, code: e.code, href: e.href })
    expect(line?.says).toBe(gate.says)
    expect(line?.href).toBe(PROVE_OWNERSHIP_HREF)
    expect(line?.linkSays).toBe('Prove ownership')
  })

  it('a refusal that is not the Owner gate carries no link and reads as before', () => {
    const line = refusalLine({ message: 'Give the date on the paper.', code: 'VALIDATION' })
    expect(line?.href).toBeNull()
    expect(line?.linkSays).toBeNull()
  })
})
