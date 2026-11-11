import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Ask Etyme's allowance in the chat (2026-11-11, the day the key goes on
 * production). Only the free-text step is held; the rules answer first and
 * always. The greeting's boundary line reads the same answer the switch
 * gives (`modelOnFor`: the company's switch AND its allowance), so a person
 * is never greeted as "on" and then told "not turned on", and a company held
 * at its line is never sent to Settings to turn on what would not help.
 */

const h = vi.hoisted(() => ({
  company: [] as { id: string; slug: string; askEtymeModelOn: boolean }[],
  sums: { company: 0, person: 0 },
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findUnique: async ({ where }: any) => h.company.find((c) => c.id === where.id) ?? null },
    person: { findUnique: async () => null },
    modelPrompt: {
      aggregate: async ({ where }: any) => {
        const total = where.personId ? h.sums.person : h.sums.company
        return { _sum: { tokensIn: total, tokensOut: 0 } }
      },
    },
  },
}))
vi.mock('@/lib/alerts', () => ({ reportError: async () => undefined }))

import {
  respond, today, boundarySays, greetingModelState, heldByAllowance, NO_SWITCH,
  type Readers, type AllowanceHeld,
} from '@/app/api/conversations/twin/ask'
import {
  askEtymeAllowanceFor, companyAllowanceFor, AT_THE_LINE, NOT_OPEN_YET, PERSON_DAILY_ENV, COMPANY_MONTHLY_ENV,
} from '@/lib/model-allowance'
import { modelOnFor } from '@/lib/model-boundary'

const KEY = { ANTHROPIC_API_KEY: 'sk-test' }
const LIMITS = { [PERSON_DAILY_ENV]: '20000', [COMPANY_MONTHLY_ENV]: '500000' }
const NOW = new Date('2026-11-11T15:00:00Z')
const FREE_TEXT = 'Which supplier is slowest to send its invoice?'

/** The real reader's own composition (read.ts): the allowance's verdict, held or not. */
async function allowanceOf(companyId: string, personId: string, env = LIMITS): Promise<AllowanceHeld | null> {
  const v = await askEtymeAllowanceFor(companyId, personId, NOW, env)
  return v.may ? null : { says: v.says, links: v.links }
}

function readers(over: Partial<Readers> = {}) {
  const none = async () => []
  return {
    waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
    told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
    ledgerLines: vi.fn(async () => [{ id: 'entry-442', ts: NOW.toISOString(), says: 'An invoice receipt and the accepted hours do not agree.', outcome: 'PERFORMED', entityType: 'Invoice', entityId: 'inv-442', ruleCited: 'invoice.hours', rationale: 'Billed 41.5 against 40 accepted.' }]),
    modelOn: async () => true,
    vocabulary: async () => ({ people: ['Helena Marsh'], firms: ['Pinnacle Resourcing', 'Northbend Athletic'] }),
    model: vi.fn(async () => ({ text: 'Pinnacle Resourcing billed over the hours accepted [entry-442].', model: 'small', tokensIn: 120, tokensOut: 14 })),
    logPrompt: vi.fn(async () => undefined),
    ...over,
  } as Readers & { model: ReturnType<typeof vi.fn>; logPrompt: ReturnType<typeof vi.fn>; ledgerLines: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  h.company = [{ id: 'co', slug: 'northbend', askEtymeModelOn: true }]
  h.sums = { company: 0, person: 0 }
  vi.unstubAllEnvs()
})

describe('only the free-text step is held; the rules answer first and always', () => {
  it('a question the rules answer is never held and never counted: the allowance is not read and nothing is logged, even for a person past their day', async () => {
    h.sums = { company: 30_000, person: 20_000 }
    const allowance = vi.fn(() => allowanceOf('co', 'p1'))
    const r = readers({ allowance, bench: async () => ({ ok: true as const, rows: [{ personId: 'p', person: 'Jonas Whitaker', free: 'Free now', skills: [] }] }) })
    const a = await respond('Who is on the bench?', r, { env: KEY, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: ['*'] })
    expect(a.kind).toBe('LIST')
    expect(allowance).not.toHaveBeenCalled()
    expect(r.model).not.toHaveBeenCalled()
    expect(r.logPrompt).not.toHaveBeenCalled()
  })

  it('a free-text question over the person’s daily allowance is refused in the plan sentence with Talk to us, nothing leaves, and the next rule question is still answered', async () => {
    h.sums = { company: 30_000, person: 20_000 }
    const r = readers({ allowance: () => allowanceOf('co', 'p1') })
    const a = await respond(FREE_TEXT, r, { env: KEY })
    expect(a).toEqual({ kind: 'TEXT', says: AT_THE_LINE, links: [{ label: 'Talk to us', href: '/contact' }] })
    expect(r.model).not.toHaveBeenCalled()
    expect(r.logPrompt).not.toHaveBeenCalled()
    expect(r.ledgerLines).not.toHaveBeenCalled()
    // The rules still answer, as the sentence says.
    const ruled = await respond('Who is on the bench?', readers({ allowance: () => allowanceOf('co', 'p1'), bench: async () => ({ ok: true as const, rows: [] }) }), { env: KEY, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: ['*'] })
    expect(ruled.kind).not.toBe('TEXT')
    // One token under the line, the question leaves as before.
    h.sums = { company: 30_000, person: 19_999 }
    const ok = readers({ allowance: () => allowanceOf('co', 'p1') })
    expect(await respond(FREE_TEXT, ok, { env: KEY })).toMatchObject({ kind: 'MODEL' })
    expect(ok.model).toHaveBeenCalledTimes(1)
  })

  it('a company not opened yet hears the plan sentence and never “your company has not turned it on”, whatever its switch says, with no link drawn for the empty Upgrade place', async () => {
    for (const on of [true, false]) {
      h.company[0].askEtymeModelOn = on
      const r = readers({ modelOn: async () => modelOnFor('co'), allowance: () => allowanceOf('co', 'p1', {}) })
      const a = await respond(FREE_TEXT, r, { env: KEY })
      expect(a).toEqual({ kind: 'TEXT', says: NOT_OPEN_YET })
      expect(a.says).not.toBe(NO_SWITCH)
      expect(r.model).not.toHaveBeenCalled()
    }
    expect(heldByAllowance({ says: NOT_OPEN_YET, links: [] })).toEqual({ kind: 'TEXT', says: NOT_OPEN_YET })
  })
})

describe('the greeting and the switch say the same thing for a held company', () => {
  it('a company past its month is greeted with the plan sentence, never as on, and a free-text question is told the same sentence', async () => {
    vi.stubEnv(PERSON_DAILY_ENV, LIMITS[PERSON_DAILY_ENV])
    vi.stubEnv(COMPANY_MONTHLY_ENV, LIMITS[COMPANY_MONTHLY_ENV])
    h.sums = { company: 500_000, person: 0 }
    // The switch's answer.
    expect(await modelOnFor('co')).toBe(false)
    // The greeting's answer, composed as the route composes it: the switch and the company's allowance.
    const company = await companyAllowanceFor('co', NOW)
    const held = company.may ? null : company.says
    const state = greetingModelState(true, held, KEY)
    expect(state).toBe('HELD')
    const hello = await today(readers(), { now: NOW, greeting: true, model: state, modelHeld: held })
    const said = hello.kind === 'NEEDS' ? (hello.more ?? []).map((l) => l.says) : []
    const line = said[said.length - 1]
    expect(line).toBe(boundarySays('HELD', AT_THE_LINE))
    expect(line).toContain(AT_THE_LINE)
    expect(line).not.toContain('has not turned it on')
    expect(line).not.toMatch(/go to the model/)
    // The free-text reply says the same sentence.
    const a = await respond(FREE_TEXT, readers({ modelOn: () => modelOnFor('co'), allowance: () => allowanceOf('co', 'p1') }), { env: KEY })
    expect(a.says).toBe(AT_THE_LINE)
    // Under the line again, both read ON together.
    h.sums = { company: 499_999, person: 0 }
    expect(await modelOnFor('co')).toBe(true)
    const again = await companyAllowanceFor('co', NOW)
    expect(greetingModelState(true, again.may ? null : again.says, KEY)).toBe('ON')
  })

  it('the greeting is ON only where the switch says yes, OFF where the switch is off and the company is open, and HELD wherever the allowance refuses', () => {
    expect(greetingModelState(true, null, KEY)).toBe('ON')
    expect(greetingModelState(false, null, KEY)).toBe('OFF')
    expect(greetingModelState(true, null, {})).toBe('NO_KEY')
    expect(greetingModelState(false, NOT_OPEN_YET, KEY)).toBe('HELD')
    expect(greetingModelState(true, AT_THE_LINE, KEY)).toBe('HELD')
  })

  it('what a person reads at the line, in the chat or the greeting, never says AI, model, a price, a plan name, a number, desk or program office', () => {
    for (const s of [AT_THE_LINE, NOT_OPEN_YET, boundarySays('HELD', AT_THE_LINE), boundarySays('HELD', NOT_OPEN_YET), boundarySays('HELD')]) {
      expect(s, s).not.toMatch(/\bAI\b|\bmodels?\b|\$|\d|\bpro\b|\bpremium\b|\bbusiness plan\b|\bdesks?\b|program office/i)
    }
  })
})
