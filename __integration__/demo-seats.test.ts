import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { req, json, resetDatabase, prisma, as } from './harness'
import { DEMO_COOKIE, read as readCookie } from '@/lib/demo-session'
import { ALL_SEATS, INTEGRATOR_SEATS } from '@/app/demo/seats'
import { getNavForKind } from '@/components/shell/sidebar'
import { seedWorld } from '@/lib/seed-world'

import { POST as demo } from '@/app/api/demo/route'
import { GET as ownPeople } from '@/app/api/submissions/own-people/route'
import { GET as requirements } from '@/app/api/requirements/route'

/**
 * Every door on the home page lands somewhere different.
 *
 * It did not. The demo route resumed whatever workspace the cookie
 * already held regardless of which seat had just been picked, so the
 * first click seated a visitor as Oxford Corp and every later click —
 * MSP, integrator, prime, bench — silently put them back in Oxford
 * Corp's book. The seat picker was a form whose answer was thrown away,
 * and the founder's report was exactly right: "it shows Oxford client
 * for everything".
 *
 * A resume is still correct for a refresh. It is wrong for a different
 * seat, which is an explicit intent and gets a workspace of its own.
 */

/** POST /api/demo carrying whatever cookie the last response set. */
async function enter(seat: string, cookie?: string) {
  const r = req('POST', '/api/demo', { side: seat }, cookie ? { cookie: `${DEMO_COOKIE}=${cookie}` } : {})
  const res = await demo(r as NextRequest)
  const body = (await res.json()).data
  // The set-cookie header carries the signed value; keep it for the next call.
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = new RegExp(`${DEMO_COOKIE}=([^;]+)`).exec(setCookie)
  return { body, cookie: m?.[1] ?? cookie }
}

/** POST /api/demo asking for a named seat in the seeded world. */
async function sit(slug: string, cookie?: string) {
  const r = req('POST', '/api/demo', { as: slug }, cookie ? { cookie: `${DEMO_COOKIE}=${cookie}` } : {})
  const res = await demo(r as NextRequest)
  const body = (await res.json()).data
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = new RegExp(`${DEMO_COOKIE}=([^;]+)`).exec(setCookie)
  return { body, cookie: m?.[1] ?? cookie }
}

/** Whose chair the signed cookie actually put the visitor in. */
async function whoIsSitting(cookie: string) {
  const email = readCookie(cookie)
  if (!email) return null
  const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { name: true } })
  return person?.name ?? null
}

describe('the seat you pick is the seat you get', () => {
  beforeAll(async () => {
    await resetDatabase()
  }, 120_000)

  it('each of the five kinds of company seat lands in a company of its own kind', async () => {
    const expected: Record<string, string> = {
      CLIENT: 'CLIENT', MSP: 'MSP', GSI: 'GSI', PRIME: 'VENDOR', BENCH: 'VENDOR',
    }
    for (const seat of Object.keys(expected)) {
      const { body } = await enter(seat)
      const company = await prisma.company.findUniqueOrThrow({ where: { id: body.companyId } })
      expect(company.kind, `${seat} should be a ${expected[seat]}`).toBe(expected[seat])
      expect(body.resumed).toBe(false)
    }
  }, 120_000)

  it('no two seats are the same firm — an MSP is not named like a buyer', async () => {
    const names = new Set<string>()
    for (const seat of ['CLIENT', 'MSP', 'GSI', 'PRIME', 'BENCH']) {
      const { body } = await enter(seat)
      names.add(body.companyName)
    }
    expect(names.size).toBe(5)
  }, 120_000)

  it('picking the same seat again resumes rather than building a second workspace', async () => {
    const first = await enter('MSP')
    const again = await enter('MSP', first.cookie)
    expect(again.body.resumed).toBe(true)
    expect(again.body.companyId).toBe(first.body.companyId)
  }, 60_000)

  it('picking a different seat builds a new workspace instead of resuming the old one', async () => {
    const asClient = await enter('CLIENT')
    const asMsp = await enter('MSP', asClient.cookie)
    expect(asMsp.body.resumed).toBe(false)
    expect(asMsp.body.companyId).not.toBe(asClient.body.companyId)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: asMsp.body.companyId } })
    expect(company.kind).toBe('MSP')
  }, 60_000)

  it('a prime and a bench vendor are told apart even though both are VENDOR kind', async () => {
    // Kind alone cannot separate them, so the resume must read the seat
    // off the slug. Without that, a prime who clicked "bench" would be
    // resumed into the prime's book.
    const asPrime = await enter('PRIME')
    const asBench = await enter('BENCH', asPrime.cookie)
    expect(asBench.body.resumed).toBe(false)
    expect(asBench.body.companyId).not.toBe(asPrime.body.companyId)
  }, 60_000)

  it('an integrator lands on a page its own navigation offers, not on the client program overview', async () => {
    // GSI nav is Deliver → Supply → Operate and holds no /dashboard/program
    // at all, so landing there was a dead end with no way back.
    const { body } = await enter('GSI')
    const hrefs = getNavForKind('GSI', false).flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs, `landed on ${body.landing}`).toContain(body.landing)
  }, 60_000)

  it('a candidate who then picks a company seat is not handed the agency that lists them', async () => {
    // A candidate's only context is a CONSULTANT one on somebody else's
    // agency. Resuming them into "their company" would put a candidate in
    // charge of the firm that markets them.
    const asCandidate = await enter('CANDIDATE')
    const asClient = await enter('CLIENT', asCandidate.cookie)
    expect(asClient.body.resumed).toBe(false)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: asClient.body.companyId } })
    expect(company.kind).toBe('CLIENT')
  }, 60_000)
})

/**
 * Every door drawn on /demo, walked.
 *
 * The page listed five seats and the seeded world holds seven kinds of
 * firm worth sitting at. The two integrators were missing, so the one
 * thing shipped that morning — a prime or a GSI putting its own W2
 * employee in front of a client, with no bench listing anywhere — could
 * not be reached by clicking. A demo door that is not on the page is a
 * feature that does not exist for the person being shown it.
 *
 * These read the same list the page draws (`app/demo/seats`), so a seat
 * added to the page without a company behind it fails here rather than
 * on the founder's screen.
 */
describe('every seat on the demo page opens', () => {
  beforeAll(async () => {
    await seedWorld()
  }, 600_000)

  it('offers seven doors, three client programs and four firms that supply them', () => {
    expect(ALL_SEATS).toHaveLength(7)
  })

  it('names a company the seed actually builds, for every one of the seven', async () => {
    for (const s of ALL_SEATS) {
      const company = await prisma.company.findUnique({ where: { slug: s.slug } })
      expect(company, `${s.name} (${s.slug}) is on the page and not in the world`).toBeTruthy()
    }
  })

  it('says what is waiting behind each door, as a sentence rather than a label', () => {
    for (const s of ALL_SEATS) {
      // A finished sentence, not a tag: the door has to tell somebody
      // who has never seen Etyme what they will find on the other side.
      expect(s.about.trim().endsWith('.'), `${s.name}: “${s.about}”`).toBe(true)
      expect(s.about.split(/\s+/).length, `${s.name} says too little`).toBeGreaterThan(5)
      expect(s.where.trim().length, `${s.name} says nowhere`).toBeGreaterThan(2)
    }
  })

  it('seats the visitor at Teleworld Solutions, an integrator, and nowhere else', async () => {
    const { body } = await sit('world-teleworld')
    expect(body.companyName).toBe('Teleworld Solutions')
    expect(body.kind).toBe('GSI')
  })

  it('puts them at the delivery manager’s desk, because that is the desk that submits', async () => {
    const { body, cookie } = await sit('world-teleworld')
    expect(body.companyName).toBe('Teleworld Solutions')
    const who = await whoIsSitting(cookie!)
    expect(who).toBe('Sunil Raghavan')
  })

  it('lands that desk on a page the integrator’s own navigation offers', async () => {
    const { body } = await sit('world-teleworld')
    const hrefs = getNavForKind('GSI', false).flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs, `landed on ${body.landing}`).toContain(body.landing)
    expect(body.landing).toBe('/dashboard/submissions')
  })

  it('shows that desk Karthik, Amara, Felix and Deepa under “On our payroll”', async () => {
    as('world-teleworld@demo.etyme.local')
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    const names = r.body.data.people.map((p: any) => p.name)
    for (const name of ['Karthik Menon', 'Amara Nwosu', 'Felix Brenner', 'Deepa Varma']) {
      expect(names, JSON.stringify(names)).toContain(name)
    }
  })

  it('has an open client role on the same form for one of them to be submitted to', async () => {
    as('world-teleworld@demo.etyme.local')
    const r = await json(await requirements(req('GET', '/api/requirements?status=OPEN&limit=50')))
    const titles = (r.body.data?.requirements ?? []).map((x: any) => x.title)
    expect(titles, JSON.stringify(titles)).toContain('DO-178C verification engineer')
  })

  it('seats Sundara Systems at its own delivery manager, never at Teleworld’s', async () => {
    const { body, cookie } = await sit('world-sundara')
    expect(body.companyName).toBe('Sundara Systems')
    expect(body.kind).toBe('GSI')
    expect(await whoIsSitting(cookie!)).toBe('Lakshmi Iyer')
  })

  it('offers both integrators, and only firms that employ people they can submit', async () => {
    for (const s of INTEGRATOR_SEATS) {
      const company = await prisma.company.findUniqueOrThrow({ where: { slug: s.slug } })
      expect(company.kind).toBe('GSI')
      const payroll = await prisma.context.count({
        where: { companyId: company.id, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null },
      })
      // Four on the payroll, and the delivery manager who submits them.
      expect(payroll, `${s.name} has nobody to submit`).toBeGreaterThanOrEqual(5)
    }
  })
})
