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
 * - The two numbers are the deployment's, set by Etyme's Superadmin on the
 *   Superadmin screen (founder, 2026-11-11), stored as platform settings
 *   (lib/platform-settings) under the names ASK_ETYME_PERSON_DAILY_TOKENS
 *   and ASK_ETYME_COMPANY_MONTHLY_TOKENS. A number set there beats the
 *   environment variable of the same name; a number not set there falls
 *   back to the variable, so a deployment that never opens the screen
 *   works as before. No company can change either.
 * - With either number not set, free text stays off for every company but
 *   Tapin (slug `tapin`), whose use is then not limited.
 * - Every person gets free-text answers free for a trial (founder,
 *   2026-11-11): it starts at that person's first model-answered question,
 *   read from the prompt log (their earliest ASK_ETYME row), and ends the
 *   trial length in whole days after it. The length is a platform setting,
 *   ASK_ETYME_TRIAL_DAYS, 3 by default. Inside the trial the two token
 *   numbers still hold; after it the person hears the plan's sentence. A
 *   question the rules answer never starts it and is never held by it.
 *   Tapin is exempt. With the two numbers not set nothing changes: Tapin
 *   only, unlimited.
 * - A day and a month are UTC. The check runs before a question leaves, so
 *   one question can carry a total past its line by its own size, never more.
 * - What a person reads at the line names the paid plan's outcomes and never
 *   the thing behind the answer (founder, 2026-11-11): no price, no plan name,
 *   no number, a "Talk to us" link, and an empty place for Upgrade.
 */
import { prisma } from '@/lib/db'
import { readPlatformSettings } from '@/lib/platform-settings'
import { reportError } from '@/lib/alerts'
import { momentFor } from '@/lib/when'

type Env = Record<string, string | undefined>

export const PERSON_DAILY_ENV = 'ASK_ETYME_PERSON_DAILY_TOKENS'
export const COMPANY_MONTHLY_ENV = 'ASK_ETYME_COMPANY_MONTHLY_TOKENS'
/** The trial's length in whole days, a platform setting (and a variable of the same name as a fallback). */
export const TRIAL_DAYS_KEY = 'ASK_ETYME_TRIAL_DAYS'
export const DEFAULT_TRIAL_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

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

/** The two numbers from the environment alone, or null where not set (or not a whole number, which counts as not set). */
export function allowanceLimits(env: Env = process.env): AllowanceLimits {
  return { personDailyTokens: whole(env[PERSON_DAILY_ENV]), companyMonthlyTokens: whole(env[COMPANY_MONTHLY_ENV]) }
}

/** Where a number came from: the Superadmin screen, the deployment's variable, or nowhere. */
export type LimitSource = 'SCREEN' | 'DEPLOYMENT' | null

export interface LimitsWithSources {
  limits: AllowanceLimits
  from: { personDailyTokens: LimitSource; companyMonthlyTokens: LimitSource }
  /** The trial's length in whole days; the default where neither the screen nor the deployment sets it. */
  trialDays: number
  trialFrom: LimitSource
}

/**
 * The two numbers, each read from the Superadmin screen first and the
 * environment second, pure. `screen` is what lib/platform-settings holds.
 */
export function limitsFrom(screen: ReadonlyMap<string, string>, env: Env = process.env): LimitsWithSources {
  const one = (key: string): [number | null, LimitSource] => {
    const s = whole(screen.get(key))
    if (s !== null) return [s, 'SCREEN']
    const e = whole(env[key])
    return e !== null ? [e, 'DEPLOYMENT'] : [null, null]
  }
  const [p, pf] = one(PERSON_DAILY_ENV)
  const [c, cf] = one(COMPANY_MONTHLY_ENV)
  const [t, tf] = one(TRIAL_DAYS_KEY)
  return {
    limits: { personDailyTokens: p, companyMonthlyTokens: c },
    from: { personDailyTokens: pf, companyMonthlyTokens: cf },
    trialDays: t ?? DEFAULT_TRIAL_DAYS,
    trialFrom: tf,
  }
}

/**
 * The two numbers in force now, with where each came from. A fault reading
 * the platform settings is reported to staff and the environment decides,
 * so Ask Etyme never stops on a settings read.
 */
export async function currentLimitsWithSources(env: Env = process.env): Promise<LimitsWithSources> {
  let screen: Map<string, string> = new Map()
  try {
    screen = await readPlatformSettings([PERSON_DAILY_ENV, COMPANY_MONTHLY_ENV, TRIAL_DAYS_KEY])
  } catch (err) {
    await reportError('model-allowance', new Error(
      `Could not read Ask Etyme's limits from the Superadmin screen, so the deployment's variables decide. ` +
      `Cause: ${err instanceof Error ? err.message : String(err)}`,
    )).catch(() => undefined)
  }
  return limitsFrom(screen, env)
}

/** The two numbers in force now: the Superadmin screen first, the environment second. */
export async function currentAllowanceLimits(env: Env = process.env): Promise<AllowanceLimits> {
  return (await currentLimitsWithSources(env)).limits
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
      why: 'NOT_OPEN' | 'PERSON_DAY' | 'COMPANY_MONTH' | 'TRIAL_OVER'
      says: string
      links: Link[]
      /** Left empty on purpose: the Upgrade button is wired when prices exist. */
      upgrade: null
    }

function refused(why: 'NOT_OPEN' | 'PERSON_DAY' | 'COMPANY_MONTH' | 'TRIAL_OVER'): AllowanceVerdict {
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
  /**
   * The person's trial is over (`trialOver`). Absent or false where no
   * person is asked about, or the company is exempt (Tapin).
   */
  trialOver?: boolean
}): AllowanceVerdict {
  const { limits } = input
  if (!limitsSet(limits)) return input.isOpenBeforeLimits ? { may: true, limited: false } : refused('NOT_OPEN')
  if (input.companyMonth >= limits.companyMonthlyTokens!) return refused('COMPANY_MONTH')
  if (input.personToday !== null && input.personToday >= limits.personDailyTokens!) return refused('PERSON_DAY')
  if (input.trialOver) return refused('TRIAL_OVER')
  return { may: true, limited: true }
}

/** When a trial that started at `firstAt` ends: the length in whole days after it. Null where it has not started. Pure. */
export function trialEndsAt(firstAt: Date | null, trialDays: number): Date | null {
  return firstAt ? new Date(firstAt.getTime() + trialDays * DAY_MS) : null
}

/** Whether a trial that started at `firstAt` is over at `now`. One not started is not over. Pure. */
export function trialOver(firstAt: Date | null, trialDays: number, now: Date): boolean {
  const ends = trialEndsAt(firstAt, trialDays)
  return ends !== null && now.getTime() >= ends.getTime()
}

/**
 * The person's first model-answered Ask Etyme question, at any company:
 * the start of their trial. A question the rules answered left no row, so
 * it never starts it.
 */
export async function firstFreeTextAt(personId: string): Promise<Date | null> {
  const row = await prisma.modelPrompt.findFirst({
    where: { personId, purpose: { in: [...COUNTED_PURPOSES] } },
    orderBy: { ts: 'asc' },
    select: { ts: true },
  })
  return row?.ts ?? null
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
  const { limits, trialDays } = await currentLimitsWithSources(env)
  if (!limitsSet(limits)) return decideAllowance({ limits, isOpenBeforeLimits: await isOpenBeforeLimits(companyId), companyMonth: 0, personToday: null })
  const [companyMonth, personToday, exempt, firstAt] = await Promise.all([
    companyTokensThisMonth(companyId, now), personTokensToday(personId, now), isOpenBeforeLimits(companyId), firstFreeTextAt(personId),
  ])
  return decideAllowance({
    limits, isOpenBeforeLimits: false, companyMonth, personToday,
    // Tapin is exempt from the trial; the token numbers still hold for it.
    trialOver: !exempt && trialOver(firstAt, trialDays, now),
  })
}

/** The company half alone: read behind the company switch, so nothing leaves past it. */
export async function companyAllowanceFor(companyId: string, now = new Date(), env: Env = process.env): Promise<AllowanceVerdict> {
  const limits = await currentAllowanceLimits(env)
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

/** The reader's own trial in a sentence, for the settings screen. Pure. */
export function trialLine(endsAt: Date | null, now: Date): string {
  if (!endsAt) return 'Your free-text trial starts with your first question the rules do not answer.'
  return now.getTime() >= endsAt.getTime()
    ? `Your free-text trial ended ${momentFor(endsAt, 'UTC')}.`
    : `Your free-text trial ends ${momentFor(endsAt, 'UTC')}.`
}

/** What the settings screen shows beside the log. */
export async function allowanceUsageFor(companyId: string, personId: string, now = new Date(), env: Env = process.env): Promise<AllowanceUsage> {
  const { limits, trialDays } = await currentLimitsWithSources(env)
  const [companyMonth, personToday, open, firstAt] = await Promise.all([
    companyTokensThisMonth(companyId, now),
    personTokensToday(personId, now),
    isOpenBeforeLimits(companyId),
    firstFreeTextAt(personId),
  ])
  const over = !open && trialOver(firstAt, trialDays, now)
  const verdict = limitsSet(limits)
    ? decideAllowance({ limits, isOpenBeforeLimits: false, companyMonth, personToday, trialOver: over })
    : decideAllowance({ limits, isOpenBeforeLimits: open, companyMonth, personToday: null })
  const lines = usageLines({ limits, companyMonth, personToday, isOpenBeforeLimits: open })
  // The reader's own trial, where the numbers are set and the company is not exempt.
  if (limitsSet(limits) && !open) lines.splice(lines.length - 1, 0, trialLine(trialEndsAt(firstAt, trialDays), now))
  return { limits, companyMonth, personToday, verdict, lines }
}
