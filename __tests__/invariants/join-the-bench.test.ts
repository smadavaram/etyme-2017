import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * "Join the bench" on a firm's generated page (founder, 2026-10-29:
 * "Tapin gets agents, not a website"). The page is the website; the one
 * door a candidate has on it opens the bench's own ask, and the yes is
 * still the person's own, from the letter.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({
  people: [] as Row[],
  profiles: [] as Row[],
  listings: [] as Row[],
  logs: [] as Row[],
  letters: [] as Row[],
  reads: [] as Row[],
  site: null as Row | null,
  seq: 0,
}))

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn() }))
// Looking an existing person up by address is logged by the shared ask.
vi.mock('@/lib/access-log', () => ({
  logAccess: vi.fn((r: Row) => { h.reads.push(r) }),
  recordRefusal: vi.fn(async (ids: string[], r: Row) => { h.reads.push({ ids, ...r }) }),
}))
vi.mock('@/app/api/consultants/ask-by-email', () => ({
  askByEmail: vi.fn(async (o: Row) => { h.letters.push(o); return 'EMAILED' }),
}))
vi.mock('@/lib/public-site', async (orig) => ({
  ...(await orig<typeof import('@/lib/public-site')>()),
  publicSite: vi.fn(async () => h.site),
}))
vi.mock('@/lib/db', () => {
  const id = (p: string) => `${p}-${++h.seq}`
  const prisma: Row = {
    company: { findFirst: async () => (h.site ? { id: 'firm-1', name: h.site.name } : null) },
    automationLog: {
      count: async () => h.logs.length,
      create: async ({ data }: Row) => { h.logs.push(data); return data },
    },
    person: {
      findUnique: async ({ where }: Row) => {
        const p = h.people.find((x) => x.primaryEmail === where.primaryEmail)
        if (!p) return null
        const prof = h.profiles.find((x) => x.personId === p.id)
        return {
          ...p,
          consultant: prof
            ? { id: prof.id, listings: h.listings.filter((l) => l.consultantId === prof.id && l.companyId === 'firm-1') }
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

import { POST } from '@/app/api/site/[slug]/join/route'
import { offersJoinBench, JOIN_BENCH_COPY, joinReplyFor } from '@/lib/public-site/join-bench'
import { emailSender } from '@/lib/senders'
import { describeSite, titleOf } from '@/lib/public-site'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const vendorSite = { name: 'Tapin', slug: 'tapin', joinBench: true }
const ask = (body: Row) =>
  POST(
    new NextRequest('http://x/api/site/tapin/join', { method: 'POST', body: JSON.stringify({ filledInMs: 5000, ...body }) }),
    { params: Promise.resolve({ slug: 'tapin' }) }
  )

beforeEach(() => {
  h.people = []; h.profiles = []; h.listings = []; h.logs = []; h.letters = []; h.reads = []; h.seq = 0
  h.site = vendorSite
})

describe('Join the bench on a firm’s public page', () => {
  it('a bench firm’s page offers Join the bench, and a client’s page never does', async () => {
    expect(offersJoinBench('VENDOR')).toBe(true)
    for (const kind of ['CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']) expect(offersJoinBench(kind), kind).toBe(false)

    const page = readFileSync(join(process.cwd(), 'src/app/site/[slug]/page.tsx'), 'utf8')
    // Drawn only where the record says so, and only on the staffing firm's page.
    expect(page).toMatch(/site\.joinBench && \(/)
    const suppliersPage = page.slice(page.indexOf('function ForSuppliers'), page.indexOf('function ForTalentAndBuyers'))
    expect(suppliersPage).not.toContain('JoinBench')

    // And the route refuses a client's page too, not only the screen.
    h.site = { name: 'Northbend Athletic', slug: 'world-nike', joinBench: false }
    const res = await ask({ name: 'Ada Lovelace', email: 'ada@example.com' })
    expect(res.status).toBe(404)
    expect(h.listings).toHaveLength(0)
    expect(h.letters).toHaveLength(0)
  })

  it('says in one line what joining means, with no rate and no promise', () => {
    expect(JOIN_BENCH_COPY.means).toBe(
      'You choose how long you stay. You leave every match when it ends. Nothing reaches past this firm until you say yes.'
    )
    expect(Object.values(JOIN_BENCH_COPY).join(' ')).not.toMatch(/\$|rate|résumé|resume|guarantee/i)
  })

  it('joining from the page asks the person onto the bench with their own yes and never makes a second record', async () => {
    // The bench's one ask, the same function Add consultant calls; never a copy of it.
    const route = readFileSync(join(process.cwd(), 'src/app/api/site/[slug]/join/route.ts'), 'utf8')
    expect(route).toContain('askOntoBench(')
    expect(route).not.toMatch(/benchListing\.(create|update)|person\.create|consultantProfile\.create/)
    const first = await ask({ name: 'Ifeoma Obi', email: 'Ifeoma@Example.com ' })
    expect(first.status).toBe(200)
    expect(h.people).toHaveLength(1)
    expect(h.listings).toHaveLength(1)
    // An invitation, not a yes: only the letter's link moves it.
    expect(h.listings[0].state).toBe('INVITED')
    expect(h.listings[0].grantedAt).toBeUndefined()
    expect(h.letters).toHaveLength(1)
    expect(h.letters[0].to).toBe('ifeoma@example.com')
    expect(h.letters[0].body).toContain('If that was not you, ignore this letter')
    expect(h.logs[0].payload.fromPublicPage).toBe(true)

    // Asked again with the same address: nothing new written, nothing sent.
    await ask({ name: 'Somebody Else', email: 'ifeoma@example.com' })
    expect(h.people).toHaveLength(1)
    expect(h.profiles).toHaveLength(1)
    expect(h.listings).toHaveLength(1)
    expect(h.letters).toHaveLength(1)
  })

  it('somebody who already has an account is asked on the record they have, under their own name', async () => {
    h.people.push({ id: 'maya', name: 'Maya Brooks', primaryEmail: 'maya@example.com' })
    h.profiles.push({ id: 'maya-profile', personId: 'maya' })
    await ask({ name: 'M Brooks', email: 'maya@example.com' })
    expect(h.people).toHaveLength(1)
    expect(h.profiles).toHaveLength(1)
    expect(h.listings[0].consultantId).toBe('maya-profile')
    expect(h.people[0].name).toBe('Maya Brooks')
    // Her record was read by her address, and that read is logged as nobody's.
    expect(h.reads).toHaveLength(1)
    expect(h.reads[0].allowed).toBe(false)
  })

  it('a no stands: an address that said no is not asked again from the page', async () => {
    h.people.push({ id: 'jo', name: 'Jo', primaryEmail: 'jo@example.com' })
    h.profiles.push({ id: 'jo-profile', personId: 'jo' })
    h.listings.push({ id: 'l-jo', consultantId: 'jo-profile', companyId: 'firm-1', state: 'DECLINED', revokedAt: null })
    const res = await ask({ name: 'Jo', email: 'jo@example.com' })
    expect(res.status).toBe(200)
    expect(h.listings[0].state).toBe('DECLINED')
    expect(h.letters).toHaveLength(0)
  })

  it('every path gets the same reply, so a stranger learns nothing about an address', async () => {
    const fresh = await (await ask({ name: 'New Person', email: 'new@example.com' })).json()
    const again = await (await ask({ name: 'New Person', email: 'new@example.com' })).json()
    expect(fresh.data.says).toBe(joinReplyFor('Tapin', emailSender() !== null))
    expect(again.data.says).toBe(fresh.data.says)
  })

  it('a form filled by a script writes nothing', async () => {
    const res = await ask({ name: 'Bot', email: 'bot@example.com', company_website: 'x' })
    expect(res.status).toBe(422)
    expect(h.people).toHaveLength(0)
  })
})

describe('what the page says it is', () => {
  const base = { name: 'Tapin', does: 'supplies consultants to clients', openPositions: [], comingFree: [], comingFreeSummary: null }

  it('a page with nothing coming free still reads as the firm', () => {
    expect(describeSite({ ...base, audience: 'TALENT_AND_BUYERS' })).toBe('Tapin supplies consultants to clients.')
    expect(describeSite({ ...base, name: 'Northbend Athletic', does: 'hires contract staff', audience: 'SUPPLIERS' })).toBe(
      'Northbend Athletic hires contract staff.'
    )
    expect(titleOf(base)).toBe('Tapin — supplies consultants to clients')
  })

  it('a page with people coming free names the firm first and then them', () => {
    const said = describeSite({
      ...base,
      audience: 'TALENT_AND_BUYERS',
      comingFree: [{ headline: null, skills: [], location: null, freeOn: '2026-11-01', daysUntilFree: 3, provenAt: null }],
      comingFreeSummary: '1 consultant free within 30 days.',
    })
    expect(said).toBe('Tapin supplies consultants to clients. 1 consultant free within 30 days.')
  })
})
