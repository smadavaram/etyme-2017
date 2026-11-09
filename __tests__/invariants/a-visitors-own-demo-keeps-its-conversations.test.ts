import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { keptFor, NOT_KEPT_IN_DEMO, NOT_KEPT_IN_SAMPLE, KEEP_ONE_AT, type ThreadSeat } from '@/lib/ask-etyme-thread'
import { CLIENT_SIGN_UP } from '@/lib/public-site/skeleton-words'

/**
 * Walk 8, item 12 (2026-11-09). A visitor's own demo, made by the demo
 * door for that one visitor (`POST /api/demo` with a side), answered
 * "This conversation is not kept … Open your own demo to keep one." Its
 * seat is `<handle>@demo.etyme.local`, and `keptFor` read every address
 * at a domain nobody can register as a seat other visitors share. So no
 * seat a visitor could open kept a conversation, and the advice pointed
 * back at itself.
 *
 * The rule: a visitor's own sandbox keeps its conversations; a seat many
 * visitors share (the seeded world the demo page opens for anybody, and
 * the home page's read-only sample) keeps none. The two are told apart
 * by the record (the seat's company is a visitor's sandbox), never by
 * the address alone. And the advice names a door that keeps one.
 */

const RESERVED = 'a1b2c3d4e5f6@demo.etyme.local'
const sandbox = { id: 'co-sandbox', name: 'Oxford Corp', isDemo: true }
const world = { id: 'co-world', name: 'Pinnacle Staffing', isDemo: false }

const seat = (over: Partial<ThreadSeat> & { email?: string } = {}): ThreadSeat => {
  const { email, ...rest } = over
  return { person: { id: 'p1', primaryEmail: email ?? RESERVED }, company: sandbox, ...rest }
}

describe('a visitor’s own demo keeps its conversations, and a shared seat keeps none', () => {
  it('a visitor’s own demo keeps its conversations: a seat at a reserved address in the sandbox the demo door made is kept', () => {
    expect(keptFor(seat())).toEqual({ kept: true })
  })

  it('a candidate’s own demo keeps hers too, because her seat is at the agency the demo door made for her', () => {
    const agency = { id: 'co-agency', name: 'Brightline Talent', isDemo: true }
    expect(keptFor(seat({ company: agency }))).toEqual({ kept: true })
  })

  it('a shared seeded demo seat keeps none and says which door keeps one', () => {
    const shared = keptFor(seat({ email: 'world-pinnacle-recruiter@demo.etyme.local', company: world }))
    expect(shared).toEqual({ kept: false, says: NOT_KEPT_IN_DEMO })
    expect(NOT_KEPT_IN_DEMO).toBe(
      'This conversation is not kept after you leave the page, because other visitors use this demo seat too. Sign up to keep yours.'
    )
  })

  it('a seeded worker the demo page opens with no firm seat is shared too, and keeps none', () => {
    expect(keptFor(seat({ email: 'helena.marsh@seed.etyme.invalid', company: null }))).toEqual({ kept: false, says: NOT_KEPT_IN_DEMO })
  })

  it('the record decides, not the address: two seats at one reserved domain read apart by their company alone', () => {
    expect(keptFor(seat({ company: sandbox }))).toEqual({ kept: true })
    expect(keptFor(seat({ company: world }))).toEqual({ kept: false, says: NOT_KEPT_IN_DEMO })
  })

  it('a seat that does not say whether its company is a sandbox keeps none, so a caller that leaves the flag out never shows one visitor another’s thread', () => {
    expect(keptFor(seat({ company: { id: 'co-x', name: 'Somebody' } }))).toEqual({ kept: false, says: NOT_KEPT_IN_DEMO })
  })

  it('the home page’s shared sample keeps none, whatever company it sits at, and says which door keeps one', () => {
    expect(keptFor(seat({ readOnly: true, company: world }))).toEqual({ kept: false, says: NOT_KEPT_IN_SAMPLE })
    expect(keptFor(seat({ readOnly: true, company: sandbox }))).toEqual({ kept: false, says: NOT_KEPT_IN_SAMPLE })
    expect(NOT_KEPT_IN_SAMPLE).toBe('The sample keeps no conversation, because anybody can open it. Sign up to keep yours.')
  })

  it('a person at their own address keeps theirs at any company, and with no company at all', () => {
    expect(keptFor(seat({ email: 'rae.okafor@pinnacle-staff.test', company: world }))).toEqual({ kept: true })
    expect(keptFor(seat({ email: 'rui.candidate@gmail.com', company: null }))).toEqual({ kept: true })
  })

  it('a machine holding an API key still has no conversation at all', () => {
    expect(keptFor(seat({ isService: true }))).toMatchObject({ ok: false, code: 'NO_PERSON' })
  })

  it('the advice never sends a visitor to open a demo of their own, because every door the demo page opens is a seat other visitors share', () => {
    for (const says of [NOT_KEPT_IN_DEMO, NOT_KEPT_IN_SAMPLE]) {
      expect(says).not.toMatch(/own demo/i)
      expect(says).toMatch(/Sign up/)
    }
  })

  it('the door the advice names is the sign-up the public site calls Sign up, at the same address', () => {
    expect(KEEP_ONE_AT).toEqual({ label: CLIENT_SIGN_UP.t, href: CLIENT_SIGN_UP.href })
  })

  it('the caller check reads whether a seat’s company is a visitor’s sandbox from the record, on every path that seats a person', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/api-context.ts'), 'utf8')
    // The seat's company is selected with its id; a select of the name alone
    // is a refusal naming the company a seat was paused or ended at.
    const selects = (src.match(/company: \{ select: \{[^}]*\} \}/g) ?? []).filter((s) => s.includes('id: true'))
    expect(selects.length).toBeGreaterThanOrEqual(3)
    for (const s of selects) expect(s).toContain('isDemo: true')
  })
})
