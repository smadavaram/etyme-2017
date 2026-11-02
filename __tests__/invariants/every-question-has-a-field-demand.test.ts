import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { awardBody, AWARD_FIELDS_NOT_SENT } from '@/app/dashboard/submissions/award-body'
import { reasonAsked, unanswered, ANSWERED_IN } from '@/lib/award/reason-asked'
import { startOf } from '@/lib/award/hire-terms'

/**
 * Every question the award asks, the Place dialog has a field for.
 *
 * The same join regulatory's `every-question-has-a-field.test.ts` holds
 * for Document requests (the founder's I-9 bug, 2026-11-01): the dialog's
 * fields are filled in, exactly what it posts is built (`awardBody`), and
 * the award's own rules are run on it. A refusal naming a field the dialog
 * never offers fails here.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/submissions/[id]/award/route.ts'), 'utf8')
const NOW = new Date('2026-11-02T15:00:00Z')
const TODAY = '2026-11-02'
const read = (body: Record<string, unknown>) => startOf({
  typed: body.startDate ? new Date(String(body.startDate)) : null,
  neededBy: null,
  now: NOW,
  underWay: body.workUnderWay === true,
  reason: typeof body.underWayReason === 'string' ? body.underWayReason : null,
})

describe('every question the award asks, the Place dialog has a field for', () => {
  it('every field the award reads from its body is one the dialog sends, or is named with why the dialog never needs to', () => {
    const read = new Set([...ROUTE.matchAll(/body\??\.([a-zA-Z]+)/g)].map((m) => m[1]))
    const sendable = new Set([
      ...Object.keys(awardBody({ cents: 9_000, startDate: '2026-10-20', before: true, underWay: true, why: 'Started on a handshake.' }, {}, {})),
      ...Object.values(ANSWERED_IN).flatMap((a) => [a.field, ...Object.keys(a.with ?? {})]),
    ])
    const unoffered = [...read].filter((f) => !sendable.has(f) && !(f in AWARD_FIELDS_NOT_SENT))
    expect(unoffered).toEqual([])
  })

  it('a start on or after today, with the rate and the day filled in, is taken by the award’s own rule as the day typed', () => {
    const body = awardBody({ cents: 9_000, startDate: '2026-11-09', before: false, underWay: false, why: '' }, {}, {})
    expect(body).toEqual({ rate: 9_000, startDate: '2026-11-09' })
    const v = read(body)
    expect(v.ok && v.start.toISOString().slice(0, 10)).toBe('2026-11-09')
  })

  it('a start before today draws the tick and its box, and with both filled the award’s own rule takes it as work already under way', () => {
    const body = awardBody({ cents: 9_000, startDate: '2026-10-20', before: '2026-10-20' < TODAY, underWay: true, why: 'Started on a handshake.' }, {}, {})
    expect(body).toMatchObject({ workUnderWay: true, underWayReason: 'Started on a handshake.' })
    const v = read(body)
    expect(v.ok && v.underWay).toEqual({ reason: 'Started on a handshake.' })
  })

  it('when the award says the work started before it and gives no why, the box the dialog draws sends the why and the tick the rule needs', () => {
    const refusal = read({ startDate: '2026-10-20', workUnderWay: true })
    expect(refusal.ok).toBe(false)
    const q = reasonAsked(refusal.ok ? null : { code: refusal.code, message: refusal.says })!
    expect(q.field).toBe('underWayReason')
    const asked = { [q.field]: q }
    expect(unanswered(asked, {})).toBe(true)
    const body = awardBody({ cents: 9_000, startDate: '2026-10-20', before: true, underWay: false, why: '' }, asked, { underWayReason: 'Started on a handshake.' })
    expect(read(body).ok).toBe(true)
  })

  it('when the award warns past the time limit, the box the dialog draws sends the field the award reads the reason from', () => {
    const q = reasonAsked({ code: 'TIME_LIMIT_REASON', message: 'Ravi Kalathil reaches the time limit on Mar 4, 2027. Give a reason to go ahead.', field: 'limitReason' })!
    const body = awardBody({ cents: 9_000, startDate: '2026-11-09', before: false, underWay: false, why: '' }, { [q.field]: q }, { limitReason: 'Covering a release.' })
    expect(body.limitReason).toBe('Covering a release.')
    expect(ROUTE).toContain("const limitReason = typeof body.limitReason === 'string' ? body.limitReason.trim() : ''")
  })

  it('the dialog never sends a pay rate, which the award refuses from the buyer', () => {
    const body = awardBody({ cents: 9_000, startDate: '2026-11-09', before: false, underWay: false, why: '' }, {}, {})
    expect('payRate' in body).toBe(false)
    expect(ROUTE).toMatch(/if \(body\?\.payRate !== undefined && body\?\.payRate !== null\)/)
  })
})
