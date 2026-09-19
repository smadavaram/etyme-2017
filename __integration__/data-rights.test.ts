import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as myData, POST as askForMyData } from '@/app/api/me/data/route'
import { GET as deskQueue, POST as deskAct } from '@/app/api/data-requests/route'
import { GET as holdList, POST as holdAct } from '@/app/api/legal-holds/route'
import { GET as breachList, POST as breachAct } from '@/app/api/breaches/route'
import { runRetentionSweep } from '@/lib/data-request'
import { daysOnSite } from '@/lib/tenure-days'
import { isTombstone } from '@/lib/erasure'

/**
 * A person asks for their data, asks to be forgotten, and the client's
 * tenure ledger still knows how long somebody was on its site.
 *
 * ── Who is in it ─────────────────────────────────────────────────────
 *
 *   Helena Marsh        an SAP finance lead at Northbend Athletic, bought
 *                       through a chain. She asks for her data, then asks
 *                       to be forgotten.
 *   Anders Lund         at Talvern Medical, twenty-three months across two
 *                       suppliers. Talvern puts a hold on him, and his
 *                       erasure is held rather than refused.
 *   Northbend Athletic  the client. Its tenure ledger has to survive
 *                       Helena's erasure, because the days she stood on
 *                       its site are its own record of its own exposure.
 *
 * The one number this walk exists to protect is the last one. Erasure in
 * this product is anonymization, and the whole reason is that a client
 * has to be able to answer for how long somebody was on its site after
 * that person has asked to be forgotten. If the days go, the design is
 * wrong.
 */

const D = '@demo.etyme.local'
const HELENA = 'helena.marsh@seed.etyme.invalid'
const ANDERS = 'anders.lund@seed.etyme.invalid'
const NORTHBEND_COMPLIANCE = `world-nike-compliance${D}`
const TALVERN_COMPLIANCE = `world-terumo-bct-compliance${D}`
const STAFF = 'ops@etyme.example'

const who = { helena: '', anders: '' }
const co = { northbend: '', talvern: '' }
let helenaDaysBefore = 0
let helenaHolders: string[] = []

/**
 * Wait for a fire-and-forget write to land.
 *
 * `logAccess` deliberately does not block the response — CLAUDE.md's
 * invariant is that the read is recorded, not that the reader waits for
 * it — so a test that reads the trail immediately after the route
 * returns is racing the write it is checking for.
 */
async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, tries = 40): Promise<T> {
  let last = await read()
  for (let i = 0; i < tries && !done(last); i++) {
    await new Promise((r) => setTimeout(r, 50))
    last = await read()
  }
  return last
}

async function daysAt(personId: string, clientCompanyId: string): Promise<number> {
  const lines = await prisma.sellContract.findMany({
    where: { personId, clientCompanyId },
    select: { startDate: true, endDate: true },
  })
  return daysOnSite(lines)
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
  process.env.ETYME_STAFF_EMAILS = STAFF

  // Etyme's own staff: an address in ETYME_STAFF_EMAILS, and a seat at
  // Etyme's own company. The seat is not decoration — `getCallerContext`
  // refuses anybody with no active context at all, so a staff-only route
  // is unreachable to somebody who has none. Being staff is still read
  // off the address and never off the seat.
  const staffPerson = await prisma.person.upsert({
    where: { primaryEmail: STAFF },
    update: {},
    create: { name: 'Etyme operations', primaryEmail: STAFF },
  })
  const etyme = await prisma.company.upsert({
    where: { slug: 'etyme-platform' },
    update: {},
    create: { name: 'Etyme', slug: 'etyme-platform', kind: 'VENDOR', currency: 'USD', defaultPaymentTerms: 30 },
  })
  if (!(await prisma.context.findFirst({ where: { personId: staffPerson.id, companyId: etyme.id } }))) {
    const role = await prisma.role.create({
      data: { companyId: etyme.id, name: 'Operations', permissions: ['governance.read'] },
    })
    await prisma.context.create({
      data: {
        personId: staffPerson.id, companyId: etyme.id, roleId: role.id, type: 'EMPLOYEE',
        side: 'SELL', grantReason: 'Etyme operations, for the integration walk',
      },
    })
  }

  who.helena = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HELENA } })).id
  who.anders = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: ANDERS } })).id
  co.northbend = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' } })).id
  co.talvern = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-terumo-bct' } })).id

  helenaDaysBefore = await daysAt(who.helena, co.northbend)

  // Every firm that will be written to when her erasure runs, read
  // before it does — afterwards the plan is gone with the request.
  const sells = await prisma.sellContract.findMany({
    where: { personId: who.helena },
    select: { company: { select: { name: true } }, clientCompany: { select: { name: true } } },
  })
  helenaHolders = [...new Set(sells.flatMap((s) => [s.company.name, s.clientCompany?.name ?? '']))].filter(Boolean)
}, 300_000)

describe('a person asks what is held about them', () => {
  it('Helena Marsh opens her own page and is shown every category the privacy notice names', async () => {
    as(HELENA)
    const { status, body } = await json(await myData(req('GET', '/api/me/data')))
    expect(status).toBe(200)
    expect(body.held.length).toBeGreaterThanOrEqual(10)
    for (const c of ['Resumes', 'Time on site', 'Money about a person', 'Logs']) {
      expect(body.held.map((h: { category: string }) => h.category)).toContain(c)
    }
    expect(body.requests).toEqual([])
  })

  it('she asks for her data and gets a file naming every category, not a promise to come back in a month', async () => {
    as(HELENA)
    const { status, body } = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'EXPORT' })))
    expect(status).toBe(200)
    expect(body.says).toContain('ready')

    const listed = await json(await myData(req('GET', '/api/me/data')))
    const request_ = listed.body.requests[0]
    expect(request_.kind).toBe('EXPORT')
    expect(request_.downloadUrl).not.toBeNull()
    expect(request_.dueBasis.length).toBeGreaterThan(40)

    const file = await json(await myData(req('GET', `/api/me/data?download=${request_.id}`)))
    expect(file.status).toBe(200)
    for (const c of ['Identity and sign-in', 'Time on site', 'Money about a person', 'Logs']) {
      expect(Object.keys(file.body.categories)).toContain(c)
    }
    // The days on site in her own file are the same number the client sees.
    const site = file.body.categories['Time on site'] as { client: string; days: number }[]
    expect(site.reduce((n, s) => n + s.days, 0)).toBeGreaterThan(0)
    // And it says what is not in it, so a complete-looking file is not
    // mistaken for one.
    expect(file.body.notIncluded.join(' ')).toContain('interview')
  })

  it('the export she produced is a read of her record and is in the trail, including that she was the one who opened it', async () => {
    // `logAccess` is fire-and-forget by design — the invariant is that
    // the read is recorded, not that the reader waits for it — so this
    // waits for the row rather than assuming it has landed. Asserting on
    // it without the wait failed about one run in three.
    const rows = await eventually(
      () => prisma.accessLog.findMany({
        where: { subjectId: who.helena, action: 'DATA_EXPORT' },
        select: { reason: true, allowed: true },
      }),
      (r) => r.length >= 2 && r.some((x) => (x.reason ?? '').includes('Downloaded their own export'))
    )
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.map((r) => r.reason).join(' ')).toContain('Downloaded their own export')
  })

  it('somebody else’s export is not hers to download, and the refusal is written down too', async () => {
    as(ANDERS)
    const hers = await prisma.dataRequest.findFirstOrThrow({ where: { subjectPersonId: who.helena } })
    const { status } = await json(await myData(req('GET', `/api/me/data?download=${hers.id}`)))
    expect(status).toBe(404)
    const refused = await eventually(
      () => prisma.accessLog.findFirst({
        where: { subjectId: who.anders, action: 'DATA_EXPORT', allowed: false },
      }),
      (r) => r != null
    )
    expect(refused).not.toBeNull()
  })
})

describe('a person asks to be forgotten', () => {
  it('nothing changes on the day she asks, and she is told the day it runs and how to stop it', async () => {
    as(HELENA)
    const { status, body } = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'ERASURE' })))
    expect(status).toBe(200)
    expect(body.runsOn).not.toBeNull()
    expect(body.dueBasis).toContain('14 days')

    const still = await prisma.person.findUniqueOrThrow({ where: { id: who.helena } })
    expect(still.erasedAt).toBeNull()
    expect(still.primaryEmail).toBe(HELENA)
  })

  it('what a statutory minimum keeps back is on the request before the day, in her own words', async () => {
    const row = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.helena, kind: 'ERASURE' },
    })
    expect(row.keptBecause.length).toBeGreaterThan(0)
    expect(row.keptBecause.join(' ')).toMatch(/kept/i)
    // No machine name reaches her.
    expect(row.keptBecause.join(' ')).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('the sweep leaves it alone while she can still change her mind', async () => {
    const before = await runRetentionSweep(new Date())
    expect(before.erased).toBe(0)
    const still = await prisma.person.findUniqueOrThrow({ where: { id: who.helena } })
    expect(still.erasedAt).toBeNull()
  })

  it('fifteen days later the sweep runs it on its own, and nobody pressed anything', async () => {
    const row = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.helena, kind: 'ERASURE' },
    })
    const after = new Date(row.receivedAt.getTime() + 15 * 86_400_000)
    const outcome = await runRetentionSweep(after)
    expect(outcome.erased).toBe(1)

    const done = await prisma.dataRequest.findUniqueOrThrow({ where: { id: row.id } })
    expect(done.status).toBe('DONE')
    expect(done.completedAt).not.toBeNull()
  })

  it('Northbend Athletic’s tenure ledger still shows her days after completion, under a tombstone', async () => {
    // The one number this whole walk exists to protect.
    expect(await daysAt(who.helena, co.northbend)).toBe(helenaDaysBefore)
    expect(helenaDaysBefore).toBeGreaterThan(0)

    const erased = await prisma.person.findUniqueOrThrow({ where: { id: who.helena } })
    expect(erased.erasedAt).not.toBeNull()
    expect(erased.name).toBe('Erased person')
    expect(isTombstone(erased.primaryEmail)).toBe(true)
  })

  it('a tombstoned person cannot be emailed, because the address is on a domain nothing routes', async () => {
    const erased = await prisma.person.findUniqueOrThrow({ where: { id: who.helena } })
    expect(erased.primaryEmail).toBe(`erased-${who.helena}@erased.invalid`)
    expect(await prisma.credential.count({ where: { personId: who.helena } })).toBe(0)
  })

  it('her invoices still foot and her signed weeks still have their hours', async () => {
    const lines = await prisma.invoiceLine.findMany({ where: { personId: who.helena }, select: { amountCents: true } })
    for (const l of lines) expect(l.amountCents).toBeGreaterThan(0)
    const weeks = await prisma.timesheet.findMany({ where: { personId: who.helena }, select: { totalHours: true } })
    for (const w of weeks) expect(Number(w.totalHours)).toBeGreaterThan(0)
  })

  it('her profile and her resumes are gone, and a resume already sent keeps its row with the bytes cleared', async () => {
    expect(await prisma.consultantProfile.count({ where: { personId: who.helena } })).toBe(0)
    const left = await prisma.resume.findMany({ where: { personId: who.helena }, select: { bytes: true, textExtract: true } })
    for (const r of left) {
      expect(r.bytes).toBeNull()
      expect(r.textExtract).toBeNull()
    }
  })

  it('every firm that held her is told, and told there is nothing for it to do', async () => {
    const rows = await prisma.automationLog.findMany({
      where: { action: 'ERASURE_COMPLETE' },
      select: { companyId: true, reversible: true, summary: true, company: { select: { name: true } } },
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.reversible, 'nothing puts a tombstone back').toBe(false)

    const told = rows.map((r) => r.company.name)
    for (const firm of helenaHolders) expect(told, `${firm} held her and was not told`).toContain(firm)

    const letters = await prisma.notification.findMany({
      where: { type: 'SYSTEM', title: { contains: 'forgotten' } },
      select: { body: true },
    })
    expect(letters.length).toBeGreaterThan(0)
    expect(letters.map((l) => l.body).join(' ')).toContain('nothing for you to do')
  })

  it('the log of who read her record is kept whole, because deleting it erases the evidence that protects her', async () => {
    expect(await prisma.accessLog.count({ where: { subjectId: who.helena } })).toBeGreaterThan(0)
  })
})

describe('a hold by one client blocks an erasure, and the request says so', () => {
  it('Talvern Medical places a hold on Anders Lund, with a reason it is willing to show him', async () => {
    as(TALVERN_COMPLIANCE)
    const { status, body } = await json(
      await holdAct(req('POST', '/api/legal-holds', {
        subjectPersonId: who.anders,
        reason: 'A wage claim is open and these records are evidence in it.',
        matter: 'LIT-2026-0041',
      }))
    )
    expect(status).toBe(200)
    expect(body.subjectWouldRead).toContain('A wage claim is open')
    expect(body.subjectWouldRead).not.toContain('LIT-2026-0041')
  })

  it('a company with no record of somebody cannot freeze their erasure, and the refusal says why in a sentence', async () => {
    as(NORTHBEND_COMPLIANCE)
    const { status, body } = await json(
      await holdAct(req('POST', '/api/legal-holds', {
        subjectPersonId: who.anders,
        reason: 'We would like these kept, for reasons of our own.',
      }))
    )
    expect(status).toBe(403)
    expect(body.error).toContain('suspends a person’s erasure everywhere')
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('Anders asks to be forgotten and the request is held, not refused, and tells him a hold applies without naming the matter', async () => {
    as(ANDERS)
    const raised = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'ERASURE' })))
    expect(raised.status).toBe(200)

    const row = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.anders, kind: 'ERASURE' },
    })
    const outcome = await runRetentionSweep(new Date(row.receivedAt.getTime() + 15 * 86_400_000))
    expect(outcome.erased).toBe(0)
    expect(outcome.held).toBeGreaterThan(0)

    const held = await prisma.dataRequest.findUniqueOrThrow({ where: { id: row.id } })
    expect(held.status).toBe('HELD')
    expect(held.keptBecause.join(' ')).toContain('A wage claim is open')
    expect(held.keptBecause.join(' ')).not.toContain('LIT-2026-0041')
    expect(held.keptBecause.join(' ')).toContain('not refused')

    const still = await prisma.person.findUniqueOrThrow({ where: { id: who.anders } })
    expect(still.erasedAt).toBeNull()
  })

  it('Northbend Athletic cannot lift a hold Talvern Medical placed', async () => {
    const hold = await prisma.legalHold.findFirstOrThrow({ where: { subjectPersonId: who.anders, liftedAt: null } })
    as(NORTHBEND_COMPLIANCE)
    const { status, body } = await json(await holdAct(req('POST', '/api/legal-holds', { lift: hold.id, because: 'We would rather it went.' })))
    expect(status).toBe(403)
    expect(body.error).toContain('placed this hold')
  })
})

describe('the compliance desk’s own queue', () => {
  it('a compliance officer sees the holds their company placed, soonest review first', async () => {
    as(TALVERN_COMPLIANCE)
    const { status, body } = await json(await holdList(req('GET', '/api/legal-holds')))
    expect(status).toBe(200)
    expect(body.holds.length).toBeGreaterThan(0)
    expect(body.holds[0].reason).toContain('A wage claim is open')
  })

  it('a compliance officer cannot log a request about somebody their company has never held, and is not told who does hold them', async () => {
    as(TALVERN_COMPLIANCE)
    const stranger = await prisma.person.findFirstOrThrow({
      where: { primaryEmail: { contains: '@seed.etyme.invalid' }, sellContracts: { none: { clientCompanyId: co.talvern } } },
    })
    const { status, body } = await json(
      await deskQueue(req('GET', '/api/data-requests'))
    )
    expect(status).toBe(200)

    const refused = await json(
      await deskAct(req('POST', '/api/data-requests', { kind: 'EXPORT', subjectPersonId: stranger.id }))
    )
    expect(refused.status).toBe(403)
    expect(refused.body.error).toContain('we cannot tell you who that is')
  })

  it('a request naming both a person and a company is refused, because the two are answered out of different files', async () => {
    as(TALVERN_COMPLIANCE)
    const { status, body } = await json(
      await deskAct(req('POST', '/api/data-requests', {
        kind: 'EXPORT', subjectPersonId: who.anders, subjectCompanyId: co.talvern,
      }))
    )
    expect(status).toBe(400)
    expect(body.error).toContain('never both')
  })
})

describe('a breach opens a clock, or says that nobody has decided one', () => {
  let breachId = ''

  it('a breach opened with no clock says nobody has decided, never that nothing is owed', async () => {
    as(STAFF)
    const { status, body } = await json(
      await breachAct(req('POST', '/api/breaches', {
        summary: 'A nightly report ran against the wrong company and listed twelve contractors to a client that does not buy them.',
        personalData: true,
        populations: ['candidate'],
        categories: ['Time on site'],
        companyIds: [co.northbend],
      }))
    )
    expect(status).toBe(200)
    breachId = body.id
    expect(body.says).toContain('No deadline is set on it yet')

    const listed = await json(await breachList(req('GET', '/api/breaches')))
    const row = listed.body.breaches.find((b: { id: string }) => b.id === breachId)
    expect(row.nobodyHasDecided).toBe(true)
    expect(row.says).toContain('Nobody has decided a deadline')
  })

  it('a clock inside a day warns staff once, and the same night does not warn twice', async () => {
    const now = new Date()
    as(STAFF)
    await breachAct(req('POST', '/api/breaches', {
      breachId,
      authorityBy: new Date(now.getTime() + 10 * 3_600_000).toISOString(),
    }))

    const first = await runRetentionSweep(now)
    expect(first.breachWarnings).toBe(1)

    const again = await runRetentionSweep(new Date(now.getTime() + 60_000))
    expect(again.breachWarnings, 'once a day, not once a run').toBe(0)

    const logged = await prisma.automationLog.findMany({
      where: { action: 'BREACH_CLOCK_WARNED' },
      select: { summary: true },
    })
    expect(logged.length).toBe(1)
    expect(logged[0].summary).toContain('hours left to tell the supervisory authority')
  })

  it('a breach cannot be closed over a deadline with no notice recorded against it', async () => {
    as(STAFF)
    const { status, body } = await json(
      await breachAct(req('POST', '/api/breaches', {
        breachId, close: true, because: 'The report was fixed and nothing left the building.',
      }))
    )
    expect(status).toBe(409)
    expect(body.error).toContain('says the notice was never owed')
  })

  it('once the notice is recorded the clock stops chasing, and the breach can be closed', async () => {
    as(STAFF)
    const told = await json(await breachAct(req('POST', '/api/breaches', {
      breachId, told: 'AUTHORITY', how: 'Filed with the state attorney general’s office by their online form.',
    })))
    expect(told.status).toBe(200)

    const swept = await runRetentionSweep(new Date(Date.now() + 2 * 86_400_000))
    expect(swept.breachWarnings).toBe(0)

    const closed = await json(await breachAct(req('POST', '/api/breaches', {
      breachId, close: true, because: 'The report was fixed, the authority was told, and nothing left the building.',
    })))
    expect(closed.status).toBe(200)
  })

  it('a company none of whose records were in it is told there is nothing here, not that it is forbidden', async () => {
    as(TALVERN_COMPLIANCE)
    const { status, body } = await json(await breachList(req('GET', '/api/breaches')))
    expect(status).toBe(403)
    expect(body.error).toContain('nothing here for your company')
  })
})
