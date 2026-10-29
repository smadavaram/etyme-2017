import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tapin gets agents, not a website (founder, 2026-10-29). The supplier's
 * own acts, each placed in the role contract with its tier before any card
 * is drawn: putting a bench person forward (asked, through the submission
 * door, as the person who said yes), asking for the papers a start needs
 * (alone, only where the firm confirmed the set), and telling the
 * recruiters who is coming free (alone, inside the firm). The floor does
 * not move. And a firm's Etyme address opens its generated page.
 */

type Row = Record<string, any>
type Tables = Record<string, Row[]>
const h = vi.hoisted(() => ({
  tables: ['roleContract', 'twinAction', 'twinApproval', 'automationLog', 'context', 'company', 'requirement', 'requirementInvitation',
    'submission', 'benchListing', 'sellContract', 'documentPacket', 'match', 'invoice', 'vendorBill'],
  db: { tables: {} as Record<string, Record<string, any>[]>, seq: 0 },
  notifyBulk: vi.fn(async (_rows: unknown[]) => ({ count: 0 })),
  recordAccess: vi.fn(async () => 0),
  gate: { ok: true } as { ok: true } | { ok: false; says: string },
  askForClearance: vi.fn(async (_i: unknown) => ({ preview: {}, packetId: 'packet-1', alreadyAsked: false, told: [], says: 'Asked Rosa Delgado for an I-9.' }) as any),
  previewFor: vi.fn(async () => ({ preview: { askOfPerson: [{ key: 'I9_EVERIFY', label: 'I-9' }] } }) as any),
  post: vi.fn(async (_r: unknown) => new Response(JSON.stringify({ data: { results: [{ status: 'created', submissionId: 'sub-1' }] } }), { status: 200 })),
  caller: null as null | { person: { id: string } },
  bench: [] as { personId: string; name: string; since: string }[],
  rolling: [] as { contractId: string; personId: string; name: string; client: string | null; days: number; lastDay: string; started: boolean }[],
}))

function test(row: Row | undefined, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    const val = row?.[k]
    if (k === 'OR') return (v as Row[]).some((w) => test(row, w))
    if (k === 'AND') return (v as Row[]).every((w) => test(row, w))
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if ('in' in v) return (v.in as unknown[]).includes(val)
      if ('notIn' in v) return !(v.notIn as unknown[]).includes(val)
      if ('hasSome' in v) return Array.isArray(val) && (v.hasSome as unknown[]).some((x) => val.includes(x))
      if ('has' in v) return Array.isArray(val) && val.includes(v.has)
      if ('gte' in v || 'gt' in v || 'lte' in v) {
        const n = val instanceof Date ? val.getTime() : val
        const of = (x: unknown) => (x instanceof Date ? x.getTime() : x) as number
        return (!('gte' in v) || n >= of(v.gte)) && (!('gt' in v) || n > of(v.gt)) && (!('lte' in v) || n <= of(v.lte))
      }
      if ('not' in v) return val !== v.not
      if (k.includes('_')) return test(row, v)
      return test(val ?? {}, v)
    }
    return val === v
  })
}
function table(name: string, t: () => Tables) {
  const rows = () => (t()[name] ??= [])
  return {
    create: async ({ data }: { data: Row }) => {
      const row: Row = { id: `${name}-${++h.db.seq}`, ts: new Date(), ...(name === 'twinApproval' ? { decision: 'PENDING' } : {}), ...data }
      if (name === 'twinAction' && row.dedupKey && rows().some((r) => r.companyId === row.companyId && r.action === row.action && r.dedupKey === row.dedupKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      rows().push(row)
      return row
    },
    findFirst: async ({ where }: { where?: Row } = {}) => [...rows()].reverse().find((r) => test(r, where ?? {})) ?? null,
    findUnique: async ({ where }: { where: Row }) => {
      const row = rows().find((r) => test(r, where)) ?? null
      if (row && name === 'twinApproval') {
        const asked = t().twinAction.find((a) => a.id === row.twinActionId)!
        return { ...row, twinAction: { ...asked, authorityPerson: { name: 'Jenna Okafor' } } }
      }
      return row
    },
    findMany: async ({ where }: { where?: Row } = {}) => rows().filter((r) => test(r, where ?? {})),
    count: async ({ where }: { where?: Row } = {}) => rows().filter((r) => test(r, where ?? {})).length,
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows().filter((r) => test(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
  }
}
function client(t: () => Tables): any {
  const c: any = {}
  for (const n of h.tables) c[n] = table(n, t)
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
vi.mock('@/lib/alerts', () => ({ reportError: async () => undefined }))
vi.mock('@/lib/notify', () => ({ notifyBulk: h.notifyBulk, notify: async () => undefined }))
vi.mock('@/lib/access-log', () => ({ recordAccess: h.recordAccess, logBulkAccess: () => undefined }))
vi.mock('@/lib/setup-gates', () => ({ mayChasePaper: async () => h.gate }))
vi.mock('@/lib/document-stages/chase-gate', () => ({ workerPartyAt: async () => 'WORKERS_W2' }))
vi.mock('@/app/api/compliance/clearance/ask', () => ({ askForClearance: h.askForClearance, previewFor: h.previewFor }))
vi.mock('@/app/api/submissions/route', () => ({ POST: h.post }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => (h.caller ? { caller: { ...h.caller, isService: false }, error: null } : { caller: null, error: new Response(null, { status: 401 }) }),
}))
vi.mock('@/app/api/today/reads', () => ({ benchAt: async () => h.bench, rollingOffAt: async () => h.rolling }))

import { act, decideApproval } from '../../src/lib/twin/ledger'
import { checkContract, tierIn, defaultContractFor } from '../../src/lib/twin/role-contract'
import { TWIN_ACTS } from '../../src/lib/autonomy'
import { NEEDS_RATE, PUT_FORWARD_SIGNED_IN } from '../../src/lib/twin/supplier-performers'
import { runSupplierActs } from '../../src/lib/twin/supplier-run'
import { middleware } from '../../src/middleware'

const T = () => h.db.tables
const FIRM = 'brightmoor'
const OWNER = { personId: 'jenna', role: 'Owner', personName: 'Jenna Okafor' }
const SUPPLIER = defaultContractFor('SUPPLIER')
const FUTURE = new Date(Date.now() + 30 * 86_400_000)

const seat = (personId: string, permissions: string[]) => ({
  id: `ctx-${personId}`, companyId: FIRM, personId, type: 'EMPLOYEE', revokedAt: null,
  role: { name: personId, permissions }, person: { name: personId, primaryEmail: `${personId}@brightmoor.example` },
})
const MARISA = { personId: 'marisa', personName: 'Marisa Delacroix', companyId: FIRM, companyKind: 'VENDOR', companyName: 'Brightmoor Staffing', permissions: ['submissions.create'] }
const IMELDA = { personId: 'imelda', personName: 'Imelda Santoro', companyId: FIRM, companyKind: 'VENDOR', companyName: 'Brightmoor Staffing', permissions: ['invoices.issue'] }

function fresh() {
  h.db.tables = Object.fromEntries(h.tables.map((n) => [n, []]))
  T().company.push({ id: FIRM, name: 'Brightmoor Staffing', kind: 'VENDOR' })
  T().context.push(seat('jenna', ['*']), seat('marisa', ['submissions.create']), seat('imelda', ['invoices.issue']))
  T().requirement.push({ id: 'job-1', status: 'OPEN', approvalState: 'APPROVED', title: 'Java developer' })
  T().requirementInvitation.push({
    id: 'inv-1', requirementId: 'job-1', toCompanyId: FIRM, status: 'SENT', expiresAt: FUTURE, payMin: 8000, payMax: 9500,
    requirement: { status: 'OPEN', approvalState: 'APPROVED', title: 'Java developer', company: { name: 'Northbend Athletic' }, endClientCompany: null },
  })
  h.gate = { ok: true }
  h.caller = null
  h.bench = []
  h.rolling = []
  for (const f of [h.notifyBulk, h.recordAccess, h.askForClearance, h.post]) f.mockClear()
}
beforeEach(fresh)

const putForward = (personId = 'rosa') => act({
  companyId: FIRM, twin: 'SUPPLIER', action: 'bench.put_forward',
  entity: { type: 'Requirement', id: 'job-1' },
  rule: 'Match 84 of 100, high confidence: Java and Spring on three placements.',
  rationale: 'Rosa Delgado is on Brightmoor Staffing’s bench, and Northbend Athletic sent Java developer to Brightmoor Staffing.',
  surface: 'CRON', authority: OWNER, dedupKey: `job-1:${personId}`,
  payload: { personId, personName: 'Rosa Delgado', bandMinCents: 8000, bandMaxCents: 9500 },
})

describe('the supplier’s twin puts nobody forward on its own', () => {
  it('a supplier’s twin may put a bench person forward only with the person’s consent and a yes from the seat that submits', async () => {
    // The tier: an outside message, so never alone, whatever a contract says.
    expect(tierIn(SUPPLIER, 'bench.put_forward')).toBe('NEEDS_APPROVAL')
    expect(TWIN_ACTS['bench.put_forward']).toMatchObject({ external: true, approverNeeds: 'submissions.create' })
    expect(checkContract({
      actsAlone: [...SUPPLIER.actsAlone, 'bench.put_forward'],
      needsApproval: SUPPLIER.needsApproval.filter((a) => a !== 'bench.put_forward'),
      neverTouches: SUPPLIER.neverTouches,
    }, 'SUPPLIER').join(' ')).toMatch(/leaves the company, so a person approves it/)

    // No listing granted to this firm and no employment: refused, in words, and written down.
    const none = await putForward()
    expect(none).toMatchObject({ outcome: 'REFUSED', says: 'Rosa Delgado has not said yes to this firm’s bench and is not employed here, so Ask Etyme does not put them forward.' })
    expect(T().twinApproval).toEqual([])

    // Her yes to the bench: the twin asks the people who submit, never the Owner it acts for.
    T().benchListing.push({ id: 'l-1', companyId: FIRM, revokedAt: null, state: 'GRANTED', staysUntil: null, consultant: { personId: 'rosa' } })
    const asked = await putForward()
    expect(asked.outcome).toBe('AWAITING_APPROVAL')
    if (asked.outcome !== 'AWAITING_APPROVAL') return
    expect(T().twinApproval[0]).toMatchObject({ needsPermission: 'submissions.create' })

    const owner = await decideApproval({ approvalId: asked.approvalId, decision: 'APPROVED', surface: 'WEB',
      decider: { ...MARISA, personId: 'jenna', personName: 'Jenna Okafor', permissions: ['*'] }, answer: { rateCents: 9000 } })
    expect(owner).toMatchObject({ ok: false, status: 403 })
    const billing = await decideApproval({ approvalId: asked.approvalId, decision: 'APPROVED', surface: 'WEB', decider: IMELDA, answer: { rateCents: 9000 } })
    expect(billing).toMatchObject({ ok: false, status: 403 })

    // A yes with no rate: the twin never chooses one.
    const noRate = await decideApproval({ approvalId: asked.approvalId, decision: 'APPROVED', surface: 'WEB', decider: MARISA })
    expect(noRate).toMatchObject({ ok: false, says: NEEDS_RATE })
    // A yes from a card with nobody signed in behind it (Teams, today): made from nobody's session, so refused.
    const teams = await decideApproval({ approvalId: asked.approvalId, decision: 'APPROVED', surface: 'TEAMS', decider: MARISA, answer: { rateCents: 9000 } })
    expect(teams).toMatchObject({ ok: false, says: PUT_FORWARD_SIGNED_IN })
    expect(h.post).not.toHaveBeenCalled()

    // Her yes, signed in as herself: the submission door itself, in her name, at her rate.
    h.caller = { person: { id: 'marisa' } }
    const yes = await decideApproval({ approvalId: asked.approvalId, decision: 'APPROVED', surface: 'WEB', decider: MARISA, answer: { rateCents: 9000 } })
    expect(yes).toMatchObject({ ok: true, outcome: 'PERFORMED', result: { submissionId: 'sub-1', rateCents: 9000 } })
    expect(h.post).toHaveBeenCalledTimes(1)
    const sent = await (h.post.mock.calls[0][0] as unknown as Request).json()
    expect(sent).toEqual({ requirementId: 'job-1', personIds: ['rosa'], rate: 9000, fromCompanyId: FIRM })
  })

  it('a refusal at the submission door is the door’s own sentence, and nothing is recorded as done', async () => {
    T().context.push({ id: 'ctx-rosa', companyId: FIRM, personId: 'rosa', type: 'EMPLOYEE', revokedAt: null })
    const asked = await putForward()
    if (asked.outcome !== 'AWAITING_APPROVAL') throw new Error(asked.outcome)
    h.caller = { person: { id: 'marisa' } }
    h.post.mockResolvedValueOnce(new Response(JSON.stringify({ data: { results: [{ status: 'needs_reason', error: 'Rosa Delgado would pass Northbend Athletic’s time limit. Give a reason.' }] } }), { status: 200 }))
    const out = await decideApproval({ approvalId: asked.approvalId, decision: 'APPROVED', surface: 'WEB', decider: MARISA, answer: { rateCents: 9000 } })
    expect(out).toMatchObject({ ok: false, says: 'Rosa Delgado would pass Northbend Athletic’s time limit. Give a reason.' })
    expect(T().twinApproval[0].decision).toBe('PENDING')
    expect(T().twinAction.filter((e) => e.outcome === 'PERFORMED')).toEqual([])
  })
})

describe('the supplier’s twin asks for start papers, and tells its recruiters who is free', () => {
  const askStart = () => act({
    companyId: FIRM, twin: 'SUPPLIER', action: 'papers.ask_for_start', entity: { type: 'SellContract', id: 'line-1' },
    rule: 'The line’s required set still asks Rosa Delgado for I-9.', rationale: 'Rosa Delgado starts soon.',
    surface: 'CRON', authority: OWNER,
  })

  it('a supplier’s twin asks for start papers only where the set is confirmed', async () => {
    expect(tierIn(SUPPLIER, 'papers.ask_for_start')).toBe('ACTS_ALONE')
    T().sellContract.push({ id: 'line-1', companyId: FIRM, personId: 'rosa', state: 'PENDING_VERIFICATION', person: { name: 'Rosa Delgado' } })
    h.gate = { ok: false, says: 'Brightmoor Staffing has not confirmed the papers it asks of W2 workers, so nobody is chased for them. Confirm them under Papers you require.' }
    const refused = await askStart()
    expect(refused).toMatchObject({ outcome: 'REFUSED', says: h.gate.says })
    expect(h.askForClearance).not.toHaveBeenCalled()

    h.gate = { ok: true }
    const asked = await askStart()
    expect(asked).toMatchObject({ outcome: 'PERFORMED', result: { packetId: 'packet-1' } })
    expect(h.askForClearance).toHaveBeenCalledWith({ contractId: 'line-1', actorPersonId: null })
    expect(T().automationLog.some((r) => r.action === 'TWIN_TOLD')).toBe(true)
  })

  it('a start already under way is not asked for papers', async () => {
    T().sellContract.push({ id: 'line-1', companyId: FIRM, personId: 'rosa', state: 'IN_PROGRESS', person: { name: 'Rosa Delgado' } })
    expect(await askStart()).toMatchObject({ outcome: 'REFUSED', says: 'Rosa Delgado has already started or the line has ended, so there is no start to ask papers for.' })
    expect(h.askForClearance).not.toHaveBeenCalled()
  })

  it('coming-free is a summary that sends nothing outside the firm', async () => {
    expect(tierIn(SUPPLIER, 'bench.coming_free')).toBe('ACTS_ALONE')
    expect(TWIN_ACTS['bench.coming_free']).toMatchObject({ external: false, money: false })
    T().context.push({ id: 'ctx-outsider', companyId: 'northbend', personId: 'dana', type: 'EMPLOYEE', revokedAt: null, role: { permissions: ['*'] } })
    h.rolling = [{ contractId: 'c-1', personId: 'omar', name: 'Omar Haddad', client: 'Northbend Athletic', days: 12, lastDay: '2026-11-10', started: false }]
    h.bench = [{ personId: 'jonas', name: 'Jonas Weber', since: new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10) }]
    const run = await runSupplierActs(FIRM, { authority: OWNER })
    expect(run).toMatchObject({ comingFree: 1, idle: 1 })
    expect(h.notifyBulk).toHaveBeenCalledTimes(1)
    const told = h.notifyBulk.mock.calls[0][0] as { personId: string; companyId: string; title: string }[]
    expect(told.map((n) => n.personId).sort()).toEqual(['jenna', 'marisa'])
    expect(told.every((n) => n.companyId === FIRM)).toBe(true)
    expect(told[0].title).toBe('Omar Haddad comes off a project in 12 days; Jonas Weber has waited on the bench 21 days')
    // The reads are logged as the supplier's twin, never as the Owner looking.
    expect(h.recordAccess).toHaveBeenCalledWith(['omar'], expect.objectContaining({ actorKind: 'TWIN', actorTwinKind: 'SUPPLIER', actorPersonId: 'jenna' }))
    // Once a week: a second run the same night tells nobody again.
    await runSupplierActs(FIRM, { authority: OWNER })
    expect(h.notifyBulk).toHaveBeenCalledTimes(1)
  })
})

describe('the supplier’s twin is held to its role contract', () => {
  it('the supplier’s twin never awards, extends, ends, signs or runs payroll', async () => {
    for (const a of ['placement.award', 'placement.extend', 'placement.end', 'agreement.sign', 'payroll.release']) {
      expect(tierIn(SUPPLIER, a), a).toBe('NEVER')
      expect(tierIn({ ...SUPPLIER, actsAlone: [...SUPPLIER.actsAlone, a], neverTouches: SUPPLIER.neverTouches.filter((x) => x !== a) }, a), a).toBe('NEVER')
      const r = await act({ companyId: FIRM, twin: 'SUPPLIER', action: a, entity: { type: 'SellContract', id: 'line-1' }, rule: 'r', rationale: 'r', surface: 'CRON', authority: OWNER })
      expect(r.outcome, a).toBe('REFUSED')
    }
    expect(T().twinAction.filter((e) => e.outcome === 'REFUSED')).toHaveLength(5)
    // And the supplier's contract lists its five acts, each with its tier.
    expect(SUPPLIER.actsAlone).toEqual(expect.arrayContaining(['bill.draft', 'papers.ask_for_start', 'bench.coming_free']))
    expect(SUPPLIER.needsApproval).toEqual(expect.arrayContaining(['bill.send', 'bench.put_forward']))
    // A client's twin does none of the three.
    for (const a of ['bench.put_forward', 'papers.ask_for_start', 'bench.coming_free']) expect(tierIn(defaultContractFor('PROGRAM_MANAGER'), a)).toBe('NEVER')
  })

  it('every supplier act is ledgered under the role it acted for', async () => {
    T().benchListing.push({ id: 'l-1', companyId: FIRM, revokedAt: null, state: 'GRANTED', staysUntil: null, consultant: { personId: 'rosa' } })
    T().match.push({ id: 'm-1', requirementId: 'job-1', score: 84, confidence: 'HIGH', factors: [{ label: 'Skills', value: 90, weight: 40 }], basis: 'Java and Spring on three placements.', unknowns: 'No reference yet.', consultant: { personId: 'rosa' } })
    T().sellContract.push({ id: 'line-2', companyId: FIRM, personId: 'ifeoma', state: 'VERIFIED', startDate: new Date(Date.now() + 5 * 86_400_000), person: { name: 'Ifeoma Obi' }, requirement: { title: 'Data engineer' } })
    h.bench = [{ personId: 'rosa', name: 'Rosa Delgado', since: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10) }]
    const run = await runSupplierActs(FIRM, { authority: OWNER })
    expect(run).toMatchObject({ putForward: 1, startAsks: 1 })
    const acts = T().twinAction.map((e) => e.action).sort()
    expect(acts).toEqual(['bench.coming_free', 'bench.put_forward', 'papers.ask_for_start'])
    for (const e of T().twinAction) {
      expect(e).toMatchObject({ twinKind: 'SUPPLIER', actorType: 'TWIN', onAuthorityOfRole: 'Owner', authorityPersonId: 'jenna' })
      expect(e.ruleCited.length).toBeGreaterThan(0)
      expect(e.rationale.length).toBeGreaterThan(0)
    }
    // The question carries the match's reasons, never a bare score.
    const q = T().twinAction.find((e) => e.action === 'bench.put_forward')!
    expect(q.payload).toMatchObject({ score: 84, confidence: 'HIGH', basis: 'Java and Spring on three placements.', unknowns: 'No reference yet.' })
    expect(q.payload.factors).toHaveLength(1)
    // The client is not a party to the twin's question: it reads a submission, never a proposal.
    expect(q.partyCompanyIds).toEqual([FIRM])
  })
})

describe('a firm’s Etyme address', () => {
  const visit = (url: string) => middleware(new NextRequest(url, { headers: { host: new URL(url).host } }))
  it('a firm’s Etyme address on a subdomain opens its generated page, and a stranger’s subdomain opens the home page', async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      fetched.push(String(u))
      return new Response(null, { status: String(u).endsWith('/api/site/tapin') ? 200 : 404 })
    }))
    try {
      const tapin = await visit('https://tapin.etyme.com/')
      expect(tapin.headers.get('x-middleware-rewrite')).toBe('https://tapin.etyme.com/site/tapin')
      expect(tapin.status).not.toBe(307)

      const stranger = await visit('https://nobody-here.etyme.com/')
      expect(stranger.headers.get('x-middleware-rewrite')).toBeNull()
      expect(stranger.headers.get('location')).toBeNull()
      expect(fetched).toEqual(['https://tapin.etyme.com/api/site/tapin', 'https://nobody-here.etyme.com/api/site/nobody-here'])

      // Signing in stays on the platform's own host.
      const signIn = await visit('https://tapin.etyme.com/login?next=%2Fdashboard')
      expect(signIn.headers.get('location')).toBe('https://etyme.com/login?next=%2Fdashboard')
      // The platform's own names are never a firm's page.
      const app = await visit('https://app.etyme.com/')
      expect(app.headers.get('x-middleware-rewrite')).toBeNull()
      expect(fetched).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a page that does not answer in time reads as no page, and the visitor gets the home page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable') }))
    try {
      const r = await visit('https://tapin.etyme.com/')
      expect(r.headers.get('x-middleware-rewrite')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
