import { describe, it, expect } from 'vitest'
import {
  SITE_FIELD_SAYS, sendToSays, sentSays, raisedSays, placeOf, pickSite, approvedAtWords, firstOffSite, countWord, namesList,
} from '@/lib/job-site'

/**
 * The words a job's site puts on demand's screens (founder, 2026-10-28,
 * the Sites drawing, screen three: Marcus Hollins posts a job at Dayton).
 */

const DAYTON = { name: 'Dayton, Ohio', city: 'Dayton' }

describe('the job form at a site', () => {
  it('the line under Site is the drawing’s', () => {
    expect(SITE_FIELD_SAYS).toBe('Your site. Days off, the time limit and the pay currency follow it.')
  })

  it('a job form pre-selects the primary site', () => {
    const sites = [
      { id: 'greenville', name: 'Greenville, South Carolina', city: 'Greenville', isPrimary: false },
      { id: 'dayton', name: 'Dayton, Ohio', city: 'Dayton', isPrimary: true },
    ]
    expect(pickSite(sites, null)?.id).toBe('dayton')
    expect(pickSite(sites, 'greenville')?.id).toBe('greenville')
    // A site the form does not offer is not picked: the primary instead.
    expect(pickSite(sites, 'somebody-elses-site')?.id).toBe('dayton')
  })

  it('a seat that reads one region opens on its first site where the head office is not in it', () => {
    expect(pickSite([{ id: 'monterrey', name: 'Monterrey', city: 'Monterrey', isPrimary: false }], null)?.id).toBe('monterrey')
    expect(pickSite([], null)).toBeNull()
  })

  it('each tick says where the firm is approved, the way a hiring manager says the place', () => {
    expect(approvedAtWords(DAYTON)).toBe('approved at Dayton')
  })
})

describe('who a job at a site goes to', () => {
  it('a job at a site goes to that site’s suppliers by default, and names who to ask Procurement about', () => {
    expect(sendToSays({
      site: DAYTON,
      atSite: ['Ridgeline Staffing', 'Harbor Industrial Labor', 'Keystone Crew Partners'],
      others: ['Lakemont Workforce'],
      everyApproved: false,
    })).toBe('Three suppliers are approved at Dayton. To send it to Lakemont Workforce as well, ask Procurement to add them to this site.')
  })

  it('one supplier at a site and nobody else approved reads as one sentence', () => {
    expect(sendToSays({ site: DAYTON, atSite: ['Ridgeline Staffing'], others: [], everyApproved: false }))
      .toBe('One supplier is approved at Dayton.')
  })

  it('a site whose named firms were all struck off says so, and who to ask about', () => {
    expect(sendToSays({ site: DAYTON, atSite: [], others: ['Lakemont Workforce', 'Ridgeline Staffing'], everyApproved: false }))
      .toBe('No supplier is approved at Dayton any more. To send it to Lakemont Workforce and Ridgeline Staffing, ask Procurement to add them to this site.')
  })

  it('a site that names nobody sends the job to every approved supplier and says so', () => {
    expect(sendToSays({ site: DAYTON, atSite: [], others: [], everyApproved: true }))
      .toBe('Dayton names no suppliers yet, so the job goes to every approved supplier.')
  })

  it('a job with no site goes to every approved supplier and says so', () => {
    expect(sendToSays({ site: null, atSite: [], others: [], everyApproved: true }))
      .toBe('No site is set, so the job goes to every approved supplier.')
  })

  it('a job at a site cannot be sent to a supplier not approved there', () => {
    expect(firstOffSite(['ridgeline', 'lakemont'], ['ridgeline', 'harbor', 'keystone'])).toBe('lakemont')
    expect(firstOffSite(['ridgeline'], ['ridgeline', 'harbor', 'keystone'])).toBeNull()
  })
})

describe('what the raise says back', () => {
  it('a job that published itself names the firms it went to', () => {
    expect(sentSays({ open: true, sentTo: ['Harbor Industrial Labor', 'Ridgeline Staffing'], ticked: 2, site: DAYTON }))
      .toBe('Sent to Harbor Industrial Labor and Ridgeline Staffing.')
  })

  it('a job waiting on an approval is never said to be sent', () => {
    const says = sentSays({ open: false, sentTo: [], ticked: 3, site: DAYTON })
    expect(says).toBe('Once it is approved, it is sent to suppliers from its page, with the suppliers approved at Dayton ticked.')
    expect(says).not.toMatch(/^Sent/)
  })

  it('nothing ticked adds nothing to the decision', () => {
    expect(sentSays({ open: true, sentTo: [], ticked: 0, site: DAYTON })).toBeNull()
    expect(raisedSays({ open: true, summary: 'Cleared automatically.', sentTo: [], ticked: 0, site: DAYTON }))
      .toBe('Job request open — Cleared automatically.')
  })

  it('the decision and where the job went read as two sentences', () => {
    expect(raisedSays({ open: true, summary: 'Cleared automatically', sentTo: ['Ridgeline Staffing'], ticked: 1, site: DAYTON }))
      .toBe('Job request open — Cleared automatically. Sent to Ridgeline Staffing.')
  })
})

describe('where a job is', () => {
  it('the site’s name first, the old free text for a job posted before sites, and nothing invented', () => {
    expect(placeOf({ location: 'Dayton plant', site: { name: 'Dayton, Ohio' } })).toBe('Dayton, Ohio')
    expect(placeOf({ location: 'Lakewood, CO — on site three days a week', site: null })).toBe('Lakewood, CO — on site three days a week')
    expect(placeOf({ location: '  ', site: null })).toBeNull()
  })

  it('small counts are words and lists join with "and"', () => {
    expect(countWord(3)).toBe('Three')
    expect(countWord(31)).toBe('31')
    expect(namesList(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
