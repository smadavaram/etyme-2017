import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyWhy, emptyDrawn, firmFilingSays, clientApprovalSays, RECORD_A_PLACEMENT_HREF, type EmptyFacts, type EmptyPerson,
} from '@/app/api/timesheets/empty-why'
import { inTile, TILE_LABEL, TILE_EMPTY, waitingSub, tileShowing } from '@/app/dashboard/timesheets/tiles'
import { pasteAnswerSays, supplierStandingSays, contactShown, companyOpenHref } from '@/lib/supplier-list'

/**
 * Fix list 2026-11-14, area E, item E1: an empty Timesheets page says why,
 * one bucket has one name, and the line at the top says what is true.
 * And three small things left from the last press of Suppliers.
 * Every row is built here; nothing reads the seeded world or the clock.
 */

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const person = (name: string, o: Partial<EmptyPerson> = {}): EmptyPerson => ({
  personId: `id-${name}`, name, signedIn: true, isReader: false, ...o,
})
const facts = (o: Partial<EmptyFacts> = {}): EmptyFacts => ({
  asClient: false, seatedFor: null, onePerson: false, anyLines: 0, placed: [],
  mayRecord: false, recordSays: null, mayOpenCandidates: false, inviteSays: null, hoursDueWeekday: 1, ...o,
})

describe('an empty Timesheets page says why it is empty', () => {
  it('a supplier with nobody placed is told so, and a seat that may record one is handed Record a placement', () => {
    const w = emptyWhy(facts({ mayRecord: true }))
    expect(w.says).toBe('Nobody is placed yet, so there are no hours to file.')
    expect(w.link).toEqual({ label: 'Record a placement', href: RECORD_A_PLACEMENT_HREF })
    expect(RECORD_A_PLACEMENT_HREF).toBe('/dashboard/contracts?new=1')
  })

  it('a seat that may not record a placement is told which role does, with no link', () => {
    const w = emptyWhy(facts({ recordSays: 'Recording a placement is for the Owner or an Admin here. Ask one of them.' }))
    expect(w.link).toBeNull()
    expect(w.detail).toBe('A placement starts when a client awards a submission. Recording a placement is for the Owner or an Admin here. Ask one of them.')
  })

  it('a firm whose every line has ended reads that nobody is placed right now, not yet', () => {
    expect(emptyWhy(facts({ anyLines: 2 })).says).toBe('Nobody is placed right now, so there are no hours to file.')
  })

  it('a client with nobody at its sites reads that there are no hours to approve, and is offered no placement to record', () => {
    const w = emptyWhy(facts({ asClient: true, mayRecord: true }))
    expect(w.says).toBe('Nobody is working at your sites yet, so there are no hours to approve.')
    expect(w.link).toBeNull()
  })

  it('a firm seated in a client’s program reads that client’s sites by name', () => {
    expect(emptyWhy(facts({ asClient: true, seatedFor: 'Harborline Tech' })).says)
      .toBe('Nobody is working at Harborline Tech’s sites yet, so there are no hours to approve.')
  })

  it('a one-person firm with no placement reads "you", never "nobody is placed"', () => {
    expect(emptyWhy(facts({ onePerson: true })).says).toBe('You have no placement yet, so there are no hours to file.')
  })

  it('a one-person firm placed and not filed is told she files her own hours', () => {
    const w = emptyWhy(facts({ onePerson: true, anyLines: 1, placed: [person('Ivy Chen', { isReader: true })] }))
    expect(w.says).toBe('You have not filed a week yet.')
    expect(w.detail).toBe('You file your own hours, from this page or from Your work. Each week’s hours are due the Monday after it ends, by your company’s settings.')
  })

  it('a placed person who never signed in is told apart from one who signed in and has not filed', () => {
    const w = emptyWhy(facts({ anyLines: 2, placed: [person('Sam Ortiz'), person('Dana Reyes', { signedIn: false })], mayOpenCandidates: true }))
    expect(w.people.map((p) => p.says)).toEqual([
      'Dana Reyes has not signed in to Etyme yet, so no week can be filed.',
      'Sam Ortiz has signed in and has not filed a week yet.',
    ])
    expect(w.people[0].link).toEqual({ label: 'Open Candidates', href: '/dashboard/consultants' })
    expect(w.people[1].link).toBeNull()
  })

  it('only the worker files, and the page never offers the firm a way to file for her or an email door', () => {
    const w = emptyWhy(facts({ anyLines: 1, placed: [person('Sam Ortiz')] }))
    expect(w.detail).toContain('Only the worker files hours, from their own page. Nobody at the firm files for them.')
    expect(JSON.stringify(w)).not.toMatch(/email|forward/i)
  })

  it('the hours-due day is the company’s own setting, said as a weekday and never as a date', () => {
    expect(emptyWhy(facts({ anyLines: 1, placed: [person('Sam Ortiz')], hoursDueWeekday: 2 })).detail)
      .toContain('Each week’s hours are due the Tuesday after it ends, by your company’s settings.')
    expect(emptyWhy(facts({ anyLines: 1, placed: [person('Sam Ortiz')], hoursDueWeekday: null })).detail).not.toContain('due')
  })

  it('at most three people are named, by name and then by id, and the rest are counted', () => {
    const placed = [person('Zoe Park'), person('Ana Cruz', { personId: 'b' }), person('Ana Cruz', { personId: 'a' }), person('Ben Fox')]
    const w = emptyWhy(facts({ anyLines: 4, placed }))
    expect(w.says).toBe('4 people are placed, and no week has been filed yet.')
    expect(w.people.map((p) => p.personId)).toEqual(['a', 'b', 'id-Ben Fox'])
    expect(w.detail).toContain('1 more person has not filed either.')
  })

  it('a seat that cannot send an invitation again is told which role does, once, with no link', () => {
    const w = emptyWhy(facts({
      anyLines: 2, placed: [person('Dana Reyes', { signedIn: false }), person('Lee Moss', { signedIn: false })],
      inviteSays: 'Sending the invitation again is for the HR here. Ask them.',
    }))
    expect(w.people.every((p) => p.link === null)).toBe(true)
    expect(w.detail!.split('Sending the invitation again').length - 1).toBe(1)
  })

  it('a client reads who works at its sites and never a supplier worker’s sign-in', () => {
    const w = emptyWhy(facts({ asClient: true, anyLines: 1, placed: [person('Dana Reyes', { signedIn: false })] }))
    expect(w.says).toBe('Dana Reyes is working at your sites, and no week has been filed yet.')
    expect(w.people[0].says).toBe('Dana Reyes has not filed a week yet.')
    expect(JSON.stringify(w)).not.toMatch(/signed in/)
  })

  it('the page draws one button: the act that unblocks it, else the page an invitation is on', () => {
    expect(emptyDrawn(emptyWhy(facts({ mayRecord: true }))).action?.label).toBe('Record a placement')
    const drawn = emptyDrawn(emptyWhy(facts({ anyLines: 1, placed: [person('Dana Reyes', { signedIn: false })], mayOpenCandidates: true })))
    expect(drawn.action).toEqual({ label: 'Open Candidates', href: '/dashboard/consultants' })
    expect(drawn.detail).toMatch(/^Dana Reyes has not signed in to Etyme yet/)
  })
})

describe('one bucket, one name', () => {
  const rows = [
    { status: 'SUBMITTED', flag: null, signature: { waitingOnYou: true }, overtime: { weeks: [] } },
    { status: 'SUBMITTED', flag: 'Over 60 hours', signature: { waitingOnYou: false }, overtime: { weeks: [{}] } },
    { status: 'APPROVED', flag: null, signature: { waitingOnYou: false }, overtime: null },
  ]

  it('the Timesheets tile for weeks waiting on you is named for what it counts, never "Pending approval"', () => {
    expect(TILE_LABEL.WAITING_ON_YOU).toBe('Waiting on you')
    const page = read('src/app/dashboard/timesheets/page.tsx')
    expect(page).not.toContain('Pending approval')
    expect(page).not.toContain("'need review'")
  })

  it('a week is counted by a tile exactly when the list that tile opens shows it', () => {
    expect(rows.filter((r) => inTile('WAITING_ON_YOU', r)).length).toBe(1)
    expect(rows.filter((r) => inTile('FLAGGED', r)).length).toBe(1)
    expect(rows.filter((r) => inTile('OVERTIME', r)).length).toBe(1)
    const page = read('src/app/dashboard/timesheets/page.tsx')
    // The count and the narrowed list read the one rule.
    expect(page).toContain("timesheets.filter((t) => inTile('WAITING_ON_YOU', t)).length")
    expect(page).toContain('byStatus.filter((t) => inTile(tile, t))')
  })

  it('every tile that counts weeks is drawn as a button that narrows the list, and the two that count money are not', () => {
    const page = read('src/app/dashboard/timesheets/page.tsx')
    for (const t of ['WAITING_ON_YOU', 'FLAGGED', 'OVERTIME']) expect(page).toContain(`<TileButton tile="${t}"`)
    expect(page).toMatch(/aria-pressed=\{pressed\}/)
    expect(page).not.toMatch(/<TileButton[^>]*>\s*<Stat\s+label="Approved value"/)
  })

  it('a narrowed list says what it shows and how many, and an empty one says which tile emptied it', () => {
    expect(tileShowing('FLAGGED', 2)).toBe('Showing the 2 weeks flagged.')
    expect(tileShowing('WAITING_ON_YOU', 1)).toBe('Showing the 1 week waiting on you.')
    expect(TILE_EMPTY.OVERTIME).toBe('No weeks have overtime to decide.')
    expect(waitingSub(0)).toBe('nothing waiting on you')
    expect(waitingSub(3)).toBe('3 weeks for you to sign')
  })

  it('a supplier is told how many weeks wait for the client’s approval, and who attaches it where the seat may not', () => {
    expect(clientApprovalSays(0, { may: true, whoSays: null })).toBeNull()
    expect(clientApprovalSays(2, { may: true, whoSays: null })).toBe('2 weeks wait for the client’s approval. Open the week to attach the approval the client gave.')
    expect(clientApprovalSays(1, { may: false, whoSays: 'Attaching the client’s approval is for the AP & Payroll here. Ask them.' }))
      .toBe('1 week waits for the client’s approval. Attaching the client’s approval is for the AP & Payroll here. Ask them.')
  })

  it('each week waiting for the client’s approval is a link to that week’s own page', () => {
    const page = read('src/app/dashboard/timesheets/page.tsx')
    expect(page).toContain('timesheets.filter((t) => t.waitsOnClient && t.href)')
    expect(page).toMatch(/<Link href=\{t\.href as Route\}/)
  })
})

describe('the line at the top of a firm’s Timesheets says what is true', () => {
  it('it never says the firm accepts only once the client has signed', () => {
    const says = firmFilingSays('Northwind Staffing')
    expect(says).not.toContain('once the client has signed')
    expect(says).toBe(
      'Hours are filed by the person who worked them, from their own page. ' +
        'The client approves each week in Etyme, or its approval is attached to the week. ' +
        'Northwind Staffing accepts each week it pays for.'
    )
    expect(read('src/app/api/timesheets/route.ts')).not.toContain('accepts them once the client has signed')
  })
})

describe('Suppliers: what a paste and a card say', () => {
  it('the answer after a paste never says a supplier will find out where no email can leave', () => {
    const says = pasteAnswerSays({ suppliers: 1, invitations: 1, emailed: 0, mailCanLeave: false })
    expect(says).not.toMatch(/will find out/)
    expect(says).toBe('1 supplier on your list. No email can be sent from here yet, so nobody was emailed. You can still send them a job, but they will not hear of it by email.')
    expect(read('src/app/api/suppliers/route.ts')).not.toContain('they will find out when one arrives')
  })

  it('the answer after a paste says how many invitations were emailed where email can leave', () => {
    expect(pasteAnswerSays({ suppliers: 2, invitations: 2, emailed: 2, mailCanLeave: true })).toBe('2 suppliers on your list. 2 invitations were emailed. You can send them a job now.')
    expect(pasteAnswerSays({ suppliers: 1, invitations: 0, emailed: 0, mailCanLeave: true })).toContain('Nobody was emailed again')
    expect(pasteAnswerSays({ suppliers: 1, invitations: 1, emailed: 0, mailCanLeave: true })).toContain('The invitation email could not be sent.')
  })

  it('a pasted supplier’s card never reads "Invited." as a letter that went where no email can leave', () => {
    const off = supplierStandingSays({ joined: false, invited: true, mailCanLeave: false })
    expect(off).not.toMatch(/^Invited/)
    expect(off).toContain('No email can be sent from here yet, so they have not been told.')
    expect(supplierStandingSays({ joined: false, invited: true, mailCanLeave: true })).toBe('Invitation made, not answered yet. Can still be sent a job.')
    expect(supplierStandingSays({ joined: true, invited: true, mailCanLeave: false })).toBe('Signed in. Can be sent a job.')
  })

  it('a supplier’s card names a contact by her name first, with her address beside it', () => {
    expect(contactShown({ name: 'Teresa Lind', email: 'teresa@harborline-tech.example' })).toBe('Teresa Lind (teresa@harborline-tech.example)')
    expect(contactShown({ name: null, email: 'ops@harborline-tech.example' })).toBe('ops@harborline-tech.example')
    expect(contactShown({ name: 'Wen Ash', email: null })).toBe('Wen Ash')
    expect(read('src/app/dashboard/suppliers/page.tsx')).toContain('s.contacts.map((c) => contactShown(c))')
  })

  it('the refusal to invite a company nobody classified links to that one company on Companies', () => {
    expect(companyOpenHref('c1')).toBe('/dashboard/companies?open=c1')
    const page = read('src/app/dashboard/suppliers/page.tsx')
    expect(page).toContain('k.companyId ? companyOpenHref(k.companyId)')
    expect(read('src/app/api/suppliers/route.ts')).toContain('onYourList: existing.id !== claimed?.id')
  })
})
