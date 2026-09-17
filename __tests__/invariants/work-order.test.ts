import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  nounFor,
  orderSentence,
  referenceFor,
  sideOf,
} from '@/lib/order-naming'
import {
  isShell,
  mayList,
  mayNameCounterparty,
  mayWriteOrder,
  shellNotice,
} from '@/lib/off-system'

/**
 * One order, three names — and a door for the firm whose client is not here.
 *
 * Two changes that the founder authorized as one piece of work, because
 * they meet in one place: a merged order still needs an issuer, and the
 * unsolved problem was never that the two ends need separate rows. It was
 * that nothing let a firm write an order naming a counterparty on the leg
 * where it is not the natural issuer.
 */

const CLIENT = 'co-northbend'
const SUPPLIER = 'co-veritan'
const STRANGER = 'co-auralis'
const SHARED_SERVICES = 'co-northbend-ssc'

const ORDER = {
  issuedById: CLIENT,
  issuedToId: SUPPLIER,
  billToId: SHARED_SERVICES,
  payerId: null,
  number: 'NB-PO-40118',
  sellerNumber: 'SO-2026-118',
  amountCents: 250_000_00,
  currency: 'USD',
}

const shell = (id: string, name: string, listedBy: string | null = null) => ({
  id,
  name,
  claimedAt: null,
  listedById: listedBy,
})
const tenant = (id: string, name: string) => ({
  id,
  name,
  claimedAt: new Date('2026-01-04'),
  listedById: null,
})

describe('one order, and what each end of it calls the paper', () => {
  it('a client reads it as a purchase order and a supplier reads the same row as a sales order', () => {
    expect(nounFor(ORDER, CLIENT).noun).toBe('purchase order')
    expect(nounFor(ORDER, SUPPLIER).noun).toBe('sales order')

    // The same row. Not two rows that have to be kept in step, which is
    // what `PurchaseOrder` and `SalesOrder` were until they were merged.
    expect(sideOf(ORDER, CLIENT)).toBe('BUYER')
    expect(sideOf(ORDER, SUPPLIER)).toBe('SELLER')
  })

  it('a firm on neither end of the order reads the trade’s own word for it', () => {
    expect(nounFor(ORDER, STRANGER).noun).toBe('work order')
    expect(nounFor(ORDER, null).noun).toBe('work order')
  })

  it('the shared service center that pays the bill reads a purchase order, because it is not selling anything', () => {
    expect(nounFor(ORDER, SHARED_SERVICES).noun).toBe('purchase order')
  })

  it('a supplier quotes its own order number where it kept one, and the client’s where it did not', () => {
    expect(referenceFor(ORDER, SUPPLIER).reference).toBe('SO-2026-118')
    expect(referenceFor({ ...ORDER, sellerNumber: null }, SUPPLIER).reference).toBe('NB-PO-40118')
    expect(referenceFor({ ...ORDER, sellerNumber: null }, SUPPLIER).says).toContain(
      'You have not recorded an order number of your own'
    )
    // The buyer always quotes its own, which is what its AP team matches
    // an invoice against.
    expect(referenceFor(ORDER, CLIENT).reference).toBe('NB-PO-40118')
  })

  it('the ceiling is said in whole dollars from minor units, never divided by a hundred twice', () => {
    expect(orderSentence(ORDER, CLIENT, 'Veritan Talent')).toContain('$250,000')
    expect(orderSentence(ORDER, SUPPLIER, 'Northbend Athletic')).toContain(
      'Northbend Athletic has authorized $250,000 of work'
    )
  })
})

describe('a firm that is on the register without being on the system', () => {
  it('a company nobody has taken possession of is a shell, and every screen says so out loud', () => {
    const notHere = shell('co-shell', 'Halvard Industries', SUPPLIER)
    expect(isShell(notHere)).toBe(true)
    expect(shellNotice(notHere)).toContain('Halvard Industries is not on Etyme')
    expect(shellNotice(notHere)).toContain('nothing here carries their agreement')

    // A firm that chose to be here is never described that way.
    expect(shellNotice(tenant(CLIENT, 'Northbend Athletic'))).toBeNull()
  })

  it('a staffing firm can record work for a client that has never heard of us', () => {
    const verdict = mayList({
      callerCompanyId: SUPPLIER,
      claimedAtDomain: null,
      alreadyListed: null,
      name: 'Halvard Industries',
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.create).toBe(true)
    expect(verdict.says).toContain('goes on your register')
  })

  it('a firm cannot put a second copy of a company that is already here on its register', () => {
    const verdict = mayList({
      callerCompanyId: SUPPLIER,
      claimedAtDomain: tenant(CLIENT, 'Northbend Athletic'),
      alreadyListed: null,
      name: 'Northbend Athletic',
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.create).toBe(false)
    expect(verdict.says).toContain('already on Etyme')
    // A refusal says what to do next, never just no.
    expect(verdict.says).toContain('Ask them to add you instead')
  })

  it('listing the same client twice reuses the record rather than making a second one', () => {
    const before = shell('co-shell', 'Halvard Industries', SUPPLIER)
    const verdict = mayList({
      callerCompanyId: SUPPLIER,
      claimedAtDomain: null,
      alreadyListed: before,
      name: 'halvard industries',
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.create).toBe(false)
    expect(verdict.reuse?.id).toBe('co-shell')
  })

  it('a firm cannot name a company that is already here as its client without them', () => {
    const verdict = mayNameCounterparty({
      callerCompanyId: SUPPLIER,
      other: tenant(CLIENT, 'Northbend Athletic'),
      relationshipExists: false,
      as: 'client',
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('has nothing on file with you')
    expect(verdict.says).toContain('ask them to add you')
  })

  it('a firm may name a company that is already here where the two already work together', () => {
    const verdict = mayNameCounterparty({
      callerCompanyId: SUPPLIER,
      other: tenant(CLIENT, 'Northbend Athletic'),
      relationshipExists: true,
      as: 'client',
    })
    expect(verdict.ok).toBe(true)
  })

  it('a firm may always name a company that is not here, because a shell is a claim on nobody', () => {
    const verdict = mayNameCounterparty({
      callerCompanyId: SUPPLIER,
      other: shell('co-shell', 'Halvard Industries', SUPPLIER),
      relationshipExists: false,
      as: 'client',
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.says).toContain('is not on Etyme')
  })
})

describe('who may write the order', () => {
  it('a client raising a purchase order to its supplier is the ordinary case and is unchanged', () => {
    const v = mayWriteOrder({
      callerCompanyId: CLIENT,
      buyer: tenant(CLIENT, 'Northbend Athletic'),
      seller: tenant(SUPPLIER, 'Veritan Talent'),
    })
    expect(v.ok).toBe(true)
    expect(v.onBehalf).toBe(false)
    expect(v.recordedById).toBe(CLIENT)
  })

  it('a supplier can record the purchase order its client handed it, where that client is not on the system', () => {
    const v = mayWriteOrder({
      callerCompanyId: SUPPLIER,
      buyer: shell('co-shell', 'Halvard Industries', SUPPLIER),
      seller: tenant(SUPPLIER, 'Veritan Talent'),
    })
    expect(v.ok).toBe(true)
    expect(v.onBehalf).toBe(true)
    expect(v.recordedById).toBe(SUPPLIER)
    expect(v.says).toContain('recording the purchase order they handed you')
  })

  it('a supplier cannot raise an order in the name of a client that is here and could have raised it', () => {
    const v = mayWriteOrder({
      callerCompanyId: SUPPLIER,
      buyer: tenant(CLIENT, 'Northbend Athletic'),
      seller: tenant(SUPPLIER, 'Veritan Talent'),
    })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('theirs to raise')
    expect(v.says).toContain('Ask their program office or AP desk')
  })

  it('a firm that is neither end of the deal cannot write the order at all', () => {
    const v = mayWriteOrder({
      callerCompanyId: STRANGER,
      buyer: tenant(CLIENT, 'Northbend Athletic'),
      seller: tenant(SUPPLIER, 'Veritan Talent'),
    })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('written by one of the two firms on it')
  })

  it('a company cannot raise an order to itself', () => {
    const v = mayWriteOrder({
      callerCompanyId: CLIENT,
      buyer: tenant(CLIENT, 'Northbend Athletic'),
      seller: tenant(CLIENT, 'Northbend Athletic'),
    })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('cannot raise an order to itself')
  })
})

describe('the merge left one row, and the schema says so', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

  it('there is one order model, not a purchase order and a sales order', () => {
    expect(schema).toContain('model WorkOrder {')
    expect(schema).not.toMatch(/^model SalesOrder \{/m)
    expect(schema).not.toMatch(/^model PurchaseOrder \{/m)
  })

  it('the one row carries what each of the two carried, including the terms nothing could ever write', () => {
    const model = schema.slice(schema.indexOf('model WorkOrder {'))
    const body = model.slice(0, model.indexOf('\n}\n'))

    // The client's half.
    for (const field of ['issuedById', 'issuedToId', 'amount', 'startDate', 'endDate', 'status']) {
      expect(body, field).toContain(field)
    }
    // The supplier's half, which had no row to live on and so was
    // unreachable for every firm in the world.
    for (const field of [
      'billToId', 'shipToId', 'payerId',
      'billingBasis', 'milestones',
      'autoApproveTimesheets', 'approvalWindowDays',
    ]) {
      expect(body, field).toContain(field)
    }
    // And who typed it in, which only matters once a seller may record
    // the buyer's paper.
    expect(body).toContain('recordedById')
  })

  it('an order carries a ceiling and a contract carries a rate, still', () => {
    const model = schema.slice(schema.indexOf('model WorkOrder {'))
    const body = model.slice(0, model.indexOf('\n}\n'))
    // No rate, no person and no work site on the order.
    expect(body).not.toContain('billRate')
    expect(body).not.toContain('personId')
    expect(body).not.toContain('workLocationId')
    // And the contract hangs off it, which is what makes one order many
    // contracts.
    expect(body).toContain('sellContracts')
  })

  it('the nightly auto-approval reads the term off the row that now exists', () => {
    const cron = readFileSync(
      join(process.cwd(), 'src/app/api/cron/auto-approve/route.ts'),
      'utf8'
    )
    expect(cron).toContain('workOrder')
    expect(cron).toContain('autoApproveTimesheets')
    expect(cron).not.toContain('salesOrder')
  })
})
