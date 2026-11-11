/**
 * Ask Etyme's allowance (2026-11-11, the day the key goes on production):
 * what a free-text answer may cost, per person per day and per company per
 * month, as cost protection and nothing else.
 *
 * - Only a question the rules did not answer, sent out and logged as
 *   ASK_ETYME (or ASK_ETYME_REPLACED), is counted, from the prompt log's own
 *   tokensIn + tokensOut. A question the rules answer is never counted and
 *   never limited, and no act is ever gated here: acts per day is the number
 *   that has to climb while testing.
 * - The two numbers are the deployment's, set by whoever holds its
 *   environment (Etyme's Superadmin): ASK_ETYME_PERSON_DAILY_TOKENS and
 *   ASK_ETYME_COMPANY_MONTHLY_TOKENS. No company can change them.
 * - With either number not set, free text stays off for every company but
 *   Tapin (slug `tapin`), whose use is then not limited.
 * - A day and a month are UTC. The check runs before a question leaves, so
 *   one question can carry a total past its line by its own size, never more.
 * - What a person reads at the line names the paid plan's outcomes and never
 *   the thing behind the answer (founder, 2026-11-11): no price, no plan name,
 *   no number, a "Talk to us" link, and an empty place for Upgrade.
 */
import { prisma } from '@/lib/db'

type Env = Record<string, string | undefined>

export const PERSON_DAILY_ENV = 'ASK_ETYME_PERSON_DAILY_TOKENS'
export const COMPANY_MONTHLY_ENV = 'ASK_ETYME_COMPANY_MONTHLY_TOKENS'

/** The one company that may use free text before the numbers are set. */
export const OPEN_BEFORE_LIMITS_SLUG = 'tapin'

/** Prompt-log purposes that are Ask Etyme answers; nothing else is counted. */
export const COUNTED_PURPOSES = ['ASK_ETYME', 'ASK_ETYME_REPLACED'] as const

export interface AllowanceLimits {
  personDailyTokens: number | null
  companyMonthlyTokens: number | null
}

function whole(v: string | undefined): number | null {
  const t = v?.trim()
  if (!t || !/^\d+$/.test(t)) return null
  return Number(t)
}

/** The two numbers, or null where not set (or not a whole number, which counts as not set). */
export function allowanceLimits(env: Env = process.env): AllowanceLimits {
  return { personDailyTokens: whole(env[PERSON_DAILY_ENV]), companyMonthlyTokens: whole(env[COMPANY_MONTHLY_ENV]) }
}

export function limitsSet(l: AllowanceLimits): boolean {
  return l.personDailyTokens !== null && l.companyMonthlyTokens !== null
}

export interface Link { text: string; href: string }

/** Said when a person or their company reaches the line. */
export const AT_THE_LINE =
  'More of this is in the paid plan: staying organized, marketing and sales, contract papers and money flow. The rules still answer.'
export const TALK_TO_US: Link = { text: 'Talk to us', href: '/contact' }

/** Said where the numbers are not set and the company is not Tapin. */
export const NOT_OPEN_YET =
  'Ask Etyme answers free-text questions for your company once Etyme opens them. The rules still answer.'

export type AllowanceVerdict =
  | { may: true; limited: boolean }
  | {
      may: false
      why: 'NOT_OPEN' | 'PERSON_DAY' | 'COMPANY_MONTH'
      says: string
      links: Link[]
      /** Left empty on purpose: the Upgrade button is wired when prices exist. */
      upgrade: null
    }

function refused(why: 'NOT_OPEN' | 'PERSON_DAY' | 'COMPANY_MONTH'): AllowanceVerdict {
  return why === 'NOT_OPEN'
    ? { may: false, why, says: NOT_OPEN_YET, links: [], upgrade: null }
    : { may: false, why, says: AT_THE_LINE, links: [TALK_TO_US], upgrade: null }
}

/**
 * The verdict, pure. `personToday` null means "not asked about a person"
 * (the company-level check behind the switch).
 */
export function decideAllowance(input: {
  limits: AllowanceLimits
  isOpenBeforeLimits: boolean
  companyMonth: number
  personToday: number | null
}): AllowanceVerdict {
  const { limits } = input
  if (!limitsSet(limits)) return input.isOpenBeforeLimits ? { may: true, limited: false } : refused('NOT_OPEN')
  if (input.companyMonth >= limits.companyMonthlyTokens!) return refused('COMPANY_MONTH')
  if (input.personToday !== null && input.personToday >= limits.personDailyTokens!) return refused('PERSON_DAY')
  return { may: true, limited: true }
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

async function tokensSince(where: { companyId?: string; personId?: string }, since: Date): Promise<number> {
  const agg = await prisma.modelPrompt.aggregate({
    where: { ...where, ts: { gte: since }, purpose: { in: [...COUNTED_PURPOSES] } },
    _sum: { tokensIn: true, tokensOut: true },
  })
  return (agg._sum.tokensIn ?? 0) + (agg._sum.tokensOut ?? 0)
}

/** The company's Ask Etyme tokens this UTC month. */
export function companyTokensThisMonth(companyId: string, now = new Date()): Promise<number> {
  return tokensSince({ companyId }, startOfUtcMonth(now))
}

/** One person's Ask Etyme tokens today (UTC), at every company they ask from. */
export function personTokensToday(personId: string, now = new Date()): Promise<number> {
  return tokensSince({ personId }, startOfUtcDay(now))
}

async function isOpenBeforeLimits(companyId: string): Promise<boolean> {
  const row = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } })
  return row?.slug === OPEN_BEFORE_LIMITS_SLUG
}

/**
 * Whether a free-text question from this person at this company may leave
 * now. The one gate Ask Etyme's model path reads before it sends anything.
 */
export async function askEtymeAllowanceFor(
  companyId: string,
  personId: string,
  now = new Date(),
  env: Env = process.env,
): Promise<AllowanceVerdict> {
  const limits = allowanceLimits(env)
  if (!limitsSet(limits)) return decideAllowance({ limits, isOpenBeforeLimits: await isOpenBeforeLimits(companyId), companyMonth: 0, personToday: null })
  const [companyMonth, personToday] = await Promise.all([companyTokensThisMonth(companyId, now), personTokensToday(personId, now)])
  return decideAllowance({ limits, isOpenBeforeLimits: false, companyMonth, personToday })
}

/** The company half alone: read behind the company switch, so nothing leaves past it. */
export async function companyAllowanceFor(companyId: string, now = new Date(), env: Env = process.env): Promise<AllowanceVerdict> {
  const limits = allowanceLimits(env)
  if (!limitsSet(limits)) return decideAllowance({ limits, isOpenBeforeLimits: await isOpenBeforeLimits(companyId), companyMonth: 0, personToday: null })
  return decideAllowance({ limits, isOpenBeforeLimits: false, companyMonth: await companyTokensThisMonth(companyId, now), personToday: null })
}

export interface AllowanceUsage {
  limits: AllowanceLimits
  companyMonth: number
  personToday: number
  verdict: AllowanceVerdict
  /** The usage in plain words, for the settings screen. */
  lines: string[]
}

const n = (x: number) => x.toLocaleString('en-US')

/** Usage in plain words, pure. */
export function usageLines(u: { limits: AllowanceLimits; companyMonth: number; personToday: number; isOpenBeforeLimits: boolean }): string[] {
  const { limits } = u
  if (!limitsSet(limits)) {
    return u.isOpenBeforeLimits
      ? [`This month your company's Ask Etyme free-text answers used ${n(u.companyMonth)} tokens. No allowance is set yet, so none is limited.`]
      : ['Free-text answers are not open for your company yet. Questions the rules answer are never counted.']
  }
  return [
    `This month your company's Ask Etyme free-text answers used ${n(u.companyMonth)} of ${n(limits.companyMonthlyTokens!)} tokens.`,
    `You used ${n(u.personToday)} of your ${n(limits.personDailyTokens!)} tokens today.`,
    'Questions the rules answer are never counted.',
  ]
}

/** What the settings screen shows beside the log. */
export async function allowanceUsageFor(companyId: string, personId: string, now = new Date(), env: Env = process.env): Promise<AllowanceUsage> {
  const limits = allowanceLimits(env)
  const [companyMonth, personToday, open] = await Promise.all([
    companyTokensThisMonth(companyId, now),
    personTokensToday(personId, now),
    isOpenBeforeLimits(companyId),
  ])
  const verdict = limitsSet(limits)
    ? decideAllowance({ limits, isOpenBeforeLimits: false, companyMonth, personToday })
    : decideAllowance({ limits, isOpenBeforeLimits: open, companyMonth, personToday: null })
  return { limits, companyMonth, personToday, verdict, lines: usageLines({ limits, companyMonth, personToday, isOpenBeforeLimits: open }) }
}
