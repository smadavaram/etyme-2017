import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The press walk of a small staffing firm's money chain, 2026-11-15
 * (walkers l2a and l2b), through the routes: the activity log never
 * offers an undo that undoes nothing, a refused Undo links to where the
 * work is ended, and payroll defaults can be saved as they stand.
 */

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const automation = await import('@/app/api/automation/route')
const reverse = await import('@/app/api/automation/[id]/reverse/route')
const payroll = await import('@/app/api/settings/payroll/route')

const OWNER = 'world-brightmoor@demo.etyme.local'
let brightmoor = ''
const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: { id } }))

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  as(OWNER)
}, 600_000)

describe('the activity log and a company made a supplier', () => {
  let id = ''

  it('Reverse on a company extension is refused in a sentence naming the company’s History on Companies, and the company stays a supplier', async () => {
    id = (await json(await companies.POST(req('POST', '/api/companies', { name: 'Quillmere Staffing', kind: 'UNCLASSIFIED', domain: 'quillmere-staffing.example' })))).body.data.company.id
    expect((await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' })).status).toBe(201)
    const row = await prisma.automationLog.findFirstOrThrow({ where: { companyId: brightmoor, action: 'COMPANY_EXTENDED', payload: { path: ['otherCompanyId'], equals: id } } })
    expect(row.reversible).toBe(false)

    // A row written before the fix carried reversible: true; the action decides, not the flag.
    await prisma.automationLog.update({ where: { id: row.id }, data: { reversible: true } })
    const r = await json(await reverse.POST(req('POST', `/api/automation/${row.id}/reverse`), { params: Promise.resolve({ id: row.id }) } as any))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Undo this from the company’s History on Companies, not from this log.')
    expect((await prisma.automationLog.findUniqueOrThrow({ where: { id: row.id } })).reversedAt).toBeNull()
    const drawn = await call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id)
    expect(drawn.body.data.positions).toContain('SUPPLIER')
  })

  it('the log reads that row as not reversible here, says where the undo is, and links the Owner to the company', async () => {
    const log = await json(await automation.GET(req('GET', '/api/automation?limit=200')))
    const entry = log.body.data.entries.find((e: any) => e.action === 'COMPANY_EXTENDED' && e.payload?.otherCompanyId === id)
    expect(entry).toMatchObject({ reversible: false, reversedAt: null, undo: 'Undo this from the company’s History on Companies, not from this log.' })
    expect(entry.undoHref).toBe(`/dashboard/companies?open=${id}`)
    const onlyReversible = await json(await automation.GET(req('GET', '/api/automation?limit=200&reversible')))
    expect(onlyReversible.body.data.entries.some((e: any) => e.action === 'COMPANY_EXTENDED')).toBe(false)
  })

  it('Undo refused while a job invitation is open carries a link to Jobs, where the job is cancelled, on the row and in the drawer', async () => {
    const job = await prisma.requirement.findFirstOrThrow({ select: { id: true } })
    await prisma.requirementInvitation.create({ data: { requirementId: job.id, fromCompanyId: brightmoor, toCompanyId: id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } })
    const undo = await call(extend.DELETE as any, 'DELETE', `/api/companies/${id}/extend?as=SUPPLIER`, id)
    expect(undo.status).toBe(409)
    expect(undo.body.error.message).toBe('Quillmere Staffing stays your supplier while 1 open job invitation hangs off it. End or move that work first.')
    expect(undo.body.error.link).toEqual({ href: '/dashboard/requisitions', words: 'Open Jobs to cancel the job you sent them' })
    const drawer = await call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id)
    expect(drawer.body.data.may.remove.SUPPLIER.link).toEqual({ href: '/dashboard/requisitions', words: 'Open Jobs to cancel the job you sent them' })
  })
})

describe('the activity log and a job sent to a supplier', () => {
  const said = 'Suppliers are stood down on Jobs, by cancelling the job, not from this log.'
  let sentId = ''
  let markedId = ''

  it('pressing reverse on such a row by a direct call marks nothing', async () => {
    // A row as the send writes it today, reversible: true.
    const job = await prisma.requirement.findFirstOrThrow({ select: { id: true } })
    sentId = (await prisma.automationLog.create({ data: {
      companyId: brightmoor, action: 'REQUISITION_DISTRIBUTED', summary: 'Data engineer sent to 1 supplier',
      reason: 'Distributed by the Owner', payload: { requirementId: job.id }, reversible: true,
    } })).id
    const before = await prisma.automationLog.count({ where: { companyId: brightmoor, action: 'REVERSAL' } })
    const r = await json(await reverse.POST(req('POST', `/api/automation/${sentId}/reverse`), { params: Promise.resolve({ id: sentId }) } as any))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe(said)
    expect((await prisma.automationLog.findUniqueOrThrow({ where: { id: sentId } })).reversedAt).toBeNull()
    expect(await prisma.automationLog.count({ where: { companyId: brightmoor, action: 'REVERSAL' } })).toBe(before)
  })

  it('a job sent to suppliers is not undone from the log, and the row says where it is stood down, with a link to Jobs', async () => {
    // A row the old Reverse crossed out, and its REVERSAL row: the mark undid nothing.
    markedId = (await prisma.automationLog.create({ data: {
      companyId: brightmoor, action: 'ROLLOFF_CLAIMED', summary: 'A roll-off claimed', reason: 'Claimed by the Owner',
      payload: {}, reversible: true, reversedAt: new Date(),
    } })).id
    await prisma.automationLog.create({ data: {
      companyId: brightmoor, action: 'REVERSAL', summary: 'Reversed: A roll-off claimed', reason: 'The Owner reversed it',
      payload: { reversedEntryId: markedId, originalAction: 'ROLLOFF_CLAIMED' }, reversible: false,
    } })
    const log = await json(await automation.GET(req('GET', '/api/automation?limit=200')))
    const sent = log.body.data.entries.find((e: any) => e.id === sentId)
    expect(sent).toMatchObject({ reversible: false, reversedAt: null, undo: said, undoHref: '/dashboard/requisitions', undoLinkSays: 'Open Jobs to cancel the job' })
    const marked = log.body.data.entries.find((e: any) => e.id === markedId)
    expect(marked).toMatchObject({ reversible: false, reversedAt: null, undo: 'The activity log only records this. It cannot undo it.' })
  })

  it('the can-be-undone tile counts only what the log can undo', async () => {
    const log = await json(await automation.GET(req('GET', '/api/automation?limit=200')))
    expect(log.body.data.entries.filter((e: any) => e.reversible && !e.reversedAt)).toEqual([])
    const onlyReversible = await json(await automation.GET(req('GET', '/api/automation?limit=200&reversible')))
    expect(onlyReversible.body.data.entries).toEqual([])
    const reversed = await json(await automation.GET(req('GET', '/api/automation?limit=200&reversed')))
    expect(reversed.body.data.entries.some((e: any) => e.id === markedId)).toBe(false)
  })
})

describe('Settings > Cycles, payroll defaults never saved', () => {
  it('every other week with no Sunday saves as it stands, and the answer says a W-2 placement waits for the Sunday', async () => {
    await prisma.company.update({
      where: { id: brightmoor },
      data: { payPeriod: 'BIWEEKLY', payFirstPeriodStart: null, paySettingsSetAt: null, paySettingsSetById: null },
    })
    const now = await json(await payroll.GET(req('GET', '/api/settings/payroll')))
    const { payPeriod, payCalcOffsetDays, payDayOffsetDays, payDaysOfMonth, payCalcDaysBefore } = now.body.data
    const saved = await json(await payroll.PATCH(req('PATCH', '/api/settings/payroll', { payPeriod, payCalcOffsetDays, payDayOffsetDays, payDaysOfMonth, payCalcDaysBefore, payFirstPeriodStart: null })))
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.data.message).toBe(
      'Saved. A W-2 placement cannot be recorded by hand until “The Sunday your pay periods are counted from” is set. ' +
      'Until then, the Payroll page lists pay by calendar month.'
    )
    expect((await prisma.company.findUniqueOrThrow({ where: { id: brightmoor }, select: { paySettingsSetAt: true } })).paySettingsSetAt).not.toBeNull()
  })
})
