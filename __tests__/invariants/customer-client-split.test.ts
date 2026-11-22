import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  groupsOf, groupTotals, groupsAddUpTo, groupsAddUpSays, contractsSay, pickerOptions, sellsToSomebody, mayClassify, classifiedSays,
  ON_NO_CONTRACT, NEEDS_CLASSIFYING, type GroupFacts, type GroupsRead,
} from '@/lib/counterparty'

/**
 * The customer and client split (record 110, A1), as arithmetic.
 *
 * A customer pays us. A client is the end client, where our people work.
 * A supplier supplies us. The role is read off each contract line and,
 * apart from it, off what a person said on the register. A company
 * loaded as a client is in no group until a person classifies it.
 */

const facts = (over: Partial<GroupFacts> = {}): GroupFacts => ({
  kind: 'VENDOR', positions: [], notClassified: false, saidCustomerAt: null, saidClientAt: null, onContracts: ON_NO_CONTRACT, ...over,
})
const on = (billedOn = 0, worksiteOn = 0, worksiteNamedOn = worksiteOn, suppliesOn = 0) => ({ billedOn, worksiteOn, worksiteNamedOn, suppliesOn })
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('which of the three a company is', () => {
  it('a company that pays us on one contract and is the worksite on another is in both groups, and the total counts it once', () => {
    const read = groupsOf(facts({ kind: 'UNCLASSIFIED', onContracts: on(1, 1) }), true)
    expect(read.groups).toEqual(['CUSTOMER', 'CLIENT'])
    const t = groupTotals([read], true)
    expect(t).toMatchObject({ total: 1, customers: 1, clients: 1, inTwo: 1 })
    expect(groupsAddUpTo(t)).toBe(1)
  })

  it('what the contracts say and what a person said are kept apart on the row', () => {
    const read = groupsOf(facts({ positions: ['CUSTOMER'], onContracts: on(0, 2) }), true)
    expect(read.said).toEqual(['CUSTOMER'])
    expect(read.onContracts).toEqual(['CLIENT'])
    expect(read.groups).toEqual(['CUSTOMER', 'CLIENT'])
  })

  it('a company loaded as a client is never shown as a customer until a person says so', () => {
    // It holds the Customer position the old door wrote, and it is billed on three contracts.
    const loaded = groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'], onContracts: on(3, 3, 0) }), true)
    expect(loaded.needsClassifying).toBe(true)
    expect(loaded.groups).toEqual([])
    expect(loaded.said).toEqual([])
    expect(loaded.suggestion).toBe('Billed on 3 contracts. Worksite on 3 contracts, because no other end client is named on them.')
    const said = groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'], saidCustomerAt: '2026-11-22T10:00:00Z', onContracts: on(3, 3, 0) }), true)
    expect(said.needsClassifying).toBe(false)
    expect(said.said).toEqual(['CUSTOMER'])
    expect(said.groups).toEqual(['CUSTOMER', 'CLIENT'])
  })

  it('a company loaded as a client and said to be only a client is a client, and its old register row does not make it a customer', () => {
    const read = groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'], saidClientAt: '2026-11-22T10:00:00Z' }), true)
    expect(read.needsClassifying).toBe(false)
    expect(read.groups).toEqual(['CLIENT'])
  })

  it('a company of any other kind that holds the Customer position is a customer as before, with nothing to classify', () => {
    const read = groupsOf(facts({ kind: 'VENDOR', positions: ['CUSTOMER', 'SUPPLIER'] }), true)
    expect(read.needsClassifying).toBe(false)
    expect(read.groups).toEqual(['CUSTOMER', 'SUPPLIER'])
  })

  it('a company in none of the three reads Not classified where it is the firm’s own record, and is never both that and Needs classifying', () => {
    const none = groupsOf(facts({ kind: 'UNCLASSIFIED', notClassified: true }), true)
    expect(none).toMatchObject({ groups: [], needsClassifying: false, notClassified: true, other: null })
    const loaded = groupsOf(facts({ kind: 'CLIENT', notClassified: true }), true)
    expect(loaded).toMatchObject({ needsClassifying: true, notClassified: false, other: null, suggestion: 'On no contract yet.' })
  })

  it('a firm on Etyme that has not linked is never flagged, so the list says nothing of its Kind', () => {
    const read = groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'], notLinked: true }), true)
    expect(read).toMatchObject({ needsClassifying: false, groups: [], other: 'NOT_LINKED' })
  })

  it('a supplier on a buy line is a supplier whether or not anybody wrote it on the register', () => {
    expect(groupsOf(facts({ onContracts: on(0, 0, 0, 2) }), true).groups).toEqual(['SUPPLIER'])
    expect(contractsSay(on(0, 0, 0, 2))).toBe('Supplies on 2 contracts.')
  })
})

describe('a firm that only buys', () => {
  it('a firm that only buys has no customers group', () => {
    expect(sellsToSomebody('CLIENT')).toBe(false)
    for (const k of ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP']) expect(sellsToSomebody(k), k).toBe(true)
    const rows = [
      groupsOf(facts({ kind: 'VENDOR', positions: ['SUPPLIER'] }), false),
      // Whatever its register or a stray stamp says, a buyer reads no customer, no client and nothing to classify.
      groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'], saidCustomerAt: '2026-11-22T10:00:00Z', saidClientAt: '2026-11-22T10:00:00Z', onContracts: on(2, 2) }), false),
    ]
    expect(rows[0].groups).toEqual(['SUPPLIER'])
    expect(rows[1]).toMatchObject({ groups: [], needsClassifying: false })
    const t = groupTotals(rows, false)
    expect(t).toMatchObject({ customers: 0, clients: 0, needsClassifying: 0, suppliers: 1 })
    expect(groupsAddUpSays(t)).toBe('2 companies: 1 supplier, 1 on your list through work, with no position yet.')
    expect(groupsAddUpTo(t)).toBe(2)
  })

  it('it is told in a sentence that it has suppliers and its own sites, when it tries to classify', () => {
    const v = mayClassify({ me: { id: 'me', name: 'Northbend Athletic', kind: 'CLIENT' }, permissions: ['*'], other: { id: 'o', name: 'Brightmoor Staffing', kind: 'VENDOR' }, positions: [], customer: true })
    expect(v).toMatchObject({ ok: false, status: 422, code: 'ONLY_BUYS' })
    if (!v.ok) expect(v.says).toBe('Northbend Athletic buys from its suppliers and bills nobody, so it has no customers or end clients to name. Its suppliers are under Suppliers, and its own sites are under Settings, Sites.')
  })

  it('the Companies page draws no Customers tile, no Clients tile and no Needs classifying for it', () => {
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain("...(g.sells ? [{ key: 'CUSTOMER' as const, label: 'Customers', count: g.customers, sub: 'pay you' }] : []),")
    expect(page).toContain("...(g.sells ? [{ key: 'CLIENT' as const, label: 'Clients', count: g.clients, sub: 'where your people work' }] : []),")
    expect(page).toContain("...(totals.sells ? [{ key: 'CUSTOMER' as const, label: 'Customers', count: customerCount }, { key: 'CLIENT' as const, label: 'Clients', count: totals.clients }] : []),")
  })
})

describe('how the list adds up', () => {
  const mk = (groups: GroupsRead['groups'], over: Partial<GroupsRead> = {}): GroupsRead => ({ said: [], onContracts: groups, groups, needsClassifying: false, notClassified: false, other: null, suggestion: '', ...over })
  const rows = [
    mk(['CUSTOMER']), mk(['CUSTOMER', 'CLIENT']), mk(['CLIENT']), mk(['SUPPLIER']), mk(['CUSTOMER', 'CLIENT', 'SUPPLIER']),
    mk([], { needsClassifying: true }), mk([], { needsClassifying: true }), mk([], { notClassified: true }), mk([], { other: 'NOT_LINKED' }), mk([], { other: 'PRIME_OR_MSP' }),
  ]

  it('the groups on the Companies list add up to the total the list says', () => {
    const t = groupTotals(rows, true)
    expect(t).toEqual({ sells: true, total: 10, customers: 3, clients: 3, suppliers: 2, inTwo: 1, inThree: 1, needsClassifying: 2, notClassified: 1, primesOrMsps: 1, worksWithYou: 0, notLinked: 1 })
    expect(groupsAddUpTo(t)).toBe(t.total)
  })

  it('one line says how: every group, how many are in two, and how many still need classifying', () => {
    expect(groupsAddUpSays(groupTotals(rows, true))).toBe('10 companies: 3 customers, 3 clients, 2 suppliers, 1 in two groups, 1 in all three, 2 need classifying, 1 not classified, 1 prime or MSP only, 1 not linked yet.')
    expect(groupsAddUpSays(groupTotals([mk(['CUSTOMER'])], true))).toBe('1 company: 1 customer, 0 clients, 0 suppliers.')
  })

  it('every company is counted once however the groups fall, for every mix of facts', () => {
    const many: GroupsRead[] = []
    for (const kind of ['VENDOR', 'CLIENT', 'UNCLASSIFIED']) for (const positions of [[], ['CUSTOMER'], ['SUPPLIER'], ['CUSTOMER', 'SUPPLIER'], ['PRIME']] as const)
      for (const c of [on(), on(1, 1, 0), on(0, 1), on(1, 0), on(0, 0, 0, 1)]) for (const stamp of [null, '2026-11-22T10:00:00Z'])
        for (const notLinked of [false, true]) many.push(groupsOf(facts({ kind, positions: [...positions], onContracts: c, saidClientAt: stamp, notLinked, notClassified: positions.length === 0 }), true))
    const t = groupTotals(many, true)
    expect(groupsAddUpTo(t)).toBe(many.length)
  })

  it('the Companies page reads its tiles, its tabs and its line from the route’s one count', () => {
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain('const totals: GroupTotals = groupsRead?.totals ?? groupTotals(companies.map(groupOfRow), true)')
    expect(page).toContain('{groupsRead?.says ?? groupsAddUpSays(totals)}')
    expect(page).toContain('{companyTilesShown(tiles, totals).map((t) => (')
    const route = src('src/app/api/companies/route.ts')
    expect(route).toContain('const groups = caller.company ? await groupsFor(caller.company, companies, at, notLinked) : new Map()')
    expect(route).toContain('...totalsOver(groups.values(), caller.company.kind),')
    // The Classify page and the pickers read the same reader.
    expect(src('src/app/api/companies/groups.ts')).toContain('const groups = await groupsFor(me, companies, at, notLinked)')
    expect(src('src/app/api/companies/groups/route.ts')).toContain('const list = await listWithGroups(caller)')
  })
})

describe('the two pickers', () => {
  const row = (id: string, name: string, read: Partial<GroupsRead>) => ({ id, name, read: { said: [], onContracts: [], groups: [], needsClassifying: false, notClassified: false, other: null, suggestion: '', ...read } as GroupsRead })
  const rows = [
    row('p', 'Tallis Consulting Group', { groups: ['CUSTOMER'] }),
    row('s', 'Orrin Freight Lines', { groups: ['CLIENT'] }),
    row('b', 'Wexcombe Insurance', { groups: ['CUSTOMER', 'CLIENT'] }),
    row('v', 'Quillon Technical', { groups: ['SUPPLIER'] }),
    row('l', 'Pellam Foods', { needsClassifying: true }),
    row('n', 'Harrow Vale Clinics', { notClassified: true }),
  ]

  it('the bill-to picker offers customers and the worksite picker offers clients', () => {
    expect(pickerOptions('BILL_TO', rows).filter((o) => !o.note).map((o) => o.name)).toEqual(['Tallis Consulting Group', 'Wexcombe Insurance'])
    expect(pickerOptions('WORKSITE', rows).filter((o) => !o.note).map((o) => o.name)).toEqual(['Orrin Freight Lines', 'Wexcombe Insurance'])
  })

  it('neither offers a company that still needs classifying without saying so, and neither offers a supplier or a company not classified', () => {
    for (const what of ['BILL_TO', 'WORKSITE'] as const) {
      const options = pickerOptions(what, rows)
      expect(options[options.length - 1]).toEqual({ id: 'l', name: 'Pellam Foods', note: NEEDS_CLASSIFYING.toLowerCase() })
      expect(options.map((o) => o.id)).not.toContain('v')
      expect(options.map((o) => o.id)).not.toContain('n')
    }
  })
})

describe('the classify act', () => {
  const me = { id: 'me', name: 'Larkfield Staffing', kind: 'VENDOR' }
  const other = { id: 'o', name: 'Pellam Foods', kind: 'CLIENT' }

  it('the Owner, an Admin and the seat that manages who the firm trades with may classify; a recruiter may not', () => {
    for (const permissions of [['*'], ['vendors.manage']]) {
      expect(mayClassify({ me, permissions, other, positions: ['CUSTOMER'], customer: true }).ok).toBe(true)
    }
    const v = mayClassify({ me, permissions: ['requirements.read', 'submissions.write'], other, positions: [], customer: true })
    expect(v).toMatchObject({ ok: false, status: 403 })
    if (!v.ok) expect(v.says).toBe("Classifying a company on Larkfield Staffing's list is for the Owner, an Admin or whoever manages who you trade with. Ask them to do it, or ask them for that access.")
  })

  it('a customer by Extend, on a company that was not loaded as a client, is never taken off by an unticked box', () => {
    const v = mayClassify({ me, permissions: ['*'], other: { id: 'o', name: 'Tallis Consulting Group', kind: 'VENDOR' }, positions: ['CUSTOMER'], customer: false })
    expect(v).toMatchObject({ ok: false, status: 409, code: 'CUSTOMER_BY_EXTEND' })
    // A company loaded as a client may be said not to be a customer: its row was never a person's word.
    expect(mayClassify({ me, permissions: ['*'], other, positions: ['CUSTOMER'], customer: false }).ok).toBe(true)
  })

  it('classifying a company is on the ledger with who and when, and can be changed', () => {
    expect(classifiedSays('Nadia Larkfield', 'Pellam Foods', { customer: true, client: true })).toBe('Nadia Larkfield said Pellam Foods is a customer (pays us) and a client (where our people work).')
    const route = src('src/app/api/companies/[id]/classify/route.ts')
    // One ledger row per save, in the same transaction as the register rows.
    expect(route).toContain("companyId: me.id, recordType: 'Company', recordId: other.id, action: 'COMPANY_CLASSIFIED',")
    expect(route).toContain('summary: message, personId: caller.person.id, heldAs: roleWords(role?.name ?? null), actingEntityId: ask.actingEntityId,')
    expect(route).toContain('const stamp = { classifiedAt: now, classifiedById: caller.person.id }')
    // Changed later: an unticked customer takes the person's word off the row and never deletes the row or touches the Kind.
    expect(route).toContain("data: { classifiedAt: null, classifiedById: null } })")
    expect(route).not.toMatch(/company\.update|counterparty\.deleteMany\(\{ where: \{[^}]*relationship: 'CLIENT'/)
    // Every refusal is logged before it is sent.
    expect(route.match(/return NextResponse\.json\(\{ error/g)?.length).toBe(2)
    expect(route).toContain('await recordRefusal([{ companyId: other?.id ?? me.id }], {')
  })

  it('the Classify page saves one row at a time and offers no button that applies every suggestion', () => {
    const page = src('src/app/dashboard/companies/classify/page.tsx')
    expect(page).toContain('fetch(`/api/companies/${row.id}/classify`, {')
    expect(page).not.toMatch(/apply all|Apply all|Save all|Promise\.all/)
    // Nothing is ticked for the reader from what the contracts suggest.
    expect(page).toContain("useState(row.said.includes('CUSTOMER'))")
    expect(page).toContain("useState(row.said.includes('CLIENT'))")
  })

  it('nothing in the reader writes to a row: a company loaded as a client is flagged, never relabeled', () => {
    const reader = src('src/app/api/companies/groups.ts')
    expect(reader).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/)
  })
})
