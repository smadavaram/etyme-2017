import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gateRefusal, type GateContract } from '@/app/api/contracts/[id]/activate/gate'
import { viewBefore, viewAfterRefusal, type StartPreflight } from '@/app/dashboard/contracts/activate-view'
import { startIdentityWarning, startWarningVerdict } from '@/lib/money/start-warnings'

/**
 * Activate is a real button. The tester's retest of 2026-11-03: Rajesh
 * Iyer's placement page said "Get an I-9 and E-Verify on file, then
 * activate" and had nothing to press in either seat, so the placement
 * stayed a draft two days past its start and nothing was billed.
 */

const contract: GateContract = {
  state: 'DRAFT',
  companyId: 'brightmoor', clientCompanyId: 'northbend', endClientCompanyId: null,
  company: { name: 'Brightmoor Staffing' }, clientCompany: { name: 'Northbend Athletic' }, endClientCompany: null,
}

const seat = (companyId: string, permissions: string[], type = 'EMPLOYEE') => ({
  company: { id: companyId, name: companyId === 'brightmoor' ? 'Brightmoor Staffing' : companyId === 'northbend' ? 'Northbend Athletic' : 'Halcyon Talent', slug: companyId, kind: 'VENDOR', outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false },
  permissions,
  context: { id: 'c', type, companyId, roleId: null },
})

const may: StartPreflight = { may: true, state: 'DRAFT', says: null, terms: null, papers: { outcome: 'PASS', says: 'Cleared to start.', fix: null } }

describe('the Activate button on a placement', () => {
  it('the placement page draws Activate for the seat that may activate and nobody else', () => {
    // The route's own gate: a party holding the permission, at a state a start moves from.
    expect(gateRefusal(seat('brightmoor', ['assignments.write']), contract, 'activate')).toBeNull()
    expect(gateRefusal(seat('northbend', ['assignments.write']), contract, 'activate')).toBeNull()
    expect(gateRefusal(seat('brightmoor', ['timesheets.read']), contract, 'activate')?.error.code).toBe('FORBIDDEN')
    expect(gateRefusal(seat('halcyon', ['assignments.write']), contract, 'activate')?.error.message)
      .toBe('Halcyon Talent is not a party to this contract. Only Brightmoor Staffing or Northbend Athletic can change it.')
    expect(gateRefusal(seat('brightmoor', ['assignments.write']), { ...contract, state: 'IN_PROGRESS' }, 'activate')?.error.code).toBe('INVALID_TRANSITION')
    // And the panel draws from that answer: a button where it said yes, nothing where it said no.
    expect(viewBefore(may).button).toBe('Activate')
    expect(viewBefore({ ...may, may: false, says: 'Starting a placement is done by HR.', papers: null })).toEqual({ button: null, says: null, box: null })
    expect(viewBefore(null).button).toBeNull()
  })

  it('a warning on the papers draws the reason box and a block draws none', () => {
    const warn = viewBefore({ ...may, papers: { outcome: 'WARN', says: 'Rajesh Iyer has no background check on file.', fix: 'Chase a background check, or activate with a reason.' } })
    expect(warn.button).toBe('Activate with a reason')
    expect(warn.box).toEqual({ answering: ['DOCUMENTS_WARN'] })
    expect(warn.says).toBe('Rajesh Iyer has no background check on file. Chase a background check, or activate with a reason.')

    const block = viewBefore({ ...may, papers: { outcome: 'BLOCK', says: 'Rajesh Iyer cannot start without an I-9.', fix: 'Get an I-9 on file, then activate.' } })
    expect(block.button).toBe('Activate')
    expect(block.box).toBeNull()
    expect(block.says).toBe('Rajesh Iyer cannot start without an I-9. Get an I-9 on file, then activate.')

    // Terms nobody agreed are a block too: no reason clears them.
    const terms = viewBefore({ ...may, terms: { blocks: true, says: 'Brightmoor Staffing has not stated Rajesh Iyer’s terms.' } })
    expect(terms.box).toBeNull()
  })

  it('the route’s refusal is shown on the page in its own words', () => {
    const blocked = viewAfterRefusal({ code: 'DOCUMENTS_BLOCK', message: 'Rajesh Iyer cannot start without an I-9.', fix: 'Get an I-9 on file, then activate.' })
    expect(blocked.says).toBe('Rajesh Iyer cannot start without an I-9. Get an I-9 on file, then activate.')
    expect(blocked.box).toBeNull()
    // A question the route asked draws the box under its own sentence, answering what it showed.
    const asked = viewAfterRefusal({
      code: 'DOCUMENTS_WARN', message: 'Give a reason to start without a background check.',
      warnings: [{ code: 'DOCUMENTS_WARN' }, { code: 'GOVERNANCE_WARN' }],
    })
    expect(asked.says).toBe('Give a reason to start without a background check.')
    expect(asked.box).toEqual({ answering: ['DOCUMENTS_WARN', 'GOVERNANCE_WARN'] })
    const forbidden = viewAfterRefusal({ code: 'FORBIDDEN', message: 'Starting a placement is done by HR at Brightmoor Staffing.' })
    expect(forbidden.says).toBe('Starting a placement is done by HR at Brightmoor Staffing.')
  })

  it('the panel asks the start’s own route before it draws, and posts what the field contract fills in', () => {
    const panel = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/activate-panel.tsx'), 'utf8')
    expect(panel).toMatch(/fetch\(`\/api\/contracts\/\$\{contractId\}\/activate`\)/)
    expect(panel).toMatch(/const payload = activateBody\(/)
    expect(panel).toMatch(/viewAfterRefusal\(body\.error\)/)
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')
    expect(page).toMatch(/<ActivatePanel contractId=\{contract\.id\}/)
  })
})

describe('the hiring manager’s No on who started', () => {
  it('activation asks a reason where the hiring manager said the person who started is not the one interviewed, and a Yes asks nothing', () => {
    const w = startIdentityWarning({ confirmed: false, personName: 'Rajesh Iyer', answeredBy: 'Marcus Oyelaran' })!
    expect(w.says).toBe('Marcus Oyelaran said the person who started is not the Rajesh Iyer who was interviewed. Check with the supplier first, or give a reason to start anyway. A Yes from Marcus Oyelaran clears this.')
    const v = startWarningVerdict([w], { reason: null })
    expect(v.ok).toBe(false)
    // The panel draws the box for it, under the route's own sentence.
    expect(viewAfterRefusal(v.ok ? {} : v.error).box).toEqual({ answering: ['START_IDENTITY_WARN'] })
    expect(startIdentityWarning({ confirmed: true, personName: 'Rajesh Iyer', answeredBy: 'Marcus Oyelaran' })).toBeNull()
    expect(startIdentityWarning({ confirmed: null, personName: 'Rajesh Iyer', answeredBy: null })).toBeNull()
  })
})
