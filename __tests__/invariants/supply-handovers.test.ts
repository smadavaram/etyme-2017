import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { paidDatesFrom, signedWeeksCard } from '@/lib/consultant-portfolio'
import { paidByPayroll, workerPaidAs } from '@/lib/money/paid-through'
import { hoursInMonth } from '@/lib/periods'
import { askedLines } from '@/app/dashboard/my-work/asked-to-market'
import { EMPTY_PAPERWORK } from '@/app/dashboard/my-work/paperwork-rows'
import { ENDING_SOON_READERS, CHECK_IN_READERS } from '@/lib/releasing-soon'
import { hasAnyPermission } from '@/lib/permissions'
import { rolesFor } from '@/lib/company-defaults'
import { BURN_READ_BY } from '@/lib/bench-filter'

/**
 * Handovers to supply from money and the architect, 2026-09-30, as
 * sentences: the worker's own page, the bench's cost, and who reads who
 * is ending soon.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const d = (iso: string) => new Date(iso)
const key = (bc: string, p: string, t: string, day: string) => `${bc}|${p}|${t}|${day}`
const run = (at: string, runAt?: string) => ({
  at: d(at),
  payload: { action: 'process', ...(runAt ? { runAt } : {}), contracts: [{ buyContractId: 'bc1', paid: [{ personId: 'p', timesheetId: 't', day: '2026-09-01' }] }] },
})

describe('the day a week was paid, on the worker’s own page', () => {
  it('a run pressed on or before the pay day it settled reads as paid on that pay day', () => {
    const runAt = '2026-09-08T10:00:00.000Z'
    const payDays = [{ dueOn: d('2026-09-10T00:00:00Z'), completedAt: d(runAt) }]
    const out = paidDatesFrom([run('2026-09-08T10:00:05Z', runAt)], [], ['bc1'], key, () => payDays)
    expect(out.get('bc1|p|t|2026-09-01')).toBe('2026-09-10')
  })

  it('a run pressed after its pay day reads as paid the day it ran, never as on time', () => {
    const runAt = '2026-09-14T10:00:00.000Z'
    const payDays = [{ dueOn: d('2026-09-10T00:00:00Z'), completedAt: d(runAt) }]
    const out = paidDatesFrom([run('2026-09-14T10:00:00Z', runAt)], [], ['bc1'], key, () => payDays)
    expect(out.get('bc1|p|t|2026-09-01')).toBe('2026-09-14')
  })

  it('without the line’s pay days, a week reads as paid the day the run was pressed', () => {
    const out = paidDatesFrom([run('2026-09-08T10:00:00Z')], [], ['bc1'], key)
    expect(out.get('bc1|p|t|2026-09-01')).toBe('2026-09-08')
  })

  it('hours this month count only the days inside the month, so a week crossing its edge is split', () => {
    const sheet = {
      id: 's', periodStart: d('2026-08-31T00:00:00Z'), periodEnd: d('2026-09-04T00:00:00Z'), totalHours: 40,
      days: { '2026-08-31': 8, '2026-09-01': 8, '2026-09-02': 8, '2026-09-03': 8, '2026-09-04': 8 },
    }
    expect(hoursInMonth([sheet], d('2026-09-15T00:00:00Z')).hours).toBe(32)
    expect(src('src/app/api/me/work/route.ts')).toContain('hoursThisMonth: hoursInMonth(')
  })
})

describe('somebody paid through their own company', () => {
  it('a line bought from the person’s own company is paid by invoice receipt, so nothing on it is owed as wages', () => {
    const line = { contractType: 'C2C', vendorCompanyId: 'her-llc', supplierSellContractId: null }
    expect(paidByPayroll(line)).toBe(false)
    expect(workerPaidAs(line, ['her-llc'])).toBe('OWN_COMPANY_BILLS')
    const route = src('src/app/api/me/work/route.ts')
    expect(route).toContain('if (!paidByPayroll(bc)) continue')
    expect(route).toContain('ownCompanyBills')
  })

  it('her signed weeks read "your company bills these", never "your vendor bills these"', () => {
    expect(signedWeeksCard({ notBilled: 3, employed: null, ownCompany: true }).note).toBe('your company bills these')
    expect(signedWeeksCard({ notBilled: 3, employed: null }).note).toBe('your vendor bills these')
  })

  it('her page says what her company bills in place of what is owed to her', () => {
    expect(src('src/app/dashboard/my-work/page.tsx')).toContain('What your company bills')
  })
})

describe('asking is not granting', () => {
  it('a firm that has only asked is not counted as marketing somebody on their working life', () => {
    expect(src('src/lib/portfolio-data.ts')).toContain("where: { revokedAt: null, state: 'GRANTED' },")
  })

  it('a person a firm asked to market reads the question first on their own page, one line per firm', () => {
    expect(askedLines([{ company: 'CloudEPA' }, { company: 'Nimbus Talent' }])).toEqual([
      'CloudEPA has asked to market you. Say yes or no',
      'Nimbus Talent has asked to market you. Say yes or no',
    ])
    expect(askedLines([])).toEqual([])
  })

  it('an empty file is said in one line', () => {
    expect(EMPTY_PAPERWORK).toBe('Nothing is on your file yet, and no document is asked of you.')
  })
})

describe('what the bench costs', () => {
  it('is never asked for by a seat that does not read pay, which is told whose number it is', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('hasPermission(session.permissions, READS_PAY)')
    expect(page).toContain("if (!readsPay) { setBurnLoading(false); return }")
    expect(BURN_READ_BY).toBe('What the bench costs is read by the desks that read pay')
  })

  it('counts working days through the one door, skips anybody placed and billing, and answers in cents', () => {
    const route = src('src/app/api/bench/burn/route.ts')
    expect(route).toContain('burnOf({ payRateCents: payRate, billing: liveOf(l.consultant.personId), benchSince }, now)')
    expect(route).toContain('if (!b.onBench) continue')
    for (const f of ['dailyCents', 'toDateCents', 'workingDays', 'calendarDays', 'says']) expect(route).toContain(f)
    expect(route).not.toMatch(/daysOnBench \* 5 \/ 7/)
  })
})

describe('who reads who is ending soon', () => {
  const ENGINEER = ['assignments.read', 'timesheets.read']

  it('a delivery engineer on the roster reads neither who is rolling off nor the bench check-ins', () => {
    expect(hasAnyPermission(ENGINEER, ENDING_SOON_READERS)).toBe(false)
    expect(hasAnyPermission(ENGINEER, CHECK_IN_READERS)).toBe(false)
  })

  it('every desk a client seats still reads Ending soon', () => {
    for (const r of rolesFor('CLIENT')) {
      expect(hasAnyPermission(r.permissions, ENDING_SOON_READERS), r.name).toBe(true)
    }
  })

  it('both routes ask before they read', () => {
    expect(src('src/app/api/rolloff/route.ts')).toContain('hasAnyPermission(caller.permissions, ENDING_SOON_READERS)')
    expect(src('src/app/api/texts/route.ts')).toContain('hasAnyPermission(caller.permissions, CHECK_IN_READERS)')
  })
})
