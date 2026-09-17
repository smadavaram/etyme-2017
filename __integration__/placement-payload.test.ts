import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { GET as placement } from '@/app/api/placements/[id]/route'

/**
 * What a client is actually sent when it opens a placement.
 *
 * Read from the answer, never from the screen. The screen already hid the
 * supplier's buy leg behind `viewer.isSupplier`, and the route sent it
 * anyway — so the page looked right and the payload was a supplier's cost
 * book, one network tab away from any hiring manager. A test that renders
 * the component would have gone green on both the bug and the fix.
 *
 * So every assertion below is on the JSON. If a future change puts a
 * buy-side field back on the client's copy, this is what reddens.
 */

/**
 * Every value in the answer that is named like money, however deep.
 *
 * Borrowed from `__integration__/full-spine.test.ts`, and for the reason
 * written there: grepping the blob for a number cannot tell a rate from an
 * identifier, because `8500` lives happily inside a cuid. Names are the
 * other way round — a firm's name is distinctive and can hide inside a
 * sentence — so names are checked against the whole blob and rates are
 * checked against the fields that mean money.
 */
function ratesIn(value: unknown, found: number[] = []): number[] {
  if (Array.isArray(value)) {
    for (const v of value) ratesIn(v, found)
    return found
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (/rate|pay|bill|amount|cents/i.test(key)) {
        const n = typeof v === 'string' ? Number(v) : v
        if (typeof n === 'number' && Number.isFinite(n)) found.push(n)
      }
      ratesIn(v, found)
    }
  }
  return found
}

const ctx: Record<string, any> = {}

/** What the sub-vendor asked the supplier for this person, in cents. */
const SENT_ON_RATE = 6_251

async function open(email: string, id: string) {
  as(email)
  return json(
    await placement(req('GET', `/api/placements/${id}`), {
      params: Promise.resolve({ id }),
    })
  )
}

describe('a client opens a placement bought through two firms', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    // A placement an enterprise pays for, where its supplier bought the
    // person from somebody else. That is the only shape where any of this
    // can leak, and the seeded world has several.
    const link = await prisma.contractLink.findFirstOrThrow({
      where: {
        buyContract: { vendorCompanyId: { not: null } },
        sellContract: { clientCompany: { kind: 'CLIENT' } },
      },
      select: {
        buyContract: {
          select: {
            vendorCompanyId: true,
            vendorCompany: { select: { name: true } },
            candidates: { select: { personId: true, payRate: true } },
          },
        },
        sellContract: {
          select: {
            id: true, personId: true, requirementId: true, billRate: true,
            companyId: true, company: { select: { name: true } },
            clientCompanyId: true, clientCompany: { select: { name: true } },
            endClientCompanyId: true,
          },
        },
      },
    })

    const sell = link.sellContract
    ctx.placementId = sell.id
    ctx.personId = sell.personId
    ctx.supplierId = sell.companyId
    ctx.supplierName = sell.company.name
    ctx.clientName = sell.clientCompany.name
    ctx.subVendorName = link.buyContract.vendorCompany!.name
    ctx.subVendorId = link.buyContract.vendorCompanyId
    ctx.payRate =
      link.buyContract.candidates.find((c) => c.personId === sell.personId)?.payRate ?? null
    expect(ctx.payRate, 'the fixture has no pay rate to leak').toBeGreaterThan(0)

    // Whoever owns each firm — the widest seat there is, so nothing below
    // can be explained away as a narrow role.
    const owner = async (companyId: string) =>
      (
        await prisma.context.findFirstOrThrow({
          where: { companyId, revokedAt: null, role: { permissions: { has: '*' } } },
          select: { person: { select: { primaryEmail: true } } },
        })
      ).person.primaryEmail
    ctx.clientEmail = await owner(sell.clientCompanyId)
    ctx.supplierEmail = await owner(sell.companyId)
    // A firm with a seat as wide as anybody's and no stake in this
    // placement at all.
    ctx.strangerEmail = await owner(
      (
        await prisma.company.findFirstOrThrow({
          where: {
            id: {
              notIn: [
                sell.companyId,
                sell.clientCompanyId,
                sell.endClientCompanyId ?? sell.clientCompanyId,
                ctx.subVendorId,
              ],
            },
            contexts: { some: { revokedAt: null, role: { permissions: { has: '*' } } } },
          },
          select: { id: true },
        })
      ).id
    )

    // The hop that was showing up on the client's own thread: the firm
    // below put this person in front of the supplier, at a price, before
    // the supplier put them in front of the client. The seeded chain is
    // papered as contracts rather than as submissions, so the fixture
    // writes the two submissions the forward path would have written.
    const parentRequirement = await prisma.requirement.create({
      data: {
        companyId: sell.companyId,
        title: 'Bought in for the same seat',
        skills: [],
        status: 'FILLED',
        approvalState: 'AUTO_APPROVED',
        source: 'NETWORK',
      },
    })
    const parent = await prisma.submission.create({
      data: {
        requirementId: parentRequirement.id,
        personId: sell.personId,
        fromCompanyId: ctx.subVendorId,
        toCompanyId: sell.companyId,
        kind: 'BENCH',
        rate: SENT_ON_RATE,
        status: 'PLACED',
        submittedAt: day(-20),
      },
    })
    const existing = sell.requirementId
      ? await prisma.submission.findFirst({
          where: { requirementId: sell.requirementId, personId: sell.personId },
          select: { id: true },
        })
      : null
    if (existing) {
      await prisma.submission.update({
        where: { id: existing.id },
        data: { parentSubmissionId: parent.id },
      })
    } else {
      await prisma.submission.create({
        data: {
          requirementId: sell.requirementId!,
          personId: sell.personId,
          fromCompanyId: sell.companyId,
          toCompanyId: sell.clientCompanyId,
          kind: 'NETWORK',
          rate: sell.billRate,
          status: 'PLACED',
          submittedAt: day(-18),
          parentSubmissionId: parent.id,
        },
      })
    }

    ctx.client = (await open(ctx.clientEmail, ctx.placementId)).body
    ctx.supplier = (await open(ctx.supplierEmail, ctx.placementId)).body
    expect(ctx.client?.error, JSON.stringify(ctx.client)).toBeUndefined()
    expect(ctx.supplier?.error, JSON.stringify(ctx.supplier)).toBeUndefined()
  }, 240_000)

  it('the client is sent nothing at all that names the firm below its supplier', () => {
    expect(JSON.stringify(ctx.client.data)).not.toContain(ctx.subVendorName)
  })

  it('the buy contract its supplier signed to staff the job is not in the client’s copy', () => {
    expect(ctx.client.data.contracts.buy).toBeNull()
  })

  it('the firm below is not on the client’s copy as a certificate, nor as a verdict about one', () => {
    expect(ctx.client.data.compliance.supplierCover).toEqual([])
    expect(ctx.client.data.compliance.subVendorCover).toBeNull()
  })

  it('who put the person in front of the supplier, and what they asked for them, stays with the supplier', () => {
    expect(ctx.client.data.submission).not.toBeNull()
    expect(ctx.client.data.submission.sentOnBy).toBeNull()
  })

  it('no figure anywhere in the client’s copy is a rate from below the contract it pays', () => {
    const figures = ratesIn(ctx.client.data)
    expect(figures).not.toContain(ctx.payRate)
    expect(figures).not.toContain(ctx.payRate / 100)
    expect(figures).not.toContain(SENT_ON_RATE)
    expect(figures).not.toContain(SENT_ON_RATE / 100)
  })

  it('the pay days on the supplier’s own payroll are not on the client’s timeline', () => {
    expect(ctx.client.data.timeline.pay).toEqual([])
  })

  it('the client’s owner holds every permission their own company can grant, and still reads none of the supplier’s cost or margin', () => {
    // The point of the test. Permission was never the right gate here: a
    // client owner holds `*`, so every canRead… check passed for them and
    // the supplier's cost book came back inside a 200.
    expect(ctx.client.data.viewer.seePay).toBe(true)
    expect(ctx.client.data.viewer.seeMargin).toBe(true)
    expect(ctx.client.data.money.cost).toBeNull()
    expect(ctx.client.data.money.margin).toBeNull()
  })

  it('the client is still told how many firms stand between it and the person, because that is its own question to answer', () => {
    expect(ctx.client.data.chain.hopsBelow).toBeGreaterThanOrEqual(1)
    // Not "the supplier employs them directly", which is what a missing
    // buy contract used to be read as. Unknown is said as unknown.
    expect(ctx.client.data.chain.weEmployThem).toBeNull()
  })

  it('the client still reads what it is billed, who it pays, and whether the person may start', () => {
    const d = ctx.client.data
    expect(d.viewer.side).toBe('PAYER')
    expect(d.contracts.sell.billRate).toBeGreaterThan(0)
    expect(d.supplier.name).toBe(ctx.supplierName)
    expect(['PASS', 'WARN', 'BLOCK']).toContain(d.checklist.outcome)
    expect(d.checklist.says.length).toBeGreaterThan(10)
  })

  it('the supplier opening the same placement still sees its own buy leg, so what changed is the side and not the fields', () => {
    const d = ctx.supplier.data
    expect(d.viewer.side).toBe('SUPPLIER')
    expect(d.contracts.buy.vendor.name).toBe(ctx.subVendorName)
    expect(d.contracts.buy.payRate).toBe(ctx.payRate / 100)
    expect(d.compliance.subVendorCover.vendor).toBe(ctx.subVendorName)
    expect(d.submission.sentOnBy.company.name).toBe(ctx.subVendorName)
    expect(d.submission.sentOnBy.rate).toBe(SENT_ON_RATE / 100)
  })

  it('a firm that is not a party is told there is no such placement, rather than that it may not look', async () => {
    const r = await open(ctx.strangerEmail, ctx.placementId)
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('No placement by that id.')
  })
})
