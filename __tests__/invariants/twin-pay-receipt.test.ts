import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Paying an invoice receipt from Ask Etyme (2026-10-26).
 *
 * The twin asks to pay a supplier's invoice that passed the three-way
 * check; a person at the paying company says yes with the bank reference;
 * the payment is recorded. Money moves, so the chat may not grow a second
 * door: the yes goes through the payment route's own gate
 * (`mayPayInvoiceReceipt`) and money's one payment write
 * (`recordInvoicePayment`), and those two are mocked here only so this
 * file can see that they are the ones called and what they are called
 * with. Their arithmetic is money's and tested there
 * (`__integration__/invoice-payment.test.ts`).
 */

type Row = Record<string, any>
type Tables = Record<string, Row[]>
const h = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Record<string, any>[]>, seq: 0 },
  reportError: vi.fn(async () => undefined),
  notifyBulk: vi.fn(async () => ({ count: 0 })),
  logBulkAccess: vi.fn(),
  receipts: [] as Record<string, unknown>[],
  gate: { ok: true } as { ok: true } | { ok: false; code: string; says: string } | null,
  gateCalls: [] as string[],
  direction: 'PAYABLE' as string,
  payCalls: [] as { inTx: boolean; input: Record<string, unknown> }[],
  failNext: null as string | null,
  emitted: [] as { event: Record<string, unknown>; actor: unknown; committed: boolean; afterPay: number }[],
}))

function isPlain(v: unknown): v is Row {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
}
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w))
    if (k === 'AND') return (v as Row[]).every((w) => matches(row, w))
    if (isPlain(v)) {
      if ('in' in v) return (v.in as unknown[]).includes(row[k])
      if ('notIn' in v) return !(v.notIn as unknown[]).includes(row[k])
      if ('has' in v) return Array.isArray(row[k]) && row[k].includes(v.has)
      if ('not' in v) return row[k] !== v.not
      // A relation filter: the question's own entry.
      return isPlain(row[k]) ? matches(row[k], v) : true
    }
    return row[k] === v
  })
}
function table(name: string, t: () => Tables) {
  const rows = () => (t()[name] ??= [])
  // A question carries the entry that asked it, the way the relation does.
  const withAsk = (r: Row): Row =>
    name === 'twinApproval' ? { ...r, twinAction: { ...t().twinAction.find((a) => a.id === r.twinActionId), authorityPerson: { name: 'Dana Whitfield' } } } : r
  return {
    create: async ({ data }: { data: Row }) => {
      if (h.failNext === `${name}.create`) { h.failNext = null; throw new Error(`${name} could not be written`) }
      const row: Row = { id: `${name}-${++h.db.seq}`, ts: new Date(), ...(name === 'twinApproval' ? { decision: 'PENDING' } : {}), ...data }
      if (name === 'twinAction' && row.dedupKey && rows().some((r) => r.companyId === row.companyId && r.action === row.action && r.dedupKey === row.dedupKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      rows().push(row)
      return row
    },
    findFirst: async ({ where, orderBy }: { where?: Row; orderBy?: Row } = {}) => {
      let found = rows().map(withAsk).filter((r) => matches(r, where))
      if (orderBy?.version === 'desc') found = [...found].sort((a, b) => b.version - a.version)
      return found[0] ?? null
    },
    findUnique: async ({ where }: { where: Row }) => {
      const row = rows().find((r) => matches(r, where)) ?? null
      return row ? withAsk(row) : null
    },
    findMany: async ({ where }: { where?: Row } = {}) => rows().map(withAsk).filter((r) => matches(r, where)),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows().filter((r) => matches(withAsk(r), where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
  }
}
function tablesNamed(): string[] { return ['roleContract', 'twinAction', 'twinApproval', 'automationLog', 'context', 'vendorBill', 'invoice', 'company', 'person', 'payment', 'modelPrompt'] }
function client(t: () => Tables, inTx = false): any {
  const c: any = { __inTx: inTx }
  for (const n of tablesNamed()) c[n] = table(n, t)
  c.$transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const copy: Tables = JSON.parse(JSON.stringify(h.db.tables), (_k, v) =>
      typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)
    const out = await fn(client(() => copy, true))
    h.db.tables = copy
    return out
  }
  return c
}
vi.mock('@/lib/db', () => ({ prisma: client(() => h.db.tables) }))
vi.mock('@/lib/alerts', () => ({ reportError: h.reportError }))
vi.mock('@/lib/notify', () => ({ notifyBulk: h.notifyBulk }))
vi.mock('@/lib/access-log', () => ({ logBulkAccess: h.logBulkAccess }))
vi.mock('@/lib/twin/rules/tenure', () => ({ tenureWarnings: async () => [] }))
vi.mock('@/lib/twin/rules/invoice', () => ({ pendingReceiptsFor: async () => h.receipts }))
vi.mock('@/lib/twin/rule-set', () => ({ ruleSetFor: async () => ({ version: 1, tenureWarnAtDays: [90, 60, 30], hoursTolerancePct: 0.5, source: 'DEFAULT' }) }))
vi.mock('@/lib/teams/digest', () => ({ tellProgramOwnerOnTeams: async () => [] }))
vi.mock('@/lib/money/keyed-receipt', () => ({ mayPayKeyedReceipt: async () => ({ ok: true }) }))
vi.mock('@/lib/money/invoice-parties', () => ({
  partiesOf: () => ({ vendor: { id: 'pinnacle', name: 'Pinnacle Resourcing' }, client: { id: 'northbend', name: 'Northbend Athletic' }, says: '' }),
  directionFrom: () => h.direction,
}))
// The payment route's own gate, as the route's page asks it.
vi.mock('@/lib/invoice-match', () => ({
  mayPayInvoiceReceipt: async (id: string) => { h.gateCalls.push(id); return h.gate },
}))
// Money's one payment write: a row inside the transaction it is handed.
vi.mock('@/lib/money/invoice-payment', () => ({
  recordInvoicePayment: async (tx: any, input: Record<string, unknown>) => {
    h.payCalls.push({ inTx: tx.__inTx === true, input })
    const payment = await tx.payment.create({ data: { invoiceId: input.invoiceId, reference: input.reference, method: input.method, appliedById: input.appliedById } })
    return {
      ok: true, payment, status: 'PAID', side: 'PAYER', doc: 'invoice', amountCents: 520_000,
      event: { type: 'invoice.paid', subjectType: 'Invoice', subjectId: input.invoiceId, actorPersonId: input.appliedById, payload: { paymentId: payment.id } },
      invoice: { id: input.invoiceId, number: 'PR-2026-0451', currency: 'USD', totalCents: 520_000, paidCents: 520_000, outstandingCents: 0 },
    }
  },
  // Money's sender for the event its write returns. Records whether the
  // payment it names is already in the committed tables when it is called.
  emitInvoicePaid: async (result: any, actor?: unknown) => {
    if (!result?.ok) return null
    const committed = (h.db.tables.payment ?? []).some((p) => p.id === result.payment.id)
    h.emitted.push({ event: result.event, actor, committed, afterPay: h.payCalls.length })
    return { id: 'event-1' }
  },
}))

import { decideApproval } from '../../src/lib/twin/ledger'
import { runTwin, APPROVE_SUPERSEDED } from '../../src/lib/twin/run'
import { NEEDS_BANK_REFERENCE } from '../../src/lib/twin/performers'
import { defaultContractFor } from '../../src/lib/twin/role-contract'
import { TWIN_ACTS } from '../../src/lib/autonomy'
import { questionTitle } from '../../src/lib/twin/feed-words'

const T = () => h.db.tables
const CLIENT = 'northbend'
const RECEIPT = 'pr-0451'
const AP_CLERK = {
  personId: 'pat', personName: 'Pat Okafor', companyId: CLIENT, companyKind: 'CLIENT',
  companyName: 'Northbend Athletic', permissions: ['payments.record', 'invoices.read'],
}

function fresh() {
  h.db.tables = Object.fromEntries(tablesNamed().map((n) => [n, [] as Row[]]))
  T().context = [
    {
      id: 'ctx-northbend-pm', companyId: CLIENT, personId: 'dana', type: 'EMPLOYEE', revokedAt: null,
      role: { name: 'Program Manager' }, person: { name: 'Dana Whitfield', primaryEmail: 'dana@northbend.example' },
    },
    { id: 'ctx-northbend-ap', companyId: CLIENT, personId: 'pat', type: 'EMPLOYEE', revokedAt: null },
  ]
  T().invoice = [{ id: RECEIPT }]
  T().company = [{ id: CLIENT, name: 'Northbend Athletic' }]
  T().person = [{ id: 'pat', name: 'Pat Okafor' }, { id: 'dana', name: 'Dana Whitfield' }]
  h.receipts = [{
    invoiceId: RECEIPT, number: 'PR-2026-0451', supplierName: 'Pinnacle Resourcing', dueAt: null, verdict: 'CLEAN', payable: true, failing: [], lines: [],
    ruleCited: 'PR-2026-0451 bills 40 hours against 40 accepted, at the contract rate.',
    rationale: 'It passed the three-way check, so it can be paid.',
    rules: { hoursTolerancePct: 0.5, source: 'DEFAULT' },
  }]
  h.gate = { ok: true }
  h.gateCalls = []
  h.direction = 'PAYABLE'
  h.payCalls = []
  h.emitted = []
  h.failNext = null
  h.reportError.mockClear()
}
beforeEach(fresh)

const asked = (action: string) => T().twinApproval.filter((q) => T().twinAction.find((a) => a.id === q.twinActionId)?.action === action)
const ROOT = process.cwd()
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('paying an invoice receipt from Ask Etyme', () => {
  it('paying an invoice receipt from the chat goes through the same gate and the same function the receipt’s page uses', async () => {
    // The page's route and the chat's performer name the same two things,
    // and neither writes a payment row of its own.
    const route = src('src/app/api/invoices/[id]/payments/route.ts')
    const performers = src('src/lib/twin/performers.ts')
    const gate = src('src/lib/invoice-match.ts')
    expect(route).toMatch(/import \{[^}]*recordInvoicePayment[^}]*\} from '@\/lib\/money\/invoice-payment'/)
    expect(performers).toMatch(/import \{[^}]*recordInvoicePayment[^}]*\} from '@\/lib\/money\/invoice-payment'/)
    expect(performers).toMatch(/import \{[^}]*mayPayInvoiceReceipt[^}]*\} from '@\/lib\/invoice-match'/)
    // The gate the route asks, receiptStateRefusal then payGate on a fresh
    // match, is the one mayPayInvoiceReceipt is made of.
    expect(route).toMatch(/receiptStateRefusal\(/)
    expect(route).toMatch(/payGate\(invoice, await matchInvoice\(id\)\)/)
    const body = gate.slice(gate.indexOf('export async function mayPayInvoiceReceipt'))
    expect(body.slice(0, 600)).toMatch(/receiptStateRefusal\(inv\)/)
    expect(body.slice(0, 600)).toMatch(/payGate\(inv, match\)/)
    for (const f of [route, performers]) expect(f).not.toMatch(/\.payment\.create\(/)

    // And in behavior: the twin asks, the AP clerk says yes with the
    // reference, the gate is asked again, money's function pays.
    await runTwin(CLIENT)
    const [q] = asked('invoice_receipt.pay')
    expect(q).toMatchObject({ decision: 'PENDING', needsPermission: 'payments.record' })
    h.gateCalls = []

    const out = await decideApproval({
      approvalId: q.id, decision: 'APPROVED', surface: 'WEB', decider: AP_CLERK,
      answer: { reference: '  ACH 7781-0451 ', method: 'ACH' },
    })
    expect(out).toMatchObject({ ok: true, outcome: 'PERFORMED' })
    expect(h.gateCalls).toEqual([RECEIPT])
    expect(h.payCalls).toHaveLength(1)
    expect(h.payCalls[0].inTx).toBe(true)
    expect(h.payCalls[0].input).toMatchObject({
      invoiceId: RECEIPT, amountCents: null, reference: 'ACH 7781-0451', method: 'ACH',
      appliedById: 'pat', onBooksOf: CLIENT, seatId: null,
      recordedBy: { companyId: CLIENT, companyName: 'Northbend Athletic', personName: 'Pat Okafor' },
    })
    expect(T().payment).toEqual([expect.objectContaining({ invoiceId: RECEIPT, reference: 'ACH 7781-0451', appliedById: 'pat' })])
    // The person's line in the ledger keeps what they typed beside their yes.
    const line = T().twinAction.find((e) => e.actorType === 'PERSON' && e.action === 'invoice_receipt.pay')
    expect(line).toMatchObject({ outcome: 'PERFORMED', actorId: 'pat' })
    expect(line!.payload.answer).toEqual({ reference: 'ACH 7781-0451', method: 'ACH' })
  })

  it('a yes to pay an invoice receipt with no bank reference is refused in a sentence, and nothing is paid', async () => {
    await runTwin(CLIENT)
    const [q] = asked('invoice_receipt.pay')
    for (const answer of [undefined, { reference: '   ', method: 'ACH' }]) {
      const out = await decideApproval({ approvalId: q.id, decision: 'APPROVED', surface: 'TEAMS', decider: AP_CLERK, answer })
      expect(out).toEqual({ ok: false, status: 422, says: NEEDS_BANK_REFERENCE })
    }
    expect(NEEDS_BANK_REFERENCE).toBe('Enter the bank reference, so you can reconcile this payment later.')
    expect(h.payCalls).toEqual([])
    expect(T().payment).toEqual([])
    expect(T().twinApproval.find((r) => r.id === q.id)!.decision).toBe('PENDING')
  })

  it('a receipt the payment gate now refuses is not paid on a yes, and the person reads the gate’s own sentence', async () => {
    await runTwin(CLIENT)
    const [q] = asked('invoice_receipt.pay')
    h.gate = { ok: false, code: 'HELD', says: 'PR-2026-0451 is on hold by Northbend Athletic. Lift the hold where it was put, then pay it.' }
    const out = await decideApproval({ approvalId: q.id, decision: 'APPROVED', surface: 'WEB', decider: AP_CLERK, answer: { reference: 'ACH 7781' } })
    expect(out).toEqual({ ok: false, status: 422, says: 'PR-2026-0451 is on hold by Northbend Athletic. Lift the hold where it was put, then pay it.' })
    expect(h.payCalls).toEqual([])
  })

  it('an invoice this company is not the one paying is never put up to be paid', async () => {
    h.direction = 'RECEIVABLE'
    await runTwin(CLIENT)
    expect(asked('invoice_receipt.pay')).toEqual([])
    const refused = T().twinAction.find((e) => e.action === 'invoice_receipt.pay')
    expect(refused).toMatchObject({ outcome: 'REFUSED' })
    expect(refused!.payload.said).toBe('That invoice is not one this company is being asked to pay.')
  })

  it('the program manager the twin acts for cannot pay from the twin’s question', async () => {
    await runTwin(CLIENT)
    const [q] = asked('invoice_receipt.pay')
    const out = await decideApproval({
      approvalId: q.id, decision: 'APPROVED', surface: 'WEB', answer: { reference: 'ACH 7781' },
      decider: { ...AP_CLERK, personId: 'dana', personName: 'Dana Whitfield' },
    })
    expect(out).toMatchObject({ ok: false, status: 403 })
    expect(h.payCalls).toEqual([])
  })
})

describe('what a payment from the chat tells the record', () => {
  it('a payment the chat records tells the record once, after it is committed, as the twin', async () => {
    await runTwin(CLIENT)
    const [q] = asked('invoice_receipt.pay')
    // Refused yeses tell nothing.
    await decideApproval({ approvalId: q.id, decision: 'APPROVED', surface: 'WEB', decider: AP_CLERK })
    expect(h.emitted).toEqual([])

    const out = await decideApproval({ approvalId: q.id, decision: 'APPROVED', surface: 'WEB', decider: AP_CLERK, answer: { reference: 'ACH 7781' } })
    expect(out).toMatchObject({ ok: true, outcome: 'PERFORMED' })
    expect(h.emitted).toHaveLength(1)
    const [sent] = h.emitted
    expect(sent.committed).toBe(true)
    expect(sent.event).toMatchObject({ type: 'invoice.paid', subjectId: RECEIPT, actorPersonId: 'pat' })
    expect(sent.actor).toEqual({ actorKind: 'TWIN', actorTwinKind: 'PROGRAM_MANAGER' })
    // Nothing of the event is kept in the ledger's own line.
    const line = T().twinAction.find((e) => e.actorType === 'PERSON' && e.outcome === 'PERFORMED')
    expect(JSON.stringify(line!.payload)).not.toContain('invoice.paid')
  })

  it('a payment that rolls back tells the record nothing', async () => {
    await runTwin(CLIENT)
    const [q] = asked('invoice_receipt.pay')
    // The ledger's line after the payment cannot be written: the whole
    // transaction rolls back, the payment with it.
    h.failNext = 'automationLog.create'
    const out = await decideApproval({ approvalId: q.id, decision: 'APPROVED', surface: 'WEB', decider: AP_CLERK, answer: { reference: 'ACH 7781' } })
    expect(out).toMatchObject({ ok: false, status: 500 })
    expect(h.payCalls).toHaveLength(1)
    expect(T().payment).toEqual([])
    expect(h.emitted).toEqual([])
  })
})

describe('one card per receipt: pay replaces approve on a supplier’s invoice', () => {
  function anOpenApproveQuestion() {
    T().twinAction.push(
      { id: 'rec-old', companyId: CLIENT, action: 'invoice_receipt.record', dedupKey: `${RECEIPT}:CLEAN`, entityType: 'Invoice', entityId: RECEIPT, outcome: 'PERFORMED' },
      {
        id: 'ask-old', companyId: CLIENT, actorType: 'TWIN', twinKind: 'PROGRAM_MANAGER', action: 'invoice_receipt.approve', dedupKey: RECEIPT, entityType: 'Invoice', entityId: RECEIPT,
        outcome: 'AWAITING_APPROVAL', partyCompanyIds: [CLIENT, 'pinnacle'], onAuthorityOfRole: 'Program Manager', authorityPersonId: 'dana',
        roleContractId: null, roleContractVersion: 0, tier: 'NEEDS_APPROVAL', ruleCited: 'r', rationale: 'r',
      },
    )
    T().twinApproval.push({ id: 'q-old', companyId: CLIENT, twinActionId: 'ask-old', needsPermission: 'payments.record', decision: 'PENDING' })
  }

  it('the nightly run asks to pay a clean receipt it checked on an earlier night, and closes the open approve question on it as overtaken', async () => {
    anOpenApproveQuestion()
    await runTwin(CLIENT)
    expect(asked('invoice_receipt.pay').map((q) => q.decision)).toEqual(['PENDING'])
    expect(T().twinApproval.find((q) => q.id === 'q-old')!.decision).toBe('OVERTAKEN')
    expect(T().twinAction.find((e) => e.action === 'invoice_receipt.approve' && e.outcome === 'OVERTAKEN')).toMatchObject({ rationale: APPROVE_SUPERSEDED })

    // A second night asks nothing new and closes nothing twice.
    await runTwin(CLIENT)
    expect(asked('invoice_receipt.pay')).toHaveLength(1)
    expect(T().twinAction.filter((e) => e.outcome === 'OVERTAKEN')).toHaveLength(1)
  })

  it('a receipt the twin once asked to approve, whether the question is open or answered yes, still gets its pay question once on the next night', async () => {
    for (const decision of ['PENDING', 'APPROVED']) {
      fresh()
      anOpenApproveQuestion()
      T().twinApproval[0].decision = decision
      await runTwin(CLIENT)
      expect(asked('invoice_receipt.pay').map((q) => q.decision), decision).toEqual(['PENDING'])
      expect(T().twinAction.filter((e) => e.action === 'invoice_receipt.pay' && e.outcome === 'REFUSED'), decision).toEqual([])
      await runTwin(CLIENT)
      expect(asked('invoice_receipt.pay'), decision).toHaveLength(1)
    }
  })

  it('a receipt put off with Not now is asked once more the day before it falls due, and a no is never asked again', async () => {
    const due = new Date(Date.UTC(2026, 10, 20))
    T().invoice = [{ id: RECEIPT, dueAt: due }]
    await runTwin(CLIENT, { now: new Date(Date.UTC(2026, 10, 1)) })
    const first = asked('invoice_receipt.pay')
    expect(first.map((q) => q.decision)).toEqual(['PENDING'])
    first[0].requestedAt = new Date(Date.UTC(2026, 10, 1))

    // Not now changes nothing on the record; nights before the eve ask nothing new.
    await runTwin(CLIENT, { now: new Date(Date.UTC(2026, 10, 10)) })
    expect(asked('invoice_receipt.pay')).toHaveLength(1)

    // The day before it falls due: asked once more, the earlier question closed.
    await runTwin(CLIENT, { now: new Date(Date.UTC(2026, 10, 19, 6)) })
    expect(asked('invoice_receipt.pay').map((q) => q.decision).sort()).toEqual(['OVERTAKEN', 'PENDING'])
    // Never a third time.
    await runTwin(CLIENT, { now: new Date(Date.UTC(2026, 10, 20, 6)) })
    expect(asked('invoice_receipt.pay')).toHaveLength(2)

    // A no, with its reason, is a no.
    fresh()
    T().invoice = [{ id: RECEIPT, dueAt: due }]
    await runTwin(CLIENT, { now: new Date(Date.UTC(2026, 10, 1)) })
    Object.assign(asked('invoice_receipt.pay')[0], { decision: 'REJECTED', requestedAt: new Date(Date.UTC(2026, 10, 1)) })
    await runTwin(CLIENT, { now: new Date(Date.UTC(2026, 10, 19, 6)) })
    expect(asked('invoice_receipt.pay')).toHaveLength(1)
  })

  it('a receipt somebody already said no to approving is not asked again as a payment', async () => {
    anOpenApproveQuestion()
    T().twinApproval[0].decision = 'REJECTED'
    await runTwin(CLIENT)
    expect(asked('invoice_receipt.pay')).toEqual([])
  })

  it('a company whose saved role contract never placed paying keeps the approve question rather than getting none', async () => {
    const before = defaultContractFor('PROGRAM_MANAGER')
    T().roleContract.push({
      id: 'rc-1', companyId: CLIENT, twinKind: 'PROGRAM_MANAGER', version: 1,
      actsAlone: before.actsAlone, needsApproval: before.needsApproval.filter((a) => a !== 'invoice_receipt.pay'),
      neverTouches: before.neverTouches,
    })
    await runTwin(CLIENT)
    expect(asked('invoice_receipt.pay')).toEqual([])
    expect(asked('invoice_receipt.approve').map((q) => q.decision)).toEqual(['PENDING'])
  })

  it('paying is asked for, never done alone, and its question reads as paying the supplier’s invoice', () => {
    expect(TWIN_ACTS['invoice_receipt.pay']).toMatchObject({ money: true, decides: true, floor: false, approverNeeds: 'payments.record' })
    expect(TWIN_ACTS['invoice_receipt.pay'].alone).toBeUndefined()
    expect(defaultContractFor('PROGRAM_MANAGER').needsApproval).toContain('invoice_receipt.pay')
    expect(questionTitle('invoice_receipt.pay', 'Invoice', { number: 'PR-2026-0451', supplierName: 'Pinnacle Resourcing' })).toBe('Pay Pinnacle Resourcing’s invoice PR-2026-0451?')
  })
})
