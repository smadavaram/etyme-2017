import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { oneSubject, mayAsk, reference, heldCategories, categoriesHeldAbout } from '@/lib/data-request'
import { readClock, readBreach, mayWorkBreach, mayClose, type ClockState } from '@/lib/breach'
import { HELD } from '@/lib/legal'

/**
 * Who may ask, who may answer, and what a clock says out loud.
 *
 * The sentences matter as much as the verdicts here. Every refusal on
 * these routes is aimed at somebody standing in front of a screen asking
 * about a person's records, and a refusal that says a code has told them
 * nothing.
 */

const now = new Date('2026-09-19T09:00:00Z')

describe('a request is about exactly one subject', () => {
  it('a request naming a person and a company at once is refused, because the two are answered out of different files', () => {
    const v = oneSubject({ personId: 'p1', companyId: 'c1' })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('never both')
    expect(v.says).toContain('Raise two')
  })

  it('a request naming nobody is refused, because it cannot be counted against a deadline', () => {
    const v = oneSubject({})
    expect(v.ok).toBe(false)
    expect(v.says).toContain('cannot be answered')
  })

  it('a person or a company alone is what an answer needs', () => {
    expect(oneSubject({ personId: 'p1' }).ok).toBe(true)
    expect(oneSubject({ companyId: 'c1' }).ok).toBe(true)
  })
})

describe('who may ask about somebody else', () => {
  it('a person may always ask about themselves, from any seat they happen to be sitting in', () => {
    const v = mayAsk({
      callerPersonId: 'p1', subjectPersonId: 'p1', subjectCompanyId: null,
      callerCompanyId: null, holdsTheSubject: false,
    })
    expect(v.ok).toBe(true)
  })

  it('a company that holds the person may log a request that arrived by email', () => {
    const v = mayAsk({
      callerPersonId: 'p2', subjectPersonId: 'p1', subjectCompanyId: null,
      callerCompanyId: 'c1', holdsTheSubject: true,
    })
    expect(v.ok).toBe(true)
  })

  it('a company with no record of the person is refused, and is not told who does hold them', () => {
    const v = mayAsk({
      callerPersonId: 'p2', subjectPersonId: 'p1', subjectCompanyId: null,
      callerCompanyId: 'c1', holdsTheSubject: false,
    })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('no contract, no listing, no submission and no seat')
    expect(v.says).toContain('we cannot tell you who that is')
  })

  it('somebody with no seat at all is pointed at their own page rather than refused in the abstract', () => {
    const v = mayAsk({
      callerPersonId: 'p2', subjectPersonId: 'p1', subjectCompanyId: null,
      callerCompanyId: null, holdsTheSubject: false,
    })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('your own page')
  })
})

describe('what a person is shown about what is held', () => {
  it('the list on the page is the privacy notice’s own list, not a second copy of it', () => {
    expect(heldCategories().map((h) => h.category)).toEqual(HELD.map((h) => h.category))
  })

  it('a consultant is shown the categories about candidates and everybody, and not the ones about firms', () => {
    const mine = categoriesHeldAbout('candidate')
    expect(mine).toContain('Resumes')
    expect(mine).toContain('Logs')
    expect(mine).not.toContain('Company and supplier records')
  })

  it('a reference is short enough to quote down a phone and the same in every letter', () => {
    expect(reference('clabcdef12345678')).toBe('DR-12345678')
    expect(reference('clabcdef12345678')).toBe(reference('clabcdef12345678'))
  })
})

// ── The breach clocks ────────────────────────────────────────────────

function clock(over: Partial<ClockState> = {}): ClockState {
  return { who: 'AUTHORITY', dueAt: null, notifiedAt: null, owner: 'Dana Whitlock', ...over }
}

describe('a breach clock says what it knows and admits what nobody has decided', () => {
  it('a breach opened with no clock says nobody has decided one, never that nothing is owed', () => {
    const reading = readBreach([clock(), clock({ who: 'PEOPLE' })], now)
    expect(reading.nobodyHasDecided).toBe(true)
    expect(reading.says).toContain('Nobody has decided a deadline')
    expect(reading.clocks[0].says).toContain('not the same as nothing being owed')
  })

  it('a clock inside a day is said in hours, because at four in the afternoon "tomorrow" is not a number anybody can act on', () => {
    const r = readClock(clock({ dueAt: new Date('2026-09-19T21:00:00Z') }), now)
    expect(r.reading).toBe('DUE_SOON')
    expect(r.says).toContain('12 hours left')
    expect(r.says).toContain('Dana Whitlock owns it')
  })

  it('a clock further out is said in days', () => {
    const r = readClock(clock({ dueAt: new Date('2026-09-25T09:00:00Z') }), now)
    expect(r.reading).toBe('RUNNING')
    expect(r.says).toContain('6 days left')
  })

  it('a clock that has passed with no notice recorded says how late it is', () => {
    const r = readClock(clock({ dueAt: new Date('2026-09-18T09:00:00Z') }), now)
    expect(r.reading).toBe('MISSED')
    expect(r.says).toContain('passed 24 hours ago')
  })

  it('a clock owned by nobody says so, because a deadline addressed to a team is a deadline addressed to nobody', () => {
    const r = readClock(clock({ dueAt: new Date('2026-09-19T21:00:00Z'), owner: null }), now)
    expect(r.says).toContain('Nobody owns this notice yet')
  })

  it('a notice that has gone stops counting', () => {
    const r = readClock(clock({ dueAt: new Date('2026-09-10T09:00:00Z'), notifiedAt: new Date('2026-09-09T09:00:00Z') }), now)
    expect(r.reading).toBe('SENT')
    expect(r.hours).toBeNull()
  })

  it('a customer’s own notice period is named for the customer rather than for a regulator', () => {
    const r = readClock(clock({ who: 'CUSTOMER', companyName: 'Northbend Athletic', dueAt: new Date('2026-09-19T18:00:00Z') }), now)
    expect(r.says).toContain('Northbend Athletic')
  })

  it('a closed breach says every clock on it stopped', () => {
    const reading = readBreach([clock({ dueAt: new Date('2026-09-10T09:00:00Z') })], now, new Date('2026-09-15T09:00:00Z'))
    expect(reading.says).toContain('Every clock on it stopped')
  })

  it('the loudest thing a breach has to say is the line at the top of the row', () => {
    const reading = readBreach(
      [clock({ dueAt: new Date('2026-09-18T09:00:00Z') }), clock({ who: 'PEOPLE', dueAt: new Date('2026-09-30T09:00:00Z') })],
      now
    )
    expect(reading.worst).toBe('MISSED')
    expect(reading.says).toContain('passed with no notice recorded')
  })
})

describe('who may read a breach at all', () => {
  it('Etyme staff run an incident', () => {
    expect(mayWorkBreach({ isStaff: true, hasCompliancePermission: false, companyIsAffected: false }).ok).toBe(true)
  })

  it('a seat without the compliance permission is refused, and told who at their company does hold it', () => {
    const v = mayWorkBreach({ isStaff: false, hasCompliancePermission: false, companyIsAffected: true })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('compliance desk')
    expect(v.says).toContain('Users and permissions')
  })

  it('a company none of whose records were in it is told there is nothing here, not that it is forbidden', () => {
    const v = mayWorkBreach({ isStaff: false, hasCompliancePermission: true, companyIsAffected: false })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('nothing here for your company')
    expect(v.says).toContain('you would have been written to')
  })

  it('a customer whose records were in it may read its own line', () => {
    expect(mayWorkBreach({ isStaff: false, hasCompliancePermission: true, companyIsAffected: true }).ok).toBe(true)
  })
})

describe('a breach is not closed over a notice that never went', () => {
  it('a decided deadline with no notice against it stops the close, and the refusal names who is still owed one', () => {
    const v = mayClose([clock({ dueAt: new Date('2026-09-10T09:00:00Z') })], now)
    expect(v.ok).toBe(false)
    expect(v.says).toContain('the supervisory authority')
    expect(v.says).toContain('says the notice was never owed')
  })

  it('a breach where every notice went can be closed', () => {
    const v = mayClose([clock({ dueAt: new Date('2026-09-10T09:00:00Z'), notifiedAt: new Date('2026-09-09T09:00:00Z') })], now)
    expect(v.ok).toBe(true)
  })

  it('a breach where no notice was ever owed can be closed, and closing it records that decision', () => {
    const v = mayClose([clock(), clock({ who: 'PEOPLE' })], now)
    expect(v.ok).toBe(true)
    expect(v.says).toContain('records that decision with your name on it')
  })
})

describe('the routes refuse in sentences, not in codes', () => {
  const routes = [
    'src/app/api/me/data/route.ts',
    'src/app/api/data-requests/route.ts',
    'src/app/api/data-requests/[id]/withdraw/route.ts',
    'src/app/api/legal-holds/route.ts',
    'src/app/api/breaches/route.ts',
  ]

  it('no refusal on any of these routes hands somebody a machine name to look up', () => {
    for (const r of routes) {
      const src = readFileSync(join(process.cwd(), r), 'utf8')
      const codes = [...src.matchAll(/error:\s*'([A-Z_]{6,})'/g)].map((m) => m[1])
      expect(codes, r).toEqual([])
    }
  })

  it('a person asking for their own data is asked for no permission, because a gate on your own file is one the person it protects cannot open', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/me/data/route.ts'), 'utf8')
    expect(src).not.toContain('hasPermission')
    expect(src).toContain('caller.person.id')
  })

  it('an export somebody else asked for is refused, and the refusal is written to the access log', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/me/data/route.ts'), 'utf8')
    expect(src).toContain('allowed: false')
    expect(src).toContain('Asked to download an export that is not theirs.')
  })
})
