import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { returnedWeek } from '@/lib/consultant-portfolio'
import { submitLink } from '@/lib/bench-filter'

/**
 * Two follow-ups to the worker's week and the bench, 2026-09-28.
 *
 * A week sent back for correction came back as OPEN, and Your work
 * counted its days as filed, so it was offered nowhere and could not be
 * corrected. And the bench's Submit opened the submit form and dropped
 * who had been chosen.
 */

const TODAY = '2026-09-30'
const contract = { startDate: '2026-03-12', endDate: '2027-03-07' }
const sheet = {
  id: 'ts1', periodStart: '2026-09-21', periodEnd: '2026-09-27',
  days: { '2026-09-21': 8, '2026-09-22': 10, '2026-09-23': 0 },
}
const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

describe('a week sent back is corrected and sent again', () => {
  it('a returned week is offered again with the hours that were on it and the reason it came back', () => {
    const w = returnedWeek(sheet, contract, [], TODAY, 'Rejected by Camille Whitford: Tuesday was a holiday')!
    expect(w.timesheetId).toBe('ts1')
    expect(w.hours).toEqual({ '2026-09-21': 8, '2026-09-22': 10 })
    expect(w.reason).toBe('Rejected by Camille Whitford: Tuesday was a holiday')
    expect(w.days).toHaveLength(7)
  })

  it('a returned week’s own days are not counted as already filed against it', () => {
    const others = [{ periodStart: '2026-09-14', periodEnd: '2026-09-20' }]
    expect(returnedWeek(sheet, contract, others, TODAY, null)!.days[0]).toBe('2026-09-21')
  })

  it('a day another week claims, or after the placement ended, is not offered on the returned week', () => {
    const others = [{ periodStart: '2026-09-27', periodEnd: '2026-09-27' }]
    const ended = { ...contract, endDate: '2026-09-25' }
    const w = returnedWeek(sheet, ended, others, TODAY, null)!
    expect(w.days).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'])
  })

  it('a returned week none of whose days can carry hours any more is not offered as a form', () => {
    expect(returnedWeek(sheet, { ...contract, startDate: '2026-10-01' }, [], TODAY, null)).toBeNull()
  })

  it('Your work offers the returned week, sends it again through the same door, and never re-sends it unchanged from the open list', () => {
    const page = read('app/dashboard/my-work/page.tsx')
    expect(page).toContain('function SentBack')
    expect(page).toContain('Send again')
    expect(page).toContain('!returnedIds.has(t.id)')
    const route = read('app/api/me/work/route.ts')
    expect(route).toContain("action: 'TIMESHEET_REJECTED'")
    expect(route).toContain("t.status === 'OPEN' && asDates(t).periodStart === periodStart")
  })
})

describe('the bench’s Submit carries who was chosen', () => {
  it('one person chosen opens the submit form with that person', () => {
    expect(submitLink([{ personId: 'p 1', name: 'Lena Ostrova', consent: 'GRANTED' }])).toEqual({
      ok: true, href: '/dashboard/submissions?new=1&person=p%201',
    })
  })

  it('a partner’s person, who agreed to be marketed by that partner, goes through by id too', () => {
    expect(submitLink([{ personId: 'p2', name: 'Grace Lindqvist' }]).ok).toBe(true)
  })

  it('more than one chosen is refused in a sentence, never opened with one and the rest dropped', () => {
    const v = submitLink([
      { personId: 'a', name: 'A', consent: 'GRANTED' },
      { personId: 'b', name: 'B', consent: 'GRANTED' },
      { personId: 'c', name: 'C', consent: 'GRANTED' },
    ])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('You chose 3 people')
  })

  it('somebody who has not answered, or declined, is not put forward from the bench', () => {
    const invited = submitLink([{ personId: 'a', name: 'Lena Ostrova', consent: 'INVITED' }])
    const declined = submitLink([{ personId: 'a', name: 'Lena Ostrova', consent: 'DECLINED' }])
    expect(invited.ok || declined.ok).toBe(false)
    if (!invited.ok) expect(invited.says).toContain('has not answered your invitation yet')
    if (!declined.ok) expect(declined.says).toContain('declined to be marketed by you')
  })

  it('nobody chosen is told to choose', () => {
    expect(submitLink([])).toEqual({ ok: false, says: 'Choose the person to put forward first.' })
  })

  it('the bench’s Submit button asks submitLink rather than opening an empty form', () => {
    const page = read('app/dashboard/bench/page.tsx')
    expect(page).toContain('submitLink(chosen)')
    expect(page).not.toContain("router.push('/dashboard/submissions?new=1')")
  })
})
