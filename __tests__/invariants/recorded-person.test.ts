import { describe, it, expect } from 'vitest'
import { mayRecordFor, recordingFloor, type PersonTies } from '@/lib/money/recorded-person'

/**
 * "Record a placement" writes a sell line, a pay line and the cycles
 * behind them. It used to take any person id, so a firm could put a
 * placement — and the tenure, paperwork and pay that hang off it — on
 * somebody who was nobody to it.
 */

const none: PersonTies = { seat: false, listing: false, contract: false, putForward: false, ownCompany: false }

describe('whom a firm may record a placement for', () => {
  it('a person with no seat, no listing, no contract and no submission at the firm is refused, in a sentence naming the two ways in', () => {
    const r = mayRecordFor(none, 'Rosa Amadi')
    expect(r).toEqual({
      ok: false,
      code: 'NO_RECORD_OF_PERSON',
      says: 'Rosa Amadi is not on your bench, your payroll or any contract of yours; invite them or list them first.',
      field: 'personId',
    })
  })

  it('somebody holding a seat at the firm may be recorded — the employment is the consent', () => {
    expect(mayRecordFor({ ...none, seat: true }, 'Rosa Amadi')).toEqual({ ok: true, via: 'seat' })
  })

  it('somebody listed on the firm’s bench may be recorded', () => {
    expect(mayRecordFor({ ...none, listing: true }, 'Rosa Amadi')).toEqual({ ok: true, via: 'listing' })
  })

  it('somebody the firm already holds a line for, either side, may be recorded again', () => {
    expect(mayRecordFor({ ...none, contract: true }, 'Rosa Amadi')).toEqual({ ok: true, via: 'contract' })
  })

  it('somebody the firm put forward, or who was put forward to it, may be recorded', () => {
    expect(mayRecordFor({ ...none, putForward: true }, 'Rosa Amadi')).toEqual({ ok: true, via: 'putForward' })
  })

  it('a one-person company may record its own owner’s work', () => {
    expect(mayRecordFor({ ...none, ownCompany: true }, 'Rosa Amadi')).toEqual({ ok: true, via: 'ownCompany' })
  })
})

describe('the first day a recorded placement owes a reminder', () => {
  it('is the recording day at midnight UTC, whatever the hour it was recorded', () => {
    expect(recordingFloor(new Date('2026-10-06T23:59:00Z')).toISOString()).toBe('2026-10-06T00:00:00.000Z')
    expect(recordingFloor(new Date('2026-10-06T00:00:00Z')).toISOString()).toBe('2026-10-06T00:00:00.000Z')
  })

  it('is never the day before, so a week that ended yesterday and is due today keeps its reminder', () => {
    expect(recordingFloor(new Date('2026-10-06T08:00:00Z')).getTime()).toBeGreaterThan(new Date('2026-10-05T23:59:59Z').getTime())
  })
})
