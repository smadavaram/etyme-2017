import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as automation } from '@/app/api/automation/route'
import { POST as reverse } from '@/app/api/automation/[id]/reverse/route'
import { GET as exportGet, POST as exportPost } from '@/app/api/integrations/export/route'
import { GET as reconcileGet } from '@/app/api/integrations/reconcile/route'
import { GET as sheets } from '@/app/api/imports/sheets/route'
import { GET as readiness } from '@/app/api/onboarding/readiness/route'
import { POST as confirmStart } from '@/app/api/onboarding/confirm-start/route'

/**
 * The menu hides a link its route refuses, so the route has to refuse.
 * Karthik Menon, a Teleworld delivery engineer holding
 * assignments.read and timesheets.read, was shown Automation,
 * Integrations, Import and Setup — and every one of them opened for him,
 * the journal export included. Each now asks for the permission its
 * menu link names, and says who to ask in a sentence.
 */

type Seat = { id: string; personId: string; email: string }
let karthik: Seat
let owner: Seat
let teleworldId = ''

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown, params?: unknown) {
  as(seat.email)
  const r = req(method, url, body, { 'x-context-id': seat.id })
  return json(params ? await fn(r, { params: Promise.resolve(params) }) : await fn(r))
}

describe("a delivery engineer's menu and the routes behind it agree", () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const k = await prisma.context.findFirstOrThrow({
      where: { person: { name: 'Karthik Menon' }, type: 'EMPLOYEE', revokedAt: null },
      include: { person: true, role: true },
    })
    teleworldId = k.companyId!
    // The seat the walk found: two read permissions and nothing else.
    const role = await prisma.role.create({
      data: { companyId: teleworldId, name: 'Delivery engineer (menu test)', permissions: ['assignments.read', 'timesheets.read'] },
    })
    await prisma.context.update({ where: { id: k.id }, data: { roleId: role.id } })
    karthik = { id: k.id, personId: k.personId, email: k.person.primaryEmail }
    const ctxs = await prisma.context.findMany({
      where: { companyId: teleworldId, type: 'EMPLOYEE', role: { isNot: null } },
      include: { role: true, person: true },
    })
    const o = ctxs.find((c) => c.role!.permissions.includes('*'))!
    owner = { id: o.id, personId: o.personId, email: o.person.primaryEmail }
  }, 900_000)

  it('a delivery engineer is refused the automation log, the books, the import sheets and the setup checklists, each in a sentence naming who to ask', async () => {
    const refusals = [
      await call(karthik, automation, 'GET', '/api/automation'),
      await call(karthik, exportGet, 'GET', '/api/integrations/export'),
      await call(karthik, reconcileGet, 'GET', '/api/integrations/reconcile'),
      await call(karthik, sheets, 'GET', '/api/imports/sheets'),
      await call(karthik, readiness, 'GET', '/api/onboarding/readiness'),
    ]
    for (const r of refusals) {
      expect(r.status).toBe(403)
      expect(r.body.error.message).toMatch(/Teleworld/)
      expect(r.body.error.message).not.toMatch(/\b[a-z]+\.(read|write|issue|manage)\b/)
    }
  })

  it("nobody who happens to be signed in can send the company's journal to its books", async () => {
    const sent = () => prisma.journalEntry.count({ where: { companyId: teleworldId, exportedAt: { not: null } } })
    const before = await sent()
    const r = await call(karthik, exportPost, 'POST', '/api/integrations/export', { system: 'CSV' })
    expect(r.status).toBe(403)
    expect(await sent()).toBe(before)
  })

  it('a delivery engineer cannot reverse what the system did, nor confirm somebody else started on site', async () => {
    const entry = await prisma.automationLog.create({
      data: { companyId: teleworldId, action: 'TEST_ACTION', summary: 'A test entry', reason: 'Menu test', payload: {}, reversible: true },
    })
    const r = await call(karthik, reverse, 'POST', `/api/automation/${entry.id}/reverse`, undefined, { id: entry.id })
    expect(r.status).toBe(403)
    expect((await prisma.automationLog.findUniqueOrThrow({ where: { id: entry.id } })).reversedAt).toBeNull()

    const line = await prisma.sellContract.findFirst({ where: { companyId: teleworldId, startConfirmedAt: null } })
    if (line) {
      const c = await call(karthik, confirmStart, 'POST', '/api/onboarding/confirm-start', { contractId: line.id })
      expect(c.status).toBe(403)
    }
  })

  it('the owner still opens every one of them', async () => {
    for (const [fn, url] of [
      [automation, '/api/automation'], [exportGet, '/api/integrations/export'],
      [reconcileGet, '/api/integrations/reconcile'], [sheets, '/api/imports/sheets'],
      [readiness, '/api/onboarding/readiness'],
    ] as const) {
      const r = await call(owner, fn, 'GET', url)
      expect(r.status, url).toBe(200)
    }
  })
})
