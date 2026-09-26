import { describe, it, expect } from 'vitest'
import { HELD } from '@/lib/legal'
import {
  categoriesFor, erasureCompleteNotice, erasureHolderNotice, erasurePlan,
  erasureReceivedNotice, exportReadyNotice, fateOf, FATES,
} from '@/lib/notify/data-rights'

/**
 * What a person is told when they ask for their data, or ask to be gone.
 *
 * The sentences below are the promise. The one that matters most is the
 * fourth: a staffing system cannot delete payroll, an I-9 or the days
 * somebody stood on a client's site, and a letter that says it will is a
 * written misrepresentation on the first document a regulator reads.
 */

const plain = (s: string) => s.replace(/[  ]/g, ' ')

const priya = { name: 'Priya Raman', audience: 'candidate' as const }
const now = new Date('2026-09-19T09:00:00Z')

describe('an export lands with the person who asked for it', () => {
  it('names the categories in the file, in the same words the privacy notice uses', () => {
    const n = exportReadyNotice({
      person: priya,
      categories: categoriesFor('candidate'),
      downloadUrl: 'https://etyme.example/export/abc',
      linkExpiresAt: new Date('2026-09-26T09:00:00Z'),
      now,
      contactEmail: 'privacy@etyme.example',
    })

    expect(n.body).toContain('Resumes')
    expect(n.body).toContain('Time on site')
    expect(n.body).toContain('Checks somebody else ran')
    // Verbatim from the notice, never reworded: a renamed category cannot
    // be checked against the promise it came from.
    for (const c of categoriesFor('candidate')) expect(n.body).toContain(c)
    expect(n.body).not.toMatch(/\b14 (kinds|categories|records)\b/)
  })

  it('says how long the link lives and that every read of it is logged, including ours', () => {
    const n = exportReadyNotice({
      person: priya,
      categories: ['Resumes'],
      downloadUrl: 'https://etyme.example/export/abc',
      linkExpiresAt: new Date('2026-09-26T09:00:00Z'),
      now,
      contactEmail: 'privacy@etyme.example',
    })

    expect(n.body).toContain('September 26, 2026')
    expect(n.body).toContain('about 7 days')
    expect(n.body).toContain('who opened it, from which company and why')
    expect(n.body).toContain('That includes us.')
  })

  it('says what is not in the file, so a complete-looking file is not mistaken for one', () => {
    const n = exportReadyNotice({
      person: priya,
      categories: ['Resumes'],
      downloadUrl: 'https://etyme.example/export/abc',
      linkExpiresAt: new Date('2026-09-26T09:00:00Z'),
      now,
      contactEmail: 'privacy@etyme.example',
    })
    expect(n.body).toContain('Notes a client wrote about an interview')
    expect(n.body).toContain('not a party to')
  })

  it('a candidate is told by email and never on Teams', () => {
    const n = exportReadyNotice({
      person: priya,
      categories: ['Resumes'],
      downloadUrl: 'https://etyme.example/export/abc',
      linkExpiresAt: new Date('2026-09-26T09:00:00Z'),
      now,
      contactEmail: 'privacy@etyme.example',
    })
    expect(n.channels).toEqual(['EMAIL'])
    expect(n.card).toBeNull()
  })

  it('the same letter to somebody at a firm goes to their Teams channel with email behind it', () => {
    const n = exportReadyNotice({
      person: { name: 'Dana Whitfield', audience: 'business' },
      categories: categoriesFor('business'),
      downloadUrl: 'https://etyme.example/export/def',
      linkExpiresAt: new Date('2026-09-26T09:00:00Z'),
      now,
      contactEmail: 'privacy@etyme.example',
    })
    expect(n.channels).toEqual(['TEAMS', 'EMAIL'])
    expect(n.card?.action?.label).toBe('Download the file')
  })
})

describe('a request to be forgotten is answered with the truth about what stays', () => {
  const request = {
    person: priya,
    reference: 'DR-2026-118',
    requestedAt: new Date('2026-09-19T09:00:00Z'),
    completesOn: new Date('2026-10-03T09:00:00Z'),
    categories: categoriesFor('candidate'),
    withdrawUrl: 'https://etyme.example/erasure/DR-2026-118/stop',
    contactEmail: 'privacy@etyme.example',
  }

  it('an erasure receipt never promises to delete what the law says to keep', () => {
    const n = erasureReceivedNotice(request)
    const forgottenSection = n.body.slice(
      n.body.indexOf('Forgotten on'),
      n.body.indexOf('Kept under a marker')
    )

    for (const kept of ['Money about a person', 'Time on site', 'Checks somebody else ran', 'Work authorization and immigration']) {
      expect(forgottenSection, `${kept} must never appear as forgotten`).not.toContain(kept)
      expect(n.body).toContain(kept)
    }
    expect(n.body).toContain('We are not going to tell you these will be deleted, because they will not be')
    expect(n.body).not.toMatch(/all (of )?your (personal )?data will be (permanently )?deleted/i)
  })

  it('the days on site stay with the client, and the letter says whose duty that is', () => {
    const n = erasureReceivedNotice(request)
    expect(n.body).toContain("stay in that client's tenure ledger")
    expect(n.body).toContain('that duty is the client')
  })

  it('payroll, tax and the I-9 are kept for their statutory period, named without inventing a number of years', () => {
    const money = fateOf('Money about a person')!
    const i9 = fateOf('Checks somebody else ran')!
    expect(money.fate).toBe('KEPT')
    expect(money.until).toBe('the period the tax and payroll law sets where you were paid')
    expect(i9.until).toBe('the period the law sets where you worked')
    for (const f of FATES) {
      expect(f.until ?? '', f.category).not.toMatch(/\b(\d+|three|six|seven|ten)\s+(days|months|years)\b/i)
    }
  })

  it('says the day it completes and how to stop it before then', () => {
    const n = erasureReceivedNotice(request)
    expect(n.subject).toBe('Your request to be forgotten runs on October 3, 2026')
    expect(n.body).toContain('Nothing has changed yet.')
    expect(n.body).toContain('To stop this before October 3, 2026')
    expect(n.body).toContain('https://etyme.example/erasure/DR-2026-118/stop')
    expect(n.body).toContain('After it runs we cannot undo it.')
  })

  it('a caller cannot hand in a list that makes payroll disappear — the category decides its own fate', () => {
    const plan = erasurePlan(['Money about a person', 'Resumes'])
    expect(plan.kept.map((k) => k.category)).toEqual(['Money about a person'])
    expect(plan.forgotten.map((k) => k.category)).toEqual(['Resumes'])
  })

  it('a category nobody has classified is promised nothing, and is named rather than dropped', () => {
    const plan = erasurePlan(['Sleep study results'])
    expect(plan.unclassified).toEqual(['Sleep study results'])

    const n = erasureReceivedNotice({ ...request, categories: ['Sleep study results'] })
    expect(n.body).toContain('Nobody has classified these yet')
    expect(n.body).toContain('Sleep study results')
  })

  it('every category the privacy notice holds has a fate, so nothing falls through the letter', () => {
    const missing = HELD.map((h) => h.category).filter((c) => !fateOf(c))
    expect(missing, `no fate for: ${missing.join(', ')}`).toEqual([])
  })

  it('a resume already sent to a company is said to be unrecoverable by us, not quietly forgotten', () => {
    expect(fateOf('Resumes')!.caveat).toContain('Etyme cannot unsend it')
  })
})

describe('when the erasure has run', () => {
  const done = {
    person: priya,
    reference: 'DR-2026-118',
    completedOn: new Date('2026-10-03T09:00:00Z'),
    categories: categoriesFor('candidate'),
    replyTo: 'priya.raman.personal@gmail.example',
    contactEmail: 'privacy@etyme.example',
  }

  it('the letter goes to the address they gave when they asked, because the account address is a marker now', () => {
    const n = erasureCompleteNotice(done)
    expect(n.to).toBe('priya.raman.personal@gmail.example')
    expect(n.body).toContain('We are writing to this address because you gave it when you asked')
    expect(n.body).toContain('the last message Etyme will send you')
  })

  it('says what was forgotten, what remains and until when', () => {
    const n = plain(erasureCompleteNotice(done).body)
    expect(n).toContain('Forgotten:')
    expect(n).toContain('Still held, by whoever is required to hold it, and for how long:')
    expect(n).toContain('Kept for the period the law sets where you worked')
    expect(n).toContain('quoting DR-2026-118')
  })
})

describe('the companies that held the person are told, and asked for nothing', () => {
  const base = {
    person: { name: 'Priya Raman' },
    reference: 'DR-2026-118',
    completedOn: new Date('2026-10-03T09:00:00Z'),
    contactEmail: 'privacy@etyme.example',
  }

  it('the supplier that employed somebody is told its payroll and I-9 records are untouched', () => {
    const n = erasureHolderNotice({ ...base, company: { name: 'Veritan Talent', holding: 'EMPLOYER' } })
    expect(n.body).toContain('Your payroll, tax and I-9 records are yours and are untouched')
    expect(n.body).toContain('under a marker instead of a name')
  })

  it('the client whose site they worked on is told the days stay and there is nothing to do', () => {
    const n = erasureHolderNotice({ ...base, company: { name: 'Northbend Athletic', holding: 'CLIENT' } })
    expect(n.body).toContain('stay in your tenure ledger, counted once per day')
    expect(n.body).toContain('there is nothing for you to do')
    expect(n.card?.facts).toContainEqual({ name: 'Action needed', value: 'None' })
  })

  it('a company hears on Teams with email behind it, and the card names the person it is about', () => {
    const n = erasureHolderNotice({ ...base, company: { name: 'Veritan Talent', holding: 'SUPPLIER' } })
    expect(n.channels).toEqual(['TEAMS', 'EMAIL'])
    expect(n.card?.title).toBe('Priya Raman has been forgotten')
    expect(n.subject).toContain('Priya Raman')
  })
})

describe('nothing a person reads is written in the system own words', () => {
  const ALLOWED = new Set(['UTC', 'AM', 'PM', 'DR', 'US', 'HR', 'AP', 'AR'])

  const everyLetter = () => [
    exportReadyNotice({
      person: priya, categories: categoriesFor('candidate'),
      downloadUrl: 'https://etyme.example/x', linkExpiresAt: new Date('2026-09-26T09:00:00Z'),
      now, contactEmail: 'privacy@etyme.example',
    }),
    erasureReceivedNotice({
      person: priya, reference: 'DR-2026-118', requestedAt: now,
      completesOn: new Date('2026-10-03T09:00:00Z'), categories: categoriesFor('candidate'),
      withdrawUrl: 'https://etyme.example/stop', contactEmail: 'privacy@etyme.example',
    }),
    erasureCompleteNotice({
      person: priya, reference: 'DR-2026-118', completedOn: new Date('2026-10-03T09:00:00Z'),
      categories: categoriesFor('candidate'), replyTo: 'p@gmail.example',
      contactEmail: 'privacy@etyme.example',
    }),
    erasureHolderNotice({
      company: { name: 'Veritan Talent', holding: 'EMPLOYER' }, person: { name: 'Priya Raman' },
      reference: 'DR-2026-118', completedOn: new Date('2026-10-03T09:00:00Z'),
      contactEmail: 'privacy@etyme.example',
    }),
  ]

  it('no subject or body prints a state name like the ones the code uses', () => {
    const shouting: string[] = []
    for (const n of everyLetter()) {
      const text = `${n.subject}\n${n.body}`.replace(/https?:\/\/\S+/g, '')
      for (const m of text.matchAll(/\b[A-Z]{2,}(?:_[A-Z]+)*\b/g)) {
        if (!ALLOWED.has(m[0])) shouting.push(m[0])
      }
    }
    expect(shouting, shouting.join(', ')).toEqual([])
  })

  it('every letter ends with somebody to ask and something to quote', () => {
    for (const n of everyLetter()) {
      expect(n.body, n.subject).toContain('privacy@etyme.example')
    }
  })
})
