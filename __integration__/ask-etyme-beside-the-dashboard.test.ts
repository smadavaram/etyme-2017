import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as greet, POST as ask } from '@/app/api/conversations/twin/route'
import { GET as programPage } from '@/app/api/program/route'
import { firmTuesday } from '@/lib/money/firm-today'

/**
 * Ask Etyme runs beside the dashboard, on the seeded world (the founder's
 * walk of fifteen seats, 2026-10-22). Each sentence is a place the chat
 * and a page said different things, and now read one rule.
 */

const D = '@demo.etyme.local'
const TECHPEPLE = `world-techpeple${D}`
const APTIVA = `world-aptiva${D}`

const s: Record<string, any> = {}
const asked = async (text: string) => json(await ask(req('POST', '/api/conversations/twin', { text })))
const idOf = (href: string) => href.split('/').pop()!

describe('Ask Etyme says what the dashboard says', () => {
  beforeAll(async () => {
    await freshWorld()
    s.techpeple = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' } })
    s.cs = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
    s.cavanaugh = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corning' } })
  }, 240_000)

  it('Techpeple’s signed weeks not yet billed in Ask Etyme are exactly the weeks its Today page counts, in the same order', async () => {
    as(TECHPEPLE)
    const r = await asked('Which weeks are signed and not billed?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const a = r.body.data.answer
    expect(a.kind).toBe('LIST')
    const chat = (a.table?.rows ?? []).map((row: any) => idOf(row.href))
    const today = (await firmTuesday(s.techpeple.id))!.signedNotBilled.weeks.map((w) => w.timesheetId)
    expect(chat).toEqual(today)
  })

  it('a signed week of Helena Marsh’s that Computer Systems already holds Techpeple’s invoice for is never put to Techpeple to bill again', async () => {
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const signed = await prisma.timesheet.findMany({
      where: { personId: helena.id, assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } },
      select: { id: true, periodStart: true, periodEnd: true },
    })
    const receipts = await prisma.vendorBill.findMany({
      where: { companyId: s.cs.id, vendorCompanyId: s.techpeple.id, status: { notIn: ['CANCELLED', 'VOID'] } },
      select: { periodStart: true, periodEnd: true },
    })
    const held = signed.filter((w) => receipts.some((b) => b.periodStart && b.periodEnd && b.periodStart <= w.periodStart && b.periodEnd >= w.periodEnd))
    // The walk's own case must be on the seed, or this sentence proves nothing.
    expect(held.length, 'a signed week of Helena’s that a Techpeple invoice at Computer Systems already covers').toBeGreaterThan(0)
    as(TECHPEPLE)
    const r = await asked('Which weeks are signed and not billed?')
    const chat = new Set((r.body.data.answer.table?.rows ?? []).map((row: any) => idOf(row.href)))
    for (const w of held) expect(chat.has(w.id), `week ${w.periodStart.toISOString().slice(0, 10)}`).toBe(false)
  })

  it('Aptiva, seated in Cavanaugh Glassworks’ program, is greeted with the same queue Cavanaugh’s program page shows it, and its mark carries the same number', async () => {
    as(APTIVA)
    const page = await json((await programPage(req('GET', '/api/program')))!)
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.data.seated).toBe(true)
    const rows: any[] = page.body.data.programQueue ?? []
    expect(rows.length, 'something in Cavanaugh’s program needs the seat').toBeGreaterThan(0)

    const mark = await json(await greet(req('GET', '/api/conversations/twin?only=owed')))
    expect(mark.status, JSON.stringify(mark.body)).toBe(200)
    expect(mark.body.data.total).toBe(rows.length)

    const g = await json(await greet(req('GET', '/api/conversations/twin')))
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const cards: any[] = g.body.data.answer.queue ?? []
    expect(cards.map((c) => c.key).sort()).toEqual(rows.map((x) => `${x.type}:${x.entityId}`).sort())
  })

  it('Aptiva asks which timesheets are waiting and reads Cavanaugh Glassworks’ own weeks, never "your client approves those"', async () => {
    as(APTIVA)
    const r = await asked('Which timesheets are waiting?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const a = r.body.data.answer
    expect(a.says).not.toMatch(/Your client approves those timesheets/)
    expect(a.kind).toBe('WEEKS')
    expect(a.says).toContain(s.cavanaugh.name)
  })
})
