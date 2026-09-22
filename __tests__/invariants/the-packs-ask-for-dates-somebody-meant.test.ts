import { describe, it, expect } from 'vitest'
import { TEMPLATE_PACKS, type CycleDefinition } from '@/lib/template-packs'
import { generateCycles } from '@/lib/cycle-generator'
import { periodFor } from '@/lib/periods'

/**
 * The dates the shipped packs ask for, run against the calendar.
 *
 * Two of them were wrong for the life of the product and no test said
 * so — the packs' own tests check that a pack is self-consistent, and
 * the generator's tests check that it honors what it is given, which it
 * always did. Nothing asked whether what it was given was what anybody
 * meant.
 *
 * Both were found on a walk, measured by `etyme-money` against the
 * calendar and the seeded world, and changed on 2026-09-22. These are
 * the sentences that stop them coming back.
 */

const ALL = Object.values(TEMPLATE_PACKS)
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** A quarter, from each of the seven days a contract can start on. */
function quarterFrom(weekday: number): { start: Date; end: Date } {
  // 11 October 2026 is a Sunday, so +weekday walks Sunday to Saturday.
  const start = new Date(Date.UTC(2026, 9, 11 + weekday))
  return { start, end: new Date(Date.UTC(2026, 11, 31)) }
}

function datesFor(def: CycleDefinition, start: Date, end: Date): Date[] {
  return generateCycles(start, end, [def]).map((c) => c.dueOn)
}

describe('an approval is three days after the hours, never before them', () => {
  const weekly = ALL.flatMap((pack) => {
    const submit = pack.cycleDefinitions.find((d) => d.kind === 'TIMESHEET_SUBMIT')
    const approve = pack.cycleDefinitions.find((d) => d.kind === 'TIMESHEET_APPROVE')
    return submit && approve && submit.frequency === 'WEEKLY' && approve.frequency === 'WEEKLY'
      ? [{ id: pack.id, submit, approve }]
      : []
  })

  it('finds the packs that run a weekly timesheet at all', () => {
    expect(weekly.map((w) => w.id).sort()).toEqual(['UK', 'US_IT', 'US_SAP'])
  })

  it('never asks anybody to approve a week before it has been submitted, whatever day the contract starts', () => {
    // The defect this replaces: a second weekly series anchored on its
    // own Monday, so a contract starting Saturday, Sunday or Monday —
    // three of seven, and Monday is the commonest start in staffing —
    // got an approval date four days before its first submission. It is
    // never claimed by anything, and the placement timeline calls it
    // overdue for the life of the contract.
    const offenders: string[] = []
    for (const w of weekly) {
      for (let day = 0; day < 7; day++) {
        const { start, end } = quarterFrom(day)
        const first = datesFor(w.submit, start, end)[0]
        const firstApproval = datesFor(w.approve, start, end)[0]
        if (firstApproval < first) {
          offenders.push(`${w.id}: starting ${iso(start)}, approval ${iso(firstApproval)} before hours ${iso(first)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('asks for exactly as many approvals as there are weeks of hours', () => {
    for (const w of weekly) {
      for (let day = 0; day < 7; day++) {
        const { start, end } = quarterFrom(day)
        expect(
          datesFor(w.approve, start, end).length,
          `${w.id}, starting ${iso(start)}`
        ).toBe(datesFor(w.submit, start, end).length)
      }
    }
  })

  it('gives the last week of a contract an approval date, so the final hours can be signed', () => {
    // A Monday-anchored series stopped at the last Monday inside the
    // contract, so the final week's hours had nothing to be approved on.
    for (const w of weekly) {
      for (let day = 0; day < 7; day++) {
        const { start, end } = quarterFrom(day)
        const hours = datesFor(w.submit, start, end)
        const approvals = datesFor(w.approve, start, end)
        expect(
          approvals[approvals.length - 1] >= hours[hours.length - 1],
          `${w.id}, starting ${iso(start)}`
        ).toBe(true)
      }
    }
  })
})

describe('a cycle date is the end of a period, never the first day of it', () => {
  const semimonthly = ALL.flatMap((pack) =>
    pack.cycleDefinitions
      .filter((d) => d.frequency === 'SEMIMONTHLY')
      .map((d) => ({ id: pack.id, def: d }))
  )

  it('finds the semimonthly money cycles the packs ship', () => {
    expect(semimonthly.length).toBeGreaterThan(0)
  })

  it('cuts on the 15th and month-end, which is what lib/periods says a semimonthly period ends on', () => {
    // The decisive argument is not the gaps, it is `periodFor`: a
    // semimonthly contract bills the 1st to the 15th and the 16th to
    // the last. The 1st matches no period end at all — it asked for an
    // invoice fourteen days before the hours it would bill existed, and
    // the 1st-to-15th period was never closed by a cycle.
    for (const { id, def } of semimonthly) {
      const dates = datesFor(def, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31)))
      for (const d of dates) {
        // Every date is a period end, or the working day a weekend
        // boundary was moved onto — which is the company's own setting
        // in `lib/cycle-shift` and can move a date either way by up to
        // two days. The 1st was neither: it was the first day of the
        // period it would bill, a fortnight from the end of it.
        const near = [-2, -1, 0, 1, 2].some((offset) => {
          const at = new Date(d.getTime() + offset * 86_400_000)
          const period = periodFor(at, { frequency: 'SEMIMONTHLY', anchor: 'CALENDAR', straddle: 'END', startedOn: at })
          return iso(period.end) === iso(at)
        })
        expect(near, `${id} ${def.kind} on ${iso(d)}`).toBe(true)
      }
    }
  })

  it('asks for twenty-four dates a year rather than twenty, with a fortnight between them', () => {
    for (const { id, def } of semimonthly) {
      const dates = datesFor(def, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31)))
      expect(dates.length, id).toBe(24)
      const gaps = dates.slice(1).map((d, i) => Math.round((+d - +dates[i]) / 86_400_000))
      // The old cut gave gaps of one and three days, then a month.
      expect(Math.min(...gaps), id).toBeGreaterThanOrEqual(13)
      expect(Math.max(...gaps), id).toBeLessThanOrEqual(19)
    }
  })
})
