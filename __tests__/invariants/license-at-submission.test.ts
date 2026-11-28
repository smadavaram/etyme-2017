import { describe, expect, it } from 'vitest'
import { licenseAtSubmission, type LicenseAsk } from '@/app/api/submissions/license'
import { asksFrom, type OrderRow } from '@/app/api/submissions/license-asks'

/**
 * Found by the screen walk of 2026-10-22: a job that needs a license was
 * checked only when the person started. These are the sentences for the
 * check at submission (app/api/submissions/license.ts).
 */

const NOW = new Date('2026-10-22T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)

const nurseAsk: LicenseAsk = {
  key: 'PROFESSIONAL_LICENSE',
  said: 'state nursing license',
  blocks: false,
  because: '“Occupational health nurse” is a licensed job',
}

const held = (o: Partial<{ status: string; validFrom: Date | null; expiresAt: Date | null; state: string | null; number: string | null }> = {}) => ({
  type: 'PROFESSIONAL_LICENSE',
  label: 'Professional license',
  status: o.status ?? 'CLEAR',
  validFrom: o.validFrom ?? null,
  expiresAt: o.expiresAt === undefined ? d('2028-01-31') : o.expiresAt,
  verifiedAt: d('2026-01-01'),
  number: o.number ?? 'RN 154-882',
  state: o.state ?? 'WI',
})

describe('a license is asked when a person is put forward, not first at the start', () => {
  it('a job whose title names a licensed occupation asks for a license at submission', () => {
    const asks = asksFrom({ title: 'Occupational health nurse', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true, rows: [], documentTypes: [] })
    expect(asks).toEqual([
      { key: 'PROFESSIONAL_LICENSE', said: 'state nursing license', blocks: false, because: '“Occupational health nurse” is a licensed job' },
    ])
  })

  it('a job that asks for no license says nothing about licenses', () => {
    const asks = asksFrom({ title: 'ERP integration lead', clientName: 'Northbend Athletic', supplierCompanyId: 's1', supplierHasOrder: true, rows: [], documentTypes: [] })
    expect(asks).toEqual([])
    expect(licenseAtSubmission({ personName: 'Helena Marsh', asks, credentials: [], startsOn: null, through: null, now: NOW }))
      .toEqual({ outcome: 'PASS', note: null })
  })

  it('a person put forward for a licensed job with no license on file is warned, with a reason code, and asked for a reason', () => {
    const v = licenseAtSubmission({ personName: 'Colleen Byrne', asks: [nurseAsk], credentials: [], startsOn: null, through: null, now: NOW })
    expect(v.outcome).toBe('WARN')
    if (v.outcome !== 'WARN') return
    expect(v.code).toBe('LICENSE_NONE_ON_FILE')
    expect(v.says).toBe(
      'Colleen Byrne has no state nursing license on file, and “Occupational health nurse” is a licensed job. ' +
        'The submission can go ahead with a reason; nobody starts without a current license.'
    )
  })

  it('where the client’s order says a missing license blocks, the person is refused at submission in a sentence', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne',
      asks: [{ ...nurseAsk, blocks: true, because: "Talvern Medical's orders require one" }],
      credentials: [], startsOn: null, through: null, now: NOW,
    })
    expect(v).toEqual({
      outcome: 'BLOCK',
      code: 'LICENSE_NONE_ON_FILE',
      says:
        "Colleen Byrne has no state nursing license on file, and Talvern Medical's orders require one. " +
        "The client's order says nobody is put forward for this job without a current one. Get it on file, then put them forward.",
    })
  })

  it('a license that lapsed before the job starts is warned with the day it ran out', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne', asks: [nurseAsk],
      credentials: [held({ expiresAt: d('2026-09-30') })],
      startsOn: d('2026-11-02'), through: null, now: NOW,
    })
    expect(v.outcome).toBe('WARN')
    if (v.outcome !== 'WARN') return
    expect(v.code).toBe('LICENSE_LAPSED')
    expect(v.says).toContain("Colleen Byrne's professional license (RN 154-882, WI) ran out on Sep 30, 2026, before the job starts on Nov 2, 2026.")
  })

  it('a license that begins after the job starts is warned with the day it begins', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne', asks: [nurseAsk],
      credentials: [held({ validFrom: d('2026-12-01') })],
      startsOn: d('2026-11-02'), through: null, now: NOW,
    })
    expect(v.outcome).toBe('WARN')
    if (v.outcome !== 'WARN') return
    expect(v.code).toBe('LICENSE_NOT_YET')
    expect(v.says).toContain('does not begin until Dec 1, 2026, after the job starts on Nov 2, 2026.')
  })

  it('a license that runs out inside the job is said, and needs no reason', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne', asks: [nurseAsk],
      credentials: [held({ expiresAt: d('2027-02-28') })],
      startsOn: d('2026-11-02'), through: d('2027-05-02'), now: NOW,
    })
    expect(v.outcome).toBe('PASS')
    if (v.outcome !== 'PASS') return
    expect(v.note).toContain('runs out on Feb 28, 2027, before the job ends on May 2, 2027.')
  })

  it('a current license answers the job and nothing is said', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne', asks: [nurseAsk],
      credentials: [held()], startsOn: d('2026-11-02'), through: d('2027-05-02'), now: NOW,
    })
    expect(v).toEqual({ outcome: 'PASS', note: null })
  })

  it('a renewal filed early does not hide the license that covers the first day', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne', asks: [nurseAsk],
      credentials: [held({ expiresAt: d('2027-12-31') }), held({ validFrom: d('2028-01-01'), expiresAt: d('2029-12-31') })],
      startsOn: d('2026-11-02'), through: null, now: NOW,
    })
    expect(v.outcome).toBe('PASS')
  })

  it('a check still running is not a license on file', () => {
    const v = licenseAtSubmission({
      personName: 'Colleen Byrne', asks: [nurseAsk],
      credentials: [held({ status: 'PENDING' })], startsOn: null, through: null, now: NOW,
    })
    expect(v.outcome === 'WARN' && v.code).toBe('LICENSE_NONE_ON_FILE')
  })
})

describe('what the client’s orders ask for decides the license, and whether it blocks', () => {
  const row = (o: Partial<OrderRow>): OrderRow => ({
    documentTypeKey: 'PROFESSIONAL_LICENSE', required: true, blocks: null, waivedReason: null, issuedToId: 's1', ...o,
  })

  it('a license the client’s order requires is asked even where the title names no licensed occupation', () => {
    const asks = asksFrom({ title: 'Clinical systems analyst', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true, rows: [row({})], documentTypes: [] })
    expect(asks).toEqual([
      { key: 'PROFESSIONAL_LICENSE', said: 'professional license', blocks: false, because: "Talvern Medical's orders require one" },
    ])
  })

  it('only an order row that says it blocks makes the license block at submission', () => {
    const asks = asksFrom({ title: 'Registered nurse', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true, rows: [row({ blocks: true })], documentTypes: [] })
    expect(asks.map((a) => a.blocks)).toEqual([true])
  })

  it('a block written on another supplier’s order does not bind a supplier with an order of its own', () => {
    const asks = asksFrom({
      title: 'Registered nurse', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true,
      rows: [row({ issuedToId: 's2', blocks: true })], documentTypes: [],
    })
    expect(asks.map((a) => [a.key, a.blocks])).toEqual([['PROFESSIONAL_LICENSE', false]])
  })

  it('a supplier with no order from the client yet is held to the client’s orders to anybody', () => {
    const asks = asksFrom({
      title: 'Clinical systems analyst', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: false,
      rows: [row({ issuedToId: 's2', blocks: true })], documentTypes: [],
    })
    expect(asks.map((a) => a.blocks)).toEqual([true])
  })

  it('the order to this supplier answers before the client’s orders to anybody else', () => {
    const asks = asksFrom({
      title: 'Registered nurse', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true,
      rows: [row({ issuedToId: 's2', blocks: true }), row({ issuedToId: 's1', blocks: false })], documentTypes: [],
    })
    expect(asks.map((a) => a.blocks)).toEqual([false])
  })

  it('a license waived on the order asks for nothing at submission, even for a licensed title', () => {
    const asks = asksFrom({
      title: 'Registered nurse', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true,
      rows: [row({ waivedReason: 'Telehealth triage under a compact license held by the hospital.' })], documentTypes: [],
    })
    expect(asks).toEqual([])
  })

  it('a license merely listed on the order, not required, asks for nothing at submission', () => {
    const asks = asksFrom({ title: 'Clinical systems analyst', clientName: 'Talvern Medical', supplierCompanyId: 's1', supplierHasOrder: true, rows: [row({ required: false })], documentTypes: [] })
    expect(asks).toEqual([])
  })

  it('a row for a paper that is not a license to practice is not read as one', () => {
    const asks = asksFrom({ title: 'Data engineer', clientName: 'Northbend Athletic', supplierCompanyId: 's1', supplierHasOrder: true, rows: [row({ documentTypeKey: 'NDA' })], documentTypes: [] })
    expect(asks).toEqual([])
  })
})
