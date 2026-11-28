import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { scorecard, ownCardFills, whatToFix, OWN_CARD_FILLS, OWN_CARD_EMPTY_SAYS, ENOUGH, type Put, type Sent } from '@/lib/scorecard'

/**
 * The firm's own scorecard, fix list A6 (2026-11-15): each empty figure
 * says what fills it, and the empty page says where it fills from.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const now = new Date('2026-11-15T12:00:00Z')
const day = (n: number) => new Date(now.getTime() - n * 86_400_000)
const words = (s: string) => s.trim().split(/\s+/).length

const sent = (id: string): Sent => ({ requirementId: id, invitedAt: day(30), bandMinCents: 5_000, bandMaxCents: 7_000, declined: false })
const put = (id: string, over: Partial<Put> = {}): Put => ({
  submittedAt: day(29), requirementId: id, rateCents: 6_000, bandMinCents: 5_000, bandMaxCents: 7_000,
  cleared: true, heldBackFor: [], hired: false, reason: null, ...over,
})

describe('the firm’s own scorecard says what fills an empty figure', () => {
  it('every empty figure on the firm’s own scorecard says in a sentence what fills it', () => {
    const card = scorecard('Ridgeway Bench Partners', [], [], now)
    expect(ownCardFills(card)).toEqual(OWN_CARD_FILLS)
    for (const s of Object.values(OWN_CARD_FILLS)) {
      expect(s.endsWith('.')).toBe(true)
      expect(words(s)).toBeLessThanOrEqual(25)
    }
  })

  it('a figure with a number says nothing beneath it, and one still too small says what fills it', () => {
    const roles = Array.from({ length: ENOUGH }, (_, i) => `r${i}`)
    const card = scorecard('Ridgeway Bench Partners', roles.map(sent), roles.map((r) => put(r)), now)
    expect(ownCardFills(card)).toEqual({ answered: null, firstReplyHours: null, worthReading: null, hired: null })
    const few = scorecard('Ridgeway Bench Partners', [sent('r0')], [put('r0')], now)
    expect(ownCardFills(few)).toMatchObject({ answered: null, firstReplyHours: null, worthReading: OWN_CARD_FILLS.worthReading, hired: OWN_CARD_FILLS.hired })
  })

  it('the empty scorecard says it fills from clients on Etyme, and that work for clients not on Etyme is not on it', () => {
    expect(OWN_CARD_EMPTY_SAYS).toContain('fills from clients on Etyme')
    expect(OWN_CARD_EMPTY_SAYS).toContain('Work for clients who are not on Etyme is not on it.')
    expect(src('src/app/api/me/scorecard/route.ts')).toContain('? OWN_CARD_EMPTY_SAYS')
    expect(src('src/app/dashboard/my-standing/page.tsx')).toContain('<EmptyState says={summary || OWN_CARD_EMPTY_SAYS} />')
  })

  it('the route sends each card what fills its empty figures, and the page prints it under the dash', () => {
    expect(src('src/app/api/me/scorecard/route.ts')).toContain('fills: ownCardFills(card)')
    expect(src('src/app/dashboard/my-standing/page.tsx')).toContain('{f.value == null && fills && <p')
  })

  it('the firm’s own scorecard says resume, never CV', () => {
    const page = src('src/app/dashboard/my-standing/page.tsx')
    expect(page).toContain("'Your first resume'")
    expect(page).not.toMatch(/\bCV\b/)
    const slow = scorecard('Ridgeway Bench Partners', [{ ...sent('r0'), invitedAt: day(40) }], [{ ...put('r0'), submittedAt: day(30) }], now)
    expect(slow.firstReplyHours.says).toMatch(/^First resume usually/)
    for (const s of [...whatToFix(slow), ...Object.values(OWN_CARD_FILLS), OWN_CARD_EMPTY_SAYS]) expect(s).not.toMatch(/\bCV\b/)
  })
})
