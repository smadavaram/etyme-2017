import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as importCensus } from '@/app/api/census/import/route'
import { GET as censusPageRoute } from '@/app/api/census/page/route'
import { GET as programDashboard } from '@/app/api/program/route'
import { GET as tenureLedger } from '@/app/api/tenure/route'
import { TEMPLATE_CSV } from '@/lib/census-import'
import { censusPage } from '@/lib/census-page'

/**
 * A client sends twelve contractors and gets one page back.
 *
 * `docs/census-brief.md`, steps 5 and 6: a named person at Etyme loads
 * the client's own spreadsheet into a private sandbox, the product's own
 * arithmetic runs over it, and the page goes out. The test the brief
 * writes for itself is the one that matters — **"the four numbers on the
 * page equal what the client dashboard shows in the sandbox"** — so the
 * dashboard and the tenure ledger are called here for real, as a seat
 * inside the sandbox, and the page is checked against what they say.
 *
 * Twelve rows, three suppliers, two of them carrying a gap on purpose:
 * one placement with no end date and one with no rate. A census with a
 * perfect file would prove nothing about the half of the product that
 * exists to say what it could not see.
 */

const STAFF = 'census.runner@etyme.invalid'
const CLIENT_SEAT = 'dana.whitlock@census-client.invalid'
const OUTSIDER = 'someone.else@outsider.invalid'

/** Twelve contractors across Veritan Talent, Auralis Software and Maren MSP. */
const ROWS = [
  // Veritan Talent — four, one of them with no end date.
  'Veritan Talent,Validation Engineer,Tualatin OR,2024-02-01,2026-12-31,92.50,40,C-1001',
  'Veritan Talent,Validation Engineer,Tualatin OR,2025-06-02,2026-12-31,88.00,40,C-1002',
  'Veritan Talent,Warehouse Lead,Tualatin OR,2023-01-09,2026-12-31,44.00,37.5,C-1003',
  'Veritan Talent,Warehouse Lead,Tualatin OR,2025-09-01,,45.00,40,C-1004',
  // Auralis Software — four, one of them with no rate at all.
  'Auralis Software,Validation Engineer,Elmira NY,2025-03-03,2026-12-31,110.00,40,C-1005',
  'Auralis Software,Data Engineer,Elmira NY,2024-11-04,2026-12-31,105.00,40,C-1006',
  'Auralis Software,Data Engineer,Elmira NY,2026-01-05,2026-12-31,,40,C-1007',
  'Auralis Software,Warehouse Lead,Elmira NY,2025-05-05,2026-12-31,48.00,40,C-1008',
  // Maren MSP — four.
  'Maren MSP,Data Engineer,Westminster CO,2022-04-04,2026-12-31,98.00,40,C-1009',
  'Maren MSP,Data Engineer,Westminster CO,2025-08-04,2026-12-31,96.00,40,C-1010',
  'Maren MSP,Validation Engineer,Westminster CO,2026-02-02,2026-12-31,101.00,40,C-1011',
  'Maren MSP,Warehouse Lead,Westminster CO,2026-03-02,2026-12-31,52.00,40,C-1012',
]

const FILLED = [TEMPLATE_CSV.split('\n')[0], ...ROWS].join('\n') + '\n'

let requestId = ''
let sandboxId = ''

describe('A client sends twelve contractors and gets one page back', () => {
  beforeAll(async () => {
    await resetDatabase()
    process.env.ETYME_STAFF_EMAILS = STAFF

    // The named person at Etyme. A staff seat is an address, never a
    // role at a company — they hold no context anywhere.
    await prisma.person.create({ data: { name: 'Ruth Calder', primaryEmail: STAFF } })

    // Somebody at another company entirely, with a real seat, to prove
    // a customer cannot open another firm's census.
    const other = await prisma.company.create({
      data: { name: 'Outsider Industries', slug: 'census-outsider', kind: 'VENDOR', currency: 'USD' },
    })
    const role = await prisma.role.create({
      data: { companyId: other.id, name: 'Owner', permissions: ['*'], isDefault: true },
    })
    const nosey = await prisma.person.create({ data: { name: 'Nosey Parker', primaryEmail: OUTSIDER } })
    await prisma.context.create({
      data: { personId: nosey.id, companyId: other.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Their own firm' },
    })

    const census = await prisma.censusRequest.create({
      data: {
        companyName: 'Northbend Athletic',
        contactName: 'Dana Whitlock',
        workEmail: 'dana.whitlock@northbend.invalid',
        desk: 'FINANCE',
        option: 'TEMPLATE',
        status: 'RECEIVED',
        assignedStaffEmail: STAFF,
        agreementAcceptedBy: 'Priya Raman, General Counsel',
        agreementAcceptedAt: new Date(),
        agreementVersion: '2026-09',
        filesReceivedAt: new Date(),
        receivedFileCount: 2,
        receivedBytes: FILLED.length,
        deleteBy: new Date(Date.now() + 30 * 86_400_000),
      },
    })
    requestId = census.id

    await prisma.censusFile.create({
      data: {
        requestId: census.id,
        fileName: 'northbend-contractors.csv',
        contentType: 'text/csv',
        sizeBytes: FILLED.length,
        bytes: Buffer.from(FILLED, 'utf8'),
      },
    })
    // Option B, in the same envelope: something no importer can read.
    await prisma.censusFile.create({
      data: {
        requestId: census.id,
        fileName: 'Q3 Veritan invoices.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12,
        bytes: Buffer.from('%PDF-1.4 ...', 'utf8'),
      },
    })
  }, 300_000)

  // ── Who may open it ─────────────────────────────────────────────────

  it('a customer with every permission at their own firm cannot open another company’s census', async () => {
    as(OUTSIDER)
    const res = await json(await importCensus(req('POST', '/api/census/import', { requestId })))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('named person at Etyme')
  })

  it('the named person at Etyme can open it, holding no seat at any company', async () => {
    as(STAFF)
    const res = await json(await importCensus(req('POST', '/api/census/import', { requestId })))
    expect(res.status).toBe(200)
    expect(res.body.data.imported).toBe(12)
    sandboxId = res.body.data.sandboxCompanyId
    expect(sandboxId).toBeTruthy()
  })

  // ── What the import made ────────────────────────────────────────────

  it('twelve rows across three suppliers become twelve contractors at three suppliers', async () => {
    const sandbox = await prisma.company.findUniqueOrThrow({ where: { id: sandboxId } })
    expect(sandbox.name).toBe('Northbend Athletic')
    expect(sandbox.isCensusSandbox).toBe(true)
    expect(sandbox.isDemo).toBe(false)
    expect(sandbox.domain).toMatch(/\.invalid$/)

    const contracts = await prisma.sellContract.findMany({
      where: { clientCompanyId: sandboxId },
      include: { company: true, person: true },
    })
    expect(contracts).toHaveLength(12)
    expect(new Set(contracts.map((c) => c.company.name))).toEqual(
      new Set(['Veritan Talent', 'Auralis Software', 'Maren MSP'])
    )
    for (const c of contracts) {
      expect(c.company.isCensusSandbox).toBe(true)
      // The template asks for no names, and nothing here invents one:
      // a contractor is their own reference number.
      expect(c.person.name).toMatch(/^C-\d{4}$/)
    }
  })

  it('the sandbox is written back onto the census request, so nothing has to guess where the rows went', async () => {
    const census = await prisma.censusRequest.findUniqueOrThrow({ where: { id: requestId } })
    expect(census.sandboxCompanyId).toBe(sandboxId)
  })

  it('every contractor read out of the file leaves a row in the access log', async () => {
    const staff = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: STAFF } })
    const logged = await prisma.accessLog.findMany({ where: { actorPersonId: staff.id } })
    expect(logged.length).toBeGreaterThanOrEqual(12)
    expect(logged[0].reason).toContain('Northbend Athletic')
  })

  it('running the same file a second time loads nothing, so a head count cannot double on a second click', async () => {
    as(STAFF)
    const again = await json(await importCensus(req('POST', '/api/census/import', { requestId })))
    expect(again.status).toBe(200)
    expect(again.body.data.imported).toBe(0)
    expect(await prisma.sellContract.count({ where: { clientCompanyId: sandboxId } })).toBe(12)
    expect(again.body.data.gaps.map((g: { kind: string }) => g.kind)).toContain('ALREADY_IMPORTED')
  })

  it('a file that is not a spreadsheet is received and read by a person, and never imported', async () => {
    as(STAFF)
    const res = await json(await importCensus(req('POST', '/api/census/import', { requestId })))
    expect(res.body.data.notImported.map((f: { fileName: string }) => f.fileName)).toContain('Q3 Veritan invoices.pdf')
    expect(res.body.data.notImported[0].says).toContain('read by a person, not imported')
  })

  // ── The four numbers, against the client’s own dashboard ───────

  describe('and the numbers on the page are the numbers the client’s own dashboard shows', () => {
    let dashboard: any
    let ledger: any
    let page: Awaited<ReturnType<typeof censusPage>>

    beforeAll(async () => {
      // A seat inside the sandbox, the way the client would have one if
      // they opened it — step 7 of the brief, "a link to the same
      // numbers live in their sandbox".
      const role = await prisma.role.create({
        data: { companyId: sandboxId, name: 'Owner', permissions: ['*'], isDefault: true },
      })
      const dana = await prisma.person.create({
        data: { name: 'Dana Whitlock', primaryEmail: CLIENT_SEAT },
      })
      await prisma.context.create({
        data: { personId: dana.id, companyId: sandboxId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Census sandbox' },
      })

      as(CLIENT_SEAT)
      dashboard = (await json(await programDashboard(req('GET', '/api/program')))).body.data
      ledger = (await json(await tenureLedger(req('GET', '/api/tenure')))).body.data

      page = await censusPage({ requestId })
    }, 120_000)

    it('the number of contractors on site is the number the dashboard shows', () => {
      expect(page.numbers.contractorsToday.total).toBe(dashboard.summary.activeContractors)
      expect(page.numbers.contractorsToday.total).toBe(12)
    })

    it('the contractors each supplier has on site are the head counts the dashboard shows', () => {
      const onPage = Object.fromEntries(
        page.numbers.contractorsToday.bySupplier.map((s) => [s.name, s.contractors])
      )
      const onDashboard = Object.fromEntries(
        dashboard.vendors.map((v: { name: string; headcount: number }) => [v.name, v.headcount])
      )
      expect(onPage).toEqual(onDashboard)
      expect(onPage).toEqual({ 'Veritan Talent': 4, 'Auralis Software': 4, 'Maren MSP': 4 })
    })

    it('the number of suppliers on the page is the number of suppliers on the dashboard', () => {
      expect(page.numbers.contractorsToday.bySupplier).toHaveLength(dashboard.summary.vendors)
    })

    it('the days on site on the page are the days the tenure ledger counts for the same person', () => {
      for (const person of page.numbers.longestOnSite.top) {
        const theirs = ledger.people.find((p: { name: string }) => p.name === person.reference)
        expect(theirs, `${person.reference} is on the page and not in the tenure ledger`).toBeTruthy()
        expect(theirs.cumulativeDays).toBe(person.days)
        expect(theirs.cumulativeMonths).toBe(person.months)
      }
    })

    it('the longest on site is the person who started first, counting days served and not days booked', () => {
      // C-1009, from April 2022. Booked to the end of 2026 and counted
      // only to today.
      expect(page.numbers.longestOnSite.top[0].reference).toBe('C-1009')
      const booked = Math.ceil((new Date('2026-12-31').getTime() - new Date('2022-04-04').getTime()) / 86_400_000)
      expect(page.numbers.longestOnSite.top[0].days).toBeLessThan(booked)
    })

    // ── The number the two surfaces do not agree on, and why ──────────

    it('a placement whose rate the client never sent blanks the quarter on the page rather than pricing it at nothing', () => {
      expect(page.numbers.spendThisQuarter.totalMinor).toBeNull()
      expect(page.numbers.spendThisQuarter.why).toContain('no rate or no hours')
      expect(page.numbers.spendThisQuarter.of).toBe(12)
      expect(page.numbers.spendThisQuarter.priced).toBe(11)
    })

    it('the two suppliers who priced every placement still carry their own figure', () => {
      const byName = Object.fromEntries(page.numbers.spendThisQuarter.bySupplier.map((s) => [s.name, s]))
      expect(byName['Veritan Talent'].minor).toBeGreaterThan(0)
      expect(byName['Maren MSP'].minor).toBeGreaterThan(0)
      expect(byName['Auralis Software'].minor).toBeNull()
      expect(byName['Auralis Software'].why).toContain('C-1007')
    })

    it('the client dashboard prices that same placement at zero, which is the one thing the two surfaces cannot yet agree on', () => {
      // Not a bug in either surface: `SellContract.billRate` is a
      // non-null Int, so "the client never told us" has nowhere to live
      // and the importer has to store a zero. The census page reads a
      // zero back as no rate and blanks the book; the dashboard reads it
      // as a rate and prices the person at nothing. A nullable column is
      // the fix and it is a schema request, recorded here so the
      // disagreement is visible rather than discovered by a CFO.
      const unpriced = dashboard.contractors.find((c: { person: { name: string } }) => c.person.name === 'C-1007')
      expect(unpriced.billRate).toBe(0)
      expect(dashboard.summary.monthlySpend).toBeGreaterThan(0)
      expect(page.numbers.spendThisQuarter.totalMinor).toBeNull()
    })

    // ── Same skill, different price ───────────────────────────────────

    it('three suppliers filling one role show the lowest, the highest and the gap between them', () => {
      const engineer = page.numbers.rateSpread.roles.find((r) => r.role === 'Validation Engineer')!
      expect(engineer.lowMinor).toBe(8_800)
      expect(engineer.highMinor).toBe(11_000)
      expect(engineer.gapMinor).toBe(2_200)
      expect(engineer.lowSupplier).toBe('Veritan Talent')
      expect(engineer.highSupplier).toBe('Auralis Software')
    })

    it('a role where one supplier sent no rate says the real gap can only be wider', () => {
      const data = page.numbers.rateSpread.roles.find((r) => r.role === 'Data Engineer')!
      expect(data.caveat).toContain('Auralis Software')
      expect(data.caveat).toContain('can only be wider')
    })

    // ── What we could not see ─────────────────────────────────────────

    it('the placement with no end date is on the page as a gap, and is still counted as on site today', () => {
      expect(page.gaps.some((g) => g.kind === 'NO_END_DATE' && g.reference === 'C-1004')).toBe(true)
      expect(page.html).toContain('C-1004')
      expect(page.numbers.contractorsToday.total).toBe(12)
    })

    it('the placement with no rate is on the page as a gap, named by its own reference number', () => {
      expect(page.gaps.some((g) => g.kind === 'NO_RATE' && g.reference === 'C-1007')).toBe(true)
    })

    it('the file nobody could import is on the page too, as received and read by a person', () => {
      expect(page.gaps.some((g) => g.kind === 'NOT_A_SPREADSHEET')).toBe(true)
      expect(page.html).toContain('read by a person')
    })

    it('the page is one sheet, addressed to the contact by name, with the deletion date on it', () => {
      expect(page.html).toContain('Dana Whitlock')
      expect(page.html).toContain('Northbend Athletic')
      expect(page.html).toContain('@media print')
      expect(page.html).toContain('unless you start a program')
    })

    it('the page names no person, because the template asked for none', () => {
      expect(page.html).not.toContain('Helena')
      for (const ref of ['C-1001', 'C-1009']) expect(page.html).toContain(ref)
    })
  })

  // ── The route the named person actually opens ───────────────────────

  it('the named person opens the page as a printable sheet, and a customer is refused', async () => {
    as(STAFF)
    const html = await censusPageRoute(req('GET', `/api/census/page?id=${requestId}`))
    expect(html.status).toBe(200)
    expect(html.headers.get('content-type')).toContain('text/html')
    expect(await html.text()).toContain('Contractor census')

    as(OUTSIDER)
    const refused = await json(await censusPageRoute(req('GET', `/api/census/page?id=${requestId}`)))
    expect(refused.status).toBe(403)
  })

  it('the review route gets the page, the gaps and the numbers together, to store and to send', async () => {
    as(STAFF)
    const res = await json(await censusPageRoute(req('GET', `/api/census/page?id=${requestId}&format=json`)))
    expect(res.status).toBe(200)
    expect(res.body.data.html).toContain('<!doctype html>')
    expect(Array.isArray(res.body.data.gaps)).toBe(true)
    expect(res.body.data.numbers.contractorsToday.total).toBe(12)
  })

  it('a census with no file imported has no page, and says so rather than showing an empty one', async () => {
    const empty = await prisma.censusRequest.create({
      data: {
        companyName: 'Cavanaugh Glassworks', contactName: 'Ron Ebert',
        workEmail: 'ron.ebert@cavanaugh.invalid', desk: 'PROGRAM', assignedStaffEmail: STAFF,
      },
    })
    as(STAFF)
    const res = await json(await censusPageRoute(req('GET', `/api/census/page?id=${empty.id}`)))
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('have not been loaded yet')
  })

  it('a file is never opened before somebody at the client has accepted the agreement by name', async () => {
    const unsigned = await prisma.censusRequest.create({
      data: {
        companyName: 'Talvern Medical', contactName: 'Jo Petrie',
        workEmail: 'jo.petrie@talvern.invalid', desk: 'PROCUREMENT', assignedStaffEmail: STAFF,
      },
    })
    await prisma.censusFile.create({
      data: {
        requestId: unsigned.id, fileName: 'talvern.csv', contentType: 'text/csv',
        sizeBytes: FILLED.length, bytes: Buffer.from(FILLED, 'utf8'),
      },
    })

    as(STAFF)
    const res = await json(await importCensus(req('POST', '/api/census/import', { requestId: unsigned.id })))
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('accepted the census agreement')
    expect(await prisma.company.count({ where: { name: 'Talvern Medical' } })).toBe(0)
  })
})
