/**
 * A paper a person or a one-person firm puts on file before anybody asks.
 * Found by the release walk, 2026-10-27: a one-person firm was offered
 * herself to ask for a document and had nowhere to put her own W-9,
 * insurance or license; a candidate who signed up herself had nowhere to
 * keep the license she holds.
 */

import { describe, it, expect } from 'vitest'
import { BUILT_IN } from '@/lib/document-type'
import { mayFileOwnPaper, ownPaperMenu, whyNotOwn } from '@/lib/document-stages/own-papers'
import { licenseGate, credentialsToChase } from '@/lib/document-stages'
import { peopleOnBooks, heldFromDocInstances, KEPT_BY_HOLDER, statusWord } from '@/lib/document-request'

const ON = new Date('2026-10-27T15:00:00Z')

describe('what a person keeps about her own work', () => {
  it('a worker adds her own license or certificate from Your paperwork', () => {
    const menu = ownPaperMenu({ firm: false }).map((n) => n.key)
    expect(menu).toEqual(['PROFESSIONAL_LICENSE', 'CERTIFICATION', 'DEGREE', 'EDUCATION_EVALUATION'])

    const r = mayFileOwnPaper({
      key: 'PROFESSIONAL_LICENSE', about: 'ME', isOnePersonFirm: false, canKeepCopy: true,
      fileName: 'rn-license.pdf', number: 'RN-301122', issuer: 'Wisconsin Board of Nursing', validUntil: '2027-02-28',
    }, ON)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row.number).toBe('RN-301122')
      expect(r.row.issuer).toBe('Wisconsin Board of Nursing')
      expect(r.row.expiresAt?.toISOString().slice(0, 10)).toBe('2027-02-28')
      expect(r.row.says).toBe('Your professional license is on file, runs out Feb 28, 2027. Nobody has examined it yet: the firm that asks for it looks at it and records what it saw.')
    }
    expect(mayFileOwnPaper({ key: 'DEGREE', about: 'ME', isOnePersonFirm: false, canKeepCopy: true, fileName: 'bsn.pdf' }, ON).ok).toBe(true)
  })

  it('a license put on file by its holder needs its number, issuer and expiry', () => {
    const base = { key: 'PROFESSIONAL_LICENSE', about: 'ME' as const, isOnePersonFirm: false, canKeepCopy: true, fileName: 'l.pdf' }
    expect(mayFileOwnPaper(base, ON)).toMatchObject({ ok: false, code: 'NEEDS_NUMBER' })
    expect(mayFileOwnPaper({ ...base, number: 'RN-1' }, ON)).toMatchObject({ ok: false, code: 'NEEDS_ISSUER' })
    expect(mayFileOwnPaper({ ...base, number: 'RN-1', issuer: 'WI' }, ON)).toMatchObject({ ok: false, code: 'NEEDS_END' })
    expect(mayFileOwnPaper({ ...base, number: 'RN-1', issuer: 'WI', validUntil: '2026-10-01' }, ON)).toMatchObject({ ok: false, code: 'ALREADY_LAPSED' })
  })

  it('a worker\'s own paper keeps its copy on her record, and is never on file with no copy', () => {
    expect(mayFileOwnPaper({ key: 'DEGREE', about: 'ME', isOnePersonFirm: false, canKeepCopy: true }, ON)).toMatchObject({ ok: false, code: 'NEEDS_FILE' })
    expect(mayFileOwnPaper({
      key: 'PROFESSIONAL_LICENSE', about: 'ME', isOnePersonFirm: false, canKeepCopy: true,
      number: 'RN-1', issuer: 'WI', validUntil: '2027-01-01',
    }, ON)).toMatchObject({ ok: false, code: 'NEEDS_FILE' })
    const cert = { key: 'CERTIFICATION', about: 'ME' as const, isOnePersonFirm: false, canKeepCopy: true, fileName: 'bls.pdf', validUntil: '2027-05-01' }
    expect(mayFileOwnPaper(cert, ON)).toMatchObject({ ok: false, code: 'NEEDS_ISSUER' })
    expect(mayFileOwnPaper({ ...cert, issuer: 'American Heart Association' }, ON).ok).toBe(true)
    // Where the record has nowhere to keep the copy, it says so.
    expect(mayFileOwnPaper({ key: 'DEGREE', about: 'ME', isOnePersonFirm: false, canKeepCopy: false, fileName: 'bsn.pdf' }, ON)).toMatchObject({ ok: false, code: 'NO_COPY_HOME' })
  })

  it('an I-9 and a background check are never collected before an offer, even offered freely', () => {
    for (const key of ['I9_EVERIFY', 'RIGHT_TO_WORK', 'PASSPORT', 'GREEN_CARD', 'VISA', 'WORK_PERMIT', 'I94', 'DRIVERS_LICENSE']) {
      const r = mayFileOwnPaper({ key, about: 'ME', isOnePersonFirm: false, canKeepCopy: true, fileName: 'x.pdf', validUntil: '2030-01-01' }, ON)
      expect(r, key).toMatchObject({ ok: false, code: 'NOT_OWN_PAPER' })
      if (!r.ok) expect(r.message).toContain('after an offer')
    }
    for (const key of ['BACKGROUND_CHECK', 'DRUG_SCREENING']) {
      const r = mayFileOwnPaper({ key, about: 'ME', isOnePersonFirm: true, canKeepCopy: true, fileName: 'x.pdf', validUntil: '2030-01-01' }, ON)
      expect(r, key).toMatchObject({ ok: false, code: 'NOT_OWN_PAPER' })
      if (!r.ok) expect(r.message).toContain('screening company')
    }
  })

  it('a paper a person files herself is on file and not examined, so it clears no start', () => {
    const r = mayFileOwnPaper({ key: 'DEGREE', about: 'ME', isOnePersonFirm: false, canKeepCopy: true, fileName: 'bsn.pdf' }, ON)
    expect(r.ok && r.row.status).toBe('PENDING')
    const paper = (status: string) => ({
      status, validFrom: new Date('2026-09-01'), expiresAt: new Date('2027-08-31'), signedAt: ON, countersignedAt: null,
      template: { name: 'Certificate of general liability insurance' },
    })
    expect(heldFromDocInstances([paper('UPLOADED')] as any, BUILT_IN).map((h) => h.key)).toEqual(['INSURANCE_GL'])
    expect(heldFromDocInstances([paper(KEPT_BY_HOLDER)] as any, BUILT_IN)).toEqual([])
    expect(statusWord(KEPT_BY_HOLDER)).toBe('On file, not examined')
  })
})

describe('a one-person firm’s own papers', () => {
  it('a one-person firm puts its own W-9, insurance and license on file from Paperwork, and is never asked to ask herself', () => {
    const menu = ownPaperMenu({ firm: true })
    expect(menu.filter((n) => n.about === 'MY_FIRM').map((n) => n.key)).toEqual(['W9', 'INSURANCE_GL', 'INSURANCE_WC', 'GOOD_STANDING', 'BUSINESS_PARTNER', 'INSURANCE_EO'])
    expect(menu.some((n) => n.key === 'PROFESSIONAL_LICENSE' && n.about === 'ME')).toBe(true)

    const w9 = mayFileOwnPaper({ key: 'W9', about: 'MY_FIRM', isOnePersonFirm: true, canKeepCopy: true, fileName: 'w9.pdf' }, ON)
    expect(w9).toMatchObject({ ok: false, code: 'NEEDS_EDITION' })
    expect(mayFileOwnPaper({ key: 'W9', about: 'MY_FIRM', isOnePersonFirm: true, canKeepCopy: true, fileName: 'w9.pdf', edition: 'Rev. March 2024' }, ON).ok).toBe(true)

    const gl = { key: 'INSURANCE_GL', about: 'MY_FIRM' as const, isOnePersonFirm: true, canKeepCopy: true, fileName: 'coi.pdf' }
    expect(mayFileOwnPaper({ ...gl, validUntil: '2027-08-31' }, ON)).toMatchObject({ ok: false, code: 'NEEDS_START' })
    const ok = mayFileOwnPaper({ ...gl, validFrom: '2026-09-01', validUntil: '2027-08-31' }, ON)
    expect(ok.ok && ok.row.says).toBe('Your firm’s certificate of general liability insurance is on file, runs out Aug 31, 2027. Nobody has examined it yet: the firm that asks for it looks at it and records what it saw.')

    // Nobody is offered herself to ask.
    const books = peopleOnBooks(
      { ok: true, rows: [] } as any,
      { data: { roster: [{ personId: 'p-theresa', name: 'Theresa Quaye' }] } },
      {},
      'p-theresa',
    )
    expect(books.people).toEqual([])
  })

  it('only a one-person firm files a firm’s papers from its own page', () => {
    expect(mayFileOwnPaper({ key: 'W9', about: 'MY_FIRM', isOnePersonFirm: false, canKeepCopy: true, fileName: 'w9.pdf', edition: 'Rev. March 2024' }, ON))
      .toMatchObject({ ok: false, code: 'NOT_YOUR_FIRM' })
    expect(whyNotOwn('NDA', 'MY_FIRM')).toContain('not one of your firm’s own papers')
  })
})

describe('a license its holder filed', () => {
  it('a license its holder filed is chased for renewal and never clears the license gate', () => {
    const own = {
      type: 'PROFESSIONAL_LICENSE', status: 'PENDING', selfFiled: true,
      expiresAt: new Date('2026-11-20T00:00:00Z'), number: 'RN-88', state: 'OH',
    }
    const chases = credentialsToChase([own], ['PROFESSIONAL_LICENSE'], ON, undefined, 'Halcyon Talent')
    expect(chases.length).toBe(1)
    // An ordinary PENDING row is a check not back yet: nothing to renew.
    expect(credentialsToChase([{ ...own, selfFiled: false }], ['PROFESSIONAL_LICENSE'], ON)).toEqual([])

    // The gate reads her own filing exactly as it reads no license at all:
    // nobody examined it, so it stands behind no start.
    const gate = licenseGate({ personName: 'Nina Okafor', credentials: [own], keys: ['PROFESSIONAL_LICENSE'], on: ON })
    const none = licenseGate({ personName: 'Nina Okafor', credentials: [], keys: ['PROFESSIONAL_LICENSE'], on: ON })
    expect(gate).toEqual(none)
  })
})
