import { describe, it, expect } from 'vitest'
import { workCountryOf, jobWorkCountry, lineWorkCountry } from '@/lib/work-country'

/**
 * Work authorization is checked where the work is done (founder,
 * 2026-11-03). These are the three rules, then the two readers over a
 * stand-in database that answers only the shape they ask for.
 */

type Row = Record<string, unknown> | null

function fakeDb(rows: { requirement?: Row; sellContract?: Row; buyContract?: Row; consultantProfile?: Row }) {
  const one = (r: Row | undefined) => ({ findUnique: async () => r ?? null })
  return {
    requirement: one(rows.requirement),
    sellContract: one(rows.sellContract),
    buyContract: one(rows.buyContract),
    consultantProfile: one(rows.consultantProfile),
  } as never
}

describe('the country a job’s work is done in', () => {
  it('an onsite job’s work is done in its site’s country', () => {
    expect(workCountryOf({ workMode: 'ONSITE', siteCountry: 'US', personCountry: 'IN' }))
      .toEqual({ country: 'US', offshore: false, basis: 'SITE' })
  })

  it('a hybrid job’s work is done in its site’s country, wherever the person lives', () => {
    expect(workCountryOf({ workMode: 'HYBRID', siteCountry: 'BE', personCountry: 'IN' }))
      .toEqual({ country: 'BE', offshore: false, basis: 'SITE' })
  })

  it('a job with no work mode reads as onsite', () => {
    expect(workCountryOf({ workMode: null, siteCountry: 'MX', personCountry: 'IN' }))
      .toEqual({ country: 'MX', offshore: false, basis: 'SITE' })
  })

  it('a remote job worked from the person’s own country is offshore and its work country is the person’s', () => {
    expect(workCountryOf({ workMode: 'REMOTE', siteCountry: 'US', personCountry: 'IN' }))
      .toEqual({ country: 'IN', offshore: true, basis: 'PERSON' })
  })

  it('a remote job with no country on the person reads as the site’s country, not offshore', () => {
    expect(workCountryOf({ workMode: 'REMOTE', siteCountry: 'US', personCountry: null }))
      .toEqual({ country: 'US', offshore: false, basis: 'SITE_DEFAULT' })
  })

  it('remote from the site’s own country is not offshore', () => {
    expect(workCountryOf({ workMode: 'REMOTE', siteCountry: 'US', personCountry: 'us' }))
      .toEqual({ country: 'US', offshore: false, basis: 'PERSON' })
  })
})

describe('reading the work country from the record', () => {
  it('a job reads its site’s country and its work mode', async () => {
    const db = fakeDb({ requirement: { workMode: 'ONSITE', site: { country: 'VN' } } })
    expect(await jobWorkCountry('req', db)).toEqual({ country: 'VN', offshore: false, basis: 'SITE', siteKnown: true })
  })

  it('a job with no site reads as the US and says the site was not named', async () => {
    const db = fakeDb({ requirement: { workMode: null, site: null } })
    expect(await jobWorkCountry('req', db)).toEqual({ country: 'US', offshore: false, basis: 'SITE', siteKnown: false })
  })

  it('a remote job asked about one person reads that person’s country', async () => {
    const db = fakeDb({ requirement: { workMode: 'REMOTE', site: { country: 'US' } }, consultantProfile: { country: 'IN' } })
    expect(await jobWorkCountry('req', db, { personId: 'p' }))
      .toEqual({ country: 'IN', offshore: true, basis: 'PERSON', siteKnown: true })
  })

  it('a job that does not exist has no work country', async () => {
    expect(await jobWorkCountry('missing', fakeDb({}))).toBeNull()
  })

  it('a sell line reads its own site before its job’s site', async () => {
    const db = fakeDb({ sellContract: {
      workLocation: { country: 'GB' },
      requirement: { workMode: 'ONSITE', site: { country: 'US' } },
      person: { consultant: { country: 'IN' } },
    } })
    expect(await lineWorkCountry({ sellContractId: 's' }, db))
      .toEqual({ country: 'GB', offshore: false, basis: 'SITE', siteKnown: true })
  })

  it('a buy line reads its sell line’s site', async () => {
    const db = fakeDb({ buyContract: { sellLinks: [{ sellContract: {
      workLocation: { country: 'US' },
      requirement: { workMode: 'REMOTE', site: { country: 'US' } },
      person: { consultant: { country: 'IN' } },
    } }] } })
    expect(await lineWorkCountry({ buyContractId: 'b' }, db))
      .toEqual({ country: 'IN', offshore: true, basis: 'PERSON', siteKnown: true })
  })

  it('a buy line that funds no sell line has no work country', async () => {
    expect(await lineWorkCountry({ buyContractId: 'b' }, fakeDb({ buyContract: { sellLinks: [] } }))).toBeNull()
  })
})
