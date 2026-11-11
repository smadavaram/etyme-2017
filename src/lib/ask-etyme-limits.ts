/**
 * Ask Etyme's limits as the Superadmin sets them (founder, 2026-11-11:
 * "I should be able to configure that in the Superadmin screen").
 *
 * What a limit counts is lib/model-allowance's: tokens of free-text answers
 * from the prompt log, per person per day and per company per month, never
 * a question the rules answered; and the free trial's length in whole days,
 * from a person's first free-text question. This file holds what the
 * screen needs and nothing more: which three numbers, the check on a typed
 * value, the hard ceilings, the words, and the read of the current values
 * and the last ten changes. No company name, no usage by company and no
 * money appears on the Superadmin screen.
 */
import {
  COMPANY_MONTHLY_ENV, PERSON_DAILY_ENV, TRIAL_DAYS_KEY, DEFAULT_TRIAL_DAYS, OPEN_BEFORE_LIMITS_SLUG,
  limitsFrom, type LimitSource,
} from '@/lib/model-allowance'
import { platformSettingHistory, platformSettingRows, type PlatformSettingChangeRow } from '@/lib/platform-settings'
import { momentFor } from '@/lib/when'

/**
 * The hard ceilings. A number above one is refused as a typing slip rather
 * than stored: a million tokens a person a day is several hundred short
 * questions, a hundred million a company a month is fifty thousand, and a
 * trial longer than a year is not a trial. Raising any is a code change,
 * on purpose.
 */
export const PERSON_DAILY_CEILING = 1_000_000
export const COMPANY_MONTHLY_CEILING = 100_000_000
export const TRIAL_DAYS_CEILING = 365

/**
 * An estimate, said as one: what one short Ask Etyme question and its
 * answer use, masked prompt and answer together. Only for the words
 * "about N short questions"; nothing is counted or refused on it.
 */
export const TOKENS_PER_SHORT_QUESTION_ESTIMATE = 2_000

export interface LimitSetting {
  key: typeof PERSON_DAILY_ENV | typeof COMPANY_MONTHLY_ENV | typeof TRIAL_DAYS_KEY
  /** The field name in the route's body. */
  field: 'personDailyTokens' | 'companyMonthlyTokens' | 'trialDays'
  name: string
  unit: 'tokens' | 'days'
  floor: number
  ceiling: number
}

export const LIMIT_SETTINGS: readonly LimitSetting[] = [
  { key: PERSON_DAILY_ENV, field: 'personDailyTokens', name: 'Each person, per day', unit: 'tokens', floor: 0, ceiling: PERSON_DAILY_CEILING },
  { key: COMPANY_MONTHLY_ENV, field: 'companyMonthlyTokens', name: 'Each company, per month', unit: 'tokens', floor: 0, ceiling: COMPANY_MONTHLY_CEILING },
  { key: TRIAL_DAYS_KEY, field: 'trialDays', name: 'Free trial for each person', unit: 'days', floor: 1, ceiling: TRIAL_DAYS_CEILING },
]

export const LIMIT_KEYS = LIMIT_SETTINGS.map((s) => s.key)

const n = (x: number) => x.toLocaleString('en-US')
/** A moment, in UTC with the zone named: the limits count UTC days and months. */
const at = (d: Date) => momentFor(d, 'UTC')

export type LimitCheck = { ok: true; value: string | null } | { ok: false; says: string }

/**
 * A typed value, checked. A whole number from the floor to the ceiling is
 * kept as its digits; commas and spaces are allowed and dropped. Null or an
 * empty box clears it here, so the deployment's setting (or the trial's
 * default) decides. Anything else is refused in a sentence. Pure.
 */
export function checkLimit(raw: unknown, setting: LimitSetting): LimitCheck {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { ok: false, says: `${setting.name}: type a whole number of ${setting.unit}, or leave it empty.` }
  }
  const text = typeof raw === 'number' ? String(raw) : raw.replace(/[,\s]/g, '')
  if (text === '') return { ok: true, value: null }
  if (/^-/.test(text)) return { ok: false, says: `${setting.name}: a limit cannot be below zero.` }
  if (!/^\d+$/.test(text)) return { ok: false, says: `${setting.name}: type a whole number of ${setting.unit}, with no letters or decimals.` }
  const value = Number(text)
  if (value < setting.floor) return { ok: false, says: `${setting.name}: the lowest number this screen takes is ${n(setting.floor)} ${setting.unit}.` }
  if (!Number.isSafeInteger(value) || value > setting.ceiling) {
    return { ok: false, says: `${setting.name}: the highest number this screen takes is ${n(setting.ceiling)} ${setting.unit}.` }
  }
  return { ok: true, value: String(value) }
}

/** "about 10 short questions (an estimate)". Pure. */
export function aboutQuestions(tokens: number): string {
  const q = Math.floor(tokens / TOKENS_PER_SHORT_QUESTION_ESTIMATE)
  return `about ${n(q)} short ${q === 1 ? 'question' : 'questions'} (an estimate)`
}

export interface LimitView {
  key: string
  field: LimitSetting['field']
  name: string
  unit: LimitSetting['unit']
  floor: number
  ceiling: number
  /** The number in force, or null where neither the screen nor the deployment sets a token limit. */
  value: number | null
  /** What the box shows: the number set on this screen, else empty. */
  typed: string
  from: LimitSource
  /** The number in force, in words. */
  says: string
  /** Who set it on this screen, and when; null where the screen did not set it. */
  setBy: string | null
  setAt: string | null
}

export interface LimitsScreen {
  limits: LimitView[]
  /** What happens while either token number is missing, and what the trial is. */
  note: string
  history: { says: string; at: string }[]
}

function sourceWords(from: LimitSource): string {
  return from === 'SCREEN' ? 'set on this screen' : from === 'DEPLOYMENT' ? "from the deployment's setting" : 'not set'
}

function valueWords(v: string | null, unit: string): string {
  return v === null ? 'not set here' : `${n(Number(v))} ${unit}`
}

/** One change in a line: who, what, from and to. Pure. */
export function changeLine(c: PlatformSettingChangeRow): string {
  const who = c.changedByName ? `${c.changedByName} (${c.changedByEmail})` : c.changedByEmail
  const s = LIMIT_SETTINGS.find((x) => x.key === c.key)
  const unit = s?.unit ?? ''
  return `${who} changed "${s?.name ?? c.key}" from ${valueWords(c.oldValue, unit)} to ${valueWords(c.newValue, unit)}.`
}

/** The screen's view, pure: the rows set here, the environment, and the changes. */
export function limitsScreen(
  rows: { key: string; value: string; setByEmail: string; setByName: string | null; setAt: Date }[],
  history: PlatformSettingChangeRow[],
  env: Record<string, string | undefined> = process.env,
): LimitsScreen {
  const screen = new Map(rows.map((r) => [r.key, r.value]))
  const all = limitsFrom(screen, env)
  const views = LIMIT_SETTINGS.map((s): LimitView => {
    const value = s.field === 'trialDays' ? all.trialDays : all.limits[s.field]
    const from = s.field === 'trialDays' ? all.trialFrom : all.from[s.field]
    const row = rows.find((r) => r.key === s.key)
    const shown = from === 'SCREEN' && row
    const says = s.field === 'trialDays'
      ? `${n(value!)} ${value === 1 ? 'day' : 'days'}, ${from === null ? 'the default' : sourceWords(from)}.`
      : value === null
        ? 'Not set.'
        : `${n(value)} tokens, ${aboutQuestions(value)}, ${sourceWords(from)}.`
    return {
      key: s.key, field: s.field, name: s.name, unit: s.unit, floor: s.floor, ceiling: s.ceiling,
      value, typed: row ? row.value : '', from, says,
      setBy: shown ? (row.setByName ? `${row.setByName} (${row.setByEmail})` : row.setByEmail) : null,
      setAt: shown ? at(row.setAt) : null,
    }
  })
  const tokensSet = all.limits.personDailyTokens !== null && all.limits.companyMonthlyTokens !== null
  const note = [
    tokensSet
      ? 'Only free-text answers are counted. Questions the rules answer are never counted or limited.'
      : `While either token number is not set, free-text answers stay off for every company but ${OPEN_BEFORE_LIMITS_SLUG}. Questions the rules answer are never counted or limited.`,
    `Each person's free trial starts at their first free-text question and lasts the days above (${n(DEFAULT_TRIAL_DAYS)} unless set). The token numbers still hold inside it. ${OPEN_BEFORE_LIMITS_SLUG} has no trial end.`,
  ].join(' ')
  return {
    limits: views,
    note,
    history: history.map((c) => ({ says: changeLine(c), at: at(c.changedAt) })),
  }
}

/** The screen's view, read now. */
export async function readLimitsScreen(env: Record<string, string | undefined> = process.env): Promise<LimitsScreen> {
  const [rows, history] = await Promise.all([platformSettingRows(LIMIT_KEYS), platformSettingHistory(LIMIT_KEYS, 10)])
  return limitsScreen(rows, history, env)
}
