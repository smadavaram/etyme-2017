import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readCommissions, PATCH as setDefaults } from '@/app/api/payroll/commissions/route'
import { writeDefaultCommissions } from '@/lib/money/commission-write'

/**
 * The firm's default commission rates on Payroll → Commissions (founder,
 * 2026-11-08). The award writes a sales row and a recruiting row from
 * them; the shipped default is none. Brightmoor Staffing's seats, from the
 * seeded world.
 */

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const CONTRACTS = `world-brightmoor-contracts${D}`
const RECRUITER = `world-brightmoor-recruiter${D}`
const PAYROLL = `world-brightmoor-payroll${D}`
const CLIENT_AP = `world-nike-ap${D}`

const s: Record<string, any> = {}
const read = async () => json(await readCommissions(req('GET', '/api/payroll/commissions')))

describe('the firm’s default commission rates', () => {
  beforeAll(async () => {
    await freshWorld()
    s.brightmoor = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' } })).id
    s.nike = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' } })).id
  })

  it('a firm that never set defaults reads that the award writes none', async () => {
    as(OWNER)
    const r = await read()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.defaults.mayEdit).toBe(true)
    expect(r.body.data.defaults.set).toEqual({})
    expect(r.body.data.defaults.lines[0]).toMatch(/^Sales commission: no default/)
  })

  it('the Owner sets a sales default, and it is kept with who set it and when', async () => {
    as(OWNER)
    const r = await json(await setDefaults(req('PATCH', '/api/payroll/commissions', {
      defaults: { SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000, capCents: null, accrueOn: 'ACCEPTED' } },
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.company.findUniqueOrThrow({ where: { id: s.brightmoor }, select: { commissionDefaults: true } })
    const sales = (row.commissionDefaults as any).SALES
    expect(sales).toMatchObject({ basis: 'SHARE_OF_MARGIN', rateBps: 1000, currency: null })
    const owner = await prisma.person.findFirstOrThrow({ where: { primaryEmail: OWNER } })
    expect(sales.setById).toBe(owner.id)
    expect(new Date(sales.setAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('a Contract Manager sets a recruiting default and reads both, and the Owner’s sales default is kept', async () => {
    as(CONTRACTS)
    const r = await json(await setDefaults(req('PATCH', '/api/payroll/commissions', {
      defaults: { RECRUITING: { basis: 'PER_HOUR', amountCents: 200, capCents: 400_000 } },
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.defaults.set.SALES.rateBps).toBe(1000)
    expect(r.body.data.defaults.set.RECRUITING).toMatchObject({ amountCents: 200, capCents: 400_000, currency: 'USD' })
    const page = await read()
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.data.defaults.mayEdit).toBe(true)
  })

  it('a bad value is refused in a sentence naming the kind and the field, and nothing is changed', async () => {
    as(OWNER)
    const before = await prisma.company.findUniqueOrThrow({ where: { id: s.brightmoor }, select: { commissionDefaults: true } })
    const r = await json(await setDefaults(req('PATCH', '/api/payroll/commissions', {
      defaults: { SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 20_000 } },
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('SALES.rateBps')
    expect(r.body.error.message).toMatch(/^Sales commission: /)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: s.brightmoor }, select: { commissionDefaults: true } })
    expect(after.commissionDefaults).toEqual(before.commissionDefaults)
  })

  it('a recruiter is refused setting the firm’s defaults in a sentence naming who sets them', async () => {
    as(RECRUITER)
    const r = await json(await setDefaults(req('PATCH', '/api/payroll/commissions', {
      defaults: { SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 5000 } },
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('The default commission rates are set by the Owner or a Contract Manager at Brightmoor Staffing.')
  })

  it('a recruiter reads no default rates on the commissions page', async () => {
    as(RECRUITER)
    const r = await read()
    if (r.status === 200) expect(r.body.data.defaults).toBeNull()
    else expect(r.status).toBe(403)
  })

  it('payroll reads the defaults and may not change them', async () => {
    as(PAYROLL)
    const r = await read()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.defaults.mayEdit).toBe(false)
    expect(r.body.data.defaults.lines[0]).toMatch(/^Sales commission: 10% of the margin/)
  })

  it('a client never reads or sets a supplier’s commission defaults: it only ever reaches its own firm’s', async () => {
    as(CLIENT_AP)
    const r = await read()
    if (r.status === 200) expect(JSON.stringify(r.body.data.defaults ?? {})).not.toContain('1000')
    const nike = await prisma.company.findUniqueOrThrow({ where: { id: s.nike }, select: { commissionDefaults: true } })
    const w = await json(await setDefaults(req('PATCH', '/api/payroll/commissions', { defaults: { SALES: null } })))
    expect(w.status).toBe(403)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: s.nike }, select: { commissionDefaults: true } })
    expect(after.commissionDefaults).toEqual(nike.commissionDefaults)
  })

  it('a fixed-amount default in dollars is never written on a line paid in another currency, and the award says why', async () => {
    const buy = await prisma.buyContract.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], where: { companyId: s.brightmoor }, select: { id: true, payCurrency: true, startDate: true } })
    const recruiter = await prisma.person.findFirstOrThrow({ where: { primaryEmail: RECRUITER } })
    const owner = await prisma.person.findFirstOrThrow({ where: { primaryEmail: OWNER } })
    await prisma.buyContract.update({ where: { id: buy.id }, data: { payCurrency: 'INR' } })
    try {
      const out = await writeDefaultCommissions(s.brightmoor, {
        sellContractId: (await prisma.sellContract.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], where: { companyId: s.brightmoor }, select: { id: true } })).id,
        buyContractId: buy.id, soldById: null, recruitedById: recruiter.id, startDate: buy.startDate, setById: owner.id,
      })
      expect(out.notWritten.some((x) => x.includes('this line is in INR'))).toBe(true)
      expect(await prisma.contractCommission.count({ where: { buyContractId: buy.id, kind: 'RECRUITING', id: { in: out.written } } })).toBe(0)
    } finally {
      await prisma.buyContract.update({ where: { id: buy.id }, data: { payCurrency: buy.payCurrency } })
    }
  })
})
