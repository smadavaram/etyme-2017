import { describe, it, expect } from 'vitest'
import {
  certificationHeldOn, heldKeys, dueToLapse, setAsideEligibility, claimableNames, checkCertificationInput,
  checkAttestationInput, currentAttestations, attestedFacts, certificateOnFile,
} from '@/lib/attestation/certification-held'

const today = new Date('2027-03-10T15:00:00.000Z')
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const paper = { status: 'UPLOADED', file: { id: 'f1' } }
const held = (over: Record<string, unknown> = {}) => ({ kind: 'EIGHT_A', status: 'HELD', expiresOn: day('2027-12-31'), document: paper, ...over }) as never

describe('a certification is held only with a certificate on file and an expiry day not yet past', () => {
  it('a certification set held, with its certificate and an expiry day ahead, counts as held', () => {
    expect(certificationHeldOn(held(), today)).toMatchObject({ held: true, state: 'HELD' })
  })
  it('a certification is still held on its expiry day and lapses the day after', () => {
    expect(certificationHeldOn(held({ expiresOn: day('2027-03-10') }), today).held).toBe(true)
    expect(certificationHeldOn(held({ expiresOn: day('2027-03-09') }), today)).toMatchObject({ held: false, state: 'LAPSED_BY_DATE' })
  })
  it('a certification set held with no certificate on file does not count and says the certificate is missing', () => {
    const r = certificationHeldOn(held({ document: null }), today)
    expect(r).toMatchObject({ held: false, state: 'NO_CERTIFICATE' })
    expect(r.says).toMatch(/certificate is not on file/)
  })
  it('a certificate that was asked for and never uploaded is not on file', () => {
    expect(certificateOnFile({ status: 'PENDING', file: { id: 'f1' } })).toBe(false)
    expect(certificateOnFile({ status: 'UPLOADED' })).toBe(false)
    expect(certificateOnFile({ status: 'SIGNED', signedFileUrl: 'https://x.example/c.pdf' })).toBe(true)
  })
  it('a certification set held with no expiry day recorded does not count, and says so', () => {
    const r = certificationHeldOn(held({ expiresOn: null }), today)
    expect(r).toMatchObject({ held: false, state: 'NO_EXPIRY' })
    expect(r.says).toMatch(/no expiry day recorded/)
  })
  it('a certification only applied for, not held or lapsed never counts as held', () => {
    for (const status of ['APPLIED', 'NOT_HELD', 'LAPSED']) expect(certificationHeldOn(held({ status }), today).held).toBe(false)
  })
  it('a kind counts as held if any one row of that kind qualifies', () => {
    const rows = [held({ status: 'LAPSED' }), held()]
    expect(heldKeys(rows, today).has('EIGHT_A')).toBe(true)
  })
  it('another certification is told apart by the name the Owner gave it', () => {
    const rows = [held({ kind: 'OTHER', otherName: 'State DBE' })]
    expect(heldKeys(rows, today).has('OTHER:state dbe')).toBe(true)
    expect(heldKeys(rows, today).has('OTHER:city sbe')).toBe(false)
  })
  it('only a certification set held whose expiry day has passed is due to lapse', () => {
    const rows = [held({ expiresOn: day('2027-01-01') }), held({ kind: 'MBE' }), held({ kind: 'WBE', status: 'APPLIED', expiresOn: day('2027-01-01') })]
    expect(dueToLapse(rows, today)).toHaveLength(1)
  })
})

describe('a bid set aside for a certification is eligible only where the firm holds it today', () => {
  it('an open bid is eligible with nothing said', () => {
    expect(setAsideEligibility({ kind: null }, [], today)).toEqual({ eligible: true, says: null })
  })
  it('a bid set aside for 8(a) firms is refused in a sentence where the firm holds no 8(a) certification', () => {
    expect(setAsideEligibility({ kind: 'EIGHT_A' }, [], today)).toEqual({
      eligible: false, says: 'This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.',
    })
  })
  it('a certification applied for is said to be applied for, never counted', () => {
    const r = setAsideEligibility({ kind: 'MBE' }, [held({ kind: 'MBE', status: 'APPLIED' })], today)
    expect(r.eligible).toBe(false)
    expect(r.says).toBe('This bid is set aside for MBE firms. Your MBE certification is applied for and not held yet.')
  })
  it('a certification that expired is said to have expired on its day', () => {
    const r = setAsideEligibility({ kind: 'HUBZONE' }, [held({ kind: 'HUBZONE', expiresOn: day('2027-02-01') })], today)
    expect(r.says).toBe('This bid is set aside for HUBZone firms. Your HUBZone certification expired on 2027-02-01.')
  })
  it('a certification held without its certificate does not make the bid eligible', () => {
    expect(setAsideEligibility({ kind: 'EIGHT_A' }, [held({ document: null })], today).eligible).toBe(false)
  })
  it('a bid is eligible where the firm holds the named certification in date', () => {
    expect(setAsideEligibility({ kind: 'EIGHT_A' }, [held()], today)).toEqual({ eligible: true, says: null })
  })
  it('holding a different certification does not make a bid set aside for another eligible', () => {
    expect(setAsideEligibility({ kind: 'WBE' }, [held({ kind: 'MBE' })], today).eligible).toBe(false)
  })
  it('a bid set aside for another certification with no name asks for the name', () => {
    expect(setAsideEligibility({ kind: 'OTHER', otherName: ' ' }, [], today).says).toMatch(/Name the certification it requires/)
  })
  it('a draft may name only the certifications held today, never one applied for or lapsed', () => {
    const rows = [held(), held({ kind: 'MBE', status: 'APPLIED' }), held({ kind: 'WBE', expiresOn: day('2026-01-01') })]
    expect(claimableNames(rows, today)).toEqual(['8(a)'])
  })
})

describe('the Owner records a certification only with what makes it true', () => {
  const good = { kind: 'EIGHT_A', status: 'HELD', certifier: 'The certifying agency', number: 'A-123', issuedOn: '2026-06-01', expiresOn: '2027-06-01', documentId: 'd1' }
  it('a complete held certification is accepted', () => {
    expect(checkCertificationInput(good)).toMatchObject({ ok: true })
  })
  it('a held certification without its certificate is refused and told to attach it or record it as applied for', () => {
    const r = checkCertificationInput({ ...good, documentId: null })
    expect(r).toMatchObject({ ok: false }); expect((r as any).says).toMatch(/only with its certificate/)
  })
  it('a held certification without an expiry day is refused', () => {
    expect((checkCertificationInput({ ...good, expiresOn: '' }) as any).says).toMatch(/day it expires/)
  })
  it('a certification applied for needs neither a certificate nor an expiry day', () => {
    expect(checkCertificationInput({ kind: 'MBE', status: 'APPLIED' })).toMatchObject({ ok: true })
  })
  it('another kind of certification must be named', () => {
    expect((checkCertificationInput({ kind: 'OTHER', status: 'APPLIED' }) as any).says).toMatch(/Name the certification/)
  })
  it('an expiry day before the issue day is refused', () => {
    expect((checkCertificationInput({ ...good, issuedOn: '2027-07-01' }) as any).says).toMatch(/before the day it was issued/)
  })
  it('a status or kind that is not one of the listed ones is refused', () => {
    expect(checkCertificationInput({ ...good, status: 'CLEARED' }).ok).toBe(false)
    expect(checkCertificationInput({ ...good, kind: 'MINORITY' }).ok).toBe(false)
  })
})

describe('an ownership fact is the Owner’s own attestation, newest answer standing', () => {
  const t = (s: string) => new Date(s)
  it('the newest row for a fact is the answer, so a later withdrawal ends it', () => {
    const rows = [
      { fact: 'MINORITY_OWNED', attested: true, attestedById: 'p1', attestedAt: t('2027-01-01') },
      { fact: 'MINORITY_OWNED', attested: false, attestedById: 'p1', attestedAt: t('2027-02-01') },
      { fact: 'WOMAN_OWNED', attested: true, attestedById: 'p1', attestedAt: t('2027-01-05') },
    ]
    expect(currentAttestations(rows)).toHaveLength(2)
    expect(attestedFacts(rows).map((r) => r.fact)).toEqual(['WOMAN_OWNED'])
  })
  it('an attestation must name a known fact and say yes or no', () => {
    expect(checkAttestationInput({ fact: 'MINORITY_OWNED', attested: true })).toMatchObject({ ok: true })
    expect(checkAttestationInput({ fact: 'RICH', attested: true }).ok).toBe(false)
    expect(checkAttestationInput({ fact: 'MINORITY_OWNED' }).ok).toBe(false)
  })
})
