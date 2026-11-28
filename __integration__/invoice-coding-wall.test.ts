import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as coding } from '@/app/api/invoices/[id]/coding/route'
import { GET as ownBill } from '@/app/api/invoices/[id]/own-bill/route'

/**
 * A client's codes stay the client's.
 *
 * The cost centers and GL accounts on an invoice are the paying client's
 * own. The coding route let either party read them, so the supplier that
 * issued a bill could download its client's cost centers and accounts.
 * Now the payer reads them as before, the issuer is told in one sentence
 * whose they are, after the refusal is on the access log, and anybody else
 * gets what an invoice that does not exist gets.
 *
 * The bill is found on the seeded world, never named: a bill on an
 * agreement whose lines carry a cost split owned by the client it is
 * billed to, with an Owner seat on both sides.
 */

const w = {
  invoice: '',
  number: '',
  clientId: '',
  clientName: '',
  vendorId: '',
  clientEmail: '',
  clientContext: '',
  vendorEmail: '',
  vendorContext: '',
  vendorPersonId: '',
  codes: [] as string[],
  strangerEmail: '',
  strangerContext: '',
}

async function ownerOf(companyId: string) {
  return prisma.context.findFirst({
    where: { companyId, role: { name: 'Owner' } },
    orderBy: { id: 'asc' },
    select: { id: true, person: { select: { id: true, primaryEmail: true } } },
  })
}

function read(email: string, context: string, query = '') {
  as(email)
  return coding(
    req('GET', `/api/invoices/${w.invoice}/coding${query}`, undefined, { 'x-context-id': context }),
    { params: Promise.resolve({ id: w.invoice }) },
  )
}

function readOwn(email: string, context: string) {
  as(email)
  return ownBill(
    req('GET', `/api/invoices/${w.invoice}/own-bill`, undefined, { 'x-context-id': context }),
    { params: Promise.resolve({ id: w.invoice }) },
  )
}

beforeAll(async () => {
  await freshWorld()
  const invoices = await prisma.invoice.findMany({
    where: { engagement: { msaId: { not: null } }, status: { not: 'DRAFT' } },
    select: {
      id: true, number: true,
      invoiceLines: { select: { sellContractId: true } },
      engagement: { select: { msa: { select: { vendorId: true, clientId: true, client: { select: { name: true } } } } } },
    },
    orderBy: { number: 'asc' },
  })
  for (const inv of invoices) {
    const msa = inv.engagement.msa
    if (!msa) continue
    const lineIds = inv.invoiceLines.map((l) => l.sellContractId).filter((x): x is string => !!x)
    if (lineIds.length === 0) continue
    const allocations = await prisma.contractCostAllocation.findMany({
      where: { sellContractId: { in: lineIds } },
      select: { costCenter: { select: { code: true, companyId: true } } },
    })
    if (allocations.length === 0 || !allocations.every((a) => a.costCenter.companyId === msa.clientId)) continue
    const [client, vendor] = await Promise.all([ownerOf(msa.clientId), ownerOf(msa.vendorId)])
    if (!client?.person.primaryEmail || !vendor?.person.primaryEmail) continue
    Object.assign(w, {
      invoice: inv.id, number: inv.number,
      clientId: msa.clientId, clientName: msa.client.name, vendorId: msa.vendorId,
      clientEmail: client.person.primaryEmail, clientContext: client.id,
      vendorEmail: vendor.person.primaryEmail, vendorContext: vendor.id, vendorPersonId: vendor.person.id,
      codes: [...new Set(allocations.map((a) => a.costCenter.code))],
    })
    break
  }
  expect(w.invoice, 'the seeded world has a bill whose lines carry the client’s own cost split').not.toBe('')

  const stranger = await prisma.context.findFirst({
    where: {
      role: { name: 'Owner' },
      companyId: { notIn: [w.clientId, w.vendorId] },
      company: { kind: { in: ['VENDOR', 'CLIENT'] } },
    },
    orderBy: { id: 'asc' },
    select: { id: true, person: { select: { primaryEmail: true } } },
  })
  expect(stranger, 'the seeded world has a third firm with an Owner').not.toBeNull()
  w.strangerEmail = stranger!.person.primaryEmail
  w.strangerContext = stranger!.id
})

describe("a client's codes stay the client's", () => {
  it('the client that pays reads them as before', async () => {
    const r = await json(await read(w.clientEmail, w.clientContext))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const shown = (r.body.data.rows as Array<{ costCenterCode: string | null }>).map((x) => x.costCenterCode)
    for (const code of w.codes) expect(shown).toContain(code)
    expect(r.body.data.reconciliation.balanced).toBe(true)
    expect(r.body.data.exportProfiles.length).toBeGreaterThan(0)

    const csv = await read(w.clientEmail, w.clientContext, '?format=csv')
    expect(csv.status).toBe(200)
    expect(await csv.text()).toContain(w.codes[0])
  })

  it('a supplier cannot read the cost centers or accounts on its own bill to a client, and the refusal is logged before it is sent', async () => {
    const since = new Date()
    for (const query of ['', '?format=csv', '?profile=GENERIC']) {
      const res = await read(w.vendorEmail, w.vendorContext, query)
      // The row is on the table by the time the reply is in hand: the
      // route awaited it before answering.
      const logged = await prisma.accessLog.count({
        where: {
          subjectCompanyId: w.clientId,
          actorPersonId: w.vendorPersonId,
          allowed: false,
          at: { gte: since },
          reason: { contains: w.number },
        },
      })
      expect(logged, `a refusal row for ${query || 'the JSON'}`).toBeGreaterThan(0)
      const text = await res.text()
      expect(res.status, text).toBe(403)
      for (const code of w.codes) expect(text).not.toContain(code)
      const body = JSON.parse(text)
      expect(body.error.message).toContain(`belong to ${w.clientName}`)
      expect(body.error.message).not.toMatch(/FORBIDDEN|permission/i)
    }
  })

  it('a firm that is neither party is answered as if the invoice did not exist', async () => {
    const r = await json(await read(w.strangerEmail, w.strangerContext))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('Invoice not found')
  })
})

describe("the supplier's own two facts on its own bill", () => {
  it('a supplier opening its own bill still reads what is left on the order after this bill and its own pay-to details', async () => {
    const r = await json(await readOwn(w.vendorEmail, w.vendorContext))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const inv = await prisma.invoice.findUnique({
      where: { id: w.invoice },
      select: { workOrder: { select: { number: true } }, remitTo: { select: { companyId: true, bankName: true, accountLast4: true } } },
    })
    expect(r.body.data.workOrder).toBe(inv!.workOrder?.number ?? null)
    if (inv!.remitTo?.companyId === w.vendorId) {
      expect(r.body.data.remitTo.bankName).toBe(inv!.remitTo.bankName)
      expect(r.body.data.remitTo.accountLast4).toBe(inv!.remitTo.accountLast4)
    }

    // The one figure: what the client that pays reads under Purchase order is what the supplier reads.
    const payer = await json(await read(w.clientEmail, w.clientContext))
    expect(payer.status).toBe(200)
    const theirs = payer.body.data.purchaseOrderBalance
    const ours = r.body.data.purchaseOrderBalance
    // The seeded bill has an order and pay-to details, so the sentence is tested, never passed on a blank.
    expect(ours, 'the seeded bill draws on an order').not.toBeNull()
    expect(r.body.data.remitTo, 'the seeded supplier has its pay-to details').not.toBeNull()
    if (theirs === null) expect(ours).toBeNull()
    else if ('unreadable' in theirs) expect(ours).toEqual({ number: theirs.number, unreadable: theirs.unreadable })
    else expect(ours).toEqual({ number: theirs.number, remainingCents: theirs.remainingCents, consumedPercent: theirs.consumedPercent, overdrawn: theirs.overdrawn })
  })

  it('that read carries no cost center, no account and no cost split', async () => {
    const res = await readOwn(w.vendorEmail, w.vendorContext)
    const text = await res.text()
    expect(res.status, text).toBe(200)
    for (const code of w.codes) expect(text).not.toContain(code)
    expect(text).not.toMatch(/costCenter|glAccount|"rows"|"share"|codingOwner|taxId|routing/)
  })

  it('the client that pays reads the coding view as before, and is pointed there from the supplier’s door', async () => {
    const r = await json(await read(w.clientEmail, w.clientContext))
    expect(r.status).toBe(200)
    expect(r.body.data.rows.length).toBeGreaterThan(0)
    const own = await json(await readOwn(w.clientEmail, w.clientContext))
    expect(own.status).toBe(403)
    expect(own.body.error.message).toContain(`${w.number} is yours to pay`)
  })

  it('a firm that is neither party is answered as if the invoice did not exist, after the refusal is logged', async () => {
    const since = new Date()
    const r = await json(await readOwn(w.strangerEmail, w.strangerContext))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('Invoice not found')
    const logged = await prisma.accessLog.count({
      where: { subjectCompanyId: w.vendorId, allowed: false, at: { gte: since }, reason: { contains: w.number } },
    })
    expect(logged).toBeGreaterThan(0)
  })
})
