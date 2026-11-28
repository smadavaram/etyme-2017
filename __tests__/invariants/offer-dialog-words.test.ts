import { describe, it, expect } from 'vitest'
import { offerIntro, rowStatusWord } from '@/app/dashboard/submissions/offer-words'
import { readFileSync } from 'fs'

describe('the offer dialog and the submissions row', () => {
  it('the supplier reads that the hiring firm sets the rate, the start and the terms', () => {
    expect(offerIntro('SUPPLIER')).toBe('The firm that hires sets the rate, the start and the terms. You record her answer.')
    expect(offerIntro('BUYER')).toContain('are yours to set')
  })
  it('the offer dialog prints a start date through formatDay, never as an ISO date', () => {
    const src = readFileSync('src/app/dashboard/submissions/offer-dialog.tsx', 'utf8')
    expect(src).toContain('formatDay(live.startDate)')
    expect(src).not.toContain('starting ${live.startDate}')
  })
  it('a submissions row reads Accepted once the offer is accepted, and Offered while it waits', () => {
    const offer = (state: string) => ({ state, rate: 40, currency: 'USD', startDate: null, side: 'BUYER' as const })
    expect(rowStatusWord('OFFERED', offer('ACCEPTED'))).toBe('Accepted')
    expect(rowStatusWord('OFFERED', offer('PROPOSED'))).toBe('Offered')
    expect(rowStatusWord('PLACED', offer('ACCEPTED'))).not.toBe('Accepted')
  })
})
