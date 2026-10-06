import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

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
  let techpeple: string
  let harlow: string

  beforeAll(async () => {
    await freshWorld()

    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })
    techpeple = 'world-techpeple@demo.etyme.local'
    harlow = 'world-harlow-health@demo.etyme.local'

    const s = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id },
      include: { buyLinks: { include: { buyContract: true } } },
    })
    sellId = s.id

    // The world seed wrote the cycles; the thread reads them.
  }, 180_000)

  const open = async (seat: string) => {
    as(seat)
    return json(
      await placement(req('GET', `/api/placements/${sellId}`), { params: Promise.resolve({ id: sellId }) })
    )
  }

  it('the supplier sees hours, pay and bill on its own placement', async () => {
    const r = await open(techpeple)
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

  it('every item is labeled in words, never as the engine\'s kind name', async () => {
    const r = await open(techpeple)
    const t = r.body.data.timeline
    for (const d of [...t.hours, ...t.pay, ...t.bill]) {
      expect(d.label, d.kind).not.toMatch(/_/)
      expect(d.label, d.kind).not.toMatch(/^[A-Z_]+$/)
    }
  })

  it('the next thing to do is the earliest cycle not yet done', async () => {
    const r = await open(techpeple)
    const t = r.body.data.timeline
    const all = [...t.hours, ...t.pay, ...t.bill].filter((d: { done: boolean }) => !d.done)
    const earliest = all.map((d: { dueOn: string }) => d.dueOn).sort()[0]
    expect(t.next).not.toBeNull()
    expect(t.next.dueOn).toBe(earliest)
  })

  it('the checklist is on the thread, reads what the order asked for, and warns in words on a certificate never filed', async () => {
    const r = await open(techpeple)
    const c = r.body.data.checklist
    expect(['PASS', 'WARN', 'BLOCK']).toContain(c.outcome)
    expect(typeof c.says).toBe('string')
    expect(c.items.length).toBeGreaterThan(0)
    // The seeded person has an I-9 and a background check, the supplier's
    // cover is on file and checked. Since 2026-09-21 the thread reads the
    // line's own required set: this placement's order asks Techpeple for a
    // certificate of good standing that was never filed, so the honest
    // verdict is a warning naming it, never a silent pass. The NDA is the
    // shipped default nobody wrote on an order, so it is listed and moves
    // nothing — the line between "somebody asked" and "a default".
    expect(c.outcome).toBe('WARN')
    expect(c.says).toMatch(/good standing/i)
    expect(c.items.find((i: { key: string }) => i.key === 'I9_EVERIFY')?.state).toBe('ALREADY_HELD')
    const nda = c.items.find((i: { key: string }) => i.key === 'NDA')
    expect(nda?.state).toBe('NEEDED')
    expect(nda?.from).toBe('DEFAULT')
    expect(c.items.find((i: { key: string }) => i.key === 'MSA')?.from).toBe('ORDER')
  })
})

describe('a placement waiting on its first day, read by each side in its own words', () => {
  let id = ''
  let clientSeat = { id: '', email: '' }
  let supplierSeat = { id: '', email: '' }

  beforeAll(async () => {
    await freshWorld()
    // Ingrid Sørensen at Northbend Athletic: dated to start, held up on her I-9.
    const sc = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: 'Ingrid Sørensen' }, state: 'DRAFT' },
    })
    id = sc.id
    const seatAt = async (companyId: string) => {
      const c = await prisma.context.findFirstOrThrow({
        where: { companyId, revokedAt: null, role: { name: 'Owner' } },
        include: { person: true },
      })
      return { id: c.id, email: c.person.primaryEmail }
    }
    clientSeat = await seatAt(sc.clientCompanyId)
    supplierSeat = await seatAt(sc.companyId)
  }, 900_000)

  async function read(seat: { id: string; email: string }) {
    as(seat.email)
    const r = await json(await placement(req('GET', `/api/placements/${id}`, undefined, { 'x-context-id': seat.id }), { params: Promise.resolve({ id }) }))
    expect(r.status).toBe(200)
    return r.body.data
  }

  it('a placement that has not started says starts, not started', async () => {
    const p = await read(clientSeat)
    expect(p.startSays).toMatch(/^due to start [A-Z][a-z]{2} \d{1,2}, \d{4}/)
    expect(p.startSays).not.toMatch(/\bstarted\b/)
  })

  it('on the client’s screen the next thing due is an invoice receipt it expects, never a bill to raise', async () => {
    const p = await read(clientSeat)
    expect(p.timeline.next?.label).toBe('Invoice receipt expected')
  })

  it('on the supplier’s screen the same date is the bill it raises', async () => {
    const p = await read(supplierSeat)
    expect(p.timeline.next?.label).toBe('Bill to raise')
  })
})

describe('a line booked past the person’s time limit says so on the placement', () => {
  beforeAll(async () => { await freshWorld() }, 900_000)

  it('Lucía Fernández’s Pinnacle Resourcing line says how far past her time limit it runs, and what to do', async () => {
    const sc = await prisma.sellContract.findFirstOrThrow({
      where: { person: { name: 'Lucía Fernández' }, company: { name: 'Pinnacle Resourcing' }, state: 'IN_PROGRESS' },
    })
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: sc.clientCompanyId, revokedAt: null, role: { name: 'Owner' } },
      include: { person: true },
    })
    as(seat.person.primaryEmail)
    const r = await json(await placement(req('GET', `/api/placements/${sc.id}`, undefined, { 'x-context-id': seat.id }), { params: Promise.resolve({ id: sc.id }) }))
    expect(r.status).toBe(200)
    expect(r.body.data.runsPast).toMatch(
      /^Pinnacle Resourcing’s contract runs to [A-Z][a-z]{2} \d{1,2}, \d{4}, \d+ months? past the day Lucía Fernández reaches the time limit \([A-Z][a-z]{2} \d{1,2}, \d{4}\)\. Shorten it or plan the break\.$/
    )
  })

  it('a line that ends inside the limit says nothing about it', async () => {
    const sc = await prisma.sellContract.findFirstOrThrow({ where: { person: { name: 'Ingrid Sørensen' }, state: 'DRAFT' } })
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: sc.clientCompanyId, revokedAt: null, role: { name: 'Owner' } }, include: { person: true },
    })
    as(seat.person.primaryEmail)
    const r = await json(await placement(req('GET', `/api/placements/${sc.id}`, undefined, { 'x-context-id': seat.id }), { params: Promise.resolve({ id: sc.id }) }))
    expect(r.body.data.runsPast).toBeNull()
  })
})
