/**
 * What the document-flow walk of 2026-10-21 found, each as a sentence.
 *
 * The founder asked "Can you test the docflow." The rules held; these
 * did not, and each is the trust layer saying something untrue.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { contractClearance, heldFrom, startPreview, PUBLISHED_EDITIONS, publishedFor } from '@/lib/contract-clearance'
import { calendarDaysBetween, standingOf } from '@/lib/document-stages'
import { heldWord } from '@/lib/document-request'

const on = new Date('2026-10-21T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const insured = [
  { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: inDays(200), verifiedAt: on },
  { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: inDays(200), verifiedAt: on },
]
const signedNda = [{ key: 'NDA', expiresAt: null, accepted: true }]
const i9 = (formEdition: string, completedAt: Date) => ({
  type: 'I9_EVERIFY', status: 'CLEAR', expiresAt: null, formEdition, completedAt, issuedAt: completedAt,
  backedBy: [{ key: 'PASSPORT', inForce: true }],
})
const report = (status: string, renderedOn: Date) => ({
  type: 'BACKGROUND_CHECK', status, provider: 'Sterling', referenceId: `STE-${status}`,
  issuedAt: renderedOn, verifiedAt: renderedOn, expiresAt: new Date(renderedOn.getTime() + 365 * 86_400_000),
})
const verdict = (personVerifications: any[]) =>
  contractClearance({ personName: 'Helena Marsh', personVerifications, supplierName: 'Techpeple', supplierCertificates: insured, clientName: 'Northbend Athletic', on, extraHeld: signedNda })

describe('a background check is read as the screening company’s newest report', () => {
  it('a newer flagged report is not hidden behind an older clear one', () => {
    const held = heldFrom([report('CLEAR', day('2026-03-01')), report('FLAGGED', day('2026-10-15'))] as any)
    expect(held.filter((h) => h.key === 'BACKGROUND_CHECK').map((h) => h.accepted)).toEqual([false])
  })
  it('a newer clear report answers an older flagged one', () => {
    const held = heldFrom([report('FLAGGED', day('2026-03-01')), report('CLEAR', day('2026-10-15'))] as any)
    expect(held.filter((h) => h.key === 'BACKGROUND_CHECK').map((h) => h.accepted)).toEqual([true])
  })
  it('a flagged report warns at the start and says the steps that come before any decision on it', () => {
    const v = verdict([i9('01/20/25', day('2026-10-01')), report('CLEAR', day('2026-03-01')), report('FLAGGED', day('2026-10-15'))])
    expect(v.outcome).toBe('WARN')
    expect(v.says).toContain('Sterling flagged the background check on Oct 15, 2026, reference STE-FLAGGED')
    expect(v.says).toContain('gives Helena Marsh the pre-adverse action notice with a copy of the report, waits, and only then decides')
    expect(v.says).not.toContain('still waiting on a background check')
  })
})

describe('an I-9 edition is judged at every company, not only where a company recorded its editions', () => {
  it('an I-9 completed this month on the 2019 edition warns at the start, naming the edition in force', () => {
    const v = verdict([i9('10/21/19', day('2026-10-01')), report('CLEAR', day('2026-10-01'))])
    expect(v.outcome).toBe('WARN')
    expect(v.says).toContain('edition 10/21/19, and edition 01/20/25 was the one in force when it was signed')
  })
  it('an I-9 signed on the 2023 edition while it was still accepted is current, though a newer one existed', () => {
    expect(publishedFor('I9_EVERIFY', '08/01/23', day('2025-03-01')).map((e) => e.edition)).toEqual(['08/01/23'])
    const v = verdict([i9('08/01/23', day('2025-03-01')), report('CLEAR', day('2026-10-01'))])
    expect(v.outcome).toBe('PASS')
  })
  it('the published list is data: three editions of the I-9, the newest still current', () => {
    expect(PUBLISHED_EDITIONS.I9_EVERIFY.map((e) => [e.edition, e.retiredAt ? 'retired' : 'current'])).toEqual([
      ['10/21/19', 'retired'], ['08/01/23', 'retired'], ['01/20/25', 'current'],
    ])
  })
})

describe('HR reads the days to the start from today', () => {
  it('a person starting in a week is due in a week, though the papers are judged on the first day', () => {
    const p = startPreview({
      personName: 'Helena Marsh', personVerifications: [], supplierName: 'Techpeple', supplierCertificates: insured,
      clientName: 'Northbend Athletic', on: inDays(7), today: on, startDate: inDays(7), extraHeld: signedNda,
    })
    expect(p.daysUntilStart).toBe(7)
    expect(p.headline).not.toContain('today')
  })
})

describe('a lapse is counted in calendar days, the same on every page', () => {
  it('a certificate that ran out on October 19 ran out two days ago on October 21, at any hour', () => {
    for (const hour of ['00:30', '06:58', '23:59']) {
      const now = new Date(`2026-10-21T${hour}:00Z`)
      expect(calendarDaysBetween(day('2026-10-19'), now)).toBe(-2)
      expect(heldWord(day('2026-10-19'), now)).toBe('Ran out 2 days ago')
      expect(standingOf({ key: 'INSURANCE_GL', label: 'Certificate', expiresAt: day('2026-10-19') }, { key: 'INSURANCE_GL', label: 'Certificate', validMonths: 12 }, now).says).toBe('Certificate expired 2 days ago.')
    }
  })
})

describe('the start, the clearance list and the worker’s page agree on the signed NDA', () => {
  const hers = [{ key: 'NDA', label: 'Signed non-disclosure agreement', required: true, owedBy: 'WORKER', blocks: false, from: 'DEFAULT' as const, says: 'asked of every employee as standard paperwork', waived: false }]
  const i9AndCheck = [i9('01/20/25', day('2026-10-01')), report('CLEAR', day('2026-10-01'))]
  const preview = (extraHeld: any[]) => startPreview({
    personName: 'Helena Marsh', personVerifications: i9AndCheck, supplierName: 'Techpeple', supplierCertificates: insured,
    clientName: 'Northbend Athletic', on, today: on, startDate: inDays(7), extraHeld, requirements: hers,
  })
  it('the NDA the worker owes on the line that employs her warns at the start, is on "Still needed", and says nothing else', () => {
    const p = preview([])
    expect(p.outcome).toBe('WARN')
    expect(p.chasing.map((c) => c.key)).toEqual(['NDA'])
    expect(p.outstanding).toBe('Still needed: Signed non-disclosure agreement.')
  })
  it('signed, it is on neither list and the start is clear', () => {
    const p = preview(signedNda)
    expect(p.outcome).toBe('PASS')
    expect(p.outstanding).toBeNull()
  })
})

describe('the routes the walk found saying something untrue', () => {
  it('the no-sign-in document link sends the file itself, never a name with nothing behind it', () => {
    const page = read('src/app/packet/[token]/page.tsx')
    expect(page).not.toContain('pending://')
    expect(page).toContain("form.set('file', file, file.name)")
    const route = read('src/app/api/packet/[token]/route.ts')
    expect(route).toContain('docFile.upsert')
    expect(route).toContain('A file name with nothing behind it is not a document anybody can check.')
  })
  it('a waiver with a blank reason is refused, never written as an override', () => {
    expect(read('src/app/api/documents/requirements/route.ts')).toContain('one with no reason is not a waiver')
  })
  it('a packet review is refused as "not here" for a firm that did not send it, before anybody is named to ask', () => {
    const route = read('src/app/api/packets/[id]/review/route.ts')
    expect(route.indexOf('was not sent by your company')).toBeLessThan(route.indexOf('askTheDesk({'))
  })
  it('the nightly check watches a supplier’s good standing on running lines', () => {
    const lib = read('src/lib/document-request.ts')
    expect(lib).toMatch(/standingToRenew\(now, opts\)/)
  })
})
