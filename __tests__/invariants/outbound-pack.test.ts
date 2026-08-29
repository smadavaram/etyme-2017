import { describe, it, expect } from 'vitest'
import {
  OUTBOUND_PACKS,
  outboundPackByKey,
  assemble,
  linkLife,
  readiness,
  scopeViolations,
  MAX_LINK_DAYS,
  type OwnDocument,
} from '@/lib/outbound-pack'

/**
 * The direction nobody built.
 *
 * Everything in packets.ts points inward — we ask a supplier or a
 * candidate for documents. But a staffing vendor spends as much time
 * being screened as screening, and today that is a person searching
 * their own Drive and emailing a zip file, with a certificate in it that
 * lapsed in March.
 *
 * Sending a lapsed certificate of insurance to a client's procurement
 * team is worse than sending nothing. It is a live claim that something
 * is true when it is not.
 */

const TODAY = new Date('2026-08-29T00:00:00Z')

function doc(over: Partial<OwnDocument> & { key: string }): OwnDocument {
  return {
    label: over.key,
    expiresAt: null,
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

/** Days from today, as a date. */
const inDays = (n: number) => new Date(TODAY.getTime() + n * 86_400_000)

const SCREENING = outboundPackByKey('CLIENT_SCREENING_US')!
const INSURANCE = outboundPackByKey('INSURANCE_PROOF')!

/** Everything the screening pack asks for, all of it current. */
function fullyStocked(): OwnDocument[] {
  return SCREENING.items.map((i) =>
    doc({
      key: i.key,
      label: i.label,
      expiresAt: i.validMonths == null ? null : inDays(300),
    })
  )
}

// ── Refusing to send what is not true ────────────────────────────────

describe('what will not go out', () => {

  it('a certificate that lapsed in March is not sent, however urgently somebody wants the bid in', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_GL' ? { ...d, expiresAt: new Date('2026-03-14T00:00:00Z') } : d
    )
    const pack = assemble(SCREENING, held, TODAY)
    const gl = pack.items.find((i) => i.key === 'INSURANCE_GL')!
    expect(gl.disposition).toBe('REFUSED')
    expect(pack.sending.some((i) => i.key === 'INSURANCE_GL')).toBe(false)
  })

  it('a document on file with no expiry recorded, on a kind that expires, is not sent either', () => {
    // The fourth state. It passes every check until the day somebody audits it.
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_WC' ? { ...d, expiresAt: null, issuedAt: null } : d
    )
    const pack = assemble(SCREENING, held, TODAY)
    const wc = pack.items.find((i) => i.key === 'INSURANCE_WC')!
    expect(wc.standing).toBe('NO_EXPIRY_RECORDED')
    expect(wc.disposition).toBe('REFUSED')
  })

  it('names the lapsed certificate in the refusal, so somebody knows which broker to phone', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_GL' ? { ...d, expiresAt: new Date('2026-03-14T00:00:00Z') } : d
    )
    const pack = assemble(SCREENING, held, TODAY)
    expect(pack.says).toMatch(/general liability/i)
    expect(pack.refusals.map((r) => r.key)).toContain('INSURANCE_GL')
  })

  it('refuses to send the whole pack when a required document has lapsed, rather than quietly going one short', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_GL' ? { ...d, expiresAt: inDays(-1) } : d
    )
    expect(assemble(SCREENING, held, TODAY).sendable).toBe(false)
  })

  it('drops an optional certificate that lapsed and still sends the rest, saying what was dropped', () => {
    const optional = SCREENING.items.find((i) => !i.required)!
    const held = [
      ...fullyStocked().filter((d) => d.key !== optional.key),
      doc({ key: optional.key, label: optional.label, expiresAt: inDays(-40) }),
    ]
    const pack = assemble(SCREENING, held, TODAY)
    expect(pack.sendable).toBe(true)
    expect(pack.refusals.map((r) => r.key)).toContain(optional.key)
  })

  it('sends a certificate that expires in nine days, and says on the covering note when it lapses', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_GL' ? { ...d, expiresAt: inDays(9) } : d
    )
    const pack = assemble(SCREENING, held, TODAY)
    const gl = pack.items.find((i) => i.key === 'INSURANCE_GL')!
    expect(gl.disposition).toBe('SENDING_WITH_WARNING')
    expect(gl.says).toMatch(/9 days/)
    expect(pack.sendable).toBe(true)
  })

  it('flags a document nobody here has confirmed they looked at, rather than sending it silently', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'W9' ? { ...d, verifiedAt: null } : d
    )
    const pack = assemble(SCREENING, held, TODAY)
    const w9 = pack.items.find((i) => i.key === 'W9')!
    expect(w9.unconfirmed).toBe(true)
    expect(w9.disposition).toBe('SENDING_WITH_WARNING')
  })

  it('sends a business registration without a warning about dates, because it does not expire', () => {
    const pack = assemble(SCREENING, fullyStocked(), TODAY)
    const reg = pack.items.find((i) => i.key === 'BUSINESS_PARTNER')!
    expect(reg.disposition).toBe('SENDING')
  })

  it('says plainly that we hold nothing at all, instead of producing an empty pack', () => {
    const pack = assemble(SCREENING, [], TODAY)
    expect(pack.sendable).toBe(false)
    expect(pack.says).toMatch(/not/i)
    expect(pack.sending).toHaveLength(0)
  })
})

// ── Scope ────────────────────────────────────────────────────────────

describe('what a pack is allowed to contain', () => {

  it('a client asking for proof of insurance does not receive our bank letter', () => {
    expect(INSURANCE.items.map((i) => i.key)).not.toContain('BANK_LETTER')
  })

  it('no pack puts financial statements or bank details in front of a procurement team that did not ask under a bid', () => {
    expect(scopeViolations()).toEqual([])
  })

  it('ignores documents we hold that the pack does not name, so nothing rides along', () => {
    const held = [
      ...fullyStocked(),
      doc({ key: 'BANK_LETTER', label: 'Bank letter' }),
      doc({ key: 'FINANCIALS', label: 'Audited financials', expiresAt: inDays(200) }),
    ]
    const pack = assemble(INSURANCE, held, TODAY)
    expect(pack.items.map((i) => i.key)).not.toContain('BANK_LETTER')
    expect(pack.items.map((i) => i.key)).not.toContain('FINANCIALS')
  })

  it('lists what we hold and deliberately withheld, so nobody wonders whether it was forgotten', () => {
    const held = [...fullyStocked(), doc({ key: 'BANK_LETTER', label: 'Bank letter' })]
    const pack = assemble(INSURANCE, held, TODAY)
    expect(pack.withheld.map((w) => w.key)).toContain('BANK_LETTER')
    expect(pack.withheld[0].because.length).toBeGreaterThan(20)
  })

  it('gives every pack a purpose a procurement team would recognise and at least one required document', () => {
    for (const p of OUTBOUND_PACKS) {
      expect(p.preamble.length, p.key).toBeGreaterThan(30)
      expect(p.items.some((i) => i.required), p.key).toBe(true)
    }
  })
})

// ── The link ─────────────────────────────────────────────────────────

describe('the link the pack goes out on', () => {

  it('always gives the link an end date', () => {
    const life = linkLife(TODAY, undefined, [])
    expect(life.days).toBeGreaterThan(0)
    expect(life.expiresAt.getTime()).toBeGreaterThan(TODAY.getTime())
  })

  it('never lets the link outlive the earliest document inside it', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_GL' ? { ...d, expiresAt: inDays(12) } : d
    )
    const pack = assemble(SCREENING, held, TODAY)
    const life = linkLife(TODAY, 90, pack.sending)
    expect(life.days).toBe(12)
    expect(life.clampedBecause).toMatch(/general liability/i)
  })

  it('cuts a request for a year back to the longest link we will grant', () => {
    const life = linkLife(TODAY, 365, [])
    expect(life.days).toBe(MAX_LINK_DAYS)
  })
})

// ── Readiness, before the bid ────────────────────────────────────────

describe('can we even answer this client today', () => {

  it('says how many of the pack we could answer today, out of how many', () => {
    const r = readiness(SCREENING, fullyStocked(), TODAY)
    expect(r.answerable).toBe(SCREENING.items.length)
    expect(r.asked).toBe(SCREENING.items.length)
    expect(r.ready).toBe(true)
  })

  it('names what has never been collected separately from what has lapsed', () => {
    const held = fullyStocked()
      .filter((d) => d.key !== 'W9')
      .map((d) => (d.key === 'INSURANCE_GL' ? { ...d, expiresAt: inDays(-3) } : d))
    const r = readiness(SCREENING, held, TODAY)
    expect(r.neverCollected.map((x) => x.key)).toEqual(['W9'])
    expect(r.lapsed.map((x) => x.key)).toEqual(['INSURANCE_GL'])
  })

  it('names what will expire inside the assignment, not only what is expired now', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'INSURANCE_WC' ? { ...d, expiresAt: inDays(120) } : d
    )
    const r = readiness(SCREENING, held, TODAY, { horizonDays: 180 })
    expect(r.expiresInsideHorizon.map((x) => x.key)).toContain('INSURANCE_WC')
    expect(r.lapsed).toHaveLength(0)
  })

  it('counts what nobody has ever confirmed they looked at', () => {
    const held = fullyStocked().map((d) =>
      d.key === 'NDA' ? { ...d, verifiedAt: null } : d
    )
    const r = readiness(SCREENING, held, TODAY)
    expect(r.unconfirmed.map((x) => x.key)).toContain('NDA')
  })

  it('tells a company holding nothing that it is not ready, rather than that everything is fine', () => {
    const r = readiness(SCREENING, [], TODAY)
    expect(r.ready).toBe(false)
    expect(r.answerable).toBe(0)
    expect(r.says).toMatch(/nothing|none|0 of/i)
  })

  it('returns no percentage where there is nothing to score, rather than a hundred per cent', () => {
    const empty = { ...SCREENING, items: [] }
    const r = readiness(empty, [], TODAY)
    expect(r.percent).toBeNull()
  })
})
