import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as billable, POST as generate } from '@/app/api/invoices/generate/route'

/**
 * The Generate invoice picker offers only what it can actually bill.
 *
 * The release walk of 2026-09-21 opened Invoices as Aptiva Workforce,
 * the program office running Cavanaugh Glassworks' program, pressed
 * "+ Generate", and was offered an engagement it had no business
 * billing. Pressing the button answered 403: *"This engagement is
 * Arcadia Tech Group's to bill, not Aptiva Workforce's."*
 *
 * The refusal was right. The picker was the bug — it was built out of
 * `/api/contracts?side=sell`, which answers "what may this seat read",
 * and an office sitting at a client's desk may read the client's whole
 * book. Reading is not billing.
 *
 * This walks both ends: a supplier is offered its own deals and can
 * bill them, and the office is offered none and told why.
 */

const D = '@demo.etyme.local'
const OFFICE = `world-aptiva${D}`
const SUPPLIER = `world-computer-systems${D}`
const CLIENT = `world-nike${D}`

let supplierId = ''
let officeId = ''

describe('a picker does not offer what the button will refuse', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    supplierId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })).id
    officeId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-aptiva' } })).id
  }, 600_000)

  it('offers a supplier the engagements it actually supplies people under', async () => {
    as(SUPPLIER)
    const { status, body } = await json(await billable(req('GET', '/api/invoices/generate')))
    expect(status).toBe(200)
    expect(body.data.engagements.length).toBeGreaterThan(0)
  })

  it('offers that supplier no engagement belonging to anybody else', async () => {
    as(SUPPLIER)
    const { body } = await json(await billable(req('GET', '/api/invoices/generate')))
    const ids = body.data.engagements.map((e: any) => e.id)
    const theirs = await prisma.engagement.findMany({
      where: { id: { in: ids } },
      select: { id: true, msa: { select: { vendorId: true } }, sellContracts: { select: { companyId: true } } },
    })
    for (const e of theirs) {
      const vendor = e.msa?.vendorId ?? e.sellContracts[0]?.companyId
      expect(vendor).toBe(supplierId)
    }
  })

  it('lets the supplier raise a bill under every engagement it was offered', async () => {
    // The whole point: the list and the gate are one rule, so nothing
    // on the list comes back "this is not yours to bill".
    as(SUPPLIER)
    const { body } = await json(await billable(req('GET', '/api/invoices/generate')))
    for (const e of body.data.engagements) {
      const out = await json(await generate(req('POST', '/api/invoices/generate', { engagementId: e.id })))
      expect(out.status, `${e.title}: ${out.body?.error?.message}`).not.toBe(403)
    }
  })

  it('offers a program office its own management deal and not one of its client\'s suppliers\'', async () => {
    // An office does bill — for running the program, under its own
    // agreement with the client that hired it. What it never bills is a
    // placement, because it supplies nobody. The old picker made no
    // such distinction: it listed every sell contract the seat could
    // read, which at a client's desk is that client's whole book.
    as(OFFICE)
    const { status, body } = await json(await billable(req('GET', '/api/invoices/generate')))
    expect(status).toBe(200)

    const ids = body.data.engagements.map((e: any) => e.id)
    const offered = await prisma.engagement.findMany({
      where: { id: { in: ids } },
      select: { id: true, msa: { select: { vendorId: true } }, sellContracts: { select: { companyId: true } } },
    })
    for (const e of offered) {
      const vendor = e.msa?.vendorId ?? e.sellContracts[0]?.companyId
      expect(vendor, 'offered somebody else\'s deal').toBe(officeId)
    }
  })

  it('offers that office none of the deals it could see on the client\'s own book', async () => {
    // The exact row the walk was offered: a supplier's engagement at
    // the client the office runs the program for.
    as(OFFICE)
    const { body } = await json(await billable(req('GET', '/api/invoices/generate')))
    const ids: string[] = body.data.engagements.map((e: any) => e.id)

    const suppliers = await prisma.engagement.findMany({
      where: { sellContracts: { some: { companyId: { not: officeId }, state: 'IN_PROGRESS' } } },
      select: { id: true },
    })
    expect(suppliers.length, 'nothing to be wrongly offered').toBeGreaterThan(0)
    for (const e of suppliers) expect(ids).not.toContain(e.id)
  })


  it('still refuses that office by name if it names a supplier\'s engagement anyway', async () => {
    // The picker is not the security boundary. It never was — it is the
    // honesty boundary, and the gate stays where it was.
    const someoneElses = await prisma.engagement.findFirstOrThrow({
      where: { sellContracts: { some: { companyId: supplierId, state: 'IN_PROGRESS' } } },
      select: { id: true },
    })
    as(OFFICE)
    const { status, body } = await json(
      await generate(req('POST', '/api/invoices/generate', { engagementId: someoneElses.id }))
    )
    expect(status).toBe(403)
    expect(body.error.message).toContain("to bill, not Aptiva Workforce's")
  })

  it('offers a client nothing at all, because a client buys and never sells', async () => {
    as(CLIENT)
    const { status, body } = await json(await billable(req('GET', '/api/invoices/generate')))
    expect(status).toBe(200)
    expect(body.data.engagements).toEqual([])
  })

  it('tells a firm with nothing to bill why, in a sentence naming its own firm', async () => {
    // An empty list is an answer and it says something. The old empty
    // state was a text box asking a human to type an engagement id.
    as(CLIENT)
    const { body } = await json(await billable(req('GET', '/api/invoices/generate')))
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { name: true } })
    expect(body.data.says).toContain(client.name)
    expect(body.data.says).toContain('no engagement it can bill')
    expect(body.data.says).not.toMatch(/invoices\.issue|NOT_THE_SUPPLIER/)
  })
})
