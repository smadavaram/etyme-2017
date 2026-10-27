/**
 * What a desk's own check must carry before it is on file, at a client's
 * supplier onboarding. Found by the release walk, 2026-10-27: a D&B
 * report and a sanctions screening each went "On file" in one click with
 * nothing behind them.
 */

import { describe, it, expect } from 'vitest'
import { deskEvidenceFor, deskEvidenceShortfall, deskEvidenceSays } from '@/lib/attestation'

const ON = new Date('2026-10-27T15:00:00Z')

describe('a vendor screening is the screening company’s result', () => {
  it('a vendor screening is never on file without the provider\'s name, reference and date', () => {
    const bare = deskEvidenceShortfall('VENDOR_SCREENING', {}, ON)
    expect(bare?.code).toBe('NEEDS_PROVIDER_VERDICT')
    expect(bare?.field).toBe('provider')
    expect(bare?.message).toContain('the screening company’s name, their reference, the date on the result and what the result says')

    const noRef = deskEvidenceShortfall('VENDOR_SCREENING', { provider: 'Dow Jones', on: '2026-10-20', outcome: 'CLEAR' }, ON)
    expect(noRef?.field).toBe('reference')
    const noDate = deskEvidenceShortfall('VENDOR_SCREENING', { provider: 'Dow Jones', reference: 'DJ-4471', outcome: 'CLEAR' }, ON)
    expect(noDate?.field).toBe('on')

    expect(deskEvidenceShortfall('VENDOR_SCREENING', { provider: 'Dow Jones', reference: 'DJ-4471', on: '2026-10-20', outcome: 'CLEAR' }, ON)).toBeNull()
  })

  it('a vendor screening on file carries the screening company’s own word, never a desk’s', () => {
    expect(deskEvidenceShortfall('VENDOR_SCREENING', { provider: 'Dow Jones', reference: 'DJ-4471', on: '2026-10-20', outcome: 'LOOKS FINE' }, ON)?.field).toBe('outcome')
    expect(deskEvidenceSays('VENDOR_SCREENING', { provider: 'Dow Jones', reference: 'DJ-4471', on: '2026-10-20', outcome: 'CLEAR' }))
      .toBe('Dow Jones reported clear on Oct 20, 2026, reference DJ-4471.')
    expect(deskEvidenceSays('VENDOR_SCREENING', { provider: 'Dow Jones', reference: 'DJ-9', on: '2026-10-20', outcome: 'FLAGGED' }))
      .toBe('Dow Jones reported it flagged on Oct 20, 2026, reference DJ-9.')
  })

  it('a vendor screening that has not come back is not on file', () => {
    const r = deskEvidenceShortfall('VENDOR_SCREENING', { provider: 'Dow Jones', reference: 'DJ-1', on: '2026-10-20', outcome: 'ORDERED' }, ON)
    expect(r?.code).toBe('NOT_BACK_YET')
  })
})

describe('a D&B report is the report', () => {
  it('a D&B report is never on file without the file or its number and date', () => {
    expect(deskEvidenceShortfall('DNB_REPORT', {}, ON)?.code).toBe('NEEDS_REPORT')
    expect(deskEvidenceShortfall('DNB_REPORT', { reportNumber: '07-112-4471' }, ON)?.field).toBe('on')
    expect(deskEvidenceShortfall('DNB_REPORT', { on: '2026-10-02' }, ON)?.field).toBe('fileUrl')
  })

  it('a D&B report is on file with its file alone, or with its number and the date on it', () => {
    expect(deskEvidenceShortfall('DNB_REPORT', { fileUrl: '/api/documents/d1/file' }, ON)).toBeNull()
    expect(deskEvidenceShortfall('DNB_REPORT', { reportNumber: '07-112-4471', on: '2026-10-02' }, ON)).toBeNull()
    expect(deskEvidenceSays('DNB_REPORT', { reportNumber: '07-112-4471', on: '2026-10-02' })).toBe('D&B report 07-112-4471, dated Oct 2, 2026.')
  })
})

describe('references contacted are a conversation', () => {
  it('references contacted are never on file without the name contacted and the date', () => {
    expect(deskEvidenceShortfall('REFERENCE_CHECK', {}, ON)?.field).toBe('contactName')
    expect(deskEvidenceShortfall('REFERENCE_CHECK', { contactName: 'Dana Whitfield, Northbend' }, ON)?.field).toBe('on')
    expect(deskEvidenceShortfall('REFERENCE_CHECK', { contactName: 'Dana Whitfield, Northbend', on: '2026-10-09' }, ON)).toBeNull()
    expect(deskEvidenceSays('REFERENCE_CHECK', { contactName: 'Dana Whitfield, Northbend', on: '2026-10-09' })).toBe('Spoke to Dana Whitfield, Northbend on Oct 9, 2026.')
  })
})

describe('dates and items with no rule', () => {
  it('a date on a desk’s evidence that has not happened yet is refused', () => {
    expect(deskEvidenceShortfall('REFERENCE_CHECK', { contactName: 'Dana', on: '2026-11-02' }, ON)?.code).toBe('DATE_AHEAD')
    expect(deskEvidenceShortfall('DNB_REPORT', { reportNumber: '1', on: '2026-02-31' }, ON)?.code).toBe('BAD_DATE')
  })

  it('an item that is a desk’s own check names what it needs before anybody presses on file', () => {
    expect(deskEvidenceFor('VENDOR_SCREENING')?.fields.map((f) => f.name)).toEqual(['provider', 'reference', 'on', 'outcome'])
    expect(deskEvidenceFor('DNB_REPORT')?.fields.map((f) => f.name)).toEqual(['fileUrl', 'reportNumber', 'on'])
    expect(deskEvidenceFor('REFERENCE_CHECK')?.fields.map((f) => f.name)).toEqual(['contactName', 'on'])
  })

  it('a client’s own checklist item is never refused by a list it is not on', () => {
    expect(deskEvidenceFor('SITE_INDUCTION')).toBeNull()
    expect(deskEvidenceShortfall('SITE_INDUCTION', {}, ON)).toBeNull()
  })
})
