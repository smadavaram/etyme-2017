/**
 * The doors' maps, read against the seed.
 *
 * The founder said "Build it" on 2026-10-28 to the four doors' maps
 * (CLAUDE.md, "The setup checklist and the four doors' maps are built"):
 * each door draws the home page's map in its own party's roles, every
 * name and figure from the seed. All four are built: the MSPs' followed on
 * the same day, once Aptiva's three missing seats were seeded.
 *
 * So this file does for the doors what `story-panel-map.test.ts` does for
 * the home page: it works each figure out again from the seed's exports,
 * reads every value the maps copy from a seed file back out of that file,
 * and holds that the live figures — the ones the seed computes from the
 * database — are read, bounded, and never guessed.
 */
import { describe, it, expect, vi } from 'vitest'

// The maps' demo links route after a seat is taken; a static render has no router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }))
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WORLD_CLIENTS } from '@/lib/seed-world'
import { PROGRAMMES, week } from '@/lib/seed-programmes'
import { OFFERED, NORTHBEND_JOB } from '@/lib/seed-bench-matching'
import { MOVE_DESKS } from '@/lib/seed-internal-moves'
import { RATE_CHANGE_PERSON, RATE_CHANGE_RATES, rateChangeDates } from '@/lib/seed-rate-change'
import { karthikWindow, nurseWeek } from '@/lib/seed-doors'
import { seedToday } from '@/lib/seed-days'
import { HOURS_PER_MONTH } from '@/lib/program-spend'
import { daysFor, daysOnSite, monthsOf } from '@/lib/tenure-days'
import { SECTOR_SUPPLIERS, sectorStart } from '@/lib/seed-sector-suppliers'
import { reservedAddress } from '@/lib/demo-session'
import { DESKS, DESK_ROLES } from '@/lib/demo-desks'
import { check, verdict, namedCompanies, priceClaims, gridsWithoutBreakpoint } from '@/lib/positioning'
import { countWords, MOST_WORDS } from '@/lib/public-site/skeleton-words'
import { PartyPageView } from '@/lib/public-site/party-page'
import { everyDoorView, copyOfPartyPage } from '@/lib/public-site/parties'
import type { MapView, RoleMap } from '@/lib/public-site/corvane-map'
import type { FirmTuesday } from '@/lib/money/firm-today'
import {
  teleworldMap, brightmoorMap, techpepleMap, helenaMap, byrneMap, aptivaMap, doorMap, doorSeatHref, doorSeatOf,
  copyOfDoorMap, defaultCopyOfDoorMap, DOOR_MAPS, DOOR_SEATS, ON_THE_DEMO, READ_LIVE,
} from '@/lib/public-site/door-maps'
import {
  doorFacts, firmLive, programLive, mayReadLive, NO_FACTS, LIVE_READS, PROGRAM_READS, SEEDED_SLUGS, FACTS_WAIT_MS,
  type DoorFacts, type FactsReader, type CompanySeen, type ProgramInvoice,
} from '@/lib/public-site/door-map-facts'
import * as SEED from '@/lib/public-site/door-map-seed'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const WORLD = read('src/lib/seed-world.ts')
const DOORS = read('src/lib/seed-doors.ts')
const MOVES = read('src/lib/seed-internal-moves.ts')
const RATE = read('src/lib/seed-rate-change.ts')
/** 13200 → "13_200", the way the seed writes a figure. */
const us = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_')
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const view = (m: RoleMap, key: string): MapView<string, never> => m.views.find((v) => v.key === key)! as MapView<string, never>
const stat = (v: { stats: { label: string; value: string; sub?: string }[] }, label: string) => {
  const s = v.stats.find((x) => x.label === label)
  expect(s, `${label} is a figure`).toBeDefined()
  return s!
}
const cells = (v: { rows: { t: string; sub?: string }[][] }) => v.rows.flatMap((r) => r.map((c) => c.t))

const NORTHBEND = PROGRAMMES.find((p) => p.client === 'nike')!
const nameOf = (slug: string) => WORLD_CLIENTS.find((c) => c.slug === slug)!.name
const HELENA = NORTHBEND.placements.find((x) => x.person === 'Helena Marsh' && x.state === 'IN_PROGRESS')!
const OMAR = NORTHBEND.placements.find((x) => x.person === 'Omar Haddad' && x.state === 'IN_PROGRESS')!

/** A firm's Today read, as `firmTuesday` answers it, for the live figures. */
function tuesday(o: {
  people: { name: string; at: string; rate: number }[]
  weeks: { name: string; at: string; hours: number; amount: number | null; draft?: boolean }[]
  currency?: string
}): FirmTuesday {
  const currency = o.currency ?? 'USD'
  const sum = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, b) => a + (b as number), 0))
  return {
    companyId: 'c', companyName: 'Firm', asOf: '2026-10-28',
    billingThisMonth: {
      people: o.people.map((p, i) => ({
        sellContractId: `s${i}`, personId: `p${i}`, personName: p.name, billedToName: p.at, atName: p.at, currency,
        rateMinor: p.rate, hoursPerMonth: 160, hoursStated: false, monthlyMinor: p.rate * 160, unpriced: null, says: null,
      })),
      totals: o.people.length ? [{ currency, amountMinor: sum(o.people.map((p) => p.rate * 160)), pricedMinor: 0, count: o.people.length, unpriced: 0 }] : [],
      basis: '',
      overtimeNotPaid: { count: 0, says: null } as never,
    },
    signedNotBilled: {
      weeks: o.weeks.map((w, i) => ({
        timesheetId: `t${i}`, sellContractId: 's', personId: 'p', personName: w.name, billedToName: w.at, atName: w.at,
        week: { start: '', end: '', says: '' }, signedHours: w.hours, billedHours: w.hours, currency,
        amountMinor: w.amount, unpriced: w.amount === null ? 'held' : null, says: null,
        draft: w.draft ? { invoiceId: 'i', number: 'D-1' } : null,
      })),
      count: o.weeks.length,
      onDrafts: o.weeks.filter((w) => w.draft).length,
      totals: o.weeks.length ? [{ currency, amountMinor: sum(o.weeks.map((w) => w.amount)), pricedMinor: 0, count: o.weeks.length, unpriced: 0 }] : [],
    },
  }
}

/** The fullest live read a door may meet: four people's weeks and an invoice from below. */
const FULL_BRIGHTMOOR: DoorFacts = {
  firm: firmLive(tuesday({
    people: [{ name: 'Omar Haddad', at: 'Northbend Athletic', rate: 13_200 }, { name: 'Rosa Delgado', at: 'Northbend Athletic', rate: 11_200 }, { name: 'A Third Person', at: 'Another Client', rate: 12_900 }],
    weeks: [
      ...Array.from({ length: 30 }, () => ({ name: 'Rosa Delgado', at: 'Northbend Athletic', hours: 40, amount: 448_000 })),
      { name: 'A Third Person', at: 'Another Client', hours: 40, amount: 516_000, draft: true },
      { name: 'A Fourth Person', at: 'Another Client', hours: 40, amount: 516_000 },
      { name: 'A Fifth Person', at: 'Another Client', hours: 40, amount: 516_000 },
    ],
  })),
  receipt: { number: SEED.BILLS_FROM_BELOW.techpeple.number, from: 'Techpeple', totalMinor: 1_888_000, dueInDays: 25 },
}
const FULL_TELEWORLD: DoorFacts = {
  firm: firmLive(tuesday({
    people: [{ name: 'Felix Brenner', at: 'Northbend Athletic', rate: 13_200 }],
    weeks: [
      { name: 'A Person', at: 'Corveldt Aerospace', hours: 40, amount: 568_000 },
      { name: 'B Person', at: 'Corveldt Aerospace', hours: 40, amount: 568_000 },
      { name: 'C Person', at: 'Harlow Health', hours: 40, amount: 568_000 },
      { name: 'D Person', at: 'Harlow Health', hours: 40, amount: 568_000 },
    ],
  })),
  receipt: { number: SEED.BILLS_FROM_BELOW.nimbus.number, from: 'Nimbus Talent', totalMinor: 464_000, dueInDays: 25 },
}

/** One hours line of a receipt, as the three-way check returns it. */
const line = (person: string, billed: number, signed: number | null, rate: number) => ({
  lineId: person, kind: 'HOURS' as const, personId: null, personName: person, jobTitle: null, requirementId: null,
  periodStart: null, periodEnd: null, hoursBilled: billed, hoursSigned: signed, rateCents: rate, contractRateCents: rate,
  amountCents: billed * rate,
})
const receiptOf = (o: { number: string; status: string; supplier: string; lines: ReturnType<typeof line>[]; matched?: boolean; currency?: string }): ProgramInvoice => ({
  number: o.number, status: o.status, currency: o.currency ?? 'USD', supplier: o.supplier,
  totalCents: o.lines.reduce((a, l) => a + l.amountCents, 0),
  match: { matched: o.matched ?? true, summary: o.matched === false ? 'Bills 41.5 h; 40 h were signed' : 'Matches', voidedWaiver: null, lines: o.lines },
})
/** Cavanaugh's receipts as the drawing had them: Wrenfield in the check, Vertex in the check, Halcyon paid. */
const PROGRAM_INVOICES: ProgramInvoice[] = [
  receiptOf({ number: 'IN-W-1', status: 'SUBMITTED', supplier: 'Wrenfield Technical', lines: [line('Elsa Thornquist', 40, 40, 9_600)] }),
  receiptOf({ number: 'IN-V-1', status: 'SUBMITTED', supplier: 'Vertex Global', lines: [line('Tomasz Nowak', 40, 40, 12_800), line('Tomasz Nowak', 40, 40, 12_800), line('Tomasz Nowak', 40, 40, 12_800)] }),
  receiptOf({ number: 'IN-H-1', status: 'PAID', supplier: 'Halcyon Talent', lines: [line('Aisha Bello', 40, 40, 11_900), line('Aisha Bello', 40, 40, 11_900)] }),
]
const FULL_PROGRAM: DoorFacts = { ...NO_FACTS, program: programLive(PROGRAM_INVOICES) }

// ── The seed's values the maps copy, read back out of the seed ────────

describe('Every value a door map copies from the seed is the value the seed file writes', () => {

  it('Teleworld’s three running lines are the seed’s: Felix Brenner off in 18 days and free then, Amara Nwosu off in 25 and kept until 45, Deepa Varma on Harlow Health for 240', () => {
    for (const l of SEED.TELEWORLD_LINES) {
      const release = l.release ? `, release: \\{ keepUntil: ${l.release.keepUntil} \\}` : ','
      const re = new RegExp(
        `person: '${esc(l.person)}', client: '${l.client}', site: \\{[^}]*city: '${esc(l.city)}'[^}]*\\},\\s*` +
        `role: '${esc(l.job)}'[^\\n]*\\n\\s*unit: \\w+, bill: ${us(l.bill)}, pay: ${us(l.pay)}, start: ${l.start}, end: ${l.end}${release}`,
      )
      expect(MOVES, l.person).toMatch(re)
    }
    expect((MOVES.match(/^\s+person: '/gm) ?? []).length, 'the map reads every line the seed writes').toBe(SEED.TELEWORLD_LINES.length)
  })

  it('the firms and the people in their seats are the seed’s: Teleworld’s owner, Brightmoor’s four, Techpeple’s owner and recruiter, Teleworld’s AP & Payroll clerk and its own four people', () => {
    for (const [slug, name] of Object.entries(SEED.FIRM_NAMES)) expect(WORLD, slug).toMatch(new RegExp(`slug: '${slug}',\\s+name: '${esc(name)}',`))
    for (const [slug, who] of Object.entries(SEED.FIRST_SEAT)) expect(WORLD, slug).toMatch(new RegExp(`slug: '${slug}',\\s+name: '[^']+',[^}]*who: '${esc(who)}' \\}`))
    const team = WORLD.slice(WORLD.indexOf('const SUPPLIER_TEAM'), WORLD.indexOf('const BENCH_FIRM_TEAM'))
    for (const [desk, name] of Object.entries(SEED.BRIGHTMOOR_TEAM)) expect(team, desk).toMatch(new RegExp(`desk: '${desk}',\\s+role: '[^']+',\\s+name: '${esc(name)}'`))
    const bench = WORLD.slice(WORLD.indexOf('const BENCH_FIRM_TEAM'), WORLD.indexOf('let supplierDesks'))
    expect(bench).toMatch(new RegExp(`desk: 'recruiter',\\s+role: 'Recruiter',\\s+name: '${SEED.TECHPEPLE_RECRUITER}'`))
    expect(WORLD).toMatch(new RegExp(`firm: 'teleworld',\\s+clerk: '${SEED.TELEWORLD_PAYROLL}'`))
    const staff = WORLD.slice(WORLD.indexOf("{ slug: 'teleworld', team: ["), WORLD.indexOf("{ slug: 'sundara', team: ["))
    expect([...staff.matchAll(/name: '([^']+)'/g)].map((m) => m[1])).toEqual([...SEED.TELEWORLD_STAFF])
  })

  it('Karthik Menon’s ended line, Corveldt’s open job, Meera Balakrishnan’s second round and Ifeoma Balogun’s screen and I-9 are the seed’s', () => {
    const k = SEED.KARTHIK_LINE
    expect(DOORS).toMatch(new RegExp(
      `personId: karthik\\.id,\\s+sellerSlug: 'teleworld',\\s+clientSlug: '${k.client}',[\\s\\S]*?role: '${k.job}',\\s+` +
      `skills: \\[${k.skills.map((x) => `'${esc(x)}'`).join(', ')}\\],[\\s\\S]*?billRate: ${us(k.bill)},`,
    ))
    const j = SEED.CORVELDT_JOB
    expect(WORLD).toMatch(new RegExp(`title: '${esc(j.title)}'`))
    expect(WORLD).toMatch(new RegExp(`payMin: ${us(j.payMin)}, payMax: slug === 'teleworld' \\? ${us(j.payMax)} :`))
    expect(WORLD).toMatch(new RegExp(`role: '${esc(j.title)}'[^\\n]*\\n\\s*loc: '${j.city}, KS'`))
    const meera = WORLD.slice(WORLD.indexOf(`name: '${SEED.MEERA.name}'`))
    expect(WORLD).toMatch(new RegExp(`client: '${j.client}', prime: 'teleworld', bench: '${SEED.MEERA.bench}',\\s+name: '${SEED.MEERA.name}'`))
    expect(meera.slice(0, meera.indexOf('name:', 10))).toMatch(new RegExp(`round: ${SEED.MEERA.round}, stage: '\\w+', mode: '\\w+', state: 'CONFIRMED',\\s+inDays: ${SEED.MEERA.inDays},`))
    const i = SEED.IFEOMA
    expect(WORLD).toMatch(new RegExp(`role: '${i.job}'[\\s\\S]{0,160}prime: '${i.prime}', bench: 'techpeple',\\s+name: '${i.name}'`))
    const ifeoma = WORLD.slice(WORLD.indexOf(`name: '${i.name}'`))
    expect(ifeoma.slice(0, ifeoma.indexOf('name:', 10))).toMatch(new RegExp(`round: 1, stage: 'SCREEN', mode: 'PHONE', state: 'CONFIRMED',\\s+inDays: ${i.screenInDays},`))
    expect(DOORS).toMatch(new RegExp(`companySlug: 'techpeple',\\s+name: 'I-9[^']*',[\\s\\S]{0,120}personId: ifeoma\\.id,\\s+sentDaysAgo: ${i.i9AskedDaysAgo},`))
  })

  it('Rosa Delgado’s job, Marisol Quintero’s ask onto Brightmoor’s bench and the two invoices from below are the seed’s', () => {
    expect(RATE).toMatch(new RegExp(`const ROLE = \\{\\s+title: '${SEED.ROSA_JOB}',`))
    expect(DOORS).toContain(`person('${SEED.MARISOL.name}')`)
    expect(DOORS).toMatch(new RegExp(`companyId: co\\('brightmoor'\\)\\.id, tier: 'MARKETING',\\s+\\.\\.\\.\\(invitation\\(day\\(-${SEED.MARISOL.invitedDaysAgo}\\)\\)`))
    for (const b of Object.values(SEED.BILLS_FROM_BELOW)) expect(DOORS).toContain(`billFromBelow('${b.payer}', '${b.vendor}', '${b.number}')`)
    const writer = DOORS.slice(DOORS.indexOf('async function billFromBelow'), DOORS.indexOf('let people = 0'))
    for (const b of Object.values(SEED.BILLS_FROM_BELOW)) expect(writer).toContain(`dueAt: day(${b.dueIn}),`)
  })

  it('Colleen Byrne’s line, her four weeks and her license are the seed’s: $92 to Halcyon Talent, 42 days in and 49 to go, three weeks accepted and the newest signed only, RN 154-882 ending in 24 days', () => {
    const b = SEED.BYRNE
    expect(DOORS).toContain(`name: '${b.corp}'`)
    expect(DOORS).toMatch(new RegExp(`personId: nurse\\.id,\\s+sellerSlug: '${b.above}',\\s+clientSlug: '${b.client}',[\\s\\S]*?role: '${b.job}',[\\s\\S]*?loc: '${b.city}, WI',`))
    const line = DOORS.slice(DOORS.indexOf('byrneLine = await db.sellContract.create'))
    expect(line).toMatch(new RegExp(`billRate: ${us(b.bill)},[\\s\\S]*?startDate: day\\(${b.start}\\),\\s+endDate: day\\(${b.end}\\),`))
    expect(DOORS).toMatch(new RegExp(`provider: 'Wisconsin Board of Nursing',[\\s\\S]*?expiresAt: day\\(${b.license.endsIn}\\),[\\s\\S]*?license: '${b.license.number}', state: 'WI'`))
    expect(b.license.state).toBe('Wisconsin')
    expect(DOORS).toMatch(/\[nurseWeek\(4\), 'SIGNED'\],\s+\[nurseWeek\(3\), 'SIGNED'\],\s+\[nurseWeek\(2\), 'SIGNED'\],\s+\[nurseWeek\(1\), 'CLIENT_ONLY'\],/)
    expect([...b.weeksBack]).toEqual([4, 3, 2, 1])
  })

  it('Aptiva Workforce’s four people are the seed’s: Rashida Coleman in its first seat, Delphine Castellanos its supplier manager, Tomasz Wierzbicki its coordinator and Hollis Banerjee its AP clerk, every one at a reserved address', () => {
    expect(SEED.FIRST_SEAT.aptiva).toBe('Rashida Coleman')
    const team = WORLD.slice(WORLD.indexOf('const APTIVA_TEAM'), WORLD.indexOf('// ── A program office in a seat'))
    const roles = { suppliers: 'Supplier Manager', coordinator: 'Coordinator', ap: 'AP Clerk' }
    for (const [desk, name] of Object.entries(SEED.APTIVA_TEAM)) {
      expect(team, desk).toMatch(new RegExp(`desk: '${desk}',\\s+role: '${roles[desk as keyof typeof roles]}',\\s+name: '${esc(name)}'`))
    }
    expect((team.match(/desk: '/g) ?? []).length, 'the map reads every Aptiva seat the seed writes').toBe(Object.keys(SEED.APTIVA_TEAM).length)
    // Every seat the seed writes at Aptiva and at Cavanaugh is at the demo's own domain, which nobody can register.
    expect(WORLD).toContain("const DOMAIN = 'demo.etyme.local'")
    expect(WORLD).toContain('const email = `${PREFIX}aptiva-${d.desk}@${DOMAIN}`')
    for (const desk of [...Object.keys(SEED.APTIVA_TEAM), 'programme', 'hiring', 'ap']) {
      expect(reservedAddress(`world-aptiva-${desk}@demo.etyme.local`)).toBe(true)
      expect(reservedAddress(`world-corning-${desk}@demo.etyme.local`)).toBe(true)
    }
  })

  it('no figure or name is typed into the door maps’ code: the seed’s values sit in door-map-seed, and door-maps holds none', () => {
    const code = read('src/lib/public-site/door-maps.ts').replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const page = read('src/lib/public-site/party-page.tsx')
    for (const figure of [
      '40,960', '3,600', '3,312', '13_200', '13200', '$132', '$118', '$92', '154-882', 'NT-2026', 'CE-2026',
      'Felix', 'Amara', 'Deepa', 'Karthik', 'Rosa', 'Omar', 'Helena Marsh', 'Colleen', 'Marisol', 'Ifeoma', 'Meera',
      'Jenna', 'Marisa', 'Imelda', 'Desmond', 'Bhavesh', 'Linnea', 'Ingrid', 'Rahul', 'Farah', 'Ravi',
      'Tualatin', 'San Jose', 'Corveldt', 'Northbend', 'Nimbus', 'Brightmoor Staffing', 'Computer Systems', 'Halcyon', 'Wisconsin',
      'Aptiva', 'Cavanaugh', 'Rashida', 'Delphine', 'Wierzbicki', 'Hollis', 'Samuel', 'Derek', 'Ashby', 'Yuki', 'Priyanka',
      'Vertex', 'Arcadia', 'Wrenfield', 'Quarrystone', 'Elsa', 'Wendell', '84,000', '$128', 'world-corning',
    ]) {
      expect(code.includes(figure), `${figure} is typed into door-maps.ts`).toBe(false)
      expect(page.includes(figure), `${figure} is typed into party-page.tsx`).toBe(false)
    }
  })
})

// ── Teleworld Solutions: the integrators' door ────────────────────────

describe('The integrators’ map is Teleworld Solutions’ own book, read as its four roles', () => {
  const M = teleworldMap(NO_FACTS)
  const felix = SEED.TELEWORLD_LINES[0]
  const amara = SEED.TELEWORLD_LINES[1]
  const deepa = SEED.TELEWORLD_LINES[2]

  it('the bar counts Teleworld’s 4 own people, 3 on client sites and 1 between projects', () => {
    expect(M.bar).toBe('Teleworld Solutions · a sample integrator · 4 people of its own · 3 on client sites · 1 between projects')
  })

  it('the four tabs are the two delivery managers by city, HR and AP & Payroll, each seated by the seed’s own name', () => {
    expect(M.views.map((v) => v.tab)).toEqual(['Delivery manager, Tualatin', 'Delivery manager, San Jose', 'HR', 'AP & Payroll'])
    expect(view(M, 'tualatin').signed).toContain(MOVE_DESKS.portland.name)
    expect(view(M, 'sanjose').signed).toContain(MOVE_DESKS.sanJose.name)
    expect(view(M, 'hr').signed).toContain(MOVE_DESKS.hr.name)
    expect(view(M, 'payroll').signed).toContain(SEED.TELEWORLD_PAYROLL)
  })

  it('Ingrid Solberg reads Felix Brenner off Northbend Athletic in 18 days and free then, Amara Nwosu off in 25 and kept until 45, and $40,960 a month: $132 and $124 an hour at 160 hours', () => {
    const v = view(M, 'tualatin')
    expect(v.headline).toBe(
      `${felix.person} comes off ${nameOf('nike')} in 18 days and is free from then. ` +
      `${amara.person} comes off in 25 days, and you keep her until 45 days from today.`,
    )
    expect(HOURS_PER_MONTH).toBe(160)
    expect((felix.bill + amara.bill) * 160).toBe(4_096_000)
    expect(stat(v, 'Billing this month').value).toBe('$40,960')
    expect(stat(v, 'Billing this month').sub).toBe('$132 and $124 an hour')
    expect(cells(v)).toEqual(expect.arrayContaining(['$132', '$86', '$124', '$81', 'in 18 days', 'in 25 days']))
  })

  it('Rahul Deshpande reads Karthik Menon free now, Felix Brenner free in 18 days, Corveldt Aerospace’s DO-178C job at $130–$145 and Meera Balakrishnan’s second round in 2 days', () => {
    const v = view(M, 'sanjose')
    expect(v.headline).toBe(
      'Karthik Menon is free now, and Felix Brenner is free in 18 days. ' +
      'Corveldt Aerospace’s DO-178C verification engineer job is open to Teleworld Solutions at $130–$145.',
    )
    expect(stat(v, 'Your people on site').sub).toBe(`${deepa.person}, ${nameOf(deepa.client)}`)
    expect(stat(v, 'Interview booked').sub).toBe('Meera Balakrishnan, round 2 in 2 days')
    expect(cells(v)).toEqual(expect.arrayContaining(['$136', 'now', 'DO-178C, LDRA, Embedded C']))
  })

  it('the days Karthik Menon has been between projects are counted from the end of his three months, by the seed’s own karthikWindow', () => {
    const today = seedToday()
    const { end } = karthikWindow(today)
    const days = Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - end.getTime()) / 86_400_000)
    expect(days).toBeGreaterThanOrEqual(10)
    expect(view(M, 'hr').headline).toContain(`between projects for ${days} days`)
    expect(view(M, 'payroll').headline).toContain('Karthik Menon’s 3 months at Corveldt Aerospace are paid.')
  })

  it('Farah Haddad is told of every move and approves none, and the map says nobody has been held or moved yet, because the seed holds nobody', () => {
    const v = view(M, 'hr')
    expect(v.signed).toContain('Approves none of them')
    expect(stat(v, 'Holds and moves').value).toBe('0')
    expect(MOVES).toContain('Nothing is held, confirmed or moved here')
    expect(cells(v)).toEqual(expect.arrayContaining([`on site, line ends in ${deepa.end} days`]))
  })
})

// ── Brightmoor Staffing and Techpeple: the suppliers' door ────────────

describe('The suppliers’ map is Brightmoor’s book on Prime vendor and Techpeple’s on Sub-vendor and Bench vendor', () => {
  const B = brightmoorMap(NO_FACTS)
  const T = techpepleMap(NO_FACTS)

  it('Brightmoor’s four tabs are its owner, account manager, accounts receivable and AP & Payroll, each the person the seed seats there', () => {
    expect(B.views.map((v) => v.tab)).toEqual(['Owner', 'Account manager', 'Accounts receivable', 'AP & Payroll'])
    expect(view(B, 'owner').signed).toMatch(/^Signed in as Jenna Okafor, owner\./)
    expect(view(B, 'account').signed).toMatch(/^Signed in as Marisa Delacroix, account manager\./)
    expect(view(B, 'ar').signed).toMatch(/^Signed in as Imelda Santoro, accounts receivable\./)
    expect(view(B, 'payroll').signed).toMatch(/^Signed in as Desmond Achebe, AP & Payroll\./)
  })

  it('the owner reads Omar Haddad’s 45-hour week waiting for Marcus Oyelaran, Rosa Delgado at $112 and $70, and the liability cover ending in 20 days', () => {
    const v = view(B, 'owner')
    expect(OMAR.overtimeWeekHours).toBe(45)
    expect(NORTHBEND.people.hiring).toBe('Marcus Oyelaran')
    expect(NORTHBEND.cover.brightmoor.gl).toBe(20)
    expect(v.headline).toBe('Omar Haddad’s 45-hour week waits for Marcus Oyelaran. Your liability cover ends in 20 days.')
    expect(OMAR.rates).toEqual([13_200, 9_600])
    expect(cells(v)).toEqual(expect.arrayContaining(['$132', '$96', '$112', '$70', String(monthsOf(OMAR.startedDaysAgo + 1))]))
    // The owner is never the one who sends a bill at a firm that has somebody else for it.
    expect(v.signed).toContain('Imelda Santoro or Rosalind Tay sends the bills.')
  })

  it('Rosa Delgado’s pay rose from $66 to $70 an hour, and no back pay is said to be owed, because the seed approves the rise before it takes effect', () => {
    const d = rateChangeDates()
    expect(d.approvedAt.getTime()).toBeLessThan(d.rise.getTime())
    expect([RATE_CHANGE_RATES.pay, RATE_CHANGE_RATES.raise]).toEqual([6_600, 7_000])
    const v = view(B, 'payroll')
    expect(v.headline).toContain(`${RATE_CHANGE_PERSON.name}’s pay rose from $66 to $70 an hour, approved before it took effect.`)
    for (const w of copyOfDoorMap(B)) expect(w, w).not.toMatch(/back pay (?:to approve|waits|is owed)/i)
  })

  it('the account manager reads Rajesh Iyer at $134 interviewing in 3 days with Marcus Oyelaran and Anita Shah, Jonas Whitaker on the bench at $122–$134, and Marisol Quintero asked and not yet answering', () => {
    const v = view(B, 'account')
    const rajesh = NORTHBEND.open.candidates.find((c) => c.from === 'brightmoor')!
    expect([rajesh.person, rajesh.rate, rajesh.round!.inDays]).toEqual(['Rajesh Iyer', 13_400, 3])
    expect(NORTHBEND_JOB).toBe(NORTHBEND.open.title)
    expect(v.headline).toBe(
      'Rajesh Iyer interviews for Northbend Athletic’s HCM integration lead job in 3 days, with Marcus Oyelaran and Anita Shah. ' +
      'Jonas Whitaker on your bench matches it too.',
    )
    const jonas = OFFERED.find((o) => o.firm === 'brightmoor')!
    expect(jonas.rate).toEqual([12_200, 13_400])
    expect(cells(v)).toEqual(expect.arrayContaining(['$134', '$122–$134', 'Marisol Quintero', 'no answer yet']))
  })

  it('accounts receivable reads Omar Haddad’s bill to Northbend Athletic as paid, as the seed writes it', () => {
    expect(OMAR.invoice).toBe('PAID')
    expect(view(B, 'ar').headline).toContain('Omar Haddad’s bill to Northbend Athletic is paid.')
  })

  it('Techpeple’s owner bills Computer Systems Inc $118 and pays Helena Marsh $90, and its recruiter’s seat shows no rate at all', () => {
    expect(HELENA.via).toEqual(['nike', 'computer-systems', 'techpeple'])
    expect(HELENA.rates).toEqual([14_500, 11_800, 9_000])
    const owner = view(T, 'owner')
    expect(stat(owner, 'You bill').value).toBe('$118')
    expect(stat(owner, 'You pay').value).toBe('$90')
    expect(owner.signed).toMatch(/^Signed in as Bhavesh Nair, owner\./)
    const recruiter = view(T, 'recruiter')
    expect(recruiter.signed).toContain('Never sees what anybody costs.')
    expect(copyOfDoorMap({ ...T, views: [recruiter] }).join(' ')).not.toMatch(/\$\d/)
  })

  it('Techpeple’s recruiter reads Ifeoma Balogun put forward to Computer Systems Inc, her phone screen in 3 days and her I-9 asked 6 days ago', () => {
    expect(view(T, 'recruiter').headline).toBe(
      'Ifeoma Balogun is put forward to Computer Systems Inc for an Epic Beaker analyst job. ' +
      'Her phone screen is in 3 days, and her I-9 was asked for 6 days ago.',
    )
  })
})

// ── Aptiva Workforce in Cavanaugh Glassworks' program: the MSPs' door ─

describe('The MSPs’ map is Cavanaugh Glassworks’ program, read from the seat it granted Aptiva Workforce, as Aptiva’s four roles', () => {
  const M = aptivaMap(NO_FACTS)
  const CAV = PROGRAMMES.find((p) => p.client === 'corning')!
  const QUARRY = SECTOR_SUPPLIERS.find((x) => x.client === 'corning')!
  const running = CAV.placements.filter((x) => x.state === 'IN_PROGRESS')
  const samuel = CAV.placements.find((x) => x.state === 'DRAFT')!

  it('the bar counts 5 contractors from 5 suppliers and 2 open jobs: three running lines, Elsa Thornquist on a purchase order from Wrenfield Technical, and Wendell Price from Quarrystone', () => {
    expect(running.map((x) => x.person)).toEqual(['Tomasz Nowak', 'Aisha Bello', 'Felix Brandt'])
    expect(CAV.direct!.person).toBe('Elsa Thornquist')
    expect(QUARRY.person.name).toBe('Wendell Price')
    expect(M.bar).toBe('Aptiva Workforce · a sample MSP · runs Cavanaugh Glassworks’ program · 5 contractors · 5 suppliers · 2 open jobs')
  })

  it('the four tabs are Aptiva’s program manager, supplier manager, coordinator and AP clerk, each the person the seed seats there, each in Cavanaugh’s program', () => {
    expect(M.views.map((v) => v.tab)).toEqual(['Program manager', 'Supplier manager', 'Coordinator', 'AP clerk'])
    expect(view(M, 'pm').signed).toMatch(/^Signed in as Rashida Coleman, program manager, Aptiva Workforce, in Cavanaugh Glassworks’ program\./)
    expect(view(M, 'suppliers').signed).toMatch(/^Signed in as Delphine Castellanos, supplier manager, Aptiva Workforce,/)
    expect(view(M, 'coordinator').signed).toMatch(/^Signed in as Tomasz Wierzbicki, coordinator, Aptiva Workforce,/)
    expect(view(M, 'ap').signed).toMatch(/^Signed in as Hollis Banerjee, AP clerk, Aptiva Workforce,/)
  })

  it('the program manager reads Samuel Adeyinka unable to start in 10 days without an I-9, 2 weeks waiting for Derek Halvorsen, and the fab expansion waiting for Robert Ashby', () => {
    expect([samuel.person, samuel.startedDaysAgo, samuel.papers]).toEqual(['Samuel Adeyinka', -10, 'NO_I9'])
    expect(running.reduce((a, x) => a + (x.weeks?.awaiting ?? 0), 0)).toBe(2)
    expect(QUARRY.lastWeekAwaiting).toBe(false)
    expect(WORLD_CLIENTS.find((c) => c.slug === 'corning')!.vp).toBe('Robert Ashby')
    expect(view(M, 'pm').headline).toBe(
      'Samuel Adeyinka cannot start in 10 days without an I-9. 2 weeks wait for Derek Halvorsen to sign. ' +
      'The fab expansion job, six automation engineers, waits for Robert Ashby.',
    )
  })

  it('spend this month is $84,000: the five bill rates on site, $128, $119, $104, $96 and $78, at 160 hours', () => {
    const rates = [...running.map((x) => x.rates[0]), CAV.direct!.rates[0], QUARRY.bill]
    expect(rates).toEqual([12_800, 11_900, 10_400, 9_600, 7_800])
    expect(rates.reduce((a, b) => a + b, 0) * HOURS_PER_MONTH).toBe(8_400_000)
    expect(stat(view(M, 'pm'), 'Spend this month').value).toBe('$84,000')
    expect(stat(view(M, 'ap'), 'Spend this month').value).toBe('$84,000')
  })

  it('Felix Brandt reads 14 months here, his Halcyon Talent line and his Arcadia line added up once per day, and every other row its own months the same way', () => {
    const today = seedToday()
    const at = (n: number) => new Date(today.getTime() + n * 86_400_000)
    const felix = CAV.placements.filter((x) => x.person === 'Felix Brandt')
    expect(felix.map((x) => x.via[1])).toEqual(['arcadia', 'halcyon'])
    const felixDays = daysOnSite(felix.map((x) => ({ startDate: at(-x.startedDaysAgo), endDate: x.state === 'ENDED' ? at(x.endsInDays) : null })), today)
    expect(monthsOf(felixDays)).toBe(14)
    const months = Object.fromEntries(view(M, 'pm').rows.map((r) => [r[0].t, r[4].t]))
    expect(months).toEqual({
      'Tomasz Nowak': String(monthsOf(121)),
      'Aisha Bello': String(monthsOf(61)),
      'Felix Brandt': '14',
      'Elsa Thornquist': String(monthsOf(CAV.direct!.startedDaysAgo + 1)),
      'Wendell Price': String(monthsOf(daysOnSite([{ startDate: sectorStart(QUARRY), endDate: null }], today))),
      'Samuel Adeyinka': '—',
    })
  })

  it('the supplier manager reads Halcyon Talent with Aisha Bello’s background check missing and Samuel Adeyinka unable to start, and Yuki Tanaka at $106 and Priyanka Rao at $99 in for the EHS lead job', () => {
    const v = view(M, 'suppliers')
    expect(CAV.placements.find((x) => x.person === 'Aisha Bello')!.papers).toBe('BGC_MISSING')
    expect(v.headline).toBe(
      'At Halcyon Talent, Aisha Bello’s background check is missing and Samuel Adeyinka cannot start without an I-9. ' +
      'Arcadia Tech Group’s Yuki Tanaka and Vertex Global’s Priyanka Rao are in for the environmental health and safety lead job.',
    )
    expect(v.rows.map((r) => r[0].t)).toEqual(['Vertex Global', 'Halcyon Talent', 'Arcadia Tech Group', 'Wrenfield Technical', 'Quarrystone Industrial Staffing'])
    expect(cells(v)).toEqual(expect.arrayContaining(['Yuki Tanaka, $106', 'Priyanka Rao, $99', 'Aisha Bello: background check missing; Samuel Adeyinka: no I-9']))
    expect(stat(v, 'Candidates in').sub).toBe('$90–$110 an hour')
  })

  it('no supplier’s liability cover is drawn, because Halcyon Talent’s is written first by its own Meridian Bank chain and the program’s twelve days never land', () => {
    expect(CAV.cover.halcyon.gl).toBe(12)
    expect(WORLD).toMatch(/via: \['meridian-bank', 'halcyon'\]/)
    for (const w of copyOfDoorMap(M)) expect(w, w).not.toMatch(/\bcover\b|\binsur/i)
  })

  it('the coordinator reads Yuki Tanaka’s interview proposed in 5 days with Derek Halvorsen and not confirmed, and the fab expansion’s six automation engineers up to $115', () => {
    const v = view(M, 'coordinator')
    expect(CAV.open.candidates[0].round).toMatchObject({ state: 'PROPOSED', inDays: 5 })
    expect(v.headline).toContain('Yuki Tanaka’s interview for the environmental health and safety lead job is proposed for 5 days from now, with Derek Halvorsen, and not confirmed yet.')
    expect(stat(v, 'Waiting for Robert Ashby').sub).toBe('Fab expansion, 6 people')
    expect(cells(v)).toEqual(expect.arrayContaining(['up to $115', 'interview proposed, in 5 days', 'applied']))
  })

  it('an MSP places nobody and pays nobody: the AP clerk checks each receipt and Cavanaugh Glassworks pays, and no map word says Aptiva pays or places', () => {
    expect(view(M, 'ap').signed).toContain('Checks each invoice receipt against the order and the signed week. Cavanaugh Glassworks pays.')
    for (const w of copyOfDoorMap(aptivaMap(FULL_PROGRAM))) {
      expect(w, w).not.toMatch(/\b(?:Aptiva|you)\b[^.]*\b(?:pays?|places?|paid)\b/i)
      expect(w, w).not.toMatch(/\bPay \$/)
    }
  })

  it('with no live read, the AP clerk reads which suppliers’ invoices the seed leaves in the check and which it paid, and every count says it is on the demo', () => {
    const v = view(M, 'ap')
    expect(v.headline).toBe('Vertex Global and Wrenfield Technical have invoices in the check. Halcyon Talent’s is paid.')
    for (const label of ['Invoice receipts', 'Pass the check', 'Held by the check', 'Paid']) expect(stat(v, label).sub).toBe(ON_THE_DEMO)
    expect(v.rows).toHaveLength(1)
  })

  it('with a live read, the AP clerk reads each receipt’s supplier, contractor, hours billed and signed, rate, and what the check says, from the record', () => {
    const v = view(aptivaMap(FULL_PROGRAM), 'ap')
    expect(v.headline).toBe('Wrenfield Technical’s invoice for Elsa Thornquist, $3,840, passes the three-way check. Halcyon Talent’s $9,520 for Aisha Bello is paid.')
    expect(v.rows[0].map((c) => c.t)).toEqual(['Wrenfield Technical', 'Elsa Thornquist', '40 h', '40 h', '$96', 'passes the check, $3,840'])
    expect(v.rows[1].map((c) => c.t)).toEqual(['Vertex Global', 'Tomasz Nowak', '120 h', '120 h', '$128', 'passes the check, $15,360'])
    expect(v.rows[0][0].sub).toBe('IN-W-1')
    expect(stat(v, 'Pass the check').value).toBe('2')
    expect(stat(v, 'Invoice receipts').sub).toBe(READ_LIVE)
  })
})

// ── The workers' door ─────────────────────────────────────────────────

describe('The workers’ map is one person’s own page per tab', () => {
  it('Helena Marsh’s newest week is 40 hours waiting for Marcus Oyelaran and owed $3,600 once Techpeple accepts it; six months in, and the time limit counted the way the block counts it', () => {
    const v = helenaMap().views[0]
    expect(Object.values(week(1).days).reduce((a, b) => a + b, 0)).toBe(40)
    expect(40 * HELENA.rates[2]).toBe(360_000)
    expect(v.headline).toBe('Your newest week, 40 hours, waits for Marcus Oyelaran at Northbend Athletic. Once Techpeple accepts it, $3,600 is owed to you.')
    expect(stat(v, 'Months here').value).toBe(String(monthsOf(HELENA.startedDaysAgo + 1)))
    expect(stat(v, 'Months here').sub).toBe(`${daysFor(NORTHBEND.governance.tenureCapMonths) - (HELENA.startedDaysAgo + 1)} days to the time limit`)
    expect(HELENA.weeks).toEqual({ approved: 3, awaiting: 1 })
    expect(v.rows.map((r) => r[2].t)).toEqual(['waiting for Marcus', 'signed', 'signed', 'signed'])
    expect(v.caption).toContain('Northbend Athletic, then Computer Systems Inc, then Techpeple, who employs you.')
    // Earlier weeks are signed; whether each is paid is on her page, not said here.
    for (const w of copyOfDoorMap(helenaMap())) expect(w, w).not.toMatch(/\bpaid\b/i)
  })

  it('Colleen Byrne’s newest week is 36 hours in three 12-hour shifts, signed by Grace Whitmore at Harlow Health and waiting on Halcyon Talent, billed at $92: $3,312', () => {
    const v = byrneMap().views[0]
    expect(Object.values(nurseWeek(1).days)).toEqual([12, 12, 12])
    expect(36 * SEED.BYRNE.bill).toBe(331_200)
    expect(WORLD_CLIENTS.find((c) => c.slug === 'harlow-health')!.owner).toBe('Grace Whitmore')
    expect(v.headline).toBe(
      'Your newest week, 36 hours, is signed by Harlow Health and waits for Halcyon Talent. ' +
      'Your Wisconsin RN license ends in 24 days, inside the assignment.',
    )
    expect(stat(v, 'This week').sub).toBe('3 shifts of 12 hours')
    expect(v.rows[0].map((c) => c.t)).toEqual(['Newest', '36', 'signed by Grace Whitmore', 'waiting', '$3,312'])
    expect(v.caption).toContain('You never accept your own week')
  })

  it('a map with one seat draws no tab row', () => {
    const html = renderToStaticMarkup(createElement(PartyPageView, { slug: 'contractors' }))
    const map = html.slice(html.indexOf('data-corvane-map'), html.indexOf('</section>', html.indexOf('data-corvane-map')))
    expect(map).not.toContain('aria-label="Read it as"')
    expect(map).toContain('Helena Marsh')
  })
})

// ── Live figures ─────────────────────────────────────────────────────

describe('The live figures are read, bounded, and never guessed', () => {
  it('with no live read, every live figure says it is on the demo, and no sum of signed weeks or invoice is drawn', () => {
    for (const m of [teleworldMap(NO_FACTS), brightmoorMap(NO_FACTS), techpepleMap(NO_FACTS)]) {
      const live = m.views.flatMap((v) => v.stats).filter((s) => /Signed, not billed|Billing this month|Invoice receipt|Your invoice|On a drafted bill/.test(s.label) && s.value === '—')
      for (const s of live) expect(s.sub, s.label).toContain(ON_THE_DEMO)
    }
    expect(view(teleworldMap(NO_FACTS), 'payroll').headline).not.toMatch(/not billed|invoice/)
    expect(view(brightmoorMap(NO_FACTS), 'owner').headline).not.toMatch(/not billed/)
  })

  it('a live read draws the firm’s own signed weeks and its invoice from below, with the names and sums the record holds', () => {
    const owner = view(brightmoorMap(FULL_BRIGHTMOOR), 'owner')
    expect(owner.headline).toMatch(/^33 signed weeks are not billed yet, most of them Rosa Delgado’s\./)
    expect(stat(owner, 'Signed, not billed').value).toBe('33 weeks')
    expect(stat(owner, 'Signed, not billed').sub).toBe(`$149,880, ${READ_LIVE}`)
    // Whoever else bills this month is a row of its own, named by the record.
    expect(cells(owner)).toContain('A Third Person')
    const ar = view(brightmoorMap(FULL_BRIGHTMOOR), 'ar')
    expect(ar.headline).toContain('1 week is on a drafted bill waiting for your yes.')
    expect(ar.rows[0].map((c) => c.t)).toEqual(['Rosa Delgado', 'Northbend Athletic', '30 weeks', '$134,400', 'signed, bill it'])
    const pay = view(teleworldMap(FULL_TELEWORLD), 'payroll')
    expect(pay.headline).toContain('Nimbus Talent’s invoice NT-2026-1190, $4,640, is received and due in 25 days.')
    expect(view(techpepleMap(FULL_BRIGHTMOOR), 'owner').headline).toContain('Your invoice CE-2026-0418 to Computer Systems Inc, $18,880, is due in 25 days.')
  })

  it('a total in another currency, or with a week the generator would leave off, is not said as one dollar figure', () => {
    const held = firmLive(tuesday({ people: [], weeks: [{ name: 'X', at: 'Y', hours: 45, amount: null }] }))
    expect(held.signed.totalMinor).toBeNull()
    expect(stat(view(brightmoorMap({ firm: held, receipt: null }), 'ar'), 'Signed, not billed').sub).toMatch(/^some unpriced/)
    const pounds = firmLive(tuesday({ people: [{ name: 'X', at: 'Y', rate: 100 }], weeks: [{ name: 'X', at: 'Y', hours: 40, amount: 4_000 }], currency: 'GBP' }))
    expect(pounds.signed.totalMinor).toBeNull()
    expect(pounds.billing.totalMinor).toBeNull()
    expect(pounds.billing.lines[0].rateMinor).toBeNull()
  })

  it('a database slower than the wait, or a failed read, reads as no live figure', async () => {
    expect(FACTS_WAIT_MS).toBeLessThanOrEqual(2_000)
    const slow: FactsReader = { company: () => new Promise(() => {}), firm: () => new Promise(() => {}), receipt: () => new Promise(() => {}) }
    expect(await doorFacts('suppliers', slow, 20)).toEqual(NO_FACTS)
    const broken: FactsReader = { company: () => Promise.reject(new Error('down')), firm: () => Promise.reject(new Error('down')), receipt: () => Promise.reject(new Error('down')) }
    expect(await doorFacts('integrators', broken, 200)).toEqual(NO_FACTS)
  })

  const seededAs = (slug: string, over: Partial<CompanySeen> = {}): CompanySeen =>
    ({ id: `id-${slug}`, slug, domain: null, seatEmails: [`world-x@demo.etyme.local`, 'rosa.delgado@seed.etyme.invalid'], ...over })

  it('each door reads its own firm by its demo slug and the invoice from below by the number and payer the seed wrote, and counts days to its due day', async () => {
    expect(LIVE_READS.integrators.firm).toBe('world-teleworld')
    expect(LIVE_READS.suppliers.firm).toBe('world-brightmoor')
    const asked: string[] = []
    const reader: FactsReader = {
      company: async (slug) => { asked.push(slug); return seededAs(slug) },
      firm: async () => null,
      receipt: async (payerId, number) => { asked.push(`${payerId} ${number}`); return { totalCents: 464_000, dueAt: new Date('2026-11-22T00:00:00Z'), vendorName: 'Nimbus Talent' } },
    }
    const f = await doorFacts('integrators', reader, 500, new Date('2026-10-28T15:00:00Z'))
    expect(asked.sort()).toEqual(['id-world-teleworld NT-2026-1190', 'world-teleworld', 'world-teleworld'])
    expect(f.receipt).toEqual({ number: 'NT-2026-1190', from: 'Nimbus Talent', totalMinor: 464_000, dueInDays: 25 })
    expect(f.firm).toBeNull()
  })

  it('a program’s receipt reads paid when it is paid, passes when the payment route’s own gate would let it be paid, and held, with the check’s sentence, when it would not', () => {
    const p = programLive([
      ...PROGRAM_INVOICES,
      receiptOf({ number: 'IN-V-2', status: 'SUBMITTED', supplier: 'Vertex Global', matched: false, lines: [line('Tomasz Nowak', 41.5, 40, 12_800)] }),
      receiptOf({ number: 'IN-X-1', status: 'HELD', supplier: 'Arcadia Tech Group', lines: [line('Felix Brandt', 40, 40, 10_400)] }),
    ])
    expect(p.receipts.map((r) => [r.number, r.state])).toEqual([['IN-W-1', 'PASSES'], ['IN-V-1', 'PASSES'], ['IN-H-1', 'PAID'], ['IN-V-2', 'HELD'], ['IN-X-1', 'HELD']])
    expect(p.receipts[3].why).toContain('Bills 41.5 h; 40 h were signed')
    expect(p.receipts[4].why).toContain('is on hold')
    expect(p.receipts[3].hoursSigned).toBe(40)
  })

  it('a receipt in another currency, with a line nobody signed, or at two rates, is never summed or priced as one dollar figure', () => {
    const p = programLive([
      receiptOf({ number: 'GBP-1', status: 'SUBMITTED', supplier: 'Vertex Global', currency: 'GBP', lines: [line('X', 40, 40, 100)] }),
      receiptOf({ number: 'IN-2', status: 'SUBMITTED', supplier: 'Vertex Global', lines: [line('X', 40, null, 100), line('Y', 40, 40, 200)] }),
    ])
    expect(p.receipts.map((r) => r.number)).toEqual(['IN-2'])
    expect(p.receipts[0].hoursSigned).toBeNull()
    expect(p.receipts[0].rateMinor).toBeNull()
  })

  it('the MSPs’ door reads only Cavanaugh Glassworks’ program, by its demo slug, and only where it is the seed’s; anything slower, broken or real reads as on the demo', async () => {
    expect(PROGRAM_READS['program-offices'].client).toBe('world-corning')
    expect(SEEDED_SLUGS).toContain('world-corning')
    expect(SEEDED_SLUGS).not.toContain('world-aptiva')
    const asked: string[] = []
    const reader: FactsReader = {
      company: async (slug) => { asked.push(slug); return seededAs(slug) },
      firm: async () => null,
      receipt: async () => null,
      program: async (id) => { asked.push(id); return PROGRAM_INVOICES },
    }
    const f = await doorFacts('program-offices', reader, 500)
    expect(asked).toEqual(['world-corning', 'id-world-corning'])
    expect(f.program!.receipts).toHaveLength(3)
    expect(f.firm).toBeNull()
    const real: FactsReader = { ...reader, company: async (slug) => seededAs(slug, { seatEmails: ['ap@cavanaugh-glass.com'] }), program: async () => { throw new Error('read a real firm') } }
    expect(await doorFacts('program-offices', real, 500)).toEqual(NO_FACTS)
    const slow: FactsReader = { ...reader, program: () => new Promise(() => {}) }
    expect(await doorFacts('program-offices', slow, 20)).toEqual(NO_FACTS)
    const broken: FactsReader = { ...reader, program: () => Promise.reject(new Error('down')) }
    expect(await doorFacts('program-offices', broken, 200)).toEqual(NO_FACTS)
  })

  it('a door’s map never reads a firm that is not the seed’s', async () => {
    // The seed's own firm passes: its slug, no registrable domain, every seat reserved.
    expect(mayReadLive(seededAs('world-brightmoor'), 'world-brightmoor')).toBe(true)
    expect(mayReadLive(seededAs('world-brightmoor', { domain: 'brightmoor.example' }), 'world-brightmoor')).toBe(true)
    // A real domain, a real seat, another slug, or a slug the doors never read: refused.
    expect(mayReadLive(seededAs('world-brightmoor', { domain: 'brightmoor.com' }), 'world-brightmoor')).toBe(false)
    expect(mayReadLive(seededAs('world-brightmoor', { seatEmails: ['jenna@brightmoorstaffing.com'] }), 'world-brightmoor')).toBe(false)
    expect(mayReadLive(seededAs('acme'), 'world-brightmoor')).toBe(false)
    expect(mayReadLive(seededAs('world-acme'), 'world-acme')).toBe(false)
    expect(mayReadLive(null, 'world-brightmoor')).toBe(false)
    // And a refused company is never read further: no book, no invoice, only "on the demo".
    const reads: string[] = []
    const real: FactsReader = {
      company: async (slug) => seededAs(slug, { domain: 'realfirm.com' }),
      firm: async (id) => { reads.push(id); return tuesday({ people: [], weeks: [] }) },
      receipt: async (id) => { reads.push(id); return { totalCents: 1, dueAt: new Date(), vendorName: 'X' } },
    }
    expect(await doorFacts('suppliers', real, 500)).toEqual(NO_FACTS)
    expect(reads).toEqual([])
    const view = brightmoorMap(NO_FACTS).views.find((v) => v.key === 'owner')!
    expect(view.stats.find((s) => s.label === 'Signed, not billed')!.sub).toBe(ON_THE_DEMO)
  })
})

// ── On the page ──────────────────────────────────────────────────────

describe('Each door draws its own map under the hero, in its own roles, at its own addresses', () => {
  const draw = (slug: 'integrators' | 'suppliers' | 'contractors' | 'program-offices', q: { tab?: string; seat?: string } = {}) =>
    renderToStaticMarkup(createElement(PartyPageView, { slug, params: { searchParams: q } }))

  it('the integrators’ door draws Teleworld, the suppliers’ door Brightmoor on Prime vendor and Techpeple on Sub-vendor and Bench vendor, the workers’ door one person per tab, and the MSPs’ door Aptiva in Cavanaugh’s program', () => {
    expect(Object.fromEntries(Object.entries(DOOR_MAPS).map(([k, v]) => [k, v.map]))).toEqual({
      '/for/integrators': 'teleworld',
      '/for/suppliers': 'brightmoor',
      '/for/suppliers?tab=sub': 'techpeple',
      '/for/suppliers?tab=bench': 'techpeple',
      '/for/contractors': 'helena',
      '/for/contractors?tab=solo': 'byrne',
      '/for/program-offices': 'aptiva',
    })
    expect(draw('integrators')).toContain(teleworldMap(NO_FACTS).bar)
    expect(draw('suppliers')).toContain(brightmoorMap(NO_FACTS).bar.replace(/&/g, '&amp;'))
    expect(draw('suppliers', { tab: 'sub' })).toContain(techpepleMap(NO_FACTS).bar)
    expect(draw('contractors', { tab: 'solo' })).toContain(byrneMap().bar)
    expect(draw('program-offices')).toContain(aptivaMap(NO_FACTS).bar)
    expect(draw('program-offices', { seat: 'ap' })).toMatch(/data-map-seat="ap" class=/)
    expect(doorSeatHref('/for/program-offices', 'coordinator', 'pm')).toBe('/for/program-offices?seat=coordinator')
    expect(doorMap('/for/nowhere', NO_FACTS)).toBeNull()
  })

  it('the map sits after the headline and before the panel, where the home page draws its own', () => {
    for (const v of everyDoorView().filter((x) => DOOR_MAPS[x.href])) {
      const html = renderToStaticMarkup(createElement(PartyPageView, { slug: v.slug, params: { searchParams: v.tab ? { tab: v.tab.key } : {} } }))
      const h1 = html.indexOf('<h1')
      const map = html.indexOf('id="map"')
      const panel = html.indexOf('id="demo"')
      expect(h1, v.href).toBeGreaterThan(0)
      expect(map, v.href).toBeGreaterThan(h1)
      expect(panel, v.href).toBeGreaterThan(map)
    }
  })

  it('Sub-vendor opens Techpeple at its owner and Bench vendor at its recruiter, the people their panels play', () => {
    expect(DOOR_MAPS['/for/suppliers?tab=sub'].seat).toBe('owner')
    expect(DOOR_MAPS['/for/suppliers?tab=bench'].seat).toBe('recruiter')
    expect(draw('suppliers', { tab: 'bench' })).toMatch(/data-map-seat="recruiter" class=/)
    expect(draw('suppliers', { tab: 'sub' })).toMatch(/data-map-seat="owner" class=/)
  })

  it('each role tab is a link at its own address beside the door’s own tab, never into the middle of a page, and an unknown seat opens the tab’s own', () => {
    expect(doorSeatHref('/for/integrators', 'tualatin', 'tualatin')).toBe('/for/integrators')
    expect(doorSeatHref('/for/integrators', 'hr', 'tualatin')).toBe('/for/integrators?seat=hr')
    expect(doorSeatHref('/for/suppliers?tab=sub', 'recruiter', 'owner')).toBe('/for/suppliers?tab=sub&seat=recruiter')
    expect(doorSeatOf('techpeple', 'owner', 'nonsense')).toBe('owner')
    expect(doorSeatOf('techpeple', 'owner', ['recruiter'])).toBe('recruiter')
    const html = draw('suppliers', { tab: 'sub', seat: 'recruiter' })
    expect(html).toContain('href="/for/suppliers?tab=sub&amp;seat=recruiter"')
    expect(html).toContain('href="/for/suppliers?tab=sub"')
    // The door's tab is the page; the map's seat is the current one inside it.
    expect([...html.matchAll(/aria-current="page"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Sub-vendor'])
    expect(html).toMatch(/aria-current="true"[^>]*>Recruiter</)
    expect(html).toMatch(/data-map-seat="recruiter" class=/)
    expect(html).toMatch(/data-map-seat="owner" hidden=""/)
    // The door's own tabs still link without a seat.
    expect(html).toContain('href="/for/suppliers?tab=bench"')
  })

  it('every “Open the demo as” on a map seats a desk the demo door knows, as the person the map names', () => {
    for (const m of [teleworldMap(NO_FACTS), brightmoorMap(NO_FACTS), techpepleMap(NO_FACTS)]) {
      for (const v of m.views) {
        const t = v.demo.target as { as: string; desk: string; who?: string; seat: string }
        expect(v.demo.label).toBe(`Open the demo as ${t.seat}`)
        expect(v.signed, v.tab).toContain(t.seat)
        if (t.desk) {
          expect(DESKS as readonly string[], t.desk).toContain(t.desk)
          expect(DESK_ROLES[t.desk as (typeof DESKS)[number]].length).toBeGreaterThan(0)
        }
      }
    }
    // Aptiva: the program manager is its first seat, opened with no desk named, and the AP clerk its AP desk.
    // The demo door has no key for a supplier manager or a coordinator, so those two tabs open the
    // program manager's seat, and the caption under each says so.
    const ap = aptivaMap(NO_FACTS)
    expect(view(ap, 'pm').demo.target).toEqual({ as: 'world-aptiva', desk: '', seat: 'Rashida Coleman' })
    expect(view(ap, 'ap').demo.target).toEqual({ as: 'world-aptiva', desk: 'ap', seat: 'Hollis Banerjee' })
    expect(DESK_ROLES.ap).toContain('AP Clerk')
    for (const k of ['suppliers', 'coordinator']) {
      expect(view(ap, k).demo).toEqual(view(ap, 'pm').demo)
      expect(view(ap, k).caption).toMatch(/The demo opens this program as Rashida Coleman\.$/)
      for (const role of ['Supplier Manager', 'Coordinator']) expect(Object.values(DESK_ROLES).flat()).not.toContain(role)
    }
    // The two delivery managers share a desk, so each link names its person.
    const tw = teleworldMap(NO_FACTS)
    expect((view(tw, 'tualatin').demo.target as { who: string }).who).toBe(MOVE_DESKS.portland.name)
    expect((view(tw, 'sanjose').demo.target as { who: string }).who).toBe(MOVE_DESKS.sanJose.name)
    expect((helenaMap().views[0].demo.target as { person: string }).person).toBe('helena-marsh')
    expect((byrneMap().views[0].demo.target as { person: string }).person).toBe('colleen-byrne')
  })
})

// ── What a door may say ──────────────────────────────────────────────

const EVERY_MAP: [string, RoleMap, string][] = [
  ['/for/integrators', teleworldMap(FULL_TELEWORLD), 'tualatin'],
  ['/for/suppliers', brightmoorMap(FULL_BRIGHTMOOR), 'owner'],
  ['/for/suppliers?tab=sub', techpepleMap(FULL_BRIGHTMOOR), 'owner'],
  ['/for/suppliers?tab=bench', techpepleMap(FULL_BRIGHTMOOR), 'recruiter'],
  ['/for/contractors', helenaMap(), 'worker'],
  ['/for/contractors?tab=solo', byrneMap(), 'solo'],
  ['/for/program-offices', aptivaMap(FULL_PROGRAM), 'pm'],
]

describe('The maps say what a door may say', () => {
  it('no map leads with AI, names a real company, claims anybody is placed by Etyme, states a price or says desk or program office', () => {
    for (const [href, m] of EVERY_MAP) {
      const words = copyOfDoorMap(m)
      const hero = ['Enterprise contingent workforce management']
      const v = verdict({ hero, body: words })
      expect(v.findings.filter((f) => f.severity === 'WRONG'), `${href}: ${JSON.stringify(v.findings)}`).toEqual([])
      const rules = check({ hero, body: words }).map((f) => f.rule)
      expect(rules, href).not.toContain('neutrality')
      expect(rules, href).not.toContain('never-lead-with-ai')
      expect(namedCompanies(words.join(' ')), href).toEqual([])
      expect(priceClaims(words.join(' ')), href).toEqual([])
      for (const w of words) {
        expect(w, w).not.toMatch(/\b(program(?:me)?\s+offices?|desks?)\b/i)
        expect(w, w).not.toMatch(/\bAI\b/)
      }
    }
  })

  it('each map says its company is a demo and not a customer, in the line under it', () => {
    for (const [href, m] of EVERY_MAP) {
      expect(m.under, href).toMatch(/\bdemo (?:company|companies|integrator|supplier)\b/)
      expect(m.under, href).toMatch(/\bnot (?:a )?customers?\b/)
      expect(m.bar, href).toMatch(/\ba sample\b/)
    }
  })

  it('each door keeps its own 165 words, and each map has a ceiling of its own, measured on the seat a reader meets first with the fullest live read', () => {
    // The door's own words are counted without the map, as the home page's are.
    for (const v of everyDoorView()) {
      const c = copyOfPartyPage(v, v.tab?.key)
      expect(countWords([...c.hero, ...c.body]), v.href).toBeLessThanOrEqual(MOST_WORDS)
    }
    // Measured 2026-10-28 on the seat each tab opens, with four live rows
    // where a seat has them; the home page's map carries 324 on its CFO.
    // The ceiling is the measure, so a fixed figure fits and a new section
    // does not. The other seats are in the HTML and hidden until pressed.
    const CEILING: Record<string, number> = {
      '/for/integrators': 226,
      '/for/suppliers': 226,
      '/for/suppliers?tab=sub': 210,
      '/for/suppliers?tab=bench': 190,
      '/for/contractors': 165,
      '/for/contractors?tab=solo': 187,
      '/for/program-offices': 240,
    }
    for (const [href, m, seat] of EVERY_MAP) {
      const n = countWords(defaultCopyOfDoorMap(m, seat))
      expect(n, `${href}'s map carries ${n} words`).toBeLessThanOrEqual(CEILING[href])
    }
  })

  it('on a phone the figures sit two to a row, the table scrolls in its own box with the first cell pinned, and the door never scrolls sideways', () => {
    const drawn = read('src/lib/public-site/corvane-map-view.tsx')
    expect(gridsWithoutBreakpoint(drawn)).toEqual([])
    expect(drawn).toContain('min-[340px]:grid-cols-2 lg:grid-cols-5')
    expect(drawn).toMatch(/data-map-scroll="" className="overflow-x-auto/)
    expect(drawn).toContain("const STICKY = 'sticky left-0 z-10 bg-etyme-surface'")
    expect(read('src/lib/public-site/sub-page.tsx')).toContain('min-h-screen overflow-x-hidden')
    // The door draws the home page's own view, never a second one.
    expect(read('src/lib/public-site/party-page.tsx')).toContain('<CorvaneMapView map={drawn.map}')
    for (const s of Object.values(DOOR_SEATS)) expect(s.length).toBeGreaterThan(0)
  })
})
