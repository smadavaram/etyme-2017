import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { roundBody, mayPress, ROUND_FIELDS_NOT_SENT, type RoundTyped } from '@/app/dashboard/interviews/round-body'
import { roundAsks } from '@/lib/interviews'

/**
 * Every question a round asks, the interviews page has a field for.
 *
 * The same join demand holds for the Place dialog and regulatory for
 * Document requests (the founder's I-9 bug, 2026-11-01): each control the
 * interviews page draws is filled in, exactly what it posts is built
 * (`roundBody`), and the round route's own rule (`roundAsks`) is run on
 * it. A refusal naming a field the page never offers fails here, and so
 * does a field the route reads that nothing sends.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/interviews/[id]/route.ts'), 'utf8')
const RULE = readFileSync(join(process.cwd(), 'src/lib/interviews.ts'), 'utf8')
const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/interviews/page.tsx'), 'utf8')

/** Every control on the page, filled in the way a person fills it. */
const FILLED: readonly RoundTyped[] = [
  { act: 'CONFIRM', slotStart: '2026-11-04T15:00:00.000Z' },
  { act: 'NO_SHOW' },
  { act: 'OUTCOME', outcome: 'ADVANCE', feedback: '' },
  { act: 'OUTCOME', outcome: 'OFFER', feedback: 'Strong on the plant floor.' },
  { act: 'OUTCOME', outcome: 'REJECT', feedback: 'Has not run a second shift.' },
  { act: 'PANEL_ADD', name: 'Dana Whitfield' },
  { act: 'PANEL_REMOVE', name: 'Dana Whitfield' },
  { act: 'CANCEL', reason: 'The hiring manager is out sick; new times tomorrow.' },
]
const SENDABLE = new Set(FILLED.flatMap((t) => Object.keys(roundBody(t))))
/** A refusal's field and the control on the page that answers it, where the names differ. */
const ANSWERED_BY: Readonly<Record<string, string>> = { interviewers: 'add' }

describe('every question a round asks, the interviews page has a field for', () => {
  it('every field the round route and its rule read from the body is one the interviews page sends, or is named with why it never needs to', () => {
    const read = new Set([
      ...[...ROUTE.matchAll(/body\??\.([a-zA-Z]+)/g)].map((m) => m[1]),
      ...[...RULE.slice(RULE.indexOf('export function roundAsks')).matchAll(/\bb\.([a-zA-Z]+)/g)].map((m) => m[1]),
    ])
    // The reader found the route's fields, so nothing passes on an empty list.
    for (const f of ['action', 'slotStart', 'reason', 'add', 'remove', 'outcome', 'feedback', 'noShowBy']) expect(read.has(f), f).toBe(true)
    const unoffered = [...read].filter((f) => !SENDABLE.has(f) && !(f in ROUND_FIELDS_NOT_SENT))
    expect(unoffered).toEqual([])
  })

  it('every refusal the round’s rule gives for a missing answer names a field the interviews page draws', () => {
    const missing: Record<string, unknown>[] = [
      {}, { action: 'cancel' }, { action: 'interviewers' }, { action: 'outcome' },
      { action: 'outcome', outcome: 'REJECT' }, { action: 'outcome', noShowBy: 'NOBODY' },
    ]
    const fields = missing.map((b) => roundAsks(b)?.field)
    expect(fields).toEqual(['action', 'reason', 'interviewers', 'outcome', 'feedback', 'noShowBy'])
    for (const f of fields) expect(SENDABLE.has(ANSWERED_BY[f!] ?? f!), f).toBe(true)
  })

  it('every control on the page, filled in the way a person fills it, is taken by the round’s own rule', () => {
    for (const t of FILLED) expect(roundAsks(roundBody(t)), t.act).toBeNull()
  })

  it('a rejection or a call-off with no reason is never pressable on the page, and the rule refuses it for the very box the page draws', () => {
    const reject: RoundTyped = { act: 'OUTCOME', outcome: 'REJECT', feedback: ' ' }
    expect(mayPress(reject)).toBe(false)
    expect(roundAsks(roundBody(reject))?.field).toBe('feedback')
    const off: RoundTyped = { act: 'CANCEL', reason: 'no' }
    expect(mayPress(off)).toBe(false)
    expect(roundAsks(roundBody(off))?.field).toBe('reason')
    expect(PAGE).toContain("disabled={busy === r.id || !mayPress({ act: 'OUTCOME', outcome: o, feedback })}")
    expect(PAGE).toContain("disabled={busy === r.id || !mayPress({ act: 'CANCEL', reason: offReason })}")
  })

  it('a round can be called off from the page with its reason, by either side while it is still ahead, and never once it is over', () => {
    expect(PAGE).toContain("(r.state === 'PROPOSED' || r.state === 'CONFIRMED') && (r.you === 'VENDOR' || (r.you === 'CLIENT' && mayDecide))")
    const cancel = ROUTE.slice(ROUTE.indexOf("if (action === 'cancel')"), ROUTE.indexOf("if (action === 'interviewers')"))
    expect(cancel).toMatch(/row\.state === 'CANCELLED' \|\| row\.state === 'DONE' \|\| row\.state === 'NO_SHOW'/)
    expect(cancel).toContain('That round is already over. Calling it off now would rewrite it.')
    expect(cancel).toContain('if (isClient && !mayDecide) return notHiring()')
  })

  it('the round route refuses a body by the one rule the page is tested against, and every act on the page goes through the one body builder', () => {
    expect(ROUTE.match(/roundAsks\(body\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(PAGE).not.toMatch(/act\(r\.id, \{ action:/)
    expect(PAGE).toContain('const payload = roundBody(typed)')
  })
})

// ── The answer link, for a supplier with no account (the second screen walk, 2026-11-03) ──

import { sponsorshipLine } from '@/lib/answers'

describe('the answer link says a job’s sponsorship in words', () => {
  it('a supplier answering a job reads its sponsorship line in words, never a code', () => {
    expect(sponsorshipLine({ workAuthRequired: 'NEEDS_NO_SPONSOR', workAuthCite: 'We do not sponsor work visas for this role' }))
      .toBe('This job offers no sponsorship: ‘We do not sponsor work visas for this role’. Anybody already allowed to work in the US may apply.')
    expect(sponsorshipLine({ workAuthRequired: 'NEEDS_NO_SPONSOR', workAuthCite: null }))
      .toBe('This job offers no sponsorship. Anybody already allowed to work in the US may apply.')
    expect(sponsorshipLine({ workAuthRequired: 'US_CITIZEN', workAuthCite: 'FAR 52.204-2' })).toBe('This job asks for a US citizen: ‘FAR 52.204-2’.')
    expect(sponsorshipLine({ workAuthRequired: null })).toBeNull()
    for (const code of ['NEEDS_NO_SPONSOR', 'US_CITIZEN', 'H1B', 'SOMETHING_NEW']) {
      expect(sponsorshipLine({ workAuthRequired: code })).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/)
    }
    // The page and the route never print the column itself.
    const page = readFileSync(join(process.cwd(), 'src/app/answer/[token]/page.tsx'), 'utf8')
    const route = readFileSync(join(process.cwd(), 'src/app/api/answer/[token]/route.ts'), 'utf8')
    expect(page).not.toMatch(/workAuthRequired/)
    expect(route).toMatch(/sponsorship: sponsorshipLine\(i\.requirement\)/)
    expect(route).not.toMatch(/workAuthRequired: i\.requirement\.workAuthRequired/)
  })

  it('a CV pasted through the answer link writes the person’s education lines onto their profile', () => {
    // Through supply's one write (lib/consultant-portfolio/education-write), after the profile is found or made.
    const route = readFileSync(join(process.cwd(), 'src/app/api/answer/[token]/route.ts'), 'utf8')
    const made = route.indexOf('const profile =')
    const written = route.indexOf('await recordResumeEducation(profile.id, read.education)')
    expect(made).toBeGreaterThan(-1)
    expect(written).toBeGreaterThan(made)
    expect(route).toMatch(/from '@\/lib\/consultant-portfolio\/education-write'/)
  })
})
