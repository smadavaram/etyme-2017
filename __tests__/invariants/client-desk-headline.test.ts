import { describe, it, expect } from 'vitest'
import { deskHeadline, deskItems, deskRows, doneAt, heldStartSays } from '@/app/dashboard/program/needs-you'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supplierCoverGate } from '@/lib/document-stages'

/**
 * The release walk of 2026-09-21 opened a client's desk and read
 * "Nothing needs you today." over a page saying a start was blocked on
 * an I-9 in nine days and a supplier had somebody on site with no
 * agreement. The headline counted the approval queue and called that the
 * desk.
 */
describe('the sentence at the top of a client’s Today page is one sentence with the names in it', () => {
  const start = (person: string) => ({ type: 'START_HELD', title: `${person} — through Brightmoor` })
  const agreement = (firm: string) => ({ type: 'NO_AGREEMENT', title: firm })
  const week = (person: string) => ({ type: 'TIMESHEET_APPROVAL', title: `Approve timesheet — ${person}` })

  it('says "Nothing needs you today." only when the queue is empty', () => {
    expect(deskHeadline([]).says).toBe('Nothing needs you today.')
    expect(deskHeadline([]).total).toBe(0)
  })

  it('names both things: "Two things need you: Ingrid Sørensen’s start, and Teleworld’s missing agreement."', () => {
    const said = deskHeadline([start('Ingrid Sørensen'), agreement('Teleworld')])
    expect(said.total).toBe(2)
    expect(said.says).toBe("Two things need you: Ingrid Sørensen's start, and Teleworld's missing agreement.")
  })

  it('one thing is named on its own: "One thing needs you: Ingrid Sørensen’s start."', () => {
    expect(deskHeadline([start('Ingrid Sørensen')]).says).toBe("One thing needs you: Ingrid Sørensen's start.")
  })

  it('three things are each named, with a comma before the last "and"', () => {
    expect(deskHeadline([week('Lucía Fernández'), start('Ingrid Sørensen'), agreement('Teleworld')]).says).toBe(
      "Three things need you: Lucía Fernández's week, Ingrid Sørensen's start, and Teleworld's missing agreement."
    )
  })

  it('past three things it names the first two and says "and n more"', () => {
    const said = deskHeadline([
      week('Lucía Fernández'), start('Ingrid Sørensen'), agreement('Teleworld'), week('Helena Marsh'),
    ])
    expect(said.total).toBe(4)
    expect(said.says).toBe("Four things need you: Lucía Fernández's week, Ingrid Sørensen's start, and 2 more.")
  })

  it('five weeks of one person’s are said once, as "Marcus Oyelaran’s five weeks", and count as five', () => {
    const said = deskHeadline([1, 2, 3, 4, 5].map(() => week('Marcus Oyelaran')).concat([start('Ingrid Sørensen')]))
    expect(said.total).toBe(6)
    expect(said.says).toBe("Six things need you: Marcus Oyelaran's five weeks, and Ingrid Sørensen's start.")
  })

  it('a firm whose name ends in s takes the apostrophe alone, as the rest of the page spells it', () => {
    expect(deskHeadline([agreement('Cavanaugh Glassworks')]).says).toBe("One thing needs you: Cavanaugh Glassworks' missing agreement.")
  })

  it('a row the route named is said in the route’s words, and a question from Ask Etyme belongs to nobody', () => {
    expect(deskHeadline([
      { type: 'REQUISITION_APPROVAL', title: 'Approve job request — HCM integration lead', named: { whose: null, what: 'the HCM integration lead job request', whats: 'job requests' } },
      { type: 'TWIN_QUESTION', title: 'Pay this invoice receipt' },
    ]).says).toBe('Two things need you: the HCM integration lead job request, and a question from Ask Etyme.')
  })

  it('the sentence carries no count without a name: never "1 start is held up by paperwork."', () => {
    const says = deskHeadline([start('Ingrid Sørensen'), agreement('Teleworld')]).says
    expect(says).not.toContain('held up by paperwork')
    expect(says).not.toContain('people on site with no agreement on file')
    expect(says.split('. ').length).toBe(1)
  })

  it('counts a supplier once however many of its people are on site', () => {
    const rows = deskItems({ startingSoon: [], vendors: [{ id: 'v', name: 'Wrenfield', agreement: false, headcount: 6 }] })
    expect(rows).toHaveLength(1)
  })

  it('a start whose paperwork only warns is not counted as needing somebody', () => {
    const start = (id: string, outcome: 'WARN' | 'PASS') =>
      ({ contractId: id, person: { name: id }, vendor: { name: 'B' }, paperwork: { outcome, says: '', fix: null } })
    expect(deskItems({ startingSoon: [start('a', 'WARN'), start('b', 'PASS')], vendors: [] })).toEqual([])
  })

  it('a supplier whose agreement was never read is not counted as missing one', () => {
    expect(deskItems({ startingSoon: [], vendors: [{ id: 'v', name: 'P', headcount: 3 }] })).toEqual([])
  })

  it('a held start and a missing agreement carry the name the headline says them by', () => {
    const rows = deskRows(
      deskItems({
        startingSoon: [{ contractId: 'c1', person: { name: 'Ingrid Sørensen' }, vendor: { name: 'Teleworld' }, paperwork: { outcome: 'BLOCK', says: 'x', fix: null } }],
        vendors: [{ id: 'v1', name: 'Teleworld', agreement: false, headcount: 1 }],
      }),
      new Map(),
      new Date('2026-10-19T12:00:00Z')
    )
    expect(rows.map((r) => r.type)).toEqual(['START_HELD', 'NO_AGREEMENT'])
    expect(deskHeadline(rows).says).toBe("Two things need you: Ingrid Sørensen's start, and Teleworld's missing agreement.")
  })
})

describe('a held start says what is missing once', () => {
  const i9 = { key: 'I9_EVERIFY', label: 'I-9 and E-Verify' }
  const rtw = { key: 'RIGHT_TO_WORK', label: 'Proof of right to work' }

  it('"Cannot start without an I-9 (proof of right to work). Get it on file, then activate." — the acronym once, the plain name once', () => {
    const says = heldStartSays({ outcome: 'BLOCK', blocking: [rtw, i9], licenseBlocks: false, coverBlocks: false })
    expect(says).toBe('Cannot start without an I-9 (proof of right to work). Get it on file, then activate.')
    expect(says!.match(/I-9/g)).toHaveLength(1)
    expect(says!.match(/proof of right to work/g)).toHaveLength(1)
  })

  it('the row says it in place of the clearance’s sentence, which names the person a second time', () => {
    const [row] = deskItems({
      startingSoon: [{
        contractId: 'c1', person: { name: 'Ingrid Sørensen' }, vendor: { name: 'Teleworld' },
        paperwork: {
          outcome: 'BLOCK',
          says: 'Ingrid Sørensen cannot start without proof of right to work (I-9, checked with E-Verify).',
          fix: 'Get proof of right to work (I-9, checked with E-Verify) on file, then activate.',
          short: 'Cannot start without an I-9 (proof of right to work). Get it on file, then activate.',
        },
      }],
      vendors: [],
    })
    expect(row.says).toBe('Cannot start without an I-9 (proof of right to work). Get it on file, then activate.')
    expect(row.who).toBe('Ingrid Sørensen — through Teleworld')
  })

  it('two missing papers are "them", and what the client’s own order asked for still says who asked', () => {
    const says = heldStartSays({
      outcome: 'BLOCK',
      blocking: [i9, { key: 'HOT_FLOOR', label: 'Hot floor induction', said: 'hot floor induction', from: 'ORDER', asked: "required by Cavanaugh Glassworks' order PO-2026-2" }],
      licenseBlocks: false, coverBlocks: false,
    })
    expect(says).toBe(
      "Cannot start without an I-9 (proof of right to work) and hot floor induction. Get them on file, then activate. " +
      "Hot floor induction is required by Cavanaugh Glassworks' order PO-2026-2."
    )
  })

  it('a start held by a license or a supplier’s cover keeps the clearance’s own sentence, which names the board or the certificate', () => {
    expect(heldStartSays({ outcome: 'BLOCK', blocking: [], licenseBlocks: true, coverBlocks: false })).toBeNull()
    expect(heldStartSays({ outcome: 'BLOCK', blocking: [i9], licenseBlocks: false, coverBlocks: true })).toBeNull()
    expect(heldStartSays({ outcome: 'WARN', blocking: [i9], licenseBlocks: false, coverBlocks: false })).toBeNull()
  })

  it('the queue and the program page read the one short sentence from the start’s paperwork', () => {
    const findings = readFileSync(join(process.cwd(), 'src/app/api/program/desk-findings.ts'), 'utf8')
    expect(findings).toContain('const short = heldStartSays({')
    expect(findings).toContain('return { outcome: papers.outcome, says: papers.says, fix: papers.fix ?? null, short }')
  })
})

describe('a done item at midnight is a day, not a clock time', () => {
  const clock = () => '9:12 AM'
  it('a row stamped at midnight UTC — a seeded row, or a start — reads "today", never "12:00 AM"', () => {
    expect(doneAt('2026-10-19T00:00:00.000Z', clock)).toBe('today')
  })
  it('a row with a real time keeps its clock time', () => {
    expect(doneAt('2026-10-19T16:12:00.000Z', clock)).toBe('9:12 AM')
  })
})

/**
 * The submit door passes the client's required set and then reads the
 * gate's findings: a lapse refuses, a document nobody has filed is
 * chased. These two sentences are what makes that reading possible —
 * `lib/document-stages` is etyme-regulatory's, and the day it decides a
 * never-filed required item blocks instead, the door follows it.
 */
describe('what the submit door can tell apart', () => {
  const on = new Date('2026-09-21T00:00:00Z')
  const year = (d: string) => new Date(d)

  it('a required certificate the supplier has never filed comes back as missing, not as lapsed', () => {
    const gate = supplierCoverGate({
      supplierName: 'Veritan Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: year('2026-01-01'), validFrom: year('2026-01-01'), expiresAt: year('2027-01-01'), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: year('2026-01-01'), validFrom: year('2026-01-01'), expiresAt: year('2027-01-01'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking.map((b) => b.key)).toEqual(['GOOD_STANDING'])
    expect(gate.blocking.every((b) => b.standing === 'MISSING')).toBe(true)
  })

  it('cover that ran out comes back as expired, which is the finding that refuses a submission', () => {
    const gate = supplierCoverGate({
      supplierName: 'Veritan Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: year('2024-01-01'), validFrom: year('2024-01-01'), expiresAt: year('2025-01-01'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.blocking.some((b) => b.standing !== 'MISSING')).toBe(true)
  })
})

/**
 * Two books on one page, and now one.
 *
 * Aptiva Workforce holds one seat, at Cavanaugh Glassworks. Its program
 * page offered "Ruben Ortega — 40h · Harlow Health" with an Approve
 * button: Aptiva's own week, on Cavanaugh's page, under a paragraph
 * explaining whose it was. The founder, 2026-10-19: a seat in another
 * company's program sees only that program.
 */
describe('a seat in another company’s program sees only that program', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const page = read('src/app/dashboard/program/page.tsx')
  const route = read('src/app/api/program/route.ts')

  it('under a seat the page reads the program’s own queue and never fetches the reader’s firm’s', () => {
    expect(page).toContain('if (body.data?.seated) {')
    expect(page).toContain('setDecisions(body.data.programQueue ?? [])')
    expect(route).toContain('const programQueue = seat')
  })

  it('the program’s queue is built from the same rows the client’s own seats get, for the permissions the seat carries', () => {
    expect(route).toContain("hasAnyPermission(acting.permissions, ['assignments.write'])")
    expect(route).toContain("hasAnyPermission(acting.permissions, ['vendors.manage'])")
    expect(route).toContain('deskRows(')
  })

  it('the paragraph explaining whose book the queue is has left the page', () => {
    expect(page).not.toContain('whoseQueue')
    expect(read('src/app/dashboard/program/needs-you.ts')).not.toContain('does not carry')
  })

  it('a seat is not sent from the client’s page to its own firm’s decisions', () => {
    expect(page).toContain("queue.length > 0 && !data.seated && <Link href={{ pathname: '/dashboard/decisions' }}")
  })
})
