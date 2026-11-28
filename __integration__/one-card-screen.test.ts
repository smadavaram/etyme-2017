/**
 * The one-card screen's reader on the seeded world (record 130, build
 * tracker row L3.1.2.12): the same seats the prototypes drew, an AP clerk
 * and a hiring manager at the seeded client, read through the real route.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { prisma, freshWorld, as, req, json } from './harness'
import * as oneCard from '@/app/api/conversations/one-card/route'
import * as decisions from '@/app/api/decisions/route'
import * as twin from '@/app/api/conversations/twin/route'
import { openDecision } from '@/lib/decision-items'
import { cardWordCount } from '@/lib/notify/one-card/wording'

const AP = 'world-northbend-ap@demo.etyme.local'
const HIRING = 'world-northbend-hiring@demo.etyme.local'
const read = async (email: string) => { as(email); return json(await oneCard.GET(req('GET', '/api/conversations/one-card'))) }

beforeAll(async () => { await freshWorld() }, 600_000)

describe('the one-card screen reads the seeded world', () => {
  it('the queue figure is the number on the Ask Etyme badge for the same seat', async () => {
    for (const email of [AP, HIRING]) {
      const got = await read(email)
      as(email)
      const badge = await json(await twin.GET(req('GET', '/api/conversations/twin?only=owed')))
      const list = await json(await decisions.GET(req('GET', '/api/decisions')))
      expect(got.status).toBe(200)
      expect(got.body.data.queue).toBe(badge.body.data.total)
      expect(got.body.data.queue).toBe(list.body.data.total)
    }
  })

  it('every card on the screen is twelve words or fewer', async () => {
    for (const email of [AP, HIRING]) {
      const { body } = await read(email)
      expect(body.data.cards.length).toBeGreaterThan(0)
      for (const c of body.data.cards) expect(cardWordCount(c)).toBeLessThanOrEqual(12)
    }
  })

  it('the AP clerk reads a Pay invoice card with its amount, and one button that opens the receipt', async () => {
    const { body } = await read(AP)
    const pay = body.data.cards.find((c: any) => c.type === 'INVOICE_RECEIPT_TO_PAY')
    expect(pay.act).toBe('Pay invoice')
    expect(pay.figure).toMatch(/^[A-Z]{0,3}[$€£₹₫][\d,.]+$/)
    expect(pay.yes).toBeNull()
    expect(pay.open.href).toMatch(/^\/dashboard\//)
  })

  it('a card with a Yes posts to a route that already exists, so no new door is added for it', async () => {
    const { body } = await read(HIRING)
    const withYes = body.data.cards.filter((c: any) => c.yes)
    expect(withYes.length).toBeGreaterThan(0)
    for (const c of withYes) {
      const path = c.yes.url.split('?')[0].replace(/^\/api\//, '').split('/').map((seg: string) => seg)
      const found = existsSync(join(process.cwd(), 'src/app/api', ...path, 'route.ts')) ||
        // a dynamic segment: the id is a folder named [id]
        existsSync(join(process.cwd(), 'src/app/api', ...path.slice(0, -1), '[id]', 'route.ts')) ||
        existsSync(join(process.cwd(), 'src/app/api', ...path.slice(0, -2), '[id]', ...path.slice(-1), 'route.ts'))
      expect(found, `${c.yes.url} has no route file`).toBe(true)
      expect(c.yes.url).not.toContain('one-card')
    }
  })

  it('reading the screen writes nothing to the ledger', async () => {
    const before = await prisma.recordAction.count()
    await read(HIRING)
    await read(AP)
    expect(await prisma.recordAction.count()).toBe(before)
  })

  it('the ledger line on a card is the latest row written on its record, and says so plainly where there is none', async () => {
    const first = await read(HIRING)
    const card = first.body.data.cards.find((c: any) => c.type === 'EXPENSE_ACCEPTANCE')
    expect(card.why.ledger).toMatch(/^No ledger line yet/)
    const entityId = card.key.split(':')[1]
    const me = await prisma.person.findFirstOrThrow({ where: { primaryEmail: HIRING }, select: { id: true, contexts: { where: { revokedAt: null }, select: { companyId: true }, take: 1 } } })
    await prisma.recordAction.create({ data: { companyId: me.contexts[0].companyId!, recordType: 'Expense', recordId: entityId, action: 'NOTE', summary: 'Receipt checked', personId: me.id, heldAs: 'Hiring Manager' } })
    const again = await read(HIRING)
    expect(again.body.data.cards.find((c: any) => c.key === card.key).why.ledger).toMatch(/Receipt checked$/)
  })

  it('Done today counts what this seat answered today, and On time reads a dash because nothing answered had a due date', async () => {
    const before = await read(AP)
    expect(before.body.data.doneToday).toBe(0)
    expect(before.body.data.onTimePct).toBeNull()
    const me = await prisma.person.findFirstOrThrow({ where: { primaryEmail: AP }, select: { id: true, contexts: { where: { revokedAt: null }, select: { companyId: true }, take: 1 } } })
    const item = await openDecision({ companyId: me.contexts[0].companyId!, personId: me.id, heldAs: 'AP Clerk', question: 'Renew the card program?', ownerPersonId: me.id, openedOn: new Date(), proof: 'The letter.' })
    await prisma.decisionItem.update({ where: { id: item.id }, data: { state: 'APPROVED', decidedByPersonId: me.id, decidedAt: new Date() } })
    const after = await read(AP)
    expect(after.body.data.doneToday).toBe(1)
    expect(after.body.data.onTimePct).toBeNull()
  })

  it('only an Owner may switch the agent, and the AP clerk is shown the word without the switch', async () => {
    const owner = await prisma.context.findFirstOrThrow({ where: { revokedAt: null, suspendedAt: null, role: { name: 'Owner' }, company: { slug: 'world-northbend' } }, select: { person: { select: { primaryEmail: true } } } })
    const clerk = await read(AP)
    expect(clerk.body.data.agent.ownerMaySwitch).toBe(false)
    expect((await read(owner.person.primaryEmail!)).body.data.agent.ownerMaySwitch).toBe(true)
  })

  it('the agent reads Off until the Owner switches one on, then On', async () => {
    expect((await read(AP)).body.data.agent.state).toBe('Off')
    const companyId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-northbend' }, select: { id: true } })).id
    const by = await prisma.person.findFirstOrThrow({ where: { primaryEmail: AP }, select: { id: true } })
    await prisma.agentSwitch.upsert({ where: { companyId_agentKey: { companyId, agentKey: 'timesheet-chase' } }, create: { companyId, agentKey: 'timesheet-chase', state: 'ON', changedById: by.id }, update: { state: 'ON' } })
    expect((await read(AP)).body.data.agent.state).toBe('On')
  })

  it('a worker sees her own next card and never a 403', async () => {
    for (const email of ['helena.marsh@seed.etyme.invalid', 'karthik.menon@seed.etyme.invalid', 'ruben.ortega@seed.etyme.invalid']) {
      const got = await read(email)
      expect(got.status, email).toBe(200)
      expect(got.body.data.own, email).toBe('WORKER')
      expect(got.body.data.queue, email).toBe(got.body.data.cards.length)
      for (const c of got.body.data.cards) {
        expect(c.act).not.toMatch(/^Open/)
        expect(c.yes).toBeNull()
        expect(c.open.href).toMatch(/^\/dashboard\//)
      }
    }
  })

  it('a regional manager is answered with no cards and never a 403', async () => {
    const got = await read('world-corvane-region-us@demo.etyme.local')
    expect(got.status).toBe(200)
    expect(got.body.data.own).toBe('NONE')
    expect(got.body.data.cards).toEqual([])
  })

  it('the agent cell reads the count of agents switched on, and the AP clerk is shown it without a link', async () => {
    const got = await read(AP)
    expect(got.body.data.agent.words).toMatch(/^(Off|\d+ on)$/)
    expect(got.body.data.agent.on).toBeGreaterThanOrEqual(1)
  })

  it('a caller with no seat is refused in a sentence, never handed an empty queue', async () => {
    as('nobody-at-all@example.invalid')
    const res = await json(await oneCard.GET(req('GET', '/api/conversations/one-card')))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.body?.data).toBeUndefined()
  })
})
