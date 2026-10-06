/**
 * The bench pay policy and the holiday switches: who may change them, what
 * is refused, what is written, and the sentence a person reads.
 *
 * ── The founder's rule, 2026-10-03 ────────────────────────────────────
 *
 * "A company setting, defaulting to no-pay, and each candidate needs to be
 * activated. GSI companies do autopay." Whether one person is paid for a
 * public holiday on the bench is money's (`holidayPayFor` in
 * lib/bench-policy); this file is only the door the setting goes through,
 * so the settings screen, its route and supply's switch on Our bench say
 * the same thing and the refusals can be tested without a database.
 *
 * ── Three refusals, each in a sentence ────────────────────────────────
 *
 *   A desk that is not the owner, the admin or finance. The same three
 *   desks that read bench profit, because the policy is what that figure
 *   is computed under.
 *
 *   A firm that runs no bench. A client buys and never carries anybody; a
 *   program office places nobody (neutrality is absolute); a one-person
 *   corporation's only consultant is the owner.
 *
 *   A person who is not on this firm's bench. A switch is written only for
 *   somebody the firm employs or who listed themselves on its bench.
 *
 * ── What it never does ────────────────────────────────────────────────
 *
 * It never edits a switch. Every turn is a new row and the latest wins, so
 * who turned it and when is the record itself.
 */

import {
  holidayPayFor,
  latestSwitch,
  type BenchPolicy,
  type HolidayPayAnswer,
  type HolidaySwitch,
  type ReserveOnExit,
} from '@/lib/bench-policy'
import { formatDay } from '@/lib/format-date'

/** The three desks the founder named, by the role's own name. */
export const BENCH_PAY_DESKS = ['Owner', 'Admin', 'Finance'] as const

/** The kinds of firm that carry people between projects. */
export const RUNS_A_BENCH = ['VENDOR', 'GSI'] as const

export const BENCH_POLICIES: readonly BenchPolicy[] = ['NO_PAY', 'FULL_PAY', 'REDUCED_RATE', 'RESERVE_FUNDED']
export const RESERVE_ON_EXIT: readonly ReserveOnExit[] = ['PAY_OUT', 'COMPANY_KEEPS', 'DEPENDS_ON_REASON']

/** Each policy as a choice on the screen. */
export const POLICY_WORDS: Record<BenchPolicy, { label: string; means: string }> = {
  NO_PAY: {
    label: 'No bill, no pay',
    means: 'People waiting for a project are not paid while they wait.',
  },
  FULL_PAY: {
    label: 'Full pay',
    means: 'People waiting for a project are paid in full, up to the carry days.',
  },
  REDUCED_RATE: {
    label: 'Part pay',
    means: 'People waiting for a project are paid a share of their pay, up to the carry days.',
  },
  RESERVE_FUNDED: {
    label: 'Paid from their own reserve',
    means: 'A share of what they earn while billing is held back, and pays them while they wait.',
  },
}

export const EXIT_WORDS: Record<ReserveOnExit, string> = {
  PAY_OUT: 'What is left in the reserve is paid to them when they leave.',
  COMPANY_KEEPS: 'The firm keeps what is left in the reserve when they leave.',
  DEPENDS_ON_REASON: 'Paid out or kept depending on why they leave.',
}

// ── Who may ───────────────────────────────────────────────────────────

export interface BenchPayReader {
  companyName: string
  companyKind: string | null
  roleName: string | null
  /** True where the seat is a consultant's own, not the firm's staff. */
  consultantSeat: boolean
}

export type Verdict = { ok: true } | { ok: false; code: string; message: string }

/**
 * Whether this seat may read and change the firm's bench pay policy and
 * its holiday switches. Read and write are the same three desks: the
 * policy is what each person's bench pay is worked out under, so a desk
 * that may not change it has no business reading it either.
 */
export function mayChangeBenchPay(r: BenchPayReader): Verdict {
  if (r.consultantSeat) {
    return {
      ok: false, code: 'NOT_STAFF',
      message: 'Bench pay is set by the firm, by its owner, admin and finance desks. Your own pay is on your own page.',
    }
  }
  if (!r.companyKind) {
    return { ok: false, code: 'NO_COMPANY', message: 'Bench pay belongs to a firm. Sign in at the firm whose bench it is.' }
  }
  if (!(RUNS_A_BENCH as readonly string[]).includes(r.companyKind)) {
    return {
      ok: false, code: 'NO_BENCH',
      message: `${r.companyName} does not carry people between projects, so it has no bench pay to set.`,
    }
  }
  if (r.roleName && (BENCH_PAY_DESKS as readonly string[]).includes(r.roleName)) return { ok: true }
  return {
    ok: false, code: 'NOT_THIS_DESK',
    message:
      `Bench pay at ${r.companyName} is set by the owner, the admin and the finance desk. ` +
      `Your seat${r.roleName ? ` (${r.roleName})` : ''} is none of them. Ask one of them to change it.`,
  }
}

// ── The policy ────────────────────────────────────────────────────────

export interface PolicyNow {
  benchPolicy: BenchPolicy
  benchRateBps: number | null
  benchCarryDays: number | null
  reserveBps: number | null
  reserveOnExit: ReserveOnExit
}

export type PolicyChange =
  | { ok: true; data: Partial<PolicyNow>; changed: (keyof PolicyNow)[] }
  | { ok: false; field: string; message: string }

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/**
 * Read a change to the policy from a request body, against what is set
 * now. Only the fields present are changed. The result must still be a
 * policy that can be paid: part pay needs its share, a reserve needs what
 * is held back.
 */
export function readPolicyChange(body: Record<string, unknown>, now: PolicyNow): PolicyChange {
  const data: Partial<PolicyNow> = {}
  const changed: (keyof PolicyNow)[] = []

  if ('benchPolicy' in body) {
    const v = typeof body.benchPolicy === 'string' ? body.benchPolicy.trim().toUpperCase() : body.benchPolicy
    if (!(BENCH_POLICIES as readonly unknown[]).includes(v)) {
      return {
        ok: false, field: 'benchPolicy',
        message: 'Choose one of: no bill, no pay; full pay; part pay; or paid from their own reserve.',
      }
    }
    data.benchPolicy = v as BenchPolicy
    changed.push('benchPolicy')
  }

  if ('benchRateBps' in body) {
    const v = body.benchRateBps
    if (v !== null && (!isInt(v) || v < 1 || v > 9_999)) {
      return {
        ok: false, field: 'benchRateBps',
        message: 'Part pay is a share between 0.01% and 99.99% of their pay. For all of it, choose full pay.',
      }
    }
    data.benchRateBps = v as number | null
    changed.push('benchRateBps')
  }

  if ('benchCarryDays' in body) {
    const v = body.benchCarryDays
    if (v !== null && (!isInt(v) || v < 1 || v > 3_650)) {
      return {
        ok: false, field: 'benchCarryDays',
        message: 'Carry days are a whole number of days, from 1 to 3,650. Leave it empty to carry people with no limit.',
      }
    }
    data.benchCarryDays = v as number | null
    changed.push('benchCarryDays')
  }

  if ('reserveBps' in body) {
    const v = body.reserveBps
    if (v !== null && (!isInt(v) || v < 1 || v > 10_000)) {
      return {
        ok: false, field: 'reserveBps',
        message: 'The share held back into the reserve is between 0.01% and 100% of each share.',
      }
    }
    data.reserveBps = v as number | null
    changed.push('reserveBps')
  }

  if ('reserveOnExit' in body) {
    const v = typeof body.reserveOnExit === 'string' ? body.reserveOnExit.trim().toUpperCase() : body.reserveOnExit
    if (!(RESERVE_ON_EXIT as readonly unknown[]).includes(v)) {
      return {
        ok: false, field: 'reserveOnExit',
        message: 'When somebody leaves, the reserve is paid out, kept by the firm, or decided by why they leave.',
      }
    }
    data.reserveOnExit = v as ReserveOnExit
    changed.push('reserveOnExit')
  }

  if (changed.length === 0) return { ok: false, field: '', message: 'Nothing to change.' }

  const after = { ...now, ...data }
  if (after.benchPolicy === 'REDUCED_RATE' && after.benchRateBps == null) {
    return {
      ok: false, field: 'benchRateBps',
      message: 'Part pay needs the share of their pay that is paid while they wait.',
    }
  }
  if (after.benchPolicy === 'RESERVE_FUNDED' && after.reserveBps == null) {
    return {
      ok: false, field: 'reserveBps',
      message: 'A bench paid from their own reserve needs the share held back from what they earn while billing.',
    }
  }
  return { ok: true, data, changed }
}

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`

/** The policy in force, in one plain sentence. */
export function policySentence(p: PolicyNow): string {
  const carry = p.benchCarryDays != null ? `, for up to ${p.benchCarryDays} days` : ', with no limit on how long'
  switch (p.benchPolicy) {
    case 'NO_PAY':
      return 'No bill, no pay: people waiting for a project are not paid while they wait.'
    case 'FULL_PAY':
      return `Full pay while waiting for a project${carry}.`
    case 'REDUCED_RATE':
      return `${p.benchRateBps != null ? pct(p.benchRateBps) : 'A share'} of their pay while waiting for a project${carry}.`
    case 'RESERVE_FUNDED':
      return (
        `${p.reserveBps != null ? pct(p.reserveBps) : 'A share'} of each share is held back while they bill, ` +
        `and pays them while they wait${carry}. ${EXIT_WORDS[p.reserveOnExit]}`
      )
  }
}

// ── The switches ──────────────────────────────────────────────────────

/** One stored turn of a switch, as read from the table. */
export interface SwitchRow {
  personId: string | null
  paid: boolean
  setAt: Date
  setBy: { name: string } | null
}

export const asSwitch = (r: SwitchRow): HolidaySwitch => ({ paid: r.paid, byName: r.setBy?.name ?? null, at: r.setAt })

const shortDay = (d: Date) => formatDay(d)

/** "Switched on by Rahul Iyer, Oct 3, 2026", or null where nobody has turned it. */
export function turnedSays(s: HolidaySwitch | null): string | null {
  if (!s) return null
  return `Switched ${s.paid ? 'on' : 'off'}${s.byName ? ` by ${s.byName}` : ''}, ${shortDay(s.at)}`
}

export interface FirmHolidayView {
  /** Whether the firm pays public holidays on the bench. */
  paid: boolean
  /** The setting, said alone: `holidayPayFor`'s own sentence. */
  says: string
  /** Who turned it and when; null where it is still the default. */
  turned: string | null
  /** For an integrator, why it is on without anybody turning it on. */
  integratorNote: string | null
  /** What a switch per person does under this setting. */
  perPerson: string
}

/** The firm's "Pay public holidays on the bench" switch, from every turn of it. */
export function firmHolidayView(companyKind: string, firmTurns: readonly SwitchRow[]): FirmHolidayView {
  const firm = latestSwitch(firmTurns.filter((r) => r.personId == null).map(asSwitch))
  const answer = holidayPayFor({ companyKind, firm, person: null })
  const integrator = companyKind === 'GSI'
  return {
    paid: answer.firmPays,
    says: answer.firmSays,
    turned: turnedSays(firm),
    integratorNote: integrator
      ? 'An integrator pays its own people for public holidays on the bench by default, so this is on until somebody turns it off.'
      : null,
    perPerson: !answer.firmPays
      ? 'While this is off, nobody on the bench is paid for a public holiday, whatever their own switch says.'
      : integrator
        ? 'Everybody on the bench is paid for public holidays unless their own switch is turned off.'
        : 'Only the people whose own switch is turned on, on Our bench, are paid for public holidays.',
  }
}

/** The latest turn per person, from every person's turns. */
export function latestPerPerson(rows: readonly SwitchRow[]): Map<string, SwitchRow> {
  const out = new Map<string, SwitchRow>()
  for (const r of rows) {
    if (!r.personId) continue
    const had = out.get(r.personId)
    if (!had || r.setAt.getTime() >= had.setAt.getTime()) out.set(r.personId, r)
  }
  return out
}

/** One person's answer under the firm's setting. */
export function personAnswer(companyKind: string, firmTurns: readonly SwitchRow[], person: SwitchRow | null): HolidayPayAnswer {
  const firm = latestSwitch(firmTurns.filter((r) => r.personId == null).map(asSwitch))
  return holidayPayFor({ companyKind, firm, person: person ? asSwitch(person) : null })
}

export type SwitchBody = { ok: true; paid: boolean } | { ok: false; message: string }

/** `{ paid: true | false }`, and nothing else counts as an answer. */
export function readSwitch(body: Record<string, unknown>): SwitchBody {
  if (typeof body.paid !== 'boolean') {
    return { ok: false, message: 'Say whether public holidays are paid: on or off.' }
  }
  return { ok: true, paid: body.paid }
}

/** Whether a person is on the firm's own bench: employed by it, or listed on it by their own consent. */
export function onFirmsBench(f: { employed: boolean; liveListing: boolean }): boolean {
  return f.employed || f.liveListing
}

export function notOnBenchSays(companyName: string): string {
  return (
    `This person is not on ${companyName}'s bench, so ${companyName} cannot set their holiday pay. ` +
    `A switch is set by the firm that employs them or whose bench they joined.`
  )
}
