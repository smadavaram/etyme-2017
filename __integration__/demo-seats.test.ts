import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { req, json, resetDatabase, prisma, as } from './harness'
import { DEMO_COOKIE, read as readCookie } from '@/lib/demo-session'
import { ALL_SEATS, INTEGRATOR_SEATS, CANDIDATE_SEATS, PROGRAM_OFFICE_SEATS } from '@/app/demo/seats'
import { getNavForKind } from '@/components/shell/sidebar'
import { seedWorld } from '@/lib/seed-world'

import { POST as demo } from '@/app/api/demo/route'
import { GET as ownPeople } from '@/app/api/submissions/own-people/route'
import { GET as requirements } from '@/app/api/requirements/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as myPapers } from '@/app/api/me/papers/route'
import { GET as compliance } from '@/app/api/compliance/route'

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

/** POST /api/demo asking to sit as one of the four people. */
async function sitAs(handle: string, cookie?: string) {
  const r = req('POST', '/api/demo', { person: handle }, cookie ? { cookie: `${DEMO_COOKIE}=${cookie}` } : {})
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

  it('offers nine company doors and four people — three programs, three suppliers, a program office, two integrators', () => {
    expect(ALL_SEATS).toHaveLength(9)
    expect(CANDIDATE_SEATS).toHaveLength(4)
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

/**
 * The four people, and the two firms whose door led to an empty book.
 *
 * ── Why a person is a door at all ────────────────────────────────────
 *
 * Every seat on /demo was a company, and the consultant is the one party
 * to a placement who is not one. The only candidate door minted a
 * private throwaway workspace holding a random Java developer — one
 * profile, invisible to everybody else, unconnected to the placement the
 * client and supplier doors were both looking at. So the third side of
 * this market could not be shown against the same contract.
 *
 * And two doors were worse than missing. Aptiva Workforce and Kestrel
 * MSP held no contracts at all, because the seed was written to a model
 * where an MSP routes work and takes no rate. An MSP of the ordinary
 * kind sells to its client and buys below it, including from itself when
 * the person on the seat is its own employee.
 */
describe('the four people the demo can be walked as', () => {
  beforeAll(async () => {
    await seedWorld()
  }, 600_000)

  /** Whatever /api/me/work says about whoever the cookie names. */
  async function ownWork(email: string) {
    as(email)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    return r.body.data
  }
  async function ownPapers(email: string) {
    as(email)
    const r = await json(await myPapers(req('GET', '/api/me/papers')))
    return r.body.data.papers as {
      name: string
      partOf: string | null
      askedBy: string
      why: string | null
      dueOn: string | null
      word: string
      todo: string | null
      link: string | null
    }[]
  }

  it('offers four people, in four industries, and not one of them a company', () => {
    expect(CANDIDATE_SEATS).toHaveLength(4)
    const trades = new Set(CANDIDATE_SEATS.map((c) => c.where.split('·')[0].trim()))
    expect(trades.size, [...trades].join(', ')).toBe(4)
    for (const c of CANDIDATE_SEATS) {
      expect(c.email, c.name).toMatch(/@seed\.etyme\.invalid$/)
      expect(c.about.trim().endsWith('.'), `${c.name}: ${c.about}`).toBe(true)
      expect(c.about.split(/\s+/).length, `${c.name} says too little`).toBeGreaterThan(20)
    }
  })

  it('seats the visitor as the person themselves, never at the firm that employs or lists them', async () => {
    for (const c of CANDIDATE_SEATS) {
      const { body, cookie } = await sitAs(c.slug)
      expect(body.personName, c.slug).toBe(c.name)
      expect(await whoIsSitting(cookie!)).toBe(c.name)
      // The door says who holds them without handing them that company.
      expect(body.companyId, `${c.name} was handed a company`).toBeUndefined()
    }
  }, 60_000)

  it('lands every candidate on their own work, and never on a company dashboard', async () => {
    for (const c of CANDIDATE_SEATS) {
      const { body } = await sitAs(c.slug)
      expect(body.landing, c.name).toBe('/dashboard/my-work')
      expect(body.landing).not.toBe('/dashboard')
      expect(body.landing).not.toBe('/dashboard/program')
    }
  }, 60_000)

  it('opens that page on something real for all four — a placement, a week of hours, or a paper somebody has asked them for', async () => {
    for (const c of CANDIDATE_SEATS) {
      const work = await ownWork(c.email)
      const papers = await ownPapers(c.email)
      const found = work.placements.length + work.timesheets.length + papers.length
      expect(
        found,
        `${c.name} opens on an empty page: ${work.placements.length} placements, ` +
          `${work.timesheets.length} weeks, ${papers.length} papers`
      ).toBeGreaterThan(0)
    }
  }, 60_000)

  it('refuses a name that is not one of the four, rather than seating a stranger off the wire', async () => {
    const r = req('POST', '/api/demo', { person: 'somebody.else@seed.etyme.invalid' })
    const res = await demo(r as NextRequest)
    expect(res.status).toBe(400)
  })

  it('shows Helena Marsh the week she filed that nobody has signed yet', async () => {
    const work = await ownWork('helena.marsh@seed.etyme.invalid')
    expect(work.summary.awaitingApproval).toBeGreaterThan(0)
    expect(work.placements.length).toBeGreaterThan(0)
  }, 30_000)

  it('shows Chidi Okafor the attestation his client has asked him to sign, in words rather than a code', async () => {
    const papers = await ownPapers('chidi.okafor@seed.etyme.invalid')
    const one = papers.find((p) => /attestation/i.test(p.name))
    expect(one, JSON.stringify(papers)).toBeTruthy()
    expect(one!.todo).toBe('sign')
  }, 30_000)

  it('shows Karthik Menon the project he has just come off, so the page a W2 employee opens is not empty', async () => {
    const work = await ownWork('karthik.menon@seed.etyme.invalid')
    expect(work.placements.length, 'no placement at all').toBeGreaterThan(0)
    expect(work.timesheets.length, 'no hours at all').toBeGreaterThan(0)
    // Ended, because he is between projects — which is why his employer
    // has an open seat to put him forward for.
    expect(work.summary.livePlacements).toBe(0)
  }, 30_000)

  it('has not submitted Karthik for the open seat, because that is the thing the integrator door exists to do', async () => {
    const seat = await prisma.requirement.findFirstOrThrow({
      where: { title: 'DO-178C verification engineer', company: { slug: 'world-corveldt' } },
    })
    const karthik = await prisma.person.findFirstOrThrow({
      where: { primaryEmail: 'karthik.menon@seed.etyme.invalid' },
    })
    const already = await prisma.submission.findFirst({
      where: { requirementId: seat.id, personId: karthik.id },
    })
    expect(already, 'the seed submitted him, so the demo has nothing left to walk').toBeNull()
  })

  it('pays the travel nurse through the limited company she owns, not through the agency', async () => {
    const profile = await prisma.consultantProfile.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
      include: { ownCompany: true },
    })
    expect(profile.ownCompany, 'ownCompanyId is still unset on every row in this world').toBeTruthy()
    expect(profile.ownCompany!.kind).toBe('CONSULTANT_CORP')

    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { candidates: { some: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } } } },
    })
    expect(buy.contractType).toBe('C2C')
    expect(buy.vendorCompanyId, 'the agency is buying from itself').toBe(profile.ownCompanyId)
  })

  it('carries the liability cover on her own company, which is the company that owes it on corp to corp', async () => {
    const profile = await prisma.consultantProfile.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
    })
    const cover = await prisma.verification.findMany({
      where: { companyId: profile.ownCompanyId!, type: { in: ['INSURANCE_GL', 'INSURANCE_WC'] } },
    })
    expect(cover).toHaveLength(2)
    for (const c of cover) expect(c.expiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('files a nurse’s week as three twelve-hour shifts, not as five eights', async () => {
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
      orderBy: { periodStart: 'desc' },
    })
    expect(Number(week.totalHours)).toBe(36)
    expect(Object.keys(week.days as Record<string, number>)).toHaveLength(3)
  })

  it('gives her state license the day it runs out, and the client’s compliance desk reads that date', async () => {
    as('world-harlow-health@demo.etyme.local')
    const r = await json(await compliance(req('GET', '/api/compliance')))
    const people = r.body.data?.verifications?.persons ?? []
    const her = people.find((p: any) => p.name === 'Colleen Byrne')
    expect(her, JSON.stringify(people.map((p: any) => p.name))).toBeTruthy()
    const license = her.checks.find((c: any) => c.type === 'PROFESSIONAL_LICENSE')
    expect(license, JSON.stringify(her.checks)).toBeTruthy()
    expect(license.expiresAt, 'a license with no expiry is a license nobody can chase').toBeTruthy()
    const daysLeft = (new Date(license.expiresAt).getTime() - Date.now()) / 86_400_000
    expect(daysLeft).toBeGreaterThan(0)
    expect(daysLeft).toBeLessThan(60)
  }, 30_000)

  // etyme-architect, 2026-09-17. This read a document request the seed
  // typed in by hand — the seed describing what the product ought to do.
  // The nightly chase raises the ask now (`lib/credential-chase`), as a
  // packet addressed to her with a link of her own, so the sentence moves
  // to what is actually true of the seeded world.
  it('asks her for the renewal at a link of her own, raised by the nightly chase and not typed into the seed', async () => {
    const packet = await prisma.documentPacket.findFirst({
      where: {
        packetKey: 'CREDENTIAL_RENEWAL',
        subjectPerson: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' },
      },
      include: { items: true },
    })
    expect(packet, 'nothing asked her for the renewal her seat promises').toBeTruthy()
    expect(packet!.recipientEmail).toBe('colleen.byrne@seed.etyme.invalid')
    expect(packet!.items.map((i) => i.key)).toEqual(['PROFESSIONAL_LICENSE'])

    // And she hears about it where she will see it, with the link in it.
    const her = await prisma.person.findUniqueOrThrow({
      where: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' },
      select: { id: true },
    })
    const told = await prisma.notification.findFirst({
      where: { personId: her.id, entityId: packet!.id },
    })
    expect(told, 'she is asked and nobody told her').toBeTruthy()
    expect(told!.body).toContain(`/packet/${packet!.token}`)
  }, 30_000)

  // The sentence this file carried until 2026-09-17, restored. It was
  // rewritten to describe a packet the page could not show, because
  // `/api/me/papers` read `DocInstance` and the chase raises a packet —
  // so the one thing she was emailed about was missing from the one page
  // she would go to. The page reads both now.
  it('a nurse asked for her license renewal sees the ask on her own paperwork page, with who asked and the day it runs out', async () => {
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: {
        packetKey: 'CREDENTIAL_RENEWAL',
        subjectPerson: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' },
      },
      include: { company: { select: { name: true } } },
    })

    const papers = await ownPapers('colleen.byrne@seed.etyme.invalid')
    const renewal = papers.find((p) => /license/i.test(p.name))
    expect(renewal, JSON.stringify(papers)).toBeTruthy()

    // Who asked: the firm that places her, by name.
    expect(renewal!.askedBy).toBe(packet.company.name)
    expect(renewal!.partOf).toMatch(/renew/i)

    // The day it runs out — the ask's own last day, and the sentence she
    // was sent, which counts the days left on the license itself.
    expect(new Date(renewal!.dueOn!).getTime()).toBeGreaterThan(Date.now())
    expect(renewal!.why).toContain('Wisconsin Board of Nursing')
    expect(renewal!.why).toMatch(/runs out in \d+ days/)

    // And it is hers to answer: her own link, not a code.
    expect(renewal!.word).toBe('Asked for')
    expect(renewal!.todo).toBe('open')
    expect(renewal!.link).toBe(`/packet/${packet.token}`)
  }, 30_000)
})

/**
 * The two party doors that opened on an empty book.
 */
describe('an MSP that sells and buys, and a sub-vendor that only ever sees the rung above it', () => {
  beforeAll(async () => {
    await seedWorld()
  }, 600_000)

  const aptiva = () => prisma.company.findFirstOrThrow({ where: { slug: 'world-aptiva' } })

  it('offers a door for the program office and one for the sub-vendor, beside the primes and the integrators', () => {
    expect(PROGRAM_OFFICE_SEATS).toHaveLength(1)
    expect(ALL_SEATS.map((s) => s.slug)).toContain('world-aptiva')
    expect(ALL_SEATS.map((s) => s.slug)).toContain('world-cloudepa')
  })

  it('names something waiting on both sides of every supplying firm’s book, not only on the side it sells from', () => {
    for (const s of [...ALL_SEATS].filter((x) => !x.slug.startsWith('world-nike') && !x.slug.startsWith('world-corning') && !x.slug.startsWith('world-terumo'))) {
      const says = s.about.toLowerCase()
      expect(/sell|sells/.test(says), `${s.name} never says what it sells`).toBe(true)
      expect(/buy|buys|employs/.test(says), `${s.name} never says what it buys`).toBe(true)
    }
  })

  it('gives the MSP a sell contract to its client and a buy contract of its own', async () => {
    const co = await aptiva()
    const sells = await prisma.sellContract.findMany({ where: { companyId: co.id } })
    const buys = await prisma.buyContract.findMany({ where: { companyId: co.id } })
    expect(sells.length, 'an MSP with nothing to sell').toBeGreaterThan(0)
    expect(buys.length, 'an MSP that buys nothing, which was the pre-correction model').toBeGreaterThan(0)
  })

  it('buys its own employee on a W2 leg with no purchase order behind it — you do not raise a PO to your own staff', async () => {
    const co = await aptiva()
    const buy = await prisma.buyContract.findFirstOrThrow({ where: { companyId: co.id } })
    expect(buy.contractType).toBe('W2')
    expect(buy.vendorCompanyId).toBeNull()
    expect(buy.purchaseOrderId).toBeNull()
  })

  it('records that submission as internal, because the firm already employs the person it put forward', async () => {
    const co = await aptiva()
    const sub = await prisma.submission.findFirstOrThrow({ where: { fromCompanyId: co.id } })
    expect(sub.kind).toBe('INTERNAL')
    const listing = await prisma.benchListing.findFirst({
      where: { companyId: co.id, consultant: { personId: sub.personId } },
    })
    expect(listing, 'a bench listing for its own employee, whose consent the job already gave').toBeNull()
  })

  it('leaves the MSP a week its client has signed and it has not accepted as the employer', async () => {
    const co = await aptiva()
    const sell = await prisma.sellContract.findFirstOrThrow({ where: { companyId: co.id } })
    const waiting = await prisma.timesheet.findMany({
      where: { sellContractId: sell.id, clientApprovedAt: { not: null }, employerAcceptedAt: null },
    })
    expect(waiting.length, 'nothing on the buy side of the desk').toBeGreaterThan(0)
    const billable = await prisma.timesheet.findMany({
      where: { sellContractId: sell.id, status: 'APPROVED', invoiceLines: { none: {} } },
    })
    expect(billable.length, 'nothing on the sell side of the desk').toBeGreaterThan(0)
  })

  it('lands the MSP on a page its own navigation offers, which is the vendor’s', async () => {
    const { body } = await sit('world-aptiva')
    expect(body.kind).toBe('MSP')
    const hrefs = getNavForKind('MSP', false).flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs, `landed on ${body.landing}`).toContain(body.landing)
  }, 30_000)

  it('gives the sub-vendor a prime above it and its own consultant below, and never the prime’s client', async () => {
    const cloudepa = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    const harlow = await prisma.company.findFirstOrThrow({ where: { slug: 'world-harlow-health' } })
    // It sells to the prime, never to the hospital.
    const sells = await prisma.sellContract.findMany({ where: { companyId: cloudepa.id } })
    expect(sells.length).toBeGreaterThan(0)
    for (const s of sells) {
      expect(s.clientCompanyId, 'a sub-vendor billing the client directly').not.toBe(harlow.id)
    }
    // And a paper it is chasing its own consultant for.
    const asked = await prisma.docInstance.findMany({
      where: { template: { companyId: cloudepa.id }, status: 'SENT' },
      include: { template: true },
    })
    expect(asked.length, 'a bench vendor chasing nobody for anything').toBeGreaterThan(0)
  })

  it('leaves the prime and the integrator a bill from the firm below, so the buy side of each is not an empty page', async () => {
    for (const slug of ['world-computer-systems', 'world-teleworld']) {
      const co = await prisma.company.findFirstOrThrow({ where: { slug } })
      const bills = await prisma.vendorBill.findMany({ where: { companyId: co.id, paidAt: null } })
      expect(bills.length, `${slug} owes nobody anything`).toBeGreaterThan(0)
    }
  })
})
