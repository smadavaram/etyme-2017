import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayRecordAgreement, AGREEMENT_UNKNOWN_FIRM_SAYS } from '@/lib/money/agreement-record'

/**
 * An agreement where the caller sells makes the caller one of the other
 * firm's approved suppliers: every agreement naming a firm as the client
 * is read by its approved list and its send-a-job ticks (lib/sites,
 * lib/site-rules). So a firm on Etyme is never tied to you from your side
 * alone (review, 2026-11-13): the trade has to show on their side, and in
 * the direction the agreement runs.
 */

const me = { id: 'tapin', name: 'Tapin' }
const onEtyme = { id: 'northbend', name: 'Northbend Athletic', claimedAt: new Date('2026-01-04'), listedById: null, kind: 'CLIENT' }

describe('an agreement with a firm on Etyme, recorded from one side', () => {
  it('an agreement recorded from one side never makes you one of a firm on Etyme’s approved suppliers', () => {
    // The two work together, but nothing on Etyme shows Northbend buying
    // from Tapin: Tapin may not record itself as Northbend's supplier.
    const v = mayRecordAgreement({
      caller: me, other: onEtyme, callerSells: true, relationshipExists: true, onMyList: true,
      buysFromCaller: false, existing: null,
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.says).toBe(
        'Nothing on Etyme shows Northbend Athletic buying from you yet, so you cannot record yourself as their supplier. ' +
          'Ask them to link with you as their supplier from Companies, then record it.'
      )
      expect(v.field).toBe('otherCompanyId')
    }
    // Left out, the buying side reads as no.
    const unsaid = mayRecordAgreement({ caller: me, other: onEtyme, callerSells: true, relationshipExists: true, onMyList: true, existing: null })
    expect(unsaid.ok).toBe(false)
  })

  it('a firm on Etyme that already buys from you is still recorded as your client, as before', () => {
    const v = mayRecordAgreement({
      caller: me, other: onEtyme, callerSells: true, relationshipExists: true, onMyList: true,
      buysFromCaller: true, existing: null,
    })
    expect(v.ok).toBe(true)
    if (v.ok) expect([v.vendorId, v.clientId]).toEqual(['tapin', 'northbend'])
  })

  it('buying from a firm you already work with needs no tie in the selling direction, because it puts nobody on their approved list', () => {
    const v = mayRecordAgreement({
      caller: me, other: onEtyme, callerSells: false, relationshipExists: true, onMyList: true,
      buysFromCaller: false, existing: null,
    })
    expect(v.ok).toBe(true)
  })

  it('a firm on Etyme you have no work with and is not on your list is answered as an id nobody has, never by its name', () => {
    const v = mayRecordAgreement({
      caller: me, other: onEtyme, callerSells: true, relationshipExists: false, onMyList: false,
      buysFromCaller: false, existing: null,
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.says).toBe(AGREEMENT_UNKNOWN_FIRM_SAYS)
      expect(v.unknown).toBe(true)
      expect(v.says).not.toContain('Northbend')
    }
  })

  it('a firm on Etyme only on your own list, with no work between you, is named and you are told to link first', () => {
    const v = mayRecordAgreement({
      caller: me, other: onEtyme, callerSells: false, relationshipExists: false, onMyList: true, existing: null,
    })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.says).toContain('do not trade here yet')
      expect(v.says).toContain('Ask them to link with you from Companies')
    }
  })

  it('the agreement route reads the trade from both firms through workTogether, never from a row you wrote yourself, and logs a refusal before it answers', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/contracts/agreements/route.ts'), 'utf8')
    expect(src).toMatch(/workTogether\(me, other\.id\)/)
    expect(src).not.toMatch(/companyId: me, otherCompanyId: other\.id \}, \{ companyId: other\.id, otherCompanyId: me/)
    // The buying direction: their own register naming the caller as one of
    // their suppliers, the two words their approved list reads.
    expect(src).toMatch(/companyId: other\.id, otherCompanyId: me, relationship: \{ in: \['SUPPLIER', 'PRIME'\] \}/)
    const refusal = src.indexOf('await recordRefusal(')
    const reply = src.indexOf("code: status === 409 ? 'DUPLICATE' : 'NOT_YOURS'")
    expect(refusal).toBeGreaterThan(0)
    expect(refusal).toBeLessThan(reply)
  })
})
