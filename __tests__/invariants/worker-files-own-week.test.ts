import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  rungsToFile,
  openWeeks,
  checkWeek,
  mondayOf,
  FINAL_WEEK_GRACE_DAYS,
  type WorkRung,
} from '@/lib/consultant-portfolio'

/**
 * The worker files their own week.
 *
 * CLAUDE.md, Phase 1 station 6: "the worker files their own week; nobody
 * else may". Founder's lifecycle walk, 2026-09-28: a consultant's own
 * page was read-only — it listed weeks and offered to send an open one,
 * and nothing anywhere let them write a week.
 *
 * Today is Wednesday 30 September 2026 throughout.
 */

const TODAY = '2026-09-30'
const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

// Helena's chain: Techpeple sells her to Computer Systems, which sells her
// to Northbend Athletic.
const bottom: WorkRung = {
  id: 'techpeple-to-cs', personId: 'helena', companyId: 'techpeple', clientCompanyId: 'cs',
  state: 'IN_PROGRESS', startDate: '2026-03-12', endDate: '2027-03-07',
}
const top: WorkRung = {
  id: 'cs-to-northbend', personId: 'helena', companyId: 'cs', clientCompanyId: 'northbend',
  state: 'IN_PROGRESS', startDate: '2026-03-12', endDate: '2027-03-07',
}

describe('which contract a worker files against', () => {
  it('a worker in a chain files against the rung their employer holds, never a rung above it', () => {
    expect(rungsToFile([top, bottom], TODAY).map((r) => r.id)).toEqual(['techpeple-to-cs'])
  })

  it('a worker with no chain files against the one contract they are on', () => {
    const direct = { ...bottom, id: 'direct', clientCompanyId: 'northbend' }
    expect(rungsToFile([direct], TODAY).map((r) => r.id)).toEqual(['direct'])
  })

  it('the final week of a placement that ended last week can still be filed', () => {
    const ended = { ...bottom, state: 'ENDED', endDate: '2026-09-23' }
    expect(rungsToFile([ended], TODAY)).toHaveLength(1)
  })

  it(`a placement that ended more than ${FINAL_WEEK_GRACE_DAYS} days ago is no longer offered for filing`, () => {
    const ended = { ...bottom, state: 'ENDED', endDate: '2026-09-01' }
    expect(rungsToFile([ended], TODAY)).toHaveLength(0)
  })

  it('a paused, draft or cancelled placement takes no hours', () => {
    for (const state of ['PAUSED', 'DRAFT', 'CANCELLED', 'PENDING_VERIFICATION']) {
      expect(rungsToFile([{ ...bottom, state }], TODAY)).toHaveLength(0)
    }
  })
})

describe('which days are open to file', () => {
  it('weeks run Monday to Sunday', () => {
    expect(mondayOf('2026-09-30')).toBe('2026-09-28')
    expect(mondayOf('2026-09-28')).toBe('2026-09-28')
    expect(mondayOf('2026-10-04')).toBe('2026-09-28')
  })

  it('this week is offered up to today and never a day that has not happened', () => {
    const weeks = openWeeks(bottom, [], TODAY)
    expect(weeks[0].periodStart).toBe('2026-09-28')
    expect(weeks[0].periodEnd).toBe('2026-09-30')
    expect(weeks[0].days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
  })

  it('no week before the placement starts is offered, and the first week starts on the first day', () => {
    const fresh = { ...bottom, startDate: '2026-09-24' }
    const weeks = openWeeks(fresh, [], TODAY)
    expect(weeks.map((w) => w.periodStart)).toEqual(['2026-09-28', '2026-09-24'])
    expect(weeks[1].periodEnd).toBe('2026-09-27')
  })

  it('a day already on a filed week is never offered again, so two sheets never claim one day', () => {
    // The seeded world files odd spans: Thursday to Monday.
    const filed = [{ periodStart: '2026-09-17', periodEnd: '2026-09-21' }]
    const weeks = openWeeks(bottom, filed, TODAY)
    const lastWeek = weeks.find((w) => w.periodStart.startsWith('2026-09-2') && w.periodEnd === '2026-09-27')!
    expect(lastWeek.periodStart).toBe('2026-09-22')
    for (const w of weeks) expect(w.days).not.toContain('2026-09-21')
  })

  it('days either side of a filed sheet inside one week are offered as two separate runs', () => {
    const filed = [{ periodStart: '2026-09-23', periodEnd: '2026-09-24' }]
    const weeks = openWeeks(bottom, filed, TODAY).filter((w) => mondayOf(w.periodStart) === '2026-09-21')
    expect(weeks.map((w) => [w.periodStart, w.periodEnd])).toEqual([
      ['2026-09-25', '2026-09-27'],
      ['2026-09-21', '2026-09-22'],
    ])
  })

  it('nothing after the placement’s last day is offered', () => {
    const ending = { ...bottom, state: 'ENDED', endDate: '2026-09-23' }
    const weeks = openWeeks(ending, [], TODAY)
    expect(weeks[0].periodEnd).toBe('2026-09-23')
  })

  it('only the last six weeks are offered; older is a conversation with the employer', () => {
    expect(openWeeks(bottom, [], TODAY)).toHaveLength(6)
  })
})

describe('whether what the worker typed is a week somebody can sign', () => {
  const filed = [{ periodStart: '2026-09-17', periodEnd: '2026-09-21' }]
  const week = openWeeks(bottom, filed, TODAY).find((w) => w.periodEnd === '2026-09-27')!
  const check = (hours: Record<string, number | string>) => checkWeek({ week, hours, contract: bottom, filed, today: TODAY })

  it('a full week of hours is ready to send, and says how many', () => {
    const v = check({ '2026-09-22': 8, '2026-09-23': 8, '2026-09-24': 7.5 })
    expect(v.ok).toBe(true)
    expect(v.totalHours).toBe(23.5)
    expect(v.says).toContain('23.5 hours')
  })

  it('a week with no hours in it is refused in a sentence', () => {
    const v = check({ '2026-09-22': 0, '2026-09-23': '' })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('no hours')
  })

  it('hours on a day that has not happened yet are refused', () => {
    const thisWeek = openWeeks(bottom, filed, TODAY)[0]
    const v = checkWeek({ week: thisWeek, hours: { '2026-10-01': 8 }, contract: bottom, filed, today: TODAY })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('has not happened yet')
  })

  it('hours before the placement starts are refused and the sentence names the start', () => {
    const late = { ...bottom, startDate: '2026-09-23' }
    const w = openWeeks(late, [], TODAY).find((x) => x.periodEnd === '2026-09-27')!
    const v = checkWeek({ week: w, hours: { '2026-09-22': 8 }, contract: late, filed: [], today: TODAY })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('before your placement starts on Wed, Sep 23')
  })

  it('hours after the placement ended are refused and the sentence names the last day', () => {
    const ending = { ...bottom, endDate: '2026-09-23' }
    const w = openWeeks(ending, filed, TODAY).find((x) => x.periodStart === '2026-09-22')!
    const v = checkWeek({ week: w, hours: { '2026-09-24': 8 }, contract: ending, filed, today: TODAY })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('after your placement ended on Wed, Sep 23')
  })

  it('hours on a day already on a filed week are refused', () => {
    const v = check({ '2026-09-21': 8 })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('already on a week you filed')
  })

  it('a day cannot hold more than twenty-four hours, or fewer than none', () => {
    expect(check({ '2026-09-22': 25 }).says).toContain('at most 24 hours')
    expect(check({ '2026-09-22': -1 }).says).toContain('zero or more')
  })

  it('a day outside the chosen week is refused, even one that is open in another week', () => {
    const v = check({ '2026-09-29': 8 })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('is not in the week you are sending')
  })
})

describe('the page and the door behind it', () => {
  it('the worker’s own page offers a week to file and sends it for approval', () => {
    const page = read('app/dashboard/my-work/page.tsx')
    expect(page).toContain('function FileYourWeek')
    expect(page).toContain("fetch('/api/me/work', {")
    expect(page).toContain('Send for approval')
  })

  it('the server checks the week again and hands it to the one door that writes a week', () => {
    const route = read('app/api/me/work/route.ts')
    expect(route).toContain('checkWeek(')
    expect(route).toContain('rungsToFile(')
    expect(route).toContain("from '@/app/api/timesheets/route'")
    expect(route).toContain("from '@/app/api/timesheets/[id]/submit/route'")
    // It writes no timesheet itself.
    expect(route).not.toContain('prisma.timesheet.create')
  })

  it('the filing door is scoped to the signed-in person and names no other person', () => {
    const route = read('app/api/me/work/route.ts')
    const post = route.slice(route.indexOf('export async function POST'))
    expect(post).toContain('where: { personId }')
    expect(post).not.toContain('body.personId')
  })
})
