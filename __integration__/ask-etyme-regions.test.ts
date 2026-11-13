import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { freshWorld, as, req, json, prisma } from './harness'
import { GET as threadList } from '@/app/api/conversations/route'
import { GET as readThread, POST as writeThread } from '@/app/api/conversations/messages/route'
import { GET as greet, POST as ask } from '@/app/api/conversations/twin/route'
import { GET as byRegion } from '@/app/api/program/regions/route'
import { corvaneSeatEmail, corvaneContractors, CORVANE_PLANTS, CORVANE_RECEIPTS, CORVANE_COUNTRIES, billRateMinor } from '@/lib/seed-corvane'
import { REGION_CHIPS, PROGRAM_CHIPS, PLANT_LIMIT_CHIP } from '@/app/api/conversations/twin/regions'
import { heldOverSays } from '@/app/api/program/regions/rollup'
import { countWordLower } from '@/app/api/conversations/twin/count-words'
import { reportingRatesFor, spendInReporting } from '@/lib/money/reporting-currency'
import { format, fromMinor } from '@/lib/money'

/**
 * Ask Etyme for the seats that read Corvane Packaging by region (founder,
 * 2026-10-27, the region map): the regional manager, the hiring manager on
 * a plant, the head of operations and the CFO. Every name and figure is
 * read off the seed's own plan (`CORVANE_PLANTS`, `corvaneContractors`)
 * or off By region's own answer for the same seat, never typed in.
 */

const DOMAIN = 'demo.etyme.local'
const seat = (desk: string) => corvaneSeatEmail(desk, DOMAIN)
const VALERIA = seat('region-latam')
const MARCUS = seat('hiring-dayton')
const CFO = seat('cfo')
const OPS = seat('operations')
const AP = seat('ap')

const { onSite, onHold } = corvaneContractors()
const latam = CORVANE_PLANTS.filter((p) => p.region === 'latam')
const us = CORVANE_PLANTS.filter((p) => p.region === 'us')
const sum = (ps: readonly { [k: string]: any }[], k: string) => ps.reduce((n, p) => n + p[k], 0)
const dayton = CORVANE_PLANTS.find((p) => p.key === 'dayton')!
const upper = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
const andList = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/**
 * The seed's held invoice receipts, each with what it bills past the
 * signed hours at its site's rate, which is how By region works it out.
 * Read here so the sentences below hold however many the seed holds.
 */
const heldSeed = CORVANE_RECEIPTS.filter((r) => r.held).map((r) => {
  const plant = CORVANE_PLANTS.find((x) => x.key === r.plant)!
  return { ...r, site: plant, currency: CORVANE_COUNTRIES[plant.cc].currency, overMinor: Math.round((r.billed - r.accepted) * billRateMinor(plant.cc)) }
})

/** Each currency's held money over, once and in code order, as By region totals it. */
function overLines(rs: typeof heldSeed): { currency: string; minor: number }[] {
  const by = new Map<string, number>()
  for (const r of rs) by.set(r.currency, (by.get(r.currency) ?? 0) + r.overMinor)
  return [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([currency, minor]) => ({ currency, minor }))
}
const ownMoney = (rs: typeof heldSeed) => andList(overLines(rs).map((l) => heldOverSays([l])))
const town = (r: (typeof heldSeed)[number]) => r.site.plant.split(',')[0].trim()

/**
 * What the CFO hears about the seed's held receipts, worked out here from
 * the seed and money's own rollup. One: the site, the money over and the
 * hours. Several in one currency: how many, where (By region's own words
 * for the sites), the money over and how much of it the site holding the
 * most bills. Several currencies: the money over as one figure at the
 * rates By region converts with, named, and the site holding the most in
 * its own money. `start` is whether the phrase opens a sentence.
 */
async function heldPhraseFromSeed(page: any, start: boolean): Promise<string> {
  if (heldSeed.length === 1) {
    const r = heldSeed[0]
    return `at ${r.site.city} is held, ${ownMoney(heldSeed)} over the signed hours (${r.billed} hours billed, ${r.accepted} hours signed)`
  }
  const item = page.body.data.greeting.held.find((i: any) => i.kind === 'receipt')
  expect(item.count).toBe(heldSeed.length)
  expect([...item.plants].sort()).toEqual([...new Set(heldSeed.map(town))].sort())
  const n = countWordLower(heldSeed.length)
  const where = `${start ? upper(n) : n} invoice receipts are held at ${item.plant}`
  const sites = [...new Set(heldSeed.map(town))].map((t) => ({ town: t, rs: heldSeed.filter((r) => town(r) === t) }))
  const lines = overLines(heldSeed)
  if (lines.length === 1) {
    const top = [...sites].sort((a, b) => overLines(b.rs)[0].minor - overLines(a.rs)[0].minor)
    const named = top.length > 1 && overLines(top[0].rs)[0].minor > overLines(top[1].rs)[0].minor
    return `${where}, ${ownMoney(heldSeed)} over the signed hours${named ? `, ${ownMoney(top[0].rs)} of it at ${top[0].town}` : ''}`
  }
  const now = new Date()
  const rates = await reportingRatesFor(page.body.data.client.id, now)
  const all = spendInReporting(lines, rates.reportingCurrency, rates, now)
  if (!all.total) return `${where}, ${ownMoney(heldSeed)} over the signed hours`
  const inOne = sites.map((x) => ({ ...x, minor: spendInReporting(overLines(x.rs), rates.reportingCurrency, rates, now).total?.minor ?? null }))
  const top = inOne.every((x) => x.minor !== null) ? [...inOne].sort((a, b) => b.minor! - a.minor!) : []
  const named = top.length > 1 && top[0].minor! > top[1].minor!
  const total = format(fromMinor(all.total.minor, all.reportingCurrency), { compact: true })
  return `${where}, about ${total} over the signed hours ${all.sampleRates ? 'at sample rates' : 'at the rates you set'}${named ? `, the most at ${top[0].town} (${ownMoney(top[0].rs)})` : ''}`
}

const asked = async (who: string, text: string) => {
  as(who)
  return json(await ask(req('POST', '/api/conversations/twin', { text }) as NextRequest))
}
const greeting = async (who: string, query = '') => {
  as(who)
  return json(await greet(req('GET', `/api/conversations/twin${query}`) as NextRequest))
}
const page = async (who: string) => {
  as(who)
  return json(await byRegion(req('GET', '/api/program/regions') as NextRequest))
}

/** Nothing from the United States: no US plant, hiring manager or contractor. */
function noUnitedStates(said: string) {
  for (const p of us) {
    expect(said, p.plant).not.toContain(p.plant)
    expect(said, p.manager).not.toContain(p.manager)
  }
  for (const c of onSite.filter((c) => c.plant.region === 'us')) expect(said, c.name).not.toContain(c.name)
}

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('Valeria Montes asks Ask Etyme about Latin America', () => {
  it('her greeting names the hiring manager at the plant nearest the time limit and the rest of the weeks as a count, then the person there, and the mark is By region’s count', async () => {
    const g = await greeting(VALERIA)
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const p = await page(VALERIA)
    expect(g.body.data.answer.kind).toBe('NEEDS')
    const campinas = latam.find((x) => x.key === 'campinas')!
    const juliana = onSite.find((c) => c.plant.key === 'campinas' && c.nearest)!
    const rest = sum(latam, 'weeksToSign') - campinas.weeksToSign
    const restPlants = latam.filter((x) => x.weeksToSign > 0 && x.key !== 'campinas').length
    const weeksSaid = `${campinas.manager} has ${campinas.weeksToSign} weeks to sign in Campinas, and ${rest} more weeks wait at ${restPlants} sites. ` +
      `${juliana.name} in Campinas reaches the time limit in ${campinas.nearestLimitDays} days.`
    if (heldSeed.some((r) => r.site.region === 'latam')) expect(g.body.data.answer.says).toContain(weeksSaid)
    else expect(g.body.data.answer.says).toBe(`One thing needs you: ${weeksSaid}`)
    const mark = await greeting(VALERIA, '?only=owed')
    expect(mark.status).toBe(200)
    expect(mark.body.data.total).toBe(p.body.data.greeting.total)
    expect(g.body.data.chips).toEqual([...REGION_CHIPS])
    noUnitedStates(JSON.stringify(g.body.data.answer))
  })

  it('which sites have weeks waiting: Latin America’s sites and contractors, and the weeks the seed filed at each', async () => {
    const r = await asked(VALERIA, 'Which sites have weeks waiting?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const a = r.body.data.answer
    const withWeeks = latam.filter((p) => p.weeksToSign > 0)
    expect(a.says).toBe(`Latin America: ${latam.length} sites, ${sum(latam, 'contractors')} contractors on site. ${sum(latam, 'weeksToSign')} weeks wait to be signed at ${withWeeks.length} sites.`)
    const rows = a.table.rows.map((row: any) => row.cells)
    expect(rows.map((c: string[]) => c[0]).sort()).toEqual(withWeeks.map((p) => p.plant).sort())
    for (const p of withWeeks) {
      const row = rows.find((c: string[]) => c[0] === p.plant)
      expect(row, p.plant).toEqual([p.plant, p.manager, String(p.contractors), String(p.weeksToSign)])
    }
    noUnitedStates(JSON.stringify(a))
  })

  it('who is near the time limit in her region: the nearest person at each Latin American plant within 90 days, Campinas first', async () => {
    const r = await asked(VALERIA, 'Who is near the time limit in my region?')
    const a = r.body.data.answer
    const near = latam.filter((p) => p.nearestLimitDays <= 90).sort((x, y) => x.nearestLimitDays - y.nearestLimitDays)
    expect(a.table.rows.map((row: any) => row.cells[0])).toEqual(near.map((p) => p.plant))
    const campinas = onSite.find((c) => c.plant.key === 'campinas' && c.nearest)!
    const campinasPlant = latam.find((x) => x.key === 'campinas')!
    expect(a.table.rows[0].cells).toEqual([campinasPlant.plant, campinas.name, campinasPlant.plant, `in ${campinasPlant.nearestLimitDays} days`])
    noUnitedStates(JSON.stringify(a))
  })

  it('which invoice receipts are held in Latin America: the held and the clean receipts the seed has there, and the clean ones ready to pay', async () => {
    const r = await asked(VALERIA, 'Which invoice receipts are held?')
    const here = CORVANE_RECEIPTS.filter((x) => latam.some((p) => p.key === x.plant))
    const held = here.filter((x) => x.held).length
    const ready = here.length - held
    if (held === 0) {
      expect(r.body.data.answer.says).toBe(`No invoice receipt is held in Latin America.${ready === 0 ? '' : ` ${upper(countWordLower(ready))} ${ready === 1 ? 'is' : 'are'} ready to pay.`}`)
    } else {
      expect(r.body.data.answer.says).toMatch(/\bheld\b/)
      noUnitedStates(JSON.stringify(r.body.data.answer))
    }
  })

  it('how each country here runs shows only Latin American countries, and only confirmed lines', async () => {
    const r = await asked(VALERIA, 'How does each country here run?')
    const a = r.body.data.answer
    const p = await page(VALERIA)
    const shown = p.body.data.region.countries.map((c: any) => c.name)
    if (a.kind === 'LIST') expect(a.table.rows.map((row: any) => row.cells[0])).toEqual(shown)
    else expect(shown).toEqual([])
    for (const name of shown) expect(['Mexico', 'Brazil', 'Colombia']).toContain(name)
  })

  it('asking about the United States or Dayton is refused in one sentence naming Latin America', async () => {
    const r = await asked(VALERIA, 'Which weeks wait in the United States?')
    expect(r.status).toBe(200)
    expect(r.body.data.answer.says).toBe('Your seat reads Latin America only, so United States is not on your page.')
    const d = await asked(VALERIA, 'Who is near the time limit at Dayton?')
    expect(d.body.data.answer.says).toBe('Your seat reads Latin America only, so Dayton, Ohio is not on your page.')
  })

  it('a question the map does not answer is told what she may ask, and never reaches the model', async () => {
    const r = await asked(VALERIA, 'Write me a poem about suppliers')
    expect(r.body.data.answer.kind).toBe('TEXT')
    expect(r.body.data.answer.says).toMatch(/^I read Latin America only\./)
  })
})

describe('Marcus Hollins asks about Dayton', () => {
  it('his greeting keeps his own cards, carries By region’s count on the mark, and says Maria Lee cannot start without an I-9', async () => {
    const g = await greeting(MARCUS)
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    expect(g.body.data.answer.kind).toBe('NEEDS')
    const p = await page(MARCUS)
    const says: string = g.body.data.answer.says
    expect(says.startsWith('Two things need you: ')).toBe(true)
    expect(p.body.data.greeting.total).toBe(2)
    expect(says).toContain(`${onHold.name} cannot start without an I-9`)
    expect(says).toContain('Get the I-9 on file, then start.')
    const mark = await greeting(MARCUS, '?only=owed')
    expect(mark.body.data.total).toBe(p.body.data.greeting.total)
    expect(g.body.data.chips).toContain(PLANT_LIMIT_CHIP)
    expect(g.body.data.chips.length).toBeLessThanOrEqual(4)
  })

  it('who is missing an I-9 at his plant is answered from the start on hold his By region page shows, never refused', async () => {
    const r = await asked(MARCUS, 'Who is missing an I-9?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.answer.says).toBe(`${onHold.name} cannot start without an I-9. Get it on file, then start. Checked just now.`)
  })

  it('which sites have weeks waiting: Dayton’s contractors and weeks as the seed holds them, and no other site', async () => {
    const r = await asked(MARCUS, 'Which sites have weeks waiting?')
    const a = r.body.data.answer
    expect(a.says).toBe(`${dayton.plant}: ${dayton.contractors} contractors on site. ${dayton.weeksToSign} weeks wait to be signed.`)
    expect(a.table.rows.map((row: any) => row.cells)).toEqual([[dayton.plant, dayton.manager, String(dayton.contractors), String(dayton.weeksToSign)]])
  })

  it('who is near the time limit at his plant: his own contractors, the nearest as many days off as the seed says', async () => {
    const r = await asked(MARCUS, PLANT_LIMIT_CHIP)
    const a = r.body.data.answer
    const nearest = onSite.find((c) => c.plant.key === 'dayton' && c.nearest)!
    expect(a.says).toMatch(new RegExp(` of your ${dayton.contractors} contractors at ${dayton.plant} (is|are) within 90 days of the time limit\\. `))
    expect(a.says).toContain(`${nearest.name} is nearest, in ${dayton.nearestLimitDays} days.`)
    const atDayton = new Set(onSite.filter((c) => c.plant.key === 'dayton').map((c) => c.name))
    for (const row of a.table.rows) expect(atDayton.has(row.cells[0]), row.cells[0]).toBe(true)
  })

  it('asking about Fresno is refused in one sentence naming Dayton', async () => {
    const r = await asked(MARCUS, 'Who is near the time limit at Fresno?')
    expect(r.body.data.answer.says).toBe('Your seat reads Dayton, Ohio only, so Fresno, California is not on your page.')
  })
})

describe('the CFO and the head of operations read the rollup', () => {
  it('the CFO’s greeting names the invoice receipts the seed holds with the money over the signed hours (several by count and the site holding the most), Maria Lee’s start waiting on an I-9 and the weeks, then Belfast’s nearest time limit by name; the mark is its three', async () => {
    const g = await greeting(CFO)
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const p = await page(CFO)
    const says: string = g.body.data.answer.says
    expect(says.startsWith('Three things need you: ')).toBe(true)
    // The money over is the seed's own: each held receipt's hours past the
    // signed hours at its site's rate, said through By region's formatter.
    expect(heldSeed.length).toBeGreaterThan(0)
    expect(says).toContain(await heldPhraseFromSeed(p, false))
    expect(says).toContain(`${onHold.name}’s start at Dayton waits on an I-9`)
    expect(says).toContain(`${sum(CORVANE_PLANTS, 'weeksToSign')} weeks wait to be signed at ${CORVANE_PLANTS.filter((x) => x.weeksToSign > 0).length} sites`)
    const belfast = onSite.find((c) => c.plant.key === 'belfast' && c.nearest)!
    const belfastPlant = CORVANE_PLANTS.find((x) => x.key === 'belfast')!
    expect(says.endsWith(`${belfast.name} in Belfast reaches the time limit in ${belfastPlant.nearestLimitDays} days.`)).toBe(true)
    const mark = await greeting(CFO, '?only=owed')
    expect(mark.body.data.total).toBe(3)
    expect(mark.body.data.total).toBe(p.body.data.greeting.total)
    expect(g.body.data.chips).toEqual([...PROGRAM_CHIPS])
  })

  it('the head of operations is greeted with the weeks across the plants first and who is within 30 days of the time limit, not the CFO’s line', async () => {
    const g = await greeting(OPS)
    const c = await greeting(CFO)
    const p = await page(OPS)
    const says: string = g.body.data.answer.says
    expect(says).not.toBe(c.body.data.answer.says)
    expect(says).toMatch(new RegExp(`^Three things need you: ${sum(CORVANE_PLANTS, 'weeksToSign')} weeks wait to be signed at ${CORVANE_PLANTS.filter((x) => x.weeksToSign > 0).length} sites; `))
    const belfastDays = CORVANE_PLANTS.find((x) => x.key === 'belfast')!.nearestLimitDays
    expect(says).toMatch(new RegExp(`within 30 days of the time limit, the nearest .+ in Belfast, in ${belfastDays} days\\.$`))
    expect((await greeting(OPS, '?only=owed')).body.data.total).toBe(p.body.data.greeting.total)
  })

  it('the AP clerk, who pays invoice receipts, keeps her own queue', async () => {
    const g = await greeting(AP)
    expect(g.status).toBe(200)
    expect(g.body.data.chips).not.toEqual([...PROGRAM_CHIPS])
  })

  it('what did we spend this month, by region: one row per region, and the total equals the sum of the regions and the seed', async () => {
    const r = await asked(CFO, 'What did we spend this month, by region?')
    const a = r.body.data.answer
    expect(a.kind).toBe('LIST')
    expect(a.says).toContain('It is an estimate from current rates, 160 hours a month, not signed time.')
    const rows = a.table.rows.map((row: any) => row.cells)
    const total = rows.at(-1)
    expect(total[0]).toBe('All regions')
    const regions = rows.slice(0, -1)
    expect(regions).toHaveLength(6)
    expect(Number(total[1])).toBe(regions.reduce((n: number, c: string[]) => n + Number(c[1]), 0))
    expect(Number(total[1])).toBe(sum(CORVANE_PLANTS, 'contractors'))
    expect(regions.find((c: string[]) => c[0] === 'Latin America')[1]).toBe(String(sum(latam, 'contractors')))
  })

  it('what is held and why: the invoice receipts the seed holds, said as the greeting says them, and the Dayton start waiting on an I-9', async () => {
    const r = await asked(CFO, 'What is held and why?')
    const says: string = r.body.data.answer.says
    expect(says).toContain(await heldPhraseFromSeed(await page(CFO), true))
    expect(says).toMatch(/start at Dayton waits on an I-9/)
  })

  it('which invoice receipts are held: the CFO hears the count and money the seed holds, and where several sites hold them, each is a row beside the chat', async () => {
    const r = await asked(CFO, 'Which invoice receipts are held?')
    const a = r.body.data.answer
    expect(a.says).toContain(await heldPhraseFromSeed(await page(CFO), true))
    const sites = new Set(heldSeed.map((x) => x.site.plant))
    if (sites.size > 1) expect(a.table.rows.map((row: any) => row.cells[0]).sort()).toEqual([...sites].sort())
    else expect(a.table).toBeUndefined()
  })

  it('who is past the time limit: nobody, and the nearest is Belfast’s, as many days off as the seed says', async () => {
    const r = await asked(CFO, 'Who is past the time limit?')
    const belfast = onSite.find((c) => c.plant.key === 'belfast' && c.nearest)!
    const belfastPlant = CORVANE_PLANTS.find((x) => x.key === 'belfast')!
    expect(r.body.data.answer.says).toBe(`Nobody at Corvane Packaging is past the time limit. The nearest is ${belfast.name} at Belfast, in ${belfastPlant.nearestLimitDays} days. Counted across every supplier.`)
  })

  it('the CFO’s spend by supplier still goes to the supplier answer, not the map', async () => {
    const r = await asked(CFO, 'What did we spend by supplier this month?')
    expect(r.status).toBe(200)
    expect(r.body.data.answer.table?.caption ?? '').not.toBe('Spend this month, by region')
  })
})

describe('the thread column beside Valeria Montes’s chat', () => {
  it('a regional manager’s thread list opens, and holds no thread from a plant outside her region', async () => {
    const valeria = await prisma.person.findFirstOrThrow({ where: { primaryEmail: VALERIA }, select: { id: true, name: true } })
    const marcus = await prisma.person.findFirstOrThrow({ where: { primaryEmail: MARCUS }, select: { id: true, name: true } })
    const corvane = await prisma.context.findFirstOrThrow({ where: { personId: valeria.id, revokedAt: null, companyId: { not: null } }, select: { companyId: true } })
    const companyId = corvane.companyId!
    const jobAt = (plant: { key: string }) => prisma.requirement.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: { companyId: companyId, orgUnitId: `cv_unit_site_${plant.key}` }, select: { id: true },
    })
    const latamJob = await jobAt(latam[0])
    const usJob = await jobAt(us[0])
    const on = (...ps: { id: string; name: string }[]) => ps.map((p) => ({ personId: p.id, name: p.name, companyId: companyId, joinedAt: new Date().toISOString() }))
    const thread = (title: string, topic: string, topicId: string | null, participants: object) =>
      prisma.conversation.create({ data: { companyId: companyId, topic, topicId, title, participants }, select: { id: true } })
    const inLatam = await thread('Regions test: Latin America job', 'REQUIREMENT', latamJob.id, on(valeria))
    const inUs = await thread('Regions test: United States job', 'REQUIREMENT', usJob.id, on(valeria, marcus))
    const notHers = await thread('Regions test: not hers', 'REQUIREMENT', latamJob.id, on(marcus))
    const ownNote = await thread('Regions test: her own note', 'GENERAL', null, on(valeria))

    as(VALERIA)
    const r = await json(await threadList(req('GET', '/api/conversations?limit=50') as NextRequest))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const ids = r.body.data.conversations.map((c: any) => c.id)
    expect(ids).toContain(inLatam.id)
    expect(ids).toContain(ownNote.id)
    expect(ids).not.toContain(inUs.id)
    expect(ids).not.toContain(notHers.id)
    noUnitedStates(JSON.stringify(r.body.data))

    // Marcus, on Dayton, is no region seat: his list is unchanged by this.
    as(MARCUS)
    const m = await json(await threadList(req('GET', '/api/conversations?limit=50') as NextRequest))
    expect(m.status).toBe(200)
    expect(m.body.data.conversations.map((c: any) => c.id)).toContain(inUs.id)
  })

  it('a regional manager opens her own thread and reads its messages, and a thread outside her region is refused in a sentence', async () => {
    const valeria = await prisma.person.findFirstOrThrow({ where: { primaryEmail: VALERIA }, select: { id: true, name: true } })
    const marcus = await prisma.person.findFirstOrThrow({ where: { primaryEmail: MARCUS }, select: { id: true, name: true } })
    const companyId = (await prisma.context.findFirstOrThrow({ where: { personId: valeria.id, revokedAt: null, companyId: { not: null } }, select: { companyId: true } })).companyId!
    const jobAt = (plant: { key: string }) => prisma.requirement.findFirstOrThrow({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], where: { companyId, orgUnitId: `cv_unit_site_${plant.key}` }, select: { id: true } })
    const on = (...ps: { id: string; name: string }[]) => ps.map((p) => ({ personId: p.id, name: p.name, companyId, joinedAt: new Date().toISOString() }))
    const thread = async (title: string, topicId: string, participants: object, body: string) => {
      const t = await prisma.conversation.create({ data: { companyId, topic: 'REQUIREMENT', topicId, title, participants }, select: { id: true } })
      await prisma.message.create({ data: { conversationId: t.id, authorId: valeria.id, body, type: 'TEXT' } })
      return t
    }
    const mine = await thread('Regions test: read Latin America', (await jobAt(latam[0])).id, on(valeria), 'Monterrey needs two more controls engineers.')
    const away = await thread('Regions test: read United States', (await jobAt(us[0])).id, on(valeria, marcus), 'Dayton note.')
    const notOn = await thread('Regions test: read not hers', (await jobAt(latam[0])).id, on(marcus), 'Not hers.')

    as(VALERIA)
    const r = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${mine.id}`) as NextRequest))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.messages.map((m: any) => m.body)).toEqual(['Monterrey needs two more controls engineers.'])

    const w = await json(await writeThread(req('POST', '/api/conversations/messages', { conversationId: mine.id, body: 'Approved, send the job.' }) as NextRequest))
    expect(w.status, JSON.stringify(w.body)).toBe(201)

    const x = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${away.id}`) as NextRequest))
    expect(x.status).toBe(403)
    expect(x.body.error.message).toBe('That conversation is about a site outside Latin America, and your seat reads Latin America only. Open By region on Today for Latin America.')
    expect(JSON.stringify(x.body)).not.toContain('Dayton note.')

    const xw = await json(await writeThread(req('POST', '/api/conversations/messages', { conversationId: away.id, body: 'hello' }) as NextRequest))
    expect(xw.status).toBe(403)

    const n = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${notOn.id}`) as NextRequest))
    expect(n.status).toBe(403)
    expect(n.body.error.message).toBe('You are not on that conversation, and your seat reads only your own conversations in Latin America.')
  })
})
