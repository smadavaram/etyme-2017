import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  networkOffer,
  adoptedKinds,
  tellAdoptedPerson,
  tellSupplier,
  supplierWallSays,
  ourBarSays,
  type Offer,
} from '@/app/api/submissions/adopt'

/**
 * A prime puts forward somebody its network offered it.
 *
 * Break #4 on the founder's list. Computer Systems read Grace Lindqvist on
 * Bench → Your network, offered by CloudEPA, and could not put her on the
 * requisition Northbend Athletic had released to it: the submit door looked
 * only for a listing Computer Systems itself held and said "the consultant
 * must grant a listing first", which she had, to CloudEPA. These sentences
 * say when a network offer is consent enough, and what is written.
 */

const cloudepa = (over: Partial<Offer> = {}): Offer => ({
  companyId: 'cloudepa',
  companyName: 'CloudEPA',
  tier: 'MARKETING',
  state: 'GRANTED',
  revokedAt: null,
  onOurNetwork: true,
  ...over,
})

const ask = (offers: Offer[], over: { requested?: string | null; payRateCents?: number | null } = {}) =>
  networkOffer({
    personName: 'Grace Lindqvist',
    ourName: 'Computer Systems',
    offers,
    requested: over.requested ?? null,
    payRateCents: over.payRateCents === undefined ? 9_000 : over.payRateCents,
  })

describe('a prime puts forward somebody its network offered it', () => {
  it('a prime may put forward a person a sub-vendor offered its network, and the sub-vendor is who it buys them from', () => {
    const v = ask([cloudepa()])
    expect(v).toEqual({ ok: true, offeredBy: { companyId: 'cloudepa', companyName: 'CloudEPA' } })
  })

  it('a person a sub-vendor keeps on its retained bench is no offer, and the prime is told to ask that sub-vendor', () => {
    const v = ask([cloudepa({ tier: 'RETAINED' })])
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_OFFERED_TO_NETWORK')
      expect(v.says).toContain('CloudEPA keeps Grace Lindqvist on its own bench')
    }
  })

  it('a listing the consultant never granted, declined or took back is no offer at all', () => {
    for (const o of [cloudepa({ state: 'INVITED' }), cloudepa({ state: 'DECLINED' }), cloudepa({ revokedAt: new Date() })]) {
      const v = ask([o], { requested: 'cloudepa' })
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.code).toBe('NO_CONSENT')
        expect(v.says).toContain('has not agreed to be marketed by CloudEPA')
      }
    }
  })

  it('a firm that is not on the prime’s network has offered it nobody', () => {
    const v = ask([cloudepa({ onOurNetwork: false })])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NOT_ON_YOUR_NETWORK')
  })

  it('where nobody offered the person and the prime holds no listing, the refusal says consent is what is missing', () => {
    const v = ask([])
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_OFFERED')
      expect(v.says).toContain('has not agreed to be marketed by Computer Systems')
      // The old sentence told the prime the consultant must grant a
      // listing, as though nobody ever had.
      expect(v.says).not.toMatch(/must grant a listing first/)
    }
  })

  it('where two sub-vendors offered the same person, the prime is asked which, never guessed for', () => {
    const v = ask([cloudepa(), cloudepa({ companyId: 'brightmoor', companyName: 'Brightmoor' })])
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('WHICH_SUPPLIER')
      expect(v.options?.map((o) => o.companyId)).toEqual(['cloudepa', 'brightmoor'])
    }
    const named = ask([cloudepa(), cloudepa({ companyId: 'brightmoor', companyName: 'Brightmoor' })], { requested: 'brightmoor' })
    expect(named).toEqual({ ok: true, offeredBy: { companyId: 'brightmoor', companyName: 'Brightmoor' } })
  })

  it('a sub-vendor the prime names must be one that actually offered the person', () => {
    const v = ask([cloudepa()], { requested: 'somebody-else' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NOT_OFFERED')
  })

  it('the rate the prime pays the sub-vendor is required, because the award pays it and nothing may guess it', () => {
    for (const payRateCents of [null, 0, -100, 90.5]) {
      const v = ask([cloudepa()], { payRateCents })
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.code).toBe('NO_PAY_RATE')
        expect(v.says).toContain('what CloudEPA charges you for Grace Lindqvist')
      }
    }
  })

  it('the prime’s submission is NETWORK and the hop below takes its kind from the sub-vendor’s own hold on the person', () => {
    expect(adoptedKinds({ employsThem: false, listingTier: 'MARKETING' })).toEqual({ ours: 'NETWORK', below: 'NETWORK' })
    expect(adoptedKinds({ employsThem: true, listingTier: 'MARKETING' })).toEqual({ ours: 'NETWORK', below: 'INTERNAL' })
  })

  it('the kind is computed at the door and a kind sent by the caller is never read', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/submissions/route.ts'), 'utf8')
    expect(route).not.toMatch(/body\.kind/)
    expect(route).toMatch(/adoptedKinds\(/)
  })

  it('the person is told who put them forward and which firm holding their consent offered them', () => {
    const s = tellAdoptedPerson({
      ourName: 'Computer Systems', supplierName: 'CloudEPA', clientName: 'Northbend Athletic', roleTitle: 'Supply planning analyst',
    })
    expect(s).toContain('Computer Systems put you forward to Northbend Athletic for Supply planning analyst')
    expect(s).toContain('CloudEPA, who you agreed may market you, offered you to them')
  })

  it('the sub-vendor is told its person went forward, where, and at what rate it will be paid, and never the prime’s price', () => {
    const s = tellSupplier({
      ourName: 'Computer Systems', personName: 'Grace Lindqvist', clientName: 'Northbend Athletic',
      roleTitle: 'Supply planning analyst', payRateCents: 9_000,
    })
    expect(s).toContain('forward to Northbend Athletic')
    expect(s).toContain('$90 an hour')
    expect(s).toContain('is not shown here')
  })
})

describe('the sub-vendor’s walls still stand, said to the prime', () => {
  const who = { supplierName: 'CloudEPA', personName: 'Grace Lindqvist', clientName: 'Northbend Athletic' }

  it('a person who asks to be asked first is not put forward by the prime until the sub-vendor has asked them', () => {
    const s = supplierWallSays({ ok: false, code: 'ASK_FIRST', message: 'x' }, who)
    expect(s?.code).toBe('ASK_FIRST')
    expect(s?.says).toContain('Ask CloudEPA to ask them about Northbend Athletic')
  })

  it('a sub-vendor’s own do-not-return list is never read out to the prime', () => {
    const s = supplierWallSays(
      { ok: false, code: 'ON_OUR_DNR_LIST', message: 'Somebody here put this person on your do-not-return list' },
      who
    )
    expect(s?.says).toBe('CloudEPA cannot offer Grace Lindqvist at the moment. Ask CloudEPA.')
    expect(s?.says).not.toMatch(/do-not-return/)
  })

  it('somebody already represented at the client by another firm is held, not submitted twice', () => {
    const s = supplierWallSays({ ok: false, code: 'HELD_ELSEWHERE', message: 'Somebody is already representing this person' }, who)
    expect(s).toEqual({ code: 'HELD_ELSEWHERE', held: true, says: 'Somebody is already representing this person' })
  })

  it('the client’s block on a person stops the prime exactly as it stops the sub-vendor', () => {
    const s = supplierWallSays({ ok: false, code: 'BLOCKED', message: 'This person cannot be submitted to this client.' }, who)
    expect(s?.says).toBe('This person cannot be submitted to this client.')
  })

  it('the prime’s own do-not-return list stops it whoever offers the person', () => {
    expect(ourBarSays()).toContain('whoever offers them')
  })
})
