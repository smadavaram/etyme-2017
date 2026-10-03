import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listContracts } from '@/app/api/contracts/route'
import { ownLinesOnly } from '@/lib/money/own-lines'

/**
 * A delivery engineer reads the contract lines that name him, never his
 * employer's whole book. Karthik Menon, Teleworld's own W2, opened
 * Contracts on 2026-09-30 and read every colleague's placement.
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'

describe('a seat that administers no contracts reads only the lines that name its holder', () => {
  let karthik = ''
  beforeAll(async () => {
    await freshWorld()
    karthik = (await prisma.person.findFirstOrThrow({ where: { name: 'Karthik Menon' } })).id
  }, 240_000)

  it('Karthik’s seat holds none of the desks that read a firm’s contracts', async () => {
    const ctx = await prisma.context.findFirstOrThrow({
      where: { personId: karthik, type: 'EMPLOYEE' },
      include: { role: { select: { permissions: true } } },
    })
    expect(ownLinesOnly(ctx.role?.permissions ?? [])).toBe(true)
  })

  it('the sell lines Karthik reads all name him', async () => {
    as(KARTHIK)
    const { status, body } = await json(await listContracts(req('GET', '/api/contracts?side=sell&limit=50')))
    expect(status, JSON.stringify(body)).toBe(200)
    const rows = body.data.contracts ?? body.data.items ?? body.data
    expect(Array.isArray(rows)).toBe(true)
    for (const r of rows) expect(r.personId ?? r.person?.id).toBe(karthik)
  })

  it('the buy lines Karthik reads are only the ones that pay him', async () => {
    as(KARTHIK)
    const { status, body } = await json(await listContracts(req('GET', '/api/contracts?side=buy&limit=50')))
    expect(status, JSON.stringify(body)).toBe(200)
    const rows = body.data.contracts ?? body.data.items ?? body.data
    for (const r of rows) {
      const people = (r.candidates ?? []).map((c: any) => c.personId ?? c.person?.id)
      expect(people).toContain(karthik)
    }
  })

  it('a desk that reads consultants or payroll still reads the firm’s lines', () => {
    expect(ownLinesOnly(['consultants.read'])).toBe(false)
    expect(ownLinesOnly(['payroll.read'])).toBe(false)
    expect(ownLinesOnly(['*'])).toBe(false)
    expect(ownLinesOnly(['timesheets.read', 'assignments.read'])).toBe(true)
  })
})
