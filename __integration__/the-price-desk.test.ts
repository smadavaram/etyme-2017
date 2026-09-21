import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { rolesFor } from '@/lib/company-defaults'

import { GET as rateHistory } from '@/app/api/rate-history/route'

/**
 * What a placement is priced at is the price desk's, and nobody else's.
 *
 * The release walk of 2026-09-21 signed in as a systems integrator's
 * Validation Engineer — `assignments.read` and `timesheets.read`, the
 * two permissions somebody needs to file a week and read the contract
 * they are on — and asked `/api/rate-history`. It answered 200 with
 * every sell rate on every placement the firm has.
 *
 * The same seat was correctly refused on consultants, on invoices, on
 * purchase orders and on profitability. This was the last door left
 * open on the one number in this business nobody shares sideways: an
 * engineer who can read what the firm charges for each of his
 * colleagues can work out the margin on all of them.
 *
 * `rates.read` was already in the permission list, already described as
 * "Price is procurement's to set and to amend", and already held by
 * exactly the desks whose job is price — and it gated nothing anywhere
 * in the product until now.
 */

const D = '@demo.etyme.local'
const OWNER = `world-computer-systems${D}`

const SEAT = {
  engineer: 'engineer@price-desk.etyme.invalid',
  accountManager: 'am@price-desk.etyme.invalid',
  hr: 'hr@price-desk.etyme.invalid',
}

let vendorId = ''
let sellId = ''
let consultantEmail = ''

/** Somebody at the firm holding one named role and nothing more. */
async function seat(companyId: string, roleName: string, email: string, name: string) {
  const seed = rolesFor('VENDOR').find((r) => r.name === roleName)!
  const role =
    (await prisma.role.findFirst({ where: { companyId, name: roleName } })) ??
    (await prisma.role.create({
      data: { companyId, name: roleName, permissions: seed.permissions as string[] },
    }))
  const person = await prisma.person.upsert({
    where: { primaryEmail: email },
    update: { name },
    create: { name, primaryEmail: email },
  })
  await prisma.context.create({
    data: {
      personId: person.id,
      companyId,
      roleId: role.id,
      type: 'EMPLOYEE',
      grantReason: `Price desk test — ${roleName}`,
    },
  })
  return person.id
}

/** A refusal anybody can act on: words, and never the key itself. */
function isASentence(message: string) {
  expect(message, 'refused with nothing to read').toMatch(/[a-z]{3,}\s+[a-z]{2,}\s+[a-z]{2,}/i)
  expect(message, 'refused by naming a permission string').not.toMatch(/rates\.read|margin\.read|consultants\.cost/)
}

describe('what a placement is priced at is the price desk\'s to read', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const vendor = await prisma.company.findFirstOrThrow({ where: { name: 'Computer Systems Inc' } })
    vendorId = vendor.id

    const sell = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: vendorId },
      select: { id: true, billRate: true },
    })
    sellId = sell.id

    const owner = await prisma.person.findFirstOrThrow({ where: { primaryEmail: OWNER } })

    // A rate movement to find. The world seeds placements and no rate
    // history, so without this the route would answer an empty list and
    // a 200 would prove nothing.
    await prisma.rateHistory.create({
      data: {
        contractType: 'SELL',
        contractId: sellId,
        rate: sell.billRate + 500,
        rateType: 'HOURLY',
        fromDate: new Date('2026-01-01T00:00:00Z'),
        reason: 'Annual uplift',
        changedById: owner.id,
        previousRate: sell.billRate,
        approvalState: 'APPROVED',
      },
    })

    // A second placement with its own movement, so "their own and
    // nobody else's" has something to be false about.
    const other = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: vendorId, id: { not: sellId } },
      select: { id: true, billRate: true },
    })
    await prisma.rateHistory.create({
      data: {
        contractType: 'SELL',
        contractId: other.id,
        rate: other.billRate + 300,
        rateType: 'HOURLY',
        fromDate: new Date('2026-02-01T00:00:00Z'),
        changedById: owner.id,
        previousRate: other.billRate,
        approvalState: 'APPROVED',
      },
    })

    // The person on the placement, holding a bench seat at the firm —
    // which is what a consultant's context is.
    const line = await prisma.sellContract.findUniqueOrThrow({
      where: { id: sellId },
      select: { personId: true, person: { select: { primaryEmail: true } } },
    })
    consultantEmail = line.person.primaryEmail
    if (!(await prisma.context.findFirst({ where: { personId: line.personId, type: 'CONSULTANT' } }))) {
      await prisma.context.create({
        data: {
          personId: line.personId,
          companyId: vendorId,
          type: 'CONSULTANT',
          grantReason: 'Price desk test — the person the placement is about',
        },
      })
    }

    await seat(vendorId, 'Recruiter', SEAT.engineer, 'Aditi Ramaswamy')
    await seat(vendorId, 'Account Manager', SEAT.accountManager, 'Victor Hale Jr')
    await seat(vendorId, 'HR', SEAT.hr, 'Nadia Priest')
  }, 600_000)

  it('has a rate movement on the books, or this test proves nothing', async () => {
    const rows = await prisma.rateHistory.count({ where: { contractId: sellId } })
    expect(rows).toBeGreaterThan(0)
  })

  it('refuses a delivery engineer the whole firm\'s rate movements', async () => {
    as(SEAT.engineer)
    const { status, body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(status).toBe(403)
    isASentence(body.error.message)
  })

  it('tells that engineer which desk it belongs to, and never which permission', async () => {
    as(SEAT.engineer)
    const { body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(body.error.message).toContain('price desk')
    expect(body.error.message).toContain('account management')
  })

  it('refuses the same engineer one placement\'s rate movements as well as the whole book', async () => {
    as(SEAT.engineer)
    const { status } = await json(
      await rateHistory(req('GET', `/api/rate-history?contractId=${sellId}&contractType=SELL`))
    )
    expect(status).toBe(403)
  })

  it('refuses an HR partner, whose job at a staffing firm is people and never price', async () => {
    as(SEAT.hr)
    const { status } = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(status).toBe(403)
  })

  it('lets the account manager read what the firm charges, because that is the job', async () => {
    as(SEAT.accountManager)
    const { status, body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(status).toBe(200)
    expect(body.data.rateHistory.length).toBeGreaterThan(0)
  })

  it('lets the owner read it too', async () => {
    as(OWNER)
    const { status, body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(status).toBe(200)
    expect(body.data.rateHistory.length).toBeGreaterThan(0)
  })

  it('still shows a consultant the movements on their own placement', async () => {
    // A person paid a share of a number may see that number, on their
    // own assignment only. A consultant holds no permission at all, and
    // gating this route on the price desk must not take their own rate
    // off them.
    as(consultantEmail)
    const { status, body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    expect(status).toBe(200)
    expect(body.data.rateHistory.length).toBeGreaterThan(0)
    expect(body.data.rateHistory.map((r: any) => r.contractId)).toContain(sellId)
  })

  it('shows that consultant their own rate movements and no colleague\'s', async () => {
    as(consultantEmail)
    const { body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    const ids: string[] = body.data.rateHistory.map((r: any) => r.contractId)
    const lines = await prisma.sellContract.findMany({
      where: { id: { in: ids } },
      select: { personId: true },
    })
    const me = await prisma.person.findFirstOrThrow({ where: { primaryEmail: consultantEmail } })
    for (const l of lines) expect(l.personId).toBe(me.id)
  })

  it('never shows a consultant the rate the rung above their employer charges', async () => {
    // Helena Marsh is sold by CloudEPA at $112 and by Computer Systems
    // at $138. Listing both on her own page hands her the whole markup
    // her employer makes on her, by subtraction. The chain descends and
    // never ascends — a person's own rate history is the leg of it that
    // pays them.
    as(consultantEmail)
    const { body } = await json(await rateHistory(req('GET', '/api/rate-history')))
    const ids: string[] = body.data.rateHistory.map((r: any) => r.contractId)
    const lines = await prisma.sellContract.findMany({
      where: { id: { in: ids } },
      select: { companyId: true },
    })
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l.companyId).toBe(vendorId)
  })
})
