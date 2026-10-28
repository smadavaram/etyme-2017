import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as greet, POST as ask } from '@/app/api/conversations/twin/route'
import { GET as programPage } from '@/app/api/program/route'
import { firmTuesday } from '@/lib/money/firm-today'
import { benchAt } from '@/app/api/today/reads'
import { runTwin } from '@/lib/twin/run'
import { POST as decideRoute } from '@/app/api/twin/approvals/[id]/route'
import { setupReminderFor } from '@/lib/setup-checklist-state'

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
  it('who is on the bench in Ask Etyme is who the Today page counts on the bench, so a person on a placement is never read as on the bench', async () => {
    // A firm where somebody who agreed to be on its bench is on a placement today: the walk's case.
    const placed = await prisma.benchListing.findMany({
      where: {
        revokedAt: null, state: 'GRANTED',
        company: { slug: { startsWith: 'world-' } },
        consultant: { person: { sellContracts: { some: { state: 'IN_PROGRESS' } } } },
      },
      select: { companyId: true, company: { select: { slug: true } } },
    })
    let firm: { id: string; email: string } | null = null
    for (const p of placed) {
      const email = `${p.company.slug}${D}`
      if (await prisma.person.findFirst({ where: { primaryEmail: email } })) { firm = { id: p.companyId, email }; break }
    }
    expect(firm, 'a seeded firm with somebody on its bench who is placed today').not.toBeNull()
    as(firm!.email)
    const r = await asked('Who is on the bench?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const chat = (r.body.data.answer.table?.rows ?? []).map((row: any) => row.cells[0]).sort()
    const today = (await benchAt(firm!.id, new Date())).map((b) => b.name).sort()
    expect(chat).toEqual(today)
  })
  it('Colleen Byrne, a one-person firm, finds the license renewal asked of her in her greeting and in her mark’s number, and reads the day her license runs out', async () => {
    as('colleen.byrne@seed.etyme.invalid')
    const g = await json(await greet(req('GET', '/api/conversations/twin')))
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const cards: any[] = g.body.data.answer.queue ?? []
    const own = cards.filter((c) => c.type === 'OWN_PAPER')
    expect(own.length, 'her own paper is a card in her greeting').toBeGreaterThan(0)
    expect(own[0].title).toMatch(/^Your professional license is asked of you\.$/)
    const mark = await json(await greet(req('GET', '/api/conversations/twin?only=owed')))
    expect(mark.body.data.total).toBeGreaterThanOrEqual(own.length)
    expect(g.body.data.answer.says).toMatch(/professional license/)

    const r = await asked('What papers are due?')
    const held = await prisma.verification.findFirst({
      where: { person: { name: 'Colleen Byrne' }, expiresAt: { not: null } },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    })
    const says = JSON.stringify(r.body.data.answer)
    expect(says).toMatch(/runs out on [A-Z][a-z]{2} \d{1,2}; send the new one before then/)
    if (held?.expiresAt) {
      const lapse = held.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      expect(says).toContain(`runs out on ${lapse}`)
    }
  })
  it('Northbend’s hiring manager is offered neither the time limit nor spend, and asks who applied for the HCM integration lead job and reads the names', async () => {
    as(`world-nike-hiring${D}`)
    const g = await json(await greet(req('GET', '/api/conversations/twin')))
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const chips: string[] = g.body.data.chips
    expect(chips).not.toContain('Who is near the time limit?')
    expect(chips).not.toContain('What did we spend by supplier this month?')
    // Every chip she is shown is answered for her, never refused.
    for (const q of chips) {
      const r = await asked(q)
      expect(r.status, q).toBe(200)
      expect(r.body.data.answer.says, q).not.toMatch(/; ask them\.$|needs the model|I answer only about/)
    }
    const r = await asked('Who applied for the HCM integration lead job?')
    const a = r.body.data.answer
    expect(a.kind, JSON.stringify(a)).toBe('LIST')
    expect(a.says).toMatch(/applied for the HCM integration lead job|Nobody has applied for the HCM integration lead job/)
  })

  it('Teleworld’s delivery manager asks who is available and reads Teleworld’s bench, never "not your company’s record"', async () => {
    const tele = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' } })
    const dm = await prisma.context.findFirst({
      where: { companyId: tele.id, type: 'EMPLOYEE', revokedAt: null, role: { name: 'Delivery Manager' } },
      select: { person: { select: { primaryEmail: true } } },
    })
    expect(dm, 'a delivery manager at Teleworld').not.toBeNull()
    as(dm!.person.primaryEmail!)
    const r = await asked('Who is available?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const a = r.body.data.answer
    expect(a.says).not.toMatch(/I answer only about/)
    expect(a.kind, JSON.stringify(a)).toBe('LIST')
  })
  it('no chip refuses the seat it is shown to: Northbend’s program manager and AP clerk, Techpeple, and Aptiva in Cavanaugh’s program', async () => {
    for (const email of [`world-nike-programme${D}`, `world-nike-ap${D}`, TECHPEPLE, APTIVA]) {
      as(email)
      const g = await json(await greet(req('GET', '/api/conversations/twin')))
      expect(g.status, `${email} ${JSON.stringify(g.body)}`).toBe(200)
      const chips: string[] = g.body.data.chips
      expect(chips.length, email).toBeGreaterThan(0)
      for (const q of chips) {
        const r = await asked(q)
        expect(r.status, `${email}: ${q}`).toBe(200)
        expect(r.body.data.answer.says, `${email}: ${q}`).not.toMatch(/; ask them\.$|needs the model|I answer only about|could not be read/)
      }
    }
  })
  it('Northbend’s AP clerk is asked to pay a clean invoice receipt, cannot say yes without the bank reference, and pays it with one', async () => {
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    await runTwin(northbend.id)
    as(`world-nike-ap${D}`)
    const g = await json(await greet(req('GET', '/api/conversations/twin')))
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const items: any[] = g.body.data.answer.items ?? []
    const pay = items.find((i) => i.action === 'invoice_receipt.pay')
    expect(pay, `a pay question for the AP clerk: ${JSON.stringify(items.map((i) => i.action))}`).toBeTruthy()
    expect(pay.pay.number).toBeTruthy()
    // One card per receipt.
    const receipts = items.filter((i) => i.href === pay.href)
    expect(receipts).toHaveLength(1)

    const call = (body: unknown) => decideRoute(req('POST', `/api/twin/approvals/${pay.approvalId}`, body), { params: Promise.resolve({ id: pay.approvalId }) } as any)
    const blank = await json(await call({ decision: 'APPROVED', surface: 'WEB' }))
    expect(blank.status).not.toBe(200)
    expect(blank.body.error.message).toBe('Enter the bank reference, so you can reconcile this payment later.')

    const invoiceId = pay.href.split('/').pop()
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { paid: true, total: true } })
    const yes = await json(await call({ decision: 'APPROVED', surface: 'WEB', answer: { reference: 'ACH-TEST-0451', method: 'ACH' } }))
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { paid: true, total: true } })
    expect(Number(after.paid)).toBeGreaterThan(Number(before.paid))
  })
})

/**
 * The setup checklist's one line in the greeting (2026-10-28): said to the
 * Owner or Admin while something is owed, to nobody else, and never in the
 * number on the mark.
 */
describe('the setup line in the Ask Etyme greeting', () => {
  beforeAll(async () => {
    // Run alone (-t), the world above was never made.
    if (!(await prisma.company.findUnique({ where: { slug: 'world-nike' } }).catch(() => null))) await freshWorld()
  }, 240_000)
  const lineOf = (answer: any) => (answer.more ?? []).filter((l: any) => /^Finish setting up:/.test(l.says))
  const ownerOf = (slug: string) => prisma.context.findFirstOrThrow({
    where: { company: { slug }, role: { name: 'Owner' }, revokedAt: null },
    include: { person: true },
  })
  const emailOf = (o: { person: { primaryEmail: string | null } }) => o.person.primaryEmail!

  it('a seeded client’s Owner is reminded only of what the seed does not hold', async () => {
    const owner = await ownerOf('world-nike')
    as(emailOf(owner))
    const g = await json(await greet(req('GET', '/api/conversations/twin', undefined, { 'x-context-id': owner.id })))
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const want = await setupReminderFor(owner.companyId!, { mayRun: true })
    const lines = lineOf(g.body.data.answer)
    // The seed leaves at least one item to the Owner, so a line is owed.
    expect(want, 'the checklist owes the seeded Owner something').not.toBeNull()
    expect(lines).toHaveLength(1)
    expect(lines[0].says).toMatch(/^Finish setting up: /)
    expect(lines[0].says).toBe(`${want!.says} Complete setup.`)
    expect(lines[0].links).toEqual([{ text: 'Complete setup', href: '/dashboard/settings/setup' }])
    // What the seed holds is never asked again.
    expect(lines[0].says).not.toMatch(/your company|addresses|your sites|papers you require|the people in charge|how you work/)
  })

  it('a seat that cannot run setup never reads the line', async () => {
    as(`world-nike-ap${D}`)
    const g = await json(await greet(req('GET', '/api/conversations/twin')))
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    expect(JSON.stringify(g.body.data.answer)).not.toContain('Finish setting up')
  })

  it('the setup line is never counted in the mark', async () => {
    const owner = await ownerOf('world-nike')
    as(emailOf(owner))
    const h = { 'x-context-id': owner.id }
    const owed = await json(await greet(req('GET', '/api/conversations/twin?only=owed', undefined, h)))
    const g = await json(await greet(req('GET', '/api/conversations/twin', undefined, h)))
    expect(owed.status).toBe(200)
    // The mark is the decisions queue's count; the greeting's cards are that count's rows, and the setup line is neither.
    const cards = (g.body.data.answer.queue ?? []).filter((c: any) => /setup/i.test(`${c.title} ${c.fact ?? ''}`))
    expect(cards).toHaveLength(0)
    expect(g.body.data.answer.says).not.toContain('setting up')
    expect(g.body.data.answer.recommend?.says ?? '').not.toContain('setting up')
    expect(typeof owed.body.data.total).toBe('number')
  })
})
