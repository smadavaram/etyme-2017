import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { freshWorld, prisma, as, req } from './harness'
import { GET as program } from '@/app/api/program/route'
import { GET as timesheets } from '@/app/api/timesheets/route'
import { GET as me } from '@/app/api/me/route'
import { POST as demo } from '@/app/api/demo/route'
import {
  seedCorvane, corvaneSteps, corvaneSeatEmail, CORVANE_PLANTS, CORVANE_REGIONS, CORVANE_PEOPLE,
} from '@/lib/seed-corvane'
import { regionScopeFor, regionContracts, regionRequirements } from '@/lib/region-scope'
import { BY_REGION_HREF } from '@/lib/nav-table'

/**
 * Corvane Packaging on the seeded world (founder, 2026-10-27, the region
 * map): every plant's figures as rows, a regional manager who reads one
 * region and is refused the rest, and a second seeding that writes
 * nothing.
 */

const DOMAIN = 'demo.etyme.local'
let corvaneId = ''

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' } })).id
}, 600_000)

const atSite = (key: string) => ({ workLocationId: `cv_site_${key}` })

describe('Corvane Packaging, as the drawing has it', () => {
  it('has 31 sites, each with its country, time zone and region', async () => {
    const sites = await prisma.companyLocation.findMany({ where: { companyId: corvaneId } })
    expect(sites).toHaveLength(31)
    for (const s of sites) {
      expect(s.timeZone, s.name).toBeTruthy()
      expect(s.region, s.name).toBeTruthy()
    }
    expect(sites.find((s) => s.name === 'Belfast')).toMatchObject({ country: 'GB', region: 'Northern Ireland', timeZone: 'Europe/London' })
    expect(sites.find((s) => s.name === 'Pune, Maharashtra')).toMatchObject({ country: 'IN', region: 'India', timeZone: 'Asia/Kolkata' })
  })

  it('each plant has the drawing’s contractors on site, open jobs, and weeks filed and not signed', async () => {
    for (const p of CORVANE_PLANTS) {
      const onSite = await prisma.sellContract.count({ where: { clientCompanyId: corvaneId, state: 'IN_PROGRESS', ...atSite(p.key) } })
      const open = await prisma.requirement.count({ where: { companyId: corvaneId, status: 'OPEN', orgUnitId: `cv_unit_site_${p.key}` } })
      const toSign = await prisma.timesheet.count({ where: { status: 'SUBMITTED', clientApprovedAt: null, sellContract: { clientCompanyId: corvaneId, ...atSite(p.key) } } })
      expect({ onSite, open, toSign }, p.plant).toEqual({ onSite: p.contractors, open: p.openJobs, toSign: p.weeksToSign })
    }
  })

  it('bills in the site’s own currency, never converted', async () => {
    const vn = await prisma.sellContract.findFirstOrThrow({ where: atSite('binh-duong') })
    expect({ rate: vn.billRate, currency: vn.billCurrency }).toEqual({ rate: 75000, currency: 'VND' })
    const be = await prisma.sellContract.findFirstOrThrow({ where: atSite('ghent') })
    expect({ rate: be.billRate, currency: be.billCurrency }).toEqual({ rate: 3100, currency: 'EUR' })
  })

  it('Dayton holds one invoice receipt billed over the accepted hours, and one start with no I-9', async () => {
    const lines = await prisma.invoiceLine.findMany({
      where: { sellContract: atSite('dayton') },
      include: { timesheet: { include: { assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } } } },
    })
    const over = lines.filter((l) => Number(l.hours) > Number(l.timesheet!.assertions[0].hours))
    expect(over).toHaveLength(1)
    expect([Number(over[0].hours), Number(over[0].timesheet!.assertions[0].hours)]).toEqual([41.5, 40])
    const hold = await prisma.sellContract.findMany({ where: { ...atSite('dayton'), state: 'DRAFT' }, select: { personId: true } })
    expect(hold).toHaveLength(1)
    expect(await prisma.verification.count({ where: { personId: hold[0].personId, type: 'I9_EVERIFY' } })).toBe(0)
  })

  it('every US contractor on site has an I-9 backed by a named passport, and no paper is seeded abroad', async () => {
    const us = await prisma.sellContract.findMany({ where: { clientCompanyId: corvaneId, state: 'IN_PROGRESS', workLocation: { country: 'US' } }, select: { personId: true } })
    const i9s = await prisma.verification.findMany({ where: { personId: { in: us.map((c) => c.personId) }, type: 'I9_EVERIFY' }, select: { id: true } })
    expect(i9s).toHaveLength(us.length)
    expect(await prisma.documentBacking.count({ where: { formId: { in: i9s.map((v) => v.id) } } })).toBe(us.length)
    const abroad = await prisma.sellContract.findMany({ where: { clientCompanyId: corvaneId, workLocation: { country: { not: 'US' } } }, select: { personId: true } })
    expect(await prisma.verification.count({ where: { personId: { in: abroad.map((c) => c.personId) } } })).toBe(0)
  })
})

describe('a regional manager reads one region', () => {
  it('each regional manager sits on their region, and its scope holds exactly that region’s contractors and jobs', async () => {
    for (const r of CORVANE_REGIONS) {
      const seat = await prisma.context.findFirstOrThrow({
        where: { companyId: corvaneId, person: { primaryEmail: corvaneSeatEmail(`region-${r.key}`, DOMAIN) } },
        include: { orgUnit: true, person: true },
      })
      expect(seat.person.name).toBe(r.lead)
      expect(seat.orgUnit).toMatchObject({ kind: 'REGION', name: r.label })
      const scope = (await regionScopeFor(corvaneId, seat.orgUnitId))!
      const plants = CORVANE_PLANTS.filter((p) => p.region === r.key)
      expect(await prisma.sellContract.count({ where: { ...regionContracts(scope), state: 'IN_PROGRESS' } }), r.label)
        .toBe(plants.reduce((n, p) => n + p.contractors, 0))
      expect(await prisma.requirement.count({ where: { ...regionRequirements(scope), status: 'OPEN' } }), r.label)
        .toBe(plants.reduce((n, p) => n + p.openJobs, 0))
    }
  })

  it('a regional manager is refused a page that reads every region, in a sentence naming the region, with the refused read logged first', async () => {
    as(corvaneSeatEmail('region-latam', DOMAIN))
    const before = await prisma.accessLog.count({ where: { allowed: false, reason: { contains: 'reads Latin America only' } } })
    // The program page narrows to a region since 2026-10-27 (demand's By
    // region); the timesheets list still reads every region.
    const res = await timesheets(req('GET', '/api/timesheets') as NextRequest)
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.error.code).toBe('OUT_OF_REGION')
    expect(body.error.message).toContain('your seat reads Latin America only')
    expect(await prisma.accessLog.count({ where: { allowed: false, reason: { contains: 'reads Latin America only' } } })).toBeGreaterThan(before)
  })

  it('a regional manager still reads who they are', async () => {
    as(corvaneSeatEmail('region-latam', DOMAIN))
    const res = await me(req('GET', '/api/me') as NextRequest)
    expect(res.status).toBe(200)
  })

  it('the head of operations is not a region seat, and reads the whole program', async () => {
    as(corvaneSeatEmail('operations', DOMAIN))
    const res = await program(req('GET', '/api/program') as NextRequest)
    expect(res.status).toBe(200)
  })
})

describe('every Corvane seat opens through the demo door', () => {
  const sit = async (body: Record<string, string>) => {
    const res = await demo(req('POST', '/api/demo', { as: 'world-corvane', ...body }) as NextRequest)
    return { status: res.status, body: await res.json() }
  }

  it('the owner, the head of operations, the CFO, the AP clerk and the compliance officer each open', async () => {
    const owner = await sit({})
    expect(owner.status, owner.body.error?.message).toBe(200)
    for (const d of CORVANE_PEOPLE.filter((p) => p.desk !== 'owner')) {
      const r = await sit({ desk: d.desk })
      expect(r.status, `${d.desk}: ${r.body.error?.message}`).toBe(200)
    }
  })

  it('a hiring manager opens by name, one per plant', async () => {
    const r = await sit({ desk: 'hiring', who: 'Marcus Hollins' })
    expect(r.status, r.body.error?.message).toBe(200)
    const other = await sit({ desk: 'hiring', who: 'Nguyễn Thị Lan' })
    expect(other.status, other.body.error?.message).toBe(200)
  })

  it('a regional manager opens by name and lands on their region', async () => {
    const r = await sit({ desk: 'region', who: 'Valeria Montes' })
    expect(r.status, r.body.error?.message).toBe(200)
    expect(r.body.data.landing).toBe(BY_REGION_HREF)
  })
})

describe('seeding Corvane again', () => {
  it('writes nothing the second time', async () => {
    const count = async () => Promise.all([
      prisma.person.count(), prisma.context.count(), prisma.sellContract.count(), prisma.buyContract.count(),
      prisma.requirement.count(), prisma.timesheet.count(), prisma.workAssertion.count(), prisma.invoice.count(),
      prisma.workOrder.count(), prisma.verification.count(), prisma.orgUnit.count(), prisma.companyLocation.count(),
      prisma.company.count(), prisma.role.count(), prisma.governanceRule.count(),
    ])
    const before = await count()
    for (const step of corvaneSteps()) await seedCorvane({ domain: DOMAIN, prefix: 'world-' }, step)
    expect(await count()).toEqual(before)
  })
})
