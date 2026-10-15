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
  STORY, STORY_BAR, STEP_NAMES, STORIES, APTIVA_BAR, APTIVA_BOOK, storyCopy, storyChromeCopy, storyIndex,
  type Cell, type StoryStep,
} from '@/lib/public-site/story'
import { SECTOR_SUPPLIERS } from '@/lib/seed-sector-suppliers'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'
import { StoryPanel } from '@/lib/public-site/story-panel'
import { STEPS } from '@/lib/public-site/steps'
import { STEP_PAGES, stepEyebrow } from '@/lib/public-site/docs/process'
import { MENU } from '@/lib/public-site/nav'
import { MODULES } from '@/lib/public-site/modules'
import { PARTY_PAGES } from '@/lib/public-site/parties'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const nike = PROGRAMMES.find((p) => p.client === 'nike')!
const WORLD = read('src/lib/seed-world.ts')
/** A seeded firm's name, read off the world seed's firm list. */
const firm = (slug: string) => WORLD.match(new RegExp(`slug: '${slug}',\\s*name: '([^']+)'`))![1]
const dollars = (cents: number) => `$${cents / 100}`
const text = (c: Cell) => (typeof c === 'string' ? c : c.t)
const step = (chip: string) => STORY.find((s) => s.chip === chip)!
const said = (chip: string) => {
  const s = step(chip)
  return [...s.chat.flatMap((m) => [m.text, m.card?.t ?? '', m.card?.s ?? '']), ...s.table.rows.flat().map(text), s.sum.rest].join(' ')
}

describe('Every name and figure on the panel is the seeded demo’s', () => {

  it('the job step sends the seeded open job, at its rate band and months, to the three suppliers the seed releases it to', () => {
    const s = said('Job')
    expect(s).toContain(nike.open.title)
    expect(s).toContain(`Bill rate ${dollars(nike.open.band[0])} to ${dollars(nike.open.band[1])} an hour`)
    // The seed writes the open job for twelve months, at the program's own site.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/billMin: p\.open\.band\[0\], billMax: p\.open\.band\[1\], months: 12/)
    expect(s).toContain(`12 months · ${nike.loc}`)
    const to = nike.open.to.map(firm)
    expect(step('Job').chat[1].card!.s).toBe(to.join(', '))
    expect(s).toContain(`Sent to your ${to.length} approved suppliers`)
    // Within the band, so it cleared by rule: the seed writes it AUTO_APPROVED.
    expect(read('src/lib/seed-programmes.ts')).toMatch(/status: 'OPEN', approvalState: 'AUTO_APPROVED'/)
    expect(nike.open.band[1]).toBeLessThanOrEqual(nike.governance.band[1])
    const [open, routed] = step('Job').table.rows
    expect(open.map(text)).toEqual([nike.open.title, String(to.length), `$${nike.open.band[0] / 100}–${nike.open.band[1] / 100}`, 'Open'])
    expect(routed.map(text)).toEqual([`Supply-planning consultants (${nike.routed.headcount})`, '—', `up to ${dollars(nike.routed.billMax)}`, 'Waiting for the VP'])
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

  it('the timesheets step shows the three weeks the seed leaves waiting: Helena at 40, Lucía at 44 on a 40-hour week, Omar at 45', () => {
    const live = (person: string) => nike.placements.find((p) => p.person === person && p.state === 'IN_PROGRESS')!
    const helena = live('Helena Marsh'), lucia = live('Lucía Fernández'), omar = live('Omar Haddad')
    expect(helena.weeks?.awaiting).toBe(1)
    expect(helena.exceptionHours).toBeUndefined()
    expect(lucia.weeks?.awaiting).toBe(1)
    expect(lucia.exceptionHours).toBe(44)
    expect(omar.overtimeWeekHours).toBe(45)
    expect(omar.overtimeAfterHours).toBe(40)
    // The client sees the rung it pays: the first firm under it.
    const rows = step('Timesheets').table.rows.map((r) => r.map(text))
    expect(rows).toEqual([
      ['Helena Marsh', firm(helena.via[1]), '40', 'Approved'],
      ['Lucía Fernández', firm(lucia.via[1]), String(lucia.exceptionHours), `${lucia.exceptionHours! - 40} hours over`],
      ['Omar Haddad', firm(omar.via[1]), String(omar.overtimeWeekHours), `${omar.overtimeWeekHours! - 40} hours over`],
    ])
    expect(said('Timesheets')).toContain('3 timesheets are waiting for your approval. Two are over the hours on the contract.')
    expect(said('Timesheets')).toContain(`Lucía Fernández submitted 44 hours on a 40-hour contract. Check with ${firm('pinnacle')}`)
  })

  it('the invoices step is the twin’s two seeded receipts from Pinnacle, priced at the rate Pinnacle bills Northbend', () => {
    const [clean, held] = NORTHBEND_TWIN_RECEIPTS.filter((r) => r.number)
    expect(clean).toMatchObject({ number: 'PR-2026-0441', hoursBilled: 40, hoursAccepted: 40, expected: 'CLEAN', supplier: 'pinnacle' })
    expect(held).toMatchObject({ number: 'PR-2026-0442', hoursBilled: 41.5, hoursAccepted: 40, expected: 'MISMATCH', supplier: 'pinnacle' })
    const rate = nike.placements.find((p) => p.person === clean.person && p.via[1] === 'pinnacle' && p.state === 'IN_PROGRESS')!.rates[0]
    const total = (clean.hoursBilled * rate) / 100
    expect(step('Invoices').chat[1].card!.t).toBe(`Pay invoice ${clean.number} for $${total.toLocaleString('en-US')}?`)
    expect(step('Invoices').chat[1].card!.s).toContain(`${clean.hoursAccepted} approved hours × ${dollars(rate)}`)
    // The list a client reads for what suppliers send is invoice receipts (CLAUDE.md, 2026-09-28).
    expect(step('Invoices').table.title).toBe('Invoice receipts')
    expect(step('Invoices').table.head[0].t).toBe('Invoice receipt')
    expect(step('Invoices').table.rows.map((r) => r.map(text))).toEqual([
      [clean.number, `${clean.hoursBilled} h`, `${clean.hoursAccepted} h`, 'Paid'],
      [held.number, `${held.hoursBilled} h`, `${held.hoursAccepted} h`, `On hold: ${held.hoursBilled - held.hoursAccepted} h over`],
    ])
    expect(said('Invoices')).toContain(`it bills ${held.hoursBilled} hours, but ${held.hoursAccepted} were approved`)
    expect(said('Invoices')).toContain(firm('pinnacle'))
  })

  it('the bar’s 7 contractors and 4 suppliers are the people and firms the seed puts on site at Northbend today', () => {
    // On site: every seeded line at Northbend still running. Its program's
    // own lines, the time-limit demo's, the rate-change seed's, and the
    // integrator's two moves (read off its source: its lines are not
    // exported).
    const moves = read('src/lib/seed-internal-moves.ts')
    const onSite: { person: string; firm: string }[] = [
      ...nike.placements.filter((p) => p.state === 'IN_PROGRESS').map((p) => ({ person: p.person, firm: p.via[1] })),
      ...TENURE_DEMO.lines.filter((l) => l.state === 'IN_PROGRESS').map((l) => ({ person: TENURE_DEMO.person, firm: l.via })),
      { person: RATE_CHANGE_PERSON.name, firm: 'brightmoor' },
      ...[...moves.matchAll(/person: '([^']+)', client: 'nike'[\s\S]*?end: (-?\d+)/g)]
        .filter((m) => Number(m[2]) > 0).map((m) => ({ person: m[1], firm: 'teleworld' })),
    ]
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

  it('no stand-in figure from the drawing reached the panel', () => {
    const all = storyCopy().join(' ')
    for (const gone of ['Java developer', '$21,120', '$42,587', 'BR-2026-0417', 'VT-2026-0108', '86%', 'Ravi Iyer', 'Oct 5', 'Veritan Talent']) {
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
    expect(storyChromeCopy('aptiva')).toEqual([APTIVA_BAR.company, APTIVA_BAR.rest, ...STEP_NAMES])
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

  it('never plays for a reader who asked for reduced motion', () => {
    const src = read('src/lib/public-site/story-panel.tsx')
    expect(src).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(src).toContain('if (!reduce.current) playStep(start)')
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
    // The menu sheet's four cards (2026-10-15) and the step pages' eyebrows.
    expect(MENU.steps.map((s) => s.t)).toEqual(STEP_NAMES)
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
