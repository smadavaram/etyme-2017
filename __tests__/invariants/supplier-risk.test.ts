/**
 * A supplier's standing, judged from what is actually on record.
 *
 * The failure these tests exist to prevent is a green tick over an empty
 * file. A counterparty nobody has ever checked is not a safe one, and the
 * arithmetic here refuses to say otherwise.
 *
 * Nothing in this file names an industry. The certificates are whatever
 * the trade requires — malpractice cover for a nursing agency, product
 * liability for a laboratory — and the judgement is about dates and
 * money, not about what the certificate is called.
 */

import { describe, it, expect } from 'vitest'
import {
  insuranceStanding,
  paymentBehaviour,
  supplierRisk,
  watchlist,
  CADENCE_DAYS,
  ENOUGH_SETTLEMENTS,
  type Cover,
  type Settlement,
  type CounterpartyRegister,
  type RiskInput,
} from '@/lib/supplier-risk'

const NOW = new Date('2026-08-29T00:00:00.000Z')
const DAY = 86_400_000
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY)

const supplier: CounterpartyRegister = {
  id: 'cp1',
  name: 'Meridian Clinical Staffing',
  relationship: 'SUPPLIER',
  status: 'ACTIVE',
  riskLevel: null,
  riskReviewBy: null,
}

function settled(n: number, lateDays: number, whose: 'THEIRS' | 'OURS'): Settlement[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${whose}${i}`,
    whose,
    dueAt: daysFromNow(-90 + i),
    settledAt: daysFromNow(-90 + i + lateDays),
    amountMinor: 500_00,
    currency: 'USD',
  }))
}

function input(over: Partial<RiskInput> = {}): RiskInput {
  return {
    counterparty: supplier,
    covers: [],
    settlements: [],
    owner: null,
    ...over,
  }
}

describe('What is on file about a supplier, and what is missing from it', () => {

  it('insurance nobody has ever put on file is reported as nobody having looked, never as cover', () => {
    const standing = insuranceStanding([], NOW)
    expect(standing.state).toBe('NOTHING_ON_FILE')
    expect(standing.says).toContain('question nobody has asked')
  })

  it('cover that expired is reported as lapsed, with how many days ago', () => {
    const covers: Cover[] = [
      { type: 'INSURANCE_GL', label: 'general liability', status: 'CLEAR', expiresAt: daysFromNow(-7) },
    ]
    const standing = insuranceStanding(covers, NOW)
    expect(standing.state).toBe('LAPSED')
    expect(standing.worst?.daysToExpiry).toBe(-7)
    expect(standing.says).toContain('expired 7 days ago')
  })

  it('cover expiring inside the renewal window is flagged before it stops work', () => {
    const covers: Cover[] = [
      { type: 'INSURANCE_GL', label: 'general liability', status: 'CLEAR', expiresAt: daysFromNow(22) },
    ]
    const standing = insuranceStanding(covers, NOW)
    expect(standing.state).toBe('EXPIRING')
    expect(standing.worst?.daysToExpiry).toBe(22)
  })

  it('a certificate on file but never verified does not count as cover', () => {
    const covers: Cover[] = [
      { type: 'INSURANCE_GL', label: 'general liability', status: 'PENDING', expiresAt: daysFromNow(300) },
    ]
    const standing = insuranceStanding(covers, NOW)
    expect(standing.state).toBe('UNVERIFIED')
    expect(standing.says).toContain('not cover until it has been checked')
  })

  it('a supplier carries whatever cover their trade requires, and nothing here is named after software', () => {
    const covers: Cover[] = [
      { type: 'MALPRACTICE', label: 'malpractice cover', status: 'CLEAR', expiresAt: daysFromNow(-3) },
      { type: 'PROFESSIONAL_INDEMNITY', label: 'professional indemnity', status: 'CLEAR', expiresAt: daysFromNow(120) },
    ]
    const standing = insuranceStanding(covers, NOW)
    expect(standing.state).toBe('LAPSED')
    expect(standing.says).toContain('malpractice cover')
    expect(standing.covers).toHaveLength(2)
  })

  it('cover with no expiry recorded is its own answer, not a countdown and not a tick', () => {
    const covers: Cover[] = [
      { type: 'BUSINESS_PARTNER', label: 'business registration', status: 'CLEAR', expiresAt: null },
    ]
    const standing = insuranceStanding(covers, NOW)
    expect(standing.state).toBe('NO_EXPIRY_RECORDED')
    expect(standing.worst?.daysToExpiry).toBeNull()
    expect(standing.says).toContain('cannot tell which')
  })
})

describe('How a counterparty pays, and how we pay them, are two different facts', () => {

  it('how a counterparty pays us is measured against their due date', () => {
    const b = paymentBehaviour(settled(ENOUGH_SETTLEMENTS, 12, 'THEIRS'), 'THEIRS', NOW)
    expect(b.settled).toBe(ENOUGH_SETTLEMENTS)
    expect(b.meanLateDays).toBe(12)
    expect(b.worstLateDays).toBe(12)
  })

  it('three settled invoices is not a payment culture, so no average is offered', () => {
    const b = paymentBehaviour(settled(3, 40, 'THEIRS'), 'THEIRS', NOW)
    expect(b.settled).toBe(3)
    expect(b.meanLateDays).toBeNull()
    expect(b.says).toContain('not a payment culture')
  })

  it('a bill we have not paid is our behaviour, reported as ours and never as theirs', () => {
    const risk = supplierRisk(input({ settlements: settled(5, 20, 'OURS') }), NOW)
    expect(risk.theyPayUs.settled).toBe(0)
    expect(risk.wePayThem.meanLateDays).toBe(20)
    const ours = risk.signals.find((s) => s.code === 'WE_PAY_THEM_LATE')
    expect(ours?.says).toContain('our')
    expect(ours?.says).toContain('not theirs')
    expect(risk.signals.some((s) => s.code === 'PAYS_US_LATE')).toBe(false)
  })

  it('an unpaid invoice past its due date counts while it is still open', () => {
    const open: Settlement[] = [
      { id: 'o1', whose: 'THEIRS', dueAt: daysFromNow(-70), settledAt: null, amountMinor: 12_000_00, currency: 'USD' },
    ]
    const b = paymentBehaviour(open, 'THEIRS', NOW)
    expect(b.openOverdue).toBe(1)
    expect(b.openOverdueMaxDays).toBe(70)
    expect(b.openOverdueMinor).toBe(12_000_00)
  })

  it('a row with no due date is left out rather than counted as paid on time', () => {
    const rows: Settlement[] = [
      { id: 'x1', whose: 'THEIRS', dueAt: null, settledAt: daysFromNow(-2), amountMinor: 100_00, currency: 'USD' },
    ]
    const b = paymentBehaviour(rows, 'THEIRS', NOW)
    expect(b.unmeasurable).toBe(1)
    expect(b.settled).toBe(0)
    expect(b.meanLateDays).toBeNull()
  })
})

describe('A judgement somebody made, and the date they said they would remake it', () => {

  it('a risk level set with no date to look again is flagged', () => {
    const risk = supplierRisk(
      input({ counterparty: { ...supplier, riskLevel: 'OK', riskReviewBy: null } }),
      NOW
    )
    const s = risk.signals.find((x) => x.code === 'JUDGEMENT_UNDATED')
    expect(s).toBeDefined()
    expect(s?.says).toContain('nobody remakes')
  })

  it('a review date that has passed says how long ago and asks for the judgement again', () => {
    const risk = supplierRisk(
      input({ counterparty: { ...supplier, riskLevel: 'WATCH', riskReviewBy: daysFromNow(-45) } }),
      NOW
    )
    expect(risk.reviewOverdueDays).toBe(45)
    expect(risk.signals.some((s) => s.code === 'JUDGEMENT_STALE')).toBe(true)
  })

  it('a review date somebody already promised is not pushed further out by the cadence', () => {
    const promised = daysFromNow(20)
    const risk = supplierRisk(
      input({
        counterparty: { ...supplier, riskLevel: 'OK', riskReviewBy: promised },
        covers: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: daysFromNow(300) }],
        settlements: settled(ENOUGH_SETTLEMENTS, 0, 'THEIRS'),
        owner: { name: 'Priya Raman', role: 'Procurement' },
      }),
      NOW
    )
    expect(risk.verdict).toBe('CLEAR')
    expect(risk.cadenceDays).toBe(CADENCE_DAYS.CLEAR)
    expect(risk.reviewBy.toISOString()).toBe(promised.toISOString())
  })

  it('a supplier at risk is looked at again sooner than one that is fine', () => {
    const bad = supplierRisk(
      input({ covers: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: daysFromNow(-1) }] }),
      NOW
    )
    const fine = supplierRisk(
      input({
        covers: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: daysFromNow(300) }],
        settlements: settled(ENOUGH_SETTLEMENTS, 0, 'THEIRS'),
        owner: { name: 'Priya Raman', role: 'Procurement' },
      }),
      NOW
    )
    expect(bad.verdict).toBe('AT_RISK')
    expect(fine.verdict).toBe('CLEAR')
    expect(bad.cadenceDays).toBeLessThan(fine.cadenceDays)
  })
})

describe('The verdict warns, names somebody, and never stops the work', () => {

  it('the verdict warns and never blocks', () => {
    const risk = supplierRisk(
      input({ covers: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: daysFromNow(-30) }] }),
      NOW
    )
    expect(risk.verdict).toBe('AT_RISK')
    expect(risk.blocks).toBe(false)
    expect(risk.action).toBe('WARN')
  })

  it('every verdict names who has to act, and says so plainly when nobody is named', () => {
    const nobody = supplierRisk(input(), NOW)
    expect(nobody.owner).toBeNull()
    expect(nobody.ownerSays).toContain('No named owner')

    const owned = supplierRisk(input({ owner: { name: 'Priya Raman', role: 'Procurement' } }), NOW)
    expect(owned.ownerSays).toContain('Priya Raman')
    expect(owned.ownerSays).toContain(owned.reviewBy.toISOString().slice(0, 10))
  })

  it('a counterparty with nothing at all on record is never reported as clear', () => {
    const risk = supplierRisk(input(), NOW)
    expect(risk.verdict).toBe('NOTHING_ON_RECORD')
    expect(risk.says).toContain('not a pass')
    expect(risk.confidence).toBe('LOW')
    expect(risk.unknowns.length).toBeGreaterThan(0)
  })

  it('a prospect with nothing on file is ordinary, and stops being ordinary once somebody is placed', () => {
    const prospect = supplierRisk(
      input({ counterparty: { ...supplier, status: 'PROSPECT' } }),
      NOW
    )
    const active = supplierRisk(input(), NOW)
    expect(prospect.signals.find((s) => s.code === 'NOTHING_ON_FILE')?.severity).toBe('NOTE')
    expect(active.signals.find((s) => s.code === 'NOTHING_ON_FILE')?.severity).toBe('WARN')
    expect(prospect.says).toContain('Ordinary for a prospect')
  })

  it('a client is not put at risk for holding no insurance certificate, because cover flows the other way', () => {
    const client = supplierRisk(
      input({
        counterparty: { ...supplier, relationship: 'CLIENT', name: 'Terumo BCT' },
        settlements: settled(6, 0, 'THEIRS'),
      }),
      NOW
    )
    expect(client.signals.some((s) => s.code === 'NOTHING_ON_FILE')).toBe(false)
    expect(client.verdict).toBe('CLEAR')
    expect(client.confidence).toBe('HIGH')
    expect(client.unknowns.join(' ')).toContain('does not give us proof of cover')
  })

  it('a client who settles a month late is warned about, with the days named', () => {
    const risk = supplierRisk(
      input({
        counterparty: { ...supplier, relationship: 'CLIENT', name: 'Terumo BCT' },
        settlements: settled(6, 34, 'THEIRS'),
      }),
      NOW
    )
    expect(risk.verdict).toBe('AT_RISK')
    expect(risk.signals.find((s) => s.code === 'PAYS_US_LATE')?.says).toContain('34 days late')
  })
})

describe('The watchlist, in the order somebody should read it', () => {

  it('the watchlist puts the worst first and counts what could not be judged', () => {
    const lapsed = supplierRisk(
      input({
        counterparty: { ...supplier, id: 'a', name: 'Alpha' },
        covers: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: daysFromNow(-5) }],
      }),
      NOW
    )
    const unknown = supplierRisk(
      input({ counterparty: { ...supplier, id: 'b', name: 'Bravo' } }),
      NOW
    )
    const fine = supplierRisk(
      input({
        counterparty: { ...supplier, id: 'c', name: 'Charlie' },
        covers: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: daysFromNow(300) }],
        settlements: settled(ENOUGH_SETTLEMENTS, 0, 'THEIRS'),
        owner: { name: 'Priya Raman', role: 'Procurement' },
      }),
      NOW
    )

    const list = watchlist([fine, unknown, lapsed])
    expect(list.rows.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(list.atRisk).toBe(1)
    expect(list.nothingOnRecord).toBe(1)
    expect(list.clear).toBe(1)
    expect(list.says).toContain('nobody has looked at')
  })

  it('an empty register says so rather than reporting nothing at risk', () => {
    const list = watchlist([])
    expect(list.says).toContain('Nobody in the register yet')
  })
})
