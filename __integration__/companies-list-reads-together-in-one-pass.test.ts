import { describe, it, expect, beforeAll, vi } from 'vitest'

/**
 * The Companies list reads "do we work together" once for every row, never
 * once per row (fix list, 2026-11-15: a live tenant's list took twenty
 * seconds, five queries a row). Walked on the seeded world as Brightmoor
 * Staffing's Owner. The batched reader answers exactly what the one-firm
 * reader answers for every kind of link and for none, and a list that
 * grows by thirty firms makes no more queries than it did.
 */

const counter = vi.hoisted(() => ({ asked: 0 }))

vi.mock('@/lib/db', async () => {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
  prisma.$on('query', () => {
    counter.asked++
  })
  return { prisma }
})

const { as, req, json, prisma, freshWorld } = await import('./harness')
const companies = await import('@/app/api/companies/route')
const { workTogether, workTogetherAmong } = await import('@/lib/company-create')

const OWNER = 'world-brightmoor@demo.etyme.local'
let brightmoor = ''
let isDemo = false
let personId = ''
let made = 0

const firm = async (name: string, kind: 'VENDOR' | 'CLIENT' = 'VENDOR') =>
  (await prisma.company.create({
    data: { name, slug: `together-${++made}-${Date.now().toString(36)}`, kind, currency: 'USD', claimedAt: new Date(), isDemo },
    select: { id: true },
  })).id
const jobSent = async (from: string, to: string) => {
  const job = await prisma.requirement.create({ data: { companyId: from, title: 'A job for the together walk', status: 'OPEN', approvalState: 'AUTO_APPROVED' }, select: { id: true } })
  await prisma.requirementInvitation.create({ data: { requirementId: job.id, fromCompanyId: from, toCompanyId: to, expiresAt: new Date(Date.now() + 14 * 86_400_000) } })
}
const settle = () => new Promise((r) => setTimeout(r, 300))
async function queriesForTheList(): Promise<{ asked: number; body: any }> {
  as(OWNER)
  await settle()
  const before = counter.asked
  const r = await json(await companies.GET(req('GET', '/api/companies?records=1')))
  const asked = counter.asked - before
  expect(r.status).toBe(200)
  return { asked, body: r.body }
}

beforeAll(async () => {
  await freshWorld()
  const b = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, isDemo: true } })
  brightmoor = b.id
  isDemo = b.isDemo
  personId = (await prisma.person.findFirstOrThrow({ select: { id: true }, orderBy: { id: 'asc' } })).id
}, 600_000)

describe('whether two firms work together, read for many at once', () => {
  it('the batched answer equals the one-firm answer for an agreement, their register row, an order, a contract, a job either way, your own row and no link at all', async () => {
    const links: Record<string, string> = {
      agreementAsVendor: await firm('Harborline Tech'),
      agreementAsClient: await firm('Quillstone Works', 'CLIENT'),
      theirRegisterRow: await firm('Northwind Staffing'),
      yourOwnRowOnly: await firm('Fenwick Supply'),
      orderYouIssued: await firm('Larkspur Talent'),
      orderTheyIssued: await firm('Marrow Valley Foods', 'CLIENT'),
      contractYouSell: await firm('Ashgrove Clinics', 'CLIENT'),
      contractTheySell: await firm('Pellam Consulting'),
      jobTheySentYou: await firm('Tolland Mills', 'CLIENT'),
      jobYouSentThem: await firm('Corrin Field Staffing'),
      noLinkAtAll: await firm('Brackwater Systems'),
    }
    await prisma.masterAgreement.create({ data: { vendorId: brightmoor, clientId: links.agreementAsVendor } })
    await prisma.masterAgreement.create({ data: { vendorId: links.agreementAsClient, clientId: brightmoor } })
    await prisma.counterparty.create({ data: { companyId: links.theirRegisterRow, otherCompanyId: brightmoor, relationship: 'CLIENT' } })
    await prisma.counterparty.create({ data: { companyId: brightmoor, otherCompanyId: links.yourOwnRowOnly, relationship: 'VENDOR' } })
    await prisma.workOrder.create({ data: { number: 'TOGETHER-1', issuedById: brightmoor, issuedToId: links.orderYouIssued, recordedById: brightmoor, amount: 1000, startDate: new Date(), status: 'OPEN' } })
    await prisma.workOrder.create({ data: { number: 'TOGETHER-2', issuedById: links.orderTheyIssued, issuedToId: brightmoor, recordedById: links.orderTheyIssued, amount: 1000, startDate: new Date(), status: 'OPEN' } })
    await prisma.sellContract.create({ data: { companyId: brightmoor, clientCompanyId: links.contractYouSell, personId, billRate: 10_000, startDate: new Date() } })
    await prisma.sellContract.create({ data: { companyId: links.contractTheySell, clientCompanyId: brightmoor, personId, billRate: 10_000, startDate: new Date() } })
    await jobSent(links.jobTheySentYou, brightmoor)
    await jobSent(brightmoor, links.jobYouSentThem)

    const ids = [...Object.values(links), brightmoor]
    const batched = await workTogetherAmong(brightmoor, ids)
    const one: Record<string, boolean> = {}
    const many: Record<string, boolean> = {}
    for (const [link, id] of Object.entries(links)) {
      one[link] = await workTogether(brightmoor, id)
      many[link] = batched.has(id)
    }
    expect(many).toEqual(one)
    expect(one).toEqual({
      agreementAsVendor: true,
      agreementAsClient: true,
      theirRegisterRow: true,
      yourOwnRowOnly: false,
      orderYouIssued: true,
      orderTheyIssued: true,
      contractYouSell: true,
      contractTheySell: true,
      jobTheySentYou: true,
      jobYouSentThem: false,
      noLinkAtAll: false,
    })
    // A firm never works with itself, asked alone or among others.
    expect(batched.has(brightmoor)).toBe(false)
    expect(await workTogether(brightmoor, brightmoor)).toBe(false)
  })

  it('the batched reader answers inside a transaction as it does outside one', async () => {
    const other = await firm('Wexmoor Talent')
    await jobSent(other, brightmoor)
    const inside = await prisma.$transaction((tx) => workTogetherAmong(brightmoor, [other], tx))
    expect([...inside]).toEqual([other])
  })
})

describe('the Companies list', () => {
  it('a firm with thirty more companies on its list makes no query per company to draw it', async () => {
    // Warm the caller's reads, then measure the list as it stands.
    await queriesForTheList()
    const first = await queriesForTheList()

    // Thirty firms that each sent Brightmoor a job: on its list, no
    // position, not its own record, so each row asks whether the two work
    // together, which is the read that used to cost five queries a row.
    const added: string[] = []
    for (let i = 0; i < 30; i++) {
      const id = await firm(`Sender Firm ${i + 1}`, 'CLIENT')
      await jobSent(id, brightmoor)
      added.push(id)
    }
    const second = await queriesForTheList()
    const rows = second.body.data.companies.filter((c: any) => added.includes(c.id))
    expect(rows).toHaveLength(30)
    expect(rows.every((c: any) => c.positions.length === 0 && !c.mine && !c.notLinked)).toBe(true)
    // A read that runs only once rows exist, or a log write the first call
    // left behind, may add one or two; one per row would add thirty and
    // more (the old loop added five per row: 224 against 44).
    expect(second.asked).toBeLessThanOrEqual(first.asked + 3)
  })
})
