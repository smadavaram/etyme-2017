import { describe, it, expect } from 'vitest'
import {
  AGREEMENT_VERSION, KEPT_DAYS_AFTER_RECEIPT, UPLOAD_WINDOW_DAYS,
  MAX_FILE_BYTES, MAX_CENSUS_BYTES, MAX_FILES, WARN_WITHIN_DAYS,
  addDays, assignStaff, assignmentSays, censusSweep, checkAsk, checkBatch, checkFile,
  checkWorkEmail, day, deleteByFrom, deletedSentence, deletionSentence, mayAgree,
  mayOpenFile, mayResetDeleteBy, mayReviewCensus, mayUpload, mb, queuePosition, queueSays,
  receiptSentence, uploadExpiresFrom,
  type SweepCensus,
} from '@/lib/census'
import { HELD } from '@/lib/legal'
import { scheduleFor, verdictFor } from '@/lib/retention'
import { fateOf } from '@/lib/notify/data-rights'

/**
 * A client sends us their own contractor data before they are a
 * customer, and we promise them in writing what happens to it.
 *
 * Every rule below is a sentence somebody at a client was told: an
 * agreement accepted by name before a link exists, a link that runs out,
 * a named person who reads it, and one date the data goes on. There is
 * no permission anywhere in this — nobody at the client has signed in —
 * so the rules are the whole of the protection.
 */

const NOW = new Date('2026-09-20T09:00:00Z')

describe('asking for a census, from a page with no login behind it', () => {
  it('a census asked for from a personal address is refused in a sentence that says why a work address is wanted', () => {
    const no = checkWorkEmail('rhiannon.kerr@gmail.com')
    expect(no.ok).toBe(false)
    expect(no.says).toContain('rhiannon.kerr@gmail.com')
    expect(no.says).toContain('work address')
    expect(no.says).not.toMatch(/invalid|error|VALIDATION/i)
  })

  it('a work address at a company nobody here has heard of is accepted, because nothing about a census is verified at this point', () => {
    expect(checkWorkEmail('r.kerr@northbend-athletic.example').ok).toBe(true)
    const ask = checkAsk({
      companyName: 'Northbend Athletic',
      contactName: 'Rhiannon Kerr',
      workEmail: 'R.Kerr@Northbend-Athletic.Example',
      desk: 'PROGRAM',
      supplierCount: 12,
    })
    expect(ask.ok).toBe(true)
    expect(ask.fields!.workEmail).toBe('r.kerr@northbend-athletic.example')
    expect(ask.fields!.option).toBe('TEMPLATE')
  })

  it('the lighter of the two ways to send it is what somebody gets when they choose nothing', () => {
    const ask = checkAsk({ companyName: 'Cavanaugh Glassworks', contactName: 'Iver Holt', workEmail: 'i.holt@cavanaugh.example' })
    expect(ask.fields!.option).toBe('TEMPLATE')
    expect(ask.fields!.desk).toBe('OTHER')
  })

  it('a program manager who does not know how many suppliers they buy from is the buyer, and may leave it blank', () => {
    const ask = checkAsk({ companyName: 'Talvern Medical', contactName: 'Marguerite Oyelaran', workEmail: 'm.oyelaran@talvern.example' })
    expect(ask.ok).toBe(true)
    expect(ask.fields!.supplierCount).toBeNull()
  })

  it('the place in the line is the number already open plus one, and it is said without dressing it up', () => {
    expect(queuePosition(0)).toBe(1)
    expect(queuePosition(3)).toBe(4)
    expect(queueSays(1)).toContain('next')
    expect(queueSays(4)).toContain('3 censuses ahead')
    // No urgency tricks: the only scarcity is how many we run well at once.
    expect(queueSays(4)).not.toMatch(/hurry|limited time|act now|expires soon/i)
  })

  it('where nobody is named as staff on this deployment the census is still written down, and the screen says nobody is assigned', () => {
    expect(assignStaff([])).toBeNull()
    expect(assignmentSays(null)).toContain('Nobody at Etyme is assigned')
    expect(assignmentSays(null)).toContain('ETYME_STAFF_EMAILS')
    expect(assignStaff([' Ops@Etyme.Example ', 'second@etyme.example'])).toBe('ops@etyme.example')
    expect(assignmentSays('ops@etyme.example')).toContain('recorded against them')
  })
})

describe('nothing moves until somebody at the client has accepted the agreement by name', () => {
  it('an acceptance with no name is refused, because a row that says only "accepted" cannot say who accepted', () => {
    const no = mayAgree({ acceptedBy: '', status: 'REQUESTED' })
    expect(no.ok).toBe(false)
    expect(no.says).toContain('name')
  })

  it('the upload link is minted at the moment the agreement is accepted and runs out a fortnight later', () => {
    const accepted = new Date('2026-09-20T12:00:00Z')
    expect(UPLOAD_WINDOW_DAYS).toBe(14)
    expect(uploadExpiresFrom(accepted).toISOString().slice(0, 10)).toBe('2026-10-04')
  })

  it('an upload before the agreement is refused in a sentence that says what has to happen first', () => {
    const no = mayUpload({
      status: 'REQUESTED', uploadToken: null, uploadExpires: null,
      agreementAcceptedAt: null, presented: 'anything', now: NOW,
    })
    expect(no.ok).toBe(false)
    expect(no.says).toContain('accepted the one-page census agreement by name')
    expect(no.says).toContain('created at that moment and not before')
  })

  it('an upload on a link that has run out is refused with the day it ran out, and how to get another', () => {
    const no = mayUpload({
      status: 'AGREED', uploadToken: 'tok', uploadExpires: new Date('2026-09-10T09:00:00Z'),
      agreementAcceptedAt: new Date('2026-08-27T09:00:00Z'), presented: 'tok', now: NOW,
    })
    expect(no.ok).toBe(false)
    expect(no.says).toContain('September 10, 2026')
    expect(no.says).toContain('another')
  })

  it('a link that is not the one we sent is refused, and so is an empty one', () => {
    const gate = {
      status: 'AGREED' as const, uploadToken: 'tok', uploadExpires: addDays(NOW, 5),
      agreementAcceptedAt: NOW, now: NOW,
    }
    expect(mayUpload({ ...gate, presented: 'guessed' }).ok).toBe(false)
    expect(mayUpload({ ...gate, presented: '' }).ok).toBe(false)
    expect(mayUpload({ ...gate, presented: 'tok' }).ok).toBe(true)
  })

  it('which edition of the agreement somebody accepted is recorded, so an audit can say what was accepted and not merely that something was', () => {
    expect(AGREEMENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('what a client may send, and what is said about what cannot be taken', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size })

  it('a CSV, a PDF, an Excel file and a Word file are taken, and a zip is not', () => {
    expect(checkFile(file('contractors.csv', 'text/csv', 2_000)).ok).toBe(true)
    expect(checkFile(file('Q3 Veritan invoices.pdf', 'application/pdf', 400_000)).ok).toBe(true)
    expect(checkFile(file('roster.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 90_000)).ok).toBe(true)
    expect(checkFile(file('statement of work.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 30_000)).ok).toBe(true)

    const zip = checkFile(file('everything.zip', 'application/zip', 100_000))
    expect(zip.ok).toBe(false)
    expect(zip.says).toContain('everything.zip')
    expect(zip.says).toContain('CSV')
  })

  it('a file the browser sent with no type at all is judged by its name rather than refused', () => {
    expect(checkFile(file('contractors.csv', '', 2_000)).ok).toBe(true)
    expect(checkFile(file('contractors', '', 2_000)).ok).toBe(false)
  })

  it('one file over five megabytes is refused the way a resume is, with the size it actually was', () => {
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024)
    const big = checkFile(file('scan.pdf', 'application/pdf', 9 * 1024 * 1024))
    expect(big.ok).toBe(false)
    expect(big.says).toContain('9.0 MB')
    expect(big.says).toContain('Five megabytes is the limit')
  })

  it('a whole census over fifty megabytes is refused with what has already arrived counted, not with the first file that broke it', () => {
    expect(MAX_CENSUS_BYTES).toBe(50 * 1024 * 1024)
    const four = [
      file('a.pdf', 'application/pdf', 4 * 1024 * 1024),
      file('b.pdf', 'application/pdf', 4 * 1024 * 1024),
    ]
    const batch = checkBatch(four, { count: 10, bytes: 48 * 1024 * 1024 })
    expect(batch.ok).toBe(false)
    expect(batch.refused).toHaveLength(2)
    expect(batch.says).toContain('48.0 MB has already arrived')
  })

  it('an upload of eight files with three we cannot open says which three, rather than stopping at the first', () => {
    const batch = checkBatch([
      file('one.csv', 'text/csv', 1_000),
      file('two.zip', 'application/zip', 1_000),
      file('three.pdf', 'application/pdf', 1_000),
      file('four.exe', 'application/octet-stream', 1_000),
      file('five.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1_000),
      file('six.png', 'image/png', 1_000),
    ])
    expect(batch.ok).toBe(true)
    expect(batch.accepted.map((f) => f.name)).toEqual(['one.csv', 'three.pdf', 'five.docx'])
    expect(batch.refused.map((r) => r.name)).toEqual(['two.zip', 'four.exe', 'six.png'])
  })

  it('more than twenty files on one census is refused with what to do instead', () => {
    expect(MAX_FILES).toBe(20)
    const batch = checkBatch([file('one.csv', 'text/csv', 1_000)], { count: 20, bytes: 1_000 })
    expect(batch.ok).toBe(false)
    expect(batch.says).toContain('20 files')
  })

  it('an upload with nothing in it is told so rather than recorded as an empty census', () => {
    expect(checkBatch([]).ok).toBe(false)
    expect(checkBatch([]).says).toContain('No files arrived')
  })
})

describe('the day the data goes is one date, set once, at receipt', () => {
  it('the deletion date is forty-five days after the files arrive, which covers the week of review and thirty days with the page', () => {
    expect(KEPT_DAYS_AFTER_RECEIPT).toBe(45)
    const received = new Date('2026-09-20T14:00:00Z')
    expect(deleteByFrom(received).toISOString().slice(0, 10)).toBe('2026-11-04')
  })

  it('the same date is on the confirmation, on the page and in the nightly sweep, because there is nowhere else to read it from', () => {
    const deleteBy = deleteByFrom(new Date('2026-09-20T14:00:00Z'))
    const confirmation = receiptSentence({ count: 4, bytes: 2_202_009, deleteBy })
    expect(confirmation).toContain('Received, 4 files, 2.1 MB.')
    expect(confirmation).toContain('Deleted on November 4, 2026 unless you start a program.')
    expect(deletionSentence(deleteBy)).toContain('November 4, 2026')
    // The sweep reads the same column and therefore says the same day.
    const plan = censusSweep(deleteBy, [row({ deleteBy })])
    expect(plan.deletions[0].says).toContain('November 4, 2026')
  })

  it('a census whose date is already set is never given another, and the refusal says the client was told this one', () => {
    const set = new Date('2026-11-04T14:00:00Z')
    expect(mayResetDeleteBy(null).ok).toBe(true)
    const no = mayResetDeleteBy(set)
    expect(no.ok).toBe(false)
    expect(no.says).toContain('November 4, 2026')
    expect(no.says).toContain('in writing')
    expect(no.says).toContain('program starting cancels it')
  })

  it('a census nothing has been sent to has no deletion date, and says that rather than showing a blank', () => {
    expect(deletionSentence(null)).toContain('Nothing has been received yet')
  })
})

describe('a census file is opened only by the person the client was told about', () => {
  const census = { assignedStaffEmail: 'ops@etyme.example', status: 'RECEIVED' as const }

  it('somebody with a seat at their own company cannot open a census file, and the refusal says whose promise that is', () => {
    const no = mayOpenFile({ staff: false, email: 'aileen.brody@northbend.example' }, census)
    expect(no.ok).toBe(false)
    expect(no.says).toContain('the promise made to the client')
    expect(mayReviewCensus({ staff: false, email: 'aileen.brody@northbend.example' }).ok).toBe(false)
  })

  it('staff who are not the named person are refused too, and told to reassign it rather than read it quietly', () => {
    const no = mayOpenFile({ staff: true, email: 'second@etyme.example' }, census)
    expect(no.ok).toBe(false)
    expect(no.says).toContain("ops@etyme.example's")
    expect(no.says).toContain('reassign')
  })

  it('the named person may open it, and is told the read is recorded against them', () => {
    const yes = mayOpenFile({ staff: true, email: 'Ops@Etyme.Example' }, census)
    expect(yes.ok).toBe(true)
    expect(yes.says).toContain('recorded against you')
  })

  it('a census nobody is assigned to cannot be opened by anybody, because the name is what the promise is made of', () => {
    const no = mayOpenFile({ staff: true, email: 'ops@etyme.example' }, { assignedStaffEmail: null, status: 'RECEIVED' })
    expect(no.ok).toBe(false)
    expect(no.says).toContain('Nobody is assigned')
  })

  it('a deleted census has nothing to open, and says so instead of refusing for the wrong reason', () => {
    const no = mayOpenFile({ staff: true, email: 'ops@etyme.example' }, { assignedStaffEmail: 'ops@etyme.example', status: 'DELETED' })
    expect(no.ok).toBe(false)
    expect(no.says).toContain('deleted on the day we said')
  })
})

describe('the nightly sweep deletes on the day and warns before it', () => {
  it('a census past its day with no program started is deleted tonight, and the sentence names the day and the count', () => {
    const plan = censusSweep(new Date('2026-11-05T02:00:00Z'), [row({})])
    expect(plan.deletions).toHaveLength(1)
    expect(plan.deletions[0].action).toBe('CENSUS_DELETED')
    expect(plan.deletions[0].fileCount).toBe(4)
    expect(plan.deletions[0].says).toContain('Northbend Athletic')
    expect(plan.deletions[0].says).toContain('November 4, 2026')
    expect(plan.deletions[0].says).toContain('Nothing puts this back.')
  })

  it('a census that became a program is not deleted, however far past its day it is', () => {
    const plan = censusSweep(new Date('2027-06-01T02:00:00Z'), [row({ status: 'PROGRAM_STARTED' })])
    expect(plan.deletions).toEqual([])
    expect(plan.warnings).toEqual([])
  })

  it('a census already deleted is not deleted again, and is not mentioned again either', () => {
    const plan = censusSweep(new Date('2027-06-01T02:00:00Z'), [
      row({ status: 'DELETED', deletedAt: new Date('2026-11-05T02:00:00Z') }),
    ])
    expect(plan.deletions).toEqual([])
  })

  it('a census three days from its date with the page still unsent tells the named person, because the data goes whether or not the page went', () => {
    expect(WARN_WITHIN_DAYS).toBe(3)
    const plan = censusSweep(new Date('2026-11-02T02:00:00Z'), [row({ status: 'IN_REVIEW' })])
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0].action).toBe('CENSUS_CLOCK_WARNED')
    expect(plan.warnings[0].owner).toBe('ops@etyme.example')
    expect(plan.warnings[0].says).toContain('their page has not been sent')
    expect(plan.warnings[0].says).toContain('does not move')
  })

  it('the same person is not told twice in one night, and is not told at all once the page has gone', () => {
    const near = new Date('2026-11-02T02:00:00Z')
    expect(censusSweep(near, [row({ status: 'IN_REVIEW', warnedToday: true })]).warnings).toEqual([])
    expect(censusSweep(near, [row({ status: 'DELIVERED' })]).warnings).toEqual([])
  })

  it('a census close to its date with nobody assigned says that is the first thing to fix', () => {
    const plan = censusSweep(new Date('2026-11-02T02:00:00Z'), [
      row({ status: 'RECEIVED', assignedStaffEmail: null }),
    ])
    expect(plan.warnings[0].owner).toBeNull()
    expect(plan.warnings[0].says).toContain('Nobody is assigned to it')
  })

  it('after the files are gone the row still says how many there were and how many bytes', () => {
    const said = deletedSentence({ count: 4, bytes: 2_202_009, deletedAt: new Date('2026-11-04T02:00:00Z') })
    expect(said).toContain('November 4, 2026')
    expect(said).toContain('were 4 files')
    expect(said).toContain('2.1 MB')
    expect(said).toContain('none of it is here now')
  })

  it('a census nothing was ever sent to has no date and is left alone rather than swept', () => {
    const plan = censusSweep(new Date('2027-06-01T02:00:00Z'), [row({ status: 'AGREED', deleteBy: null })])
    expect(plan.deletions).toEqual([])
    expect(plan.warnings).toEqual([])
  })
})

describe('a census is a category of what we hold, like everything else', () => {
  it('the privacy notice names a contractor census, about a business user, and says which models prove it', () => {
    const line = HELD.find((h) => h.category === 'A contractor census')
    expect(line, 'the notice says nothing about a census').toBeTruthy()
    expect(line!.about).toBe('Business users')
    expect(line!.provenBy).toContain('CensusRequest')
    expect(line!.provenBy).toContain('CensusFile')
  })

  it('the retention schedule says the files go on the census’s own date and that no statute requires keeping any of it', () => {
    const line = scheduleFor('A contractor census')!
    expect(line.months, 'no federal minimum applies, so none is stated').toBeNull()
    expect(line.basis).toContain('forty-five days')
    expect(line.basis).toContain('no federal rule requiring us to keep any of it')
    const v = verdictFor('A contractor census', { now: NOW })
    expect(v.verdict).toBe('ANONYMIZE')
    expect(v.says).toContain('stops naming anybody')
  })

  it('somebody who asks to be forgotten keeps the row that proves we deleted their files, under a marker', () => {
    const fate = fateOf('A contractor census')!
    expect(fate.fate).toBe('UNDER_A_MARKER')
    expect(fate.why).toContain('deleted on the day')
    expect(fate.why).toContain('your name and your work address come off it')
  })
})

describe('the words a client reads', () => {
  it('sizes read the way a person says them, and a small file is not "0.0 MB"', () => {
    expect(mb(412 * 1024)).toBe('412 KB')
    expect(mb(2_202_009)).toBe('2.1 MB')
    expect(mb(900)).toBe('900 bytes')
  })

  it('a date reads as a day and a month, not as a machine stamp', () => {
    expect(day(new Date('2026-10-20T23:30:00Z'))).toBe('October 20, 2026')
  })
})

// ── The row the sweep is given, with one thing changed at a time ──────

function row(over: Partial<SweepCensus>): SweepCensus {
  return {
    id: 'cen_1',
    companyName: 'Northbend Athletic',
    status: 'DELIVERED',
    deleteBy: new Date('2026-11-04T14:00:00Z'),
    deletedAt: null,
    receivedFileCount: 4,
    receivedBytes: 2_202_009,
    assignedStaffEmail: 'ops@etyme.example',
    warnedToday: false,
    ...over,
  }
}
