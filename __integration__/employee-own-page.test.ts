import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as myWork } from '@/app/api/me/work/route'

/**
 * Karthik Menon's own page on the seeded world: Teleworld Solutions' own
 * W2 at Corveldt Aerospace, three whole months, ended. Found on a browser
 * walk, 2026-09-30, reading "your vendor bills these" and "from 2026-06-01".
 */

let data: any

beforeAll(async () => {
  await freshWorld()
  const karthik = await prisma.person.findFirstOrThrow({ where: { primaryEmail: { startsWith: 'karthik.menon@' } } })
  as(karthik.primaryEmail)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.status).toBe(200)
  data = r.body.data
}, 900_000)

describe("an employee's own page, on the seeded world", () => {
  it("an employee's own page never says a vendor bills his hours", () => {
    const card = data.summary.signed
    expect(card.label.toLowerCase()).not.toContain('bill')
    expect(card.note.toLowerCase()).not.toContain('bill')
  })

  it("Karthik's signed weeks read as paid, owed to him or waiting on Teleworld, and add up to the card's number", () => {
    const card = data.summary.signed
    expect(card.label).toBe('Approved weeks')
    expect(card.value).toBeGreaterThan(0)
    expect(card.note).toMatch(/paid|owed to you|waiting on Teleworld/)
    const counted = [...card.note.matchAll(/(\d+) /g)].reduce((n: number, m: RegExpMatchArray) => n + Number(m[1]), 0)
    expect(counted).toBe(card.value)
  })

  it('an ended placement shows the day it ended, in plain dates', () => {
    const corveldt = data.placements.find((p: any) => p.site.includes('Corveldt'))
    expect(corveldt, 'his Corveldt placement is on his page').toBeTruthy()
    expect(corveldt.span).toMatch(/^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}, \d{4} · ended$/)
    expect(corveldt.span).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it("a worker's hours never show an ISO date", () => {
    expect(data.timesheets.length).toBeGreaterThan(0)
    for (const t of data.timesheets) {
      expect(t.period).toMatch(/^[A-Z][a-z]{2} \d{1,2}/)
      expect(t.period).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it("a week of Karthik's crossing two months shows each month's days paid on that month's own pay day, as the payroll run paid them", () => {
    const split = data.owed.weeks.filter((w: any) => w.parts && w.parts.length > 1)
    expect(split.length, 'a week of his crosses a month end').toBeGreaterThan(0)
    for (const w of split) {
      const paidOn = w.parts.map((p: any) => p.paidOn)
      expect(new Set(paidOn).size, `the week of ${w.weekOf} is paid on two days`).toBe(w.parts.length)
      for (const p of w.parts) {
        expect(p.stage).toBe('PAID')
        // Paid after the month its days are in, never before.
        expect(p.paidOn.slice(0, 7) > p.to.slice(0, 7), `${p.label} paid ${p.paidOn}`).toBe(true)
      }
      expect(w.parts.reduce((n: number, p: any) => n + p.hours, 0)).toBe(w.hours)
    }
  })
})
