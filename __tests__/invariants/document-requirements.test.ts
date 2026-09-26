import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CANNOT_BE_WAIVED,
  OWED_BY,
  defaultItemsFor,
  effectiveRequirements,
  mayWaive,
  owedByFor,
  seedDefaultsFor,
  shapeOf,
  type RequirementRow,
} from '@/lib/document-requirements'
import { AUTHORISATION_KEYS } from '@/lib/contract-clearance'
import { CHECKLIST } from '@/lib/supplier-onboarding'
import { OUTBOUND_PACKS } from '@/lib/outbound-pack'
import { PACKETS } from '@/lib/packets'
import { builtInType } from '@/lib/document-type'

/**
 * What a line requires on paper, and who owes it.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * Until today three desks each kept their own list of what a placement
 * needed and nothing said what THIS line required, so a client could not
 * ask for one more document on one role and a prime could not pass a
 * client's list down to the firm that actually employs the person.
 */

const ORDER_SAYS = 'required by Northbend Athletic’s order PO-2026-1'

/** A header row, as it comes out of the database. */
const orderRow = (over: Partial<RequirementRow> & { documentTypeKey: string }): RequirementRow => ({
  id: `order-${over.documentTypeKey}`,
  required: true,
  owedBy: 'SUPPLIER',
  blocks: null,
  inheritedFromId: null,
  note: null,
  waivedReason: null,
  waivedById: null,
  waivedAt: null,
  ...over,
})

describe('what a line requires, and where the answer came from', () => {
  it('a line with no set of its own inherits its order’s', () => {
    const items = effectiveRequirements({
      shape: 'SUB_VENDOR',
      orderRows: [orderRow({ documentTypeKey: 'HOT_FLOOR_INDUCTION', owedBy: 'WORKER' })],
      orderSays: ORDER_SAYS,
    })

    const induction = items.find((i) => i.key === 'HOT_FLOOR_INDUCTION')!
    expect(induction.from).toBe('ORDER')
    expect(induction.says).toBe(ORDER_SAYS)
    // And the shape's own floor is still under it — an order adds to the
    // defaults, it does not replace them.
    expect(items.map((i) => i.key)).toContain('INSURANCE_GL')
  })

  it('a line may override one item and the override says who and why', () => {
    const items = effectiveRequirements({
      shape: 'SUB_VENDOR',
      orderRows: [orderRow({ documentTypeKey: 'BACKGROUND_CHECK', owedBy: 'WORKER' })],
      lineRows: [
        orderRow({
          id: 'line-bgc',
          documentTypeKey: 'BACKGROUND_CHECK',
          owedBy: 'WORKER',
          inheritedFromId: 'order-BACKGROUND_CHECK',
          required: false,
          waivedReason: 'The plant runs its own screening on every badge holder.',
          waivedById: 'dana',
          waivedAt: new Date('2026-09-12T00:00:00Z'),
        }),
      ],
      orderSays: ORDER_SAYS,
      waiverNames: { dana: 'Dana Whitlock' },
    })

    const bgc = items.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(bgc.from).toBe('LINE')
    expect(bgc.says).toContain('set on this line, over')
    expect(bgc.says).toContain('Northbend Athletic')
    expect(bgc.waivedSays).toContain('Dana Whitlock')
    expect(bgc.waivedSays).toContain('September 12')
    expect(bgc.waivedSays).toContain('runs its own screening')
  })

  it('a line on no order gets the default set for its shape, and every item says it is a default', () => {
    const items = effectiveRequirements({ shape: 'W2' })
    expect(items.length).toBeGreaterThan(3)
    for (const i of items) {
      expect(i.from, i.key).toBe('DEFAULT')
      expect(i.says, i.key).toBe('the default for a W2 start')
      // Nothing was written, so nothing has a row id.
      expect(i.id, i.key).toBeNull()
    }
  })

  it('a W2 line asks the worker for an I-9 and asks no supplier for insurance', () => {
    const items = effectiveRequirements({ shape: 'W2', names: { WORKER: 'Priya Raman' } })

    const i9 = items.find((i) => i.key === 'I9_EVERIFY')!
    expect(i9.owedBy).toBe('WORKER')
    expect(i9.owedByName).toBe('Priya Raman')
    expect(i9.blocks).toBe(true)

    expect(items.map((i) => i.key)).not.toContain('INSURANCE_GL')
    expect(items.map((i) => i.key)).not.toContain('GOOD_STANDING')
    expect(items.filter((i) => i.owedBy === 'SUPPLIER')).toEqual([])
  })

  it('a sub-vendor line asks the supplier for insurance and good standing', () => {
    const items = effectiveRequirements({ shape: 'SUB_VENDOR', names: { SUPPLIER: 'Veritan Talent' } })
    const keys = items.map((i) => i.key)

    expect(keys).toContain('INSURANCE_GL')
    expect(keys).toContain('INSURANCE_WC')
    expect(keys).toContain('GOOD_STANDING')
    for (const key of ['INSURANCE_GL', 'GOOD_STANDING']) {
      const item = items.find((i) => i.key === key)!
      expect(item.owedBy, key).toBe('SUPPLIER')
      expect(item.owedByName, key).toBe('Veritan Talent')
    }

    // The person one rung down is the sub-vendor's own employee, and
    // their I-9 belongs on the sub-vendor's own buy line, not copied up.
    expect(keys).not.toContain('I9_EVERIFY')
  })

  it('a certificate of good standing stops a supplier the way lapsed cover does', () => {
    // A firm not in good standing may not lawfully contract in the state
    // that registered it. It shipped with no consequence at all until
    // today, so a lapse was invisible unless a client had defined the
    // type itself.
    expect(builtInType('GOOD_STANDING')!.blocks).toBe(true)
    const item = effectiveRequirements({ shape: 'SUB_VENDOR' }).find((i) => i.key === 'GOOD_STANDING')!
    expect(item.blocks).toBe(true)
  })

  it('a waived item is still listed, marked waived, with the reason and the name', () => {
    const items = effectiveRequirements({
      shape: 'SUB_VENDOR',
      lineRows: [
        orderRow({
          id: 'line-msa',
          documentTypeKey: 'MSA',
          waivedReason: 'One purchase order for one season; no agreement was papered.',
          waivedById: 'dana',
          waivedAt: new Date('2026-09-12T00:00:00Z'),
        }),
      ],
      waiverNames: { dana: 'Dana Whitlock' },
    })

    const msa = items.find((i) => i.key === 'MSA')!
    expect(msa.waived).toBe(true)
    expect(msa.waivedSays).toBe('Waived by Dana Whitlock on September 12: One purchase order for one season; no agreement was papered.')
    // Still on the list. A waiver is a decision on the record, not a
    // deletion — never silently permit.
    expect(items.map((i) => i.key)).toContain('MSA')
    expect(msa.blocks).toBe(false)
  })

  it('a waiver cannot be recorded against work authorization, and one already on the record is not honored', () => {
    const verdict = mayWaive('I9_EVERIFY', 'The client is happy to start her Monday.')
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('cannot be waived')

    const items = effectiveRequirements({
      shape: 'W2',
      lineRows: [
        orderRow({
          id: 'line-i9',
          documentTypeKey: 'I9_EVERIFY',
          owedBy: 'WORKER',
          required: false,
          blocks: false,
          waivedReason: 'The client is happy to start her Monday.',
          waivedById: 'dana',
          waivedAt: new Date('2026-09-12T00:00:00Z'),
        }),
      ],
      waiverNames: { dana: 'Dana Whitlock' },
    })

    const i9 = items.find((i) => i.key === 'I9_EVERIFY')!
    expect(i9.required).toBe(true)
    expect(i9.blocks).toBe(true)
    expect(i9.waived).toBe(false)
    expect(i9.waiverRefused).toBe(true)
    expect(i9.waivedSays).toContain('it cannot be')
  })

  it('a waiver with no reason is refused, because a waiver with no reason is a silent permit', () => {
    expect(mayWaive('BACKGROUND_CHECK', '   ').ok).toBe(false)
    expect(mayWaive('BACKGROUND_CHECK', 'The plant screens every badge holder itself.').ok).toBe(true)
  })

  it('the documents nobody may waive are the same ones a start cannot happen without', () => {
    // Two lists, one rule. They are declared apart so that clearance can
    // read the requirements door without the two files importing each
    // other, which makes this test the only thing holding them together.
    expect([...CANNOT_BE_WAIVED].sort()).toEqual([...AUTHORISATION_KEYS].sort())
  })

  it('a requirement names the party that owes it by its role, never by a person, so a line whose subject is not a person still carries a set', () => {
    // The founder asked whether a robot or an AI agent could be a line
    // paid by the hour with a required set of its own. The answer is
    // later; this table should not have to change for it.
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const model = schema.match(/^model DocumentRequirement \{([\s\S]*?)^\}/m)![1]
    expect(model).toMatch(/owedBy\s+DocumentOwedBy/)
    expect(model).not.toMatch(/owedByPersonId/)
    expect(model).not.toMatch(/owedBy\s+String/)

    const items = effectiveRequirements({ shape: 'W2', names: {} })
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) {
      expect(OWED_BY, i.key).toContain(i.owedBy)
      // No name to resolve, and the set stands anyway.
      expect(i.owedByName, i.key).toBeNull()
    }
  })

  it('a requirement names exactly one owner: an order, a sell line or a buy line', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const model = schema.match(/^model DocumentRequirement \{([\s\S]*?)^\}/m)![1]

    // All three nullable, because exactly one is set on any row.
    expect(model).toMatch(/workOrderId\s+String\?/)
    expect(model).toMatch(/sellContractId\s+String\?/)
    expect(model).toMatch(/buyContractId\s+String\?/)
    // And one row per document per owner: two rows asking for the same
    // paper on one line is two answers to one question.
    expect(model).toMatch(/@@unique\(\[workOrderId,\s*documentTypeKey\]\)/)
    expect(model).toMatch(/@@unique\(\[sellContractId,\s*documentTypeKey\]\)/)
    expect(model).toMatch(/@@unique\(\[buyContractId,\s*documentTypeKey\]\)/)
  })

  it('a sell line carries the customer’s paper and a buy line carries the paper of whoever is paid', () => {
    const sell = effectiveRequirements({ shape: 'CUSTOMER', names: { CUSTOMER: 'Northbend Athletic' } })
    const msa = sell.find((i) => i.key === 'MSA')!
    expect(msa.owedBy).toBe('CUSTOMER')
    expect(msa.owedByName).toBe('Northbend Athletic')

    // The same agreement on a buy line is the supplier's, and on a W2
    // line the NDA is the worker's. The side decides, not the dictionary.
    expect(owedByFor(builtInType('MSA')!, 'SUB_VENDOR')).toBe('SUPPLIER')
    expect(owedByFor(builtInType('NDA')!, 'W2')).toBe('WORKER')
  })

  it('a line paid corp-to-corp asks the person’s own corporation for its cover, and the supplier has their name', () => {
    expect(shapeOf({ side: 'BUY', contractType: 'C2C' })).toBe('CORP_TO_CORP')
    expect(shapeOf({ side: 'BUY', contractType: 'C2C', vendorCompanyId: 'v1' })).toBe('SUB_VENDOR')
    expect(shapeOf({ side: 'BUY', contractType: 'W2' })).toBe('W2')
    expect(shapeOf({ side: 'SELL' })).toBe('CUSTOMER')

    const items = effectiveRequirements({ shape: 'CORP_TO_CORP', names: { SUPPLIER: 'Marisol Quintero LLC' } })
    const gl = items.find((i) => i.key === 'INSURANCE_GL')!
    expect(gl.owedBy).toBe('SUPPLIER')
    expect(gl.owedByName).toBe('Marisol Quintero LLC')
    // We do not employ them, so the I-9 is not ours to take.
    expect(items.map((i) => i.key)).not.toContain('I9_EVERIFY')
  })

  it('a licensed role asks for the license on the line, and an unlicensed one is asked for nothing extra', () => {
    const nurse = defaultItemsFor('W2', 'ICU travel nurse').map((i) => i.key)
    const erp = defaultItemsFor('W2', 'ERP finance consultant').map((i) => i.key)
    expect(nurse).toContain('PROFESSIONAL_LICENSE')
    expect(erp).not.toContain('PROFESSIONAL_LICENSE')
  })

  it('seeding the defaults for a line writes nothing, so a default that changes is not frozen into old rows', () => {
    const set = seedDefaultsFor({ side: 'BUY', contractType: 'W2' })
    expect(set.length).toBeGreaterThan(0)
    for (const i of set) expect(i.id).toBeNull()
    // The function is the whole promise: no database client, no create.
    const src = readFileSync(join(process.cwd(), 'src/lib/document-requirements.ts'), 'utf8')
    const body = src.slice(src.indexOf('export function seedDefaultsFor'))
    expect(body.slice(0, body.indexOf('\n}'))).not.toMatch(/\.create\(|\.upsert\(|createMany/)
  })

  it('every item in the three lists the code used to carry can be written as a row', () => {
    // The point of one door: supplier onboarding's CHECKLIST, the
    // outbound packs and the start packets each carried their own list of
    // what somebody needed. Every item in all three has to survive the
    // move, including the ones no document type ships — the key is a free
    // string precisely so a client's own drug screen, site induction or
    // works council notice needs no migration.
    const rows: { key: string; owedBy: string }[] = []

    for (const item of CHECKLIST) {
      rows.push({ key: item.key, owedBy: item.by === 'VENDOR' ? 'SUPPLIER' : 'US' })
    }
    for (const pack of OUTBOUND_PACKS) {
      for (const item of pack.items) rows.push({ key: item.key, owedBy: 'SUPPLIER' })
    }
    for (const packet of PACKETS) {
      for (const item of packet.items) rows.push({ key: item.key, owedBy: 'WORKER' })
    }

    expect(rows.length).toBeGreaterThan(40)
    for (const row of rows) {
      expect(row.key, `${row.key} is not a key a row could carry`).toMatch(/^[A-Z][A-Z0-9_]*$/)
      expect(OWED_BY, row.key).toContain(row.owedBy)
    }

    // And the set of keys is wider than the shipped dictionary, which is
    // the reason `documentTypeKey` is a string and not an enum.
    const unshipped = [...new Set(rows.map((r) => r.key))].filter((k) => !builtInType(k))
    expect(unshipped.length).toBeGreaterThan(0)
  })

  // ── Who is asked for a report nobody hands over, 2026-09-22 ───────
  //
  // The founder: the screening companies confirm pass or fail, and the
  // risk passes to them. A background check was carried at CANDIDATE,
  // the same value a passport has, so every line in the product asked
  // the worker for a report the provider posts to whoever bought it.

  it('a background check is owed by the firm that pays for the work, because the report is posted to whoever ordered it', () => {
    for (const shape of ['W2', 'CORP_TO_CORP'] as const) {
      const item = effectiveRequirements({ shape, role: 'ERP consultant' }).find((i) => i.key === 'BACKGROUND_CHECK')
      if (!item) continue
      expect(item.owedBy, shape).toBe('US')
    }
  })

  it('a worker is never chased for her own background report, and is still asked for everything that is hers', () => {
    const w2 = effectiveRequirements({ shape: 'W2', role: 'ERP consultant' })
    const hers = w2.filter((i) => i.owedBy === 'WORKER').map((i) => i.key)
    expect(hers).not.toContain('BACKGROUND_CHECK')
    // The packet did not shrink. Her own papers are still hers.
    expect(hers).toContain('I9_EVERIFY')
    expect(hers.length).toBeGreaterThan(1)
  })

  it('a packet item says who owes it through the dictionary, so no shape can force one party onto every document', () => {
    // defaultItemsFor's W2 branch used to stamp owedBy: WORKER onto
    // every item in the start packet, which overrode the dictionary for
    // every type at once — one line, and the only way any type could
    // say otherwise was to be on a different shape.
    const stated = defaultItemsFor('W2', 'ERP consultant').filter((d) => d.owedBy != null)
    expect(stated).toEqual([])
  })

  it('a document a screening company renders is owed by us on a sell line as well as a buy line', () => {
    // fromSuppliedBy's fallback sends an unknown paper to the customer
    // on a sell line. A report is not the customer's to hand over
    // either, so PROVIDER answers before the fallback does.
    const item = effectiveRequirements({
      shape: 'CUSTOMER',
      orderRows: [orderRow({ documentTypeKey: 'BACKGROUND_CHECK', owedBy: undefined as unknown as string })],
      orderSays: ORDER_SAYS,
    }).find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(item.owedBy).toBe('US')
  })

  it('an item nobody waived says whether a lapse stops the work, and the type decides where the line does not', () => {
    const fromType = effectiveRequirements({ shape: 'SUB_VENDOR' }).find((i) => i.key === 'W9')!
    expect(fromType.blocks).toBe(false)
    expect(fromType.typeBlocks).toBe(false)

    // A client insisting on more than the default says so on the row.
    const insisted = effectiveRequirements({
      shape: 'SUB_VENDOR',
      orderRows: [orderRow({ documentTypeKey: 'W9', blocks: true })],
      orderSays: ORDER_SAYS,
    }).find((i) => i.key === 'W9')!
    expect(insisted.blocks).toBe(true)
    expect(insisted.typeBlocks).toBe(false)
  })
})
