import { describe, it, expect } from 'vitest'
import { coverGaps, type CoverRow } from '@/lib/cover-gap'

/**
 * The weeks nobody is insured.
 *
 * The nightly chase warned about a certificate running out and said
 * nothing at all about the hole between one policy ending and the next
 * beginning — which is the week somebody is actually standing on a site
 * with nothing behind them. Every sentence here is about that hole.
 */

const TODAY = new Date('2026-09-17T00:00:00Z')
const inDays = (n: number) => new Date(TODAY.getTime() + n * 86_400_000)

function cert(over: Partial<CoverRow> & { id: string }): CoverRow {
  return {
    companyId: 'brightmoor',
    companyName: 'Brightmoor Talent',
    type: 'INSURANCE_GL',
    status: 'CLEAR',
    issuedAt: inDays(-1),
    validFrom: null,
    expiresAt: null,
    ...over,
  }
}

describe('the nightly chase asks about the weeks between one policy and the next', () => {

  it('a supplier whose only general liability cover begins in three weeks is chased for the weeks nobody is insured', () => {
    const found = coverGaps(
      [cert({ id: 'gl-next', validFrom: inDays(21), expiresAt: inDays(386) })],
      TODAY
    )
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('COVER_NOT_STARTED')
    expect(found[0].urgency).toBe('BLOCKING')
  })

  it('and the chase says which day cover begins and how long nobody is insured, never that somebody should renew it', () => {
    const [finding] = coverGaps(
      [cert({ id: 'gl-next', validFrom: inDays(21), expiresAt: inDays(386) })],
      TODAY
    )
    expect(finding.headline).toContain('does not start until 2026-10-08')
    expect(finding.detail).toContain('21 days')
    expect(finding.detail).toContain('Renewing is not the ask')
    expect(finding.detail).toContain('nobody starts before the cover does')
  })

  it('a supplier that filed next year’s certificate early, over cover that runs today, is not chased at all', () => {
    const found = coverGaps(
      [
        cert({ id: 'gl-now', validFrom: inDays(-340), expiresAt: inDays(25) }),
        cert({ id: 'gl-next', validFrom: inDays(26), expiresAt: inDays(391) }),
      ],
      TODAY
    )
    expect(found).toEqual([])
  })

  it('cover that runs out in a fortnight and a replacement starting a month later leaves a gap, and the gap is what is said', () => {
    const [finding] = coverGaps(
      [
        cert({ id: 'gl-now', validFrom: inDays(-350), expiresAt: inDays(14) }),
        cert({ id: 'gl-next', validFrom: inDays(32), expiresAt: inDays(397) }),
      ],
      TODAY
    )
    expect(finding.kind).toBe('COVER_GAP')
    // Seventeen days between the last day of cover and the first day of
    // the new policy, counted as the days in between and not the dates.
    expect(finding.headline).toContain('17 days with no')
    expect(finding.detail).toContain('runs out on 2026-10-01')
    expect(finding.detail).toContain('does not start until 2026-10-19')
    expect(finding.detail).toContain('cover for the weeks in between')
  })

  it('a replacement that starts the day after the old cover ends leaves no gap, and nobody is asked for anything', () => {
    const found = coverGaps(
      [
        cert({ id: 'gl-now', validFrom: inDays(-350), expiresAt: inDays(14) }),
        cert({ id: 'gl-next', validFrom: inDays(15), expiresAt: inDays(380) }),
      ],
      TODAY
    )
    expect(found).toEqual([])
  })

  it('cover that ran out with nothing filed behind it is left to the expiry watch, which already says so', () => {
    const found = coverGaps(
      [cert({ id: 'gl-old', validFrom: inDays(-400), expiresAt: inDays(-30) })],
      TODAY
    )
    expect(found).toEqual([])
  })

  it('a supplier with no certificate on file at all is not reported as a gap, because a gap is between two dates', () => {
    expect(coverGaps([], TODAY)).toEqual([])
  })

  it('a certificate nobody has accepted yet is not counted as cover', () => {
    const found = coverGaps(
      [
        cert({ id: 'gl-now', validFrom: inDays(-350), expiresAt: inDays(-1) }),
        cert({ id: 'gl-pending', status: 'PENDING', validFrom: inDays(30), expiresAt: inDays(395) }),
      ],
      TODAY
    )
    expect(found).toEqual([])
  })

  it('a gap that opens after the next two months is not raised today, because a warning nobody can act on yet is noise', () => {
    const found = coverGaps(
      [
        cert({ id: 'gl-now', validFrom: inDays(-100), expiresAt: inDays(120) }),
        cert({ id: 'gl-next', validFrom: inDays(150), expiresAt: inDays(515) }),
      ],
      TODAY
    )
    expect(found).toEqual([])
  })

  it('each kind of cover is answered on its own — general liability running does not insure a workers’ compensation gap', () => {
    const found = coverGaps(
      [
        cert({ id: 'gl', validFrom: inDays(-100), expiresAt: inDays(260) }),
        cert({ id: 'wc-next', type: 'INSURANCE_WC', validFrom: inDays(10), expiresAt: inDays(375) }),
      ],
      TODAY
    )
    expect(found).toHaveLength(1)
    expect(found[0].headline).toContain('workers')
  })

  it('cover that never expires has no gap after it, and is not chased', () => {
    const found = coverGaps(
      [
        cert({ id: 'gl-forever', validFrom: inDays(-100), expiresAt: null }),
        cert({ id: 'gl-next', validFrom: inDays(30), expiresAt: inDays(395) }),
      ],
      TODAY
    )
    expect(found).toEqual([])
  })

  it('the finding names the certificate that starts late, so the chase asks for the right document', () => {
    const [finding] = coverGaps(
      [cert({ id: 'gl-next', validFrom: inDays(21), expiresAt: inDays(386) })],
      TODAY
    )
    expect(finding.subjectType).toBe('Verification')
    expect(finding.subjectId).toBe('gl-next')
    expect(finding.companyId).toBe('brightmoor')
  })

  it('where the paper does not say when cover begins, the day it was issued is the start', () => {
    const found = coverGaps(
      [cert({ id: 'gl', validFrom: null, issuedAt: inDays(10), expiresAt: inDays(375) })],
      TODAY
    )
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('COVER_NOT_STARTED')
  })
})
