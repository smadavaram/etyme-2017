import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The program manager's twin acts under a role contract with three tiers
 * (CLAUDE.md, "The job twin", 2026-10-12). These are the sentences the
 * founder reads to confirm the tiers hold: what it may never do is
 * refused in words and written down, what it may do alone it does and
 * writes down, what needs a person waits for one, the twin never
 * approves its own request, and a supplier reads only its own entries.
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
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows().filter((r) => matches(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
  }
}
function client(t: () => Tables): any {
  const c: any = {}
  for (const n of ['roleContract', 'twinAction', 'twinApproval', 'automationLog', 'context', 'vendorBill', 'invoice']) c[n] = table(n, t)
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
  h.db.tables = { roleContract: [], twinAction: [], twinApproval: [], automationLog: [], context: [], vendorBill: [], invoice: [] }
  h.db.failOn = null
  h.reportError.mockClear()
}

import { act, decideApproval, ledgerFeed } from '../../src/lib/twin/ledger'
import { mayEditTwin } from '../../src/lib/twin/readers'
import { rolesFor } from '../../src/lib/company-defaults'
import { checkContract, tierIn, DEFAULT_CONTRACT } from '../../src/lib/twin/role-contract'

const AP_CLERK = {
  personId: 'pat', personName: 'Pat Okafor', companyId: CLIENT, companyKind: 'CLIENT',
  companyName: 'Northbend Athletic', permissions: ['payments.record', 'invoices.read'],
}

function receivedBill(id = 'bill-1') {
  T().vendorBill.push({ id, companyId: CLIENT, vendorCompanyId: 'pinnacle', status: 'RECEIVED', buyContractId: null, periodStart: null, periodEnd: null })
}

beforeEach(fresh)

describe('the program manager’s twin is held to its role contract', () => {
  it('a NEVER-tier act is refused in a sentence and the refusal is ledgered', async () => {
    const r = await act({
      companyId: CLIENT, action: 'payroll.release', entity: { type: 'PayrollRun', id: 'run-1' },
      rule: 'Pay day is Friday', rationale: 'Every week in the run is accepted.', surface: 'CRON', authority: AUTHORITY,
    })
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome !== 'REFUSED') return
    expect(r.says).toBe('The program manager’s twin may not release a payroll run. Its role contract keeps that with a person, so it is on their list instead.')
    expect(r.says).not.toMatch(/[A-Z]{3,}_|\w+\.\w+/)

    const [entry] = T().twinAction
    expect(T().twinAction).toHaveLength(1)
    expect(entry).toMatchObject({ id: r.entryId, tier: 'NEVER', outcome: 'REFUSED', action: 'payroll.release', actorType: 'TWIN', onAuthorityOfRole: 'Program Manager', authorityPersonId: 'dana' })
    expect(T().automationLog.map((l) => l.action)).toEqual(['TWIN_REFUSED'])

    // And no contract, written or stored, can move it out of NEVER.
    expect(checkContract({
      actsAlone: [...DEFAULT_CONTRACT.actsAlone, 'payroll.release'],
      needsApproval: DEFAULT_CONTRACT.needsApproval,
      neverTouches: DEFAULT_CONTRACT.neverTouches.filter((a) => a !== 'payroll.release'),
    })).toContain('Release a payroll run stays with a person, whatever the contract says.')
    expect(tierIn({ ...DEFAULT_CONTRACT, actsAlone: ['payroll.release'], neverTouches: [] }, 'payroll.release')).toBe('NEVER')
    // Money cannot be done alone either.
    expect(tierIn({ ...DEFAULT_CONTRACT, actsAlone: ['invoice_receipt.approve'], needsApproval: [] }, 'invoice_receipt.approve')).toBe('NEEDS_APPROVAL')
  })

  it('an ACTS_ALONE act performs and ledgers', async () => {
    const r = await act({
      companyId: CLIENT, action: 'tenure.warning.record', entity: { type: 'Person', id: 'tobias' },
      rule: 'Tobias Lindqvist has 487 days on site against an 18-month limit, reached Dec 11, 2026.',
      rationale: 'He is sixty days from the limit. Decide whether he rolls off or a break is planned.',
      surface: 'CRON', authority: AUTHORITY, dedupKey: 'tobias:WARN_60:2026-12-11',
    })
    expect(r.outcome).toBe('PERFORMED')
    expect(T().twinAction).toHaveLength(1)
    expect(T().twinAction[0]).toMatchObject({ tier: 'ACTS_ALONE', outcome: 'PERFORMED', entityType: 'Person', entityId: 'tobias' })
    expect(T().automationLog.map((l) => l.action)).toEqual(['TWIN_NOTED'])

    // The same finding the next night is not recorded twice.
    const again = await act({
      companyId: CLIENT, action: 'tenure.warning.record', entity: { type: 'Person', id: 'tobias' },
      rule: 'same', rationale: 'same', surface: 'CRON', authority: AUTHORITY, dedupKey: 'tobias:WARN_60:2026-12-11',
    })
    expect(again.outcome).toBe('ALREADY')
    expect(T().twinAction).toHaveLength(1)
  })

  it('a NEEDS_APPROVAL act waits and ledgers', async () => {
    receivedBill()
    const r = await act({
      companyId: CLIENT, action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-1', partyCompanyIds: [CLIENT, 'pinnacle'] },
      rule: 'All 1 lines bill the hours accepted at the contract’s rate.', rationale: 'Nothing to decide: it matches.',
      surface: 'CRON', authority: AUTHORITY,
    })
    expect(r.outcome).toBe('AWAITING_APPROVAL')
    if (r.outcome !== 'AWAITING_APPROVAL') return
    expect(T().twinAction).toHaveLength(1)
    expect(T().twinAction[0]).toMatchObject({ tier: 'NEEDS_APPROVAL', outcome: 'AWAITING_APPROVAL' })
    expect(T().twinApproval).toEqual([expect.objectContaining({ id: r.approvalId, twinActionId: r.entryId, needsPermission: 'payments.record' })])
    expect(T().twinApproval[0].decision).toBe('PENDING')
    expect(T().automationLog.map((l) => l.action)).toEqual(['TWIN_APPROVAL_REQUESTED'])
    // Nothing moved while it waits.
    expect(T().vendorBill[0].status).toBe('RECEIVED')

    // The AP desk says yes: the receipt is approved, and the answer is one more entry.
    const yes = await decideApproval({ approvalId: r.approvalId, decider: AP_CLERK, decision: 'APPROVED', surface: 'TEAMS' })
    expect(yes).toMatchObject({ ok: true, outcome: 'PERFORMED' })
    expect(T().vendorBill[0].status).toBe('APPROVED')
    expect(T().twinApproval[0]).toMatchObject({ decision: 'APPROVED', approverPersonId: 'pat', surface: 'TEAMS' })
    expect(T().twinAction.map((e) => [e.actorType, e.outcome])).toEqual([['TWIN', 'AWAITING_APPROVAL'], ['PERSON', 'PERFORMED']])
  })

  it('the twin cannot approve what it drafted', async () => {
    receivedBill()
    const asked = await act({
      companyId: CLIENT, action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-1' },
      rule: 'Clean.', rationale: 'Matches.', surface: 'CRON', authority: AUTHORITY,
    })
    expect(asked.outcome).toBe('AWAITING_APPROVAL')
    if (asked.outcome !== 'AWAITING_APPROVAL') return

    // Answering its own question is never the twin's.
    const own = await act({
      companyId: CLIENT, action: 'approval.decide', entity: { type: 'TwinApproval', id: asked.approvalId },
      rule: 'Clean.', rationale: 'I asked, so I will answer.', surface: 'CRON', authority: AUTHORITY,
    })
    expect(own).toMatchObject({ outcome: 'REFUSED' })

    // Nor may it decide the receipt it already put to a person.
    const twice = await act({
      companyId: CLIENT, action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-1' },
      rule: 'Clean.', rationale: 'Matches.', surface: 'CRON', authority: AUTHORITY,
    })
    expect(twice.outcome).toBe('REFUSED')
    if (twice.outcome === 'REFUSED') expect(twice.says).toBe('The program manager’s twin asked for this itself, so it cannot be the one to approve it. The person who decides it does.')

    // And the person whose authority it acted on cannot sign it either.
    const dana = await decideApproval({
      approvalId: asked.approvalId, decision: 'APPROVED', surface: 'WEB',
      decider: { ...AP_CLERK, personId: 'dana', personName: 'Dana Whitfield' },
    })
    expect(dana).toMatchObject({ ok: false, status: 403 })
    if (!dana.ok) expect(dana.says).toBe('Dana Whitfield asked for this, and the twin acts on their authority, so neither may approve it. Somebody else who may decide it does.')
    expect(T().vendorBill[0].status).toBe('RECEIVED')
    expect(T().twinApproval[0].decision).toBe('PENDING')
    // Every refusal is on the ledger, the person's included.
    expect(T().twinAction.map((e) => [e.actorType, e.outcome])).toEqual([
      ['TWIN', 'AWAITING_APPROVAL'], ['TWIN', 'REFUSED'], ['TWIN', 'REFUSED'], ['PERSON', 'REFUSED'],
    ])
  })

  it('a supplier reads only its own ledger entries', async () => {
    const entry = (id: string, parties: string[]) => ({
      id, ts: new Date(), companyId: CLIENT, actorType: 'TWIN', actorId: 'PROGRAM_MANAGER', onAuthorityOfRole: 'Program Manager',
      authorityPersonId: 'dana', action: 'invoice_receipt.record', tier: 'ACTS_ALONE', outcome: 'PERFORMED',
      entityType: 'Invoice', entityId: id, partyCompanyIds: parties, ruleCited: 'r', rationale: 'r', surface: 'CRON',
      approvalId: null, payload: { margin: 'the client’s own note' }, roleContractVersion: 0,
    })
    T().twinAction.push(entry('pinnacle-receipt', [CLIENT, 'pinnacle']), entry('computer-systems-receipt', [CLIENT, 'computer-systems']), entry('internal', [CLIENT]))

    const supplier = { company: { id: 'pinnacle' } as any, person: { id: 'sam' } as any, permissions: ['invoices.read', 'governance.read'] }
    const read = await ledgerFeed(CLIENT, supplier)
    expect(read?.view).toBe('PARTY')
    expect(read?.rows.map((r) => r.entityId)).toEqual(['pinnacle-receipt'])
    expect(read?.rows[0].payload).toBeUndefined()

    const owner = { company: { id: CLIENT } as any, person: { id: 'dana' } as any, permissions: ['governance.read'] }
    const all = await ledgerFeed(CLIENT, owner)
    expect(all?.view).toBe('OWNER')
    expect(all?.rows.map((r) => r.entityId).sort()).toEqual(['computer-systems-receipt', 'internal', 'pinnacle-receipt'])
  })
  it('the program manager\u2019s desk and the settings desk may change what the twin may do, and a hiring manager may not', () => {
    const role = (name: string) => rolesFor('CLIENT').find((r) => r.name === name)!.permissions as readonly string[]
    expect(mayEditTwin(role('Program Manager'))).toBe(true)
    expect(mayEditTwin(role('Owner'))).toBe(true)
    expect(mayEditTwin(['settings.manage'])).toBe(true)
    expect(mayEditTwin(role('Hiring Manager'))).toBe(false)
    expect(mayEditTwin(role('AP Clerk'))).toBe(false)
    expect(mayEditTwin([])).toBe(false)
  })
})
