import { describe, it, expect } from 'vitest'
import {
  PACKETS,
  packetByKey,
  packetsFor,
  resolveItems,
  itemsToAsk,
  progressOf,
  needsReopening,
  type HeldDocument,
} from '@/lib/packets'

/**
 * Four models covered pieces of documents and none of them was a list.
 * Nothing could say "to onboard as a supplier I need your W-9, your
 * insurance certificate, a signed agreement and a bank letter" and then
 * show three of four arriving — so the most common thing a real programme
 * does every week had no home.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const VENDOR = packetByKey('VENDOR_ONBOARDING_US')!

function held(over: Partial<HeldDocument> & { key: string }): HeldDocument {
  return { expiresAt: null, accepted: true, ...over }
}

describe('the packets themselves', () => {
  it('gives every packet a name, a purpose and at least one thing to send', () => {
    for (const p of PACKETS) {
      expect(p.label.length, p.key).toBeGreaterThan(3)
      expect(p.items.length, p.key).toBeGreaterThan(0)
    }
  })

  it('explains every item in the words the counterparty would use', () => {
    // "INSURANCE_GL" is what the database calls it. "Certificate of general
    // liability insurance, naming us as certificate holder" is what a
    // supplier's office manager can act on.
    for (const p of PACKETS) {
      for (const i of p.items) {
        expect(i.hint.length, `${p.key}/${i.key}`).toBeGreaterThan(15)
      }
    }
  })

  it('marks at least one item required in every packet, or it is not a checklist', () => {
    for (const p of PACKETS) {
      expect(p.items.some((i) => i.required), p.key).toBe(true)
    }
  })

  it('never lists the same item twice in one packet', () => {
    for (const p of PACKETS) {
      const keys = p.items.map((i) => i.key)
      expect(new Set(keys).size, p.key).toBe(keys.length)
    }
  })

  it('finds packets by what they are for', () => {
    expect(packetsFor('VENDOR_ONBOARDING').length).toBeGreaterThan(0)
    expect(packetsFor('IMMIGRATION')[0].label).toContain('H-1B')
  })

  it('does not expire an incorporation certificate, because nobody reissues one annually', () => {
    const reg = VENDOR.items.find((i) => i.key === 'BUSINESS_PARTNER')!
    expect(reg.validMonths).toBeNull()
  })

  it('expires insurance every twelve months, because cover lapses', () => {
    const gl = VENDOR.items.find((i) => i.key === 'INSURANCE_GL')!
    expect(gl.validMonths).toBe(12)
  })
})

describe('never asking for what we already hold', () => {
  it('asks for everything when we hold nothing', () => {
    const r = resolveItems(VENDOR, [], NOW)
    expect(r.every((i) => i.state === 'NEEDED')).toBe(true)
    expect(itemsToAsk(r)).toHaveLength(VENDOR.items.length)
  })

  it('does not ask again for a document on file that does not expire', () => {
    // Asking a supplier for the W-9 they sent last year is how a system
    // teaches people to ignore it.
    const r = resolveItems(VENDOR, [held({ key: 'W9' })], NOW)
    expect(r.find((i) => i.key === 'W9')!.state).toBe('ALREADY_HELD')
    expect(itemsToAsk(r).find((i) => i.key === 'W9')).toBeUndefined()
  })

  it('does not ask again for insurance that runs for another eight months', () => {
    const r = resolveItems(
      VENDOR,
      [held({ key: 'INSURANCE_GL', expiresAt: new Date('2027-04-19T00:00:00Z') })],
      NOW
    )
    const gl = r.find((i) => i.key === 'INSURANCE_GL')!
    expect(gl.state).toBe('ALREADY_HELD')
    expect(gl.note).toContain('2027-04-19')
  })

  it('asks again for insurance inside sixty days of expiring, before it lapses', () => {
    // Chasing a certificate the day after it lapses means a placement is
    // already blocked, and the supplier's broker needs a week anyway.
    const r = resolveItems(
      VENDOR,
      [held({ key: 'INSURANCE_GL', expiresAt: new Date('2026-09-18T00:00:00Z') })],
      NOW
    )
    const gl = r.find((i) => i.key === 'INSURANCE_GL')!
    expect(gl.state).toBe('EXPIRING')
    expect(itemsToAsk(r).some((i) => i.key === 'INSURANCE_GL')).toBe(true)
  })

  it('says how long ago something expired rather than just that it did', () => {
    const r = resolveItems(
      VENDOR,
      [held({ key: 'INSURANCE_WC', expiresAt: new Date('2026-08-04T00:00:00Z') })],
      NOW
    )
    const wc = r.find((i) => i.key === 'INSURANCE_WC')!
    expect(wc.state).toBe('EXPIRED')
    expect(wc.note).toMatch(/15 days ago/)
  })

  it('ignores a document that was never accepted', () => {
    // A certificate that failed review is not one we hold.
    const r = resolveItems(VENDOR, [held({ key: 'W9', accepted: false })], NOW)
    expect(r.find((i) => i.key === 'W9')!.state).toBe('NEEDED')
  })

  it('counts the longest-lasting copy when several are on file', () => {
    const r = resolveItems(
      VENDOR,
      [
        held({ key: 'INSURANCE_GL', expiresAt: new Date('2026-09-01T00:00:00Z') }),
        held({ key: 'INSURANCE_GL', expiresAt: new Date('2027-09-01T00:00:00Z') }),
      ],
      NOW
    )
    expect(r.find((i) => i.key === 'INSURANCE_GL')!.state).toBe('ALREADY_HELD')
  })
})

describe('how far along, in words', () => {
  it('names what it is waiting on rather than showing a bare fraction', () => {
    // "Four of six, waiting on your COI and bank letter" removes the phone
    // call this process is otherwise made of.
    const p = progressOf([
      { label: 'W-9', required: true, received: true },
      { label: 'Business registration', required: true, received: true },
      { label: 'Certificate of insurance', required: true, received: false },
      { label: 'Bank letter', required: true, received: false },
    ])
    expect(p.summary).toContain('2 of 4')
    expect(p.summary).toContain('Certificate of insurance')
    expect(p.summary).toContain('Bank letter')
    expect(p.complete).toBe(false)
  })

  it('is complete when everything required is in, even with optional items open', () => {
    const p = progressOf([
      { label: 'W-9', required: true, received: true },
      { label: 'Cyber insurance', required: false, received: false },
    ])
    expect(p.complete).toBe(true)
    expect(p.summary).toContain('optional')
  })

  it('says everything is in when everything is in', () => {
    const p = progressOf([{ label: 'W-9', required: true, received: true }])
    expect(p.summary).toBe('Everything is in.')
  })

  it('says so plainly when there is nothing to ask for at all', () => {
    expect(progressOf([]).summary).toMatch(/already hold everything/i)
  })

  it('does not list more than three outstanding names before summarising', () => {
    const p = progressOf(
      ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, required: true, received: false }))
    )
    expect(p.summary).toContain('and 2 more')
  })
})

describe('reopening before it bites', () => {
  it('reopens when required insurance has expired', () => {
    const r = resolveItems(
      VENDOR,
      [held({ key: 'INSURANCE_GL', expiresAt: new Date('2026-01-01T00:00:00Z') })],
      NOW
    )
    const n = needsReopening(r)
    expect(n.reopen).toBe(true)
    expect(n.because.join(' ')).toMatch(/general liability/i)
  })

  it('reopens while cover is still valid but about to lapse', () => {
    // Lapsed insurance already blocks a placement. Reopening before that
    // is the difference between a reminder and an emergency.
    const r = resolveItems(
      VENDOR,
      VENDOR.items.map((i) => held({
        key: i.key,
        expiresAt: i.key === 'INSURANCE_WC' ? new Date('2026-09-10T00:00:00Z') : null,
      })),
      NOW
    )
    expect(needsReopening(r).reopen).toBe(true)
  })

  it('does not reopen for an optional item that lapsed', () => {
    const r = resolveItems(
      VENDOR,
      VENDOR.items.map((i) => held({
        key: i.key,
        expiresAt: i.key === 'INSURANCE_CYBER' ? new Date('2026-01-01T00:00:00Z') : null,
      })),
      NOW
    )
    expect(needsReopening(r).reopen).toBe(false)
  })
})
