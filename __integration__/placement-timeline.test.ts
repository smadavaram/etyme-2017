import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { generateCycles } from '@/lib/cycle-generator'
import { cyclesFor } from '@/lib/cycle-kinds'
import { getTemplatePack } from '@/lib/template-packs'

import { GET as placement } from '@/app/api/placements/[id]/route'

/**
 * The contract's timeline lives on the placement thread.
 *
 * Not a separate screen. The 2017 version was a filterable grid whose
 * filter was the engine's own kind names — TimesheetSubmit,
 * SalaryCalculation — and nobody looking at a contract's history thinks
 * in those. Three words instead: hours, pay, bill. And what a viewer may
 * see follows the rule that already governs the pay rate: a client who
 * may not see what we pay may not see when we pay it either.
 */
describe('what is due, on the thread', () => {
  let sellId: string
  let cloudepa: string
  let harlow: string

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    cloudepa = 'world-cloudepa@demo.etyme.local'
    harlow = 'world-harlow-health@demo.etyme.local'

    const s = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id },
      include: { buyLinks: { include: { buyContract: true } } },
    })
    sellId = s.id
    const b = s.buyLinks[0]!.buyContract

    // What the routes write on creation, replayed for a seeded contract.
    const split = cyclesFor(
      { contractType: b.contractType, vendorCompanyId: b.vendorCompanyId },
      getTemplatePack('US_IT')!.cycleDefinitions
    )
    const sellCycles = generateCycles(s.startDate!, s.endDate!, split.sell)
    const buyCycles = generateCycles(s.startDate!, s.endDate!, split.buy)
    await prisma.cycle.createMany({
      data: [
        ...sellCycles.map((c) => ({ sellContractId: s.id, kind: c.kind, dueOn: c.dueOn })),
        ...buyCycles.map((c) => ({ buyContractId: b.id, kind: c.kind, dueOn: c.dueOn })),
      ],
    })
  }, 180_000)

  const open = async (seat: string) => {
    as(seat)
    return json(
      await placement(req('GET', `/api/placements/${sellId}`), { params: Promise.resolve({ id: sellId }) })
    )
  }

  it('the supplier sees hours, pay and bill on its own placement', async () => {
    const r = await open(cloudepa)
    expect(r.status).toBe(200)
    expect(r.body.data.timeline.hours.length).toBeGreaterThan(0)
    expect(r.body.data.timeline.pay.length).toBeGreaterThan(0)
    expect(r.body.data.timeline.bill.length).toBeGreaterThan(0)
  })

  it('a client sees when hours and invoices are due, and never when we pay', async () => {
    const r = await open(harlow)
    expect(r.status).toBe(200)
    expect(r.body.data.timeline.hours.length).toBeGreaterThan(0)
    expect(r.body.data.timeline.bill.length).toBeGreaterThan(0)
    expect(r.body.data.timeline.pay).toEqual([])
  })

  it('every item is labelled in words, never as the engine\'s kind name', async () => {
    const r = await open(cloudepa)
    const t = r.body.data.timeline
    for (const d of [...t.hours, ...t.pay, ...t.bill]) {
      expect(d.label, d.kind).not.toMatch(/_/)
      expect(d.label, d.kind).not.toMatch(/^[A-Z_]+$/)
    }
  })

  it('the next thing to do is the earliest cycle not yet done', async () => {
    const r = await open(cloudepa)
    const t = r.body.data.timeline
    const all = [...t.hours, ...t.pay, ...t.bill].filter((d: { done: boolean }) => !d.done)
    const earliest = all.map((d: { dueOn: string }) => d.dueOn).sort()[0]
    expect(t.next).not.toBeNull()
    expect(t.next.dueOn).toBe(earliest)
  })

  it('the checklist is on the thread, with a verdict a person can read', async () => {
    const r = await open(cloudepa)
    const c = r.body.data.checklist
    expect(['PASS', 'WARN', 'BLOCK']).toContain(c.outcome)
    expect(typeof c.says).toBe('string')
    expect(c.items.length).toBeGreaterThan(0)
    // The seeded person has an I-9 and a background check, the supplier's
    // cover is on file and checked. The NDA is listed as needed but nothing
    // here can hold one yet, so it does not move the verdict.
    expect(c.outcome).toBe('PASS')
    expect(c.items.find((i: { key: string }) => i.key === 'I9_EVERIFY')?.state).toBe('ALREADY_HELD')
    expect(c.items.find((i: { key: string }) => i.key === 'NDA')?.state).toBe('NEEDED')
  })
})
