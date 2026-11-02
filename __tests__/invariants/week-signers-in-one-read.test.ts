/**
 * Who signs each week at the top of its chain, for many weeks in one read
 * (lib/week-approval `weekSignersFor`, 2026-11-02). Money measured a bill
 * sent at forty at once and found about 300 statements a send were the
 * bill's weeks read one at a time only for this name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Rung = { sellContractId: string; companyId: string; clientCompanyId: string; endClientCompanyId: string | null; supplierSellContractId: string | null }

const h = vi.hoisted(() => ({ queries: 0, ladderCalls: 0 }))

// Three weeks: Helena's at Northbend through Brightmoor (a chain of two),
// Omar's direct to Cavanaugh, and Ravi's at Talvern through a prime whose
// client names an end client.
const contracts: Record<string, Rung> = {
  'sc-helena-sub': { sellContractId: 'sc-helena-sub', companyId: 'techpeple', clientCompanyId: 'brightmoor', endClientCompanyId: null, supplierSellContractId: null },
  'sc-helena-top': { sellContractId: 'sc-helena-top', companyId: 'brightmoor', clientCompanyId: 'northbend', endClientCompanyId: null, supplierSellContractId: 'sc-helena-sub' },
  'sc-omar': { sellContractId: 'sc-omar', companyId: 'pinnacle', clientCompanyId: 'cavanaugh', endClientCompanyId: null, supplierSellContractId: null },
  'sc-ravi': { sellContractId: 'sc-ravi', companyId: 'tapin', clientCompanyId: 'aptiva', endClientCompanyId: 'talvern', supplierSellContractId: null },
}
const above: Record<string, Rung[]> = {
  'sc-helena-sub': [contracts['sc-helena-sub'], contracts['sc-helena-top']],
  'sc-omar': [contracts['sc-omar']],
  'sc-ravi': [contracts['sc-ravi']],
}
const weeks: Record<string, string> = { 'ts-helena': 'sc-helena-sub', 'ts-omar': 'sc-omar', 'ts-ravi': 'sc-ravi' }
const names: Record<string, string> = { northbend: 'Northbend Athletic', cavanaugh: 'Cavanaugh Glassworks', talvern: 'Talvern Medical', brightmoor: 'Brightmoor Staffing', techpeple: 'Techpeple', pinnacle: 'Pinnacle', tapin: 'Tapin', aptiva: 'Aptiva' }

const weekRow = (id: string) => {
  const sc = contracts[weeks[id]]
  return {
    id, sellContractId: sc.sellContractId, personId: 'p', periodStart: new Date(), periodEnd: new Date(), totalHours: 40, days: {}, leaveDays: {},
    status: 'CLIENT_APPROVED', submittedAt: null, clientApprovedAt: null, employerAcceptedAt: null, anomalyScore: null, anomalyReason: null,
    person: { name: 'P', primaryEmail: 'p@x.invalid' }, overtimeDecisions: [],
    sellContract: { ...sc, id: sc.sellContractId, billRate: 100, overtimeAfterHours: 40, overtimeMultiplierBps: 15000, endDate: null, requirement: null, company: { name: names[sc.companyId] }, clientCompany: { name: names[sc.clientCompanyId] } },
  }
}

vi.mock('@/lib/db', () => ({
  prisma: {
    timesheet: {
      findUnique: async ({ where }: any) => { h.queries++; return weeks[where.id] ? weekRow(where.id) : null },
      findMany: async ({ where }: any) => { h.queries++; return (where.id.in as string[]).filter((id) => weeks[id]).map(weekRow) },
    },
    company: { findMany: async ({ where }: any) => { h.queries++; return (where.id.in as string[]).map((id) => ({ id, name: names[id] })) } },
  },
}))
vi.mock('@/app/api/timesheets/ladder', () => {
  const walk = (s: { hoursOn: string; bottom: Rung }) => (above[s.hoursOn] ?? [s.bottom]).map((rung) => ({ rung, contract: null }))
  return {
    ladderAbove: async (hoursOn: string, bottom: Rung) => { h.ladderCalls++; return walk({ hoursOn, bottom }) },
    laddersAbove: async (starts: { hoursOn: string; bottom: Rung }[]) => { h.ladderCalls++; return new Map(starts.map((s) => [s.hoursOn, walk(s)])) },
  }
})

import { readWeekChain, weekSignersFor } from '@/lib/week-approval'

beforeEach(() => { h.queries = 0; h.ladderCalls = 0 })

describe('who signs each of a bill’s weeks', () => {
  it('many weeks are read for their signer in one read, with the same name each week’s own chain gives', async () => {
    const ids = ['ts-helena', 'ts-omar', 'ts-ravi']
    const one = new Map<string, string>()
    for (const id of ids) one.set(id, (await readWeekChain(id))!.clientName)
    h.queries = 0; h.ladderCalls = 0
    const many = await weekSignersFor([...ids, 'ts-helena'])
    expect(many).toEqual(one)
    expect([...many.values()]).toEqual(['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical'])
    expect([h.queries, h.ladderCalls]).toEqual([2, 1])
  })

  it('a week that does not exist is left out, as reading it alone finds nothing, and no weeks read nothing', async () => {
    expect(await readWeekChain('ts-gone')).toBeNull()
    expect((await weekSignersFor(['ts-gone', 'ts-omar'])).has('ts-gone')).toBe(false)
    h.queries = 0
    expect((await weekSignersFor([])).size).toBe(0)
    expect(h.queries).toBe(0)
  })
})
