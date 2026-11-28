import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  OFFER_DECLINE_REASONS, awardFromOffer, isDeclineReason, liveForOf, mayTake, moveOffer, readOffer,
} from '@/app/api/submissions/[id]/offer/rules'

const mays = { mayHire: true, maySubmit: false }

describe('the offer rules', () => {
  it('an offer is live while it is a draft, proposed or accepted, and the database key is the submission', () => {
    expect(['DRAFT', 'PROPOSED', 'ACCEPTED'].map((s) => liveForOf(s as any, 'sub1'))).toEqual(['sub1', 'sub1', 'sub1'])
  })
  it('a declined or withdrawn offer frees the submission for a new one', () => {
    expect([liveForOf('DECLINED', 'sub1'), liveForOf('WITHDRAWN', 'sub1')]).toEqual([null, null])
  })
  it('a draft can be offered, and only a draft', () => {
    expect(moveOffer('DRAFT', 'PROPOSE')).toEqual({ ok: true, to: 'PROPOSED' })
    expect(moveOffer('PROPOSED', 'PROPOSE').ok).toBe(false)
  })
  it('an answer can only be recorded on an offer that was made', () => {
    expect(moveOffer('PROPOSED', 'ACCEPT')).toEqual({ ok: true, to: 'ACCEPTED' })
    expect(moveOffer('PROPOSED', 'DECLINE')).toEqual({ ok: true, to: 'DECLINED' })
    const draft = moveOffer('DRAFT', 'ACCEPT')
    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.says).toMatch(/cannot be recorded as accepted now/)
  })
  it('a declined offer cannot be accepted afterwards', () => {
    expect(moveOffer('DECLINED', 'ACCEPT').ok).toBe(false)
    expect(moveOffer('WITHDRAWN', 'WITHDRAW').ok).toBe(false)
  })
  it('a decline reason is one of a closed list and never free text', () => {
    expect(Object.keys(OFFER_DECLINE_REASONS)).toEqual(['RATE', 'START_DATE', 'TERMS', 'ACCEPTED_ELSEWHERE', 'CANDIDATE_WITHDREW', 'NO_REPLY'])
    expect(isDeclineReason('RATE')).toBe(true)
    expect(isDeclineReason('because I said so')).toBe(false)
    expect(isDeclineReason(undefined)).toBe(false)
  })
  it('an offer with no rate, a zero rate or a rate of three decimals is refused with a sentence', () => {
    for (const rate of [undefined, 0, -5, 'abc', 80.123]) {
      const r = readOffer({ rate })
      expect(r.ok).toBe(false)
      if (!r.ok) expect([r.field, r.says.length > 10]).toEqual(['rate', true])
    }
  })
  it('a rate typed as text in dollars is read to two decimals and the currency is upper case', () => {
    expect(readOffer({ rate: '85.50', currency: 'usd', startDate: '2027-02-01', terms: ' Six months. ' })).toEqual({
      ok: true, offer: { rate: 85.5, currency: 'USD', startDate: '2027-02-01', terms: 'Six months.' },
    })
  })
  it('a currency that is not three letters and a start that is not a day are refused naming the field', () => {
    expect(readOffer({ rate: 80, currency: 'DOLLARS' })).toMatchObject({ ok: false, field: 'currency' })
    expect(readOffer({ rate: 80, startDate: '2027-13-45' })).toMatchObject({ ok: false, field: 'startDate' })
    expect(readOffer({ rate: 80, startDate: 'Monday' })).toMatchObject({ ok: false, field: 'startDate' })
  })
  it('the hiring side makes and withdraws an offer, and the supplier side only records the answer', () => {
    expect(mayTake('PROPOSE', 'BUYER', mays)).toBeNull()
    expect(mayTake('PROPOSE', 'SUPPLIER', { mayHire: false, maySubmit: true })).toMatch(/made by the firm that hires/)
    expect(mayTake('ACCEPT', 'SUPPLIER', { mayHire: false, maySubmit: true })).toBeNull()
    expect(mayTake('DECLINE', 'SUPPLIER', { mayHire: false, maySubmit: false })).toMatch(/recruiter who put the person forward/)
  })
  it('a seat on neither side of the deal is told the offer is not on its side', () => {
    expect(mayTake('ACCEPT', null, { mayHire: true, maySubmit: true })).toMatch(/not on your side/)
  })
  it('the award opens on the accepted offer’s rate in cents and its start day', () => {
    expect(awardFromOffer({ state: 'ACCEPTED', rate: '91.25', currency: 'USD', startDate: new Date('2027-03-02T00:00:00Z') }, 'USD')).toEqual({ cents: 9125, startDate: '2027-03-02', note: null })
  })
  it('an offer that was only proposed gives the award nothing', () => {
    expect(awardFromOffer({ state: 'PROPOSED', rate: 80, currency: 'USD', startDate: null }, 'USD')).toBeNull()
    expect(awardFromOffer(null, 'USD')).toBeNull()
  })
  it('an offer in another currency than the buyer’s does not carry its rate to the award and says so', () => {
    const r = awardFromOffer({ state: 'ACCEPTED', rate: 80, currency: 'EUR', startDate: null }, 'USD')
    expect(r?.cents).toBeNull()
    expect(r?.note).toMatch(/EUR, not USD/)
  })
})

describe('the offer is wired to the award and never to an agent', () => {
  it('the award route opens on the accepted offer through the one shared reader', () => {
    const src = readFileSync('src/app/api/submissions/[id]/award/route.ts', 'utf8')
    expect(src).toContain("acceptedOfferFor } from '../offer/read'")
    expect(src).toContain('offered?.cents ?? submission.rate')
  })
  it('the offer route writes no agent key and no agent runs through it', () => {
    const src = readFileSync('src/app/api/submissions/[id]/offer/route.ts', 'utf8')
    expect(src).not.toMatch(/agentKey|lib\/agents/)
  })
})
