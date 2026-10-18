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
      if ('notIn' in v) return !(v.notIn as unknown[]).includes(row[k])
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
  for (const n of ['roleContract', 'twinAction', 'twinApproval', 'automationLog', 'context', 'vendorBill', 'invoice', 'company']) c[n] = table(n, t)
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
/**
 * A seat besides the twin's authority at each company, so a question the
 * twin asks has somebody who may answer it (a question nobody may answer
 * is refused in a sentence instead, NO_OTHER_APPROVER).
 */
const SOMEBODY_ELSE_DECIDES = () => ['northbend', 'pinnacle'].map((companyId) => ({
  id: `ctx-${companyId}-desk`, companyId, personId: `${companyId}-desk`, type: 'EMPLOYEE', revokedAt: null,
}))
function fresh() {
  h.db.tables = { roleContract: [], twinAction: [], twinApproval: [], automationLog: [], context: SOMEBODY_ELSE_DECIDES(), vendorBill: [], invoice: [] }
  h.db.failOn = null
  h.reportError.mockClear()
}

import { act, decideApproval, ledgerFeed } from '../../src/lib/twin/ledger'
import { mayEditTwin } from '../../src/lib/twin/readers'
import { rolesFor } from '../../src/lib/company-defaults'
import { checkContract, tierIn, DEFAULT_CONTRACT, defaultContractFor, twinKindFor, twinName } from '../../src/lib/twin/role-contract'
import { twinRefusal } from '../../src/lib/refusal-words'
import { TWIN_ACTS, ALL_TWIN_ACTS } from '../../src/lib/autonomy'
import { suppliersToRun } from '../../src/lib/twin/run'

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

  it('a question only the person the twin acts for could answer is never asked: the twin says so in a sentence, and the refusal is ledgered', async () => {
    receivedBill()
    // Nobody at the client but Dana holds a seat, and the twin acts on her authority.
    T().context = [{ id: 'ctx-dana', companyId: CLIENT, personId: 'dana', type: 'EMPLOYEE', revokedAt: null }]
    const r = await act({
      companyId: CLIENT, action: 'invoice_receipt.approve', entity: { type: 'VendorBill', id: 'bill-1', partyCompanyIds: [CLIENT, 'pinnacle'] },
      rule: 'All 1 lines bill the hours accepted at the contract’s rate.', rationale: 'Nothing to decide: it matches.',
      surface: 'CRON', authority: AUTHORITY,
    })
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome !== 'REFUSED') return
    expect(r.says).toContain('did not ask anybody')
    expect(r.says).toContain('only Dana Whitfield may say yes here')
    expect(T().twinApproval).toEqual([])
    expect(T().twinAction).toEqual([expect.objectContaining({ outcome: 'REFUSED' })])
    expect(T().vendorBill[0].status).toBe('RECEIVED')
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

describe('the supplier’s twin drafts the bill and asks before it goes out (founder, 2026-10-18)', () => {
  const SUPPLIER = defaultContractFor('SUPPLIER')
  const PINNACLE = 'pinnacle'
  const AR = { personId: 'riya', role: 'Accounts Receivable', personName: 'Riya Shah' }

  it('a firm that sells people has the supplier’s twin, and a client has the program manager’s', () => {
    expect(twinKindFor('VENDOR')).toBe('SUPPLIER')
    expect(twinKindFor('GSI')).toBe('SUPPLIER')
    expect(twinKindFor('CONSULTANT_CORP')).toBe('SUPPLIER')
    expect(twinKindFor('CLIENT')).toBe('PROGRAM_MANAGER')
    expect(twinKindFor('MSP')).toBe('PROGRAM_MANAGER')
  })

  it('a supplier’s people read their twin as Ask Etyme, and a client’s still read the program manager’s twin', () => {
    expect(twinName('SUPPLIER')).toBe('Ask Etyme')
    expect(twinName('PROGRAM_MANAGER')).toBe('the program manager\u2019s twin')
    expect(twinRefusal({ why: 'NEVER', doing: 'Release a payroll run.', twin: 'SUPPLIER' }))
      .toBe('Ask Etyme may not release a payroll run. Its role contract keeps that with a person, so it is on their list instead.')
    expect(twinRefusal({ why: 'NO_OTHER_APPROVER', doing: 'Send a bill.', twin: 'SUPPLIER', byHand: 'Send it from the Bills page.' }))
      .toBe('Ask Etyme did not ask anybody to send a bill: only the person Ask Etyme acts for may say yes here, and Ask Etyme acts on their authority. Send it from the Bills page.')
  })

  it('a supplier’s twin may draft a bill alone and may never send one without a yes', () => {
    expect(tierIn(SUPPLIER, 'bill.draft')).toBe('ACTS_ALONE')
    expect(tierIn(SUPPLIER, 'bill.send')).toBe('NEEDS_APPROVAL')
    // Sending leaves the firm and asks to be paid, so no contract lets it go alone.
    expect(TWIN_ACTS['bill.send']).toMatchObject({ money: true, external: true })
    expect(checkContract({
      actsAlone: [...SUPPLIER.actsAlone, 'bill.send'],
      needsApproval: SUPPLIER.needsApproval.filter((a) => a !== 'bill.send'),
      neverTouches: SUPPLIER.neverTouches,
    }, 'SUPPLIER')).toContain('Send a drafted bill to the customer moves money, so a person approves it.')
    expect(tierIn({ ...SUPPLIER, actsAlone: [...SUPPLIER.actsAlone, 'bill.send'], needsApproval: [] }, 'bill.send')).toBe('NEEDS_APPROVAL')
    // A draft stays inside the firm and is put back by deleting it.
    expect(TWIN_ACTS['bill.draft']).toMatchObject({ money: false, external: false, reversible: true, drafts: true })
  })

  it('the yes to send a bill comes from whoever issues bills, which is Accounts Receivable and not the team that pays', () => {
    expect(TWIN_ACTS['bill.send'].approverNeeds).toBe('invoices.issue')
    const role = (name: string) => rolesFor('VENDOR').find((r) => r.name === name)!.permissions as readonly string[]
    expect(role('Accounts Receivable')).toContain('invoices.issue')
    expect(role('AP & Payroll')).not.toContain('invoices.issue')
  })

  it('a client’s twin never drafts or sends a bill, whatever its contract says', () => {
    expect(DEFAULT_CONTRACT.neverTouches).toEqual(expect.arrayContaining(['bill.draft', 'bill.send']))
    expect(tierIn({ ...DEFAULT_CONTRACT, actsAlone: [...DEFAULT_CONTRACT.actsAlone, 'bill.draft'] }, 'bill.draft')).toBe('NEVER')
    expect(checkContract({
      actsAlone: [...DEFAULT_CONTRACT.actsAlone, 'bill.draft'],
      needsApproval: DEFAULT_CONTRACT.needsApproval,
      neverTouches: DEFAULT_CONTRACT.neverTouches.filter((a) => a !== 'bill.draft'),
    })).toContain('Draft a bill to the customer from weeks the customer signed, on the agreement\u2019s billing date. It stays a draft inside the firm until Accounts Receivable sends it is not something the program manager\u2019s twin does, so it stays under never.')
    // A program manager’s contract saved before bills existed is still a whole contract.
    const before = (xs: readonly string[]) => xs.filter((a) => !a.startsWith('bill.'))
    expect(checkContract({
      actsAlone: before(DEFAULT_CONTRACT.actsAlone),
      needsApproval: before(DEFAULT_CONTRACT.needsApproval),
      neverTouches: before(DEFAULT_CONTRACT.neverTouches),
    })).toEqual([])
    // And the other way round: a supplier’s twin watches no client’s time limit.
    expect(tierIn(SUPPLIER, 'tenure.warning.notify_program_owner')).toBe('NEVER')
  })

  it('what stays with a person stays with a person on every twin', () => {
    const floor = ALL_TWIN_ACTS.filter((a) => TWIN_ACTS[a].floor)
    expect(floor).toEqual(expect.arrayContaining(['payroll.release', 'agreement.sign', 'approval.decide', 'other_company.read']))
    for (const contract of [DEFAULT_CONTRACT, SUPPLIER]) {
      for (const a of floor) expect(tierIn(contract, a), `${contract.kind}: ${a}`).toBe('NEVER')
    }
  })

  it('a supplier’s twin asked to draft a bill with no period drafts nothing, says so in a sentence and writes the refusal down', async () => {
    const r = await act({
      companyId: PINNACLE, twin: 'SUPPLIER', action: 'bill.draft', entity: { type: 'SellContract', id: 'line-1' },
      rule: 'The agreement bills monthly on the 1st.', rationale: 'Four weeks were signed by the customer.',
      surface: 'CRON', authority: AR,
    })
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome !== 'REFUSED') return
    expect(r.says).toBe('Ask Etyme was not told which period to bill, so it drafted nothing.')
    expect(T().twinAction).toEqual([expect.objectContaining({ twinKind: 'SUPPLIER', action: 'bill.draft', outcome: 'REFUSED', onAuthorityOfRole: 'Accounts Receivable' })])
    expect(T().invoice).toEqual([])
  })

  it('a supplier’s twin refusing work on another company’s record calls itself Ask Etyme, not the program manager’s twin', async () => {
    const r = await act({
      companyId: PINNACLE, twin: 'SUPPLIER', action: 'bill.draft', entity: { type: 'SellContract', id: 'line-1', partyCompanyIds: ['someone-else'] },
      rule: 'r', rationale: 'r', surface: 'CRON', authority: AR,
    })
    expect(r).toMatchObject({ outcome: 'REFUSED', says: 'Ask Etyme works only on records its own company is a party to. This one belongs to another company, so it was not touched.' })
  })

  it('the supplier’s twin reads staffing firms, integrators and one-person corporations, and never a census or a visitor’s own demo', async () => {
    T().company = [
      { id: 'brightmoor', kind: 'VENDOR', isCensusSandbox: false, isDemo: false },
      { id: 'teleworld', kind: 'GSI', isCensusSandbox: false, isDemo: false },
      { id: 'nurse-llc', kind: 'CONSULTANT_CORP', isCensusSandbox: false, isDemo: false },
      { id: 'northbend', kind: 'CLIENT', isCensusSandbox: false, isDemo: false },
      { id: 'maren', kind: 'MSP', isCensusSandbox: false, isDemo: false },
      { id: 'census-box', kind: 'VENDOR', isCensusSandbox: true, isDemo: false },
      { id: 'visitor-box', kind: 'VENDOR', isCensusSandbox: false, isDemo: true },
    ]
    expect((await suppliersToRun()).sort()).toEqual(['brightmoor', 'nurse-llc', 'teleworld'])
  })
})
