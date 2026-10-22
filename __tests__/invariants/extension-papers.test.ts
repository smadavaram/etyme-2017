/**
 * An extension reads the papers (lib/contract-clearance `extensionPapers`):
 * work authorization ending before the new end date stops it; anything
 * else ending first warns, and the extension goes ahead only with a
 * reason. The route that calls it is money's (`POST /api/contracts/[id]/extend`).
 */
import { describe, it, expect } from 'vitest'
import { extensionPapers, mayExtendOnPapers, EXTENSION_PAPERS } from '@/lib/contract-clearance'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const NEW_END = d('2027-06-30')
const base = { personName: 'Ines Abernathy', supplierName: 'Ardley Talent', newEnd: NEW_END, person: [], supplier: [] }

describe('an extension reads the papers', () => {
  it('an I-94 that runs out before the new end date stops the extension, in a sentence naming both dates', () => {
    const v = extensionPapers({ ...base, person: [{ type: 'I94', status: 'CLEAR', expiresAt: d('2027-03-03') }] })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toBe('Ines Abernathy’s I-94 record runs out on Mar 3, 2027, before the new end date of Jun 30, 2027. Nobody works past the day their authorization ends: get the new one on file, then extend.')
    expect(mayExtendOnPapers(v, 'The client needs her')).toMatchObject({ ok: false, code: 'PAPERS_BLOCK' })
  })

  it('a visa, a work permit (EAD), a right-to-work check or the I-9’s own reverification date ending first each stop it, whatever the reason given', () => {
    for (const key of ['VISA', 'WORK_PERMIT', 'RIGHT_TO_WORK', 'I9_EVERIFY']) {
      const v = extensionPapers({ ...base, person: [{ type: key, status: 'CLEAR', expiresAt: d('2027-01-15') }] })
      expect(v.outcome, key).toBe('BLOCK')
      expect(mayExtendOnPapers(v, 'reason').ok, key).toBe(false)
    }
  })

  it('a supplier’s insurance certificate ending first warns, and the extension goes ahead only with a reason that is kept', () => {
    const v = extensionPapers({ ...base, supplier: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: d('2027-04-01') }] })
    expect(v.outcome).toBe('WARN')
    expect(v.says).toBe('Ardley Talent’s general liability certificate runs out on Apr 1, 2027, before the new end date of Jun 30, 2027. Get the renewal on file, or say why the extension goes ahead without it.')
    expect(mayExtendOnPapers(v, '  ')).toMatchObject({ ok: false, code: 'PAPERS_NEED_A_REASON' })
    expect(mayExtendOnPapers(v, 'The broker confirmed renewal; certificate due next week')).toEqual({ ok: true, reason: 'The broker confirmed renewal; certificate due next week' })
  })

  it('good standing and a professional license ending first warn rather than stop', () => {
    const v = extensionPapers({
      ...base,
      person: [{ type: 'PROFESSIONAL_LICENSE', status: 'CLEAR', expiresAt: d('2027-02-01') }],
      supplier: [{ type: 'GOOD_STANDING', status: 'CLEAR', expiresAt: d('2027-05-01') }],
    })
    expect(v.outcome).toBe('WARN')
    expect(v.items.map((i) => i.key)).toEqual(['PROFESSIONAL_LICENSE', 'GOOD_STANDING'])
  })

  it('a renewal already on file answers the paper it replaces, and a paper running past the new end date says nothing', () => {
    const v = extensionPapers({
      ...base,
      person: [
        { type: 'WORK_PERMIT', status: 'CLEAR', expiresAt: d('2027-01-15') },
        { type: 'WORK_PERMIT', status: 'CLEAR', expiresAt: d('2028-01-15') },
      ],
      supplier: [{ type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: d('2027-09-01') }],
    })
    expect(v).toEqual({ outcome: 'PASS', items: [], says: '' })
    expect(mayExtendOnPapers(v, null)).toEqual({ ok: true, reason: null })
  })

  it('a citizen with no visa is not refused for a visa they do not need, and a flagged paper is not leaned on', () => {
    expect(extensionPapers({ ...base, person: [{ type: 'PASSPORT', status: 'CLEAR', expiresAt: d('2026-12-01') }] }).outcome).toBe('PASS')
    const v = extensionPapers({ ...base, person: [{ type: 'VISA', status: 'FLAGGED', expiresAt: d('2029-01-01') }] })
    expect(v.outcome).toBe('PASS')
  })

  it('when work authorization and a certificate both end first, the work authorization is said first and the extension is stopped', () => {
    const v = extensionPapers({
      ...base,
      person: [{ type: 'VISA', status: 'CLEAR', expiresAt: d('2027-05-01') }],
      supplier: [{ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: d('2027-01-01') }],
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.items[0].key).toBe('VISA')
    expect(Object.entries(EXTENSION_PAPERS).filter(([, r]) => r.blocks).map(([k]) => k).sort()).toEqual(['I94', 'I9_EVERIFY', 'RIGHT_TO_WORK', 'VISA', 'WORK_PERMIT'])
  })
})

describe('an extension reads the papers across every added day, not only their last day', () => {
  const FROM = d('2027-01-01')

  it('a work permit whose renewal starts a month after the old one runs out leaves a gap, and the gap stops the extension, naming the days', () => {
    const v = extensionPapers({
      ...base, from: FROM,
      person: [
        { type: 'WORK_PERMIT', status: 'CLEAR', validFrom: d('2025-03-01'), expiresAt: d('2027-03-03') },
        { type: 'WORK_PERMIT', status: 'CLEAR', validFrom: d('2027-04-01'), expiresAt: d('2029-03-31') },
      ],
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.items[0].gap?.from.toISOString().slice(0, 10)).toBe('2027-03-04')
    expect(v.items[0].gap?.to.toISOString().slice(0, 10)).toBe('2027-03-31')
    expect(v.says).toBe('Ines Abernathy’s work permit (EAD) runs out on Mar 3, 2027 and the next one on file starts on Apr 1, 2027, so Mar 4, 2027 to Mar 31, 2027 are not covered, before the new end date of Jun 30, 2027. Nobody works on a day their authorization does not cover: get one on file that covers those days, then extend.')
    expect(mayExtendOnPapers(v, 'The renewal is filed')).toMatchObject({ ok: false, code: 'PAPERS_BLOCK' })
  })

  it('a renewal that starts the day after the old one ends leaves no gap, and the extension goes ahead', () => {
    const v = extensionPapers({
      ...base, from: FROM,
      person: [
        { type: 'VISA', status: 'CLEAR', validFrom: d('2024-03-01'), expiresAt: d('2027-03-03') },
        { type: 'VISA', status: 'CLEAR', validFrom: d('2027-03-04'), expiresAt: d('2030-03-03') },
      ],
    })
    expect(v).toEqual({ outcome: 'PASS', items: [], says: '' })
  })

  it('a supplier’s cover with a gap warns with the dates, and goes ahead only with a reason', () => {
    const v = extensionPapers({
      ...base, from: FROM,
      supplier: [
        { type: 'INSURANCE_GL', status: 'CLEAR', validFrom: d('2026-02-01'), expiresAt: d('2027-01-31') },
        { type: 'INSURANCE_GL', status: 'CLEAR', validFrom: d('2027-02-15'), expiresAt: d('2028-02-14') },
      ],
    })
    expect(v.outcome).toBe('WARN')
    expect(v.says).toBe('Ardley Talent’s general liability certificate runs out on Jan 31, 2027 and the next one on file starts on Feb 15, 2027, so Feb 1, 2027 to Feb 14, 2027 are not covered, before the new end date of Jun 30, 2027. Get cover for those days on file, or say why the extension goes ahead without it.')
    expect(mayExtendOnPapers(v, '')).toMatchObject({ ok: false, code: 'PAPERS_NEED_A_REASON' })
    expect(mayExtendOnPapers(v, 'The broker confirmed the policy was continuous; the certificate is being reissued')).toMatchObject({ ok: true })
  })

  it('a single day uncovered is said as one day, and still stops work authorization', () => {
    const v = extensionPapers({
      ...base, from: FROM,
      person: [
        { type: 'I94', status: 'CLEAR', validFrom: d('2025-01-01'), expiresAt: d('2027-02-01') },
        { type: 'I94', status: 'CLEAR', validFrom: d('2027-02-03'), expiresAt: d('2028-02-01') },
      ],
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toContain('so Feb 2, 2027 is not covered')
  })

  it('a paper whose only copy starts after the first added day leaves those first days uncovered', () => {
    const v = extensionPapers({
      ...base, from: FROM,
      supplier: [{ type: 'GOOD_STANDING', status: 'CLEAR', validFrom: d('2027-02-01'), expiresAt: d('2028-01-31') }],
    })
    expect(v.outcome).toBe('WARN')
    expect(v.says).toContain('certificate of good standing on file starts on Feb 1, 2027, so Jan 1, 2027 to Jan 31, 2027 are not covered')
  })
})
