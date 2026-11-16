import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { freshWorld, prisma, as, req, json } from './harness'
import { GET as scorecards } from '@/app/api/vendors/scorecards/route'
import { GET as concentrationGET } from '@/app/api/vendors/concentration/route'
import { GET as program } from '@/app/api/program/route'
import { GET as bench } from '@/app/api/bench/route'
import { nothingScoredSays } from '@/lib/scorecard'
import { readBench } from '@/lib/bench-filter'
import { corvaneSeatEmail } from '@/lib/seed-corvane'

/**
 * Batch five, the bench, walked on the seeded world through the real
 * routes (2026-11-16). Every expected figure is counted off the seeded
 * rows or read from the program reader, never typed in.
 */

const CORVANE_OWNER = corvaneSeatEmail('owner', 'demo.etyme.local')
const TECHPEPLE = 'world-techpeple@demo.etyme.local'
let corvaneId = ''
let techpepleId = ''

async function listFor(name: string, email: string) {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['Validation'] } })
  return prisma.benchListing.create({
    data: { consultantId: profile.id, companyId: techpepleId, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() },
  })
}

beforeAll(async () => {
  await freshWorld()
  corvaneId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corvane' }, select: { id: true } })).id
  techpepleId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } })).id
}, 600_000)

describe('Supplier scorecards on the seeded client, which has contracts and has sent no job on Etyme', () => {
  it('the seeded client has active suppliers and no job invitation, so the walk’s state holds', async () => {
    expect(await prisma.counterparty.count({ where: { companyId: corvaneId, relationship: 'SUPPLIER', status: 'ACTIVE' } })).toBeGreaterThan(0)
    expect(await prisma.requirementInvitation.count({ where: { fromCompanyId: corvaneId } })).toBe(0)
  })

  it('never reads "No suppliers yet." and says what fills a scorecard and how many active suppliers are listed under Standing', async () => {
    as(CORVANE_OWNER)
    const r = await json(await scorecards(req('GET', '/api/vendors/scorecards') as NextRequest))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.suppliers).toHaveLength(0)
    const onRegister = await prisma.counterparty.count({ where: { companyId: corvaneId, relationship: 'SUPPLIER' } })
    const active = await prisma.counterparty.count({ where: { companyId: corvaneId, relationship: 'SUPPLIER', status: 'ACTIVE' } })
    expect(r.body.data.onRegister).toBe(onRegister)
    expect(r.body.data.summary).toBe(nothingScoredSays({ onRegister, active, readsStanding: true }))
    expect(r.body.data.summary).toContain(`Your ${active} active suppliers are listed under Standing.`)
    expect(r.body.data.summary).not.toContain('No suppliers yet')
  })

  it('the spread of what the client buys is counted in people from its contracts, through the same suppliers its home page counts', async () => {
    as(CORVANE_OWNER)
    const home = await json(await program(req('GET', '/api/program') as NextRequest))
    expect(home.status, JSON.stringify(home.body)).toBe(200)
    const suppliersOnSite = home.body.data.vendors.filter((v: { headcount: number }) => v.headcount > 0)
    expect(suppliersOnSite.length).toBeGreaterThan(2)

    const r = await json(await concentrationGET(req('GET', '/api/vendors/concentration') as NextRequest))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.reader).toBe('BUYER')
    const part = r.body.data.report.parts.find((p: { dimension: string }) => p.dimension === 'SUPPLIER')
    expect(part.unit).toBe('PEOPLE')
    expect(part.counted).toBe(suppliersOnSite.length)
    expect(part.says).not.toContain('nothing to spread')
    expect(part.topSharePct).not.toBeNull()
    expect(suppliersOnSite.map((v: { name: string }) => v.name)).toContain(part.topName)
    // The largest share is the largest headcount over everybody on site.
    const heads = suppliersOnSite.map((v: { headcount: number }) => v.headcount)
    const total = heads.reduce((a: number, b: number) => a + b, 0)
    expect(part.topSharePct).toBeCloseTo((100 * Math.max(...heads)) / total, 0)
    expect(r.body.data.gaps.join(' ')).toContain('counted in people supplied rather than in money')
  })
})

describe('A sample person on Bench', () => {
  it('the bench route marks somebody at an address no email can reach as a sample person, and somebody reachable as not', async () => {
    const sample = await listFor('Lena Marsh', 'lena.marsh@northwind-staffing.example')
    const reachable = await listFor('Tomas Ruel', 'tomas.ruel@harborline-tech.test')
    as(TECHPEPLE)
    const r = await json(await bench(req('GET', '/api/bench?scope=company') as NextRequest))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const reading = readBench(r.body)
    expect(reading.ok).toBe(true)
    const byId = new Map(reading.asked.map((a) => [a.listingId, a]))
    expect(byId.get(sample.id)?.sample).toBe(true)
    expect(byId.get(reachable.id)?.sample).toBe(false)
  })
})
