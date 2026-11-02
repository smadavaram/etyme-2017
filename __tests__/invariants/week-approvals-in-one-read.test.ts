/**
 * A worker's weeks still waiting on the client, read for who approved them
 * in one pass (lib/week-approval `readWeekApprovalsFor`, 2026-11-02). The
 * worker's own first screen asked `readWeekApprovals` once per waiting
 * week, about eight queries a week and one lookup of no names at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Rung = { sellContractId: string; companyId: string; clientCompanyId: string; endClientCompanyId: string | null; supplierSellContractId: string | null }

const h = vi.hoisted(() => ({ q: {} as Record<string, number>, logs: [] as unknown[] }))
const count = (k: string) => { h.q[k] = (h.q[k] ?? 0) + 1 }

const rung = (id: string): Rung => ({ sellContractId: id, companyId: 'techpeple', clientCompanyId: 'northbend', endClientCompanyId: null, supplierSellContractId: null })
const weeks: Record<string, { sc: string; status: string }> = {
  'ts-1': { sc: 'sc-helena', status: 'SUBMITTED' },
  'ts-2': { sc: 'sc-helena', status: 'SUBMITTED' },
  'ts-3': { sc: 'sc-helena', status: 'CLIENT_APPROVED' },
}
const weekRow = (id: string) => ({
  id, personId: 'helena', sellContractId: weeks[id].sc, periodStart: new Date('2026-10-18'), periodEnd: new Date('2026-10-24'), totalHours: 40, days: {}, leaveDays: {},
  status: weeks[id].status, submittedAt: new Date('2026-10-26'), clientApprovedAt: weeks[id].status === 'CLIENT_APPROVED' ? new Date('2026-10-28') : null,
  employerAcceptedAt: null, anomalyScore: null, anomalyReason: null,
  person: { name: 'Helena Marsh', primaryEmail: 'helena.marsh@seed.etyme.invalid' }, overtimeDecisions: [],
  sellContract: { ...rung(weeks[id].sc), id: weeks[id].sc, billRate: 9500, overtimeAfterHours: 40, overtimeMultiplierBps: 15000, endDate: null, requirement: null, company: { name: 'Techpeple' }, clientCompany: { name: 'Northbend Athletic' } },
})
const approvals = [
  { id: 'wa-1', timesheetId: 'ts-1', how: 'LINK', approverName: 'Dana Whitfield', approverEmail: 'dana@northbend.example', sentAt: new Date('2026-10-27'), expiresAt: new Date('2099-01-01'), usedAt: null,
    sentById: 'helena', sentByCompanyId: null, outcome: null, sendBackCode: null, sendBackNote: null, evidenceKind: null, approvedOn: null, assertionId: null, clientOffPlatform: false,
    sentBy: { name: 'Helena Marsh' }, sentByCompany: null, contracts: [{ sellContractId: 'sc-helena' }], file: null },
]
const signatures = [
  { timesheetId: 'ts-3', role: 'CLIENT', companyId: 'northbend', at: new Date('2026-10-28'), byId: 'dana', auto: false, note: null, weekApproval: null },
]

vi.mock('@/lib/db', () => ({
  prisma: {
    timesheet: {
      findUnique: async ({ where }: any) => { count('timesheet'); return weeks[where.id] ? weekRow(where.id) : null },
      findMany: async ({ where }: any) => { count('timesheet'); return (where.id.in as string[]).filter((id) => weeks[id]).map(weekRow) },
    },
    company: { findMany: async ({ where }: any) => { count('company'); return (where.id.in as string[]).map((id) => ({ id, name: id === 'northbend' ? 'Northbend Athletic' : 'Techpeple' })) } },
    weekApproval: { findMany: async ({ where }: any) => { count('weekApproval'); const w = where.timesheetId; return approvals.filter((a) => (typeof w === 'string' ? a.timesheetId === w : w.in.includes(a.timesheetId))) } },
    workAssertion: { findMany: async ({ where }: any) => { count('workAssertion'); const w = where.timesheetId; return signatures.filter((a) => (typeof w === 'string' ? a.timesheetId === w : w.in.includes(a.timesheetId))) } },
    person: { findMany: async ({ where }: any) => { count('person'); return (where.id.in as string[]).map((id) => ({ id, name: id === 'dana' ? 'Dana Whitfield' : id })) } },
  },
}))
vi.mock('@/app/api/timesheets/ladder', () => ({
  ladderAbove: async (_h: string, bottom: Rung) => { count('ladder'); return [{ rung: bottom, contract: null }] },
  laddersAbove: async (starts: { hoursOn: string; bottom: Rung }[]) => { count('ladder'); return new Map(starts.map((s) => [s.hoursOn, [{ rung: s.bottom, contract: null }]])) },
}))
vi.mock('@/lib/access-log', async (orig) => ({
  ...(await orig<typeof import('@/lib/access-log')>()),
  logAccess: (row: unknown) => { h.logs.push(row) },
  recordRefusal: async (_s: unknown, row: unknown) => { h.logs.push(row); return 1 },
}))

import { readWeekApprovals, readWeekApprovalsFor, type Reader } from '@/lib/week-approval'

const helena: Reader = { personId: 'helena', personName: 'Helena Marsh', companyId: null, permissions: [] }
const stranger: Reader = { personId: 'zed', personName: 'Zed', companyId: 'elsewhere', companyName: 'Elsewhere', permissions: ['timesheets.read', 'invoices.read'] }

beforeEach(() => { h.q = {}; h.logs = [] })

describe('who approved a worker’s weeks, read in one pass', () => {
  it('many weeks are read for their approvals in one pass, with the same answer and the same logged reads each week gives alone', async () => {
    const now = new Date('2026-10-30')
    const one = new Map<string, unknown>()
    for (const id of ['ts-1', 'ts-2', 'ts-3']) one.set(id, await readWeekApprovals(helena, id, now))
    const logsAlone = h.logs.length
    h.q = {}; h.logs = []
    const many = await readWeekApprovalsFor(helena, ['ts-1', 'ts-2', 'ts-3', 'ts-1'], now)
    expect([...many.keys()]).toEqual(['ts-1', 'ts-2', 'ts-3'])
    for (const [id, answer] of one) expect(many.get(id), id).toEqual(answer)
    expect(h.logs.length).toBe(logsAlone)
    expect(h.q).toEqual({ timesheet: 1, ladder: 1, company: 1, weekApproval: 1, workAssertion: 1, person: 1 })
  })

  it('the link still waiting on the client’s approver is found on the week it was sent for', async () => {
    const many = await readWeekApprovalsFor(helena, ['ts-1', 'ts-2'], new Date('2026-10-30'))
    const w1 = many.get('ts-1')!, w2 = many.get('ts-2')!
    expect(w1.ok && w1.seen.approvals.map((a) => [a.how, a.state, a.approverName])).toEqual([['LINK', 'WAITING', 'Dana Whitfield']])
    expect(w2.ok && w2.seen.approvals).toEqual([])
  })

  it('nobody signed, so no names are looked up at all', async () => {
    await readWeekApprovalsFor(helena, ['ts-1', 'ts-2'], new Date('2026-10-30'))
    expect(h.q.person ?? 0).toBe(0)
  })

  it('a week that is not there, and a week at another company, are refused as they are alone, the refusal logged', async () => {
    const many = await readWeekApprovalsFor(stranger, ['ts-gone', 'ts-1'], new Date('2026-10-30'))
    expect([many.get('ts-gone')!.ok, (many.get('ts-gone') as any).status]).toEqual([false, 404])
    expect((many.get('ts-1') as any).status).toBe(403)
    expect(h.logs).toHaveLength(1)
    expect(h.q.weekApproval ?? 0).toBe(0)
  })
})
