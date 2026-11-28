'use client'

import Link from 'next/link'
import { Chip } from '@/components/ui'
import { Field, Select } from '@/components/ui/form'
import { amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'
import { monthBeside, readMonth } from '@/lib/money-loop'

/** Shared pieces of the money loop's three screens (record 107, Flow B). */

export interface Stated { cents: number; currency: string }
export interface Amounts { timesheet: Stated | null; invoiced: Stated | null; paid: Stated | null }

/** A state in the trade's words: attention where disputed, verified where closed. */
export function StateChip({ state, label }: { state: string; label: string }) {
  return <Chip tone={state === 'DISPUTED' ? 'attention' : state === 'CONFIRMED_CLOSED' ? 'verified' : 'passive'}>{label}</Chip>
}

/** An amount a person stated, in its own currency; a dash where none is stated yet. */
export function stated(s: Stated | null): string {
  return s ? amount(s.cents, s.currency) : '—'
}

/** A calendar day (YYYY-MM-DD) written out. */
export function dayWords(d: string | null): string {
  return d ? formatDay(new Date(`${d}T00:00:00Z`)) : '—'
}

/** The month before, the month itself as a box, the month after. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const step = (by: -1 | 1, words: string) => (
    <button type="button" className="btn-secondary text-[13px]" onClick={() => onChange(monthBeside(month, by))}>{words}</button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Month">
      {step(-1, 'Month before')}
      <input type="month" aria-label="Month" className="input w-auto" value={month}
        onChange={(e) => { if (readMonth(e.target.value)) onChange(e.target.value) }} />
      {step(1, 'Month after')}
    </div>
  )
}

/**
 * The legal entity an act is done for, drawn only where the firm has any.
 * `error` is the route's sentence about it, shown on the box: a refusal
 * for no entity chosen had nowhere to show, and Save looked dead (the
 * walk of 2026-11-22).
 */
export function EntityField({ id, entities, value, onChange, error }: { id: string; entities: { id: string; name: string }[]; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="The legal entity this is done for" id={id} error={error}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an entity</option>
        {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select>
    </Field>
  )
}

export function DecisionLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <Link href={`/dashboard/decisions/${id}` as any} className="text-etyme-action hover:underline">{children}</Link>
}
