import { describe, it, expect, vi } from 'vitest'

const seen: any = { contracts: null, expenses: null, invoices: null }
vi.mock('@/lib/db', () => ({
  prisma: {
    requirement: { findMany: vi.fn(async () => []) },
    submission: { findMany: vi.fn(async () => []) },
    sellContract: { findMany: vi.fn(async (a: any) => { seen.contracts = a.where; return [] }) },
    invoice: { findMany: vi.fn(async (a: any) => { seen.invoices = a.where; return [] }) },
    expense: { findMany: vi.fn(async (a: any) => { seen.expenses = a.where; return [] }) },
  },
}))

import { milestoneAcceptedNotice } from '@/lib/notify/pod-sale-notices'
import { threadsInRegion } from '@/app/api/conversations/region-threads'
import { HIDDEN_TEAM_LINE } from '@/lib/money/team-lines'

const base = { sellerPersonId: 'p1', sellerCompanyId: 'c1', milestoneId: 'm1', milestoneName: 'Data platform, phase 1', clientName: 'Corvane Packaging' }

describe('the supplier is told when a client accepts a deliverable', () => {
  it('a deliverable accepted before any member has started says it cannot be billed yet, names who must start, and gives one act', () => {
    const n = milestoneAcceptedNotice({ ...base, waitingNames: ['Priya Rao', 'Sam Lee'] }, false)
    expect(n.personId).toBe('p1')
    expect(n.title).toBe('Corvane Packaging accepted Data platform, phase 1')
    expect(n.body).toContain('cannot be billed until a start is confirmed for Priya Rao, Sam Lee')
    expect(n.body).toContain('Open Contracts')
    expect(n.data).toMatchObject({ href: '/dashboard/contracts' })
  })
  it('a deliverable accepted after a member has started says it can be billed now', () => {
    const n = milestoneAcceptedNotice({ ...base, waitingNames: [] }, false)
    expect(n.body).toBe('Corvane Packaging accepted Data platform, phase 1. It can be billed now.')
  })
  it('the notice goes by email only where email can leave, and says nothing about a letter either way', () => {
    expect(milestoneAcceptedNotice({ ...base, waitingNames: [] }, true).channel).toBe('EMAIL')
    const app = milestoneAcceptedNotice({ ...base, waitingNames: ['Priya Rao'] }, false)
    expect(app.channel).toBe('IN_APP')
    expect(`${app.title} ${app.body}`).not.toMatch(/pod|email|letter|training/i)
  })
})

describe('a regional seat at a client never reads a thread about a member of outcome work', () => {
  const scope: any = { siteIds: ['s1'], unitIds: ['u1'] }
  it('a contract thread is looked up through the client line filter', async () => {
    await threadsInRegion([{ topic: 'CONTRACT', topicId: 'l1' } as any], scope)
    expect(JSON.stringify(seen.contracts)).toContain(JSON.stringify(HIDDEN_TEAM_LINE))
  })
  it('a bill thread and an expense thread are looked up through the client line filter too', async () => {
    await threadsInRegion([{ topic: 'INVOICE', topicId: 'i1' } as any, { topic: 'EXPENSE', topicId: 'e1' } as any], scope)
    expect(JSON.stringify(seen.invoices)).toContain(JSON.stringify(HIDDEN_TEAM_LINE))
    expect(JSON.stringify(seen.expenses)).toContain(JSON.stringify(HIDDEN_TEAM_LINE))
  })
})
