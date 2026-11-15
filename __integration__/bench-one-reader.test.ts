import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as today } from '@/app/api/today/route'
import { GET as bench } from '@/app/api/bench/route'
import { GET as consultants } from '@/app/api/consultants/route'
import { POST as commitImport } from '@/app/api/imports/[id]/commit/route'
import { POST as loadSheet } from '@/app/api/imports/sheets/route'
import { benchAt } from '@/app/api/today/reads'
import { firmReadsAt } from '@/lib/consultant-portfolio/before-her-yes'

/**
 * Fix list, layer 5 ("the bench"), the architect's items.
 *
 * e. Who is on the bench had two readers. Today and Candidates read
 *    `benchAt`, which asked only this firm's own lines; Bench read every
 *    firm's. So somebody placed at a client through another firm counted
 *    on the bench on Today and read "On a placement until" on Bench. Now
 *    a line live today at any firm takes them off, and nothing of that
 *    line is returned.
 * F3.3. Today read "Nobody on the bench yet." while an ask was waiting.
 * h. An import's bench listing kept no typed name, and its new records
 *    wrote no row saying this firm made them.
 * j. A people sheet counted only live listings at other firms when it
 *    decided whose record it was to change.
 */

const D = '@demo.etyme.local'
const TECHPEPLE = `world-techpeple${D}`
const DAY = 86_400_000
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

let firm = ''
let harborline = ''
let client = ''
let placedElsewhere = ''
let lastDayElsewhere = ''
let startsLater = ''
let endedElsewhere = ''
let otherLineId = ''
let ownEndedUndated = ''
let ownEndedLater = ''
let endedLaterElsewhere = ''

async function onOurBench(name: string, slug: string): Promise<string> {
  const person = await prisma.person.create({ data: { name, primaryEmail: `${slug}@northwind-staffing.example` } })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['dbt'] } })
  await prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: firm, tier: 'MARKETING', state: 'GRANTED',
      invitedAt: new Date(Date.now() - 30 * DAY), grantedAt: new Date(Date.now() - 20 * DAY),
    },
  })
  return person.id
}

async function lineHere(personId: string, startDate: Date, endDate: Date | null) {
  return prisma.sellContract.create({
    data: { companyId: firm, clientCompanyId: client, personId, billRate: 87_654, state: 'ENDED', startDate, endDate },
  })
}

async function lineAtHarborline(personId: string, startDate: Date, endDate: Date | null, state: 'IN_PROGRESS' | 'ENDED' = 'IN_PROGRESS') {
  return prisma.sellContract.create({
    data: { companyId: harborline, clientCompanyId: client, personId, billRate: 98_765, state, startDate, endDate },
  })
}

beforeAll(async () => {
  await freshWorld()
  firm = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } })).id
  harborline = (await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-bench-reader', kind: 'VENDOR', currency: 'USD' } })).id
  client = (await prisma.company.create({ data: { name: 'Quillmoor Foods', slug: 'quillmoor-bench-reader', kind: 'CLIENT', currency: 'USD' } })).id

  const now = new Date()
  placedElsewhere = await onOurBench('Rhea Calloway', 'rhea.calloway')
  otherLineId = (await lineAtHarborline(placedElsewhere, new Date(now.getTime() - 10 * DAY), new Date(now.getTime() + 60 * DAY))).id

  lastDayElsewhere = await onOurBench('Tomas Ekwueme', 'tomas.ekwueme')
  await lineAtHarborline(lastDayElsewhere, new Date(now.getTime() - 40 * DAY), midnight(now))

  startsLater = await onOurBench('Mira Solberg', 'mira.solberg')
  await lineAtHarborline(startsLater, new Date(now.getTime() + 30 * DAY), new Date(now.getTime() + 120 * DAY))

  endedElsewhere = await onOurBench('Dev Anand Rao', 'dev.rao')
  await lineAtHarborline(endedElsewhere, new Date(now.getTime() - 90 * DAY), new Date(now.getTime() - 5 * DAY), 'ENDED')

  // Reader of batch five, item 1: a line of this firm's own, ended, with
  // no last day on record, or with a last day still to come.
  ownEndedUndated = await onOurBench('Ines Varga', 'ines.varga')
  await lineHere(ownEndedUndated, new Date(now.getTime() - 90 * DAY), null)
  ownEndedLater = await onOurBench('Kwame Asante', 'kwame.asante')
  await lineHere(ownEndedLater, new Date(now.getTime() - 90 * DAY), new Date(now.getTime() + 20 * DAY))
  endedLaterElsewhere = await onOurBench('Noor Haddad', 'noor.haddad')
  await lineAtHarborline(endedLaterElsewhere, new Date(now.getTime() - 90 * DAY), new Date(now.getTime() + 20 * DAY), 'ENDED')
}, 600_000)

describe('one reader of who is on the bench', () => {
  it('a person placed today through another firm’s line is not on our bench', async () => {
    const ids = (await benchAt(firm, new Date())).map((b) => b.personId)
    expect(ids).not.toContain(placedElsewhere)
  })

  it('on the last day of a placement at another firm the person is still placed, because a contract’s last day is a day on site', async () => {
    const ids = (await benchAt(firm, new Date())).map((b) => b.personId)
    expect(ids).not.toContain(lastDayElsewhere)
  })

  it('somebody whose placement at another firm starts later, or has ended, is still on our bench today', async () => {
    const ids = (await benchAt(firm, new Date())).map((b) => b.personId)
    expect(ids).toContain(startsLater)
    expect(ids).toContain(endedElsewhere)
  })

  it('who is on the bench reads the same on Today, Candidates and Bench', async () => {
    as(TECHPEPLE)
    const t = await json(await today(req('GET', '/api/today')))
    expect(t.status, JSON.stringify(t.body).slice(0, 300)).toBe(200)
    const c = await json(await consultants(req('GET', '/api/consultants')))
    const b = await json(await bench(req('GET', '/api/bench?scope=company')))
    const onToday = (t.body.data.bench as { personId: string }[]).map((r) => r.personId)
    expect(onToday).not.toContain(placedElsewhere)
    expect(onToday).toContain(startsLater)
    expect(c.body.data.bench.count).toBe(onToday.length)
    expect(b.body.data.totals.onBench).toBe(onToday.length)
    // Bench's own row for her says she is not on the bench Today counts.
    const rows = [...b.body.data.tiers.MARKETING, ...b.body.data.tiers.RETAINED]
    const hers = rows.find((r: any) => r.consultant.person.id === placedElsewhere)
    expect(hers?.onBenchToday).toBe(false)
  })

  it('nothing about the other firm’s line is returned on our Today page: not its firm, its client, its rate or its dates', async () => {
    as(TECHPEPLE)
    const t = await json(await today(req('GET', '/api/today')))
    const said = JSON.stringify(t.body)
    expect(said).not.toContain('Harborline Tech')
    expect(said).not.toContain('Quillmoor Foods')
    expect(said).not.toContain(otherLineId)
    expect(said).not.toContain('98765')
    expect(said).not.toContain('987.65')
    for (const row of await benchAt(firm, new Date())) {
      expect(Object.keys(row).sort()).toEqual(['name', 'personId', 'since'])
    }
  })
})

describe('a person whose only line has ended reads the same on Today, Candidates and Bench', () => {
  async function threePages() {
    as(TECHPEPLE)
    const t = await json(await today(req('GET', '/api/today')))
    expect(t.status, JSON.stringify(t.body).slice(0, 300)).toBe(200)
    const c = await json(await consultants(req('GET', '/api/consultants')))
    const b = await json(await bench(req('GET', '/api/bench?scope=company')))
    const onToday = (t.body.data.bench as { personId: string }[]).map((r) => r.personId)
    const rows = [...b.body.data.tiers.MARKETING, ...b.body.data.tiers.RETAINED]
    const row = (id: string) => rows.find((r: any) => r.consultant.person.id === id)
    return { onToday, candidates: c.body.data.bench.count as number, onBench: b.body.data.totals.onBench as number, row }
  }

  it('a person whose own line here has ended with no last day on record is on the bench on Today, Candidates and Bench, as Bench reads her free now', async () => {
    const p = await threePages()
    expect(p.onToday).toContain(ownEndedUndated)
    expect(p.candidates).toBe(p.onToday.length)
    expect(p.onBench).toBe(p.onToday.length)
    expect(p.row(ownEndedUndated)?.onBenchToday).toBe(true)
  })

  it('a person whose ended line, here or at another firm, has a last day still to come is off the bench on every page until the day after it', async () => {
    const p = await threePages()
    for (const id of [ownEndedLater, endedLaterElsewhere]) {
      expect(p.onToday).not.toContain(id)
      expect(p.row(id)?.onBenchToday).toBe(false)
      expect(p.row(id)?.free?.state).not.toBe('NOW')
    }
  })
})

describe('Today says who was asked onto the bench and has not answered', () => {
  it('Today counts the people asked and not answered yet, the same number Candidates gives', async () => {
    const person = await prisma.person.create({ data: { name: 'Yusuf Adeyemi', primaryEmail: 'yusuf.adeyemi@northwind-staffing.example' } })
    const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['Spark'] } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: firm, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() } })
    as(TECHPEPLE)
    const t = await json(await today(req('GET', '/api/today')))
    const c = await json(await consultants(req('GET', '/api/consultants')))
    expect(t.body.data.benchAsked).toBeGreaterThanOrEqual(1)
    expect(t.body.data.benchAsked).toBe(c.body.data.bench.invited)
    // Asked is never on the bench.
    expect((t.body.data.bench as { personId: string }[]).map((r) => r.personId)).not.toContain(person.id)
  })
})

describe('an import keeps the firm’s own words on the records it makes', () => {
  let importId = ''
  beforeAll(async () => {
    const imp = await prisma.import.create({
      data: {
        companyId: firm, kind: 'PEOPLE', fileName: 'northwind-people.csv',
        mapping: { mappings: [], unmapped: [], warnings: [], refused: [] }, rowCount: 1, issueCount: 0,
      },
    })
    importId = imp.id
    const parsed = { name: 'Lena Okafor', email: 'lena.okafor@northwind-staffing.example', contractType: 'C2C', skills: ['Airflow'], headline: 'Data engineer' }
    await prisma.importRow.create({ data: { importId, raw: parsed as object, parsed: parsed as object, issues: [] } })
    as(TECHPEPLE)
    const r = await json(await commitImport(req('POST', `/api/imports/${importId}/commit`), { params: Promise.resolve({ id: importId }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })

  it('a row asked onto the bench by an import keeps the name the sheet typed on the firm’s own listing', async () => {
    const listing = await prisma.benchListing.findFirstOrThrow({
      where: { companyId: firm, consultant: { person: { primaryEmail: 'lena.okafor@northwind-staffing.example' } } },
    })
    expect(listing.state).toBe('INVITED')
    expect(listing.firmName).toBe('Lena Okafor')
  })

  it('a consultant record an import makes writes the row saying this firm made it, so the firm still reads its own words after another firm lists her', async () => {
    const profile = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: 'lena.okafor@northwind-staffing.example' } } })
    const made = await prisma.automationLog.count({
      where: { companyId: firm, action: 'CONSULTANT_CREATED', payload: { path: ['profileId'], equals: profile.id } },
    })
    expect(made).toBe(1)
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: harborline, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() } })
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: TECHPEPLE } })
    const reads = await firmReadsAt({ companyId: firm, callerPersonId: owner.id, consultantIds: [profile.id] })
    expect(reads.get(profile.id)?.onlyTyped).toBe(false)
  })
})

describe('a people sheet asks whose record it is the way every reader asks', () => {
  it('a sheet leaves alone the profile of somebody another firm once listed, even after that firm took the listing back, and keeps its words on its own listing', async () => {
    const person = await prisma.person.create({ data: { name: 'Sana Iqbal', primaryEmail: 'sana.iqbal@harborline-tech.example' } })
    const profile = await prisma.consultantProfile.create({ data: { personId: person.id, headline: 'Her own title', skills: ['Snowflake'] } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: harborline, tier: 'MARKETING', state: 'GRANTED', invitedAt: new Date(Date.now() - 60 * DAY), grantedAt: new Date(Date.now() - 50 * DAY), revokedAt: new Date(Date.now() - 10 * DAY) } })
    const ours = await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: firm, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() } })
    as(TECHPEPLE)
    const r = await json(await loadSheet(req('POST', '/api/imports/sheets', {
      entity: 'CONSULTANTS', commit: true,
      rows: [{ Name: 'Sana Iqbal', Email: 'sana.iqbal@harborline-tech.example', Title: 'Our words for her' }],
    })))
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    expect((await prisma.consultantProfile.findUniqueOrThrow({ where: { id: profile.id } })).headline).toBe('Her own title')
    expect((await prisma.benchListing.findUniqueOrThrow({ where: { id: ours.id } })).firmHeadline).toBe('Our words for her')
  })
})
