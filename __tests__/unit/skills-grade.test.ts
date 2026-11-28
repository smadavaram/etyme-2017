import { describe, it, expect } from 'vitest'
import { wellFormed, unknownBecause } from '@/lib/skills/checker'
import { readOnlyDb, windowOf, skillCheckCode } from '@/lib/skills/grade'

describe('what a checker may answer', () => {
  it('a checker answer with a verdict, a reason and a whole count is read as it is', () => {
    expect(wellFormed({ verdict: 'PASS', reason: 'Counts agree.', evidence: '7 and 7', unitsFound: 7 })).toEqual({ verdict: 'PASS', reason: 'Counts agree.', evidence: '7 and 7', unitsFound: 7 })
  })

  it('an answer with no reason, a made-up verdict or a count of 2.5 is not an answer', () => {
    expect(wellFormed({ verdict: 'PASS', reason: ' ', unitsFound: 1 })).toBeNull()
    expect(wellFormed({ verdict: 'MAYBE', reason: 'x' })).toBeNull()
    expect(wellFormed({ verdict: 'PASS', reason: 'x', unitsFound: 2.5 })).toBeNull()
    expect(wellFormed({ verdict: 'PASS', reason: 'x', unitsFound: -1 })).toBeNull()
    expect(wellFormed(null)).toBeNull()
  })

  it('a checker that cannot read its key says unknown with a reason and counts nothing', () => {
    expect(unknownBecause('No census row.')).toEqual({ verdict: 'UNKNOWN', reason: 'No census row.', evidence: null, unitsFound: null })
  })
})

describe('the handle a checker reads through', () => {
  const client = { check: { findMany: async () => ['row'], create: async () => 'written' }, $queryRaw: async () => 1 }

  it('answers a read', async () => {
    expect(await readOnlyDb(client).check.findMany()).toEqual(['row'])
  })

  it('throws on a write, a raw query or a transaction', () => {
    expect(() => readOnlyDb(client).check.create).toThrow(/only reads/)
    expect(() => readOnlyDb(client).$queryRaw).toThrow(/only reads/)
    expect(() => readOnlyDb(client).$transaction).toThrow(/only reads/)
  })
})

describe('the window and the code of a graded run', () => {
  it('the window runs from just before the step began to just after its row was written', () => {
    const w = windowOf({ at: new Date('2026-11-26T12:00:10Z'), ms: 4000 })
    expect([w.from.toISOString(), w.to.toISOString()]).toEqual(['2026-11-26T12:00:05.000Z', '2026-11-26T12:00:11.000Z'])
  })

  it('the verdict is kept under one code family named for the skill', () => {
    expect(skillCheckCode('weekly.summary')).toBe('SKILL_WEEKLY_SUMMARY')
    expect(skillCheckCode('dual-auth.block')).toBe('SKILL_DUAL_AUTH_BLOCK')
  })
})
