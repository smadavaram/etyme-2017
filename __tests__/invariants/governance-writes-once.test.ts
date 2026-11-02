import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The page-timing pass, 2026-11-02: about ten of the award's 118 queries
 * were the governance trail, written one row a rule. The same rows now
 * go in one statement.
 */

const DB = vi.hoisted(() => ({
  create: vi.fn(),
  createMany: vi.fn(async (_a: unknown) => ({ count: 0 })),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    governanceRule: {
      findMany: vi.fn(async () => [
        { id: 'rule-rate', ruleType: 'RATE_BAND', enforcementMode: 'WARN', isActive: true, description: 'Rate range', parameters: { minRate: 7000, maxRate: 15000 }, policy: { companyId: 'northbend', name: 'Program' } },
        { id: 'rule-limit', ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', isActive: true, description: 'Time limit', parameters: { maxMonths: 18 }, policy: { companyId: 'northbend', name: 'Program' } },
      ]),
    },
    sellContract: { findMany: vi.fn(async () => []) },
    person: { findUnique: vi.fn(async () => ({ name: 'Ravi Kumar' })) },
    company: { findUnique: vi.fn(async () => ({ name: 'Northbend Athletic' })) },
    governanceEvaluation: { create: DB.create, createMany: DB.createMany },
  },
}))

import { evaluateGovernance } from '@/lib/governance'

describe('the governance trail is written in one statement', () => {
  beforeEach(() => {
    DB.create.mockReset()
    DB.createMany.mockClear()
  })

  it('every rule a placement is read against is written to the trail in one statement, the same rows one a rule', async () => {
    const out = await evaluateGovernance({
      personId: 'ravi', endClientCompanyId: 'northbend', triggerPoint: 'CONTRACT_START',
      subjectType: 'SELL_CONTRACT', subjectId: 'line-a', billRate: 20000, now: new Date('2026-11-02T12:00:00Z'),
    })
    expect(DB.create).not.toHaveBeenCalled()
    expect(DB.createMany).toHaveBeenCalledTimes(1)
    const rows = (DB.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] }).data
    expect(rows.map((r) => r.ruleId)).toEqual(['rule-rate', 'rule-limit'])
    for (const [i, r] of rows.entries()) {
      expect(r).toEqual({
        ruleId: out.evaluations[i].ruleId, triggerPoint: 'CONTRACT_START', subjectType: 'SELL_CONTRACT', subjectId: 'line-a',
        outcome: out.evaluations[i].outcome, reason: out.evaluations[i].reason,
      })
    }
  })

  it('a client with no rules writes nothing to the trail', async () => {
    const { prisma } = await import('@/lib/db')
    ;(prisma.governanceRule.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    await evaluateGovernance({ personId: 'ravi', endClientCompanyId: 'northbend', triggerPoint: 'SUBMISSION', subjectType: 'PERSON', subjectId: 'ravi' })
    expect(DB.createMany).not.toHaveBeenCalled()
  })
})
