import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, freshWorld } from './harness'

import { GET as myWork, POST as fileWeek } from '@/app/api/me/work/route'
import { POST as approveWeek } from '@/app/api/timesheets/[id]/approve/route'
import { POST as sendLink } from '@/app/api/week-approvals/route'
import { GET as endingSoon } from '@/app/api/rolloff/route'
import { POST as claimRolloff } from '@/app/api/rolloff/[id]/claim/route'
import { GET as myPapers } from '@/app/api/me/papers/route'
import { paperRows, workStops } from '@/app/dashboard/my-work/paperwork-rows'

/**
 * The worker tester's walk of 2026-10-03, on the seeded Helena Marsh:
 * Northbend Athletic ← Computer Systems Inc ← Techpeple, who employs her.
 *
 * One week must read one way everywhere on her page, the filing card must
 * name every firm that signs in order, and the row must offer approval by
 * email only where the week's own page would allow it.
 */

const HELENA = 'helena.marsh@seed.etyme.invalid'
const NORTHBEND_HIRING = 'world-nike-hiring@demo.etyme.local'

async function page() {
  as(HELENA)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

async function file(week: any, hours: Record<string, number>) {
  as(HELENA)
  const r = await json(await fileWeek(req('POST', '/api/me/work', {
    contractId: (await page()).filing[0].contractId, periodStart: week.periodStart, hours,
  })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.timesheetId as string
}

const row = (d: any, id: string) => d.timesheets.find((t: any) => t.id === id)

describe('on the seeded Helena Marsh, one week reads one way on every tile and row', () => {
  beforeAll(async () => {
    await freshWorld()
  })

  it('the filing card names Northbend Athletic first, then Computer Systems Inc, then Techpeple', async () => {
    const d = await page()
    expect(d.filing[0].signs).toBe(
      'After you send, Northbend Athletic approves them first. Then Computer Systems Inc and Techpeple accept them, in that order.'
    )
  })

  it('a week Northbend signed reads as waiting on Computer Systems Inc on the tile and the row, and is not counted as approved', async () => {
    const before = await page()
    const week = before.filing[0].weeks.find((w: any) => w.days.length >= 1)
    const id = await file(week, { [week.days[0]]: 8 })

    as(NORTHBEND_HIRING)
    const signed = await json(await approveWeek(req('POST', `/api/timesheets/${id}/approve`, {}), { params: Promise.resolve({ id }) }))
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)

    const d = await page()
    expect(row(d, id).state.word).toBe('waiting on Computer Systems Inc')
    expect(d.summary.waiting.note).toContain('with Computer Systems Inc')
    expect(d.summary.waiting.note).not.toContain('Techpeple')
    // Counted once, on the waiting card, and never also as approved.
    expect(d.summary.awaitingApproval).toBe(before.summary.awaitingApproval + 1)
    expect(d.summary.signed.value).toBe(before.summary.signed.value)
    expect(d.summary.signed.note).not.toContain('waiting')
    // The tile and the rows agree.
    const waitingRows = d.timesheets.filter((t: any) => t.state.word.startsWith('waiting on')).length
    expect(d.summary.awaitingApproval).toBeGreaterThanOrEqual(waitingRows)
  })

  it('a week over the job’s hours does not offer email: the row says Northbend Athletic signs it in Etyme', async () => {
    const d0 = await page()
    const week = d0.filing[0].weeks.find((w: any) => w.days.length >= 5)
    expect(week, 'a whole week is open to file').toBeTruthy()
    const hours = Object.fromEntries(week.days.slice(0, 5).map((day: string) => [day, 9]))
    const id = await file(week, hours)
    const d = await page()
    expect(row(d, id).door.says).toBe('Northbend Athletic signs this week in Etyme')
  })

  it('once a link has gone to Northbend’s approver, the row says so and offers no second one', async () => {
    // The two sentences above filed every week open today: this week so
    // far, and the one whole week the seed left unfiled. Every other week
    // is seeded Sunday to Saturday, so nothing is left to file until time
    // passes. The walk moves on a week, and Helena files the week she is
    // then in — a week nobody has touched, inside her placement.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 7 * 86_400_000))
    const d0 = await page()
    const week = d0.filing[0].weeks[0]
    expect(week, 'the week she is in a week from now is open to file').toBeTruthy()
    expect(week.periodEnd, 'and it is the week she is then in, not a gap left behind').toBe(new Date().toISOString().slice(0, 10))
    const id = await file(week, { [week.days[0]]: 8 })
    expect(row(await page(), id).door.says).toBe('Ask the client to approve by email')

    as(HELENA)
    const sent = await json(await sendLink(req('POST', '/api/week-approvals', {
      how: 'LINK', timesheetId: id, approverName: 'Marcus Oyelaran', approverEmail: 'marcus.oyelaran@northbend.example',
    })))
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)

    const says = row(await page(), id).door.says as string
    expect(says).toMatch(/^Link sent to Marcus Oyelaran, /)
    expect(says).not.toContain('Ask the client')
  })

  afterAll(() => {
    vi.useRealTimers()
  })
})


const NORTHBEND_PROGRAM = 'world-nike-programme@demo.etyme.local'

describe('Northbend Athletic’s Ending soon, as its program office reads it', () => {
  it('Felix Brenner ends at the Tualatin site, with the rate Northbend pays', async () => {
    as(NORTHBEND_PROGRAM)
    const r = await json(await endingSoon(req('GET', '/api/rolloff?window=30')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const all = [...r.body.data.tracked, ...r.body.data.untracked]
    const felix = all.find((x: any) => x.person?.name === 'Felix Brenner')
    expect(felix, 'Felix is ending inside thirty days').toBeTruthy()
    expect(felix.workLocation.city).toBe('Tualatin')
    expect(felix.billRate).toBeGreaterThan(0)
  })

  it('the client cannot claim the supplier’s offboarding, and is told whose it is', async () => {
    as(NORTHBEND_PROGRAM)
    const r = await json(await endingSoon(req('GET', '/api/rolloff?window=30')))
    const ev = r.body.data.tracked[0]
    expect(ev, 'a tracked rolloff is on the seeded world').toBeTruthy()
    const c = await json(await claimRolloff(req('POST', `/api/rolloff/${ev.id}/claim`), { params: Promise.resolve({ id: ev.id }) }))
    expect(c.status).toBe(403)
    expect(c.body.error.message).toMatch(/^Only .+ works this offboarding, because the contract is theirs\.$/)
  })
})


/**
 * Your work as the seeded Colleen Byrne reads it (founder, 2026-10-19):
 * an ICU nurse paid through her own company, Byrne Critical Care LLC,
 * placed at Harlow Health through Halcyon Talent, whose state license
 * runs out inside the assignment.
 */
const COLLEEN = 'colleen.byrne@seed.etyme.invalid'

describe('Colleen Byrne’s Your work, as the owner of the firm that holds her rate', () => {
  async function hers() {
    as(COLLEEN)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    return r.body.data
  }

  it('her rate line says it is not recorded and she adds it on Contracts, with a link to the contract, because her own firm holds it', async () => {
    const d = await hers()
    const p = d.placements.find((x: any) => x.payer === 'Byrne Critical Care LLC')
    expect(p, 'her placement through her own company').toBeTruthy()
    expect(p.payRate).toBeNull()
    expect(p.rateNote).toBe('Your rate on this contract is not recorded. Add it on Contracts.')
    expect(p.rateNote).not.toContain('Byrne Critical Care LLC has it')
    expect(p.rateLink).toBe(`/dashboard/placements/${p.id}`)
  })

  it('Helena Marsh, whose rate another firm pays, keeps her rate and is offered no contract link', async () => {
    as(HELENA)
    const r = await json(await myWork(req('GET', '/api/me/work')))
    for (const p of r.body.data.placements) expect(p.rateLink).toBeNull()
  })

  it('weeks with no rate on her own firm’s contract are never said to be with an agency', async () => {
    const d = await hers()
    expect(d.owed.says).not.toContain('your agency')
    expect(d.owed.says).toMatch(/\d+ more weeks? (is|are) accepted\. Your rate on that contract is not recorded, so there is no figure for (it|them)\./)
  })

  it('her license to practice, which a start is refused without, runs out inside sixty days and is the one line at the top of her page', async () => {
    const d = await hers()
    expect(d.runningOut).toHaveLength(1)
    const [license] = d.runningOut
    expect(license.state).toBe('RUNS_OUT')
    expect(license.name).toBe('Professional license')
    expect(license.issuer).toBe('Wisconsin Board of Nursing')
    expect(license.daysLeft).toBeGreaterThan(0)
    expect(license.daysLeft).toBeLessThanOrEqual(60)

    as(COLLEEN)
    const papers = await json(await myPapers(req('GET', '/api/me/papers')))
    const lines = workStops({ rows: paperRows(papers.body.data), runningOut: d.runningOut })
    expect(lines).toEqual([
      `Your professional license (Wisconsin Board of Nursing) runs out in ${license.daysLeft} days. Your work stops if it lapses.`,
    ])
  })

  it('Helena Marsh owes two papers that do not stop her working, so her page has no line at the top', async () => {
    as(HELENA)
    const work = await json(await myWork(req('GET', '/api/me/work')))
    as(HELENA)
    const papers = await json(await myPapers(req('GET', '/api/me/papers')))
    const rows = paperRows(papers.body.data)
    expect(rows.filter((r) => r.todo === 'upload').length).toBeGreaterThan(0)
    expect(workStops({ rows, runningOut: work.body.data.runningOut })).toEqual([])
  })
})
