import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * No twin action without a ledger entry (CLAUDE.md, "The job twin",
 * 2026-10-12). Every act the twin attempts — done, asked, refused —
 * writes one `TwinAction` naming the twin, the human role it acted
 * under, the rule and the reason. A write that fails is reported to
 * staff, and an act whose entry could not be written was not done.
 */

// ── An in-memory record, so the door is tested without a database ────
//
// Only what the twin's door touches. A transaction runs on a copy and is
// kept only if it finishes, so "the act and its entry stand or fall
// together" is something this can actually see.
type Row = Record<string, any>
type Tables = Record<string, Row[]>
const h = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Record<string, any>[]>, failOn: null as string | null, seq: 0 },
  reportError: vi.fn(async () => undefined),
  notifyBulk: vi.fn(async () => ({ count: 0 })),
  logBulkAccess: vi.fn(),
}))
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w))
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if ('in' in v) return (v.in as unknown[]).includes(row[k])
      if ('has' in v) return Array.isArray(row[k]) && row[k].includes(v.has)
      if ('not' in v) return row[k] !== v.not
      return true
    }
    return row[k] === v
  })
}
function table(name: string, t: () => Tables) {
  const rows = () => (t()[name] ??= [])
  return {
    create: async ({ data }: { data: Row }) => {
      if (h.db.failOn === `${name}.create`) throw new Error(`${name} could not be written`)
      const row: Row = { id: `${name}-${++h.db.seq}`, ts: new Date(), ...(name === 'twinApproval' ? { decision: 'PENDING' } : {}), ...data }
      if (name === 'twinAction' && row.dedupKey && rows().some((r) => r.companyId === row.companyId && r.action === row.action && r.dedupKey === row.dedupKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      rows().push(row)
      return row
    },
    findFirst: async ({ where, orderBy }: { where?: Row; orderBy?: Row } = {}) => {
      let found = rows().filter((r) => matches(r, where))
      if (orderBy?.version === 'desc') found = [...found].sort((a, b) => b.version - a.version)
      return found[0] ?? null
    },
    findUnique: async ({ where }: { where: Row }) => {
      const row = rows().find((r) => matches(r, where)) ?? null
      if (row && name === 'twinApproval') {
        const asked = t().twinAction.find((a) => a.id === row.twinActionId)!
        return { ...row, twinAction: { ...asked, authorityPerson: { name: 'Dana Whitfield' } } }
      }
      return row
    },
    findMany: async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where)),
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows().find((r) => matches(r, where))
      if (!row) throw new Error(`${name} not found`)
      Object.assign(row, data)
      return row
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows().filter((r) => matches(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
  }
}
function client(t: () => Tables): any {
  const c: any = {}
  for (const n of ['roleContract', 'twinAction', 'twinApproval', 'automationLog', 'context', 'vendorBill', 'invoice', 'company', 'modelPrompt', 'person']) c[n] = table(n, t)
  c.$transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const copy: Tables = JSON.parse(JSON.stringify(h.db.tables), (_k, v) =>
      typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)
    const out = await fn(client(() => copy))
    h.db.tables = copy
    return out
  }
  return c
}
vi.mock('@/lib/db', () => ({ prisma: client(() => h.db.tables) }))
vi.mock('@/lib/alerts', () => ({ reportError: h.reportError }))
vi.mock('@/lib/notify', () => ({ notifyBulk: h.notifyBulk }))
vi.mock('@/lib/access-log', () => ({ logBulkAccess: h.logBulkAccess }))

const T = () => h.db.tables
const CLIENT = 'northbend'
const AUTHORITY = { personId: 'dana', role: 'Program Manager', personName: 'Dana Whitfield' }
function fresh() {
  h.db.tables = { roleContract: [], twinAction: [], twinApproval: [], automationLog: [], context: [], vendorBill: [], invoice: [], company: [], modelPrompt: [], person: [] }
  h.db.failOn = null
  h.reportError.mockClear()
  h.notifyBulk.mockClear()
}

import { act, ledger, decideApproval } from '../../src/lib/twin/ledger'
import { actsPerDay } from '../../src/lib/twin/acts'
import { modelOnFor, setModelOn, recordModelPrompt, WITHHELD } from '../../src/lib/model-boundary'

beforeEach(fresh)

const base = {
  companyId: CLIENT, surface: 'CRON' as const, authority: AUTHORITY,
  rule: 'PR-2026-0442 bills 41.5 hours against 40 accepted, 3.75% over the 0.5% allowed.',
  rationale: 'Ask Pinnacle Resourcing to bill the hours accepted.',
}

describe('the twin’s ledger', () => {
  it('every twin act writes exactly one ledger entry with actor, authority, rule and rationale', async () => {
    T().vendorBill.push({ id: 'bill-1', companyId: CLIENT, status: 'RECEIVED', buyContractId: null })
    const cases = [
      { action: 'invoice_receipt.flag_mismatch', entity: { type: 'Invoice', id: 'inv-442' }, outcome: 'PERFORMED' },
      { action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-1' }, outcome: 'AWAITING_APPROVAL' },
      { action: 'agreement.sign', entity: { type: 'MasterAgreement', id: 'msa-1' }, outcome: 'REFUSED' },
      { action: 'invent.something', entity: { type: 'Invoice', id: 'inv-442' }, outcome: 'REFUSED' },
      { action: 'summary.draft', entity: { type: 'Invoice', id: 'inv-9', partyCompanyIds: ['someone-else'] }, outcome: 'REFUSED' },
    ]
    for (const c of cases) {
      const before = T().twinAction.length
      const r = await act({ ...base, action: c.action, entity: c.entity })
      expect(r.outcome, c.action).toBe(c.outcome)
      expect(T().twinAction.length - before, `${c.action} wrote one entry`).toBe(1)
      const e = T().twinAction[T().twinAction.length - 1]
      expect(e, c.action).toMatchObject({
        companyId: CLIENT, actorType: 'TWIN', actorId: 'PROGRAM_MANAGER',
        onAuthorityOfRole: 'Program Manager', authorityPersonId: 'dana',
        action: c.action, entityType: c.entity.type, entityId: c.entity.id, surface: 'CRON', outcome: c.outcome,
      })
      expect(e.ruleCited.length, c.action).toBeGreaterThan(5)
      expect(e.rationale, c.action).toBe(base.rationale)
    }
    // A notice to the paying desk leaves only after the entry is written.
    expect(h.notifyBulk).toHaveBeenCalled()

    // An act without a rule or a reason is refused, and that refusal is one entry too.
    const before = T().twinAction.length
    const bare = await act({ ...base, rule: ' ', action: 'summary.draft', entity: { type: 'Invoice', id: 'inv-442' } })
    expect(bare.outcome).toBe('REFUSED')
    expect(T().twinAction.length - before).toBe(1)
  })

  it('a ledger write that fails is reported, not swallowed', async () => {
    h.db.failOn = 'twinAction.create'

    // Acting alone: nothing is done, nothing of it survives, and staff hear.
    const alone = await act({ ...base, action: 'invoice_receipt.flag_mismatch', entity: { type: 'Invoice', id: 'inv-442' } })
    expect(alone).toEqual({ outcome: 'FAILED', says: 'Nothing was done, because the twin’s ledger could not record it. Staff have been told.' })
    expect(T().automationLog).toEqual([])
    expect(h.notifyBulk).not.toHaveBeenCalled()
    expect(h.reportError).toHaveBeenCalledTimes(1)
    expect(String((h.reportError.mock.calls[0] as unknown[])[1])).toContain('nothing was written')

    // Refused: the refusal stands, and the lost entry is reported.
    h.reportError.mockClear()
    const never = await act({ ...base, action: 'placement.end', entity: { type: 'SellContract', id: 'sc-1' } })
    expect(never).toMatchObject({ outcome: 'REFUSED', entryId: null })
    expect(h.reportError).toHaveBeenCalledTimes(1)
    expect(String((h.reportError.mock.calls[0] as unknown[])[1])).toContain('The refusal stood and is not in the trail')

    // The door on its own never throws, and says it did not write.
    h.reportError.mockClear()
    const written = await ledger({
      companyId: CLIENT, actorType: 'PERSON', actorId: 'pat', onAuthorityOfRole: 'Program Manager', authorityPersonId: 'dana',
      roleContractId: null, roleContractVersion: 0, tier: 'NEEDS_APPROVAL', outcome: 'REFUSED', action: 'invoice_receipt.approve',
      entityType: 'VendorBill', entityId: 'bill-1', partyCompanyIds: [CLIENT], ruleCited: 'r', rationale: 'r', surface: 'WEB', payload: {},
    })
    expect(written).toEqual({ ok: false })
    expect(h.reportError).toHaveBeenCalledTimes(1)
  })
  it('a person’s no carries their own reason in the ledger, and a refusal carries the sentence it was refused with', async () => {
    T().vendorBill.push(
      { id: 'bill-1', companyId: CLIENT, status: 'RECEIVED', buyContractId: null },
      { id: 'bill-2', companyId: CLIENT, status: 'RECEIVED', buyContractId: null },
    )
    const one = await act({ ...base, action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-1' } })
    const two = await act({ ...base, action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-2' } })
    if (one.outcome !== 'AWAITING_APPROVAL' || two.outcome !== 'AWAITING_APPROVAL') throw new Error('the twin did not ask')

    const ap = { personId: 'pat', personName: 'Pat Okafor', companyId: CLIENT, permissions: ['payments.record'] }
    const why = 'Pinnacle agreed to rebill this month at the new rate.'
    const no = await decideApproval({ approvalId: one.approvalId, decider: ap, decision: 'REJECTED', reason: why, surface: 'WEB' })
    expect(no).toMatchObject({ ok: true, outcome: 'REJECTED' })
    const rejected = T().twinAction.find((e) => e.outcome === 'REJECTED')!
    expect(rejected.rationale).toBe(why)
    expect(rejected.payload.twinRationale).toBe(base.rationale)

    // The program manager the twin asked on behalf of cannot answer; the
    // entry's reason is the sentence she was refused with.
    const dana = { personId: 'dana', personName: 'Dana Whitfield', companyId: CLIENT, permissions: ['payments.record', 'governance.read'] }
    const refusedAnswer = await decideApproval({ approvalId: two.approvalId, decider: dana, decision: 'APPROVED', surface: 'WEB' })
    expect(refusedAnswer.ok).toBe(false)
    const said = refusedAnswer.ok ? '' : refusedAnswer.says
    const refusal = T().twinAction.filter((e) => e.actorType === 'PERSON' && e.outcome === 'REFUSED').pop()!
    expect(refusal.rationale).toBe(said)
    expect(refusal.rationale).not.toBe(base.rationale)
  })
  it('acts per day counts a person\u2019s yes or no in the chat or on Teams, and nothing the twin did on its own', async () => {
    const now = new Date('2026-10-12T15:00:00Z')
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000)
    const entry = (actorType: string, surface: string, outcome: string, ts: Date) =>
      ({ id: `e-${++h.db.seq}`, companyId: CLIENT, actorType, surface, outcome, ts, action: 'invoice_receipt.approve' })
    T().twinAction.push(
      entry('PERSON', 'WEB', 'PERFORMED', at(0)),    // a yes in the chat, today
      entry('PERSON', 'TEAMS', 'REJECTED', at(1)),   // a no on Teams, yesterday
      entry('TWIN', 'CRON', 'PERFORMED', at(0)),     // the twin on its own
      entry('TWIN', 'WEB', 'AWAITING_APPROVAL', at(0)),
      entry('PERSON', 'WEB', 'REFUSED', at(0)),      // refused, so nothing changed
      entry('PERSON', 'WEB', 'PERFORMED', at(20)),   // outside the fourteen days
    )
    const days = await actsPerDay(CLIENT, 14, now)
    expect(days).toHaveLength(14)
    expect(days[13]).toEqual({ day: '2026-10-12', count: 1 })
    expect(days[12]).toEqual({ day: '2026-10-11', count: 1 })
    expect(days.reduce((n, d) => n + d.count, 0)).toBe(2)
  })
  it('the model is off for a company until its settings desk turns it on, and who did is recorded', async () => {
    T().company.push({ id: CLIENT, askEtymeModelOn: false, askEtymeModelSetById: null, askEtymeModelSetAt: null })
    expect(await modelOnFor(CLIENT)).toBe(false)
    // A change with no reason is refused, and nothing moves.
    expect(await setModelOn(CLIENT, 'dana', true, '  ')).toMatchObject({ ok: false })
    expect(await modelOnFor(CLIENT)).toBe(false)

    const on = await setModelOn(CLIENT, 'dana', true, 'Pilot on Northbend for a month.')
    expect(on).toMatchObject({ ok: true, on: true })
    expect(await modelOnFor(CLIENT)).toBe(true)
    const row = T().company.find((c) => c.id === CLIENT)!
    expect(row.askEtymeModelSetById).toBe('dana')
    expect(row.askEtymeModelSetAt).toBeInstanceOf(Date)
    const log = T().automationLog.find((l) => l.action === 'ASK_ETYME_MODEL_SET')!
    expect(log).toMatchObject({ companyId: CLIENT, reason: 'Pilot on Northbend for a month.', reversible: true })
    expect(log.payload).toMatchObject({ on: true, byPersonId: 'dana' })
  })

  it('a prompt that left is logged masked, with its answer, and never unmasked', async () => {
    const base = { companyId: CLIENT, personId: 'dana', provider: 'anthropic', model: 'claude', purpose: 'ASK_ETYME', tokensIn: 120, tokensOut: 40 }
    const masked = await recordModelPrompt({
      ...base,
      maskedPrompt: 'Why is [PERSON_1] billed at [RATE_1] when [SUPPLIER_1] bills [RATE_2]?',
      maskedAnswer: '[SUPPLIER_1] holds an older order; [PERSON_1] moved over in May.',
      realValues: ['Tobias Lindqvist', '$118/hr', 'Pinnacle Resourcing'],
    })
    expect(masked).toMatchObject({ ok: true, withheld: false })
    const kept = T().modelPrompt[0]
    expect(kept.maskedPrompt).toContain('[PERSON_1]')
    expect(kept.maskedAnswer).toContain('[SUPPLIER_1]')

    // Handed a text with a real name still in it, the log keeps neither the
    // name nor the text, and staff are told.
    const leaked = await recordModelPrompt({
      ...base,
      maskedPrompt: 'Why is Tobias Lindqvist billed at $118/hr?',
      maskedAnswer: 'Because Pinnacle Resourcing holds an older order.',
      realValues: ['Tobias Lindqvist', '$118/hr', 'Pinnacle Resourcing'],
    })
    expect(leaked).toMatchObject({ ok: true, withheld: true })
    const stored = T().modelPrompt[1]
    expect(stored.maskedPrompt).toBe(WITHHELD)
    expect(stored.maskedAnswer).toBe(WITHHELD)
    for (const real of ['Tobias Lindqvist', '$118/hr', 'Pinnacle Resourcing']) {
      expect(JSON.stringify(T().modelPrompt)).not.toContain(real)
    }
    expect(h.reportError).toHaveBeenCalled()
  })
})
