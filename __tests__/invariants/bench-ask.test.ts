import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The bench ask, one function for both doors (2026-10-29). A recruiter's
 * "Add consultant" and the person's own "Join the bench" on the firm's
 * public page ask through `askOntoBench`, so the record, the consent rule
 * and the log are the same whichever door the ask came through.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({
  people: [] as Row[],
  profiles: [] as Row[],
  listings: [] as Row[],
  logs: [] as Row[],
  reads: [] as Row[],
  contexts: [] as Row[],
  letters: [] as Row[],
  seq: 0,
}))

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn() }))
vi.mock('@/app/api/consultants/ask-by-email', () => ({
  askByEmail: vi.fn(async (o: Row) => { h.letters.push(o); return 'EMAILED' }),
}))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: vi.fn(async () => ({
    caller: {
      person: { id: 'recruiter-1' },
      company: { id: 'firm-r', name: 'Brightmoor Staffing' },
      permissions: ['consultants.write', 'consultants.read'],
    },
    error: null,
  })),
}))
vi.mock('@/lib/db', () => {
  const id = (p: string) => `${p}-${++h.seq}`
  const prisma: Row = {
    automationLog: { create: async ({ data }: Row) => { h.logs.push(data); return data } },
    accessLog: {
      create: async ({ data }: Row) => { h.reads.push(data); return data },
      createMany: async ({ data }: Row) => { h.reads.push(...data); return { count: data.length } },
    },
    context: { create: async ({ data }: Row) => { h.contexts.push(data); return data } },
    person: {
      findUnique: async ({ where, select }: Row) => {
        const p = h.people.find((x) => x.primaryEmail === where.primaryEmail)
        if (!p) return null
        if (!select?.consultant) return p
        const prof = h.profiles.find((x) => x.personId === p.id)
        const firmId = select.consultant.select.listings.where.companyId
        return {
          ...p,
          consultant: prof
            ? { ...prof, ownCompany: null, listings: h.listings.filter((l) => l.consultantId === prof.id && l.companyId === firmId) }
            : null,
        }
      },
      create: async ({ data }: Row) => { const r = { id: id('person'), ...data }; h.people.push(r); return r },
    },
    consultantProfile: {
      create: async ({ data }: Row) => { const r = { id: id('profile'), ...data }; h.profiles.push(r); return r },
    },
    benchListing: {
      create: async ({ data }: Row) => { const r = { id: id('listing'), revokedAt: null, ...data }; h.listings.push(r); return r },
      update: async ({ where, data }: Row) => { const r = h.listings.find((l) => l.id === where.id)!; Object.assign(r, data); return r },
    },
  }
  prisma.$transaction = async (fn: (tx: Row) => unknown) => fn(prisma)
  return { prisma }
})

import { askOntoBench } from '@/lib/consultant-portfolio/bench-ask'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { readAsTheFirm, firmViewOf } from '@/lib/consultant-portfolio/firm-view'

const PAGE = { id: 'firm-p', name: 'Tapin' }
const fromPage = (name: string, email: string) => askOntoBench({ firm: PAGE, name, email, by: null })
const fromRecruiter = async (name: string, email: string) =>
  addConsultant(new NextRequest('http://x/api/consultants', { method: 'POST', body: JSON.stringify({ name, email }) }))

const maya = () => {
  h.people.push({ id: 'maya', name: 'Maya Brooks', primaryEmail: 'maya@example.test' })
  h.profiles.push({ id: 'maya-profile', personId: 'maya', headline: null, skills: [], location: null, workAuth: null, availableFrom: null, visibility: 'INTERNAL', rateFloor: null })
}

/** The record an ask leaves, with the ids and the door taken out. */
const shapeOf = (firmId: string) => {
  const listing = h.listings.find((l) => l.companyId === firmId)!
  const log = h.logs.find((l) => l.companyId === firmId && l.action === 'BENCH_LISTING_REQUESTED')!
  return {
    listing: { state: listing.state, tier: listing.tier, revokedAt: listing.revokedAt, termsAgreedAt: listing.termsAgreedAt },
    log: { action: log.action, reversible: log.reversible, keys: Object.keys(log.payload).sort() },
  }
}

beforeEach(() => {
  h.people = []; h.profiles = []; h.listings = []; h.logs = []; h.reads = []; h.contexts = []; h.letters = []; h.seq = 0
})

describe('one bench ask for the page and the recruiter', () => {
  it('the page and the recruiter ask onto the bench through one function and write one record', async () => {
    const page = await fromPage('Ike Danso', 'ike@example.test')
    expect(page.kind).toBe('ASKED')
    const r = await fromRecruiter('Ada Obi', 'ada@example.test')
    expect(r.status).toBe(201)

    // One person, one profile, one invitation each; the same record shape and log line.
    expect(h.people).toHaveLength(2)
    expect(h.profiles).toHaveLength(2)
    expect(shapeOf('firm-r')).toEqual(shapeOf('firm-p'))
    expect(shapeOf('firm-p').listing.state).toBe('INVITED')
    const asks = h.logs.filter((l) => l.action === 'BENCH_LISTING_REQUESTED')
    expect(asks.map((l) => l.payload.door)).toEqual(['PUBLIC_PAGE', 'ADD_CONSULTANT'])
    expect(asks.map((l) => l.payload.requestedBy)).toEqual([null, 'recruiter-1'])
    expect(h.letters).toHaveLength(2)

    // And the recruiter's route writes no listing of its own any more.
    const route = readFileSync(join(process.cwd(), 'src/app/api/consultants/route.ts'), 'utf8')
    expect(route).toContain('askOntoBench(')
    expect(route).not.toContain('benchListing.create')
  })

  it('a consultant record made for a new address is written down as made, from either door, and can be undone', async () => {
    await fromPage('Ike Danso', 'ike@example.test')
    await fromRecruiter('Ada Obi', 'ada@example.test')
    const made = h.logs.filter((l) => l.action === 'CONSULTANT_CREATED')
    expect(made.map((l) => [l.payload.door, l.payload.createdBy, l.reversible])).toEqual([
      ['PUBLIC_PAGE', null, true],
      ['ADD_CONSULTANT', 'recruiter-1', true],
    ])
    expect(made.every((l) => l.reason && l.payload.listingId)).toBe(true)
  })

  it('somebody who already has a record is never written down as made again', async () => {
    maya()
    await fromPage('M. Brooks', 'maya@example.test')
    await fromRecruiter('M Brooks', 'maya@example.test')
    expect(h.logs.filter((l) => l.action === 'CONSULTANT_CREATED')).toEqual([])
  })

  it('nobody is seated at the firm before their yes, from either door', async () => {
    await fromPage('Ike Danso', 'ike@example.test')
    await fromRecruiter('Ada Obi', 'ada@example.test')
    expect(h.contexts).toEqual([])
  })

  it('a person who already has an account is asked on their own record from either door', async () => {
    maya()
    const page = await fromPage('M. Brooks', 'Maya@Example.test ')
    expect(page.kind === 'ASKED' && page.path).toBe('ASK_EXISTING')
    const r = await fromRecruiter('M Brooks', 'maya@example.test')
    expect(r.status).toBe(201)
    expect((await r.json()).data.asked).toBe(true)

    // No second person and no second profile; her own name kept; one listing per firm.
    expect(h.people).toHaveLength(1)
    expect(h.people[0].name).toBe('Maya Brooks')
    expect(h.profiles).toHaveLength(1)
    expect(h.listings.map((l) => [l.consultantId, l.companyId])).toEqual([['maya-profile', 'firm-p'], ['maya-profile', 'firm-r']])
    expect(h.letters.map((l) => l.personId)).toEqual(['maya', 'maya'])
  })

  it('a no stands from either door', async () => {
    maya()
    h.listings.push({ id: 'no-p', consultantId: 'maya-profile', companyId: 'firm-p', state: 'DECLINED', revokedAt: null })
    h.listings.push({ id: 'no-r', consultantId: 'maya-profile', companyId: 'firm-r', state: 'DECLINED', revokedAt: null })

    const page = await fromPage('Maya Brooks', 'maya@example.test')
    expect(page).toMatchObject({ kind: 'NOTHING', path: 'SAID_NO' })
    const r = await fromRecruiter('Maya Brooks', 'maya@example.test')
    expect(r.status).toBe(409)
    expect((await r.json()).error.code).toBe('SAID_NO')

    expect(h.listings.map((l) => l.state)).toEqual(['DECLINED', 'DECLINED'])
    expect(h.logs).toEqual([])
    expect(h.letters).toEqual([])
  })

  it('a listing the person took back is asked afresh, never restored to a yes', async () => {
    maya()
    h.listings.push({ id: 'back', consultantId: 'maya-profile', companyId: 'firm-p', state: 'GRANTED', revokedAt: new Date('2026-10-01'), termsAgreedAt: new Date('2026-09-01') })
    const page = await fromPage('Maya Brooks', 'maya@example.test')
    expect(page.kind === 'ASKED' && page.path).toBe('ASK_AGAIN')
    expect(h.listings[0]).toMatchObject({ state: 'INVITED', revokedAt: null, termsAgreedAt: null })
  })

  it('looking somebody up by address from the page is logged as a refused read with no actor, before anything is said', async () => {
    maya()
    await fromPage('Maya Brooks', 'maya@example.test')
    expect(h.reads).toHaveLength(1)
    expect(h.reads[0]).toMatchObject({ subjectId: 'maya', allowed: false, actorPersonId: null, actorCompanyId: null, action: 'PUBLIC_PAGE_ADDRESS_LOOKUP' })
    expect(h.reads[0].reason).toContain('the visitor was told nothing about this person')
  })

  it('looking somebody up by address from Add consultant is logged as that recruiter’s read at that firm', async () => {
    maya()
    await fromRecruiter('Maya Brooks', 'maya@example.test')
    await new Promise((r) => setTimeout(r, 0))
    expect(h.reads).toHaveLength(1)
    expect(h.reads[0]).toMatchObject({ subjectId: 'maya', allowed: true, actorPersonId: 'recruiter-1', actorCompanyId: 'firm-r', action: 'MARKETING_REQUEST' })
  })

  it('an address nobody holds reads nobody, so no read is logged', async () => {
    await fromPage('Ike Danso', 'ike@example.test')
    expect(h.reads).toEqual([])
  })

  it('the page never states terms, so a listing asked from it promises no pay', async () => {
    await fromPage('Ike Danso', 'ike@example.test')
    expect(h.listings[0]).toMatchObject({ termsEngagementType: null, termsPayRateCents: null, termsStatedById: null })
  })

  it('what a firm types about a person who already has an account is kept on the firm’s listing and never overwrites the person', async () => {
    maya()
    h.profiles[0] = { ...h.profiles[0], headline: 'Payroll analyst', skills: ['Excel'], location: 'Toledo, OH' }
    const r = await addConsultant(new NextRequest('http://x/api/consultants', {
      method: 'POST',
      body: JSON.stringify({
        name: 'M Brooks', email: 'maya@example.test',
        headline: 'Workday HCM consultant', skills: ['Workday HCM', ' Payroll ', 'workday hcm'],
        location: 'San Antonio, TX', notes: 'Met at the Dallas meetup.', workAuth: 'H1B',
        rateMin: 6000, rateMax: 8000,
      }),
    }))
    expect(r.status).toBe(201)

    // The firm's view is on its own listing, with its rate.
    expect(h.listings[0]).toMatchObject({
      companyId: 'firm-r',
      firmHeadline: 'Workday HCM consultant',
      firmSkills: ['Workday HCM', 'Payroll'],
      firmLocation: 'San Antonio, TX',
      firmNotes: 'Met at the Dallas meetup.',
      rateMin: 6000,
      rateMax: 8000,
    })
    // Her own name and profile are untouched.
    expect(h.people[0].name).toBe('Maya Brooks')
    expect(h.profiles).toHaveLength(1)
    expect(h.profiles[0]).toMatchObject({ headline: 'Payroll analyst', skills: ['Excel'], location: 'Toledo, OH', workAuth: null })

    // And the firm reads its own view first, her own words where it said nothing.
    const read = readAsTheFirm({ headline: 'Payroll analyst', skills: ['Excel'], location: 'Toledo, OH' }, h.listings[0])
    expect(read).toMatchObject({ headline: 'Workday HCM consultant', skills: ['Workday HCM', 'Payroll'], location: 'San Antonio, TX', notes: 'Met at the Dallas meetup.' })
    expect(readAsTheFirm({ headline: 'Payroll analyst', skills: ['Excel'], location: 'Toledo, OH' }, firmViewOf({})))
      .toMatchObject({ headline: 'Payroll analyst', skills: ['Excel'], location: 'Toledo, OH', notes: null })
  })

  it('the firm is told in one line that the person already has an account', async () => {
    maya()
    const r = await addConsultant(new NextRequest('http://x/api/consultants', {
      method: 'POST',
      body: JSON.stringify({ name: 'M Brooks', email: 'maya@example.test', skills: ['Workday HCM'] }),
    }))
    const says: string = (await r.json()).data.message
    expect(says.startsWith('Maya Brooks already has an account. Their own name and papers stay theirs; what you typed is kept on your bench listing.')).toBe(true)
  })

  it('the public page never writes a firm’s view of the person, and never clears one', async () => {
    maya()
    h.listings.push({ id: 'back', consultantId: 'maya-profile', companyId: 'firm-p', state: 'GRANTED', revokedAt: new Date('2026-10-01'), firmNotes: 'Strong on payroll.' })
    await fromPage('Maya Brooks', 'maya@example.test')
    expect(h.listings[0].firmNotes).toBe('Strong on payroll.')
  })
})
