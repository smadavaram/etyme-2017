import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * The key goes on production on 2026-11-11. These are the sentences that
 * stand between it and money lost or trust broken: what Ask Etyme counts,
 * what it says at the line, who it is open for before the numbers are set,
 * whether the ids it sends exist, and that no id hides at a call site.
 */

const h = vi.hoisted(() => ({
  company: [] as { id: string; slug: string; askEtymeModelOn: boolean }[],
  /** Tokens the log holds, per filter key. */
  sums: { company: 0, person: 0 },
  wheres: [] as any[],
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    company: {
      findUnique: async ({ where }: any) => h.company.find((c) => c.id === where.id) ?? null,
    },
    person: { findUnique: async () => null },
    modelPrompt: {
      aggregate: async ({ where }: any) => {
        h.wheres.push(where)
        const total = where.personId ? h.sums.person : h.sums.company
        return { _sum: { tokensIn: Math.floor(total / 2), tokensOut: total - Math.floor(total / 2) } }
      },
    },
  },
}))
vi.mock('@/lib/alerts', () => ({ reportError: async () => undefined }))

import {
  askEtymeAllowanceFor, decideAllowance, AT_THE_LINE, NOT_OPEN_YET, COUNTED_PURPOSES,
  PERSON_DAILY_ENV, COMPANY_MONTHLY_ENV, usageLines,
} from '@/lib/model-allowance'
import { modelOnFor } from '@/lib/model-boundary'
import { checkModelIds, modelFor, SUPPORTED_MODELS } from '@/lib/model-ids'
import { modelHealth } from '@/lib/model-health'

const LIMITS = { [PERSON_DAILY_ENV]: '20000', [COMPANY_MONTHLY_ENV]: '500000' }
const NOW = new Date('2026-11-11T15:00:00Z')

beforeEach(() => {
  h.company = []
  h.sums = { company: 0, person: 0 }
  h.wheres = []
  vi.unstubAllEnvs()
})

describe('Ask Etyme counts only what the model answered', () => {
  it('a question the rules answer is never counted: only Ask Etyme free-text answers in the prompt log are summed', async () => {
    h.company.push({ id: 'co', slug: 'northbend', askEtymeModelOn: true })
    await askEtymeAllowanceFor('co', 'p1', NOW, LIMITS)
    expect(h.wheres.length).toBe(2)
    for (const w of h.wheres) {
      expect(w.purpose).toEqual({ in: [...COUNTED_PURPOSES] })
      expect(COUNTED_PURPOSES).toEqual(['ASK_ETYME', 'ASK_ETYME_REPLACED'])
    }
    // The day and the month are UTC, from their first instant.
    const person = h.wheres.find((w) => w.personId)!
    const company = h.wheres.find((w) => w.companyId)!
    expect(person.ts.gte.toISOString()).toBe('2026-11-11T00:00:00.000Z')
    expect(company.ts.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('a free-text question over a person’s daily allowance is refused in the plan’s sentence, the rules still answer, and Talk to us is offered with an empty place for Upgrade', async () => {
    h.company.push({ id: 'co', slug: 'northbend', askEtymeModelOn: true })
    h.sums = { company: 30_000, person: 20_000 }
    const v = await askEtymeAllowanceFor('co', 'p1', NOW, LIMITS)
    expect(v).toEqual({ may: false, why: 'PERSON_DAY', says: AT_THE_LINE, links: [{ text: 'Talk to us', href: '/contact' }], upgrade: null })
    expect(AT_THE_LINE).toContain('The rules still answer.')
    // One token under the line still goes.
    h.sums = { company: 30_000, person: 19_999 }
    expect(await askEtymeAllowanceFor('co', 'p1', NOW, LIMITS)).toEqual({ may: true, limited: true })
  })

  it('a company past its monthly ceiling is held behind its own switch, so nothing leaves from any screen until the 1st', async () => {
    vi.stubEnv(PERSON_DAILY_ENV, '20000')
    vi.stubEnv(COMPANY_MONTHLY_ENV, '500000')
    h.company.push({ id: 'co', slug: 'northbend', askEtymeModelOn: true })
    h.sums = { company: 499_999, person: 0 }
    expect(await modelOnFor('co')).toBe(true)
    h.sums = { company: 500_000, person: 0 }
    expect(await modelOnFor('co')).toBe(false)
    expect(decideAllowance({ limits: { personDailyTokens: 1, companyMonthlyTokens: 10 }, isOpenBeforeLimits: false, companyMonth: 10, personToday: 0 }))
      .toMatchObject({ may: false, why: 'COMPANY_MONTH', says: AT_THE_LINE })
  })

  it('with no allowance set, free text is off for every company but Tapin, whatever its switch says', async () => {
    vi.stubEnv(PERSON_DAILY_ENV, '')
    vi.stubEnv(COMPANY_MONTHLY_ENV, '')
    h.company.push({ id: 'nb', slug: 'northbend', askEtymeModelOn: true }, { id: 'tp', slug: 'tapin', askEtymeModelOn: true })
    expect(await modelOnFor('nb')).toBe(false)
    expect(await modelOnFor('tp')).toBe(true)
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, {})).toMatchObject({ may: false, why: 'NOT_OPEN', says: NOT_OPEN_YET })
    // One number alone is not an allowance.
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, { [PERSON_DAILY_ENV]: '20000' })).toMatchObject({ may: false, why: 'NOT_OPEN' })
    // Tapin's own switch still decides: off is off.
    h.company[1].askEtymeModelOn = false
    expect(await modelOnFor('tp')).toBe(false)
    // And nothing is counted to decide it.
    h.wheres = []
    await askEtymeAllowanceFor('tp', 'p1', NOW, {})
    expect(h.wheres).toEqual([])
  })

  it('what a person reads at the line never names the model, AI, a price, a plan name or a number', () => {
    for (const s of [AT_THE_LINE, NOT_OPEN_YET]) {
      expect(s).not.toMatch(/\bAI\b|\bmodel\b|\$|\d|\bpro\b|\bpremium\b|\bbusiness plan\b/i)
    }
    expect(usageLines({ limits: { personDailyTokens: null, companyMonthlyTokens: null }, companyMonth: 0, personToday: 0, isOpenBeforeLimits: false }).join(' '))
      .not.toMatch(/\bAI\b|\bmodel\b/i)
  })
})

describe('the model ids are ready before the first real call', () => {
  it('every role defaults to an id this build supports, and an override is used as given and reported when it is not supported', () => {
    expect(checkModelIds({})).toMatchObject({ ok: true })
    expect(modelFor('SMALL', {})).toBe('claude-haiku-5-5')
    expect(modelFor('CHECK', { CHECK_MODEL: 'claude-opus-5' })).toBe('claude-opus-5')
    const bad = checkModelIds({ CHECK_MODEL: 'claude-opus-5' })
    expect(bad.ok).toBe(false)
    expect(bad.says).toContain('CHECK_MODEL names claude-opus-5')
    expect(SUPPORTED_MODELS).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
  })

  it('health and /ready say whether the key is present and every id is supported, without calling the provider', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(modelHealth({})).toMatchObject({ keyPresent: false, ready: false })
    expect(modelHealth({ ANTHROPIC_API_KEY: 'sk-x' })).toMatchObject({ keyPresent: true, idsSupported: true, ready: true })
    const wrong = modelHealth({ ANTHROPIC_API_KEY: 'sk-x', MATCH_MODEL: 'claude-opus-5' })
    expect(wrong).toMatchObject({ keyPresent: true, idsSupported: false, ready: false })
    expect(wrong.says).toContain('MATCH_MODEL names claude-opus-5')
    expect(JSON.stringify(wrong)).not.toContain('sk-x')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

/**
 * Files outside lib/model-ids that still write an id. Empty since
 * 2026-11-11: every call site asks `modelFor`. A file that writes an id
 * again must be named here with a reason, and the list may only shrink.
 */
const STILL_LITERAL: Record<string, string> = {}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

describe('no call site holds a model id of its own', () => {
  it('no file under src writes a model id except lib/model-ids, and the named list of files still holding one may only shrink', () => {
    const root = process.cwd()
    const holding = filesUnder(join(root, 'src'))
      .map((p) => relative(root, p))
      .filter((p) => p !== 'src/lib/model-ids.ts')
      .filter((p) => /['"`]claude-(?:opus|sonnet|haiku)[a-z0-9.-]*['"`]/.test(readFileSync(join(root, p), 'utf8')))
      .sort()
    const unexpected = holding.filter((p) => !(p in STILL_LITERAL))
    expect(unexpected).toEqual([])
    // A file named here that no longer holds an id comes off the list.
    expect(Object.keys(STILL_LITERAL).filter((p) => !holding.includes(p))).toEqual([])
  })
})
