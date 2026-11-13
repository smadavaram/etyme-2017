import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as coding } from '@/app/api/invoices/[id]/coding/route'

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
