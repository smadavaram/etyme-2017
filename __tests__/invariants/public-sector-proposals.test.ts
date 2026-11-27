import { describe, it, expect } from 'vitest'
import { mayMove, moveRefusal, PIECE_KINDS } from '@/lib/proposals/rules'
import { tierIn, defaultContractFor } from '@/lib/twin/role-contract'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

describe('public-sector proposals: who may move a proposal', () => {
  it('the agent can never mark a proposal approved or submitted', () => {
    for (const from of ['DRAFT', 'NEEDS_PIECES', 'READY_FOR_PERSON', 'APPROVED'] as const) {
      expect(mayMove('AGENT', from, 'APPROVED')).toBe(false)
      expect(mayMove('AGENT', from, 'SUBMITTED')).toBe(false)
    }
    expect(moveRefusal('AGENT', 'READY_FOR_PERSON', 'SUBMITTED')).toMatch(/A person approves/)
  })
  it('a person approves only a proposal that is ready for their yes', () => {
    expect(mayMove('PERSON', 'READY_FOR_PERSON', 'APPROVED')).toBe(true)
    expect(mayMove('PERSON', 'DRAFT', 'APPROVED')).toBe(false)
  })
  it('a person cannot approve while a piece is still missing, and the sentence says how many', () => {
    expect(moveRefusal('PERSON', 'READY_FOR_PERSON', 'APPROVED', 2)).toMatch(/2 pieces are still missing/)
    expect(moveRefusal('PERSON', 'READY_FOR_PERSON', 'APPROVED', 0)).toBeNull()
  })
  it('a proposal is recorded as sent only after a person approved it', () => {
    expect(mayMove('PERSON', 'APPROVED', 'SUBMITTED')).toBe(true)
    expect(mayMove('PERSON', 'READY_FOR_PERSON', 'SUBMITTED')).toBe(false)
  })
  it('the pieces a proposal chases are the four the record names', () => {
    expect([...PIECE_KINDS]).toEqual(['BENCH', 'COMPLIANCE', 'RATES', 'PAST_PERFORMANCE'])
  })
})

describe('public-sector proposals: the role contract', () => {
  it('submitting, signing and publishing compliance wording are never touched by the supplier’s twin', () => {
    const c = defaultContractFor('SUPPLIER')
    for (const a of ['proposal.submit', 'proposal.sign', 'proposal.publish_compliance_copy']) {
      expect(tierIn(c, a)).toBe('NEVER')
      expect(c.neverTouches).toContain(a)
    }
  })
})

describe('public-sector proposals: every route asks the switch', () => {
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? walk(f, out) : n === 'route.ts' && out.push(f) }
    return out
  }
  it('every proposals route asks the Public-sector proposals switch before it reads or writes', () => {
    const files = walk('src/app/api/proposals')
    expect(files.length).toBe(3)
    for (const f of files) expect(readFileSync(f, 'utf8')).toContain("pluginGate(caller, 'PUBLIC_SECTOR')")
  })
  it('no proposals route sets a proposal to submitted for the agent: only a person’s seat reaches them', () => {
    for (const f of walk('src/app/api/proposals')) expect(readFileSync(f, 'utf8')).not.toMatch(/moveRefusal\('AGENT'/)
  })
})
