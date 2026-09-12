import { describe, it, expect } from 'vitest'
import {
  splitAdverts, guessSource, readTitle, readSkills, readLocation,
  readRate, readPostedBy, readContact, readLead, pasteSentence,
} from '@/lib/lead-reader'

/**
 * The demand cone was built and had no door: leads 0, openings 0. Nothing
 * could reach the top half of the diamond because the only way in was to
 * hand-type a requirement, and nobody hand-types a Dice advert at nine at
 * night.
 *
 * These are the shapes demand actually arrives in.
 */

const DICE = `Senior SAP FICO Consultant
Dice.com
Location: Denver, CO (Hybrid — 3 days onsite)
Rate: $62 - $68/hr C2C
Skills: SAP FICO, S/4HANA, ABAP
Duration: 12 months
Posted by: Vertex Global Solutions`

const FORWARDED = `From: Raj Menon <raj.menon@sierratalent.com>
Sent: Tuesday, 19 August 2026 18:42
Subject: Urgent — FICO resource needed

Hi,

We have an immediate need for a Senior FICO consultant in Denver.
Hybrid, 3 days on site. Around $65/hr on C2C. 12 month contract with
extensions likely. Client is a medical device manufacturer.

Please send profiles to raj.menon@sierratalent.com

Thanks
Raj`

describe('splitting a paste into separate adverts', () => {
  it('takes one advert as one advert', () => {
    expect(splitAdverts(DICE)).toHaveLength(1)
  })

  it('splits a morning’s worth pasted at once on a rule', () => {
    expect(splitAdverts(`${DICE}\n\n---\n\n${FORWARDED}`)).toHaveLength(2)
  })

  it('splits on a new mail header, which is how a forward of a forward arrives', () => {
    const two = splitAdverts(`${FORWARDED}\nFrom: Someone Else <s@other.com>\nSubject: Also this\nJava developer, Austin TX, $70/hr, 6 months`)
    expect(two.length).toBeGreaterThan(1)
  })

  it('does not split a normal advert on its own paragraph breaks', () => {
    // Guessing wrong this way silently loses four adverts, so the split
    // only fires on a strong signal.
    expect(splitAdverts(FORWARDED)).toHaveLength(1)
  })

  it('gives nothing back for an empty paste rather than one empty lead', () => {
    expect(splitAdverts('   \n  ')).toHaveLength(0)
  })
})

describe('where it came from', () => {
  it('knows a Dice advert', () => {
    expect(guessSource(DICE)).toBe('DICE')
  })

  it('knows a forwarded email', () => {
    expect(guessSource(FORWARDED)).toBe('EMAIL')
  })

  it('knows a VMS export', () => {
    expect(guessSource('Fieldglass Requisition 88213\nJava developer')).toBe('VMS')
  })

  it('says OTHER rather than guessing when nothing identifies it', () => {
    expect(guessSource('Java developer, Austin, $70')).toBe('OTHER')
  })
})

describe('reading the role out of it', () => {
  it('takes a labelled title', () => {
    expect(readTitle('Role: Senior SAP FICO Consultant').title).toBe('Senior SAP FICO Consultant')
  })

  it('takes the first line of an advert and says it is a guess', () => {
    const r = readTitle(DICE)
    expect(r.title).toBe('Senior SAP FICO Consultant')
    expect(r.sure).toBe(false)
  })

  it('does not take "From: Raj Menon" as the job title', () => {
    // Which is what the requirement parser does, because on a forwarded
    // mail the first line is always a header.
    expect(readTitle(FORWARDED).title).not.toMatch(/^From:/)
    expect(readTitle(FORWARDED).title).not.toMatch(/Raj/)
  })

  it('says so plainly when there is no title to find', () => {
    expect(readTitle('hi').title).toBe('Untitled role')
  })
})

describe('reading the skills', () => {
  it('takes a labelled list', () => {
    expect(readSkills(DICE)).toEqual(['SAP FICO', 'S/4HANA', 'ABAP'])
  })

  it('finds known skills written in prose', () => {
    expect(readSkills(FORWARDED)).toContain('FICO')
  })

  it('does not match a skill inside a longer word', () => {
    expect(readSkills('We need a GOLANG developer')).not.toContain('Go')
  })

  it('comes back empty rather than inventing something', () => {
    expect(readSkills('Experienced project manager, must be a strong communicator')).toEqual([])
  })
})

describe('reading the location', () => {
  it('takes a labelled location whole, brackets and all', () => {
    expect(readLocation(DICE)).toBe('Denver, CO (Hybrid — 3 days onsite)')
  })

  it('finds a city and state written in prose', () => {
    expect(readLocation('Need someone in Austin, TX next month')).toContain('Austin, TX')
  })

  it('finds remote', () => {
    expect(readLocation('Fully remote, must sit EST')).toMatch(/remote/i)
  })
})

describe('reading the rate', () => {
  it('takes the top of a posted range, because the advert is a ceiling', () => {
    expect(readRate('Rate: $62 - $68/hr C2C').cents).toBe(6800)
  })

  it('says it kept the top of the range', () => {
    expect(readRate('$62 - $68/hr').note).toMatch(/top of it/)
  })

  it('takes a single hourly rate', () => {
    expect(readRate('Around $65/hr on C2C').cents).toBe(6500)
  })

  it('refuses to turn an annual salary into an hourly rate', () => {
    // A guessed hourly rate that looks like a real one is exactly the
    // plausible-wrong number to stop for.
    const r = readRate('Salary $145,000 per year plus benefits')
    expect(r.cents).toBeNull()
    expect(r.note).toMatch(/annual, not hourly/)
  })

  it('ignores a number that could not be an hourly contract rate', () => {
    expect(readRate('Reference $900 travel allowance').cents).toBeNull()
  })
})

describe('who posted it', () => {
  it('takes a labelled poster', () => {
    expect(readPostedBy(DICE)).toBe('Vertex Global Solutions')
  })

  it('takes the sender of a forwarded mail', () => {
    expect(readPostedBy(FORWARDED)).toBe('Raj Menon')
  })

  it('does not treat "Confidential" as a company', () => {
    expect(readPostedBy('Client: Confidential')).toBeNull()
  })

  it('leaves it unknown rather than inventing a counterparty', () => {
    expect(readPostedBy('Java developer, Austin, $70/hr')).toBeNull()
  })
})

describe('the contact to reply to', () => {
  it('finds the email', () => {
    expect(readContact(FORWARDED)).toBe('raj.menon@sierratalent.com')
  })

  it('falls back to a phone number', () => {
    expect(readContact('Call me on (303) 555-0142')).toBe('(303) 555-0142')
  })
})

describe('one advert, read end to end', () => {
  it('reads a Dice advert into something a recruiter can act on', () => {
    const lead = readLead(DICE)
    expect(lead.source).toBe('DICE')
    expect(lead.title).toBe('Senior SAP FICO Consultant')
    expect(lead.skills).toContain('SAP FICO')
    expect(lead.location).toContain('Denver')
    expect(lead.rateCents).toBe(6800)
    expect(lead.postedBy).toBe('Vertex Global Solutions')
  })

  it('reads a forwarded email into the same shape', () => {
    const lead = readLead(FORWARDED)
    expect(lead.source).toBe('EMAIL')
    expect(lead.rateCents).toBe(6500)
    expect(lead.contact).toBe('raj.menon@sierratalent.com')
  })

  it('keeps the advert whole, so a better reader can be run over it later', () => {
    expect(readLead(DICE).text).toBe(DICE)
  })

  it('names what it could not work out instead of leaving blanks', () => {
    const lead = readLead('Experienced project manager needed')
    expect(lead.unknowns).toContain('no skills found')
    expect(lead.unknowns).toContain('no location')
    expect(lead.unknowns.join(' ')).toMatch(/who posted it/)
  })
})

describe('what the recruiter is told after pasting', () => {
  it('says the useful thing, which is that two of them are one seat', () => {
    // Counting is not reporting. "3 leads created" tells them nothing.
    const said = pasteSentence({ read: 3, newOpenings: 1, collapsed: 2, needsAPerson: 0 })
    expect(said).toMatch(/3 adverts/)
    expect(said).toMatch(/2 are seats you are already working/i)
    expect(said).toMatch(/one is new/i)
  })

  it('reads as sentences rather than as fragments run together', () => {
    expect(pasteSentence({ read: 1, newOpenings: 1, collapsed: 0, needsAPerson: 0 }))
      .toBe('One advert. One is new.')
  })

  it('asks for a human on a maybe, rather than merging it', () => {
    const said = pasteSentence({ read: 2, newOpenings: 1, collapsed: 0, needsAPerson: 1 })
    expect(said).toMatch(/might be a duplicate/i)
  })
})

describe('a title written into a sentence, which is how email arrives', () => {
  it('finds the role inside "we have an immediate need for a Senior SAP FICO consultant in Denver"', () => {
    // Taking the first unfiltered line instead gives "Hybrid, 3 days on
    // site" as the job title, which then fails to match the same seat
    // posted on a board — so the collapse never happens, which is the one
    // thing this whole screen is for.
    expect(readTitle(FORWARDED).title).toMatch(/Senior FICO consultant/i)
  })

  it('does not take a line of logistics as the role', () => {
    const r = readTitle('Hybrid, 3 days on site. Around $65/hr on C2C.\nSAP FICO consultant wanted')
    expect(r.title).not.toMatch(/Hybrid/)
  })
})
