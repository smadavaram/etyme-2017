import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as alumni } from '@/app/api/alumni/route'
import { POST as askBack } from '@/app/api/alumni/ask-back/route'
import { GET as tenure } from '@/app/api/tenure/route'

/**
 * "Ask them back" gives the time-limit ledger's answer, on the seeded
 * world (Addendum E §E.2.3).
 *
 *   Northbend Athletic   an eighteen-month limit and a ninety-day break.
 *   Kwame Mensah         741 days on site, left fifty days ago: inside the break.
 *   Cavanaugh Glassworks Nadia Petrova left a hundred days ago: the break is served.
 */

const D = '@demo.etyme.local'
const NIKE_OFFICER = `world-nike-compliance${D}`
const CORNING_OFFICER = `world-corning-compliance${D}`
const NIKE_HIRING = `world-nike-hiring${D}`
const CORNING_HIRING = `world-corning-hiring${D}`

async function rowOn(email: string, route: typeof alumni | typeof tenure, path: string, list: 'alumni' | 'people', name: string) {
  as(email)
  const r = await json(await route(req('GET', path)))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  const row = r.body.data[list].find((p: any) => p.name === name)
  expect(row, `${name} is on ${path}`).toBeTruthy()
  return row
}

let northbend = ''
let cavanaugh = ''
let kwame = ''
let nadia = ''

beforeAll(async () => {
  await freshWorld()
  northbend = (await prisma.company.findFirstOrThrow({ where: { name: 'Northbend Athletic' }, select: { id: true } })).id
  kwame = (await prisma.person.findFirstOrThrow({ where: { name: 'Kwame Mensah' }, select: { id: true } })).id
  cavanaugh = (await prisma.company.findFirstOrThrow({ where: { name: 'Cavanaugh Glassworks' }, select: { id: true } })).id
  nadia = (await prisma.person.findFirstOrThrow({ where: { name: 'Nadia Petrova' }, select: { id: true } })).id
}, 120_000)

describe('ask them back reads the time-limit ledger', () => {
  it('Kwame Mensah, inside his break, is shown the eligibility date the ledger shows instead of an ask-back button', async () => {
    const ledger = await rowOn(NIKE_OFFICER, tenure, '/api/tenure', 'people', 'Kwame Mensah')
    const row = await rowOn(NIKE_OFFICER, alumni, '/api/alumni', 'alumni', 'Kwame Mensah')
    expect(ledger.status).toBe('IN_BREAK')
    expect(row.canReengage).toBe(false)
    expect(row.ledgerStatus).toBe(ledger.status)
    expect(row.eligibleDate).toBe(ledger.eligibleDate)
    expect(row.reengageBlockReason).toContain('90-day break')
  })

  it('asking Kwame Mensah back is refused inside his break, with the same day the list and the ledger show', async () => {
    const ledger = await rowOn(NIKE_OFFICER, tenure, '/api/tenure', 'people', 'Kwame Mensah')
    as(NIKE_HIRING)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: kwame, clientCompanyId: northbend })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('BREAK_PERIOD')
    expect(r.body.error.eligibleDate).toBe(ledger.eligibleDate)
    expect(r.body.error.message).toContain('Kwame Mensah cannot be asked back to Northbend Athletic yet.')
  })

  it('Nadia Petrova, out longer than the break, is offered ask them back where the ledger reads her eligible', async () => {
    const ledger = await rowOn(CORNING_OFFICER, tenure, '/api/tenure', 'people', 'Nadia Petrova')
    const row = await rowOn(CORNING_OFFICER, alumni, '/api/alumni', 'alumni', 'Nadia Petrova')
    expect(row.ledgerStatus).toBe(ledger.status)
    expect(row.canReengage).toBe(true)
    expect(row.eligibleDate).toBeNull()
  })

  it('every former worker on Northbend Athletic’s alumni list reads the ledger’s status, and only an eligible one has a button', async () => {
    as(NIKE_OFFICER)
    const led = await json(await tenure(req('GET', '/api/tenure')))
    const al = await json(await alumni(req('GET', '/api/alumni')))
    const byId = new Map(led.body.data.people.map((p: any) => [p.personId, p]))
    let compared = 0
    for (const a of al.body.data.alumni) {
      const l: any = byId.get(a.personId)
      if (!l) continue
      compared++
      expect(a.ledgerStatus, a.name).toBe(l.status)
      if (a.canReengage) expect(['OK', 'WARNING', 'ELIGIBLE'], a.name).toContain(l.status)
      if (a.state !== 'placed' && l.status === 'IN_BREAK') expect(a.eligibleDate, a.name).toBe(l.eligibleDate)
    }
    expect(compared).toBeGreaterThan(1)
  })
})

const askBacksAt = (companyId: string) =>
  prisma.automationLog.count({ where: { companyId, action: 'ALUMNI_ASK_BACK' } })

describe('ask them back is written only for a client the caller acts for, and goes to a supplier', () => {
  it('a caller cannot write an ask-back against a client it does not act for', async () => {
    const before = await askBacksAt(cavanaugh)
    as(NIKE_HIRING)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: nadia, clientCompanyId: cavanaugh })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/your own company/i)
    expect(await askBacksAt(cavanaugh), 'nothing written against Cavanaugh Glassworks').toBe(before)
  })

  it('a supplier that placed somebody at a client cannot ask them back on the client’s behalf', async () => {
    const before = await askBacksAt(northbend)
    as(`world-computer-systems${D}`)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: kwame, clientCompanyId: northbend })))
    expect(r.status).toBe(403)
    expect(typeof r.body.error.message).toBe('string')
    expect(r.body.error.message.length).toBeGreaterThan(20)
    expect(await askBacksAt(northbend)).toBe(before)
  })

  it('asking somebody back who never worked at the client is refused in a sentence', async () => {
    as(CORNING_HIRING)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: kwame, clientCompanyId: cavanaugh })))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toContain('has not worked at Cavanaugh Glassworks')
  })

  it('asking Nadia Petrova back goes to the supplier Cavanaugh Glassworks paid for her, and none of Cavanaugh’s own people is told it as a supplier', async () => {
    const vertex = await prisma.company.findFirstOrThrow({ where: { name: 'Vertex Global' }, select: { id: true } })
    const since = new Date()
    as(CORNING_HIRING)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: nadia })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.clientName).toBe('Cavanaugh Glassworks')
    expect(r.body.data.asked).toContain('Vertex Global')
    expect(r.body.data.message).toContain('Vertex Global')

    const told = await prisma.notification.findMany({
      where: { createdAt: { gte: since }, title: { contains: 'would like Nadia Petrova back' } },
      select: { companyId: true },
    })
    expect(told.length, 'somebody at the supplier is told').toBeGreaterThan(0)
    expect(told.every((n) => n.companyId === vertex.id)).toBe(true)

    const log = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: cavanaugh, action: 'ALUMNI_ASK_BACK' }, orderBy: { at: 'desc' },
    })
    expect((log.payload as any).toCompanyIds).toEqual([vertex.id])
    expect(log.reversible, 'a notice sent cannot be unsent').toBe(false)
    expect(log.reason).toContain('cannot be undone')
  })

  it('the ask-back never names a firm below the rung the client pays', async () => {
    as(CORNING_HIRING)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: nadia, clientCompanyId: cavanaugh })))
    expect(r.status).toBe(200)
    const sahasra = await prisma.company.findFirst({ where: { slug: 'world-sahasra' }, select: { name: true } })
    if (sahasra) expect(JSON.stringify(r.body)).not.toContain(sahasra.name)
  })
})

describe('whose desk asks somebody back', () => {
  it('a compliance officer may read who worked here before, and is told whose desk asks them back', async () => {
    as(CORNING_OFFICER)
    const list = await json(await alumni(req('GET', '/api/alumni')))
    expect(list.body?.error, JSON.stringify(list.body)).toBeUndefined()
    expect(list.body.data.alumni.some((a: any) => a.name === 'Nadia Petrova')).toBe(true)

    const before = await askBacksAt(cavanaugh)
    const r = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: nadia, clientCompanyId: cavanaugh })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/^Asking somebody back to Cavanaugh Glassworks is for the .+ desk/)
    expect(r.body.error.message).toContain('You can read who worked here before')
    expect(await askBacksAt(cavanaugh), 'nothing written').toBe(before)
  })
})

describe('the alumni list draws Ask back only for the desk that may ask', () => {
  it('a compliance officer reads who worked here before with no Ask back button, and the sentence says whose desk asks', async () => {
    as(CORNING_OFFICER)
    const r = await json(await alumni(req('GET', '/api/alumni')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.alumni.find((a: any) => a.name === 'Nadia Petrova')?.canReengage, 'the ledger reads her eligible').toBe(true)
    expect(r.body.data.askBack.mayAsk).toBe(false)
    expect(r.body.data.askBack.says).toMatch(/^Asking somebody back to Cavanaugh Glassworks is for the .+ desk/)

    // The same sentence the request refuses with, word for word.
    const post = await json(await askBack(req('POST', '/api/alumni/ask-back', { personId: nadia })))
    expect(post.status).toBe(403)
    expect(post.body.error.message).toBe(r.body.data.askBack.says)
  })

  it('a hiring manager reads the same list with the Ask back button and no sentence', async () => {
    as(CORNING_HIRING)
    const r = await json(await alumni(req('GET', '/api/alumni')))
    expect(r.body.data.askBack).toEqual({ mayAsk: true, says: null })
  })
})

// Sign-up walk, round two, item 17: a Member at a company that had just
// signed up opened Past contractors and read a 500. A new company's
// default seat holds no permissions at all, so it is the hardest reader.
describe('a Member opening Past contractors sees a page, never an error', () => {
  async function freshFirm(kind: 'CLIENT' | 'VENDOR', slug: string, email: string) {
    const c = await prisma.company.create({ data: { name: `Fresh ${kind} ${slug}`, slug, kind } })
    const member = await prisma.role.create({ data: { companyId: c.id, name: 'Member', permissions: [], isDefault: true } })
    const p = await prisma.person.create({ data: { name: 'Sam Ito', primaryEmail: email } })
    await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: member.id, type: 'EMPLOYEE' } })
    return c
  }

  // Since the one door for a seat with no desk (sign-up walk, round four,
  // problem 2), a Member is refused Past contractors before the route reads
  // anything — at an empty client as at a full one — and the refusal is a
  // sentence, never an error.
  it('a Member at a client is refused Past contractors in a sentence, never an error', async () => {
    const c = await freshFirm('CLIENT', 'fresh-client-alumni', 'sam@fresh-client.example')
    as('sam@fresh-client.example')
    const r = await json(await alumni(req('GET', '/api/alumni')))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe(
      `Past contractors is not part of your seat at ${c.name}. Ask your company’s owner if you need it.`
    )
  })

  it('a Member at a firm that asks for another client’s program is refused in a sentence, never an error', async () => {
    await freshFirm('VENDOR', 'fresh-vendor-alumni', 'sam@fresh-vendor.example')
    as('sam@fresh-vendor.example')
    const r = await json(await alumni(req('GET', `/api/alumni?clientCompanyId=${northbend}`)))
    expect(r.status).toBe(403)
    expect(typeof r.body.error.message).toBe('string')
    expect(r.body.error.message).not.toMatch(/is not a function|undefined|FORBIDDEN/)
    expect(r.body.error.message.length).toBeGreaterThan(20)
  })

  it('a list with people on it says nothing extra', async () => {
    as(NIKE_OFFICER)
    const r = await json(await alumni(req('GET', '/api/alumni')))
    expect(r.body.data.alumni.length).toBeGreaterThan(0)
    expect(r.body.data.says).toBeNull()
  })
})
