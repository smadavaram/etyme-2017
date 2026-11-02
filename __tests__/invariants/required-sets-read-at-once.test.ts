import { describe, it, expect, vi } from 'vitest'
import { requirementsFor, requirementsForLines } from '@/lib/document-requirements'

/**
 * The page-timing pass, 2026-11-02: the compliance page asked the database
 * about eleven questions for every line, 471 at a large supplier, because
 * the required-set door read one line at a time. Now it reads many lines
 * at once, and one line is the same read with one id, so a line read alone
 * and the same line read among others cannot come to different answers.
 */

const day = new Date('2026-10-01T00:00:00Z')
const row = (id: string, documentTypeKey: string, more: Record<string, unknown> = {}) => ({
  id, documentTypeKey, required: true, owedBy: 'WORKER', blocks: null, inheritedFromId: null, note: null,
  waivedReason: null, waivedById: null, waivedAt: null, ...more,
})

const ORDER = { id: 'o1', number: 'PO-2026-1', issuedBy: { name: 'Northbend Athletic' } }
const ORDER_2 = { id: 'o2', number: 'PO-2026-2', issuedBy: { name: 'Northbend Athletic' } }

const SELL = [
  {
    id: 's1', companyId: 'brightmoor', company: { name: 'Brightmoor Staffing' },
    clientCompany: { id: 'northbend', name: 'Northbend Athletic' }, person: { name: 'Ravi Kumar' },
    requirement: { title: 'Java developer' }, workLocation: { country: 'US', state: 'CA' }, workOrder: ORDER,
    documentRequirements: [
      row('r-s1', 'BACKGROUND_CHECK', { waivedReason: 'Checked last year', waivedById: 'p-dana', waivedAt: day, inheritedFromId: 'r-o1' }),
      row('r-s1b', 'SITE_SAFETY'),
    ],
  },
  {
    id: 's2', companyId: 'brightmoor', company: { name: 'Brightmoor Staffing' },
    clientCompany: { id: 'cavanaugh', name: 'Cavanaugh Glassworks' }, person: null,
    requirement: null, workLocation: null, workOrder: null, documentRequirements: [],
  },
  {
    id: 's3', companyId: 'techpeple', company: { name: 'Techpeple' },
    clientCompany: { id: 'northbend', name: 'Northbend Athletic' }, person: { name: 'Helena Marsh' },
    requirement: { title: 'Data analyst' }, workLocation: { country: 'US', state: 'OH' }, workOrder: ORDER_2,
    documentRequirements: [],
  },
]

const BUY = [
  {
    id: 'b1', companyId: 'brightmoor', contractType: 'W2', vendorCompanyId: null, company: { name: 'Brightmoor Staffing' },
    vendorCompany: null, candidates: [{ person: { name: 'Ravi Kumar' } }], workOrder: null,
    sellLinks: [{ sellContract: { clientCompany: { name: 'Northbend Athletic' }, requirement: { title: 'Java developer' }, workLocation: { country: 'US', state: 'CA' } } }],
    documentRequirements: [],
  },
  {
    id: 'b2', companyId: 'brightmoor', contractType: 'C2C', vendorCompanyId: null, company: { name: 'Brightmoor Staffing' },
    vendorCompany: null, candidates: [{ person: { name: 'Colleen Byrne' } }], workOrder: null, sellLinks: [],
    documentRequirements: [row('r-b2', 'NDA', { waivedReason: 'Her own firm signed one', waivedById: 'p-sam', waivedAt: day })],
  },
  {
    id: 'b3', companyId: 'techpeple', contractType: 'C2C', vendorCompanyId: 'nimbus', company: { name: 'Techpeple' },
    vendorCompany: { name: 'Nimbus Talent', kind: 'VENDOR' }, candidates: [], workOrder: ORDER, sellLinks: [],
    documentRequirements: [],
  },
]

const REQUIREMENTS = [
  { ...row('r-o1', 'BACKGROUND_CHECK'), workOrderId: 'o1', companyId: null, party: null },
  { ...row('r-o2', 'DRUG_SCREEN', { waivedReason: 'Not on this site', waivedById: 'p-lee', waivedAt: day }), workOrderId: 'o1', companyId: null, party: null },
  { ...row('r-o3', 'BADGE'), workOrderId: 'o2', companyId: null, party: null },
  { ...row('r-c1', 'W9', { owedBy: 'CUSTOMER' }), workOrderId: null, companyId: 'brightmoor', party: 'CUSTOMERS' },
  { ...row('r-c2', 'DRUG_SCREEN'), workOrderId: null, companyId: 'brightmoor', party: 'WORKERS_W2' },
  { ...row('r-c3', 'INSURANCE_GL', { owedBy: 'SUPPLIER', required: false }), workOrderId: null, companyId: 'techpeple', party: 'SUB_VENDORS' },
]

const type = (id: string, companyId: string, key: string, label: string) => ({
  id, companyId, key, label, hint: null, purpose: 'COMPLIANCE', validityShape: 'END_ONLY', validMonths: null,
  reissued: false, backedByAnyOf: [], requiresBacking: false, signedBy: 'NOBODY', suppliedBy: 'CANDIDATE', blocks: true, archivedAt: null,
})
// Two firms name one type; the later id wins, on every read.
const TYPES = [type('dt-2', 'brightmoor', 'SITE_SAFETY', 'Site safety'), type('dt-1', 'northbend', 'SITE_SAFETY', 'Plant safety'), type('dt-3', 'nimbus', 'BADGE', 'Badge')]
const PEOPLE = [{ id: 'p-dana', name: 'Dana Whitfield' }, { id: 'p-lee', name: 'Lee Park' }, { id: 'p-sam', name: 'Sam Ortiz' }]

type Where = Record<string, unknown>
const inList = (v: unknown) => (v as { in: string[] }).in

/** A database that answers each read from the rows above, as its where clause says, and counts every question. */
function fakeDb() {
  const asked = vi.fn()
  const strip = <T extends Record<string, unknown>>(r: T, select: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(select).map((k) => [k, r[k]]))
  const db = {
    sellContract: {
      findMany: vi.fn(async (a: { where: Where }) => { asked('sellContract'); return SELL.filter((l) => inList(a.where.id).includes(l.id)) }),
    },
    buyContract: {
      findMany: vi.fn(async (a: { where: Where }) => { asked('buyContract'); return BUY.filter((l) => inList(a.where.id).includes(l.id)) }),
    },
    documentRequirement: {
      findMany: vi.fn(async (a: { where: Where; select: Record<string, unknown> }) => {
        asked('documentRequirement')
        const w = a.where
        const hit = REQUIREMENTS.filter((r) =>
          w.workOrderId
            ? !!r.workOrderId && inList(w.workOrderId).includes(r.workOrderId)
            : !!r.companyId && inList(w.companyId).includes(r.companyId) && !!r.party && inList(w.party).includes(r.party))
        return hit.map((r) => strip(r, a.select))
      }),
    },
    documentType: {
      findMany: vi.fn(async (a: { where: Where; select: Record<string, unknown>; orderBy?: { id: 'asc' } }) => {
        asked('documentType')
        const hit = TYPES.filter((t) => inList(a.where.companyId).includes(t.companyId))
        const ordered = a.orderBy ? [...hit].sort((x, y) => x.id.localeCompare(y.id)) : hit
        return ordered.map((t) => strip(t, a.select))
      }),
    },
    person: {
      findMany: vi.fn(async (a: { where: Where }) => { asked('person'); return PEOPLE.filter((p) => inList(a.where.id).includes(p.id)) }),
    },
  }
  return { db: db as never, asked, types: db.documentType.findMany }
}

describe('the required set of many lines, read at once', () => {
  it('every sell line read among others has the same set, field for field, as the same line read alone', async () => {
    const { db } = fakeDb()
    const many = await requirementsForLines({ sellContractIds: ['s1', 's2', 's3'] }, db)
    for (const id of ['s1', 's2', 's3']) {
      const alone = await requirementsFor({ sellContractId: id }, fakeDb().db)
      expect(many.get(id)).toEqual(alone)
    }
    // And the answer is the line's own: s2 has no order, s3 is Techpeple's, on its own order.
    expect(many.get('s1')!.items.find((i) => i.key === 'BADGE')).toBeUndefined()
    expect(many.get('s3')!.items.find((i) => i.key === 'BADGE')!.from).toBe('ORDER')
    expect(many.get('s2')!.order).toBeNull()
    expect(many.get('s3')!.items.find((i) => i.key === 'W9')).toBeUndefined()
    expect(many.get('s1')!.items.find((i) => i.key === 'W9')!.says).toBe('required by Brightmoor Staffing’s own papers, set at setup')
  })

  it('every buy line read among others has the same set, field for field, as the same line read alone', async () => {
    const { db } = fakeDb()
    const many = await requirementsForLines({ buyContractIds: ['b1', 'b2', 'b3'] }, db)
    for (const id of ['b1', 'b2', 'b3']) {
      const alone = await requirementsFor({ buyContractId: id }, fakeDb().db)
      expect(many.get(id)).toEqual(alone)
    }
    expect(many.get('b1')!.shape).toBe('W2')
    expect(many.get('b2')!.shape).toBe('CORP_TO_CORP')
    expect(many.get('b3')!.shape).toBe('SUB_VENDOR')
  })

  it('the order’s rows, the company’s own set and the waiver’s name reach only the lines they belong to', async () => {
    const { db } = fakeDb()
    const many = await requirementsForLines({ buyContractIds: ['b1', 'b2', 'b3'] }, db)
    // Brightmoor's set for its W2s reaches its W2 line and not its corp-to-corp one.
    expect(many.get('b1')!.items.find((i) => i.key === 'DRUG_SCREEN')?.from).toBe('DEFAULT')
    expect(many.get('b2')!.items.find((i) => i.key === 'DRUG_SCREEN')).toBeUndefined()
    // Her own corporation is named as the supplier where no firm is on the line.
    expect(many.get('b2')!.items.find((i) => i.key === 'W9')!.owedByName).toBe('Colleen Byrne')
    expect(many.get('b2')!.items.find((i) => i.key === 'NDA')!.waivedSays).toContain('Sam Ortiz')
    // The order's waiver is named on the line that is on the order.
    expect(many.get('b3')!.items.find((i) => i.key === 'DRUG_SCREEN')!.waivedSays).toContain('Lee Park')
  })

  it('the number of questions asked does not grow with the number of lines', async () => {
    const one = fakeDb()
    await requirementsForLines({ sellContractIds: ['s1'] }, one.db)
    const three = fakeDb()
    await requirementsForLines({ sellContractIds: ['s1', 's2', 's3', 's1'] }, three.db)
    expect(three.asked.mock.calls.length).toBe(one.asked.mock.calls.length)
    expect(three.asked.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('a line that does not exist is left out, and the others are still answered', async () => {
    const { db } = fakeDb()
    const many = await requirementsForLines({ sellContractIds: ['s1', 'gone'] }, db)
    expect([...many.keys()]).toEqual(['s1'])
    expect(await requirementsFor({ sellContractId: 'gone' }, fakeDb().db)).toBeNull()
  })

  it('where two firms’ dictionaries name one type, every read takes them in the same order', async () => {
    const { db, types } = fakeDb()
    const many = await requirementsForLines({ sellContractIds: ['s1'] }, db)
    expect(types.mock.calls[0][0]).toMatchObject({ orderBy: { id: 'asc' } })
    expect(many.get('s1')!.items.find((i) => i.key === 'SITE_SAFETY')!.label).toBe('Site safety')
    expect(many.get('s1')!.items.find((i) => i.key === 'BACKGROUND_CHECK')!.waivedSays).toContain('Dana Whitfield')
  })

  it('a read with no lines asks nothing', async () => {
    const { db, asked } = fakeDb()
    expect((await requirementsForLines({ sellContractIds: [] }, db)).size).toBe(0)
    expect(asked).not.toHaveBeenCalled()
  })
})
