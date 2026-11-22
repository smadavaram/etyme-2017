import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  groupsOf, groupTotals, groupsAddUpTo, groupsAddUpSays, contractsSay, pickerOptions, sellsToSomebody, mayClassify, classifiedSays,
  ON_NO_CONTRACT, NEEDS_CLASSIFYING, type GroupFacts, type GroupsRead,
  ADD_AS_CHOICES, addAsMeans, mayAddCompany, groupsComeFrom, entityForSaying, SAY_WHICH_ENTITY, pickerLabel, NO_CUSTOMERS_SAYS, SAME_AS_CUSTOMER,
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

// ── The loose ends (record 110, A1, the second pass) ──────────────────

describe('a person who says it once is not asked twice', () => {
  const day = '2026-11-22T15:00:00.000Z'

  it('a company a person adds as a customer is a customer at once and never reads Needs classifying', () => {
    // The clients door writes a company of Kind client; the person's word is the stamp on its row.
    const g = groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'], saidCustomerAt: day }), true)
    expect(g.needsClassifying).toBe(false)
    expect(g.groups).toEqual(['CUSTOMER'])
    expect(g.said).toEqual(['CUSTOMER'])
    // The same company with no stamp is one an import or an old door loaded: it still needs classifying.
    expect(groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'] }), true).needsClassifying).toBe(true)
  })

  it('Add a company, the clients door and Extend to Customer each stamp who said it and when, and write the ledger row the Classify page writes', () => {
    const writer = src('src/app/api/companies/positions.ts')
    expect(writer).toContain("if (input.customer) await db.counterparty.updateMany({ where: { ...row, relationship: 'CLIENT' }, data: stamp })")
    expect(writer).toContain("companyId: input.me, recordType: 'Company', recordId: input.other.id, action: 'COMPANY_CLASSIFIED',")
    expect(writer).toContain('summary: classifiedSays(input.by.name, input.other.name, input),')
    // Nothing a person said before is taken off by saying one more thing.
    const said = writer.slice(writer.indexOf('export async function sayWhatItIs'), writer.indexOf('/** The Supplier position'))
    expect(said).not.toMatch(/deleteMany|classifiedAt: null/)
    expect(src('src/app/api/companies/route.ts').match(/sayWhatItIs\(tx, \{/g)?.length).toBe(2)
    expect(src('src/app/api/clients/route.ts').match(/await sayWhatItIs\(prisma, \{/g)?.length).toBe(2)
    expect(src('src/app/api/companies/[id]/extend/route.ts')).toContain("const said = verdict.as !== 'CUSTOMER' || await sayWhatItIs(tx, {")
  })

  it('Add a company asks it in the trade’s words: a customer pays us, a client is where our people work', () => {
    expect(ADD_AS_CHOICES.map((c) => c.words)).toEqual([
      'A customer: they pay us',
      'A client: where our people work',
      'A supplier: we buy from them',
      'A prime: our work flows through them',
      'An MSP: they run the program we work in',
    ])
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain('{ADD_AS_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.words}</option>)}')
    expect(page).not.toContain('A client — they buy from us')
    // A second role is given later, and the form says where.
    expect(addAsMeans('CLIENT')).toBe('It is under Customers at once. If your people also work there, tick Client on its row later.')
    expect(addAsMeans('END_CLIENT')).toBe('It is under Clients at once: a place your people work. Nothing is billed to it unless you also make it a customer.')
    expect(addAsMeans('SUPPLIER')).toBeNull()
  })

  it('a company may be added as a client, where our people work, and the reply says so', () => {
    const seat = { seatedAt: { id: 'me', name: 'Larkfield Staffing' }, permissions: ['vendors.manage'], kind: 'CLIENT' }
    expect(mayAddCompany({ ...seat, relationship: 'END_CLIENT' })).toMatchObject({ ok: true, ownsIt: false })
    expect(mayAddCompany({ ...seat, relationship: 'END_CLIENT' }).says).toContain("Recorded on Larkfield Staffing's Companies list as a client.")
    expect(mayAddCompany({ ...seat, relationship: 'CLIENT' }).says).toContain("Recorded on Larkfield Staffing's Companies list as a customer.")
    expect(mayAddCompany({ ...seat, relationship: 'WORKSITE' }).ok).toBe(false)
  })

  it('a firm with several legal entities is asked which one, and nothing is stamped until it says', () => {
    expect(entityForSaying([], null)).toEqual({ ok: true, id: null })
    expect(entityForSaying(['e1'], null)).toEqual({ ok: true, id: 'e1' })
    expect(entityForSaying(['e1', 'e2'], null)).toEqual({ ok: false })
    expect(entityForSaying(['e1', 'e2'], 'e2')).toEqual({ ok: true, id: 'e2' })
    // Another firm's entity is never accepted.
    expect(entityForSaying(['e1'], 'other')).toEqual({ ok: false })
    expect(SAY_WHICH_ENTITY('Pellam Foods')).toBe('Your firm has more than one legal entity, so Pellam Foods is not under Customers or Clients yet. Open it on Companies, choose the entity and tick what it is.')
  })
})

describe('a prime that pays the firm', () => {
  it('a prime that is billed on a contract is counted under Customers, whatever kind of company it is', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI']) {
      const g = groupsOf(facts({ kind, positions: ['PRIME'], onContracts: on(2, 0) }), true)
      expect(g.groups, kind).toEqual(['CUSTOMER'])
      expect(g.needsClassifying, kind).toBe(false)
      expect(g.other, kind).toBeNull()
    }
  })

  it('a prime that a person said pays us is counted under Customers', () => {
    expect(groupsOf(facts({ kind: 'VENDOR', positions: ['CUSTOMER', 'PRIME'] }), true).groups).toEqual(['CUSTOMER'])
    expect(groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER', 'PRIME'], saidCustomerAt: '2026-11-22T15:00:00.000Z' }), true).groups).toEqual(['CUSTOMER'])
  })

  it('"prime or MSP only" is only for one that is neither billed nor said to pay us', () => {
    const rows = [
      groupsOf(facts({ positions: ['PRIME'] }), true),
      groupsOf(facts({ positions: ['PRIME'], onContracts: on(1, 0) }), true),
      groupsOf(facts({ positions: ['CUSTOMER', 'PRIME'] }), true),
    ]
    expect(rows.map((r) => r.other)).toEqual(['PRIME_OR_MSP', null, null])
    const t = groupTotals(rows, true)
    expect(t.customers).toBe(2)
    expect(t.primesOrMsps).toBe(1)
    expect(groupsAddUpTo(t)).toBe(3)
    expect(groupsAddUpSays(t)).toBe('3 companies: 2 customers, 0 clients, 0 suppliers, 1 prime or MSP only.')
  })
})

describe('the company drawer', () => {
  const dayWords = (iso: string) => `day ${iso.slice(0, 10)}`

  it('says where each group comes from: who said it and on which day, and what the contracts say', () => {
    const read = groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER', 'SUPPLIER'], saidCustomerAt: '2026-11-22T15:00:00.000Z', onContracts: on(3, 2, 2, 1) }), true)
    expect(groupsComeFrom(read, on(3, 2, 2, 1), { CUSTOMER: { at: '2026-11-22T15:00:00.000Z', byName: 'Nadia Larkfield' } }, dayWords)).toEqual([
      { group: 'CUSTOMER', says: 'Customer: said by Nadia Larkfield on day 2026-11-22; billed on 3 contracts.' },
      { group: 'CLIENT', says: 'Client: worksite on 2 contracts.' },
      { group: 'SUPPLIER', says: 'Supplier: on your list as a supplier; supplies on 1 contract.' },
    ])
  })

  it('a customer from before the rule, with nobody’s name on it, says it is on the list and never invents who said it', () => {
    const read = groupsOf(facts({ kind: 'VENDOR', positions: ['CUSTOMER'] }), true)
    expect(groupsComeFrom(read, ON_NO_CONTRACT, {}, dayWords)).toEqual([{ group: 'CUSTOMER', says: 'Customer: on your list as a customer.' }])
  })

  it('shows the three groups and the same two checkboxes as the Classify page, for a seat that may', () => {
    const page = src('src/app/dashboard/companies/page.tsx')
    expect(page).toContain('{classify.sells && <CustomerOrClient company={company} classify={classify}')
    expect(page).toContain('fetch(`/api/companies/${encodeURIComponent(company.id)}/classify`, {')
    expect(page).toContain('body: JSON.stringify(classifyBody({ customer, client, actingEntityId: entity })),')
    const drawer = page.slice(page.indexOf('function CustomerOrClient'), page.indexOf('function PositionsPanel'))
    expect(drawer).toContain('{classify.may && (')
    expect(drawer).toContain('{SAY_CUSTOMER}')
    expect(drawer).toContain('{SAY_CLIENT}')
    // Never a greyed button without words.
    expect(drawer).toContain('disabled={busy || nothing || needsEntity}')
    expect(drawer).toContain('Tick one or both to save.')
    expect(drawer).toContain('Choose the legal entity to save.')
    // The seat that may, and the entities, come from the route that scoped the list.
    expect(src('src/app/api/companies/route.ts')).toContain("mayClassify: sellsToSomebody(caller.company.kind) && hasPermission(caller.permissions, 'vendors.manage'),")
  })

  it('its history lists the classify act from the record ledger', () => {
    const reader = src('src/app/api/companies/positions.ts')
    expect(reader).toContain("const said: HistoryRow[] = (await recordTimeline(me, 'Company', otherId, db))")
    expect(reader).toContain(".filter((r) => r.action === 'COMPANY_CLASSIFIED')")
  })
})

describe('the pickers on Record a placement', () => {
  const form = src('src/app/dashboard/contracts/page.tsx')

  it('“Customer (bill to)” reads who can be billed and “End client” reads where a person can work, from the one reader', () => {
    expect(form).toContain("fetch('/api/companies/groups?for=bill-to'),")
    expect(form).toContain("fetch('/api/companies/groups?for=worksite'),")
    expect(form).toContain('<label className={labelClass}>Customer (bill to) *</label>')
    expect(form).toContain('<label className={labelClass}>End client (where the consultant works)</label>')
    expect(form).not.toContain("fetch('/api/clients')")
  })

  it('the end client’s empty choice is “Same as the customer”', () => {
    expect(SAME_AS_CUSTOMER).toBe('Same as the customer')
    expect(form).toContain('<option value="">{SAME_AS_CUSTOMER}</option>')
    expect(form).not.toContain('Same as billing client')
  })

  it('an option that still needs classifying shows those words beside its name', () => {
    expect(pickerLabel({ id: 'l', name: 'Pellam Foods', note: 'needs classifying' })).toBe('Pellam Foods (needs classifying)')
    expect(pickerLabel({ id: 'p', name: 'Tallis Consulting Group', note: null, onEtyme: true })).toBe('Tallis Consulting Group')
    // A company only on the firm's own list still says so: its bill goes by email.
    expect(pickerLabel({ id: 'h', name: 'Harrow Vale Clinics', note: null, onEtyme: false })).toBe('Harrow Vale Clinics (not on Etyme yet)')
    expect(form.match(/\{pickerLabel\(c\)\}/g)?.length).toBe(2)
  })

  it('with nobody to bill yet the form says to add a customer from Companies', () => {
    expect(NO_CUSTOMERS_SAYS).toBe('No customers yet. Add one from Companies: they do not need to be on Etyme.')
    expect(form).toContain('<Link href={NO_CLIENTS_HREF} className="text-etyme-action hover:underline">{NO_CUSTOMERS_SAYS}</Link>')
  })
})

describe('lists a supplier reads', () => {
  it('the clients list and the onboarding checklist never show a company that needs classifying as a customer', () => {
    const clients = src('src/app/api/clients/route.ts')
    expect(clients).toContain('const waiting = [...byId.keys()].filter((id) => read.get(id)?.needsClassifying)')
    expect(clients).toContain('for (const id of waiting) byId.delete(id)')
    expect(src('src/app/api/onboarding/readiness/route.ts')).toContain('.filter((c) => !read.get(c.otherCompanyId)?.needsClassifying)')
  })
})

describe('phone width and words', () => {
  const companies = src('src/app/dashboard/companies/page.tsx')
  const classifyPage = src('src/app/dashboard/companies/classify/page.tsx')

  it('at phone width the Companies counts stack as lines, one under another, and are tiles from a small tablet up', () => {
    expect(companies).toContain('<div className="mb-2 hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">')
    expect(companies).toContain('<ul className="mb-2 rounded-panel border border-etyme-rule bg-etyme-surface sm:hidden">')
    // The words wrap and the count keeps its own place: nothing is cut off.
    const stacked = companies.slice(companies.indexOf('sm:hidden">'), companies.indexOf('{/* How the tiles add up'))
    expect(stacked).toContain('min-w-0 break-words')
    expect(stacked).toContain('shrink-0')
    expect(stacked).not.toMatch(/truncate|whitespace-nowrap|overflow-hidden/)
  })

  it('at phone width a Classify row stacks its name, its two boxes and Save, one per line', () => {
    expect(classifyPage).toContain('<div className="flex w-full flex-col items-start gap-y-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">')
    expect(classifyPage).not.toMatch(/truncate|whitespace-nowrap|grid-cols-/)
  })

  it('no machine word is read by a person on Companies, Classify companies or Record a placement', () => {
    const MACHINE = /\b(END_CLIENT|UNCLASSIFIED|CONSULTANT_CORP|NEEDS_CLASSIFYING|NOT_CLASSIFIED|PRIME_OR_MSP|WORKS_WITH_YOU|NOT_LINKED|BILL_TO|WORKSITE)\b/
    // Every sentence these screens take from the shared reader.
    const words = [
      ...ADD_AS_CHOICES.map((c) => c.words), addAsMeans('CLIENT'), addAsMeans('END_CLIENT'), addAsMeans('PRIME'),
      NEEDS_CLASSIFYING, NO_CUSTOMERS_SAYS, SAME_AS_CUSTOMER, SAY_WHICH_ENTITY('Pellam Foods'),
      pickerLabel({ id: 'l', name: 'Pellam Foods', note: NEEDS_CLASSIFYING.toLowerCase(), onEtyme: false }),
      groupsAddUpSays(groupTotals([groupsOf(facts({ kind: 'CLIENT', positions: ['CUSTOMER'] }), true), groupsOf(facts({ positions: ['PRIME'] }), true), groupsOf(facts({ notClassified: true }), true)], true)),
      ...groupsComeFrom(groupsOf(facts({ positions: ['CUSTOMER', 'SUPPLIER'], onContracts: on(1, 1, 1, 1) }), true), on(1, 1, 1, 1), {}, (d) => d).map((l) => l.says),
      classifiedSays('Nadia Larkfield', 'Pellam Foods', { customer: true, client: true }),
    ]
    for (const w of words) expect(w, String(w)).not.toMatch(MACHINE)
    for (const w of words) expect(w, String(w)).not.toMatch(/\b(CLIENT|CUSTOMER|SUPPLIER|VENDOR|GSI)\b/)
    // And on the screens themselves: a machine word is only ever a value in
    // quotes, never text between two tags and never inside a sentence.
    for (const [name, page] of [['Companies', companies], ['Classify companies', classifyPage], ['Record a placement', src('src/app/dashboard/contracts/page.tsx')]] as const) {
      const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const betweenTags = [...code.matchAll(/>([^<>{}=;()]*)</g)].map((m) => m[1]).filter((t) => /\b(END_CLIENT|UNCLASSIFIED|CONSULTANT_CORP|CLIENT|VENDOR)\b/.test(t))
      expect(betweenTags, name).toEqual([])
      const sentences = [...code.matchAll(/'([^'\n]* [^'\n]*)'|`([^`\n]* [^`\n]*)`/g)].map((m) => m[1] ?? m[2]).filter((t) => MACHINE.test(t) && !/[=?:|&]/.test(t))
      expect(sentences, name).toEqual([])
    }
  })
})
