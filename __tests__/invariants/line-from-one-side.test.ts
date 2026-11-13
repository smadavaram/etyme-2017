import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sellLineTie, buyLineTie } from '@/lib/money/line-ties'

/**
 * A contract line naming a firm on Etyme (review, 2026-11-13: "a firm on
 * Etyme is never tied to you from your side alone"). A sell line puts the
 * seller on the client's supplier list, and a buy line puts the supplier on
 * the buyer's, so neither is written from the caller's own register row.
 */

const route = readFileSync(join(process.cwd(), 'src/app/api/contracts/route.ts'), 'utf8')

describe('a contract line naming a firm on Etyme', () => {
  it('a sell line to a firm on Etyme that does not buy from you is refused in a sentence that says to ask them to link', () => {
    const v = sellLineTie({ clientName: 'Northbend Athletic', together: true, buys: false })
    expect(v).toEqual({
      ok: false,
      says:
        'Nothing on Etyme shows Northbend Athletic buying from you yet, so you cannot bill them on a line. ' +
        'Ask them to link with you as their supplier from Companies, then record it.',
    })
  })

  it('a sell line to a firm on Etyme you do not work with is answered like a client that is not there, naming nobody', () => {
    const v = sellLineTie({ clientName: 'Northbend Athletic', together: false, buys: false })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.says).toBe('We could not find that client. Add them from Companies first; they do not need to be on Etyme.')
      expect(v.says).not.toContain('Northbend')
    }
  })

  it('a sell line to a firm on Etyme that buys from you is written as before', () => {
    expect(sellLineTie({ clientName: 'Talvern Medical', together: true, buys: true })).toEqual({ ok: true })
  })

  it('a buy line naming a firm on Etyme you do not work with is answered like a supplier that is not there', () => {
    expect(buyLineTie({ allowed: false })).toEqual({
      ok: false,
      says: 'We could not find that supplier. Add them from Companies first; they do not need to be on Etyme.',
    })
    expect(buyLineTie({ allowed: true })).toEqual({ ok: true })
  })

  it('the contracts route reads the client and the supplier through the shared readers, never its own register row alone', () => {
    expect(route).toContain('workTogether(companyId, clientCompany.id)')
    expect(route).toContain('clientBuysFrom(companyId, clientCompany.id)')
    expect(route).toContain('mayBuyFromFirm(String(companyId), supplier.id)')
  })

  it('both refusals are written to the access log, awaited, before the reply goes out', () => {
    for (const marker of ['sellLineTie({', 'buyLineTie({']) {
      const at = route.indexOf(marker)
      const after = route.slice(at, at + 1400)
      const logged = after.indexOf('await recordRefusal(')
      const replied = after.indexOf('return NextResponse.json(')
      expect(logged).toBeGreaterThan(-1)
      expect(logged).toBeLessThan(replied)
    }
  })
})
