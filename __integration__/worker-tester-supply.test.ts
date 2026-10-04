import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, freshWorld } from './harness'

import { GET as myWork, POST as fileWeek } from '@/app/api/me/work/route'
import { POST as approveWeek } from '@/app/api/timesheets/[id]/approve/route'
import { POST as sendLink } from '@/app/api/week-approvals/route'
import { GET as endingSoon } from '@/app/api/rolloff/route'
import { POST as claimRolloff } from '@/app/api/rolloff/[id]/claim/route'

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
    const d0 = await page()
    const week = d0.filing[0].weeks.find((w: any) => w.days.length >= 1)
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
