/**
 * The panel that shows the product working, read against the seed.
 *
 * The founder said "Build it" on 2026-10-14 to a drawing of one compact
 * panel replacing the big live frame: the four steps — Job, Candidates,
 * Timesheets, Invoices — each an Ask Etyme question, an answer and a
 * decision card beside the table it changes. CLAUDE.md: "A test checks
 * every name and figure in it against the seed, so the page never shows
 * something the demo does not."
 *
 * ── Where the drawing and the seed disagreed, the seed won ────────────
 *
 * The drawing was a sketch with stand-in figures. Each of these is not
 * what the seeded Northbend Athletic program holds, and the panel says
 * the seed's instead:
 *
 *   drawing                              seed, and so the panel
 *   a Java developer job, $85–95         the HCM integration lead job, $120–140,
 *                                        12 months, to Computer Systems Inc,
 *                                        Brightmoor Staffing, Pinnacle Resourcing
 *   Omar Haddad, Helena Marsh, Ravi Iyer the job's candidates: Rajesh Iyer $134,
 *   as candidates; 86% match; 14 months  Mei-Lin Chao $128, Daniel Okafor $131;
 *                                        no match score (it is computed, not
 *                                        seeded) and no months here (none of
 *                                        them has been on site)
 *   2 timesheets waiting, dated Oct 5–11 3 waiting: Helena 40, Lucía 44, Omar 45;
 *                                        no dates (the seed counts them from
 *                                        the day the world was born)
 *   BR-2026-0417 for $21,120, VT-2026-   PR-2026-0441, 40 h × $98 = $3,920, and
 *   0108, $42,587 billed this month      PR-2026-0442, 41.5 h against 40; the
 *                                        month's total is computed from the
 *                                        seed's dates, so no total is shown
 *   7 contractors · 4 suppliers          the same, and counted below
 *
 * And the founder's drawing of 2026-10-19, which names the person in
 * front of each step (Marcus Oyelaran, Helena Marsh, Renata Kowal):
 *
 *   drawing                              seed, and so the panel
 *   "$60,000 a month: Helena Marsh,      $135,200 a month for the 7 contractors
 *   Omar Haddad and Lucía Fernández,     the seed puts on site through 4
 *   through 3 suppliers"                 suppliers — the question is "across
 *                                        every supplier", and the three named
 *                                        are 3 of 7; the table says "3 of 7"
 *   "Computer Systems Inc accepts the    Computer Systems Inc accepts next,
 *   same 40 hours next, then pays you"   then her employer, who pays her:
 *                                        Computer Systems Inc is not Helena's
 *                                        employer, and the client never reads
 *                                        the firm below it
 *   "he has them at the top of his       "they are on his list": nothing on the
 *   list"                                record orders his list
 *   two earlier weeks "Paid"             "Accepted": every rung signed them;
 *                                        whether payroll has paid one depends
 *                                        on the day the world was born
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PROGRAMMES } from '@/lib/seed-programmes'
import { NORTHBEND_TWIN_RECEIPTS } from '@/lib/twin/seed-demo'
import { TENURE_DEMO } from '@/lib/twin/seed-tenure-demo'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'
import {
  STORY, STORY_BAR, STEP_NAMES, STORIES, APTIVA_BAR, APTIVA_BOOK, APTIVA_WHO, NORTHBEND_PEOPLE, STORY_STEP_MS, WEEK_WORDS,
  storyCopy, storyChromeCopy, storyIndex, startOf, weekLabel, cellText,
  type Cell, type StoryStep, type StoryKey,
} from '@/lib/public-site/story'
import { programMonthlySpend } from '@/lib/program-spend'
import { daysOnSite, monthsOf } from '@/lib/tenure-days'
import { OFFERED } from '@/lib/seed-bench-matching'
import { MOVE_DESKS } from '@/lib/seed-internal-moves'
import { RATE_CHANGE_RATES } from '@/lib/seed-rate-change'
import { everyDoorView } from '@/lib/public-site/parties'
import { SECTOR_SUPPLIERS } from '@/lib/seed-sector-suppliers'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'
import { StoryPanel } from '@/lib/public-site/story-panel'
import { STEPS } from '@/lib/public-site/steps'
import { STEP_PAGES, stepEyebrow } from '@/lib/public-site/docs/process'
import { MODULES } from '@/lib/public-site/modules'
import { PARTY_PAGES } from '@/lib/public-site/parties'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const nike = PROGRAMMES.find((p) => p.client === 'nike')!
const WORLD = read('src/lib/seed-world.ts')
/** A seeded firm's name, read off the world seed's firm list. */
const firm = (slug: string) => WORLD.match(new RegExp(`slug: '${slug}',\\s*name: '([^']+)'`))![1]
const dollars = (cents: number) => `$${cents / 100}`
/** What a cell reads before the page is live: a pill's first words, a week as "Last week". */
const text = (c: Cell) => cellText(c)
/** What a pill reads once the card has pressed. */
const after = (c: Cell) => (typeof c === 'object' && 'pill' in c && c.then ? c.then.t : cellText(c))
const step = (chip: string) => STORY.find((s) => s.chip === chip)!
const sayAll = (s: StoryStep) =>
  [...s.chat.flatMap((m) => [m.text, m.card?.t ?? '', m.card?.s ?? '', m.status?.t ?? '', m.status?.then.t ?? '']),
    ...s.table.rows.flat().map(text), ...(s.table.added ?? []).map(text), s.sum.big, s.sum.rest].join(' ')
const said = (chip: string) => sayAll(step(chip))
/** "$135,200" from cents. */
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`
/** The world's birthday, as any fixed day: every seeded date counts from it. */
const BORN = new Date('2026-10-15T00:00:00.000Z')
const back = (days: number) => new Date(BORN.getTime() - days * 86_400_000)
/** The people the seed puts on site at Northbend today, with the rate Northbend pays each. */
function northbendOnSite() {
  const moves = read('src/lib/seed-internal-moves.ts')
  return [
    ...nike.placements.filter((p) => p.state === 'IN_PROGRESS').map((p) => ({ person: p.person, firm: p.via[1], bill: p.rates[0] })),
    ...TENURE_DEMO.lines.filter((l) => l.state === 'IN_PROGRESS').map((l) => ({ person: TENURE_DEMO.person, firm: l.via, bill: l.rates[0] })),
    { person: RATE_CHANGE_PERSON.name, firm: 'brightmoor', bill: RATE_CHANGE_RATES.bill },
    ...[...moves.matchAll(/person: '([^']+)', client: 'nike'[\s\S]*?bill: ([\d_]+),[\s\S]*?end: (-?\d+)/g)]
      .filter((m) => Number(m[3]) > 0).map((m) => ({ person: m[1], firm: 'teleworld', bill: Number(m[2].replace(/_/g, '')) })),
  ]
}
/** The world seed's placements and the names given them, read off its source: neither is exported. */
const WORLD_PLACEMENTS = (() => {
  const block = WORLD.slice(WORLD.indexOf('const PLACEMENTS: Placement[] = ['), WORLD.indexOf('const NAMES: string[] = ['))
  return [...block.matchAll(/via: \[([^\]]+)\]/g)].map((m) => m[1].split(',').map((x) => x.trim().replace(/'/g, '')))
})()
const WORLD_NAMES = [...WORLD.slice(WORLD.indexOf('const NAMES: string[] = ['), WORLD.indexOf('/**', WORLD.indexOf('const NAMES: string[] = ['))).matchAll(/'([^']+)'/g)].map((m) => m[1])

describe('Every name and figure on the panel is the seeded demo’s', () => {

  it('the bar names the person in front of each step beside the company: Marcus Oyelaran for the job and the candidates, Helena Marsh for her week, Renata Kowal for the invoices', () => {
    expect(STORY.map((s) => s.who)).toEqual([
      'Marcus Oyelaran, hiring manager', 'Marcus Oyelaran, hiring manager',
      'Helena Marsh, contractor through Computer Systems Inc', 'Renata Kowal, AP clerk',
    ])
    expect(nike.people.hiring).toBe('Marcus Oyelaran')
    expect(nike.people.ap).toBe('Renata Kowal')
    // Helena is on site through Computer Systems Inc, the firm Northbend pays.
    const helena = nike.placements.find((p) => p.person === 'Helena Marsh' && p.state === 'IN_PROGRESS')!
    expect(NORTHBEND_PEOPLE.worker).toBe(`Helena Marsh, contractor through ${firm(helena.via[1])}`)
    // Three people over four steps, a step every 5.2 seconds: a loop of about twenty-one seconds.
    expect(STORY_STEP_MS).toBe(5200)
    expect((STORY_STEP_MS * STORY.length) / 1000).toBeCloseTo(20.8)
  })

  it('the job step opens on the headline’s own question, and answers it with what the seed’s seven contractors cost a month at current rates: $135,200', () => {
    const s = step('Job')
    expect(s.chat[0]).toEqual({ who: 'me', text: 'What am I paying across every supplier this month?' })
    const onSite = northbendOnSite()
    expect(new Set(onSite.map((o) => o.person)).size).toBe(7)
    expect(new Set(onSite.map((o) => o.firm)).size).toBe(4)
    // The dashboard's own arithmetic: each bill rate at a 160-hour month.
    expect(read('src/app/api/program/route.ts')).toContain('programMonthlySpend(onSite.map((c) => ({ rateMinorPerHour: c.billRate ?? null })))')
    const month = programMonthlySpend(onSite.map((o) => ({ rateMinorPerHour: o.bill }))).totalMinor
    expect(money(month)).toBe('$135,200')
    expect(s.chat[1].text.startsWith(`${money(month)} a month: 7 contractors through 4 suppliers, at current rates.`)).toBe(true)
    expect(s.sum).toEqual({ big: money(month), rest: 'a month across every supplier, from current rates, in one answer' })
    // The drawing's $60,000 is the three named rows alone, which are three of seven.
    const three = programMonthlySpend(['Helena Marsh', 'Omar Haddad', 'Lucía Fernández'].map((n) => ({ rateMinorPerHour: onSite.find((o) => o.person === n)!.bill }))).totalMinor
    expect(money(three)).toBe('$60,000')
    expect(storyCopy().join(' ')).not.toContain('$60,000')
    expect(s.table.title).toBe('Contractors on site · 3 of 7')
  })

  it('the job step’s contractors carry the supplier and rate the seed gives them, and their months here counted the way the time limit counts them: whole months, never rounded up', () => {
    const live = (person: string) => nike.placements.find((p) => p.person === person && p.state === 'IN_PROGRESS')!
    const lines = (person: string) => nike.placements.filter((p) => p.person === person)
    const months = (person: string) => monthsOf(daysOnSite(lines(person).map((p) => ({
      startDate: back(p.startedDaysAgo), endDate: p.state === 'ENDED' ? back(-p.endsInDays) : null,
    })), BORN))
    expect(months('Helena Marsh')).toBe(6)
    expect(months('Omar Haddad')).toBe(1)
    expect(months('Lucía Fernández')).toBe(14)
    expect(new Set(lines('Lucía Fernández').map((p) => p.via[1])).size).toBe(2)
    expect(nike.governance.tenureCapMonths).toBe(18)
    const rows = step('Job').table.rows.map((r) => r.map(text))
    expect(rows).toEqual([
      ['Helena Marsh', firm(live('Helena Marsh').via[1]), dollars(live('Helena Marsh').rates[0]), String(months('Helena Marsh'))],
      ['Omar Haddad', firm(live('Omar Haddad').via[1]), dollars(live('Omar Haddad').rates[0]), String(months('Omar Haddad'))],
      ['Lucía Fernández', firm(live('Lucía Fernández').via[1]), dollars(live('Lucía Fernández').rates[0]), `14 of ${nike.governance.tenureCapMonths} · 2 suppliers`],
    ])
    expect(step('Job').chat[1].text).toContain(`Lucía Fernández has 14 months here across two suppliers. The limit is ${nike.governance.tenureCapMonths}.`)
  })

  it('the job step’s card sends the seeded open job, at its band and months, to the three suppliers the seed releases it to, and the job appears under the contractors when it presses', () => {
    const s = said('Job')
    expect(s).toContain(nike.open.title)
    // The seed writes the open job for twelve months, at the program's own site.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/billMin: p\.open\.band\[0\], billMax: p\.open\.band\[1\], months: 12/)
    const to = nike.open.to.map(firm)
    const band = `$${nike.open.band[0] / 100}–${nike.open.band[1] / 100}`
    const msg = step('Job').chat[2]
    expect(msg.text).toBe(`Send the ${nike.open.title} job to your ${to.length} approved suppliers? It is within budget, so it needs no approval.`)
    expect(msg.card).toEqual({ t: `${nike.open.title} · 12 months · ${nike.loc}`, s: `${to.join(', ')} · ${band} an hour`, yes: 'Send' })
    // Within the band, so it clears by rule: the seed writes it AUTO_APPROVED.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/status: 'OPEN', approvalState: 'AUTO_APPROVED'/)
    expect(nike.open.band[1]).toBeLessThanOrEqual(nike.governance.band[1])
    expect(step('Job').table.added!.map(text)).toEqual([`${nike.open.title} (open)`, `${to.length} suppliers`, band, 'Sent'])
    // The row that lights is the one the card added.
    expect(step('Job').table.flash).toBe(step('Job').table.rows.length)
  })

  it('the candidates step lists the seeded job’s three candidates, each with the supplier, rate and interview state the seed gives them', () => {
    const rows = step('Candidates').table.rows.map((r) => r.map(text))
    expect(rows.map((r) => r[0])).toEqual(nike.open.candidates.map((c) => c.person))
    for (const [i, c] of nike.open.candidates.entries()) {
      expect(rows[i][1], c.person).toBe(firm(c.from))
      expect(rows[i][2], c.person).toBe(dollars(c.rate))
    }
    const status = Object.fromEntries(nike.open.candidates.map((c) => [c.person, c]))
    expect(status['Rajesh Iyer'].round?.state).toBe('CONFIRMED')
    expect(rows[0][3]).toBe('Interview booked')
    expect(status['Mei-Lin Chao'].status).toBe('SUBMITTED')
    expect(rows[1][3]).toBe('Submitted')
    expect(status['Daniel Okafor'].round).toMatchObject({ state: 'DONE', outcome: 'ADVANCE' })
    expect(rows[2][3]).toBe('Round 1 passed')
    const card = step('Candidates').chat[1].card!
    expect(card.s).toBe(`${firm('computer-systems')} · ${dollars(status['Daniel Okafor'].rate)} an hour · passed round one`)
    expect(said('Candidates')).toContain(`3 candidates from ${new Set(nike.open.candidates.map((c) => c.from)).size} suppliers`)
  })

  it('the timesheets step is Helena’s own week, waiting on Marcus Oyelaran, who signs it, and flipping to signed where a card would press', () => {
    const helena = nike.placements.find((p) => p.person === 'Helena Marsh' && p.state === 'IN_PROGRESS')!
    // One week waiting at the top, three signed before it, forty hours each.
    expect(helena.weeks).toEqual({ approved: 3, awaiting: 1 })
    expect(helena.exceptionHours).toBeUndefined()
    // The seed signs every week as the program's hiring manager.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/clientApprovedById: desk\.hiring\.personId/)
    const s = step('Timesheets')
    expect(s.chat[0]).toEqual({ who: 'me', text: 'Is my week signed yet? My pay waits on it.' })
    expect(s.chat[1].text).toBe(`Not yet. Your 40 hours are with ${nike.people.hiring}, who signs them. They are due by Wednesday, and they are on his list.`)
    // Due by Wednesday: the default approve-by day, and no seed sets another.
    const daysOff = read('src/lib/days-off.ts')
    expect(daysOff).toContain('approveByWeekday: 3, // Wednesday')
    for (const f of ['seed-programmes', 'seed-world', 'seed-doors']) expect(read(`src/lib/${f}.ts`), f).not.toContain('approveByWeekday')
    expect(s.chat[1].status).toEqual({ pill: 'wait', t: `Waiting for ${nike.people.hiring}`, then: { pill: 'ok', t: `Signed by ${nike.people.hiring} ✓` } })
    expect(s.chat.some((m) => m.card)).toBe(false)
    // Then down the chain: the firm Northbend pays, then her employer, the bottom rung.
    expect(helena.via).toEqual(['nike', 'computer-systems', 'techpeple'])
    expect(s.chat[2].text).toBe(`Signed, just now. ${firm(helena.via[1])} accepts the same 40 hours next, then your employer, who pays you. Nobody types your week in again.`)
    // The client never reads the firm below the one it pays, on this panel or any other Northbend step.
    for (const st of STORY) expect(sayAll(st), st.chip).not.toContain(firm('techpeple'))
    expect(s.table.rows.map((r) => r.map(text))).toEqual([
      [WEEK_WORDS[0], '40', nike.people.hiring, 'Waiting'],
      [WEEK_WORDS[1], '40', nike.people.hiring, 'Accepted'],
      [WEEK_WORDS[2], '40', nike.people.hiring, 'Accepted'],
    ])
    expect(after(s.table.rows[0][3])).toBe('Signed')
    expect(s.sum).toEqual({ big: '1', rest: 'week, signed once at the top; every firm below accepts the same week' })
  })

  it('a week is said as its days once the page is live: the Sunday-to-Saturday week before today, through the one date formatter', () => {
    // Monday Oct 19: the last whole week is Oct 11–17, and so on the Saturday after.
    expect(weekLabel('2026-10-19')).toBe('Oct 11–17')
    expect(weekLabel('2026-10-24')).toBe('Oct 11–17')
    // On the Sunday the week that just ended is the one.
    expect(weekLabel('2026-10-25')).toBe('Oct 18–24')
    // Earlier weeks, and across a month.
    expect(weekLabel('2026-10-19', 1)).toBe('Oct 4–10')
    expect(weekLabel('2026-10-19', 2)).toBe('Sep 27–Oct 3')
    // Before the page is live, words; the server and the browser draw the same first frame.
    expect(cellText({ week: 0 })).toBe('Last week')
    expect(cellText({ week: 0 }, '2026-10-19')).toBe('Oct 11–17')
    expect(read('src/lib/public-site/story.ts')).toContain("import { formatDay } from '@/lib/format-date'")
    expect(read('src/lib/public-site/story-panel.tsx')).toContain('setToday(new Date().toISOString().slice(0, 10))')
  })

  it('the invoices step is Renata Kowal paying the twin’s clean seeded receipt from Pinnacle, at the rate Pinnacle bills Northbend, and holding the one that bills more hours than were approved', () => {
    const [clean, held] = NORTHBEND_TWIN_RECEIPTS.filter((r) => r.number)
    expect(clean).toMatchObject({ number: 'PR-2026-0441', hoursBilled: 40, hoursAccepted: 40, expected: 'CLEAN', supplier: 'pinnacle' })
    expect(held).toMatchObject({ number: 'PR-2026-0442', hoursBilled: 41.5, hoursAccepted: 40, expected: 'MISMATCH', supplier: 'pinnacle' })
    const rate = nike.placements.find((p) => p.person === clean.person && p.via[1] === 'pinnacle' && p.state === 'IN_PROGRESS')!.rates[0]
    const total = (clean.hoursBilled * rate) / 100
    const s = step('Invoices')
    expect(s.chat[0].text).toBe('Which of Pinnacle Resourcing’s invoices can we pay today?')
    expect(s.chat[1].text).toBe(`${clean.number}: ${clean.hoursAccepted} approved hours at the contract rate of ${dollars(rate)}. The hours, the invoice receipt and the rate agree.`)
    expect(s.chat[1].card).toEqual({ t: `Pay invoice ${clean.number} for $${total.toLocaleString('en-US')}?`, s: `${clean.hoursAccepted} approved hours × ${dollars(rate)} · ${firm('pinnacle')}`, yes: 'Pay' })
    expect(s.chat[2].text).toBe(`${held.number} is on hold. It bills ${held.hoursBilled} hours; ${held.hoursAccepted} were approved. Nobody pays the ${held.hoursBilled - held.hoursAccepted} hours until somebody signs them.`)
    // The list a client reads for what suppliers send is invoice receipts (CLAUDE.md, 2026-09-28).
    expect(s.table.title).toBe('Invoice receipts')
    expect(s.table.head[0].t).toBe('Invoice receipt')
    expect(s.table.rows.map((r) => r.map(text))).toEqual([
      [clean.number, `${clean.hoursBilled} h`, `${clean.hoursAccepted} h`, 'Paid'],
      [held.number, `${held.hoursBilled} h`, `${held.hoursAccepted} h`, `On hold: ${held.hoursBilled - held.hoursAccepted} h over`],
    ])
  })

  it('the bar’s 7 contractors and 4 suppliers are the people and firms the seed puts on site at Northbend today', () => {
    // On site: every seeded line at Northbend still running. Its program's
    // own lines, the time-limit demo's, the rate-change seed's, and the
    // integrator's two moves (read off its source: its lines are not
    // exported).
    const onSite = northbendOnSite()
    // The rate-change person is Brightmoor's own W2 at Northbend, still working.
    expect(read('src/lib/seed-rate-change.ts')).toMatch(/on Brightmoor Staffing's own payroll/)
    const people = new Set(onSite.map((o) => o.person))
    const firms = new Set(onSite.map((o) => o.firm))
    expect(people.size).toBe(7)
    expect(firms.size).toBe(4)
    expect(STORY_BAR).toEqual({ company: 'Northbend Athletic', rest: `a sample company · ${people.size} contractors · ${firms.size} suppliers` })
    expect(firm('nike')).toBe(STORY_BAR.company)
  })

  it('the bar’s company and the table’s book are Northbend Athletic, the program the story is told from', () => {
    expect(STORIES.northbend.bar).toBe(STORY_BAR)
    expect(STORIES.northbend.book).toBe(firm('nike'))
    expect(STORIES.northbend.steps).toBe(STORY)
  })

  it('no stand-in figure from either drawing reached the panel', () => {
    const all = storyCopy().join(' ')
    for (const gone of ['Java developer', '$21,120', '$42,587', 'BR-2026-0417', 'VT-2026-0108', '86%', 'Ravi Iyer', 'Oct 5', 'Veritan Talent', '$60,000', 'top of his list']) {
      expect(all, gone).not.toContain(gone)
    }
  })
})

/**
 * The MSPs' door plays the same four steps from Aptiva Workforce's seat in
 * Cavanaugh Glassworks' program (founder, 2026-10-15: "use a sample MSP
 * company"). Read against the same seed, and against the role the seat
 * holds: a card is drawn only for an act that role may take.
 *
 * Where the seed did not hold what a Northbend-shaped step would say, the
 * step says what it does hold:
 *
 *   Northbend shape                      Cavanaugh's seed, and so the panel
 *   a card to approve a timesheet        none: Cavanaugh's Program Manager role,
 *                                        the one the seat holds, cannot approve
 *                                        hours; the hiring manager is named
 *   a card to pay an invoice receipt     none: the role cannot pay; the AP clerk
 *                                        is named
 *   an invoice number and its total      no number: Cavanaugh's are made from a
 *                                        record id and the world's birthday; the
 *                                        one bill with a fixed amount is the
 *                                        direct Wrenfield line's, 40 h × $96
 *   a week over its hours                none at Cavanaugh; both waiting weeks
 *                                        are 40 hours
 */
describe('The MSP door’s story is Aptiva Workforce’s seat in Cavanaugh Glassworks’ program, read against the seed', () => {
  const corning = PROGRAMMES.find((p) => p.client === 'corning')!
  const SEEDS = read('src/lib/seed-programmes.ts')
  const story = STORIES.aptiva
  const at = (chip: string) => story.steps.find((s) => s.chip === chip)!
  const saidAt = (chip: string) => {
    const s = at(chip)
    return [...s.chat.flatMap((m) => [m.text, m.card?.t ?? '', m.card?.s ?? '']), ...s.table.rows.flat().map(text), s.sum.rest].join(' ')
  }
  const rows = (chip: string) => at(chip).table.rows.map((r) => r.map(text))
  const live = (person: string) => corning.placements.find((p) => p.person === person && p.state === 'IN_PROGRESS')!
  /** Cavanaugh's own Program Manager role: the role the seat holds, and so what Aptiva may do there. */
  const pm = rolesFor('CLIENT').find((r) => r.name === 'Program Manager')!.permissions

  it('Aptiva sits in Cavanaugh’s own Program Manager role, granted by Cavanaugh, and the bar says so', () => {
    const seat = WORLD.slice(WORLD.indexOf("await step('program-office-seat'"))
    expect(seat).toMatch(/const cavanaugh = firmBySlug\.get\('corning'\)/)
    expect(seat).toMatch(/const aptiva = firmBySlug\.get\('aptiva'\)/)
    expect(seat).toMatch(/where: \{ companyId: cavanaugh\.id, name: 'Program Manager' \}/)
    expect(seat).toMatch(/clientCompanyId: cavanaugh\.id,\s*officeCompanyId: aptiva\.id,\s*roleId: pmRole\.id/)
    expect(WORLD).toMatch(/slug: 'aptiva',\s*name: 'Aptiva Workforce',\s*kind: 'MSP'/)
    expect(APTIVA_BAR.company).toBe(firm('aptiva'))
    expect(APTIVA_BOOK).toBe(firm('corning'))
    expect(story.book).toBe(firm('corning'))
    expect(APTIVA_BAR.rest).toMatch(new RegExp(`^an MSP running ${firm('corning')}’ program · `))
    // The seed's client desks take their permissions from the default client roles.
    expect(SEEDS).toMatch(/for \(const r of rolesFor\('CLIENT'\)\)/)
  })

  it('the bar’s 5 contractors and 5 suppliers are the people and firms the seed puts on site at Cavanaugh today', () => {
    const onSite: { person: string; firm: string }[] = [
      ...corning.placements.filter((p) => p.state === 'IN_PROGRESS').map((p) => ({ person: p.person, firm: p.via[1] })),
      ...(corning.direct && corning.direct.endsInDays > 0 ? [{ person: corning.direct.person, firm: corning.direct.supplier }] : []),
      ...SECTOR_SUPPLIERS.filter((s) => s.client === 'corning' && s.endsInDays > 0).map((s) => ({ person: s.person.name, firm: s.slug })),
    ]
    const people = new Set(onSite.map((o) => o.person))
    const firms = new Set(onSite.map((o) => o.firm))
    expect(people.size).toBe(5)
    expect(firms.size).toBe(5)
    expect(APTIVA_BAR.rest).toBe(`an MSP running ${firm('corning')}’ program · ${people.size} contractors · ${firms.size} suppliers`)
  })

  it('the job step sends Cavanaugh’s seeded open job, at its band and months, to the three suppliers the seed releases it to, and the seat may send it', () => {
    const s = saidAt('Job')
    expect(s).toContain(`Bill rate ${dollars(corning.open.band[0])} to ${dollars(corning.open.band[1])} an hour`)
    expect(s).toContain(`12 months · ${corning.loc}`)
    const title = corning.open.title
    expect(at('Job').chat[1].card!.t.startsWith(title)).toBe(true)
    expect(at('Job').chat[0].text).toContain(`Send the ${title.toLowerCase()} job`)
    const to = corning.open.to.map(firm)
    expect(at('Job').chat[1].card!.s).toBe(to.join(', '))
    expect(s).toContain(`Sent to Cavanaugh’s ${to.length} approved suppliers`)
    // Within the program's band, so it cleared by rule.
    expect(corning.open.band[1]).toBeLessThanOrEqual(corning.governance.band[1])
    expect(corning.open.band[0]).toBeGreaterThanOrEqual(corning.governance.band[0])
    expect(rows('Job')).toEqual([
      [title, String(to.length), `$${corning.open.band[0] / 100}–${corning.open.band[1] / 100}`, 'Open'],
      [`Automation engineers (${corning.routed.headcount})`, '—', `up to ${dollars(corning.routed.billMax)}`, 'Waiting for the VP'],
    ])
    expect(corning.routed.title).toBe('Fab expansion — six automation engineers')
    expect(corning.routed.headcount).toBe(6)
    // Sending a job to suppliers is the role's to do.
    expect(hasPermission(pm, 'requirements.distribute')).toBe(true)
  })

  it('the candidates step lists the job’s two seeded candidates, each with the supplier, rate and interview state the seed gives them, and the seat may schedule the interview', () => {
    const r = rows('Candidates')
    expect(r.map((x) => x[0])).toEqual(corning.open.candidates.map((c) => c.person))
    for (const [i, c] of corning.open.candidates.entries()) {
      expect(r[i][1], c.person).toBe(firm(c.from))
      expect(r[i][2], c.person).toBe(dollars(c.rate))
    }
    const yuki = corning.open.candidates.find((c) => c.person === 'Yuki Tanaka')!
    const priyanka = corning.open.candidates.find((c) => c.person === 'Priyanka Rao')!
    // Proposed: waiting on the supplier to confirm.
    expect(yuki.round?.state).toBe('PROPOSED')
    expect(r[0][3]).toBe('Interview proposed')
    expect(saidAt('Candidates')).toContain(`Yuki Tanaka’s interview is proposed and waits for ${firm(yuki.from)} to confirm`)
    expect(priyanka.status).toBe('SUBMITTED')
    expect(priyanka.round).toBeUndefined()
    expect(r[1][3]).toBe('Submitted')
    expect(at('Candidates').chat[1].card!.s).toBe(`${firm(priyanka.from)} · ${dollars(priyanka.rate)} an hour · submitted`)
    expect(saidAt('Candidates')).toContain(`${corning.open.candidates.length} candidates from ${new Set(corning.open.candidates.map((c) => c.from)).size} suppliers`)
    // Setting up a round asks for requirements.write, read under the seat's role.
    expect(read('src/app/api/submissions/[id]/interviews/route.ts')).toContain("hasPermission(deskPermissions, 'requirements.write')")
    expect(hasPermission(pm, 'requirements.write')).toBe(true)
  })

  it('the timesheets step shows the two weeks the seed leaves waiting at Cavanaugh, 40 hours each, and draws no card because the seat cannot approve hours', () => {
    const tomasz = live('Tomasz Nowak'), felix = live('Felix Brandt'), aisha = live('Aisha Bello')
    expect(tomasz.weeks).toEqual({ approved: 3, awaiting: 1 })
    expect(felix.weeks).toEqual({ approved: 1, awaiting: 1 })
    expect(aisha.weeks).toEqual({ approved: 2, awaiting: 0 })
    // No long week at Cavanaugh, so every week is the seed's ordinary 40.
    for (const p of corning.placements) expect(p.exceptionHours, p.person).toBeUndefined()
    for (const p of corning.placements) expect(p.overtimeWeekHours, p.person).toBeUndefined()
    expect(SEEDS).toMatch(/export function week\(w: number, hours = 40, from\?: Date\)/)
    // Every filed week is whole, whatever day the world was born: week w
    // back opens on a Sunday 7w+1 to 7w+7 days ago (seedWeek counts from
    // the Sunday of yesterday's week), so its Monday is at most 7w+6 days
    // back, and a start on or before that day files all five weekdays.
    expect(read('src/lib/seed-days.ts')).toContain('const sunday = atMidnight(weekStart(isoOf(day(-1))))')
    expect(SEEDS).toContain('const start = day(-pl.startedDaysAgo)')
    for (const p of [tomasz, felix, aisha]) expect(p.startedDaysAgo, p.person).toBeGreaterThanOrEqual(7 * (p.weeks!.approved + p.weeks!.awaiting) + 6)
    // And nothing else waits: the direct line's one week is signed, and the sector supplier's latest is not waiting.
    expect(SEEDS).toMatch(/totalHours: 40, status: 'APPROVED', submittedAt: dWe/)
    expect(SECTOR_SUPPLIERS.find((s) => s.client === 'corning')!.lastWeekAwaiting).toBe(false)
    const waiting = corning.placements.filter((p) => p.state === 'IN_PROGRESS' && (p.weeks?.awaiting ?? 0) > 0)
    expect(waiting.map((p) => p.person)).toEqual(['Tomasz Nowak', 'Felix Brandt'])
    expect(rows('Timesheets')).toEqual([
      ['Tomasz Nowak', firm(tomasz.via[1]), '40', 'Waiting'],
      ['Felix Brandt', firm(felix.via[1]), '40', 'Waiting'],
      ['Aisha Bello', firm(aisha.via[1]), '40', 'Approved'],
    ])
    expect(saidAt('Timesheets')).toContain(`${waiting.length} timesheets are waiting, 40 hours each`)
    // The seed signs every week as the hiring manager.
    expect(SEEDS).toMatch(/approvedById: desk\.hiring\.personId/)
    expect(saidAt('Timesheets')).toContain(`${corning.people.hiring}, Cavanaugh’s hiring manager, approves them`)
    // Silence approves on Cavanaugh's orders, and only Cavanaugh's, after five days.
    const o2c = read('src/lib/seed-order-to-cash.ts')
    expect(o2c).toContain('const autoApproves = p.buyerSlug === `${ctx.prefix}corning`')
    expect(o2c).toContain('approvalWindowDays: autoApproves ? 5 : null')
    expect(saidAt('Timesheets')).toContain('after 5 days with no answer')
    // The seat holds Cavanaugh's Program Manager role, which cannot approve a week: no card.
    expect(hasPermission(pm, 'timesheets.approve')).toBe(false)
    expect(at('Timesheets').chat.some((m) => m.card)).toBe(false)
  })

  it('the invoices step names the one bill with a fixed amount, Wrenfield’s 40 hours at $96, names no invoice number, and draws no card because the seat cannot pay', () => {
    const d = corning.direct!
    expect(d.supplier).toBe('wrenfield')
    expect(d.person).toBe('Elsa Thornquist')
    // One week of 40 hours, billed at the line's rate, still submitted.
    expect(SEEDS).toMatch(/const dCents = 40 \* d\.rates\[0\]/)
    expect(SEEDS).toMatch(/total: dCents \/ 100, paid: 0,\s*issuedAt: dIssued, submittedAt: dIssued, dueAt: dDue\.dueAt, status: 'SUBMITTED'/)
    const amount = (40 * d.rates[0]) / 100
    const said = saidAt('Invoices')
    expect(said).toContain(`${firm('wrenfield')}’s invoice bills ${d.person}’s 40 approved hours at her contract rate of ${dollars(d.rates[0])}: $${amount.toLocaleString('en-US')}`)
    expect(at('Invoices').sum.big).toBe(`$${amount.toLocaleString('en-US')}`)
    expect(said).toContain(`${corning.people.ap}, Cavanaugh’s AP clerk, pays it`)
    // Cavanaugh's numbers are a record id and a date; none is named.
    expect(SEEDS).toMatch(/const number = `IN-\$\{topContract\.id/)
    expect(storyCopy().join(' ')).not.toMatch(/IN-[A-Z0-9]/)
    // Billed hours: every signed week of a placement with a bill is on one, at 40 hours each.
    const tomasz = live('Tomasz Nowak'), aisha = live('Aisha Bello'), felix = live('Felix Brandt')
    expect(tomasz.invoice).toBe('SUBMITTED')
    expect(aisha.invoice).toBe('PAID')
    expect(felix.invoice).toBeNull()
    expect(at('Invoices').table.title).toBe('Invoice receipts by supplier')
    expect(rows('Invoices')).toEqual([
      [firm('wrenfield'), d.person, '40 h', 'Waiting for AP'],
      [firm(tomasz.via[1]), 'Tomasz Nowak', `${tomasz.weeks!.approved * 40} h`, 'Waiting for AP'],
      [firm(aisha.via[1]), 'Aisha Bello', `${aisha.weeks!.approved * 40} h`, 'Paid'],
    ])
    // Paying is the AP clerk's; the seat's role cannot record a payment.
    expect(hasPermission(pm, 'payments.record')).toBe(false)
    expect(at('Invoices').chat.some((m) => m.card)).toBe(false)
  })

  it('never names the sub-vendor below a supplier Cavanaugh pays, because that name is the supplier’s to keep', () => {
    // Tomasz Nowak is Sahasra Infotech's, through Vertex Global; Cavanaugh sees the rung it pays.
    expect(live('Tomasz Nowak').via).toEqual(['corning', 'vertex-global', 'sahasra'])
    const all = storyCopy().join(' ')
    expect(all).not.toContain(firm('sahasra'))
  })

  it('tells the same four steps in the same shape as the Northbend story, at most four columns to a table', () => {
    const shape = (s: StoryStep) => [s.n, s.chip, s.embed]
    expect(story.steps.map(shape)).toEqual(STORY.map(shape))
    for (const s of story.steps) {
      expect(s.table.head.length, s.chip).toBeLessThanOrEqual(4)
      expect(s.table.flash, s.chip).toBeLessThan(s.table.rows.length)
    }
    expect(storyChromeCopy('aptiva')).toEqual([APTIVA_BAR.company, APTIVA_BAR.rest, APTIVA_WHO, ...STEP_NAMES])
  })

  it('the bar names Rashida Coleman, Aptiva’s program manager, the first seat the seed gives Aptiva, on every step', () => {
    expect(WORLD).toMatch(/slug: 'aptiva',\s*name: 'Aptiva Workforce',\s*kind: 'MSP',\s*seat: 'Program manager', who: 'Rashida Coleman'/)
    expect(APTIVA_WHO).toBe('Rashida Coleman, program manager')
    for (const s of story.steps) expect(s.who, s.chip).toBe(APTIVA_WHO)
  })
})

/**
 * Every door and tab plays its own party's person, at the step that party
 * acts on (founder, 2026-10-19). Read against the seed like the rest.
 *
 * Where the seed and the drawing differ, and so the panel:
 *
 *   drawing                              seed, and so the panel
 *   Brightmoor "3 people billing ·       "3 people billing": the seed holds both,
 *   2 clients"                           and the door's 165-word cap holds one
 *   Techpeple's bench: Meera             Grace Lindqvist and Peter Halloran;
 *   Balakrishnan, Ifeoma Balogun,        Meera is Nimbus Talent's and Tobias
 *   Tobias Lindgren                      Lindgren Sahasra Infotech's; Ifeoma is
 *                                        Techpeple's, already put forward
 *   a bench shown "to a firm that        shown to the firms Techpeple sells to:
 *   asked"                               no seeded firm has asked (no BenchWant)
 *   Felix Brenner Nov 2, Amara Nwosu     no dates: both count from the day the
 *   Nov 9                                world was born; "a week later" is the
 *                                        seed's 18 and 25 days
 *   Sunil Raghavan flags who rolls off   Ingrid Solberg flagged them, and the
 *                                        panel says so; Sunil asks
 *   $3,600 "on the seeded pay date"      "$3,600 to pay her": the pay date
 *                                        counts from the day the world was born
 *
 * And three doors play a week one step on from where the seed leaves it,
 * the way the home page signs the week the seed leaves with Marcus: the
 * sub-vendor's week (the seed's waits on Marcus), the solopreneur's
 * (the seed's newest waits on Halcyon), and Jonas Whitaker asked for his
 * papers. The names, hours and rates are the seed's.
 */
describe('Each door plays its own party’s person, every name and figure the seed’s', () => {
  const only = (key: StoryKey) => { expect(STORIES[key].steps, key).toHaveLength(1); return STORIES[key].steps[0] }
  const rows = (st: StoryStep) => st.table.rows.map((r) => r.map(text))
  const SEEDS = read('src/lib/seed-programmes.ts')
  const DOORS_SEED = read('src/lib/seed-doors.ts')
  const helena = nike.placements.find((p) => p.person === 'Helena Marsh' && p.state === 'IN_PROGRESS')!

  it('each door and tab plays its own story at the step its person acts on', () => {
    expect(Object.fromEntries(everyDoorView().map((v) => [v.href, [v.story, v.step]]))).toEqual({
      '/for/suppliers': ['brightmoor', 'submit'],
      '/for/suppliers?tab=sub': ['techpeple-sub', 'approve'],
      '/for/suppliers?tab=bench': ['techpeple-bench', 'submit'],
      '/for/program-offices': ['aptiva', 'source'],
      '/for/integrators': ['teleworld', 'submit'],
      '/for/contractors': ['helena', 'approve'],
      '/for/contractors?tab=solo': ['byrne', 'pay'],
    })
    for (const v of everyDoorView()) {
      const story = STORIES[v.story!]
      expect(story.steps[startOf(story, storyIndex(v.step))].embed, v.href).toBe(v.step)
    }
  })

  it('a prime vendor is Marisa Delacroix, Brightmoor’s account manager, reading who applied from Brightmoor and the one on its bench who matches', () => {
    expect(WORLD).toContain("{ desk: 'account',    role: 'Account Manager',     name: 'Marisa Delacroix' }")
    const st = only('brightmoor')
    expect(st.who).toBe('Marisa Delacroix, account manager')
    expect(STORIES.brightmoor.bar.company).toBe(firm('brightmoor'))
    expect(st.chat[0].text).toBe(`Who applied for Northbend’s ${nike.open.title} job from us?`)
    const rajesh = nike.open.candidates.find((c) => c.from === 'brightmoor')!
    expect(nike.open.candidates.filter((c) => c.from === 'brightmoor')).toHaveLength(1)
    expect(rajesh.person).toBe('Rajesh Iyer')
    expect(rajesh.round).toMatchObject({ state: 'CONFIRMED' })
    expect(rajesh.round!.interviewers.some((i) => i.startsWith(nike.people.hiring))).toBe(true)
    expect(st.chat[1].text).toBe(`Rajesh Iyer, at ${dollars(rajesh.rate)} an hour. His interview with ${nike.people.hiring} is booked.`)
    const jonas = OFFERED.find((o) => o.name === 'Jonas Whitaker')!
    expect(jonas.firm).toBe('brightmoor')
    expect(jonas.skills).toEqual(expect.arrayContaining(['HCM integration', 'REST APIs']))
    expect(st.chat[2].card).toEqual({ t: 'Ask Jonas Whitaker for his work papers?', s: `On your bench · HCM integration, REST APIs · ${jonas.location}`, yes: 'Ask' })
    // Nothing on file for him: the seed that writes him writes no paperwork, and no other seed names him.
    expect(read('src/lib/seed-bench-matching.ts')).not.toMatch(/verification|docInstance/i)
    for (const f of ['seed-world', 'seed-programmes', 'seed-doors']) expect(read(`src/lib/${f}.ts`), f).not.toContain('Jonas Whitaker')
    expect(rows(st)).toEqual([
      ['Rajesh Iyer', 'Applied', dollars(rajesh.rate), 'Interview booked'],
      ['Jonas Whitaker', 'Your bench', `$${jonas.rate[0] / 100}–${jonas.rate[1] / 100}`, 'Papers missing'],
    ])
    expect(after(st.table.rows[1][3])).toBe('Papers asked')
  })

  it('Brightmoor’s bar counts the 3 people it has billing today: Omar Haddad and Rosa Delgado at Northbend, and one at Nordway Retail', () => {
    const atNorthbend = northbendOnSite().filter((o) => o.firm === 'brightmoor').map((o) => o.person)
    expect(atNorthbend.sort()).toEqual(['Omar Haddad', 'Rosa Delgado'])
    const elsewhere = WORLD_PLACEMENTS.map((via, i) => ({ via, person: WORLD_NAMES[i] })).filter((p) => p.via.includes('brightmoor'))
    expect(elsewhere.map((p) => [p.person, p.via[0]])).toEqual([['Ravi Subramanian', 'nordway']])
    // Lucía's and the time-limit person's Brightmoor lines have ended.
    expect(nike.placements.filter((p) => p.via[1] === 'brightmoor' && p.state !== 'IN_PROGRESS').every((p) => p.state === 'ENDED')).toBe(true)
    expect(TENURE_DEMO.lines.find((l) => l.via === 'brightmoor')!.state).toBe('ENDED')
    expect(STORIES.brightmoor.bar.rest).toBe(`a sample supplier · ${atNorthbend.length + elsewhere.length} people billing`)
  })

  it('a sub-vendor is Bhavesh Nair, Techpeple’s owner, accepting Helena Marsh’s 40 hours after the client and the prime, and billing the prime for the same hours', () => {
    expect(WORLD).toMatch(/slug: 'techpeple',\s*name: 'Techpeple',\s*kind: 'VENDOR',\s*seat: 'Bench sales', who: 'Bhavesh Nair'/)
    const st = only('techpeple-sub')
    expect(st.who).toBe('Bhavesh Nair, owner')
    expect(helena.via).toEqual(['nike', 'computer-systems', 'techpeple'])
    const [, primeRate, pay] = helena.rates
    expect(st.chat[1].text).toBe(`Helena Marsh’s 40 hours at ${firm('nike')}. ${nike.people.hiring} signed them, and ${firm('computer-systems')} accepted them.`)
    expect(st.chat[1].card).toEqual({ t: 'Accept Helena Marsh’s week?', s: `40 hours · ${money(40 * pay)} to pay her`, yes: 'Accept' })
    expect(money(40 * pay)).toBe('$3,600')
    expect(st.chat[2].text).toBe(`Accepted. Bill ${firm('computer-systems')} for the same 40 hours at ${dollars(primeRate)}: ${money(40 * primeRate)}.`)
    expect(st.sum.big).toBe(money(40 * primeRate))
    // Every signed week was accepted by the employer, last, at its own rate.
    expect(SEEDS).toMatch(/role: 'EMPLOYER_ACCEPTANCE', hours: sheetHours,\s*rateCents: pl\.rates\[pl\.rates\.length - 1\]/)
    expect(rows(st)).toEqual([
      [WEEK_WORDS[0], '40', '$3,600', 'Waiting for you'],
      [WEEK_WORDS[1], '40', '$3,600', 'Accepted'],
      [WEEK_WORDS[2], '40', '$3,600', 'Accepted'],
    ])
  })

  it('a bench vendor is Linnea Qadri, Techpeple’s recruiter, reading who on its bench its partners see, each by their own yes', () => {
    expect(WORLD).toContain("{ desk: 'recruiter',  role: 'Recruiter',        name: 'Linnea Qadri' }")
    const st = only('techpeple-bench')
    expect(st.who).toBe('Linnea Qadri, recruiter')
    // The bench nobody has placed: the names after the placements, a firm each in turn.
    const vendors = WORLD.match(/const benchVendors = \[([^\]]+)\]/)![1].split(',').map((x) => x.trim().replace(/'/g, ''))
    const bench = WORLD_NAMES.slice(WORLD_PLACEMENTS.length).map((name, i) => ({ name, firm: vendors[i % vendors.length], i }))
    const techpeple = bench.filter((b) => b.firm === 'techpeple')
    expect(techpeple.map((b) => b.name)).toEqual(['Grace Lindqvist', 'Peter Halloran'])
    // Marketed: shown to the firms Techpeple trades with, by the person's own grant.
    expect(WORLD).toMatch(/consultantId: profile\.id, companyId: co\.id, tier: 'MARKETING', state: 'GRANTED'/)
    expect(st.chat[1].text).toBe('Grace Lindqvist and Peter Halloran. Each said yes to being shown to the firms we sell to.')
    // Ifeoma is Techpeple's, put forward to Computer Systems for Harlow Health's job, screen booked, I-9 asked.
    const live = WORLD.slice(WORLD.indexOf("role: 'Epic Beaker analyst'"), WORLD.indexOf("role: 'Python market risk developer'"))
    expect(live).toMatch(/prime: 'computer-systems', bench: 'techpeple',\s*name: 'Ifeoma Balogun'/)
    expect(live).toMatch(/stage: 'SCREEN', mode: 'PHONE', state: 'CONFIRMED'/)
    expect(DOORS_SEED).toMatch(/companySlug: 'techpeple',\s*name: 'I-9, with the document it is completed from',\s*needsSignature: true/)
    expect(st.chat[2].text).toBe(`Ifeoma Balogun is put forward to ${firm('computer-systems')} for an Epic Beaker analyst job. Her phone screen is booked. Her I-9 is not signed yet.`)
    // The seed's other two in flight are other firms' bench, so the panel does not claim them.
    expect(WORLD).toMatch(/bench: 'sahasra',\s*name: 'Tobias Lindgren'/)
    expect(WORLD).toMatch(/bench: 'nimbus',\s*name: 'Meera Balakrishnan'/)
    for (const not of ['Tobias Lindgren', 'Meera Balakrishnan']) expect(sayAll(st)).not.toContain(not)
    const skills = (i: number) => (WORLD.slice(WORLD.indexOf('const PLACEMENTS: Placement[] = [')).match(/skills: \[([^\]]+)\]/g)![i]).replace(/skills: \[|\]|'/g, '').split(',').map((x) => x.trim()).join(', ')
    expect(rows(st)).toEqual([
      ['Grace Lindqvist', skills(techpeple[0].i % WORLD_PLACEMENTS.length), 'Shown to partners'],
      ['Peter Halloran', skills(techpeple[1].i % WORLD_PLACEMENTS.length), 'Shown to partners'],
      ['Ifeoma Balogun', 'Epic, Beaker, LIS', 'I-9 not signed'],
    ])
  })

  it('an integrator is Sunil Raghavan, Teleworld’s delivery manager, putting its own employee Karthik Menon forward, with the two coming off Northbend’s project after him', () => {
    expect(WORLD).toMatch(/slug: 'teleworld',\s*name: 'Teleworld Solutions',\s*kind: 'GSI',\s*seat: 'Delivery manager', who: 'Sunil Raghavan'/)
    const st = only('teleworld')
    expect(st.who).toBe('Sunil Raghavan, delivery manager')
    // Karthik: Teleworld's own W2, his Corveldt line ended, the open DO-178C job not given to him by the seed.
    expect(DOORS_SEED).toMatch(/sellerSlug: 'teleworld',\s*clientSlug: 'corveldt',\s*buyFromId: null,\s*contractType: 'W2'/)
    expect(DOORS_SEED).toMatch(/skills: \['DO-178C', 'LDRA', 'Embedded C'\][\s\S]{0,200}state: 'ENDED'/)
    expect(DOORS_SEED).toContain('Deliberately not the open DO-178C seat.')
    const job = WORLD.slice(WORLD.indexOf("role: 'DO-178C verification engineer'"))
    expect(job).toMatch(/^role: 'DO-178C verification engineer', skills: \['DO-178C', 'Embedded C', 'LDRA'\],\s*loc: 'Wichita, KS',\s*client: 'corveldt', prime: 'teleworld'/)
    expect(st.chat[0].text).toBe(`Who on our bench matches ${firm('corveldt')}’s DO-178C verification engineer job?`)
    expect(st.chat[1].card).toEqual({ t: 'Put Karthik Menon forward?', s: `DO-178C verification engineer · ${firm('corveldt')} · Wichita, KS`, yes: 'Put forward' })
    // The two flagged at Northbend, a week apart, both by Ingrid Solberg.
    const moves = read('src/lib/seed-internal-moves.ts')
    const end = (who: string) => Number(moves.match(new RegExp(`person: '${who}'[\\s\\S]*?end: (-?\\d+)`))![1])
    expect(end('Amara Nwosu') - end('Felix Brenner')).toBe(7)
    expect(moves).toContain('releasedById: staff.get(MOVE_DESKS.portland.name)!')
    expect(MOVE_DESKS.portland.name).toBe('Ingrid Solberg')
    expect(moves).toMatch(/person: 'Amara Nwosu'[\s\S]*?release: \{ keepUntil: 45 \}/)
    expect(st.chat[2].text).toBe(`Felix Brenner comes off ${firm('nike')}’s project first, then Amara Nwosu a week later. Ingrid Solberg flagged them both.`)
    // 4 on site through Teleworld: its three moves still running, and one through the world's Corveldt chain.
    const running = [...moves.matchAll(/person: '([^']+)', client: '[^']+'[\s\S]*?end: (-?\d+)/g)].filter((m) => Number(m[2]) > 0).map((m) => m[1])
    const chain = WORLD_PLACEMENTS.map((via, i) => ({ via, person: WORLD_NAMES[i] })).filter((p) => p.via.includes('teleworld')).map((p) => p.person)
    expect(running).toEqual(['Felix Brenner', 'Amara Nwosu', 'Deepa Varma'])
    expect(chain).toEqual(['Marcus Whitfield'])
    expect(STORIES.teleworld.bar.rest).toBe(`a sample integrator and supplier · ${running.length + chain.length} people on site`)
  })

  it('a worker is Helena Marsh on her own Ask Etyme: the home page’s Timesheets step, the same words', () => {
    expect(STORIES.helena.steps[0]).toBe(step('Timesheets'))
    expect(STORIES.helena.bar.company).toBe(firm('nike'))
  })

  it('a solopreneur is Colleen Byrne billing Halcyon Talent from her own company for 36 hours Harlow Health signed and Halcyon accepted, at the agreed $92', () => {
    const st = only('byrne')
    expect(st.who).toBe('Colleen Byrne, ICU travel nurse and owner')
    expect(STORIES.byrne.bar.company).toBe('Byrne Critical Care LLC')
    expect(DOORS_SEED).toContain("name: 'Byrne Critical Care LLC',\n      kind: 'CONSULTANT_CORP'")
    // Her company sells her to Halcyon at $92; her week is three twelve-hour shifts.
    expect(DOORS_SEED).toMatch(/companyId: nurseCorp\.id,\s*clientCompanyId: co\('halcyon'\)\.id,[\s\S]{0,400}billRate: 9_200/)
    expect(DOORS_SEED).toContain('return { start, end, days, hours: 36 }')
    // Signed down the chain: Harlow Health, then Halcyon, then her own company.
    expect(DOORS_SEED).toMatch(/role: 'CLIENT_APPROVAL', hours: week\.hours,\s*rateCents: 11_400/)
    expect(DOORS_SEED).toMatch(/companyId: co\('halcyon'\)\.id, role: 'PASS_THROUGH'/)
    expect(st.chat[1].text).toBe(`Yes. ${firm('harlow-health')} signed your 36 hours, and ${firm('halcyon')} accepted them. You bill Halcyon only for hours it accepted.`)
    expect(money(36 * 9200)).toBe('$3,312')
    expect(st.chat[1].card).toEqual({ t: `Bill ${firm('halcyon')} $3,312?`, s: '36 accepted hours × $92 · Byrne Critical Care LLC', yes: 'Send' })
    expect(rows(st)).toEqual([
      [WEEK_WORDS[0], '36', '$3,312', 'Ready to bill'],
      [WEEK_WORDS[1], '36', '$3,312', 'Accepted'],
      [WEEK_WORDS[2], '36', '$3,312', 'Accepted'],
    ])
    expect(after(st.table.rows[0][3])).toBe('Billed')
  })

  it('every door story is one step in the Northbend story’s shape, with the four chips on its bar and its person first', () => {
    for (const key of ['brightmoor', 'techpeple-sub', 'techpeple-bench', 'teleworld', 'helena', 'byrne'] as StoryKey[]) {
      const st = only(key)
      const same = STORY.find((x) => x.chip === st.chip)!
      expect([st.n, st.embed], key).toEqual([same.n, same.embed])
      expect(st.table.head.length, key).toBeLessThanOrEqual(4)
      expect(st.table.flash, key).toBeLessThan(st.table.rows.length + (st.table.added ? 1 : 0))
      expect(st.chat.some((m) => m.card || m.status), `${key} has something that presses`).toBe(true)
      expect(storyChromeCopy(key)).toEqual([STORIES[key].bar.company, STORIES[key].bar.rest, st.who, ...STEP_NAMES])
    }
  })
})

describe('The panel plays the four steps and is never blank', () => {
  const panel = (start = 0) => renderToStaticMarkup(createElement(StoryPanel, { start }, createElement('a', { href: '/demo' }, 'Open the demo, no account')))

  it('every step is in the HTML the server sends, and the page’s own step is the one shown with no script', () => {
    for (const start of [0, 1, 2, 3]) {
      const html = panel(start)
      for (const s of STORY) expect(html, s.chip).toContain(`data-story-step="${s.n}"`)
      const shown = [...html.matchAll(/data-story-step="(\d)"( hidden="")?/g)].filter((m) => !m[2]).map((m) => Number(m[1]))
      expect(shown).toEqual([start + 1])
      // The whole conversation of that step, card included, with nothing to wait for.
      const s = STORY[start]
      for (const m of s.chat) expect(html).toContain(m.text.replace(/’/g, '’').slice(0, 30))
      expect(html).not.toMatch(/<iframe/)
      expect(html).toContain('Open the demo, no account')
    }
  })

  it('each page starts the panel at its own step: the home page at Job, a product page or door at the step it is about', () => {
    expect(storyIndex(undefined)).toBe(0)
    expect(storyIndex('overview')).toBe(0)
    expect(STORY.map((s) => storyIndex(s.embed))).toEqual([0, 1, 2, 3])
    for (const m of MODULES) expect(STORY[storyIndex(m.step)], m.route).toBeDefined()
    for (const p of PARTY_PAGES) expect(STORY[storyIndex(p.step)], p.route).toBeDefined()
    const skeleton = read('src/lib/public-site/skeleton.tsx')
    expect(skeleton).toContain('<StoryPanel start={storyIndex(step)} story={story}>{children}</StoryPanel>')
  })

  it('plays Northbend Athletic’s story unless a page names another, and the MSPs’ door names Aptiva Workforce’s', () => {
    const northbend = renderToStaticMarkup(createElement(StoryPanel, { start: 0 }))
    expect(northbend).toContain(STORY_BAR.rest)
    expect(northbend).not.toContain(APTIVA_BAR.company)
    const aptiva = renderToStaticMarkup(createElement(StoryPanel, { start: 0, story: 'aptiva' }))
    expect(aptiva).toContain(`<b class="font-semibold text-etyme-ink">${APTIVA_BAR.company}</b>`)
    expect(aptiva).toContain(APTIVA_BAR.rest)
    // Every table names whose book it is: Cavanaugh's, not Aptiva's own.
    expect(aptiva).toContain(`>${APTIVA_BOOK}</span>`)
    expect(aptiva).not.toContain(STORY_BAR.company)
    for (const s of STORIES.aptiva.steps) expect(aptiva, s.chip).toContain(`data-story-step="${s.n}"`)
    // Only the MSPs' door plays it.
    const doors = PARTY_PAGES.filter((p) => p.story === 'aptiva').map((p) => p.slug)
    expect(doors).toEqual(['program-offices'])
    for (const m of MODULES) expect((m as { story?: string }).story, m.route).toBeUndefined()
  })

  it('plays a step about every five seconds, presses the card itself and lights the changed row, and holds for a reader', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(read('src/lib/public-site/story.ts')).toMatch(/STORY_STEP_MS = 5\d{3}\b/)
    expect(src).toContain('after(STORY_STEP_MS')
    expect(src).toContain('setPlayed((p) => ({ ...p, pressed: true }))')
    expect(src).toContain('setLit(true)')
    expect(src).toContain('onMouseEnter={() => { hold.current = true }}')
    expect(src).toContain('onFocus={() => { hold.current = true }}')
    // The chips jump to a step.
    expect(src).toContain('onClick={() => playStep(i)}')
    expect(src).toContain('aria-pressed={i === cur}')
  })

  it('names the person in front of the step on the bar, with a small dot, and on a door draws the four chips with its one step pressable', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain('{steps[cur].who}')
    expect(src).toContain('rounded-full bg-etyme-verified')
    const home = panel(2)
    expect(home).toContain(NORTHBEND_PEOPLE.worker)
    const door = renderToStaticMarkup(createElement(StoryPanel, { start: storyIndex('approve'), story: 'techpeple-sub' }))
    expect(door).toContain('Bhavesh Nair, owner')
    for (const name of STEP_NAMES) expect(door, name).toContain(name)
    // One step to press on a door; the other three are names.
    expect(door.match(/<button/g)).toHaveLength(1)
    expect(door).toContain('data-story-step="3"')
    expect(door).not.toMatch(/data-story-step="3" hidden/)
  })

  it('flips a status where a card would press, shows the row a card adds once it presses, and plays a door’s one step once and holds', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain('const presses = (m: StoryStep[\'chat\'][number]) => Boolean(m.card || m.status)')
    expect(src).toContain('<PillView c={m.status} pressed={played.pressed} />')
    expect(src).toContain('const p = pressed && c.then ? c.then : c')
    expect(src).toContain('played.pressed && s.table.added ? [...s.table.rows, s.table.added] : s.table.rows')
    expect(src).toContain('if (steps.length === 1) return')
    // With no script nothing is pressed: Helena's week reads as waiting, and the job is not yet sent.
    const html = panel(2)
    expect(html).toContain('Waiting for Marcus Oyelaran')
    expect(html).not.toContain('Signed by Marcus Oyelaran ✓')
    expect(panel(0)).not.toContain('HCM integration lead (open)')
  })

  it('never plays for a reader who asked for reduced motion', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(src).toContain('if (!reduce.current) playStep(first)')
    expect(src).toMatch(/motion-reduce:transition-none/)
  })

  it('draws the real mark from the logo component, never a redrawn one', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain("import { EtymeMark } from '@/components/logo'")
    expect(src).not.toMatch(/<path|viewBox/)
  })

  it('on a phone the chat sits over the table, and a table keeps at most four columns with the wide one left off', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain('md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')
    expect(src).toContain("h.wide ? 'hidden sm:table-cell' : ''")
    for (const s of STORY) {
      expect(s.table.head.length, s.chip).toBeLessThanOrEqual(4)
      expect(s.table.head.filter((h) => !h.wide).length, s.chip).toBeLessThanOrEqual(4)
    }
  })

  it('is about two thirds of the old frame’s height on a desktop', () => {
    // The frame was 16:10 at the page's width, about 690 pixels; the panel's
    // body is held at 300 and grows only with its words.
    expect(read('src/lib/public-site/story-panel.tsx')).toContain('md:min-h-[300px]')
  })
})

describe('The four steps are Job, Candidates, Timesheets and Invoices everywhere public', () => {

  it('the chips, the spine, the menu and the documentation say the same four names in the same order', () => {
    expect(STEP_NAMES).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices'])
    expect(STEPS.map((s) => s.name)).toEqual(STEP_NAMES)
    // The step pages' eyebrows. (The header's menu sheet carried the four
    // from 2026-10-15 until it left on 2026-10-19.)
    expect(MODULES.map((m) => m.eyebrow)).toEqual(STEP_NAMES.map((n, i) => `Step ${i + 1} of 4 · ${n}`))
    // The documentation's step pages, one per step since 2026-10-15, each "Step n of 4".
    const docSteps = STEP_PAGES.filter((p) => p.n !== null)
    expect(docSteps.map((p) => p.title)).toEqual(STEP_NAMES)
    expect(docSteps.map(stepEyebrow)).toEqual(STEP_NAMES.map((_, i) => `Step ${i + 1} of 4`))
    // One page per step since 2026-10-15: Candidates is /submissions, where
    // who applied is read; /contracts folded into it and redirects there.
    expect(STEPS.map((s) => s.route)).toEqual(['/requisitions', '/submissions', '/timesheets', '/invoices'])
  })

  it('no public page draws the live frame any more; the sample screens it loaded are left in place, unlinked', () => {
    expect(existsSync(join(ROOT, 'src/lib/public-site/home-demo.tsx'))).toBe(false)
    for (const f of ['src/app/page.tsx', 'src/lib/public-site/skeleton.tsx', 'src/lib/public-site/sub-page.tsx', 'src/lib/public-site/party-page.tsx', 'src/lib/public-site/module-page.tsx']) {
      expect(read(f), f).not.toMatch(/<iframe|\/embed\/demo/)
    }
    expect(existsSync(join(ROOT, 'src/app/embed'))).toBe(true)
  })
})
