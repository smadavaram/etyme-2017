import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  mayReadOurBench, managesLine, freeFrom, countsInMatching, checkFlag, checkHold, holdStands,
  mayEndHold, checkConfirm, checkPlace, cityOf, cityChange, hrNotice, personNotice, ourBenchRow,
  isoDay, HOLD_DAYS, HOLD_DAYS_MAX, type OurBenchFacts,
} from '@/lib/internal-moves'

/**
 * An integrator's own people moving between its projects — the
 * founder's example of 2026-09-30, as sentences. A manager in Portland
 * flags who rolls off; a manager in San Jose sees them on Our bench,
 * asks, holds and places; HR is told of every step; the person is told,
 * never asked.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const TODAY = d('2026-10-01')

const MANAGER = ['assignments.write', 'consultants.read']
const reader = (over: Partial<Parameters<typeof mayReadOurBench>[0]> = {}) =>
  mayReadOurBench({
    companyName: 'Teleworld Solutions', companyKind: 'GSI', permissions: MANAGER,
    roleName: 'Delivery Manager', consultantSeat: false, ...over,
  })

describe('who reads Our bench', () => {
  it('the firm’s managers read Our bench', () => {
    expect(reader()).toEqual({ ok: true, as: 'MANAGER' })
  })

  it('the firm’s HR desk reads Our bench without holding any manager’s permission', () => {
    expect(reader({ permissions: ['consultants.read', 'assignments.read'], roleName: 'HR' })).toEqual({ ok: true, as: 'HR' })
  })

  it('no client ever reads a supplier’s Our bench, however much it may do on its own program', () => {
    const v = reader({ companyKind: 'CLIENT', permissions: ['*'], roleName: 'Owner' })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('CLIENT')
      expect(v.message).toContain('no client reads it')
    }
  })

  it('an engineer on the roster is refused Our bench in a sentence naming who reads it', () => {
    const v = reader({ permissions: ['assignments.read', 'timesheets.read'], roleName: 'Validation Engineer' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe(
      'Our bench at Teleworld Solutions is read by the managers who staff its projects and by HR. Your seat (Validation Engineer) is neither.'
    )
  })

  it('a recruiter, who sells people, is not a manager of the firm’s own and does not read Our bench', () => {
    expect(reader({ permissions: ['consultants.read', 'submissions.create'], roleName: 'Recruiter' }).ok).toBe(false)
  })

  it('a consultant’s seat is pointed at their own page', () => {
    const v = reader({ consultantSeat: true })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toContain('your own page')
  })
})

describe('who manages a placement', () => {
  const seat = { permissions: MANAGER, orgUnitId: 'u-portland', unitIds: ['u-portland'], teamPersonIds: [] as string[] }

  it('a manager manages the lines of the project he sits on', () => {
    expect(managesLine(seat, { personId: 'felix', deliveryUnitId: 'u-portland' })).toBe(true)
  })

  it('a manager on another project cannot flag somebody on this one', () => {
    expect(managesLine({ ...seat, orgUnitId: 'u-sanjose', unitIds: ['u-sanjose'] }, { personId: 'felix', deliveryUnitId: 'u-portland' })).toBe(false)
  })

  it('a manager who names the person on his team manages them wherever the line sits', () => {
    expect(managesLine({ ...seat, orgUnitId: 'u-sanjose', unitIds: ['u-sanjose'], teamPersonIds: ['felix'] }, { personId: 'felix', deliveryUnitId: 'u-portland' })).toBe(true)
  })

  it('a line that names no project falls back to any manager at the firm, and never refuses', () => {
    expect(managesLine({ ...seat, orgUnitId: 'u-sanjose', unitIds: ['u-sanjose'] }, { personId: 'felix', deliveryUnitId: null })).toBe(true)
  })

  it('a manager who sits on no project is firm-wide', () => {
    expect(managesLine({ ...seat, orgUnitId: null, unitIds: [] }, { personId: 'felix', deliveryUnitId: 'u-portland' })).toBe(true)
  })

  it('a seat without the permission to move people manages nobody, wherever it sits', () => {
    expect(managesLine({ ...seat, permissions: ['consultants.read'] }, { personId: 'felix', deliveryUnitId: 'u-portland' })).toBe(false)
  })
})

describe('when somebody is free', () => {
  it('somebody flagged with no keep reads as free the day after they roll off', () => {
    expect(isoDay(freeFrom({ rollsOffOn: d('2026-10-19'), keepUntil: null }))).toBe('2026-10-20')
  })

  it('somebody kept until a date reads as free from that date', () => {
    expect(isoDay(freeFrom({ rollsOffOn: d('2026-10-26'), keepUntil: d('2026-11-15') }))).toBe('2026-11-15')
  })

  it('a flagged employee free within thirty days counts in matching', () => {
    expect(countsInMatching({ rollsOffOn: d('2026-10-19'), keepUntil: null }, TODAY)).toBe(true)
  })

  it('somebody kept past thirty days does not count in matching until their free date is inside the month', () => {
    const kept = { rollsOffOn: d('2026-10-20'), keepUntil: d('2026-11-15') }
    expect(countsInMatching(kept, TODAY)).toBe(false)
    expect(countsInMatching(kept, d('2026-10-16'))).toBe(true)
  })
})

describe('flagging somebody rolling off', () => {
  const base = {
    personName: 'Felix Brenner', clientName: 'Northbend Athletic', lineState: 'IN_PROGRESS',
    lineStart: d('2026-06-01'), lineEnd: d('2026-10-19'), rollsOffOn: d('2026-10-19'), keepUntil: null as Date | null,
    today: TODAY, manages: true,
  }

  it('a manager flags an employee rolling off on the last day of their placement', () => {
    const v = checkFlag(base)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(isoDay(v.freeOn)).toBe('2026-10-20')
      expect(v.early).toBe(false)
      expect(v.says).toBe('Felix Brenner comes off the Northbend Athletic project on Oct 19, 2026. Free from Oct 20, 2026.')
    }
  })

  it('a roll-off after the contract ends is refused, because a flag is not an extension', () => {
    const v = checkFlag({ ...base, rollsOffOn: d('2026-11-02') })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toContain('ends on Oct 19, 2026')
  })

  it('an early roll-off is allowed and says the contract is not shortened by it', () => {
    const v = checkFlag({ ...base, rollsOffOn: d('2026-10-09') })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.early).toBe(true)
      expect(v.says).toContain('it is not shortened by this')
    }
  })

  it('a day that has passed is refused', () => {
    expect(checkFlag({ ...base, rollsOffOn: d('2026-09-20') }).ok).toBe(false)
  })

  it('staying with me until a date before the roll-off day is refused', () => {
    const v = checkFlag({ ...base, keepUntil: d('2026-10-10') })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('KEEP_BEFORE_ROLLOFF')
  })

  it('a manager on another project is refused in a sentence naming whose project it is', () => {
    const v = checkFlag({ ...base, manages: false })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe('Felix Brenner is on a project you do not manage. The manager of the Northbend Athletic project flags who comes off it.')
  })

  it('a placement that is not running has nobody to roll off', () => {
    expect(checkFlag({ ...base, lineState: 'ENDED' }).ok).toBe(false)
  })
})

describe('reserving somebody for a position', () => {
  const base = {
    personName: 'Felix Brenner', callerId: 'rahul', releaserId: 'ingrid', standing: null,
    isManager: true, untilAsked: null as Date | null, hasPosition: true, today: TODAY,
  }

  it('a manager reserves somebody for two weeks unless he says otherwise', () => {
    const v = checkHold(base)
    expect(v.ok).toBe(true)
    if (v.ok) expect(isoDay(v.until)).toBe('2026-10-15')
    expect(HOLD_DAYS).toBe(14)
  })

  it('a second manager cannot reserve somebody already held, and is told who holds them and until when', () => {
    const v = checkHold({
      ...base, callerId: 'omar',
      standing: { heldById: 'rahul', heldByName: 'Rahul Deshpande', forTitle: 'ERP finance migration at Harlow Health', until: d('2026-10-15') },
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe(
      'Felix Brenner is held by Rahul Deshpande for ERP finance migration at Harlow Health until Oct 15, 2026. Ask Rahul Deshpande, or wait until then.'
    )
  })

  it('the releasing manager cannot hold their own person; they keep them with a date instead', () => {
    const v = checkHold({ ...base, callerId: 'ingrid' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toContain('staying with me until')
  })

  it('a hold longer than thirty days is refused, because it keeps the person from every other manager', () => {
    const v = checkHold({ ...base, untilAsked: d('2026-11-15') })
    expect(v.ok).toBe(false)
    expect(HOLD_DAYS_MAX).toBe(30)
  })

  it('HR is told of a hold and never takes one', () => {
    const v = checkHold({ ...base, isManager: false })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toContain('HR is told; it does not hold')
  })

  it('a hold with no position is refused', () => {
    expect(checkHold({ ...base, hasPosition: false }).ok).toBe(false)
  })

  it('a hold stands to the end of its own day and has run out the day after', () => {
    expect(holdStands({ until: d('2026-10-15'), live: 'LIVE' }, d('2026-10-15'))).toBe(true)
    expect(holdStands({ until: d('2026-10-15'), live: 'LIVE' }, d('2026-10-16'))).toBe(false)
    expect(holdStands({ until: d('2026-10-15'), live: null }, d('2026-10-10'))).toBe(false)
  })

  it('a hold is released only by whoever holds it or by the manager releasing the person', () => {
    expect(mayEndHold({ callerId: 'rahul', heldById: 'rahul', releaserId: 'ingrid' })).toBe(true)
    expect(mayEndHold({ callerId: 'ingrid', heldById: 'rahul', releaserId: 'ingrid' })).toBe(true)
    expect(mayEndHold({ callerId: 'omar', heldById: 'rahul', releaserId: 'ingrid' })).toBe(false)
  })
})

describe('confirming the day and placing', () => {
  it('only the releasing manager confirms the day somebody comes off', () => {
    const facts = { callerId: 'rahul', releaserId: 'ingrid', releaserName: 'Ingrid Solberg', personName: 'Felix Brenner', withdrawn: false, rollsOffOn: d('2026-10-19') }
    const v = checkConfirm(facts)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe('Ingrid Solberg is releasing Felix Brenner, so Ingrid Solberg confirms the day.')
    expect(checkConfirm({ ...facts, callerId: 'ingrid' }).ok).toBe(true)
  })

  const place = {
    personName: 'Felix Brenner', callerId: 'rahul',
    hold: { heldById: 'rahul', heldByName: 'Rahul Deshpande', until: d('2026-10-15'), live: 'LIVE' as string | null },
    release: { rollsOffOn: d('2026-10-19'), keepUntil: null as Date | null, confirmedAt: d('2026-10-01') as Date | null, releaserName: 'Ingrid Solberg' },
    latestLineEnd: d('2026-10-19') as Date | null, openEndedLine: false, startAsked: null as Date | null, today: TODAY,
  }

  it('the receiving manager places the person starting the day after the old line ends', () => {
    const v = checkPlace(place)
    expect(v.ok).toBe(true)
    if (v.ok) expect(isoDay(v.startsOn)).toBe('2026-10-20')
  })

  it('a flagged person cannot be placed until the releasing manager confirms the date', () => {
    const v = checkPlace({ ...place, release: { ...place.release, confirmedAt: null } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe('Ingrid Solberg has not confirmed the day Felix Brenner comes off. Ask them to confirm it, then place.')
  })

  it('only the manager holding somebody may place them', () => {
    const v = checkPlace({ ...place, callerId: 'omar' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe('Rahul Deshpande holds Felix Brenner, so Rahul Deshpande places them.')
  })

  it('nobody is placed without a hold', () => {
    expect(checkPlace({ ...place, hold: null }).ok).toBe(false)
  })

  it('somebody kept until a date starts on that date, not the day after the old line ends', () => {
    const v = checkPlace({ ...place, release: { ...place.release, keepUntil: d('2026-11-02') } })
    expect(v.ok).toBe(true)
    if (v.ok) expect(isoDay(v.startsOn)).toBe('2026-11-02')
  })

  it('a contract running past the flagged day blocks a placement, so one person is never on two lines on one day', () => {
    const v = checkPlace({ ...place, latestLineEnd: d('2026-12-31'), release: { ...place.release, rollsOffOn: d('2026-10-09') } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('STILL_ON_A_LINE')
  })

  it('a start earlier than the day after the old line ends is refused, and a later one is honored', () => {
    expect(checkPlace({ ...place, startAsked: d('2026-10-15') }).ok).toBe(false)
    const later = checkPlace({ ...place, startAsked: d('2026-10-26') })
    expect(later.ok && isoDay(later.startsOn)).toBe('2026-10-26')
  })

  it('somebody already between projects is placed from today with no confirmation to wait for', () => {
    const v = checkPlace({ ...place, release: null, latestLineEnd: d('2026-08-31') })
    expect(v.ok && isoDay(v.startsOn)).toBe('2026-10-01')
  })
})

describe('what people are told', () => {
  const facts = {
    personName: 'Felix Brenner', firmName: 'Teleworld Solutions', actorName: 'Rahul Deshpande',
    fromClient: 'Northbend Athletic', fromCity: 'Portland', toClient: 'Harlow Health', toCity: 'San Jose',
    forTitle: 'ERP finance migration at Harlow Health', startsOn: d('2026-10-20'), movedAs: 'LINE' as const,
    rollsOffOn: d('2026-10-19'), until: d('2026-10-15'),
  }

  it('the person is told of the move and the new city in so many words', () => {
    const n = personNotice('MOVE', facts)
    expect(n.title).toBe('Your next project: Harlow Health in San Jose, from Oct 20, 2026')
    expect(n.body).toContain('This moves you from Portland to San Jose.')
    expect(n.body).toContain('Your employer stays Teleworld Solutions')
  })

  it('a move within one city does not mention a city change', () => {
    expect(personNotice('MOVE', { ...facts, toCity: 'Portland' }).body).not.toContain('moves you from')
    expect(cityChange('Portland', 'portland')).toBeNull()
  })

  it('a city change nobody can stand behind is not said', () => {
    expect(cityChange(null, 'San Jose')).toBeNull()
    expect(cityOf('Remote')).toBeNull()
    expect(cityOf('San Jose, CA')).toBe('San Jose')
    expect(cityOf({ city: 'Portland' })).toBe('Portland')
  })

  it('the person is told they are held, and that nothing is decided yet — told, not asked', () => {
    const n = personNotice('HOLD', facts)
    expect(n.body).toContain('Nothing is decided yet')
    expect(n.body).not.toMatch(/\?/)
  })

  it('HR is told of every flag, hold, release and move, and is asked to approve none of them', () => {
    for (const step of ['FLAG', 'HOLD', 'HOLD_ENDED', 'CONFIRM', 'MOVE'] as const) {
      const n = hrNotice(step, facts)
      expect(n.title.length).toBeGreaterThan(0)
      expect(n.body).toMatch(/Nothing is asked of you|nothing waits on you/)
    }
    expect(hrNotice('MOVE', facts).body).toContain('changes city: Portland to San Jose')
  })

  it('the person is told no client sees that they are rolling off', () => {
    expect(personNotice('FLAG', facts).body).toContain('No client sees this.')
  })
})

describe('a row on Our bench', () => {
  const felix: OurBenchFacts = {
    personId: 'felix', name: 'Felix Brenner', seat: 'ERP Finance Consultant', skills: [], place: null,
    release: { id: 'r1', rollsOffOn: d('2026-10-19'), keepUntil: null, confirmedAt: null, releaserId: 'ingrid', releaserName: 'Ingrid Solberg' },
    current: { client: 'Northbend Athletic', city: 'Portland' }, mayNameProject: true, lastEnded: null,
    hold: null, moving: null, today: TODAY,
  }

  it('shows skills, place, free date, current project and the releasing manager', () => {
    const row = ourBenchRow(felix, { personId: 'rahul', as: 'MANAGER' })
    expect(row.status).toBe('ROLLING_OFF')
    expect(row.freeOnSays).toBe('Free from Oct 20, 2026')
    expect(row.project).toBe('Northbend Athletic, Portland')
    expect(row.releaser).toEqual({ id: 'ingrid', name: 'Ingrid Solberg' })
    expect(row.skillsSay).toBe('ERP Finance Consultant — no skills on record')
  })

  it('another manager may ask and reserve; the releasing manager may confirm and may not reserve', () => {
    expect(ourBenchRow(felix, { personId: 'rahul', as: 'MANAGER' }).may).toMatchObject({ ask: true, reserve: true, confirm: false, place: false })
    expect(ourBenchRow(felix, { personId: 'ingrid', as: 'MANAGER' }).may).toMatchObject({ ask: false, reserve: false, confirm: true })
  })

  it('HR reads the row and is offered nothing to do on it', () => {
    expect(ourBenchRow(felix, { personId: 'farah', as: 'HR' }).may).toEqual({ ask: false, reserve: false, endHold: false, confirm: false, place: false })
  })

  it('the holder is offered Place only once the releasing manager has confirmed', () => {
    const held = { ...felix, hold: { id: 'h1', heldById: 'rahul', heldByName: 'Rahul Deshpande', forTitle: 'ERP migration', until: d('2026-10-15') } }
    expect(ourBenchRow(held, { personId: 'rahul', as: 'MANAGER' }).may.place).toBe(false)
    const confirmed = { ...held, release: { ...held.release!, confirmedAt: TODAY } }
    expect(ourBenchRow(confirmed, { personId: 'rahul', as: 'MANAGER' }).may.place).toBe(true)
    expect(ourBenchRow(confirmed, { personId: 'omar', as: 'MANAGER' }).may.reserve).toBe(false)
  })

  it('a reader walled off another account reads "Another account", never the client’s name', () => {
    expect(ourBenchRow({ ...felix, mayNameProject: false }, { personId: 'rahul', as: 'MANAGER' }).project).toBe('Another account')
  })

  it('somebody kept until a date reads as kept, and free from that date', () => {
    const row = ourBenchRow({ ...felix, release: { ...felix.release!, keepUntil: d('2026-11-15') } }, { personId: 'rahul', as: 'MANAGER' })
    expect(row.status).toBe('KEPT')
    expect(row.freeOn).toBe('2026-11-15')
    expect(row.says).toContain('staying with Ingrid Solberg until Nov 15, 2026')
  })
})

describe('the rule underneath: nothing here assumes IT staffing', () => {
  it('the words of the moves library name no technology, skill or software term', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/internal-moves.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const word of ['developer', 'software', 'engineer', 'Java', 'SAP', 'IT staffing']) {
      expect(code.includes(word), word).toBe(false)
    }
  })
})
