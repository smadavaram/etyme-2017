import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A staffing or bench firm's public page, read by a client (the Tapin
 * walk, 2026-10-29: "a client reads nothing to act on: nobody coming
 * free, no ask box, no contact").
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({
  company: null as Row | null,
  people: [] as Row[],
  rolling: [] as Row[],
  bench: [] as Row[],
  working: [] as string[],
  seats: [] as Row[],
  notices: [] as Row[],
  leads: [] as Row[],
  noticeCount: 0,
}))

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn() }))
vi.mock('@/lib/notify', () => ({
  notify: vi.fn(async (n: Row) => { h.notices.push(n); return { id: `n-${h.notices.length}` } }),
}))
vi.mock('@/lib/db', () => {
  const prisma: Row = {
    company: {
      findFirst: async ({ select }: Row) => (select?.peopleInCharge ? h.company : h.company && { id: h.company.id, name: h.company.name }),
    },
    person: { findMany: async ({ where }: Row) => h.people.filter((p) => where.id.in.includes(p.id)) },
    sellContract: {
      count: async () => 0,
      findMany: async ({ where }: Row) => {
        if (where.personId) return h.working.filter((id) => where.personId.in.includes(id)).map((personId) => ({ personId }))
        if (where.endDate) return h.rolling
        return []
      },
    },
    consultantProfile: { findMany: async () => [] },
    verification: { findMany: async () => [] },
    course: { findMany: async () => [] },
    requirement: { findMany: async () => [] },
    submission: { findMany: async () => [] },
    invoice: { findMany: async () => [] },
    benchListing: {
      // The query asks for GRANTED, live, shown beyond the firm; the mock
      // hands back every row so the pure gate is what is tested.
      findMany: async () => h.bench,
    },
    notification: { count: async () => h.noticeCount },
    context: { findMany: async () => h.seats },
    marketingLead: {
      upsert: async (a: Row) => { h.leads.push(a); return { id: 'lead' } },
      findUnique: async () => null,
    },
  }
  return { prisma }
})

import { publicSite } from '@/lib/public-site'
import { POST as askFirm } from '@/app/api/site/[slug]/ask/route'
import { firmContact, mayShowPublicly, FIRM_ASK_COPY, firmAskThanks } from '@/lib/public-site/firm-page'
import { joinReply, joinReplyFor, joinReplyNoLetter } from '@/lib/public-site/join-bench'
import { check } from '@/lib/positioning'

const NOW = new Date()
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)
const yes = { state: 'GRANTED', revokedAt: null, staysUntil: null, showInMatches: true, showBeforeFree: true }

function tapin(over: Row = {}): Row {
  return {
    id: 'tapin', name: 'Tapin', slug: 'tapin', kind: 'VENDOR', supplierPosture: 'BENCH',
    siteLiveAt: new Date('2026-10-29T00:00:00Z'), networkVerifiedAt: null, domain: null, domainVerified: false,
    claimedAt: new Date('2026-10-17T00:00:00Z'), _count: { contexts: 3 },
    siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null,
    phone: '(415) 555-0142', accountsEmail: 'Accounts@tapin.test',
    peopleInCharge: [
      { duty: 'OWNER', name: null, personId: 'sharath' },
      { duty: 'BILLING_CONTACT', name: 'Ravi Kalra', personId: null },
    ],
    locations: [{ city: 'San Antonio', state: 'TX', country: 'US' }],
    ...over,
  }
}

const benchRow = (personId: string, listing: Row, profile: Row = {}) => ({
  ...listing,
  consultant: { personId, headline: 'Data engineer', skills: ['Python', 'Spark'], location: 'San Antonio, TX', ...profile },
})

beforeEach(() => {
  h.company = tapin()
  h.people = [{ id: 'sharath', name: 'Sharath Madavaram', primaryEmail: 'sharath@etyme.com' }]
  h.rolling = []
  h.bench = []
  h.working = []
  h.seats = [{ personId: 'sharath' }, { personId: 'oliver' }]
  h.notices = []
  h.leads = []
  h.noticeCount = 0
})

describe('a bench firm’s page, read by a client', () => {
  it('a client reading a bench firm’s page sees who is coming free, with no name or rate, an ask box and the firm’s contact', async () => {
    h.bench = [benchRow('marisol', yes)]
    h.rolling = [{
      id: 'sc-1', endDate: days(12), companyId: 'tapin',
      company: { id: 'tapin', name: 'Tapin' },
      clientCompany: { name: 'Brightmoor Staffing', kind: 'VENDOR' }, endClientCompany: { name: 'Northbend Athletic', kind: 'CLIENT' },
      person: {
        id: 'anika', name: 'Anika Shah',
        consultant: {
          headline: 'QA lead', skills: ['Selenium'], location: 'Austin, TX', rateFloor: 9_500,
          listings: [{ companyId: 'tapin', ...yes }],
        },
      },
      rolloff: null,
    }]
    const site = (await publicSite('tapin'))!
    expect(site.comingFree.map((c) => [c.headline, c.daysUntilFree])).toEqual([['Data engineer', 0], ['QA lead', 12]])
    expect(site.comingFreeSummary).toBe('1 person free now, 1 more within three months.')
    const shown = JSON.stringify(site.comingFree)
    for (const never of ['Marisol', 'Anika', 'Shah', '9500', '9_500', 'Northbend', 'Brightmoor', 'rate']) {
      expect(shown, never).not.toContain(never)
    }

    expect(site.askBox).toBe(true)
    expect(site.contact).toEqual({
      phone: '(415) 555-0142',
      accountsEmail: 'accounts@tapin.test',
      people: [{ role: 'Owner', name: 'Sharath Madavaram' }, { role: 'Billing', name: 'Ravi Kalra' }],
    })
    // A person's own address never reaches the page, even where it is known.
    expect(JSON.stringify(site)).not.toContain('sharath@etyme.com')

    const page = readFileSync(join(process.cwd(), 'src/app/site/[slug]/page.tsx'), 'utf8')
    expect(page).toContain('<Ask source="GENERATED_SITE" firm={{ slug: site.slug, name: site.name }} />')
    expect(page).toMatch(/site\.contact && <Contact/)
    // The date reads as a date, never the ISO string.
    expect(page).toContain('{onDay(site.liveSince)}')
  })

  it('only a person who said yes to being shown beyond the firm appears on the open internet', () => {
    expect(mayShowPublicly(yes, NOW, false)).toBe(true)
    expect(mayShowPublicly({ ...yes, state: 'INVITED' }, NOW, false)).toBe(false)
    expect(mayShowPublicly({ ...yes, showInMatches: false }, NOW, false)).toBe(false)
    expect(mayShowPublicly({ ...yes, revokedAt: days(-1) }, NOW, false)).toBe(false)
    expect(mayShowPublicly({ ...yes, staysUntil: days(-1) }, NOW, false)).toBe(false)
    expect(mayShowPublicly({ ...yes, showBeforeFree: false }, NOW, true)).toBe(false)
  })

  it('somebody on a running contract is never said to be free now', async () => {
    h.bench = [benchRow('ravi', yes)]
    h.working = ['ravi']
    const site = (await publicSite('tapin'))!
    expect(site.comingFree).toEqual([])
    expect(site.comingFreeSummary).toBeNull()
  })

  it('a firm with no contact set shows the ask box and nothing invented', async () => {
    h.company = tapin({ phone: null, accountsEmail: '  ', peopleInCharge: [] })
    const site = (await publicSite('tapin'))!
    expect(site.contact).toBeNull()
    expect(site.askBox).toBe(true)
    expect(firmContact({ phone: ' ', accountsEmail: 'not an address', inCharge: [{ duty: 'HR', name: null, seatedName: null }] })).toBeNull()
  })

  it('a client’s page, an MSP’s and an integrator’s carry no ask box for a client', async () => {
    for (const kind of ['CLIENT', 'MSP', 'GSI']) {
      h.company = tapin({ kind })
      expect((await publicSite('tapin'))!.askBox, kind).toBe(false)
    }
  })
})

const ask = (body: Row) =>
  askFirm(
    new NextRequest('http://x/api/site/tapin/ask', { method: 'POST', body: JSON.stringify({ filledInMs: 6000, ...body }) }),
    { params: Promise.resolve({ slug: 'tapin' }) }
  )

describe('the ask box on a firm’s page', () => {
  it('a client’s question lands in the firm’s own Ask Etyme, naming who asked and what, and never in Etyme’s lead list', async () => {
    const res = await ask({ email: 'Dana@Northbend.example', asked: 'A data engineer in Ohio from December.', name: 'Dana Whitfield', companyName: 'Northbend' })
    expect(res.status).toBe(200)
    expect((await res.json()).data.says).toBe(firmAskThanks('Tapin'))
    expect(h.notices.map((n) => n.personId)).toEqual(['sharath', 'oliver'])
    expect(h.notices[0].companyId).toBe('tapin')
    expect(h.notices[0].title).toBe('Dana Whitfield at Northbend asked from your page: “A data engineer in Ohio from December.”')
    expect(h.notices[0].body).toContain('Write back to dana@northbend.example.')
    expect(h.notices.map((n) => n.data.pageAsk)).toEqual(['FIRST', 'COPY'])
    expect(h.leads).toHaveLength(0)
    const route = readFileSync(join(process.cwd(), 'src/app/api/site/[slug]/ask/route.ts'), 'utf8')
    expect(route).not.toMatch(/marketingLead|tellStaff/)
  })

  it('a question with no email or no words is refused in a sentence and nothing is written', async () => {
    const noMail = await ask({ asked: 'Need a nurse' })
    expect(noMail.status).toBe(422)
    expect((await noMail.json()).error.message).toBe('Your email, so the firm can write back.')
    const noWords = await ask({ email: 'a@b.example', asked: '' })
    expect((await noWords.json()).error.message).toBe('Say what you need. A sentence is enough.')
    expect(h.notices).toHaveLength(0)
  })

  it('a form filled by a script, or a page past its hour’s cap, sends nothing', async () => {
    expect((await ask({ email: 'a@b.example', asked: 'Hello there', company_website: 'x' })).status).toBe(422)
    h.noticeCount = 30
    expect((await ask({ email: 'a@b.example', asked: 'Hello there' })).status).toBe(429)
    expect(h.notices).toHaveLength(0)
  })

  it('a page that takes no questions refuses them on the route as well as on the screen', async () => {
    h.company = tapin({ kind: 'CLIENT' })
    expect((await ask({ email: 'a@b.example', asked: 'Hello there' })).status).toBe(404)
    expect(h.notices).toHaveLength(0)
  })

  it('the ask box speaks plainly and passes the same guards as every public page', () => {
    const words = [FIRM_ASK_COPY.heading('Tapin'), FIRM_ASK_COPY.means('Tapin'), firmAskThanks('Tapin'),
      FIRM_ASK_COPY.emailLabel, FIRM_ASK_COPY.askLabel, FIRM_ASK_COPY.askPlaceholder]
    const rules = check({ hero: [words[0]], body: words }).map((f) => f.rule)
    expect(rules).not.toContain('neutrality')
    expect(rules).not.toContain('never-lead-with-ai')
    for (const w of words) expect(w).not.toMatch(/\$|rate|guarantee|within \d+ hours|instantly/i)
  })
})

describe('Join the bench, said only as far as it is true', () => {
  it('the page never claims a letter went when none could', () => {
    expect(joinReplyFor('Tapin', false)).toBe('Tapin has your address and will be in touch.')
    expect(joinReplyNoLetter('Tapin')).not.toMatch(/letter|email|sent|on its way/i)
    expect(joinReplyFor('Tapin', true)).toBe(joinReply('Tapin'))
    const route = readFileSync(join(process.cwd(), 'src/app/api/site/[slug]/join/route.ts'), 'utf8')
    expect(route).toContain('joinReplyFor(firm.name, emailSender() !== null)')
  })
})
