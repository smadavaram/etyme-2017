import { describe, it, expect } from 'vitest'
import {
  screenRules, shortlist, summarise, plainly, notesFrom, SHORTLIST,
  type Arriving, type Screened,
} from '@/lib/screening'
import { decide, type Finding } from '@/lib/loop'

/**
 * A hard role gets a hundred CVs and most of them are noise. Nobody is
 * paying to receive more submissions. They are paying to not read the
 * bad ones.
 *
 * So these tests are about what does NOT reach the hiring manager, and
 * whether the vendor is told something they can act on rather than just
 * being told no.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

function arriving(over: Partial<Arriving> = {}): Arriving {
  return {
    personName: 'R. Menon',
    vendorName: 'Cloudepa',
    rateCents: 7800,
    bandMaxCents: 8500,
    budgetMaxCents: 9000,
    others: [],
    submittedAt: new Date('2026-08-20T09:00:00Z'),
    workAuth: 'US_CITIZEN',
    workAuthRequired: null,
    availableFrom: new Date('2026-08-25'),
    startDate: new Date('2026-09-01'),
    invited: true,
    openToNetwork: false,
    msaActive: true,
    governance: null,
    barred: null,
    workedHereBefore: null,
    ...over,
  }
}

function find(fs: Finding[], code: string): Finding {
  return fs.find((f) => f.code === code)!
}

function screened(over: Partial<Screened> = {}): Screened {
  return {
    submissionId: 's1',
    personName: 'R. Menon',
    vendorName: 'Cloudepa',
    rateCents: 7800,
    submittedAt: new Date('2026-08-20T09:00:00Z'),
    cleared: true,
    heldBackFor: [],
    notes: [],
    score: null,
    ...over,
  }
}

describe('the same person, sent by more than one vendor', () => {
  it('holds back the second one and names who got there first', () => {
    const f = find(
      screenRules(
        arriving({
          others: [
            { vendorName: 'Vertex', rateCents: 9600, submittedAt: new Date('2026-08-18T09:00:00Z') },
          ],
        }),
        NOW
      ),
      'ALREADY_SUBMITTED'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/already put forward for this by Vertex on 2026-08-18/)
    expect(f.reason).toMatch(/First in wins/)
  })

  it('shows the client what the same person costs from each vendor', () => {
    // The line a client has never been able to see. It is worth more than
    // the duplicate removal itself.
    const f = find(
      screenRules(
        arriving({
          others: [
            { vendorName: 'Vertex', rateCents: 9600, submittedAt: new Date('2026-08-18T09:00:00Z') },
          ],
        }),
        NOW
      ),
      'ALREADY_SUBMITTED'
    )
    expect(f.evidence).toBe('Same person, 2 rates: Cloudepa $78 · Vertex $96')
  })

  it('lets the vendor who got there first through, and says the others came later', () => {
    const f = find(
      screenRules(
        arriving({
          others: [
            { vendorName: 'Vertex', rateCents: 9600, submittedAt: new Date('2026-08-25T09:00:00Z') },
          ],
        }),
        NOW
      ),
      'ALREADY_SUBMITTED'
    )
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toBe('First in. 1 other vendor sent the same person later.')
  })

  it('does not reward a rival for undercutting a live submission', () => {
    // Cheapest-wins teaches vendors to watch each other rather than to
    // move quickly, and the cheapest is only knowable after the fact.
    const cheaperButLater = screenRules(
      arriving({
        rateCents: 6000,
        submittedAt: new Date('2026-08-25T09:00:00Z'),
        others: [
          { vendorName: 'Vertex', rateCents: 9600, submittedAt: new Date('2026-08-18T09:00:00Z') },
        ],
      }),
      NOW
    )
    expect(find(cheaperButLater, 'ALREADY_SUBMITTED').verdict).toBe('FAIL')
  })
})

describe('the rate', () => {
  it('is checked against the band that vendor was given, not the role budget', () => {
    // A vendor told "over budget" when they are inside the band they
    // signed will argue, and be right.
    const f = find(screenRules(arriving({ rateCents: 8800 }), NOW), 'IN_BUDGET')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/\$3 over the band you gave them/)
    expect(f.reason).toMatch(/ask Cloudepa to come to \$85/)
  })

  it('falls back to the role budget when that vendor has no band', () => {
    const f = find(screenRules(arriving({ bandMaxCents: null, rateCents: 9500 }), NOW), 'IN_BUDGET')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/over the budget on this role/)
  })

  it('says how much is left under the ceiling when it passes', () => {
    const f = find(screenRules(arriving(), NOW), 'IN_BUDGET')
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toBe('Asking $78, $7 under the band you gave them.')
  })

  it('holds back a submission with no rate at all', () => {
    const f = find(screenRules(arriving({ rateCents: null }), NOW), 'IN_BUDGET')
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/sent no rate/)
  })

  it('does not invent a ceiling where the role has none', () => {
    const f = find(
      screenRules(arriving({ bandMaxCents: null, budgetMaxCents: null }), NOW),
      'IN_BUDGET'
    )
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/No ceiling set on this role/)
  })
})

describe('tenure and breaks in service', () => {
  it('blocks where the governance engine blocked, and says it cannot be waved through here', () => {
    const f = find(
      screenRules(
        arriving({ governance: { outcome: 'BLOCK', summary: '18 months here already, cap is 18' } }),
        NOW
      ),
      'GOVERNANCE'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe('Blocked: 18 months here already, cap is 18')
    expect(f.evidence).toMatch(/legal limits, not preferences/)
  })

  it('lets a warning through to the manager rather than hiding it from them', () => {
    // Addendum E: warn, capture a reason, proceed. Never silently permit,
    // and never silently refuse either.
    const f = find(
      screenRules(arriving({ governance: { outcome: 'WARN', summary: 'outside the usual rate band' } }), NOW),
      'GOVERNANCE'
    )
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toBe('Goes through with a warning: outside the usual rate band')
  })
})

describe('the do-not-submit list', () => {
  it('holds back somebody the client asked not to see, with the reason', () => {
    const f = find(
      screenRules(
        arriving({ barred: { at: new Date('2025-04-02'), reason: 'left mid-project without notice' } }),
        NOW
      ),
      'NOT_BARRED'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/left mid-project without notice/)
    expect(f.evidence).toBe('Added 2025-04-02.')
  })
})

describe('whether the client works with this vendor at all', () => {
  it('holds back a stranger with no invitation and no agreement', () => {
    const f = find(
      screenRules(arriving({ invited: false, msaActive: false }), NOW),
      'VENDOR_ENGAGED'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/no agreement with them on file/)
  })

  it('lets an uninvited vendor through when the role is open to the network', () => {
    const f = find(
      screenRules(arriving({ invited: false, msaActive: false, openToNetwork: true }), NOW),
      'VENDOR_ENGAGED'
    )
    expect(f.verdict).toBe('PASS')
  })

  it('lets a supplier you already work with through on a role you did not send them', () => {
    const f = find(
      screenRules(arriving({ invited: false, msaActive: true }), NOW),
      'VENDOR_ENGAGED'
    )
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/you have an agreement with them/)
  })
})

describe('the work permit', () => {
  it('holds back a mismatch', () => {
    const f = find(
      screenRules(arriving({ workAuthRequired: 'US_CITIZEN', workAuth: 'H1B' }), NOW),
      'WORK_AUTH'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe('This role needs US_CITIZEN; R. Menon holds H1B. Held back.')
  })

  it('holds back a submission where the vendor never said, before an interview is booked', () => {
    const f = find(
      screenRules(arriving({ workAuthRequired: 'US_CITIZEN', workAuth: null }), NOW),
      'WORK_AUTH'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/has not said what R. Menon holds/)
  })
})

describe('when they can start', () => {
  it('lets three weeks late through, because start dates slip', () => {
    const f = find(
      screenRules(arriving({ availableFrom: new Date('2026-09-20') }), NOW),
      'CAN_START'
    )
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/19 days after you wanted to start/)
  })

  it('holds back somebody who is not free for two months', () => {
    const f = find(
      screenRules(arriving({ availableFrom: new Date('2026-11-01') }), NOW),
      'CAN_START'
    )
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/Not free for another 61 days/)
  })
})

describe('somebody who has worked here before', () => {
  it('is never held back for it — it is the best news in the pile', () => {
    const fs = screenRules(
      arriving({ workedHereBefore: { months: 14, lastEnded: new Date('2025-06-30') } }),
      NOW
    )
    const f = find(fs, 'WORKED_HERE_BEFORE')
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/worked here before — 14 months, finishing 2025-06-30/)
  })

  it('counts time across every vendor, not just the one submitting now', () => {
    // Twelve months through one vendor and twelve through another is one
    // person with two years here. Per-assignment tenure is the industry's
    // blind spot.
    const f = find(
      screenRules(arriving({ workedHereBefore: { months: 24, lastEnded: new Date('2025-06-30') } }), NOW),
      'WORKED_HERE_BEFORE'
    )
    expect(f.evidence).toBe('Counted across every vendor and every assignment, not just this one.')
  })

  it('says nothing at all about somebody who has not', () => {
    expect(
      screenRules(arriving(), NOW).find((f) => f.code === 'WORKED_HERE_BEFORE')
    ).toBeUndefined()
  })
})

describe('a clean submission', () => {
  it('reaches the hiring manager', () => {
    const v = decide(screenRules(arriving(), NOW), 1, 2)
    expect(v.state).toBe('READY')
  })

  it('is held back the moment any one check fails', () => {
    const v = decide(screenRules(arriving({ rateCents: 12000 }), NOW), 1, 2)
    expect(v.state).toBe('NEEDS_FIX')
    expect(v.toFix).toHaveLength(1)
  })
})

describe('the pile', () => {
  it('leads with how many were removed, because that is the work', () => {
    const held = [
      screened({ cleared: false, heldBackFor: [{ code: 'IN_BUDGET', checker: 'RULE', verdict: 'FAIL', reason: 'x' }] }),
      screened({ cleared: false, heldBackFor: [{ code: 'IN_BUDGET', checker: 'RULE', verdict: 'FAIL', reason: 'x' }] }),
      screened({ cleared: false, heldBackFor: [{ code: 'ALREADY_SUBMITTED', checker: 'RULE', verdict: 'FAIL', reason: 'x' }] }),
    ]
    expect(summarise(14, 11, held)).toBe(
      '14 arrived. 11 worth reading. 3 held back — 2 over budget, 1 sent by somebody else first.'
    )
  })

  it('says so plainly when nothing has arrived', () => {
    expect(summarise(0, 0, [])).toBe('Nothing has arrived for this role yet.')
  })

  it('does not pretend to have filtered when everything was fine', () => {
    expect(summarise(4, 4, [])).toBe('4 arrived, and all of them are worth reading.')
  })
})

describe('the shortlist', () => {
  it('shows four and keeps the rest, because a manager reads four', () => {
    const all = Array.from({ length: 9 }, (_, i) =>
      screened({ submissionId: `s${i}`, score: 90 - i })
    )
    const s = shortlist(all)
    expect(s.show).toHaveLength(SHORTLIST)
    expect(s.more).toHaveLength(5)
  })

  it('ranks on fit when everything has been scored', () => {
    const s = shortlist([
      screened({ submissionId: 'low', score: 62 }),
      screened({ submissionId: 'high', score: 94 }),
      screened({ submissionId: 'mid', score: 81 }),
    ])
    expect(s.show.map((x) => x.submissionId)).toEqual(['high', 'mid', 'low'])
    expect(s.orderedBy).toBe('Best fit first, with the evidence behind each score.')
  })

  it('admits it is showing arrival order when nothing has been scored', () => {
    // A ranking nobody can account for is the thing this product exists
    // to replace. Saying "best fit first" over an unscored list would be
    // exactly that.
    const s = shortlist([
      screened({ submissionId: 'b', submittedAt: new Date('2026-08-20') }),
      screened({ submissionId: 'a', submittedAt: new Date('2026-08-18') }),
    ])
    expect(s.show.map((x) => x.submissionId)).toEqual(['a', 'b'])
    expect(s.orderedBy).toBe('In the order they arrived — nothing here has been scored yet.')
  })

  it('refuses to rank on a half-scored pile, and says how much was scored', () => {
    const s = shortlist([
      screened({ submissionId: 'a', score: 94, submittedAt: new Date('2026-08-20') }),
      screened({ submissionId: 'b', score: null, submittedAt: new Date('2026-08-18') }),
    ])
    expect(s.show.map((x) => x.submissionId)).toEqual(['b', 'a'])
    expect(s.orderedBy).toBe('In the order they arrived. 1 of 2 have been scored, which is not enough to rank on.')
  })

  it('keeps what was held back, with the reasons attached', () => {
    const s = shortlist([
      screened({ submissionId: 'ok' }),
      screened({
        submissionId: 'no',
        cleared: false,
        heldBackFor: [{ code: 'IN_BUDGET', checker: 'RULE', verdict: 'FAIL', reason: '$96 is $11 over.' }],
      }),
    ])
    expect(s.show).toHaveLength(1)
    expect(s.heldBack).toHaveLength(1)
    expect(s.heldBack[0].heldBackFor[0].reason).toBe('$96 is $11 over.')
  })
})

describe('the reason codes read as English', () => {
  it('says what a person would say', () => {
    expect(plainly('IN_BUDGET')).toBe('over budget')
    expect(plainly('ALREADY_SUBMITTED')).toBe('sent by somebody else first')
    expect(plainly('GOVERNANCE')).toBe('blocked on tenure or a break in service')
  })
})

describe('what a cleared candidate still gets told about', () => {
  it('surfaces somebody who has worked here before', () => {
    const notes = notesFrom(
      screenRules(
        arriving({ workedHereBefore: { months: 14, lastEnded: new Date('2025-06-30') } }),
        NOW
      ).filter((f) => f.verdict === 'PASS')
    )
    expect(notes.map((n) => n.code)).toContain('WORKED_HERE_BEFORE')
  })

  it('surfaces what the same person costs from the vendors who came later', () => {
    const notes = notesFrom(
      screenRules(
        arriving({
          others: [{ vendorName: 'Vertex', rateCents: 9600, submittedAt: new Date('2026-08-25') }],
        }),
        NOW
      ).filter((f) => f.verdict === 'PASS')
    )
    expect(notes.find((n) => n.code === 'ALREADY_SUBMITTED')?.evidence).toMatch(/Vertex \$96/)
  })

  it('surfaces a governance warning that went through', () => {
    const notes = notesFrom(
      screenRules(
        arriving({ governance: { outcome: 'WARN', summary: 'outside the usual rate band' } }),
        NOW
      ).filter((f) => f.verdict === 'PASS')
    )
    expect(notes.map((n) => n.code)).toContain('GOVERNANCE')
  })

  it('says nothing on an ordinary clean submission, because a screen that always speaks is noise', () => {
    const notes = notesFrom(screenRules(arriving(), NOW).filter((f) => f.verdict === 'PASS'))
    expect(notes).toHaveLength(0)
  })
})
