import { describe, it, expect } from 'vitest'
import { resolvedEndClientId, endClientFilter } from '@/lib/resolve-end-client'

/**
 * End client resolution — Addendum C "layer cake"
 *
 * BRD Addendum C: "paying customer (clientCompanyId) can be an MSP,
 * a prime SI, or another vendor. The end client (endClientCompanyId)
 * is the enterprise where the consultant physically works."
 *
 * resolvedEndClientId() is the single source of truth for where the
 * consultant works. Every tenure, alumni, and compliance query must
 * use it instead of raw clientCompanyId.
 */

describe('resolvedEndClientId()', () => {
  it('returns clientCompanyId when endClientCompanyId is null', () => {
    const id = resolvedEndClientId({
      clientCompanyId: 'direct-client',
      endClientCompanyId: null,
    })
    expect(id).toBe('direct-client')
  })

  it('returns clientCompanyId when endClientCompanyId is undefined', () => {
    const id = resolvedEndClientId({
      clientCompanyId: 'direct-client',
    })
    expect(id).toBe('direct-client')
  })

  it('returns endClientCompanyId when set', () => {
    const id = resolvedEndClientId({
      clientCompanyId: 'msp-company',
      endClientCompanyId: 'enterprise-company',
    })
    expect(id).toBe('enterprise-company')
  })

  it('handles the three-party MSP case — vendor bills MSP, consultant works at enterprise', () => {
    const contract = {
      clientCompanyId: 'globalstaff-msp',
      endClientCompanyId: 'terumo-bct',
    }
    expect(resolvedEndClientId(contract)).toBe('terumo-bct')
  })

  it('handles the prime SI case — vendor bills prime SI, consultant works at enterprise', () => {
    const contract = {
      clientCompanyId: 'infosys',
      endClientCompanyId: 'apple-inc',
    }
    expect(resolvedEndClientId(contract)).toBe('apple-inc')
  })

  it('handles the vendor-to-vendor case — vendor bills another vendor, consultant works at enterprise', () => {
    const contract = {
      clientCompanyId: 'other-vendor',
      endClientCompanyId: 'target-enterprise',
    }
    expect(resolvedEndClientId(contract)).toBe('target-enterprise')
  })
})

describe('endClientFilter()', () => {
  it('generates an OR clause matching end client or direct placement', () => {
    const filter = endClientFilter('enterprise-1')
    expect(filter).toEqual({
      OR: [
        { endClientCompanyId: 'enterprise-1' },
        { clientCompanyId: 'enterprise-1', endClientCompanyId: null },
      ],
    })
  })

  it('finds contracts where endClientCompanyId equals the target', () => {
    // The first OR branch matches contracts placed via MSP/Prime
    const filter = endClientFilter('enterprise-1')
    expect(filter.OR[0]).toEqual({ endClientCompanyId: 'enterprise-1' })
  })

  it('finds direct placement contracts where clientCompanyId equals the target and endClientCompanyId is null', () => {
    // The second OR branch matches direct placements
    const filter = endClientFilter('enterprise-1')
    expect(filter.OR[1]).toEqual({
      clientCompanyId: 'enterprise-1',
      endClientCompanyId: null,
    })
  })
})
