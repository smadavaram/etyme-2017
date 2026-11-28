/**
 * What a payroll draft is (record 112, chain 4, "Payroll draft from approved
 * weeks"). Pure: no database.
 *
 * A draft is the payroll run's own `calculate` answer for one pay period,
 * kept as it came back: people, hours, gross, and every week held with its
 * reason. Nothing here works a figure out. The figures come from
 * `runPayroll` (lib/money/payroll-run) in its mode that writes nothing, and
 * this file only reads them, lists them and says them.
 */

import { createHash } from 'node:crypto'
import { totals } from '@/lib/money-display'

export const DRAFT_LABEL = 'Draft by the payroll agent, not run'

/** The parts of a `calculate` row a draft keeps. */
export interface RunDetail {
  buyContractId: string
  buyContractCandidateId: string
  personName: string
  totalHours: number
  grossPay: number
  currency: string
  overtimeHours?: number
  premiumCents?: number
  exemptHeld?: string | null
  windowHeld?: string | null
  refused?: string | null
  payPeriod?: { label?: string } | null
}

export interface DraftRow {
  buyContractId: string
  buyContractCandidateId: string
  person: string
  hours: number
  /** Minor units of `currency`. */
  grossPay: number
  currency: string
  overtimeHours: number
  /** Each week held off, or refused, with its reason, in the run's own words. */
  held: string[]
}

/**
 * The rows a draft keeps: a person with hours still to pay, or with a week
 * held and a reason to say. Nobody with nothing left to pay and nothing held
 * is a row, which is also how a period already run reads: empty. Pure.
 */
export function draftRows(details: readonly RunDetail[]): DraftRow[] {
  const rows: DraftRow[] = []
  for (const d of details) {
    const held = [d.exemptHeld, d.windowHeld, d.refused].filter((x): x is string => !!x?.trim())
    if (!(d.totalHours > 0) && held.length === 0) continue
    rows.push({
      buyContractId: d.buyContractId, buyContractCandidateId: d.buyContractCandidateId, person: d.personName,
      hours: d.totalHours, grossPay: d.grossPay, currency: d.currency, overtimeHours: d.overtimeHours ?? 0, held,
    })
  }
  return rows.sort((a, b) => a.person.localeCompare(b.person) || a.buyContractCandidateId.localeCompare(b.buyContractCandidateId))
}

/** The same rows always hash the same, whatever order they came in. Pure. */
export function draftHash(rows: readonly DraftRow[]): string {
  const keyed = [...rows].sort((a, b) => a.buyContractCandidateId.localeCompare(b.buyContractCandidateId))
    .map((r) => [r.buyContractCandidateId, r.hours, r.grossPay, r.currency, r.overtimeHours, r.held])
  return createHash('sha256').update(JSON.stringify(keyed)).digest('hex')
}

/** How many different people a draft names. Pure. */
export const peopleIn = (rows: readonly DraftRow[]): number => new Set(rows.map((r) => r.person)).size

/** The total gross, said per currency and never added across two. Pure. */
export function grossSays(rows: readonly DraftRow[]): string {
  return totals(rows.map((r) => ({ minor: r.grossPay, currency: r.currency })))
}

/** The card's question: the period and the people, and where to go. Pure. */
export function cardQuestion(periodLabel: string, rows: readonly DraftRow[]): string {
  const n = peopleIn(rows)
  return `Payroll draft for ${periodLabel} is ready: ${n} ${n === 1 ? 'person' : 'people'}. Review and run it in Payroll.`
}

/** The card's proof: the total, the label and what the agent did not do. Pure. */
export function cardProof(periodLabel: string, rows: readonly DraftRow[], replacesEarlier: boolean): string {
  const n = peopleIn(rows)
  const held = rows.filter((r) => r.held.length > 0).length
  return [
    `${DRAFT_LABEL}.`,
    `${periodLabel}: ${n} ${n === 1 ? 'person' : 'people'}, total gross ${grossSays(rows)}.`,
    held > 0 ? `${held} ${held === 1 ? 'person has' : 'people have'} a week held off, each with its reason in the draft.` : null,
    'The figures are the ones the payroll run works out. The agent did not run, approve or release anything; running it in Payroll is a person’s.',
    replacesEarlier ? 'This replaces an earlier draft of the same period.' : null,
  ].filter(Boolean).join(' ')
}
