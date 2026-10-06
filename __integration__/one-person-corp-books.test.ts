import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, freshWorld, prisma } from './harness'
import { POST as rebuild } from '@/app/api/profitability/rebuild/route'

/**
 * Byrne Critical Care LLC is Colleen Byrne's own corporation. It sells her
 * to Halcyon Talent at $92 an hour; Halcyon sells her to Harlow Health at
 * $114. Her weeks are filed on Byrne's line and signed down the chain:
 * Harlow approves, Halcyon accepts, and she — as Byrne's owner — accepts
 * last. Three weeks are signed all the way down; the newest is signed by
 * Harlow only and waits on Halcyon.
 *
 * On the live demo, 2026-10-06, rebuilding Byrne's books as its owner said
 * "3 of 10 signed weeks rebuilt: 3 postings removed, 0 written". Those
 * three were pay postings the rule before 2026-10-06 wrote on her own
 * acceptance — her company's pay to herself, at $92, against no pay line —
 * which no rule posts now. Her revenue was already on the books, at $92,
 * on Halcyon's acceptance, and stayed. These sentences pin both halves.
 */

let byrne: string
let halcyon: string
let byrneLine: string
let ownerEmail: string
let ownerSeat: string

const asOwner = () => {
  as(ownerEmail)
  return { 'x-context-id': ownerSeat }
}
const rebuildAsOwner = async (body?: unknown) =>
  json(await rebuild(req('POST', '/api/profitability/rebuild', body, asOwner())))

const byrneBooks = () =>
  prisma.orderPosting.findMany({
    where: { companyId: byrne, source: 'TIMESHEET' },
    select: { id: true, kind: true, amountCents: true, sellContractId: true, sourceId: true },
    orderBy: { id: 'asc' },
  })

beforeAll(async () => {
  await freshWorld()
  byrne = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-byrne-critical-care' } })).id
  halcyon = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' } })).id
  byrneLine = (await prisma.sellContract.findFirstOrThrow({ where: { companyId: byrne, clientCompanyId: halcyon } })).id
  const seat = await prisma.context.findFirstOrThrow({
    where: { companyId: byrne, type: 'EMPLOYEE' },
    select: { id: true, person: { select: { primaryEmail: true } } },
  })
  ownerEmail = seat.person.primaryEmail
  ownerSeat = seat.id
}, 600_000)

describe('a one-person corporation’s books', () => {
  it('a one-person corporation’s books hold its revenue on the line it sells its owner on', async () => {
    const r = await rebuildAsOwner()
    expect(r.status).toBe(200)

    const accepted = await prisma.workAssertion.findMany({
      where: { companyId: halcyon, role: 'PASS_THROUGH', state: 'LIVE', timesheet: { sellContractId: byrneLine } },
      select: { id: true, hours: true },
    })
    expect(accepted.length).toBe(3)

    const revenue = (await byrneBooks()).filter((p) => p.kind === 'REVENUE')
    // One revenue posting per week Halcyon accepted, on Byrne's own line,
    // at Byrne's own $92 — never Halcyon's $114 to Harlow Health.
    expect(revenue.map((p) => p.sourceId).sort()).toEqual(accepted.map((a) => a.id).sort())
    for (const p of revenue) {
      const hours = Number(accepted.find((a) => a.id === p.sourceId)!.hours)
      expect(p.sellContractId).toBe(byrneLine)
      expect(p.amountCents).toBe(Math.round(hours * 9_200))
    }
  })

  it('the week Halcyon has not yet accepted is revenue to nobody in Byrne’s books, however long Harlow Health has signed it', async () => {
    const waiting = await prisma.timesheet.findMany({
      where: {
        sellContractId: byrneLine,
        assertions: { none: { companyId: halcyon, role: 'PASS_THROUGH', state: 'LIVE' } },
      },
      select: { assertions: { where: { state: 'LIVE' }, select: { id: true } } },
    })
    expect(waiting.length).toBe(1)
    const ids = waiting[0].assertions.map((a) => a.id)
    expect(ids.length).toBeGreaterThan(0)
    expect((await byrneBooks()).filter((p) => ids.includes(p.sourceId!))).toEqual([])
  })

  it('her own acceptance posts no pay where no pay line names her at a rate, and the books say no margin rather than a perfect one', async () => {
    const own = await prisma.workAssertion.count({
      where: { companyId: byrne, role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
    })
    expect(own).toBe(3)
    expect((await byrneBooks()).filter((p) => p.kind !== 'REVENUE')).toEqual([])
  })
})

describe('the rebuild that removed three postings and wrote none', () => {
  // The live demo's state: the rule before 2026-10-06 posted her own
  // acceptance as PAY at the $92 the signature carried, to Byrne.
  const putOldPayBack = async () => {
    const order = (await byrneBooks()).find((p) => p.kind === 'REVENUE')!
    const projectOrderId = (await prisma.orderPosting.findUniqueOrThrow({ where: { id: order.id } })).projectOrderId
    const mine = await prisma.workAssertion.findMany({
      where: { companyId: byrne, role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
      select: { id: true, hours: true, timesheet: { select: { periodStart: true, personId: true } } },
    })
    await prisma.orderPosting.createMany({
      data: mine.map((a) => ({
        projectOrderId, companyId: byrne, kind: 'PAY' as const,
        amountCents: -Math.round(Number(a.hours) * 9_200), currency: 'USD',
        txCurrency: 'USD', txAmountCents: -Math.round(Number(a.hours) * 9_200),
        personId: a.timesheet.personId, sellContractId: byrneLine, clientCompanyId: halcyon,
        postedAt: a.timesheet.periodStart, source: 'TIMESHEET' as const, sourceId: a.id,
        says: `${Number(a.hours)} hours accepted for pay.`,
      })),
    })
  }

  it('a dry run of the rebuild says what it would do, in “would”, and changes nothing', async () => {
    await putOldPayBack()
    const before = await byrneBooks()
    const r = await rebuildAsOwner({ dryRun: true })
    expect(r.status).toBe(200)
    expect(r.body.data.dryRun).toBe(true)
    expect(r.body.data.weeks).toBe(4)
    expect(r.body.data.checked).toBe(10)
    expect(r.body.data.rebuilt).toBe(3)
    expect(r.body.data.removed).toBe(3)
    expect(r.body.data.written).toBe(0)
    expect(r.body.data.says).toMatch(/would/)
    expect(r.body.data.says).toMatch(/Nothing was changed/)
    expect(await byrneBooks()).toEqual(before)
  })

  it('a rebuild that removes a posting and writes none in its place says why: her own acceptance posts no pay without a pay line', async () => {
    const r = await rebuildAsOwner()
    expect(r.body.data.dryRun).toBe(false)
    expect(r.body.data.removed).toBe(3)
    expect(r.body.data.written).toBe(0)
    expect(r.body.data.postsNothing).toHaveLength(3)
    expect(r.body.data.says).toMatch(/10 signatures on 4 signed weeks read/)
    expect(r.body.data.says).toMatch(/3 signatures post nothing in their place: No pay line names this person at a rate/)

    const books = await byrneBooks()
    expect(books.filter((p) => p.kind === 'PAY')).toEqual([])
    // Her revenue was never touched.
    expect(books.filter((p) => p.kind === 'REVENUE')).toHaveLength(3)

    const again = await rebuildAsOwner()
    expect(again.body.data.rebuilt).toBe(0)
  })

  it('a dryRun that is not true or false is refused, and nothing is rebuilt', async () => {
    await putOldPayBack()
    const before = await byrneBooks()
    const r = await rebuildAsOwner({ dryRun: 'yes' })
    expect(r.status).toBe(400)
    expect(r.body.error.message).toMatch(/Nothing was rebuilt/)
    expect(await byrneBooks()).toEqual(before)
  })
})

describe('postings under a signature that no longer stands', () => {
  // Before 2026-09-30 Colleen's weeks were filed on Halcyon's line and
  // Halcyon accepted them as her employer, which posted pay to Halcyon.
  // When the weeks moved to her own company's line the seed withdrew that
  // acceptance and left its pay in Halcyon's books, reversed by nothing.
  let withdrawn: string
  let corrected: string
  let halcyonOwner: { email: string; seat: string }

  beforeAll(async () => {
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: halcyon, role: { name: 'Owner' }, revokedAt: null },
      select: { id: true, person: { select: { primaryEmail: true } } },
    })
    halcyonOwner = { email: seat.person.primaryEmail, seat: seat.id }

    const weeks = await prisma.timesheet.findMany({
      where: { sellContractId: byrneLine, assertions: { some: { companyId: halcyon, role: 'PASS_THROUGH', state: 'LIVE' } } },
      select: { id: true, periodStart: true, personId: true, totalHours: true },
      orderBy: { periodStart: 'asc' },
      take: 2,
    })
    const halcyonLine = (await prisma.sellContract.findFirstOrThrow({
      where: { companyId: halcyon, personId: weeks[0].personId, clientCompanyId: { not: byrne } },
      select: { id: true, clientCompanyId: true },
    }))
    const projectOrderId = (await prisma.orderPosting.findFirstOrThrow({
      where: { companyId: halcyon, sellContractId: halcyonLine.id },
      select: { projectOrderId: true },
    })).projectOrderId

    const old = async (weekIdx: number, state: 'WITHDRAWN' | 'SUPERSEDED') => {
      const w = weeks[weekIdx]
      const sig = await prisma.workAssertion.create({
        data: { timesheetId: w.id, companyId: halcyon, role: 'EMPLOYER_ACCEPTANCE', hours: 36, rateCents: 9_200, state, at: w.periodStart },
      })
      const p = await prisma.orderPosting.create({
        data: {
          projectOrderId, companyId: halcyon, kind: 'PAY', amountCents: -331_200, currency: 'USD',
          txCurrency: 'USD', txAmountCents: -331_200, personId: w.personId, sellContractId: halcyonLine.id,
          clientCompanyId: halcyonLine.clientCompanyId, postedAt: w.periodStart, source: 'TIMESHEET',
          sourceId: sig.id, says: '36 hours accepted for pay.',
        },
      })
      return { sig: sig.id, posting: p }
    }
    withdrawn = (await old(0, 'WITHDRAWN')).sig
    // A correction made through the screen reverses what it replaced; the
    // pair is a true record and stays.
    const fixed = await old(1, 'SUPERSEDED')
    corrected = fixed.sig
    await prisma.orderPosting.create({
      data: {
        projectOrderId, companyId: halcyon, kind: 'PAY', amountCents: 331_200, currency: 'USD',
        txCurrency: 'USD', txAmountCents: 331_200, personId: fixed.posting.personId, sellContractId: halcyonLine.id,
        clientCompanyId: halcyonLine.clientCompanyId, postedAt: fixed.posting.postedAt, source: 'REVERSAL',
        sourceId: fixed.posting.id, reversalOfId: fixed.posting.id, says: 'Reversed: corrected.',
      },
    })
  })

  const rebuildAsHalcyon = async (body?: unknown) => {
    as(halcyonOwner.email)
    return json(await rebuild(req('POST', '/api/profitability/rebuild', body, { 'x-context-id': halcyonOwner.seat })))
  }

  it('a dry run counts the postings under withdrawn signatures and removes none', async () => {
    const r = await rebuildAsHalcyon({ dryRun: true })
    expect(r.status).toBe(200)
    expect(r.body.data.withdrawnRemoved).toBe(1)
    expect(r.body.data.says).toContain('1 posting under withdrawn signatures would be removed.')
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: withdrawn } })).toBe(1)
  })

  it('Halcyon’s books hold nothing from the acceptance it withdrew when Colleen’s weeks moved to her own company’s line', async () => {
    const r = await rebuildAsHalcyon()
    expect(r.status).toBe(200)
    expect(r.body.data.withdrawnRemoved).toBe(1)
    expect(r.body.data.says).toContain('1 posting under withdrawn signatures removed.')
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: withdrawn } })).toBe(0)

    const again = await rebuildAsHalcyon()
    expect(again.body.data.withdrawnRemoved).toBe(0)
  })

  it('a correction already reversed through the screen keeps both rows, because the pair is a true record', async () => {
    const original = await prisma.orderPosting.findFirstOrThrow({ where: { source: 'TIMESHEET', sourceId: corrected } })
    expect(await prisma.orderPosting.count({ where: { reversalOfId: original.id } })).toBe(1)
  })

  it('a firm rebuilding its own books never removes another firm’s postings under a withdrawn signature', async () => {
    const sig = await prisma.workAssertion.findFirstOrThrow({ where: { id: corrected }, select: { timesheetId: true } })
    const stray = await prisma.workAssertion.create({
      data: { timesheetId: sig.timesheetId, companyId: halcyon, role: 'EMPLOYER_ACCEPTANCE', hours: 36, rateCents: 9_200, state: 'WITHDRAWN' },
    })
    const order = await prisma.orderPosting.findFirstOrThrow({ where: { companyId: halcyon, source: 'TIMESHEET' }, select: { projectOrderId: true, sellContractId: true } })
    await prisma.orderPosting.create({
      data: {
        projectOrderId: order.projectOrderId, companyId: halcyon, kind: 'PAY', amountCents: -100, currency: 'USD',
        txCurrency: 'USD', txAmountCents: -100, sellContractId: order.sellContractId, postedAt: new Date(),
        source: 'TIMESHEET', sourceId: stray.id, says: 'stray',
      },
    })
    const r = await rebuildAsOwner()
    expect(r.body.data.withdrawnRemoved).toBe(0)
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET', sourceId: stray.id } })).toBe(1)
  })
})
