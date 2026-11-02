import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { awardBody, AWARD_FIELDS_NOT_SENT } from '@/app/dashboard/submissions/award-body'
import { reasonAsked, unanswered, ANSWERED_IN } from '@/lib/award/reason-asked'
import { startOf } from '@/lib/award/hire-terms'
import { jobBody, JOB_FIELDS_NOT_SENT, type JobTyped } from '@/app/dashboard/requisitions/job-body'
import { panelFrom } from '@/app/api/requisitions/panel'
import { applyBody, reuseBody, type ApplyForm } from '@/app/apply/[token]/apply-body'

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

// ── The job request form and the raise ───────────────────────────────

const RAISE = readFileSync(join(process.cwd(), 'src/app/api/requisitions/route.ts'), 'utf8')
/** The fields the raise destructures from its body, by the name the body carries. */
const raiseReads = (() => {
  const from = RAISE.indexOf('const body = await request.json()')
  const block = RAISE.slice(RAISE.indexOf('const {', from) + 'const {'.length, RAISE.indexOf('} = body', from))
  return new Set(block.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join(' ').split(',')
    .map((x) => x.trim().split(':')[0].trim()).filter((x) => /^[a-zA-Z]+$/.test(x)))
})()
const JOB: JobTyped = {
  title: 'Line operator', skills: 'Forklift, Packaging', siteId: 'site_dayton', location: '',
  sendTo: ['brightmoor', 'veritan'], headcount: '2', budget: '48000', hoursPerWeek: '40',
  billMin: '28', billMax: '34', months: '6', neededBy: '2026-11-16', description: 'Second shift.',
  justification: 'Backfill for the Q4 line.', costCenterId: 'cc_ops', ownerId: 'p_marcus', panel: ['Marcus Hollins', ' Dana Whitfield ', 'Marcus Hollins'],
}

describe('every question the raise asks, the job request form has a field for, and nothing the form asks is thrown away', () => {
  it('every field the raise reads is one the job form sends, or is named with why the form never needs to', () => {
    // The reader found the raise's fields, so nothing passes on an empty list.
    for (const f of ['title', 'skills', 'locationId', 'sendTo', 'ownerId', 'interviewers', 'budget']) expect(raiseReads.has(f), f).toBe(true)
    const sent = new Set(Object.keys(jobBody(JOB)))
    const unoffered = [...raiseReads].filter((f) => !sent.has(f) && !(f in JOB_FIELDS_NOT_SENT))
    expect(unoffered).toEqual([])
  })

  it('every field the job form sends is one the raise reads, so no answer typed on the form is thrown away', () => {
    const unread = Object.keys(jobBody(JOB)).filter((f) => !raiseReads.has(f))
    expect(unread).toEqual([])
  })

  it('the interview panel typed on the job form reaches the job, each name once, the way an edit keeps it', () => {
    expect(jobBody(JOB).interviewers).toEqual(['Marcus Hollins', ' Dana Whitfield ', 'Marcus Hollins'])
    expect(panelFrom(jobBody(JOB).interviewers)).toEqual(['Marcus Hollins', 'Dana Whitfield'])
    expect(RAISE).toContain('...(panelFrom(interviewers) ? { interviewers: panelFrom(interviewers) } : {}),')
  })

  it('the title the form draws answers the raise’s one refusal for a missing field', () => {
    expect(RAISE).toContain("{ error: { code: 'VALIDATION', message: 'Title is required (min 3 characters)', field: 'title' } }")
    expect(String(jobBody(JOB).title).length).toBeGreaterThanOrEqual(3)
  })

  it('a job at a site sends the ticked suppliers, the field the site refusal names, and a job with no site sends none and its place in words', () => {
    expect(RAISE).toContain("field: 'sendTo'")
    expect(jobBody(JOB)).toMatchObject({ locationId: 'site_dayton', location: null, sendTo: ['brightmoor', 'veritan'] })
    const noSite = jobBody({ ...JOB, siteId: null, sendTo: null, location: 'Dayton, Ohio' })
    expect(noSite).toMatchObject({ locationId: null, location: 'Dayton, Ohio' })
    expect('sendTo' in noSite).toBe(false)
  })

  it('every rate typed in dollars on the job form reaches the raise in cents through the one reader', () => {
    expect(jobBody(JOB)).toMatchObject({ budget: 4_800_000, billMin: 2_800, billMax: 3_400, headcount: 2, hoursPerWeek: 40, months: 6 })
  })
})

// ── The supplier's apply page and its route ─────────────────────────

const APPLY = readFileSync(join(process.cwd(), 'src/app/api/supplier-apply/[token]/route.ts'), 'utf8')
const applyReads = new Set([
  ...[...APPLY.matchAll(/str\('([a-zA-Z]+)'\)/g)].map((m) => m[1]),
  ...[...APPLY.matchAll(/body\??\.([a-zA-Z]+)/g)].map((m) => m[1]),
])
const FORM: ApplyForm = {
  legalName: 'Tapin LLC', address: '12 Harbor Way, Portland, OR', duns: '08-146-6849', website: 'https://tapin.example',
  experience: 'Plant staffing since 2019.', skills: 'Packaging, Forklift', bankName: 'First Harbor', accountName: 'Tapin LLC', last4: '4821',
}
const REFS = [{ name: 'Dana Whitfield', company: 'Northbend Athletic', email: 'dana@northbend.example', phone: '' }, { name: '', company: '', email: '', phone: '' }]
const DATES = { INSURANCE_GL: { validFrom: '2026-10-01', validUntil: '2027-10-01' } }
const FILES = { INSURANCE_GL: { fileName: 'coi.pdf', size: 1200, type: 'application/pdf', content: 'JVBERi0xLjQK' } }

describe('every question the supplier’s apply route asks, the apply page has a field for, and nothing it asks is thrown away', () => {
  it('every field the apply route reads is one the page sends, on Send or on Send again', () => {
    for (const f of ['legalName', 'bank', 'docs', 'reuse', 'references', 'dates', 'duns']) expect(applyReads.has(f), f).toBe(true)
    const sent = new Set([...Object.keys(applyBody(FORM, REFS, DATES, FILES)), ...Object.keys(reuseBody([{ requestId: 'r1', key: 'W9' }], FORM, REFS, DATES))])
    expect([...applyReads].filter((f) => !sent.has(f))).toEqual([])
  })

  it('every field the page sends is one the apply route reads', () => {
    const unread = [...Object.keys(applyBody(FORM, REFS, DATES, FILES)), ...Object.keys(reuseBody([], FORM, REFS, DATES))].filter((f) => !applyReads.has(f))
    expect(unread).toEqual([])
  })

  it('a paper picked on the page is sent with the file itself, so the route never refuses it as arriving without the file', () => {
    expect(APPLY).toContain("code: 'FILE_REQUIRED'")
    const docs = applyBody(FORM, REFS, DATES, FILES).docs as { key: string; content: string; validFrom: string | null; validUntil: string | null }[]
    expect(docs).toEqual([expect.objectContaining({ key: 'INSURANCE_GL', content: 'JVBERi0xLjQK', validFrom: '2026-10-01', validUntil: '2027-10-01' })])
    expect(APPLY).toContain("bytes: typeof d?.content === 'string' && d.content ? Buffer.from(d.content, 'base64') : null,")
  })

  it('the bank the page draws is sent as the bank, the account name and four digits, the three the route records', () => {
    expect(applyBody(FORM, REFS, DATES, FILES).bank).toEqual({ bankName: 'First Harbor', accountName: 'Tapin LLC', last4: '4821' })
    expect(APPLY).toContain('bank?.bankName && bank.accountName && bank.last4.length === 4')
  })

  it('a blank reference pair the page draws is never sent as a reference', () => {
    expect(applyBody(FORM, REFS, DATES, FILES).references).toEqual([REFS[0]])
  })

  it('papers given to another client are sent again by their request and key, with the dates typed here', () => {
    expect(reuseBody([{ requestId: 'r1', key: 'INSURANCE_GL' }], FORM, REFS, DATES)).toMatchObject({ reuse: [{ requestId: 'r1', key: 'INSURANCE_GL' }], dates: DATES })
  })
})
