import { describe, it, expect } from 'vitest'
import { TEMPLATE_PACKS, type CycleDefinition } from '@/lib/template-packs'
import { generateCycles } from '@/lib/cycle-generator'
import { periodFor } from '@/lib/periods'
import { categoryOf } from '@/lib/cycle-kinds'

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

// ── The same two questions, one frequency up ──────────────────────────
//
// The monthly analogue of "every start weekday" is every start day of
// the month, 1 to 28 — 28 rather than 31 because a contract starting on
// the 29th of January is a different question (its own anniversary
// clamps) and because `dayOfMonth: 28` already means month-end.
//
// Added 2026-09-26 with the two monthly changes in `lib/template-packs`.
// Both were measured against `lib/periods` before either was applied,
// after a relayed number about this pack turned out to be wrong. Nothing
// below pins a date the packs produce; every assertion asks
// `lib/periods` what a month of work is and compares.

/** A twenty-four month contract starting on day `s` of January 2026. */
function months24From(s: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(2026, 0, s))
  return { start, end: new Date(Date.UTC(2026, 24, s - 1)) }
}

/**
 * Every month of work this contract closes, as `lib/periods` defines a
 * month — the ones whose last day falls inside the contract.
 *
 * A contract ending on the 11th has eleven days of a final month that no
 * regular cycle closes, and that is the trailing-partial period CLAUDE.md
 * records as deliberate and blocked on a schema column. It is a different
 * question from this one and is not smuggled in here.
 */
function monthsClosedBy(start: Date, end: Date) {
  const out: { start: Date; end: Date; label: string }[] = []
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cursor <= end) {
    const month = periodFor(cursor, {
      frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'END', startedOn: start,
    })
    if (month.end >= start && month.end <= end) out.push(month)
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }
  return out
}

describe('a month is signed off after its hours are filed, never before', () => {
  const monthly = ALL.flatMap((pack) => {
    const submit = pack.cycleDefinitions.find((d) => d.kind === 'TIMESHEET_SUBMIT')
    const approve = pack.cycleDefinitions.find((d) => d.kind === 'TIMESHEET_APPROVE')
    return submit && approve && submit.frequency === 'MONTHLY' && approve.frequency === 'MONTHLY'
      ? [{ id: pack.id, submit, approve }]
      : []
  })

  it('finds the packs that run a monthly timesheet at all', () => {
    expect(monthly.map((m) => m.id).sort()).toEqual(['IN_DELIVERY'])
  })

  it('never asks anybody to approve a month before its hours are filed, whatever day of the month the contract starts', () => {
    // The defect this replaces bit on exactly one start day in
    // twenty-eight — the 1st, which is the natural start for a monthly
    // India or UK engagement. There a `dayOfMonth: 1` approval series
    // ran a whole month ahead of the hours: all twenty-four approvals
    // landed before the submission they were paired with.
    const offenders: string[] = []
    for (const m of monthly) {
      for (let day = 1; day <= 28; day++) {
        const { start, end } = months24From(day)
        const hours = datesFor(m.submit, start, end)
        const approvals = datesFor(m.approve, start, end)
        for (let i = 0; i < hours.length; i++) {
          if (approvals[i] && approvals[i] < hours[i]) {
            offenders.push(`${m.id}: starting ${iso(start)}, approval ${iso(approvals[i])} before hours ${iso(hours[i])}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('asks for exactly as many monthly approvals as there are months of hours', () => {
    for (const m of monthly) {
      for (let day = 1; day <= 28; day++) {
        const { start, end } = months24From(day)
        expect(
          datesFor(m.approve, start, end).length,
          `${m.id}, starting ${iso(start)}`
        ).toBe(datesFor(m.submit, start, end).length)
      }
    }
  })

  it('gives the last month of a contract an approval date, so the final hours can be signed', () => {
    for (const m of monthly) {
      for (let day = 1; day <= 28; day++) {
        const { start, end } = months24From(day)
        const hours = datesFor(m.submit, start, end)
        const approvals = datesFor(m.approve, start, end)
        expect(
          approvals[approvals.length - 1] >= hours[hours.length - 1],
          `${m.id}, starting ${iso(start)}`
        ).toBe(true)
      }
    }
  })

  it('never asks for a month of hours and their sign-off on the same day', () => {
    // The reason the founder was shown when he chose three days rather
    // than one, 2026-09-26. Under the shipped dates a third of all
    // approvals fell on the same calendar day as the hours they approve —
    // 216 of 672 — because a Saturday month-end shifts forward onto the
    // same Monday the 1st shifts forward onto, and a client is asked to
    // sign work that has only just landed. Month-end plus one is no
    // better (224 of 672); plus three has none.
    for (const m of monthly) {
      for (let day = 1; day <= 28; day++) {
        const { start, end } = months24From(day)
        const hours = datesFor(m.submit, start, end).map(iso)
        const collisions = datesFor(m.approve, start, end).map(iso).filter((d) => hours.includes(d))
        expect(collisions, `${m.id}, starting ${iso(start)}`).toEqual([])
      }
    }
  })
})

describe('a month is invoiced once it has ended, and never before it has begun', () => {
  const monthlyMoney = ALL.flatMap((pack) =>
    pack.cycleDefinitions
      .filter((d) => d.frequency === 'MONTHLY' && (d.kind === 'INVOICE_GENERATE' || d.kind === 'VENDOR_BILL_GENERATE'))
      .map((d) => ({ id: pack.id, def: d }))
  )

  it('finds the monthly money cycles the packs ship', () => {
    expect(
      monthlyMoney.map((m) => `${m.id} ${m.def.kind}`).sort()
    ).toEqual(['IN_DELIVERY INVOICE_GENERATE', 'UK INVOICE_GENERATE', 'UK VENDOR_BILL_GENERATE'])
  })

  it('asks for exactly one money date for every month the contract closes', () => {
    // So a month is neither billed twice nor left unbilled, whatever day
    // of the month the contract starts on. The two sentences below are
    // what say the date is in the right place; this one says there is one
    // of it per month, which is what lets them pair by index at all.
    for (const { id, def } of monthlyMoney) {
      for (const day of [1, 12, 28]) {
        const { start, end } = months24From(day)
        expect(
          datesFor(def, start, end).length,
          `${id} ${def.kind}, starting ${iso(start)}`
        ).toBe(monthsClosedBy(start, end).length)
      }
    }
  })

  it('bills every month of work on or after the day that month ends', () => {
    // A BILL kind shifts forward off a weekend, so its date can only
    // ever land later than the period end — which makes this the strict
    // form of the sentence, and the one that catches the head. Shipped,
    // none of the twelve dates on a twelve-month contract satisfied it:
    // every one fell inside the month it would close, thirty days early,
    // and the first of them — 1 January — billed nothing at all.
    for (const { id, def } of monthlyMoney) {
      if (categoryOf(def.kind) !== 'BILL') continue
      for (const day of [1, 12, 28]) {
        const { start, end } = months24From(day)
        const months = monthsClosedBy(start, end)
        const dates = datesFor(def, start, end)
        for (let i = 0; i < months.length; i++) {
          expect(
            dates[i] >= months[i].end,
            `${id} ${def.kind}: ${iso(dates[i])} closes ${months[i].label}, which ends ${iso(months[i].end)}`
          ).toBe(true)
        }
      }
    }
  })

  it("never dates a supplier's invoice in the month before the work it bills for", () => {
    // A PAY kind shifts BACKWARD off a weekend, which is the company's
    // own setting and correct for a pay day. Anchored on the 1st it was
    // not correct: six of twenty-four UK vendor bills were recorded in
    // the month before the work — 30 January 2026 for a February that
    // had not begun. Anchored on month-end the backward shift can still
    // pull a date a day or two earlier, but never out of the month whose
    // work it bills, which is the honest form of this sentence.
    for (const { id, def } of monthlyMoney) {
      for (const day of [1, 12, 28]) {
        const { start, end } = months24From(day)
        const months = monthsClosedBy(start, end)
        const dates = datesFor(def, start, end)
        for (let i = 0; i < months.length; i++) {
          expect(
            dates[i] >= months[i].start,
            `${id} ${def.kind}: ${iso(dates[i])} bills ${months[i].label}, which had not begun`
          ).toBe(true)
        }
      }
    }
  })
})
