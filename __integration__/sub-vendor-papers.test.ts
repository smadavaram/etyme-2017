import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as recordAgreement } from '@/app/api/contracts/agreements/route'
import { GET as readAgreements } from '@/app/api/program/agreements/route'
import { GET as listOrders, POST as writeOrder } from '@/app/api/purchase-orders/route'
import { GET as listContracts, POST as writeContract } from '@/app/api/contracts/route'

/**
 * A sub-vendor's own papers, recorded from its own screens.
 *
 * Release walk, 2026-10-27, four faults in money's files: a sub-vendor
 * could not record its agreement with a prime, could not record the order
 * the prime gave it, read Sell contracts under the Buy contracts tab, and
 * an order raised by hand had no lines.
 *
 *   Computer Systems   the prime, on Etyme. Buys from Techpeple.
 *   Techpeple          the sub-vendor, on Etyme. Sells to Computer Systems.
 *   Halvard Partners   a prime not on Etyme, on Techpeple's register.
 *   Auralis Software   on Etyme, trades with nobody here.
 */

const CS = 'owner@cs.test'
const TP = 'owner@techpeple.test'
const co = { cs: '', tp: '', halvard: '', auralis: '' }
const who = { tpOwner: '', omar: '' }
const ids = { csOrder: '', halvardOrder: '' }

async function company(name: string, slug: string, kind: any, email: string | null, claimed = true) {
  const c = await prisma.company.create({
    data: { name, slug, kind, currency: 'USD', claimedAt: claimed ? new Date('2026-01-04') : null },
  })
  if (!email) return { companyId: c.id, personId: '' }
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: `${name} owner`, primaryEmail: email } })
  await prisma.context.create({
    data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'sub-vendor papers walk' },
  })
  return { companyId: c.id, personId: p.id }
}

beforeAll(async () => {
  await resetDatabase()
  co.cs = (await company('Computer Systems', 'computer-systems', 'VENDOR', CS)).companyId
  const tp = await company('Techpeple', 'techpeple', 'VENDOR', TP)
  co.tp = tp.companyId
  who.tpOwner = tp.personId
  co.auralis = (await company('Auralis Software', 'auralis-software', 'VENDOR', 'owner@auralis.test')).companyId
  const halvard = await prisma.company.create({
    data: { name: 'Halvard Partners', slug: 'halvard-partners', kind: 'VENDOR', currency: 'USD', claimedAt: null, listedById: co.tp },
  })
  co.halvard = halvard.id

  // The two primes on Techpeple's register, and Techpeple on Computer
  // Systems' as a supplier, with the unsigned placeholder the suppliers
  // route writes beside it.
  for (const [companyId, otherCompanyId, relationship] of [
    [co.tp, co.cs, 'CLIENT'], [co.tp, co.halvard, 'CLIENT'], [co.cs, co.tp, 'SUPPLIER'],
  ] as const) {
    await prisma.counterparty.create({ data: { companyId, otherCompanyId, relationship } })
  }
  await prisma.masterAgreement.create({ data: { vendorId: co.tp, clientId: co.cs, paymentTerms: 30 } })

  const omar = await prisma.person.create({ data: { name: 'Omar Haddad', primaryEmail: 'omar@techpeple.test' } })
  who.omar = omar.id
  await prisma.context.create({ data: { personId: omar.id, companyId: co.tp, type: 'EMPLOYEE', grantReason: 'Techpeple employee' } })
})

describe('a sub-vendor records its agreement with a prime', () => {
  it('a sub-vendor records its agreement with a prime from Companies, and both firms read it', async () => {
    as(TP)
    const r = await json(await recordAgreement(req('POST', '/api/contracts/agreements', {
      otherCompanyId: co.cs, callerSells: true, paymentTerms: 45, paymentTermsFrom: 'INVOICE_DATE',
      billFrequency: 'WEEKLY', currency: 'USD', executedFileUrl: 'https://files.example/techpeple-cs-msa.pdf',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    // The placeholder the suppliers route wrote is filled in, not doubled.
    expect(r.body.data.filledPlaceholder).toBe(true)
    // Said back through the one door every bill reads.
    expect(r.body.data.message).toContain('billed weekly, net 45 from the invoice date, in USD')
    expect(await prisma.masterAgreement.count({ where: { vendorId: co.tp, clientId: co.cs } })).toBe(1)
    const row = await prisma.masterAgreement.findFirstOrThrow({ where: { vendorId: co.tp, clientId: co.cs } })
    expect(row).toMatchObject({ paymentTerms: 45, paymentTermsFrom: 'INVOICE_DATE', billFrequency: 'WEEKLY', executedFileName: 'techpeple-cs-msa.pdf' })
    const trail = await prisma.masterAgreementVersion.findMany({ where: { agreementId: row.id }, orderBy: { version: 'asc' } })
    expect(trail.map((v) => v.action)).toEqual(['RECORDED', 'RECORDED'])
    expect(trail[1].changedById).toBe(who.tpOwner)
    expect(trail[1].paymentTerms).toBe(45)

    for (const [email, other, role] of [[TP, 'Computer Systems', 'VENDOR'], [CS, 'Techpeple', 'CLIENT']] as const) {
      as(email)
      const list = await json(await readAgreements(req('GET', '/api/program/agreements')))
      const mine = (list.body.data.agreements as any[]).find((a) => a.id === row.id)
      expect(mine, `${email} reads it`).toBeTruthy()
      expect(mine.counterparty.name).toBe(other)
      expect(mine.role).toBe(role)
      expect(mine.terms.paymentTermsDays).toBe(45)
    }
  })

  it('a second agreement between the same two firms is refused and names the one on file', async () => {
    as(TP)
    const r = await json(await recordAgreement(req('POST', '/api/contracts/agreements', {
      otherCompanyId: co.cs, callerSells: true, paymentTerms: 60,
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('already on file')
  })

  it('an agreement with a firm on Etyme is recorded only where the two already trade, and the refusal says so', async () => {
    as(TP)
    const r = await json(await recordAgreement(req('POST', '/api/contracts/agreements', {
      otherCompanyId: co.auralis, callerSells: true, paymentTerms: 30,
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('do not trade here yet')
    expect(await prisma.masterAgreement.count({ where: { OR: [{ vendorId: co.auralis }, { clientId: co.auralis }] } })).toBe(0)
  })
})

describe('the order a prime gives a sub-vendor', () => {
  it('a sub-vendor cannot record an order in the name of a prime that is on Etyme, and is told the prime raises it', async () => {
    as(TP)
    const r = await json(await writeOrder(req('POST', '/api/purchase-orders', {
      issuedById: co.cs, issuedToId: co.tp, number: 'CS-PO-1', amount: 50000,
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('theirs to raise')
  })

  it('an order a prime raises is the sub-vendor’s sales order, one document read from both ends, with its lines', async () => {
    as(CS)
    const raised = await json(await writeOrder(req('POST', '/api/purchase-orders', {
      issuedToId: co.tp, number: 'CS-PO-77', amount: 120000,
    })))
    expect(raised.body?.error, JSON.stringify(raised.body)).toBeUndefined()
    ids.csOrder = raised.body.data.order.id
    // The agreement set the terms the order did not state.
    expect(raised.body.data.order.paymentTerms).toBe(45)

    // Techpeple writes its line onto that order by name.
    as(TP)
    const line = await json(await writeContract(req('POST', '/api/contracts', {
      personId: who.omar, companyId: co.tp, clientCompanyId: co.cs, billRate: 9000,
      startDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), workOrderId: ids.csOrder,
    })))
    expect(line.body?.error, JSON.stringify(line.body)).toBeUndefined()
    expect(line.body.data.message).toContain('CS-PO-77')
    // And Computer Systems' buy line for the same person, on the same order.
    await prisma.buyContract.create({
      data: {
        companyId: co.cs, vendorCompanyId: co.tp, contractType: 'C2C' as any, workOrderId: ids.csOrder,
        startDate: new Date(), candidates: { create: { personId: who.omar, payRate: 9000, startDate: new Date() } },
      },
    })

    as(TP)
    const theirs = (await json(await listOrders(req('GET', '/api/purchase-orders')))).body.data.orders
      .find((o: any) => o.id === ids.csOrder)
    expect(theirs.noun).toBe('sales order')
    expect(theirs.direction).toBe('received')
    expect(theirs.counterparty.name).toBe('Computer Systems')
    expect(theirs.lines.map((l: any) => [l.personName, l.side])).toEqual([['Omar Haddad', 'SELL']])

    as(CS)
    const ours = (await json(await listOrders(req('GET', '/api/purchase-orders')))).body.data.orders
      .find((o: any) => o.id === ids.csOrder)
    expect(ours.noun).toBe('purchase order')
    expect(ours.direction).toBe('issued')
    expect(ours.lines.map((l: any) => [l.personName, l.side])).toEqual([['Omar Haddad', 'BUY']])
  })

  it('the firm\u2019s own line on an order shows what it bills at only to a desk that prices or bills it', async () => {
    const role = await prisma.role.create({ data: { companyId: co.tp, name: 'Reads orders', permissions: ['invoices.read'] } })
    const p = await prisma.person.create({ data: { name: 'Tess Reader', primaryEmail: 'reader@techpeple.test' } })
    await prisma.context.create({ data: { personId: p.id, companyId: co.tp, roleId: role.id, type: 'EMPLOYEE', grantReason: 'reads orders only' } })

    as('reader@techpeple.test')
    const seen = (await json(await listOrders(req('GET', '/api/purchase-orders')))).body.data.orders
      .find((o: any) => o.id === ids.csOrder)
    const omar = seen.lines.find((l: any) => l.personName === 'Omar Haddad')
    expect(omar.rate).toBeNull()
    expect(omar.payWithheld).toBe(true)
    expect(await prisma.accessLog.count({ where: { actorPersonId: p.id, subjectId: who.omar } })).toBeGreaterThan(0)

    as(TP)
    const owner = (await json(await listOrders(req('GET', '/api/purchase-orders')))).body.data.orders
      .find((o: any) => o.id === ids.csOrder)
    expect(owner.lines.find((l: any) => l.personName === 'Omar Haddad').rate).toBe(9000)
  })

  it('a line pinned to an order lands on that order, and an order from another client is refused in a sentence', async () => {
    as(TP)
    const recorded = await json(await writeOrder(req('POST', '/api/purchase-orders', {
      issuedById: co.halvard, issuedToId: co.tp, number: 'HP-2026-04', amount: 80000,
    })))
    expect(recorded.body?.error, JSON.stringify(recorded.body)).toBeUndefined()
    ids.halvardOrder = recorded.body.data.order.id
    expect(recorded.body.data.recordedForThem).toBe(true)

    const wrong = await json(await writeContract(req('POST', '/api/contracts', {
      personId: who.omar, companyId: co.tp, clientCompanyId: co.halvard, billRate: 8000,
      startDate: '2026-11-02', workOrderId: ids.csOrder,
    })))
    expect(wrong.status).toBe(422)
    expect(wrong.body.error.message).toContain('not from Halvard Partners')

    const right = await json(await writeContract(req('POST', '/api/contracts', {
      personId: who.omar, companyId: co.tp, clientCompanyId: co.halvard, billRate: 8000,
      startDate: '2026-11-02', workOrderId: ids.halvardOrder,
    })))
    expect(right.body?.error, JSON.stringify(right.body)).toBeUndefined()
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: right.body.data.sellContract.id } })
    expect(sell.workOrderId).toBe(ids.halvardOrder)
  })
})

describe('the Sell and Buy contracts tabs', () => {
  it('the Buy contracts tab shows buy lines and the Sell contracts tab sell lines, never the other', async () => {
    as(CS)
    const buy = await json(await listContracts(req('GET', '/api/contracts?side=buy')))
    expect(buy.body?.error, JSON.stringify(buy.body)).toBeUndefined()
    const buyRows = buy.body.data.contracts as any[]
    expect(buyRows.length).toBeGreaterThan(0)
    expect(buyRows.every((c) => c.side === 'buy')).toBe(true)

    as(TP)
    const sell = await json(await listContracts(req('GET', '/api/contracts?side=sell')))
    const sellRows = sell.body.data.contracts as any[]
    expect(sellRows.length).toBeGreaterThan(0)
    expect(sellRows.every((c) => c.side === 'sell')).toBe(true)
  })
})
