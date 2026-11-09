import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readSwitch, PATCH as turnSwitch } from '@/app/api/settings/ask-etyme/route'

/**
 * The model switch, through its one door, on the seeded world. The founder,
 * as Tapin's Owner on production, was told "an owner or admin can turn it
 * on under Settings" (2026-11-03); this is the route that sentence points
 * at, pressed as the seats that may and may not.
 */

type Seat = { id: string; personId: string; email: string }
let owner: Seat
let companyId = ''
const savedKey = process.env.ANTHROPIC_API_KEY

async function call(fn: any, method: string, body?: unknown, seat: Seat = owner) {
  as(seat.email)
  return json(await fn(req(method, '/api/settings/ask-etyme', body, { 'x-context-id': seat.id })))
}

describe('the Owner turns the model on or off for their company', () => {
  beforeAll(async () => {
    await freshWorld()
    const ctx = await prisma.context.findFirstOrThrow({ orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    owner = { id: ctx.id, personId: ctx.personId, email: ctx.person.primaryEmail }
    companyId = ctx.companyId!
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
  })

  it('the Owner or an Admin turns the model on or off for their company under Settings, recorded with who and when', async () => {
    const before = Date.now()
    const on = await call(turnSwitch, 'PATCH', { on: true, reason: 'Trying it for a month.' })
    expect(on.status, JSON.stringify(on.body)).toBe(200)
    expect(on.body.data).toMatchObject({ on: true, setById: owner.personId, canEdit: true })
    expect(on.body.data.setByName).toBeTruthy()
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.askEtymeModelOn).toBe(true)
    expect(row.askEtymeModelSetById).toBe(owner.personId)
    expect(row.askEtymeModelSetAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId, action: 'ASK_ETYME_MODEL_SET' }, orderBy: { at: 'desc' } })
    expect(log.reason).toBe('Trying it for a month.')
    expect(log.reversible).toBe(true)

    const off = await call(turnSwitch, 'PATCH', { on: false, reason: 'Month over.' })
    expect(off.status).toBe(200)
    expect(off.body.data.on).toBe(false)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).askEtymeModelOn).toBe(false)
  })

  it('the panel says the model is not set up on this deployment where no key exists, and the choice is still recorded', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await call(turnSwitch, 'PATCH', { on: true, reason: 'Ready for when it is set up.' })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ on: true, modelSetUp: false })
    expect(r.body.data.message).toContain('not set up on this deployment')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).askEtymeModelOn).toBe(true)
    const read = await call(readSwitch, 'GET')
    expect(read.body.data).toMatchObject({ on: true, modelSetUp: false, setById: owner.personId })
  })

  it('nobody else may change the switch, and the refusal says who may', async () => {
    const seats = await prisma.context.findMany({
      where: { type: 'EMPLOYEE', companyId: { not: null }, roleId: { not: null } },
      include: { person: true, role: true },
    })
    const other = seats.find((c) => !c.role!.permissions.includes('*') && !c.role!.permissions.includes('settings.manage'))
    expect(other, 'the seeded world has a seat without settings.manage').toBeTruthy()
    const before = await prisma.company.findUniqueOrThrow({ where: { id: other!.companyId! } })
    const r = await call(turnSwitch, 'PATCH', { on: !before.askEtymeModelOn, reason: 'Because.' }, {
      id: other!.id, personId: other!.personId, email: other!.person.primaryEmail,
    })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('Turning the model on or off')
    expect(r.body.error.message).toMatch(/is done by .+ at /)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: other!.companyId! } })
    expect(after.askEtymeModelOn).toBe(before.askEtymeModelOn)
    expect(after.askEtymeModelSetAt?.getTime() ?? null).toBe(before.askEtymeModelSetAt?.getTime() ?? null)
  })
})
