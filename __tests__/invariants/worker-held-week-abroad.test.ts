import { describe, it, expect } from 'vitest'
import { heldWeeksFor, heldWeekSays, heldAbroadNote } from '@/lib/consultant-portfolio/held-weeks'
import { payLineFor, type PayLineInput } from '@/lib/money/pay-line'

const base: PayLineInput = {
  buyAfterHours: null, sellAfterHours: null, personName: 'Omar Haddock', employerName: 'Northwind Staffing',
  contractType: 'W2', weAreTheEmployer: true, exemptStatus: null,
  where: { wageRule: null, payCurrency: 'USD', entityCountry: null, siteCountry: 'IN' },
}
const days46 = { '2026-06-08': 10, '2026-06-09': 9, '2026-06-10': 9, '2026-06-11': 9, '2026-06-12': 9 }
const sheet = (id: string, days: Record<string, number>) => ({ id, allDays: days, days, leaveDays: {}, accepted: null }) as never
const held = (siteCountry: string) =>
  heldWeeksFor({
    line: payLineFor({ ...base, where: { ...base.where, siteCountry } }), cutOvertime: 'OVERTIME_FIRST' as never,
    paidHours: () => 0, sheets: [sheet('s1', days46)],
  })

describe('a worker whose week abroad is held reads it on her own page', () => {
  it('her page keeps the country a held week was worked in', () => {
    expect(held('IN')[0].workedIn).toBe('India')
  })

  it('a week held for the old US reason carries no country', () => {
    expect(held('US')[0].workedIn).toBeUndefined()
  })

  it('a worker whose week abroad is held reads which country, and that her employer is setting the overtime rules there', () => {
    const says = heldWeekSays('Northwind Staffing', 46, 40, { weekOf: '2026-06-07', workedIn: 'India' })
    expect(says).toBe(
      'Your week of June 7, 2026 is on hold. You worked 46 hours in India, and your employer is still setting the overtime rules there. It is paid once they are set.'
    )
  })

  it('the abroad sentence states no pay figure and blames her for nothing', () => {
    const says = heldWeekSays('Northwind Staffing', 46, 40, { weekOf: '2026-06-07', workedIn: 'India' })
    expect(says).not.toMatch(/\$|owed|exempt|whether you are paid/)
    for (const sentence of says.split('. ')) expect(sentence.split(' ').length).toBeLessThan(25)
  })

  it('a week held for the old US reason keeps its wording', () => {
    expect(heldWeekSays('Northwind Staffing', 46, 40)).toBe(
      'Northwind Staffing is holding this week, 46 hours, until it records whether you are paid overtime for hours over 40. It is then paid once, with any overtime owed.'
    )
  })

  it('the line under what she is owed names the week and the country', () => {
    expect(heldAbroadNote('2026-06-07', 'India')).toBe('Your week of June 7, 2026 is on hold while your employer sets the overtime rules for India.')
  })
})
