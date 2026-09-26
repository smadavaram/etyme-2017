import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as decide } from '@/app/api/requisitions/[id]/approve/route'
import { GET as decisions } from '@/app/api/decisions/route'

/**
 * The desk that acts is the desk that hears — for an approval, too.
 *
 * That rule came out of the client-dashboard week, when a client who
 * signs the work read "Nothing needs you" over six unsigned weeks. The
 * approval chain was the one queue it never reached: `/api/decisions`
 * returned timesheets, expenses, bills, suppliers and contracts, and no
 * requisition, for every desk including the two the chain routes to. So
 * an HR partner or a cost-center lead landed on the program console —
 * the page the demo door drops them on — was shown nothing, and stopped.
 * The requisition they had to sign existed only on a page they would
 * have had to think to open.
 *
 * Addendum E's governance is worth nothing if the person it routes to is
 * never told. And the entitlement is not a permission: the approve route
 * lets exactly one person decide a row — the one named on it, at the
 * lowest rank still pending — so the queue asks the same question, and
 * a rank above is not shown work that is not yet its turn.
 */

const D = '@demo.etyme.local'

const CAVANAUGH = {
  hiring: `world-corning-hiring${D}`,
  hr: `world-corning-hr${D}`,
  owner: `world-corning${D}`,
  ap: `world-corning-ap${D}`,
}

const it_: Record<string, string> = {}

/** The queue this caller reads, as the program console reads it. */
async function queue(email: string) {
  as(email)
  const res = await json(await decisions(req('GET', '/api/decisions')))
  expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()
  return res.body.data.decisions as any[]
}

describe('A requisition waiting on a desk is in the queue that desk reads', () => {

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 600_000)

  it('a requisition over the plan is raised and routed to somebody', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' } })
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: company.id } })

    as(CAVANAUGH.hiring)
    const raised = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Annealing lehr controls lead',
      skills: ['PLC', 'Annealing'],
      location: 'Elmira, NY',
      // Well over any threshold a seeded client sets, so this cannot
      // clear by rule and has to reach a person.
      billMin: 18_000, billMax: 22_000, months: 12, headcount: 8, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(21).toISOString(),
    })))
    expect(raised.body?.error, JSON.stringify(raised.body)).toBeUndefined()
    it_.requisition = raised.body.data.requisition.id

    const pending = await prisma.requirementApproval.findMany({
      where: { requirementId: it_.requisition, outcome: 'PENDING' },
      orderBy: { rank: 'asc' },
    })
    expect(pending.length, 'nothing routed to a person, so there is no queue to test')
      .toBeGreaterThan(0)
    // Two ranks, or the checks below about a desk waiting its turn have
    // nothing to bite on and would pass by being empty.
    expect(
      new Set(pending.map((a) => a.rank)).size,
      'a one-rank chain cannot show that a later rank is not told before its turn'
    ).toBeGreaterThan(1)
    it_.firstApprover = pending[0].approverId!
    it_.firstRank = String(pending[0].rank)
  })

  it('the desk it is waiting on finds it in the queue, without opening the requisitions page', async () => {
    const who = await prisma.person.findUniqueOrThrow({ where: { id: it_.firstApprover } })
    const rows = await queue(who.primaryEmail)
    const mine = rows.filter((d) => d.type === 'REQUISITION_APPROVAL')
    expect(mine.length, `${who.name} was told nothing`).toBeGreaterThan(0)
    expect(mine.some((d) => d.entityId === it_.requisition)).toBe(true)
  })

  it('the row says which role it is and what the desk is being asked', async () => {
    const who = await prisma.person.findUniqueOrThrow({ where: { id: it_.firstApprover } })
    const row = (await queue(who.primaryEmail)).find((d) => d.entityId === it_.requisition)!
    expect(row.title).toBe('Approve requisition — Annealing lehr controls lead')
    // The engine's own reason, which is the question this desk was asked.
    const asked = await prisma.requirementApproval.findFirstOrThrow({
      where: { requirementId: it_.requisition, approverId: it_.firstApprover },
    })
    // The reason with its full stop trimmed, because the row goes on to
    // add the size, the rate and the cost center after a separator.
    expect(row.subtitle).toContain(asked.reason.replace(/\s*\.\s*$/, ''))
    expect(row.subtitle).not.toContain('. ·')
    expect(row.subtitle).toContain('8 positions')
  })

  it('the row opens the requisition itself, where the approve and reject buttons are', async () => {
    const who = await prisma.person.findUniqueOrThrow({ where: { id: it_.firstApprover } })
    const row = (await queue(who.primaryEmail)).find((d) => d.entityId === it_.requisition)!
    expect(row.actionUrl).toBe(`/dashboard/requisitions/${it_.requisition}`)
    expect(row.entityType).toBe('REQUISITION')
  })

  it('a desk at a rank that has not been reached is not shown work it may not do yet', async () => {
    const later = await prisma.requirementApproval.findFirst({
      where: { requirementId: it_.requisition, outcome: 'PENDING', rank: { gt: Number(it_.firstRank) } },
    })
    if (!later?.approverId) return // a one-rank chain has nothing to hide
    const who = await prisma.person.findUniqueOrThrow({ where: { id: later.approverId } })
    const rows = await queue(who.primaryEmail)
    expect(rows.some((d) => d.entityId === it_.requisition)).toBe(false)
  })

  it('a colleague at the same company who is not named on it is told nothing about it', async () => {
    const rows = await queue(CAVANAUGH.ap)
    expect(rows.some((d) => d.entityId === it_.requisition)).toBe(false)
  })

  it('once the desk decides, the row leaves its queue and appears on the next desk’s', async () => {
    const who = await prisma.person.findUniqueOrThrow({ where: { id: it_.firstApprover } })
    as(who.primaryEmail)
    const done = await json(await decide(
      req('POST', `/api/requisitions/${it_.requisition}/approve`, { action: 'approve', reason: 'The plan carries these eight.' }),
      { params: { id: it_.requisition } } as any
    ))
    expect(done.body?.error, JSON.stringify(done.body)).toBeUndefined()

    expect((await queue(who.primaryEmail)).some((d) => d.entityId === it_.requisition)).toBe(false)

    const next = await prisma.requirementApproval.findFirst({
      where: { requirementId: it_.requisition, outcome: 'PENDING' },
      orderBy: { rank: 'asc' },
    })
    if (next?.approverId) {
      const nextWho = await prisma.person.findUniqueOrThrow({ where: { id: next.approverId } })
      const rows = await queue(nextWho.primaryEmail)
      expect(rows.some((d) => d.entityId === it_.requisition)).toBe(true)
    }
  })

  it('a requisition that was called off is on nobody’s queue, whoever was still owed a decision', async () => {
    const stillPending = await prisma.requirementApproval.findFirst({
      where: { requirementId: it_.requisition, outcome: 'PENDING' },
      orderBy: { rank: 'asc' },
    })
    if (!stillPending?.approverId) return
    await prisma.requirement.update({
      where: { id: it_.requisition },
      data: { status: 'CANCELLED', cancelReason: 'the line moved to next year' },
    })
    const who = await prisma.person.findUniqueOrThrow({ where: { id: stillPending.approverId } })
    expect((await queue(who.primaryEmail)).some((d) => d.entityId === it_.requisition)).toBe(false)
  })
})
