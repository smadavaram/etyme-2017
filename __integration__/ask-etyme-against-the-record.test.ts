import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as askPost, GET as askGet } from '@/app/api/conversations/twin/route'
import { GET as decisionsGet } from '@/app/api/decisions/route'
import { GET as tenureGet } from '@/app/api/tenure/route'
import { GET as invoicesGet } from '@/app/api/invoices/route'
import { GET as timesheetsGet } from '@/app/api/timesheets/route'
import { GET as papersGet } from '@/app/api/me/papers/route'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { monthsOf } from '@/lib/tenure-days'

/**
 * Ask Etyme's answers graded against the record, not against typed answers
 * (the founder's rating of the harness, 2026-11-03: evals graded against
 * the ledger). The fifty-question file (__tests__/invariants/
 * ask-etyme-questions.test.ts) keeps the wording rules — the voice, the
 * refusals' sentences, no "desk" — over an in-memory record. This file
 * asks the same kinds of question on the seeded world, as the seeded
 * seats, and checks every figure and every name an answer states against
 * what the page that person would open reads, through that page's own
 * route: the decisions list for what needs you, Invoice receipts and Bills
 * for money, the time-limit ledger for months here, the person's own
 * paperwork for papers. Nothing here is typed from the seed, so an answer
 * that disagrees with the record fails even when the seed changes.
 */

type Seat = { email: string; id: string }
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']

/** The count a sentence opens with ("Four things need you", "Two bills are unpaid", "12 timesheets"). */
function countSaid(says: string): number | null {
  const m = says.match(/(?:^|\.\s+)(\d+|[A-Za-z]+) (?:things?|bills?|timesheets?|invoices?|papers?|contractors?|suppliers?)\b/)
  if (!m) return null
  const w = m[1].toLowerCase()
  if (/^\d+$/.test(w)) return Number(w)
  const i = WORDS.indexOf(w)
  return i >= 0 ? i : null
}

/** Dollars as a sentence says them, in minor units: "$42,587.00" → 4258700. */
const dollars = (says: string): number[] =>
  [...says.matchAll(/\$([\d,]+)\.(\d\d)/g)].map((m) => Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]))

describe('Ask Etyme’s answers agree with the record on the seeded world', () => {
  const seats: Record<'PM' | 'AP' | 'HM' | 'AM', Seat> = {} as never
  let northbend = ''
  const ask = async (s: Seat, text: string) => {
    as(s.email)
    const r = await json(await askPost(req('POST', '/api/conversations/twin', { text }, { 'x-context-id': s.id })))
    expect(r.status, text).toBe(200)
    return r.body.data.answer
  }
  const page = async (s: Seat, get: (r: any) => Promise<Response>, url: string) => {
    as(s.email)
    const r = await json(await get(req('GET', url, undefined, { 'x-context-id': s.id })))
    expect(r.status, url).toBe(200)
    return r.body.data
  }

  beforeAll(async () => {
    await freshWorld()
    const seat = async (slug: string, role: string): Promise<Seat> => {
      const c = await prisma.context.findFirstOrThrow({
        where: { company: { slug }, role: { name: role }, revokedAt: null, person: { primaryEmail: { endsWith: '@demo.etyme.local', not: { contains: 'sample' } } } },
        select: { id: true, person: { select: { primaryEmail: true } } },
      })
      return { email: c.person.primaryEmail, id: c.id }
    }
    seats.PM = await seat('world-nike', 'Program Manager')
    seats.AP = await seat('world-nike', 'AP Clerk')
    seats.HM = await seat('world-nike', 'Hiring Manager')
    seats.AM = await seat('world-pinnacle', 'Account Manager')
    northbend = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })).id
  }, 600_000)

  // ── What needs you: the decisions list ─────────────────────────────

  for (const who of ['PM', 'AP', 'HM', 'AM'] as const) {
    it(`“What needs me today?” names exactly what the decisions list holds for the ${who === 'PM' ? 'program manager' : who === 'AP' ? 'AP clerk' : who === 'HM' ? 'hiring manager' : 'supplier’s account manager'}, by name, counted once, and the mark carries the same number`, async () => {
      const s = seats[who]
      const listed = await page(s, decisionsGet, '/api/decisions')
      const answer = await ask(s, 'What needs me today?')
      expect(answer.kind).toBe('NEEDS')
      const cards = new Set<string>((answer.queue ?? []).map((q: { key: string }) => q.key))
      const onRecord = new Set<string>(listed.decisions.map((d: { type: string; entityId: string }) => `${d.type}:${d.entityId}`))
      expect([...cards].sort()).toEqual([...onRecord].sort())
      const total = listed.total ?? listed.decisions.length
      if (total === 0) expect(answer.says).toMatch(/^Nothing needs you/)
      else expect(countSaid(answer.says)).toBe(total + answer.items.length)
      // Every name the sentence gives is a name on the list.
      const named = listed.decisions.map((d: { named?: { whose?: string } }) => d.named?.whose).filter(Boolean) as string[]
      for (const m of answer.says.matchAll(/([A-Z][\p{L}’'.-]+(?: [A-Z][\p{L}’'.-]+)+)’s?/gu)) {
        if (/^(Open|Checked)/.test(m[1])) continue
        expect(named, m[1]).toContain(m[1])
      }
      as(s.email)
      const owed = await json(await askGet(req('GET', '/api/conversations/twin?only=owed', undefined, { 'x-context-id': s.id })))
      expect(owed.body.data.total).toBe(total + answer.items.length)
    })
  }

  // ── Months here: the time-limit ledger ─────────────────────────────

  it('“Who is near the time limit?” names every contractor on site whose limit falls inside the warning window, on the day the Tenure page gives, and nobody else', async () => {
    const ledger = await page(seats.PM, tenureGet, '/api/tenure')
    const window = Math.max(...(await ruleSetFor(northbend)).tenureWarnAtDays)
    const answer = await ask(seats.PM, 'Who is near the time limit?')
    expect(answer.kind).toBe('TIME_LIMIT')
    const today = new Date(answer.rows[0]?.readOn ?? new Date().toISOString().slice(0, 10))
    const due = ledger.people.filter((p: { onSite: boolean; limitReachedOn: string | null }) => {
      if (!p.onSite || !p.limitReachedOn) return false
      const days = Math.round((Date.parse(p.limitReachedOn) - today.getTime()) / 86_400_000)
      return days >= 0 && days <= window
    })
    expect(answer.rows.map((r: { personId: string }) => r.personId).sort()).toEqual(due.map((p: { personId: string }) => p.personId).sort())
    for (const r of answer.rows) {
      const p = ledger.people.find((x: { personId: string }) => x.personId === r.personId)
      expect(r.name).toBe(p.name)
      expect(r.limitOn).toBe(p.limitReachedOn.slice(0, 10))
      expect(r.capMonths).toBe(ledger.tenureCapMonths)
    }
    expect(countSaid(answer.says) ?? (answer.rows.length === 1 ? 1 : null)).toBe(due.length)
  })

  it('a worker’s months against the time limit are the whole months the Tenure page counts for her', async () => {
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'helena.marsh@seed.etyme.invalid' }, select: { id: true } })
    const ledger = await page(seats.PM, tenureGet, '/api/tenure')
    const her = ledger.people.find((p: { personId: string }) => p.personId === helena.id)
    as('helena.marsh@seed.etyme.invalid')
    const hello = await json(await askGet(req('GET', '/api/conversations/twin')))
    const line = (hello.body.data.answer.tail ?? []).map((l: { says: string }) => l.says).find((t: string) => /months? into/.test(t)) as string
    const said = WORDS.indexOf(line.match(/^You are (\w+) months?/)![1])
    expect(said).toBe(monthsOf(her.countedDays ?? her.cumulativeDays))
  })

  it('a worker asking “How long have I been at Northbend?” is told the whole months the Tenure page counts, and the limit day it gives, or that her contracts end before it', async () => {
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'helena.marsh@seed.etyme.invalid' }, select: { id: true } })
    const ledger = await page(seats.PM, tenureGet, '/api/tenure')
    const her = ledger.people.find((p: { personId: string }) => p.personId === helena.id)
    for (const q of ['How long have I been at Northbend?', 'Months here?', 'How long until my time limit?']) {
      as('helena.marsh@seed.etyme.invalid')
      const answer = (await json(await askPost(req('POST', '/api/conversations/twin', { text: q })))).body.data.answer
      expect(answer.says, q).not.toContain('I cannot answer that yet')
      const said = WORDS.indexOf(answer.says.match(/^You are (\w+) months?/)?.[1] ?? '')
      expect(said, q).toBe(monthsOf(her.countedDays ?? her.cumulativeDays))
      expect(answer.says, q).toContain(`${WORDS[ledger.tenureCapMonths]}-month time limit`)
      if (her.limitReachedOn) {
        const day = new Date(her.limitReachedOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        expect(answer.says, q).toContain(`You reach it on ${day}`)
      } else {
        expect(answer.says, q).toContain('Your contracts as booked end before you reach it.')
      }
    }
  })

  // ── Papers: the person's own paperwork ─────────────────────────────

  it('“What papers are due?” asks a worker for exactly the papers her own paperwork page says are still to send', async () => {
    as('helena.marsh@seed.etyme.invalid')
    const mine = (await json(await papersGet(req('GET', '/api/me/papers')))).body.data.papers as Array<{ id: string; todo: string | null; received?: boolean; waived?: boolean }>
    const owed = mine.filter((p) => p.todo && !p.received && !p.waived).map((p) => `paper:${p.id}`)
    const answer = (await json(await askPost(req('POST', '/api/conversations/twin', { text: 'What papers are due?' })))).body.data.answer
    const asked = answer.cards.filter((c: { act: string }) => c.act === 'PAPER').map((c: { key: string }) => c.key)
    expect(asked.sort()).toEqual(owed.sort())
    expect(countSaid(answer.says)).toBe(owed.length)
  })

  // ── Money: Invoice receipts and Bills ──────────────────────────────

  for (const who of ['PM', 'AP'] as const) {
    it(`“What did we spend by supplier this month?” adds up, per supplier, to the invoice receipts the ${who === 'PM' ? 'program manager' : 'AP clerk'}’s Invoice receipts page lists for the month, billed and paid`, async () => {
      const answer = await ask(seats[who], 'What did we spend by supplier this month?')
      expect(answer.kind).toBe('SPEND')
      const { from, to } = answer.period
      const receipts = (await page(seats[who], invoicesGet, '/api/invoices')).invoices
        .filter((i: { direction: string; issuedAt: string; status: string }) => i.direction === 'PAYABLE' && i.issuedAt >= from && i.issuedAt < to && !['VOID', 'CANCELLED', 'DRAFT'].includes(i.status))
      const by = new Map<string, { billed: number; paid: number; n: number }>()
      for (const i of receipts) {
        const k = `${i.engagement.vendorCompany.name}|${i.currency}`
        const row = by.get(k) ?? { billed: 0, paid: 0, n: 0 }
        by.set(k, { billed: row.billed + i.totalMinor, paid: row.paid + i.paidMinor, n: row.n + 1 })
      }
      expect(answer.rows.map((r: any) => [`${r.supplier}|${r.currency}`, r.billedMinor, r.paidMinor, r.receipts]).sort())
        .toEqual([...by.entries()].map(([k, v]) => [k, v.billed, v.paid, v.n]).sort())
      const [billed, paid] = dollars(answer.says)
      expect(billed).toBe(receipts.reduce((s: number, i: any) => s + i.totalMinor, 0))
      expect(paid).toBe(receipts.reduce((s: number, i: any) => s + i.paidMinor, 0))
    })
  }

  it('“Which invoices don’t match the timesheets?” counts the quarter’s invoice receipts per supplier as Invoice receipts lists them, and every receipt held for its hours is a mismatch', async () => {
    const answer = await ask(seats.AP, 'Which invoices don\'t match the timesheets?')
    expect(answer.kind).toBe('VARIANCE')
    const { from, to } = answer.period
    const receipts = (await page(seats.AP, invoicesGet, '/api/invoices')).invoices
      .filter((i: any) => i.direction === 'PAYABLE' && i.issuedAt >= from && i.issuedAt < to && !['VOID', 'CANCELLED', 'DRAFT'].includes(i.status))
    const perSupplier = new Map<string, number>()
    for (const i of receipts) perSupplier.set(i.engagement.vendorCompany.name, (perSupplier.get(i.engagement.vendorCompany.name) ?? 0) + 1)
    expect(answer.rows.map((r: any) => [r.supplier, r.receipts]).sort()).toEqual([...perSupplier.entries()].sort())
    expect(countSaid(answer.says)).toBe(receipts.length)
    // What the AP clerk's list holds for its hours reads as a mismatch here.
    const held = (await page(seats.AP, decisionsGet, '/api/decisions')).decisions
      .filter((d: any) => d.type === 'INVOICE_RECEIPT_HELD').map((d: any) => d.entityId)
    const heldInQuarter = receipts.filter((i: any) => held.includes(i.id))
    const mismatches = answer.rows.reduce((s: number, r: any) => s + r.mismatch + r.held, 0)
    expect(mismatches).toBeGreaterThanOrEqual(heldInQuarter.length)
    for (const i of heldInQuarter) {
      const row = answer.rows.find((r: any) => r.supplier === i.engagement.vendorCompany.name)
      expect(row.mismatch + row.held, i.number).toBeGreaterThan(0)
    }
  })

  it('a supplier’s “Which of my invoices to Northbend are unpaid?” lists every bill its Bills page shows as still owed by Northbend Athletic, with the amount still due', async () => {
    const answer = await ask(seats.AM, 'Which of my invoices to Northbend are unpaid?')
    expect(answer.kind).toBe('LIST')
    const owed = (await page(seats.AM, invoicesGet, '/api/invoices')).invoices
      .filter((i: any) => i.direction === 'RECEIVABLE' && i.outstandingMinor > 0 && i.engagement.clientCompany.name === 'Northbend Athletic' && !['VOID', 'CANCELLED', 'DRAFT'].includes(i.status))
    const rows = answer.table.rows.map((r: { cells: string[] }) => [r.cells[0], r.cells[1], dollars(r.cells[2])[0]])
    expect(rows.sort()).toEqual(owed.map((i: any) => [i.number, i.engagement.clientCompany.name, i.outstandingMinor]).sort())
    expect(dollars(answer.says)[0]).toBe(owed.reduce((s: number, i: any) => s + i.outstandingMinor, 0))
    expect(countSaid(answer.says)).toBe(owed.length)
  })

  // ── Weeks: Timesheets ───────────────────────────────────────────────

  for (const who of ['PM', 'HM'] as const) {
    it(`“Which timesheets are waiting for approval?” lists, for the ${who === 'PM' ? 'program manager' : 'hiring manager'}, exactly the filed weeks Timesheets shows waiting at Northbend Athletic, with each week’s hours`, async () => {
      const answer = await ask(seats[who], 'Which timesheets are waiting for approval?')
      expect(answer.kind).toBe('WEEKS')
      const waiting = (await page(seats[who], timesheetsGet, '/api/timesheets?status=SUBMITTED')).timesheets
        .filter((t: any) => t.status === 'SUBMITTED' && !t.approvedAt && t.sellContract.endClientCompany?.id === northbend)
      expect(answer.rows.map((r: any) => [r.timesheetId, r.person, r.hours]).sort())
        .toEqual(waiting.map((t: any) => [t.id, t.person.name, Number(t.totalHours)]).sort())
      expect(countSaid(answer.says)).toBe(waiting.length)
    })
  }
})
