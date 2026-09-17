import { describe, it, expect } from 'vitest'
import { askGoesTo } from '@/lib/chain-top'

/**
 * "Ask for them" is a channel, and a channel obeys the same rule as a
 * rate and a name: the client reaches the rung it pays and nothing
 * below it.
 *
 * Nike buys Helena Marsh from Computer Systems, who buys her from
 * CloudEPA, and the bench listing that makes a submission possible is
 * CloudEPA's. So the button on Nike's own page named CloudEPA and
 * opened a thread with it — the prime's supplier list and a direct
 * channel to it, given away in one press, from both ends of the same
 * NDA. The ask goes to Computer Systems; reaching CloudEPA is Computer
 * Systems' job, because Computer Systems is the firm with the deal.
 */

const rung = (id: string, personId: string, companyId: string, clientCompanyId: string) =>
  ({ id, personId, companyId, clientCompanyId })

const NIKE = 'nike'

describe('where an ask for a person goes', () => {
  it('an ask for somebody the client buys through one supplier goes to that supplier', () => {
    const route = askGoesTo({
      rungs: [rung('a', 'omar', 'brightmoor', NIKE)],
      benchHolderIds: ['brightmoor'],
      submitterIds: ['brightmoor'],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['brightmoor'])
    expect(route.throughAPrime).toBe(false)
  })

  it('an ask for somebody on a sub-vendor’s bench goes to the prime the client pays, never to the sub', () => {
    const route = askGoesTo({
      rungs: [
        rung('sub', 'helena', 'cloudepa', 'computer-systems'),
        rung('top', 'helena', 'computer-systems', NIKE),
      ],
      benchHolderIds: ['cloudepa'],
      submitterIds: ['computer-systems'],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['computer-systems'])
    expect(route.toCompanyIds).not.toContain('cloudepa')
    expect(route.reason).toBe('THROUGH_THE_PRIME')
  })

  it('a three-deep chain still routes the ask to the one rung the client pays', () => {
    const route = askGoesTo({
      rungs: [
        rung('c3', 'helena', 'bench-co', 'cloudepa'),
        rung('c2', 'helena', 'cloudepa', 'computer-systems'),
        rung('c1', 'helena', 'computer-systems', NIKE),
      ],
      benchHolderIds: ['bench-co'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['computer-systems'])
  })

  it('where the client pays the bench holder itself there is no rung in between and nothing changes', () => {
    const route = askGoesTo({
      rungs: [rung('a', 'lucia', 'pinnacle', NIKE)],
      benchHolderIds: ['pinnacle'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['pinnacle'])
    expect(route.reason).toBe('YOUR_OWN_SUPPLIER')
    expect(route.throughAPrime).toBe(false)
  })

  it('a firm that put this person in front of the client is a firm the client deals with, so the ask may go to it before anybody is placed', () => {
    const route = askGoesTo({
      rungs: [],
      benchHolderIds: ['computer-systems'],
      submitterIds: ['computer-systems'],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['computer-systems'])
    expect(route.reason).toBe('YOUR_OWN_SUPPLIER')
  })

  it('a bench holder the client has no deal with is never the firm asked', () => {
    const route = askGoesTo({
      rungs: [rung('top', 'helena', 'computer-systems', NIKE)],
      benchHolderIds: ['a-firm-nike-never-heard-of'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['computer-systems'])
    expect(route.reason).toBe('THE_RUNG_YOU_PAY')
  })

  it('and where there is no rung either, whoever last put them forward here is asked', () => {
    const route = askGoesTo({
      rungs: [],
      benchHolderIds: ['a-firm-nike-never-heard-of'],
      submitterIds: ['brightmoor', 'pinnacle'],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['brightmoor'])
    expect(route.reason).toBe('PUT_THEM_FORWARD')
  })

  it('a person the client has never bought and was never offered routes to nobody, so the caller refuses in a sentence', () => {
    const route = askGoesTo({
      rungs: [],
      benchHolderIds: ['a-firm-nike-never-heard-of'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual([])
    expect(route.reason).toBe('NO_SUPPLIER_OF_YOUR_OWN')
  })

  it('a chain whose rung above is missing routes to nobody rather than guessing at a prime', () => {
    const route = askGoesTo({
      // The leg Computer Systems is billed on is not on file, so who
      // Nike pays for this person cannot be read without guessing.
      rungs: [rung('sub', 'helena', 'cloudepa', 'computer-systems')],
      benchHolderIds: ['cloudepa'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual([])
    expect(route.reason).toBe('NO_SUPPLIER_OF_YOUR_OWN')
  })

  it('two rungs above the same firm are two firms that could be the payer, and neither is guessed at', () => {
    const route = askGoesTo({
      rungs: [
        rung('sub', 'helena', 'cloudepa', 'computer-systems'),
        rung('top', 'helena', 'computer-systems', NIKE),
        rung('other', 'helena', 'computer-systems', 'somebody-else'),
      ],
      benchHolderIds: ['cloudepa'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds).toEqual(['computer-systems'])
    expect(route.reason).toBe('THE_RUNG_YOU_PAY')
  })

  it('the same person reached through two primes is asked for through both, and the sub is named in neither', () => {
    const route = askGoesTo({
      rungs: [
        rung('s1', 'helena', 'cloudepa', 'computer-systems'),
        rung('t1', 'helena', 'computer-systems', NIKE),
        rung('s2', 'helena', 'cloudepa', 'pinnacle'),
        rung('t2', 'helena', 'pinnacle', NIKE),
      ],
      benchHolderIds: ['cloudepa'],
      submitterIds: [],
      clientCompanyId: NIKE,
    })
    expect(route.toCompanyIds.sort()).toEqual(['computer-systems', 'pinnacle'])
    expect(route.toCompanyIds).not.toContain('cloudepa')
  })

  it('the route says when it went through a prime, so the message to the prime can say why it came', () => {
    const direct = askGoesTo({ rungs: [rung('a', 'omar', 'brightmoor', NIKE)], benchHolderIds: ['brightmoor'], submitterIds: [], clientCompanyId: NIKE })
    const viaPrime = askGoesTo({
      rungs: [rung('sub', 'helena', 'cloudepa', 'computer-systems'), rung('top', 'helena', 'computer-systems', NIKE)],
      benchHolderIds: ['cloudepa'], submitterIds: [], clientCompanyId: NIKE,
    })
    expect(direct.throughAPrime).toBe(false)
    expect(viaPrime.throughAPrime).toBe(true)
  })

  it('disclosure is not an argument this rule takes, because reading a name is not having a channel', () => {
    // `MasterAgreement.disclosesSubVendors` lets a client read a
    // sub-vendor's name on a row. It is a term on the client's paper
    // with the prime and it is not a contract with the sub, so it can
    // open no thread. The function cannot be told about it at all.
    const facts = {
      rungs: [rung('sub', 'helena', 'cloudepa', 'computer-systems'), rung('top', 'helena', 'computer-systems', NIKE)],
      benchHolderIds: ['cloudepa'],
      submitterIds: [],
      clientCompanyId: NIKE,
    }
    expect(Object.keys(facts).some((k) => /disclos/i.test(k))).toBe(false)
    expect(askGoesTo(facts).toCompanyIds).toEqual(['computer-systems'])
  })
})
