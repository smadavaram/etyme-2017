import { describe, it, expect } from 'vitest'
import { contractClearance, heldFrom } from '@/lib/contract-clearance'

/**
 * Whether somebody may start, on paperwork.
 *
 * A checklist rather than a signing workflow. The line that matters is
 * the one between what the law requires before a first day and what a
 * contract requires — the first blocks, the second warns and proceeds
 * with a reason. A system that blocks on everything gets switched off;
 * one that blocks on nothing is decoration.
 */

const on = new Date('2026-09-10T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

const clear = (type: string, expiresAt: Date | null = null) => ({ type, status: 'CLEAR', expiresAt })
const gl = (expiresAt: Date) => ({ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt })
const wc = (expiresAt: Date) => ({ type: 'INSURANCE_WC', status: 'CLEAR', expiresAt })

/** A supplier whose cover is fine, so only the person side is under test. */
const insured = [gl(inDays(200)), wc(inDays(200))]
const signedNda = [{ key: 'NDA', expiresAt: null, accepted: true }]

const verdict = (
  personVerifications: { type: string; status: string; expiresAt: Date | null }[],
  supplierCertificates = insured,
  extraHeld = signedNda
) =>
  contractClearance({
    personName: 'Priya Raman',
    personVerifications,
    supplierName: 'CloudEPA',
    supplierCertificates,
    clientName: 'Harlow Health',
    on,
    extraHeld,
  })

describe('what blocks a start', () => {
  it('a missing I-9 blocks — nobody may work without authorisation', () => {
    const v = verdict([clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
    expect(v.says).toMatch(/cannot start/)
  })

  it('a lapsed general liability certificate blocks, however complete the person is', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], [gl(inDays(-3)), wc(inDays(200))])
    expect(v.outcome).toBe('BLOCK')
    expect(v.cover.outcome).toBe('BLOCK')
    expect(v.blocking).toEqual([]) // the person is fine; it is the supplier
  })

  it('an expired background check does not block — it is contractual, not law', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(-10))])
    expect(v.outcome).toBe('WARN')
    expect(v.blocking).toEqual([])
    expect(v.chasing.map((c) => c.key)).toContain('BACKGROUND_CHECK')
  })
})

describe('what warns and proceeds', () => {
  it('a missing background check warns and can proceed with a reason', () => {
    const v = verdict([clear('I9_EVERIFY')])
    expect(v.outcome).toBe('WARN')
    expect(v.chasing.map((c) => c.key)).toContain('BACKGROUND_CHECK')
    expect(v.says).toMatch(/with a reason/)
  })

  it('a missing NDA warns, never blocks', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], insured, [])
    expect(v.outcome).toBe('WARN')
    expect(v.chasing.map((c) => c.key)).toEqual(['NDA'])
    expect(v.blocking).toEqual([])
  })

  it('an optional item that is missing neither blocks nor warns', () => {
    // Drug screening is required: false in the packet.
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.outcome).toBe('PASS')
    expect(v.items.find((i) => i.key === 'DRUG_SCREENING')?.state).toBe('NEEDED')
  })
})

describe('what is already on file', () => {
  it('with everything required on file the person is cleared to start', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.outcome).toBe('PASS')
    expect(v.blocking).toEqual([])
    expect(v.chasing).toEqual([])
    expect(v.fix).toBeNull()
    expect(v.says).toMatch(/cleared to start/)
  })

  it('a held I-9 satisfies the right-to-work item too, so it is not asked for twice', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.items.find((i) => i.key === 'RIGHT_TO_WORK')?.state).toBe('ALREADY_HELD')
  })

  it('a check still running does not count as held', () => {
    const held = heldFrom([{ type: 'I9_EVERIFY', status: 'PENDING' }])
    expect(held.every((h) => !h.accepted)).toBe(true)
    const v = verdict([{ type: 'I9_EVERIFY', status: 'PENDING', expiresAt: null }])
    expect(v.outcome).toBe('BLOCK')
  })

  it('every item on the checklist is listed, held or not, so a screen can show all of it', () => {
    const v = verdict([clear('I9_EVERIFY')])
    const keys = v.items.map((i) => i.key)
    for (const k of ['RIGHT_TO_WORK', 'I9_EVERIFY', 'BACKGROUND_CHECK', 'DRUG_SCREENING', 'NDA']) {
      expect(keys).toContain(k)
    }
  })
})

describe('what it says', () => {
  it('the verdict names what is missing and what to do, in one sentence', () => {
    const v = verdict([])
    expect(v.says).toMatch(/Priya Raman cannot start without/)
    expect(v.fix).toMatch(/on file, then activate/)
  })

  it('a warning says the contract can start with a reason recorded', () => {
    const v = verdict([clear('I9_EVERIFY')])
    expect(v.says).toMatch(/can start with a reason recorded/)
    expect(v.fix).toMatch(/or activate with a reason/)
  })
})
