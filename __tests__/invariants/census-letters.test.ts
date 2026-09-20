import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PAGE_SECTIONS, WAYS_FORWARD,
  censusAgreedNotice, censusArrivedStaffNotice, censusAskedNotice, censusClockStaffNotice,
  censusDeletedNotice, censusDeliveredNotice, censusReceivedNotice,
} from '@/lib/notify/census'
import { day } from '@/lib/notify/letters'
import { deletedSentence, deletionSentence, queueSays, receiptSentence } from '@/lib/census'

/**
 * What a client is told about a file they entrusted to us before they
 * were a customer.
 *
 * Three things are being defended here. One: a census letter never
 * states a date the row does not hold, because the whole design rests on
 * the day the client was told being the day the data goes. Two: no
 * letter opens a sequence — the shipped promise on the public form is
 * that nothing automatic happens next, and the census is the first place
 * a client would catch us breaking it. Three: the deletion date is a
 * fact and never a deadline, so "do nothing" is offered in the same
 * voice as the two ways forward.
 */

const ROOT = process.cwd()
const plain = (s: string) => s.replace(/[   ]/g, ' ')

const contact = { name: 'Dana Whitfield', workEmail: 'dana.whitfield@northbend.example' }
const companyName = 'Northbend Athletic'
const assignedTo = 'marcus@etyme.example'

const uploadExpires = new Date('2026-10-04T09:00:00Z')
const deleteBy = new Date('2026-11-04T09:00:00Z')
const deletedAt = new Date('2026-11-04T02:00:00Z')

const asked = () => censusAskedNotice({
  contact, companyName, assignedTo,
  option: 'TEMPLATE',
  queuePosition: 3,
  agreementVersion: '2026-09-20',
  agreementUrl: 'https://etyme.example/legal/census-agreement',
})

const agreed = () => censusAgreedNotice({
  contact, companyName, assignedTo,
  acceptedBy: 'Priya Raghavan',
  agreementVersion: '2026-09-20',
  uploadExpires,
  uploadUrl: 'https://etyme.example/census/send/abc123',
  option: 'TEMPLATE',
  templateUrl: 'https://etyme.example/census-template.csv',
})

const received = () => censusReceivedNotice({
  contact, companyName, assignedTo,
  count: 4, bytes: 2_202_010, deleteBy,
})

const delivered = () => censusDeliveredNotice({
  contact, companyName, assignedTo,
  attached: true,
  pageUrl: 'https://etyme.example/census/abc123/page',
  deleteBy,
})

const deleted = () => censusDeletedNotice({
  contact, companyName, assignedTo,
  count: 4, bytes: 2_202_010, deletedAt,
  pageDelivered: true,
  askAgainUrl: 'https://etyme.example/census',
})

const arrived = () => censusArrivedStaffNotice({
  censusId: 'cns_01HQZ', companyName, contact,
  desk: 'PROGRAM', option: 'TEMPLATE', supplierCount: 9,
  queuePosition: 3, assignedTo,
  reviewUrl: 'https://etyme.example/staff/census/cns_01HQZ',
})

const clock = () => censusClockStaffNotice({
  censusId: 'cns_01HQZ', companyName,
  daysLeft: 3, deleteBy, status: 'IN_REVIEW', assignedTo,
  reviewUrl: 'https://etyme.example/staff/census/cns_01HQZ',
})

const clientLetters = () => [asked(), agreed(), received(), delivered(), deleted()]
const everyLetter = () => [...clientLetters(), arrived(), clock()]

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const datesIn = (text: string) => [...text.matchAll(new RegExp(`(?:${MONTHS}) \\d{1,2}, \\d{4}`, 'g'))].map((m) => m[0])

describe('a census letter says only what the row says', () => {
  it('no census letter invents a deadline: every date printed is the one on the row', () => {
    const cases: { where: string; text: string; allowed: Date[] }[] = [
      // Nothing on the row holds a date yet — the link does not exist and
      // nothing has been received — so this letter prints none at all.
      { where: 'asked', text: asked().body, allowed: [] },
      { where: 'agreed', text: agreed().body, allowed: [uploadExpires] },
      { where: 'received', text: received().body, allowed: [deleteBy] },
      { where: 'delivered', text: delivered().body, allowed: [deleteBy] },
      { where: 'deleted', text: deleted().body, allowed: [deletedAt] },
      { where: 'staff: arrived', text: arrived().body, allowed: [] },
      { where: 'staff: clock', text: clock().body, allowed: [deleteBy] },
    ]

    for (const c of cases) {
      const printed = [...new Set(datesIn(plain(c.text)))]
      const allowed = c.allowed.map((d) => day(d))
      expect(printed, `${c.where} printed a date nothing holds`).toEqual(
        printed.filter((p) => allowed.includes(p))
      )
      for (const d of allowed) expect(printed, `${c.where} dropped the date on the row`).toContain(d)
    }
  })

  it('the letter about the day the data goes reads the row and never counts from today', () => {
    const later = censusReceivedNotice({
      contact, companyName, assignedTo,
      count: 4, bytes: 2_202_010,
      deleteBy: new Date('2027-02-14T09:00:00Z'),
    })
    expect(plain(later.body)).toContain('February 14, 2027')
    expect(datesIn(plain(later.body))).toEqual(['February 14, 2027'])
  })

  it('the received letter prints the receipt sentence verbatim', () => {
    const sentence = receiptSentence({ count: 4, bytes: 2_202_010, deleteBy })
    expect(sentence).toContain('Received, 4 files, 2.1 MB.')
    expect(plain(received().body)).toContain(plain(sentence))
  })

  it('the received letter says five working days is how we work and not a date we promise', () => {
    const body = plain(received().body)
    expect(body).toContain('We usually have your page back inside five working days.')
    expect(body).toContain('That is how we work rather than a date we are promising you')
    expect(body).toContain('the deletion date above is the only date on your census')
  })

  it('the delivered letter repeats the deletion date in the same words the page uses', () => {
    expect(plain(delivered().body)).toContain(plain(deletionSentence(deleteBy)))
  })

  it('the deleted letter says what went, and that the row saying so is what is left', () => {
    const body = plain(deleted().body)
    expect(body).toContain(plain(deletedSentence({ count: 4, bytes: 2_202_010, deletedAt })))
    expect(body).toContain('What is left is one row saying it was done')
    expect(body).toContain('Your page stays exactly as it was sent to you.')
    expect(body).toContain('ask for one at https://etyme.example/census')
  })

  it('a census deleted before any page was sent says that too, rather than implying one went', () => {
    const body = plain(censusDeletedNotice({
      contact, companyName, assignedTo,
      count: 1, bytes: 4096, deletedAt, pageDelivered: false,
      askAgainUrl: 'https://etyme.example/census',
    }).body)
    expect(body).toContain('No page was ever sent from it')
    expect(body).not.toContain('Your page stays')
  })
})

describe('the asked and agreed letters say what happens next and nothing more', () => {
  it('the asked letter gives their place in the line in the queue own words', () => {
    expect(plain(asked().body)).toContain(plain(queueSays(3)))
  })

  it('the asked letter says nothing moves until the agreement is accepted by name', () => {
    const body = plain(asked().body)
    expect(body).toContain('accepts the one-page census agreement by name')
    expect(body).toContain('the 2026-09-20 edition')
    expect(body).toContain('A link to send your files is created at that moment, and not before.')
    expect(body).toContain('Nothing moves until the agreement is accepted.')
  })

  it('the agreed letter says who accepted, which edition, and the day the link runs out', () => {
    const body = plain(agreed().body)
    expect(body).toContain('Priya Raghavan has accepted the census agreement for Northbend Athletic.')
    expect(body).toContain('Accepted by Priya Raghavan against the 2026-09-20 edition')
    expect(body).toContain('open until October 4, 2026')
    expect(body).toContain('https://etyme.example/census/send/abc123')
  })

  it('the agreed letter says what may be sent and how much, in the limits the upload route enforces', () => {
    const body = plain(agreed().body)
    expect(body).toContain('CSV, PDF, XLSX and DOCX files.')
    expect(body).toContain('5.0 MB for any one file.')
    expect(body).toContain('50.0 MB for the whole census, across 20 files at most.')
  })

  it('the template option asks for no names and says so', () => {
    expect(plain(agreed().body)).toContain('No names are needed; your own reference number is enough')
  })

  it('a client sending their own files is not sent a template they did not choose', () => {
    const body = plain(censusAgreedNotice({
      contact, companyName, assignedTo,
      acceptedBy: 'Priya Raghavan', agreementVersion: '2026-09-20',
      uploadExpires, uploadUrl: 'https://etyme.example/census/send/abc123',
      option: 'FILES', templateUrl: 'https://etyme.example/census-template.csv',
    }).body)
    expect(body).toContain('Send your own supplier invoices and timesheets as they are.')
    expect(body).not.toContain('census-template.csv')
  })
})

describe('the page is delivered with its gaps named and no urgency on it', () => {
  it('the delivered letter names the six sections of the page in the page own words', () => {
    const body = plain(delivered().body)
    for (const section of PAGE_SECTIONS) expect(body).toContain(section)

    // Held to the page itself: a heading renamed there and not here would
    // reach a CFO as two different documents.
    const page = readFileSync(join(ROOT, 'src/lib/census-page.ts'), 'utf8')
    for (const section of PAGE_SECTIONS) expect(page, `the page no longer says "${section}"`).toContain(section)
  })

  it('the delivered letter says what we could not see is on the page on purpose', () => {
    const body = plain(delivered().body)
    expect(body).toContain('"What we could not see" is on the page on purpose.')
    expect(body).toContain('what makes the other four numbers believable')
  })

  it('the delivered letter offers the two ways forward in the buyer two labels and the third choice of doing nothing', () => {
    const body = plain(delivered().body)
    expect(body).toContain('Etyme as VMS software:')
    expect(body).toContain('Etyme as MSP provider:')
    expect(body).toContain(`Or do nothing, and the data is deleted on ${day(deleteBy)}.`)

    // The labels are the buyer's, taken from the home page rather than
    // invented here, because a program manager has already evaluated
    // things called both of those.
    const home = readFileSync(join(ROOT, 'src/app/page.tsx'), 'utf8')
    expect(home).toContain("label: 'VMS software'")
    expect(home).toContain("label: 'MSP provider'")
    expect(WAYS_FORWARD.length).toBe(2)
  })

  it('a page sent as a link rather than an attachment still says where it is', () => {
    const body = plain(censusDeliveredNotice({
      contact, companyName, assignedTo,
      attached: false, pageUrl: 'https://etyme.example/census/abc123/page', deleteBy,
    }).body)
    expect(body).toContain('https://etyme.example/census/abc123/page')
    expect(body).not.toContain('is attached')
  })
})

describe('nothing here is the first of a series', () => {
  it('no letter opens a sequence or promises another email', () => {
    const banned = [
      /we will follow up/i, /we'll follow up/i, /follow up with you/i,
      /we will be in touch/i, /we'll be in touch/i,
      /our next email/i, /the next email/i, /over the next few (days|weeks)/i,
      /stay tuned/i, /keep an eye out/i, /watch this space/i,
      /unsubscribe/i, /mailing list/i, /newsletter/i,
      /last chance/i, /don't miss/i, /act now/i, /limited time/i, /hurry/i,
      /expires soon/i, /only \d+ (days|hours) left to/i,
    ]
    for (const letter of everyLetter()) {
      for (const pattern of banned) {
        expect(plain(letter.body), `${letter.subject} says something it should not`).not.toMatch(pattern)
        expect(plain(letter.subject)).not.toMatch(pattern)
      }
    }
  })

  it('the first letter says out loud that nothing automatic follows it', () => {
    const body = plain(asked().body)
    expect(body).toContain('Nothing automatic happens next.')
    expect(body).toContain('You have not been added to a list and this is not the first of a series.')
  })

  it('the letter to the person running it says the follow-up is theirs to write by hand', () => {
    expect(plain(arrived().body)).toContain('write to Dana Whitfield yourself')
    expect(plain(arrived().body)).toContain('Nothing automatic follows this')
  })
})

describe('who hears, and who they write back to', () => {
  it('the client hears on the business channel and never on a consumer one', () => {
    for (const letter of clientLetters()) {
      expect(letter.audience).toBe('business')
      expect(letter.channels).toEqual(['TEAMS', 'EMAIL'])
      expect(letter.channels).not.toEqual(['EMAIL'])
    }
  })

  it('every client letter goes to the work address on the row, because there is nobody here to look up', () => {
    for (const letter of clientLetters()) {
      expect(letter.to).toBe(contact.workEmail)
      // No Company row, so no Teams channel to post a card into.
      expect(letter.card).toBeNull()
    }
  })

  it('every letter to the client ends with the named person at Etyme to write to', () => {
    for (const letter of clientLetters()) {
      expect(plain(letter.body).trimEnd().endsWith(
        `Questions go to ${assignedTo}, who runs your census and answers them personally.`
      ), `${letter.subject} does not end with a person`).toBe(true)
    }
  })

  it('a census nobody is assigned to says so rather than naming an address that is not a person', () => {
    const body = plain(censusReceivedNotice({
      contact, companyName, assignedTo: null, count: 4, bytes: 2_202_010, deleteBy,
    }).body)
    expect(body).toContain('Nobody at Etyme is assigned to your census yet, and you were promised a name.')
    expect(body).toContain('Reply to this message and whoever takes it will write to you by name.')
    expect(body).not.toContain('@etyme')
  })
})

describe('the person running a census hears twice and no more', () => {
  it('the staff letter when a census arrives names the client, the option chosen and what to do', () => {
    const letter = arrived()
    expect(letter.subject).toBe('Census asked for: Northbend Athletic')
    const body = plain(letter.body)
    expect(body).toContain('Dana Whitfield (dana.whitfield@northbend.example) at Northbend Athletic has asked for a contractor census.')
    expect(body).toContain('Sending: the template.')
    expect(body).toContain('Desk: PROGRAM.')
    expect(body).toContain('Suppliers they think they buy from: 9.')
    expect(body).toContain('Place in the line: 3.')
    expect(body).toContain('the upload link does not exist until they do')
    expect(letter.card?.action).toEqual({
      label: 'Open the census', url: 'https://etyme.example/staff/census/cns_01HQZ',
    })
  })

  it('a census the client left blank says not said rather than printing a number nobody gave', () => {
    const body = plain(censusArrivedStaffNotice({
      censusId: 'cns_01HQZ', companyName, contact,
      desk: null, option: 'FILES', supplierCount: null,
      queuePosition: 1, assignedTo: null,
      reviewUrl: 'https://etyme.example/staff/census/cns_01HQZ',
    }).body)
    expect(body).toContain('Desk: not said.')
    expect(body).toContain('Suppliers they think they buy from: not said.')
    expect(body).toContain('Nobody is assigned to it, and the client was promised a name.')
  })

  it('the staff warning carries the census id so it is sent once a night', () => {
    const letter = clock()
    expect(letter.entityId).toBe('cns_01HQZ')
    expect(letter.card?.facts).toContainEqual({ name: 'Census', value: 'cns_01HQZ' })
    expect(arrived().entityId).toBe('cns_01HQZ')
  })

  it('the staff warning says how long is left, the date it goes, and that the date does not move', () => {
    const body = plain(clock().body)
    expect(clock().subject).toBe("Northbend Athletic's census data goes in 3 days and the page has not gone")
    expect(body).toContain("Northbend Athletic's census data is deleted on November 4, 2026, in 3 days, and their page has not been sent.")
    expect(body).toContain('It is in review and the page has not gone out.')
    expect(body).toContain('it does not move')
    expect(body).toContain('marcus@etyme.example owns it.')
  })

  it('the warning on the last day says tomorrow rather than in 1 days', () => {
    const letter = censusClockStaffNotice({
      censusId: 'cns_01HQZ', companyName, daysLeft: 1, deleteBy,
      status: 'RECEIVED', assignedTo, reviewUrl: 'https://etyme.example/staff/census/cns_01HQZ',
    })
    expect(plain(letter.body)).toContain('deleted on November 4, 2026, tomorrow,')
    expect(plain(letter.body)).toContain('Their files are here and nobody has taken it into review yet.')
    expect(letter.subject).toContain('goes tomorrow')
  })
})
