import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DECIDE_OVERTIME_FIELDS,
  decideOvertimeBody,
  flagReasonAsked,
  refusalOpens,
} from '@/app/dashboard/timesheets/decide-overtime-body'
import { ACCEPT_FEWER_FIELDS } from '@/app/api/timesheets/accept-fewer'
import { flagAsksReason, flaggedWeekSays, timesheetFlag } from '@/lib/timesheet-flag'

/**
 * Walk tpd, 2026-11-14, trace 7d. A client pressed "Overtime to decide" on
 * a 46-hour week on a 40-hour job. The approve route asked "Say why this
 * week is right before you sign it", and the dialog had no box to say it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = 'src/app/api/timesheets/[id]/approve/route.ts'
const DIALOG = 'src/app/dashboard/timesheets/decide-overtime.tsx'
const PAGE = 'src/app/dashboard/timesheets/page.tsx'

const flag = timesheetFlag({ hours: 46, hoursPerWeek: 40, periodEnd: new Date('2026-11-07T00:00:00Z'), contractEnd: null })!

/** The route's own rule, as it reads the body the dialog sends. */
function routeAsksReason(body: { note?: string }): boolean {
  const reasonGiven = typeof body.note === 'string' ? body.note.trim() : ''
  return !!flag && !reasonGiven && flagAsksReason({ belowTop: false, clientSignedAt: null })
}

const answered = [{ weekOf: '2026-11-01', treatment: 'PREMIUM' as const, multiplierBps: 15_000, reason: '' }]

describe('the overtime dialog asks the reason a flagged week needs', () => {
  it('a flagged week opened from "Overtime to decide" draws a reason box in the dialog', () => {
    expect(flagReasonAsked({ flag, flagAsksReason: true, note: null })).toBe(flag)
  })

  it('the reason typed in the overtime dialog is sent as the note, so the client is not refused for a missing reason', () => {
    const body = decideOvertimeBody({ note: null, flagReason: 'Go-live weekend, agreed with the account manager', answers: answered })
    expect(body.note).toBe('Go-live weekend, agreed with the account manager')
    expect(routeAsksReason(body)).toBe(false)
  })

  it('without a reason typed, the route still refuses the flagged week in its own sentence', () => {
    const body = decideOvertimeBody({ note: null, flagReason: '', answers: answered })
    expect(routeAsksReason(body)).toBe(true)
    expect(flaggedWeekSays(flag)).toContain('Say why this week is right before you sign it')
  })

  it('a reason already given in "Approve anyway" is kept and the dialog does not ask again', () => {
    expect(flagReasonAsked({ flag, flagAsksReason: true, note: 'Agreed with the hiring manager' })).toBeNull()
    const body = decideOvertimeBody({ note: 'Agreed with the hiring manager', flagReason: '', answers: answered })
    expect(body.note).toBe('Agreed with the hiring manager')
  })

  it('a firm below the client is not asked for the reason the client already gave', () => {
    expect(flagReasonAsked({ flag, flagAsksReason: false, note: null })).toBeNull()
  })

  it('a week that is not flagged draws no reason box', () => {
    expect(flagReasonAsked({ flag: null, flagAsksReason: true, note: null })).toBeNull()
  })

  it('a refusal asking for the reason opens the reason box with what is wrong with the week', () => {
    expect(refusalOpens({ code: 'FLAG_NEEDS_REASON', field: 'note', flag, message: flaggedWeekSays(flag) } as never))
      .toEqual({ box: 'flagReason', says: flag })
  })

  it('a refusal asking why one week differs from the contract opens that week\'s reason box', () => {
    expect(refusalOpens({ field: 'reason', weekOf: '2026-11-01' })).toEqual({ box: 'weekReason', weekOf: '2026-11-01' })
  })

  it('every refusal the approve route names a field for has a field on the overtime dialog', () => {
    const src = read(ROUTE)
    const named = new Set<string>()
    for (const m of src.matchAll(/field:\s*'([A-Za-z]+)'/g)) named.add(m[1])
    // The accepted-hours check names its fields through its own constants.
    if (src.includes('field: accepted.field')) for (const f of Object.values(ACCEPT_FEWER_FIELDS)) named.add(f)
    expect(named.size).toBeGreaterThan(0)
    const offered = new Set<string>(Object.values(DECIDE_OVERTIME_FIELDS))
    for (const f of named) expect(offered.has(f), `the route refuses under "${f}" and the dialog has no field for it`).toBe(true)
  })

  it('the Timesheets row passes the week\'s flag into the overtime dialog, and the dialog draws the box', () => {
    expect(read(PAGE)).toContain('flag: row.flag,')
    expect(read(PAGE)).toContain('flag={deciding.flag ?? null}')
    const dialog = read(DIALOG)
    expect(dialog).toContain('id="overtime-flag-reason"')
    expect(dialog).toContain('decideOvertimeBody(')
    expect(dialog).toContain('refusalOpens(body.error)')
  })
})
